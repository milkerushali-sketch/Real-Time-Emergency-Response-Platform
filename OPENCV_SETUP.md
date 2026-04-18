# 🚨 AI Emergency System - OpenCV Integration Guide

## Overview

Your AI Emergency System now includes **continuous OpenCV-based motion detection** that automatically monitors your desktop camera, detects incidents, and triggers the full emergency response pipeline.

### Architecture Flow
```
Desktop Camera (27/4 Stream)
    ↓
OpenCV Motion Detection Service (Python)
    ↓ [Detects Motion/Changes]
    ↓ Captures Frame (JPEG)
Sends Motion Incident + Frame (Base64)
    ↓
Backend API (/api/incident)
    ↓ [Saves Frame to Reports Directory]
    ↓ [Enriches with Text Description]
AI Analysis (Google Gemini)
    ↓ [Classification: normal/not_sure/high_risk]
    ↓
Alert System
    ↓ [Generates Service-Specific Alerts]
    ↓ [Fire/Medical/Police/EOC]
Socket.IO Broadcast
    ↓
Frontend Dashboard
    ↓ [Live Incident Display]
    ↓ [Captured Frame Images]
    ↓ [Generated Reports
```
## Key Components

### 1. OpenCV Service (`opencv/camera_service.py`)

Purpose: Continuous background motion detection service

Features:
- Real-time video stream from system camera (device index 0)
- Background subtraction-based motion detection
- Automatic motion debouncing (3-frame confirmation)
- Motion percentage calculation
- Automatic frame capture on motion detection
- HTTP POST to backend /api/incident endpoint
- 2-second cooldown between incidents (prevents spam)
- Display local window with motion detection visualization

How It Works:
1. Connects to your desktop camera (`/dev/video0` on Linux, camera index 0)
2. Initializes MOG2 background subtraction model
3. For each frame:
   - Applies background subtraction
   - Calculates motion percentage
   - Filters by minimum area (500px²)
   - Tracks consecutive motion frames
4. When motion confirmed (3+ consecutive frames):
   - Encodes frame as JPEG base64
   - Creates incident payload with motion % metadata
   - POSTs to `http://backend:5000/api/incident`
   - Waits 2 seconds before next incident (cooldown)

Motion Detection Triggers:
- Motion > 2% of frame (configurable via `threshold`)
- Minimum contour area: 500 pixels² (filters noise)
- Consecutive confirmation: 3+ frames required
- Cooldown period: 2 seconds between incidents

### 2. Enhanced Backend (`server/src/index.js`)

New Functions:
- `saveFrameAndGenerateReport()` - Saves base64 frame to disk, generates JSON report
- `/api/reports` endpoint - Retrieve last 20 incident reports
- `/api/reports/:reportId/frame` endpoint - Serve frame JPEG images
- Updates `/api/incident` to handle `frame_base64` field



### 3. Simplified Frontend (`client/src/App.jsx`)

CCTV Tab Changes:
- ✅ Added: Live status indicator ("OpenCV service running")
- ✅ Added: Auto-refreshing motion events grid
- ✅ Added: Frame images embedded in incident cards
- ✅ Added: Links to generate reports

Display Features:
- Recent motion events in reverse chronological order
- Classification color-coding:
  - 🟢 Green (normal) - Routine activity
  - 🟠 Orange (not_sure) - Needs review
  - 🔴 Red (high_risk) - Immediate danger
- Embedded frame images (fetched from `/api/reports/{id}/frame`)
- Event timestamps
- Associated alert counts

### 4. Docker Compose (`docker-compose.yml`)

New OpenCV Service:
```yaml
opencv:
  build: ./opencv
  container_name: aegis-opencv
  depends_on:
    - backend
  environment:
    - BACKEND_URL=http://backend:5000
  volumes:
    - /dev/video0:/dev/video0  # Mount host camera
  networks:
    - aegis-network
```

Notes:
- Runs independently alongside frontend & backend
- Auto-connects to backend via Docker network (`http://backend:5000`)
- Mounts host camera device (`/dev/video0`)
- Restarts automatically if it crashes

## 🚀 Deployment Instructions

### Prerequisites
- Docker Desktop installed (with camera passthrough enabled)
- Environment variables in `.env` file
- Camera device properly set up on your system

### Step 1: Build All Services
```bash
cd "D:\New folder\ai-emergency-system"
docker-compose up --build
```

This builds and starts:
1. aegis-frontend (React app on port 3000)
2. aegis-backend (API server on port 5000)
3. aegis-opencv (Motion detection service)

### Step 2: Test the System

#### Test Motion Detection:
1. Open browser: `http://localhost:3000`
2. Go to "📹 CCTV Analysis" tab
3. Create motion in front of camera
4. Watch incidents appear automatically in real-time

#### Test Text Input:
1. Go to "📝 Text Report" tab
2. Type: "Major fire in downtown warehouse"
3. Click "Report Emergency"
4. See AI analysis and alerts

