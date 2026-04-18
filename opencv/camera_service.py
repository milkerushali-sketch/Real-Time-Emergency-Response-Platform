#!/usr/bin/env python3
"""
OpenCV Camera Service - Motion Detection & Frame Capture
Continuously monitors desktop camera, detects motion, and sends frames to backend
"""

import cv2
import numpy as np
import mediapipe as mp
import requests
import time
import json
from datetime import datetime
from base64 import b64encode
from math import hypot

class FaceEmotionAnalyzer:
    """Uses MediaPipe face mesh to infer face count and emotional state."""

    LANDMARKS = {
        'left_mouth': 61,
        'right_mouth': 291,
        'upper_lip': 13,
        'lower_lip': 14,
        'left_eye_top': 159,
        'left_eye_bottom': 145,
        'right_eye_top': 386,
        'right_eye_bottom': 374,
        'left_eyebrow_inner': 70,
        'left_eyebrow_outer': 63,
        'right_eyebrow_inner': 300,
        'right_eyebrow_outer': 283
    }

    def __init__(self):
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=2,
            refine_landmarks=True,
            min_detection_confidence=0.6,
            min_tracking_confidence=0.6
        )

    @staticmethod
    def _distance(a, b):
        return hypot(a[0] - b[0], a[1] - b[1])

    @staticmethod
    def _get_point(landmark, width, height):
        return int(landmark.x * width), int(landmark.y * height)

    def analyze(self, frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        results = self.face_mesh.process(rgb)
        rgb.flags.writeable = True

        if not results.multi_face_landmarks:
            return {
                'face_count': 0,
                'expressions': [],
                'emotion_level': 'LOW',
                'face_summary': 'No face detected.'
            }

        width, height = frame.shape[1], frame.shape[0]
        expressions = []

        for face_landmarks in results.multi_face_landmarks:
            lm = face_landmarks.landmark
            left_mouth = self._get_point(lm[self.LANDMARKS['left_mouth']], width, height)
            right_mouth = self._get_point(lm[self.LANDMARKS['right_mouth']], width, height)
            upper_lip = self._get_point(lm[self.LANDMARKS['upper_lip']], width, height)
            lower_lip = self._get_point(lm[self.LANDMARKS['lower_lip']], width, height)
            left_eye_top = self._get_point(lm[self.LANDMARKS['left_eye_top']], width, height)
            left_eye_bottom = self._get_point(lm[self.LANDMARKS['left_eye_bottom']], width, height)
            right_eye_top = self._get_point(lm[self.LANDMARKS['right_eye_top']], width, height)
            right_eye_bottom = self._get_point(lm[self.LANDMARKS['right_eye_bottom']], width, height)
            left_brow = self._get_point(lm[self.LANDMARKS['left_eyebrow_inner']], width, height)
            right_brow = self._get_point(lm[self.LANDMARKS['right_eyebrow_inner']], width, height)

            mouth_width = max(self._distance(left_mouth, right_mouth), 1.0)
            mouth_open = self._distance(upper_lip, lower_lip)
            mouth_ratio = mouth_open / mouth_width
            eye_openness = (
                self._distance(left_eye_top, left_eye_bottom) +
                self._distance(right_eye_top, right_eye_bottom)
            ) / 2.0
            brow_distance = self._distance(left_brow, right_brow)
            brow_ratio = brow_distance / mouth_width

            expression = 'neutral'
            confidence = 60

            if mouth_ratio > 0.35 and eye_openness > 0.15:
                expression = 'surprise'
                confidence = 90
            elif mouth_ratio > 0.22 and mouth_width > width * 0.08:
                expression = 'happy'
                confidence = 85
            elif mouth_ratio < 0.16 and brow_ratio < 0.55:
                expression = 'anger'
                confidence = 80
            elif mouth_ratio < 0.18 and mouth_width < width * 0.08:
                expression = 'sad'
                confidence = 75

            emotion_level = 'HIGH' if expression in ['anger', 'surprise'] else 'MEDIUM' if expression == 'sad' else 'LOW'
            expressions.append({
                'expression': expression,
                'confidence': confidence,
                'emotion_level': emotion_level
            })

        if any(item['emotion_level'] == 'HIGH' for item in expressions):
            overall_level = 'HIGH'
        elif any(item['emotion_level'] == 'MEDIUM' for item in expressions):
            overall_level = 'MEDIUM'
        else:
            overall_level = 'LOW'

        return {
            'face_count': len(expressions),
            'expressions': expressions,
            'emotion_level': overall_level,
            'face_summary': ', '.join([f"{item['expression']}({item['confidence']}%)" for item in expressions])
        }

class MotionDetector:
    """Detects motion in video frames using background subtraction"""
    
    def __init__(self, threshold=500, blur_kernel=(21, 21)):
        self.background_model = None
        self.threshold = threshold
        self.blur_kernel = blur_kernel
        self.consecutive_motion_frames = 0
        self.motion_sensitivity = 3  # Frames needed to confirm motion
    
    def detect_motion(self, frame):
        """
        Detect motion in the frame using background subtraction
        Returns: (is_motion_detected, motion_contours, motion_percentage)
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, self.blur_kernel, 0)
        
        # Initialize background model on first frame
        if self.background_model is None:
            self.background_model = cv2.createBackgroundSubtractorMOG2(detectShadows=True)
            self.background_model.apply(gray)
            return False, [], 0.0
        
        # Apply background subtraction
        foreground_mask = self.background_model.apply(gray)
        
        # Threshold the mask to get binary image
        _, binary_mask = cv2.threshold(foreground_mask, 200, 255, cv2.THRESH_BINARY)
        
        # Close gaps (dilate + erode)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        binary_mask = cv2.morphologyEx(binary_mask, cv2.MORPH_CLOSE, kernel)
        binary_mask = cv2.morphologyEx(binary_mask, cv2.MORPH_OPEN, kernel)
        
        # Find contours
        contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Calculate motion percentage
        motion_pixels = cv2.countNonZero(binary_mask)
        total_pixels = binary_mask.shape[0] * binary_mask.shape[1]
        motion_percentage = (motion_pixels / total_pixels) * 100
        
        # Filter contours by minimum area
        min_area = 500
        filtered_contours = [cnt for cnt in contours if cv2.contourArea(cnt) > min_area]
        
        is_motion = motion_percentage > 2.0  # More than 2% motion
        
        # Track consecutive motion frames for debouncing
        if is_motion:
            self.consecutive_motion_frames += 1
        else:
            self.consecutive_motion_frames = 0
        
        motion_confirmed = self.consecutive_motion_frames >= self.motion_sensitivity
        
        return motion_confirmed, filtered_contours, motion_percentage

class CameraService:
    """Manages camera input, motion detection, face detection, and emotion-based emergency scoring."""
    
    def __init__(self, camera_index=0, backend_url="http://localhost:5000"):
        self.camera_index = camera_index
        self.backend_url = backend_url
        self.motion_detector = MotionDetector()
        self.face_analyzer = FaceEmotionAnalyzer()
        self.last_incident_time = 0
        self.incident_cooldown = 3  # Seconds between incidents
    
    def connect_camera(self):
        """Connect to system camera"""
        cap = cv2.VideoCapture(self.camera_index)
        
        # Set camera properties for better quality
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        cap.set(cv2.CAP_PROP_FPS, 30)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        if not cap.isOpened():
            raise Exception(f"Failed to open camera {self.camera_index}")
        
        return cap
    
    def send_incident_to_backend(self, frame, motion_percentage, face_data):
        """Send detected emergency incident to backend."""
        try:
            _, buffer = cv2.imencode('.jpg', frame)
            frame_b64 = b64encode(buffer).decode('utf-8')

            severity = 'HIGH' if face_data['emotion_level'] == 'HIGH' or motion_percentage > 7 else 'MEDIUM' if motion_percentage > 3 or face_data['emotion_level'] == 'MEDIUM' else 'LOW'
            description = (
                f"Camera detected motion {motion_percentage:.1f}% with {face_data['face_count']} face(s) and emotion level {face_data['emotion_level']}"
            )

            incident = {
                "type": "cctv",
                "mediaType": "video_frame",
                "mediaSource": "desktop_opencv_camera",
                "description": description,
                "location": "Desktop Camera 0",
                "frame_base64": frame_b64,
                "severity": severity,
                "motion_percentage": motion_percentage,
                "face_count": face_data['face_count'],
                "face_expressions": face_data['face_summary'],
                "emotion_level": face_data['emotion_level']
            }

            response = requests.post(
                f"{self.backend_url}/api/incident",
                json=incident,
                timeout=5
            )

            if response.status_code == 200:
                print(f"[INCIDENT] Incident sent - Motion: {motion_percentage:.1f}% - Severity: {severity}")
                return True
            else:
                print(f"[ERROR] Backend returned {response.status_code}: {response.text}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"[ERROR] Failed to send incident: {e}")
            return False
    
    def run(self):
        """Main camera monitoring loop"""
        print("[INIT] Starting OpenCV Camera Service...")
        print("[INIT] Connecting to camera...")
        
        cap = self.connect_camera()
        print("[OK] Camera connected. Motion detection active!")
        
        motion_detected = False
        frame_count = 0
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    print("[ERROR] Failed to read frame. Reconnecting...")
                    cap.release()
                    time.sleep(2)
                    cap = self.connect_camera()
                    continue
                
                frame_count += 1
                
                # Detect motion and analyze faces/emotions
                is_motion, contours, motion_pct = self.motion_detector.detect_motion(frame)
                face_data = self.face_analyzer.analyze(frame)
                
                # Determine emergency score
                emergency_trigger = is_motion or face_data['emotion_level'] != 'LOW'
                emergency_severity = 'HIGH' if face_data['emotion_level'] == 'HIGH' or motion_pct > 7 else 'MEDIUM' if face_data['emotion_level'] == 'MEDIUM' or motion_pct > 3 else 'LOW'
                
                # Check cooldown before sending incident
                current_time = time.time()
                time_since_last = current_time - self.last_incident_time
                
                if emergency_trigger and time_since_last > self.incident_cooldown:
                    self.send_incident_to_backend(frame, motion_pct, face_data)
                    self.last_incident_time = current_time
                    motion_detected = True
                elif not is_motion:
                    motion_detected = False
                
                # Draw contours on frame for visual feedback
                cv2.drawContours(frame, contours, -1, (0, 255, 0), 2)

                # Annotate face/emotion details
                face_text = f"Faces: {face_data['face_count']} | Emotion: {face_data['emotion_level']}"
                emotion_text = face_data['face_summary'] if face_data['face_summary'] else 'No expression detected'
                cv2.putText(frame, face_text, (10, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
                cv2.putText(frame, emotion_text, (10, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
                
                # Add status text
                status_text = f"{emergency_severity} ALERT" if emergency_trigger else "Monitoring..."
                status_color = (0, 0, 255) if emergency_severity == 'HIGH' else (0, 165, 255) if emergency_severity == 'MEDIUM' else (0, 255, 0)
                cv2.putText(frame, status_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, status_color, 2)
                cv2.putText(frame, f"Motion: {motion_pct:.1f}%", (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                cv2.putText(frame, f"Frames: {frame_count}", (10, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                
                # Display the frame locally for debugging
                cv2.imshow('OpenCV Camera Service - Motion Detection', frame)
                
                # Press 'q' to quit
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    print("[TERM] Quit signal received")
                    break
                
                # Small delay to prevent CPU spinning
                time.sleep(0.01)
        
        except KeyboardInterrupt:
            print("[TERM] Interrupted by user")
        finally:
            cap.release()
            cv2.destroyAllWindows()
            print("[EXIT] Camera service stopped")

def main():
    """Main entry point"""
    try:
        service = CameraService(
            camera_index=0,
            backend_url="http://backend:5000"  # Docker network service name
        )
        service.run()
    except Exception as e:
        print(f"[FATAL] {e}")
        # Keep container running even if camera fails (for debugging)
        while True:
            time.sleep(10)

if __name__ == "__main__":
    main()
