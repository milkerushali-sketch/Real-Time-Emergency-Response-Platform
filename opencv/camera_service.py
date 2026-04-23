#!/usr/bin/env python3
"""
OpenCV camera service for live emergency monitoring.
Adds practical CV signals for object detection, optical flow, and crowd analysis.
"""

import time
from base64 import b64encode
from math import hypot

import cv2
import mediapipe as mp
import numpy as np
import requests


class FaceEmotionAnalyzer:
    LANDMARKS = {
        "left_mouth": 61,
        "right_mouth": 291,
        "upper_lip": 13,
        "lower_lip": 14,
        "left_eye_top": 159,
        "left_eye_bottom": 145,
        "right_eye_top": 386,
        "right_eye_bottom": 374,
        "left_eyebrow_inner": 70,
        "right_eyebrow_inner": 300,
    }

    def __init__(self):
        self.face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=8,
            refine_landmarks=True,
            min_detection_confidence=0.6,
            min_tracking_confidence=0.6,
        )
        self.face_detector = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )

    @staticmethod
    def _distance(point_a, point_b):
        return hypot(point_a[0] - point_b[0], point_a[1] - point_b[1])

    @staticmethod
    def _get_point(landmark, width, height):
        return int(landmark.x * width), int(landmark.y * height)

    def analyze(self, frame):
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mesh_result = self.face_mesh.process(rgb_frame)
        gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        face_boxes = self.face_detector.detectMultiScale(gray_frame, scaleFactor=1.1, minNeighbors=5, minSize=(32, 32))

        expressions = []
        width, height = frame.shape[1], frame.shape[0]

        if mesh_result.multi_face_landmarks:
            for face_landmarks in mesh_result.multi_face_landmarks:
                lm = face_landmarks.landmark
                left_mouth = self._get_point(lm[self.LANDMARKS["left_mouth"]], width, height)
                right_mouth = self._get_point(lm[self.LANDMARKS["right_mouth"]], width, height)
                upper_lip = self._get_point(lm[self.LANDMARKS["upper_lip"]], width, height)
                lower_lip = self._get_point(lm[self.LANDMARKS["lower_lip"]], width, height)
                left_eye_top = self._get_point(lm[self.LANDMARKS["left_eye_top"]], width, height)
                left_eye_bottom = self._get_point(lm[self.LANDMARKS["left_eye_bottom"]], width, height)
                right_eye_top = self._get_point(lm[self.LANDMARKS["right_eye_top"]], width, height)
                right_eye_bottom = self._get_point(lm[self.LANDMARKS["right_eye_bottom"]], width, height)
                left_brow = self._get_point(lm[self.LANDMARKS["left_eyebrow_inner"]], width, height)
                right_brow = self._get_point(lm[self.LANDMARKS["right_eyebrow_inner"]], width, height)

                mouth_width = max(self._distance(left_mouth, right_mouth), 1.0)
                mouth_open = self._distance(upper_lip, lower_lip)
                mouth_ratio = mouth_open / mouth_width
                eye_openness = (
                    self._distance(left_eye_top, left_eye_bottom)
                    + self._distance(right_eye_top, right_eye_bottom)
                ) / 2.0
                brow_ratio = self._distance(left_brow, right_brow) / mouth_width

                expression = "neutral"
                confidence = 60
                if mouth_ratio > 0.35 and eye_openness > 10:
                    expression = "surprise"
                    confidence = 90
                elif mouth_ratio > 0.22:
                    expression = "happy"
                    confidence = 82
                elif mouth_ratio < 0.16 and brow_ratio < 2.2:
                    expression = "anger"
                    confidence = 78
                elif mouth_ratio < 0.18:
                    expression = "sad"
                    confidence = 70

                expressions.append(
                    {
                        "expression": expression,
                        "confidence": confidence,
                        "emotion_level": "HIGH" if expression in ["anger", "surprise"] else "MEDIUM" if expression == "sad" else "LOW",
                    }
                )

        overall_level = "LOW"
        if any(item["emotion_level"] == "HIGH" for item in expressions):
            overall_level = "HIGH"
        elif any(item["emotion_level"] == "MEDIUM" for item in expressions):
            overall_level = "MEDIUM"

        return {
            "face_count": int(len(face_boxes)),
            "crowd_density": "HIGH" if len(face_boxes) >= 6 else "MEDIUM" if len(face_boxes) >= 3 else "LOW",
            "expressions": expressions,
            "emotion_level": overall_level,
            "face_summary": ", ".join(
                [f"{item['expression']}({item['confidence']}%)" for item in expressions]
            )
            or "No expression detected",
            "face_boxes": [{"x": int(x), "y": int(y), "w": int(w), "h": int(h)} for (x, y, w, h) in face_boxes],
        }