#### Test Voice Input:
1. Go to "🎤 Voice Report" tab
2. Click "Start Recording"
3. Speak emergency description
4. Click "Stop Recording"
5. Click "Send Voice Report"

### Step 3: Monitor Reports
```bash
# List all generated reports
ls server/reports/

# View latest report
cat server/reports/REPORT_*.json | tail -1

# View captured frame (in browser)
http://localhost:5000/api/reports/REPORT_1234567890/frame
```

### Step 4: Check Backend Logs
```bash
# Watch OpenCV service logs
docker logs aegis-opencv -f

# Watch backend logs
docker logs aegis-backend -f

# Watch frontend logs
docker logs aegis-frontend -f
```



## 🔧 Troubleshooting

### OpenCV Service Won't Start
```bash
# Check container logs
docker logs aegis-opencv

# Rebuild service
docker-compose up --build opencv

# Test camera access
docker run -it --device /dev/video0 python:3.10 python -c "import cv2; cap = cv2.VideoCapture(0); print('Camera OK' if cap.isOpened() else 'Camera Failed')"
```

### No Motion Detected
- Increase motion sensitivity (lower `motion_percentage` threshold)
- Check camera is not blocked or in darkness
- Increase blur kernel size: `(25, 25)` instead of `(21, 21)`
- Reduce min area: `300` instead of `500`

### Backend Not Receiving Incidents
```bash
# Test API endpoint
curl -X POST http://localhost:5000/api/incident \
  -H "Content-Type: application/json" \
  -d '{"type":"cctv","description":"Test","location":"Test"}'
```

### Reports Not Saving
```bash
# Check reports directory
ls -la server/reports/

# Check directory permissions
chmod 777 server/reports/
```

### Frame Images Not Displaying
- Check `/api/reports/{reportId}/frame` endpoint returns JPEG
- Verify frame files exist: `server/reports/REPORT_*_frame.jpg`
- Clear browser cache

## 📊 Performance Tuning

### Lower CPU Usage
- Reduce frame capture rate: Set `cap.set(cv2.CAP_PROP_FPS, 15)` instead of 30
- Increase blur kernel: `(25, 25)` or `(31, 31)`
- Increase motion threshold percentage: `> 3.0` instead of `> 2.0`

### Lower Memory Usage
- Reduce buffer size: Already set to 1 (`CAP_PROP_BUFFERSIZE`)
- Reduce image resolution: Set smaller width/height in `cap.set()`

### Faster Response Time
- Decrease motion sensitivity frames: `self.motion_sensitivity = 1`
- Reduce cooldown: `self.incident_cooldown = 1`
- Lower blur kernel: `(15, 15)` (more noise but faster)

## 📱 API Reference

### POST /api/incident
Processes incident and generated alerts.

**Request (from OpenCV):**
```json
{
  "type": "cctv",
  "mediaType": "video_frame",
  "mediaSource": "desktop_opencv_camera",
  "description": "Motion detected at 14:32:15 - Motion level: 5.2%",
  "location": "Desktop Camera 0",
  "frame_base64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "severity": "MEDIUM"
}
```

Response:
```json
{
  "incident": {...},
  "aiResponse": {
    "classification": "high_risk|not_sure|normal",
    "alert_message": "...",
    "resources_needed": ["Fire Trucks", "Ambulances"]
  },
  "classification": "high_risk",
  "priority": 1,
  "alerts": [...],
  "report": {
    "reportId": "REPORT_1234567890",
    "timestamp": "2026-04-16T...",
    "mediaFiles": ["REPORT_1234567890_frame.jpg"]
  }
}
```
## Features to Add Next:

1. Real-time Dashboard
   - Add WebSocket listeners for live updates
   - Display incident map
   - Show resource deployment tracking

2. Computer Vision Enhancements
   - Add YOLO object detection (people, vehicles, fire, smoke)
   - Implement optical flow for better motion tracking
   - Add face detection for crowd analysis

3. Integration Connectors
   - SMS/Email alert delivery
   - Emergency service APIs (CAD systems)
   - Map integration for incident location

4. Audio Transcription
   - Integrate Google Cloud Speech-to-Text
   - Real-time voice analysis

5. Advanced Analytics
   - Incident heatmaps
   - Response time tracking
   - False positive analysis

## 🚨 Emergency Response Flow
```
Motion Detected (OpenCV)
  ↓
Frame Captured & Encoded
  ↓
POST /api/incident (with base64 frame)
  ↓
Save Frame to Disk
  ↓
Generate Text Description
  ↓
Gemini AI Analysis
  ↓
Classification (normal/not_sure/high_risk)
  ↓
Generate Service Alerts (Fire/Medical/Police/EOC)
  ↓
Create JSON Report
  ↓
Broadcast INCIDENT_PROCESSED event
  ↓
Frontend Updates Live
  ↓
Display Incident Card with Frame
  ↓
Show Alerts & Resources
```
Components: OpenCV Service ✓ | Backend ✓ | Frontend ✓ | Reports ✓ | Automation ✓
