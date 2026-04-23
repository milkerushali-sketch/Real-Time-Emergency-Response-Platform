# AI Emergency Response System

A real-time emergency coordination platform with a live operations dashboard, AI-assisted incident processing, OpenCV-driven camera analysis, and alert/integration plumbing for dispatch workflows.

## What It Does

- Streams incidents into a real-time React dashboard over Socket.IO
- Tracks incident locations on a live incident map
- Shows resource deployment status and ETA tracking
- Processes camera frames with motion, face, crowd, and object signals
- Supports transcription and voice-analysis flows
- Sends alert delivery events for SMS, email, and CAD-style dispatch integrations
- Aggregates advanced analytics for heatmaps, response times, and false-positive analysis
- Opens the webcam in a separate preview window while recording or analyzing

## Architecture

```text
[ React Operations Dashboard ]
        |
        | Socket.IO / HTTP
        v
[ Node.js / Express Backend ]
        |
        | incident processing + analytics + connectors
        v
[ AI + Decision Layer ]
        |
        | routing, priority, resources, alerts
        v
[ Dashboard Snapshot Store ]
        |
        v
[ OpenCV Camera Worker ]
```

## Features

### Real-Time Dashboard

- Live Socket.IO listeners for incident updates and alerts
- Incident map with live marker updates
- Resource deployment tracking cards
- Separate webcam preview window for active camera sessions

### Computer Vision Enhancements

- YOLO-style object classification pipeline for `person`, `vehicle`, `fire`, and `smoke` style detections
- Optical flow motion tracking
- Crowd and face metadata emission
- Emotion-level and face-count analysis

### Integration Connectors

- SMS alert delivery support through Twilio when configured
- Email alert delivery support through SMTP/Nodemailer when configured
- CAD-style dispatch connector stub
- Map integration links for incident location

### Audio Transcription

- Voice incident ingestion
- Google Cloud Speech-to-Text compatible transcription path
- Real-time voice analysis and urgency scoring fallback

### Advanced Analytics

- Incident heatmaps
- Response time tracking
- False positive analysis

## API Endpoints

- `GET /health` - Backend health check
- `POST /api/incident` - Process a new incident
- `GET /api/events` - Recent incident history
- `GET /api/dashboard` - Current dashboard snapshot
- `GET /api/analytics` - Analytics snapshot
- `GET /api/map/incidents` - Live incident map points
- `GET /api/reports` - Saved incident reports
- `GET /api/reports/:reportId/frame` - Saved frame image for a report

## Docker Desktop Quick Start

1. Start the stack:
   ```powershell
   cd "d:\New folder\ai-emergency-system"
   docker compose up --build
   ```

2. Open the dashboard:
   - Frontend: `http://localhost:3000`
   - Backend health: `http://localhost:5000/health`

3. Test it:
   - Click `Simulate Critical Event`
   - Send a text report
   - Start webcam analysis and allow popups so the separate preview window opens
   - Check the incident map, deployment cards, analytics, and alert panels update in real time

## Notes For Docker

- The backend now exposes `/health`, which the compose healthcheck uses.
- The OpenCV container starts `camera_service.py`.
- On Windows Docker Desktop, the `/dev/video0` camera mount may not work as-is. If you only want to verify the app UI and backend, you can run the backend and frontend services first.

## Local Development

### Backend

```powershell
cd server
npm start
```

### Frontend

```powershell
cd client
npm run dev
```

### OpenCV Worker

```powershell
cd opencv
python -B camera_service.py
```

## Environment Variables

Common variables used by the backend:

- `GEMINI_API_KEY`
- `TWILIO_SID`
- `TWILIO_TOKEN`
- `TWILIO_FROM`
- `SMS_TO`
- `EMAIL_USER`
- `EMAIL_PASS`
- `ALERT_EMAIL_TO`
- `CAD_API_URL`
- `CAD_API_KEY`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_SPEECH_LANGUAGE`

## Verification

- Backend runtime verified through `GET /api/dashboard`
- OpenCV camera service syntax checked successfully
- React production build was verified earlier in-session, though a later Windows sandbox rerun hit an `esbuild` spawn permission issue

## Development Flow

The system is designed so incidents can come from:

- Manual text reports
- Webcam/image capture
- Voice transcription
- OpenCV camera worker events

Those events are enriched by the backend, pushed into the event store, and then broadcast to the dashboard in real time.