class MotionDetector:
    def __init__(self, blur_kernel=(21, 21)):
        self.background_model = None
        self.blur_kernel = blur_kernel
        self.consecutive_motion_frames = 0
        self.motion_sensitivity = 3

    def detect_motion(self, frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, self.blur_kernel, 0)

        if self.background_model is None:
            self.background_model = cv2.createBackgroundSubtractorMOG2(detectShadows=True)
            self.background_model.apply(gray)
            return False, [], 0.0

        foreground_mask = self.background_model.apply(gray)
        _, binary_mask = cv2.threshold(foreground_mask, 200, 255, cv2.THRESH_BINARY)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        binary_mask = cv2.morphologyEx(binary_mask, cv2.MORPH_CLOSE, kernel)
        binary_mask = cv2.morphologyEx(binary_mask, cv2.MORPH_OPEN, kernel)

        contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        filtered_contours = [cnt for cnt in contours if cv2.contourArea(cnt) > 500]

        motion_pixels = cv2.countNonZero(binary_mask)
        total_pixels = binary_mask.shape[0] * binary_mask.shape[1]
        motion_percentage = (motion_pixels / total_pixels) * 100

        is_motion = motion_percentage > 2.0
        self.consecutive_motion_frames = self.consecutive_motion_frames + 1 if is_motion else 0
        return self.consecutive_motion_frames >= self.motion_sensitivity, filtered_contours, motion_percentage


