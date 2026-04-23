# 🚨 AI Emergency System 

## OpenCV Integration Guide

This project uses an OpenCV worker to generate live incident signals for the backend and dashboard.

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
 

## What It Does

- Connects to the desktop camera
- Detects motion with background subtraction
- Estimates optical flow for movement direction
- Detects faces and crowd density
- Emits scene objects such as `person`, `vehicle`, `fire`, and `smoke` style detections
- Sends incidents to `POST /api/incident`
- Opens a separate webcam preview window so the user can see the live feed while recording or analyzing

###  Frontend 
 Features:
- Recent motion events in reverse chronological order
- Classification color-coding:
  - 🟢 Green (normal) - Routine activity
  - 🟠 Orange (not_sure) - Needs review
  - 🔴 Red (high_risk) - Immediate danger
- Embedded frame images (fetched from `/api/reports/{id}/frame`)
- Event timestamps
- Associated alert counts

###  Docker Compose 
- Runs independently alongside frontend & backend
- Auto-connects to backend via Docker network (`http://backend:5000`)
- Mounts host camera device (`/dev/video0`)
- Restarts automatically if it crashes

## 🚀 Deployment Instructions

### Prerequisites
- Docker Desktop installed (with camera passthrough enabled)
- Environment variables in `.env` file
- Camera device properly set up on your system


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


## Running Locally

```powershell
cd opencv
python -B camera_service.py
```

## Troubleshooting

- If the camera window does not appear, check browser popup permissions for the dashboard
- If Docker camera passthrough fails on Windows, test without the `opencv` service first
- If the backend is not receiving incidents, verify the backend is running and `BACKEND_URL` is correct
- If reports are not showing, check `server/reports/`