class OpticalFlowTracker:
    def __init__(self):
        self.previous_gray = None

    def analyze(self, frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if self.previous_gray is None:
            self.previous_gray = gray
            return {"averageMotion": 0.0, "peakMotion": 0.0, "motionDirection": "steady"}

        flow = cv2.calcOpticalFlowFarneback(
            self.previous_gray,
            gray,
            None,
            0.5,
            3,
            15,
            3,
            5,
            1.2,
            0,
        )
        magnitude, angle = cv2.cartToPolar(flow[..., 0], flow[..., 1], angleInDegrees=True)
        self.previous_gray = gray

        average_motion = float(np.mean(magnitude))
        peak_motion = float(np.max(magnitude))
        mean_angle = float(np.mean(angle))

        if 45 <= mean_angle < 135:
            direction = "downward"
        elif 135 <= mean_angle < 225:
            direction = "leftward"
        elif 225 <= mean_angle < 315:
            direction = "upward"
        else:
            direction = "rightward"

        if average_motion < 0.3:
            direction = "steady"

        return {
            "averageMotion": round(average_motion, 3),
            "peakMotion": round(peak_motion, 3),
            "motionDirection": direction,
        }


class SceneObjectDetector:
    def __init__(self):
        self.people_detector = cv2.HOGDescriptor()
        self.people_detector.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    def detect(self, frame):
        detections = []
        people, _ = self.people_detector.detectMultiScale(frame, winStride=(8, 8), padding=(8, 8), scale=1.05)
        for (x, y, w, h) in people:
            detections.append(
                {
                    "label": "person",
                    "confidence": 0.72,
                    "bbox": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
                }
            )

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        fire_mask = cv2.inRange(hsv, np.array([0, 120, 180]), np.array([35, 255, 255]))
        smoke_mask = cv2.inRange(hsv, np.array([0, 0, 60]), np.array([180, 80, 220]))
        edges = cv2.Canny(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), 50, 150)

        detections.extend(self._contour_detections(fire_mask, "fire", 900, 0.81))
        detections.extend(self._contour_detections(smoke_mask, "smoke", 1500, 0.64))

        vehicle_candidates = self._vehicle_candidates(edges, frame.shape)
        detections.extend(vehicle_candidates)
        return detections

    @staticmethod
    def _contour_detections(mask, label, min_area, confidence):
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        results = []
        for contour in contours:
            if cv2.contourArea(contour) < min_area:
                continue
            x, y, w, h = cv2.boundingRect(contour)
            results.append(
                {
                    "label": label,
                    "confidence": confidence,
                    "bbox": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
                }
            )
        return results

    @staticmethod
    def _vehicle_candidates(edge_map, frame_shape):
        contours, _ = cv2.findContours(edge_map, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        height, width = frame_shape[:2]
        vehicles = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            area = w * h
            aspect_ratio = w / float(max(h, 1))
            if area > 2500 and 1.2 < aspect_ratio < 4.5 and y > height * 0.25 and w < width * 0.7:
                vehicles.append(
                    {
                        "label": "vehicle",
                        "confidence": 0.58,
                        "bbox": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
                    }
                )
        return vehicles[:6]


class CameraService:
    def __init__(self, camera_index=0, backend_url="http://localhost:5000"):
        self.camera_index = camera_index
        self.backend_url = backend_url
        self.motion_detector = MotionDetector()
        self.face_analyzer = FaceEmotionAnalyzer()
        self.optical_flow = OpticalFlowTracker()
        self.object_detector = SceneObjectDetector()
        self.last_incident_time = 0
        self.incident_cooldown = 3

    def connect_camera(self):
        cap = cv2.VideoCapture(self.camera_index)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        cap.set(cv2.CAP_PROP_FPS, 30)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open camera {self.camera_index}")
        return cap

    def send_incident_to_backend(self, frame, motion_percentage, face_data, optical_flow, detections):
        try:
            _, buffer = cv2.imencode(".jpg", frame)
            frame_b64 = b64encode(buffer).decode("utf-8")

            severe_scene = any(item["label"] in ["fire", "smoke"] for item in detections)
            crowded_scene = face_data["face_count"] >= 4
            severity = "HIGH" if severe_scene or optical_flow["averageMotion"] > 1.2 or face_data["emotion_level"] == "HIGH" else "MEDIUM" if motion_percentage > 3 or crowded_scene else "LOW"

            detection_summary = ", ".join(
                [f"{item['label']}:{item['confidence']:.2f}" for item in detections[:6]]
            ) or "none"

            incident = {
                "type": "cctv",
                "inputType": "cctv",
                "mediaType": "video_frame",
                "mediaSource": "desktop_opencv_camera",
                "description": f"Scene activity detected with motion {motion_percentage:.1f}% and detections {detection_summary}",
                "location": "Desktop Camera 0",
                "frame_base64": frame_b64,
                "severity": severity,
                "motion_percentage": round(float(motion_percentage), 2),
                "face_count": face_data["face_count"],
                "face_expressions": face_data["face_summary"],
                "emotion_level": face_data["emotion_level"],
                "crowd_density": face_data["crowd_density"],
                "detections": detections,
                "opticalFlow": optical_flow,
            }

            response = requests.post(f"{self.backend_url}/api/incident", json=incident, timeout=5)
            if response.status_code == 200:
                print(
                    f"[INCIDENT] Sent {severity} incident | motion={motion_percentage:.1f}% | faces={face_data['face_count']} | detections={len(detections)}"
                )
                return True

            print(f"[ERROR] Backend returned {response.status_code}: {response.text}")
            return False
        except requests.exceptions.RequestException as error:
            print(f"[ERROR] Failed to send incident: {error}")
            return False

    @staticmethod
    def _draw_boxes(frame, detections, color):
        for detection in detections:
            bbox = detection.get("bbox", {})
            x = int(bbox.get("x", 0))
            y = int(bbox.get("y", 0))
            w = int(bbox.get("w", 0))
            h = int(bbox.get("h", 0))
            cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
            cv2.putText(
                frame,
                detection["label"],
                (x, max(20, y - 8)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                color,
                2,
            )

    def run(self):
        print("[INIT] Starting OpenCV camera service")
        cap = self.connect_camera()
        frame_count = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    print("[WARN] Failed to read frame, reconnecting...")
                    cap.release()
                    time.sleep(2)
                    cap = self.connect_camera()
                    continue

                frame_count += 1
                is_motion, contours, motion_pct = self.motion_detector.detect_motion(frame)
                face_data = self.face_analyzer.analyze(frame)
                optical_flow = self.optical_flow.analyze(frame)
                detections = self.object_detector.detect(frame)

                emergency_trigger = (
                    is_motion
                    or face_data["emotion_level"] != "LOW"
                    or face_data["face_count"] >= 3
                    or any(item["label"] in ["fire", "smoke"] for item in detections)
                )

                current_time = time.time()
                if emergency_trigger and current_time - self.last_incident_time > self.incident_cooldown:
                    self.send_incident_to_backend(frame, motion_pct, face_data, optical_flow, detections)
                    self.last_incident_time = current_time

                cv2.drawContours(frame, contours, -1, (0, 255, 0), 2)
                self._draw_boxes(frame, detections, (0, 140, 255))
                self._draw_boxes(frame, [{"label": "face", "bbox": box} for box in face_data["face_boxes"]], (255, 255, 0))

                status_text = "ALERT" if emergency_trigger else "Monitoring"
                cv2.putText(frame, status_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255) if emergency_trigger else (0, 255, 0), 2)
                cv2.putText(frame, f"Motion: {motion_pct:.1f}%", (10, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                cv2.putText(frame, f"Flow: {optical_flow['averageMotion']:.2f} {optical_flow['motionDirection']}", (10, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                cv2.putText(frame, f"Crowd: {face_data['face_count']} ({face_data['crowd_density']})", (10, 125), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
                cv2.putText(frame, f"Emotion: {face_data['emotion_level']}", (10, 155), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
                cv2.putText(frame, f"Frames: {frame_count}", (10, 185), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

                cv2.imshow("OpenCV Emergency Monitor", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
                time.sleep(0.01)
        except KeyboardInterrupt:
            print("[TERM] Interrupted by user")
        finally:
            cap.release()
            cv2.destroyAllWindows()
            print("[EXIT] Camera service stopped")


def main():
    try:
        service = CameraService(camera_index=0, backend_url="http://backend:5000")
        service.run()
    except Exception as error:
        print(f"[FATAL] {error}")
        while True:
            time.sleep(10)


if __name__ == "__main__":
    main()
