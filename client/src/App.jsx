import React, { startTransition, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:5000');

const styles = {
  app: {
    minHeight: '100vh',
    background:
      'radial-gradient(circle at top, rgba(248,103,72,0.18), transparent 24%), linear-gradient(135deg, #09111f 0%, #14213d 48%, #1f3b4d 100%)',
    color: '#f6f3eb',
    fontFamily: '"Segoe UI", "Trebuchet MS", sans-serif',
    padding: '24px'
  },
  shell: {
    display: 'grid',
    gridTemplateColumns: '360px 1fr',
    gap: '20px',
    alignItems: 'start'
  },
  panel: {
    background: 'rgba(8, 17, 30, 0.78)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '20px',
    boxShadow: '0 24px 70px rgba(0,0,0,0.25)',
    backdropFilter: 'blur(12px)'
  },
  sidebar: {
    padding: '22px',
    position: 'sticky',
    top: '24px'
  },
  hero: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '18px',
    marginBottom: '20px',
    flexWrap: 'wrap'
  },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '14px',
    marginBottom: '20px'
  },
  metricCard: {
    padding: '16px 18px',
    borderRadius: '18px',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
    border: '1px solid rgba(255,255,255,0.08)'
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    outline: 'none',
    boxSizing: 'border-box'
  },
  button: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '12px',
    border: 'none',
    fontWeight: 700,
    cursor: 'pointer'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
    gap: '16px'
  },
  card: {
    padding: '18px',
    borderRadius: '20px',
    background: 'rgba(5, 13, 24, 0.76)',
    border: '1px solid rgba(255,255,255,0.06)'
  }
};

const classificationColors = {
  high_risk: '#ff7b54',
  not_sure: '#f4c95d',
  normal: '#5dd39e'
};

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result || '';
      resolve(String(result).split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getMapPosition(point) {
  const lat = point?.lat ?? 20;
  const lng = point?.lng ?? 78;
  const x = ((lng - 72) / 17) * 100;
  const y = 100 - ((lat - 12) / 17) * 100;
  return {
    x: Math.max(5, Math.min(95, x)),
    y: Math.max(8, Math.min(92, y))
  };
}

function SectionTitle({ title, detail }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: 12, letterSpacing: '0.18em', color: '#8ab6c8', textTransform: 'uppercase' }}>{title}</div>
      {detail ? <div style={{ color: '#d3d6de', marginTop: 4 }}>{detail}</div> : null}
    </div>
  );
}

function MapPanel({ points = [], heatmap = [] }) {
  return (
    <div style={{ ...styles.card, gridColumn: 'span 7' }}>
      <SectionTitle title="Incident Map" detail="Map integration for live incident locations and heat intensity" />
      <div style={{ position: 'relative', height: 320, borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(160deg, #0f1b2c, #18344a)' }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.3" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#grid)" />
          {heatmap.map((bucket, index) => {
            const position = getMapPosition(bucket);
            return (
              <circle
                key={`heat-${index}`}
                cx={position.x}
                cy={position.y}
                r={Math.min(14, 3 + bucket.intensity)}
                fill="rgba(255,123,84,0.18)"
                stroke="rgba(255,123,84,0.4)"
              />
            );
          })}
          {points.map((point) => {
            const position = getMapPosition(point);
            const color = classificationColors[point.classification] || '#8ab6c8';
            return (
              <g key={point.id}>
                <circle cx={position.x} cy={position.y} r="2.2" fill={color} />
                <circle cx={position.x} cy={position.y} r="4.6" fill="transparent" stroke={color} opacity="0.45" />
              </g>
            );
          })}
        </svg>
        <div style={{ position: 'absolute', right: 14, top: 14, background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: 12, fontSize: 12 }}>
          <div>Live incidents: {points.length}</div>
          <div>Heat clusters: {heatmap.length}</div>
        </div>
      </div>
    </div>
  );
}

function DeploymentPanel({ deployments = [] }) {
  return (
    <div style={{ ...styles.card, gridColumn: 'span 5' }}>
      <SectionTitle title="Resource Deployment" detail="Track units, ETAs, and field staging in real time" />
      <div style={{ display: 'grid', gap: 10 }}>
        {deployments.slice(0, 6).map((deployment) => (
          <div key={deployment.id} style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong>{deployment.resource}</strong>
              <span style={{ color: '#8ab6c8' }}>{deployment.status}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 14, color: '#d3d6de' }}>{deployment.team} to {deployment.destination}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#9eb3c2' }}>ETA {deployment.etaMinutes} min</div>
          </div>
        ))}
        {!deployments.length ? <div style={{ color: '#9eb3c2' }}>No active deployments yet.</div> : null}
      </div>
    </div>
  );
}

function AnalyticsPanel({ analytics }) {
  const timeline = analytics?.responseTimeTracking?.timeline || [];
  const heatmap = analytics?.incidentHeatmap || [];
  const falsePositives = analytics?.falsePositiveAnalysis || { total: 0, falsePositives: 0, falsePositiveRate: 0 };

  return (
    <div style={{ ...styles.card, gridColumn: 'span 7' }}>
      <SectionTitle title="Advanced Analytics" detail="Incident heatmaps, response times, and false-positive analysis" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div>
          <div style={{ fontSize: 13, color: '#8ab6c8', marginBottom: 8 }}>Response time tracking</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {timeline.slice(-6).map((item) => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '56px 1fr 42px', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#9eb3c2' }}>{item.classification}</span>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 999 }}>
                  <div
                    style={{
                      width: `${Math.min(100, (item.responseTimeSeconds / 60) * 100)}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: 'linear-gradient(90deg, #5dd39e, #f4c95d, #ff7b54)'
                    }}
                  />
                </div>
                <span style={{ fontSize: 12 }}>{item.responseTimeSeconds}s</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#8ab6c8', marginBottom: 8 }}>Heat intensity</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {heatmap.slice(0, 5).map((bucket, index) => (
              <div key={`${bucket.lat}-${bucket.lng}-${index}`} style={{ display: 'grid', gridTemplateColumns: '74px 1fr 36px', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#9eb3c2' }}>{bucket.lat},{bucket.lng}</span>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 999 }}>
                  <div style={{ width: `${Math.min(100, bucket.intensity * 12)}%`, height: '100%', borderRadius: 999, background: '#ff7b54' }} />
                </div>
                <span style={{ fontSize: 12 }}>{bucket.incidents}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 18, padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ color: '#8ab6c8', fontSize: 13 }}>False positive analysis</div>
            <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700 }}>{falsePositives.falsePositiveRate}%</div>
            <div style={{ color: '#9eb3c2', fontSize: 12 }}>{falsePositives.falsePositives} of {falsePositives.total} incidents flagged as low-confidence</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IncidentFeed({ incidents = [] }) {
  return (
    <div style={{ ...styles.card, gridColumn: 'span 5' }}>
      <SectionTitle title="Live Incident Feed" detail="WebSocket listeners keep this feed updated automatically" />
      <div style={{ display: 'grid', gap: 12, maxHeight: 420, overflow: 'auto' }}>
        {incidents.slice(0, 8).map((entry) => (
          <div key={entry.id} style={{ borderLeft: `4px solid ${classificationColors[entry.classification] || '#8ab6c8'}`, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <strong>{entry.incident?.location || entry.location}</strong>
              <span style={{ color: classificationColors[entry.classification] || '#8ab6c8', fontSize: 12 }}>{entry.classification}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 14, color: '#d3d6de' }}>{entry.incident?.description || entry.description}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#9eb3c2' }}>
              CV: {(entry.incident?.detections || []).map((item) => item.label).slice(0, 5).join(', ') || 'no detections'} | Crowd {entry.incident?.face_count || 0}
            </div>
          </div>
        ))}
        {!incidents.length ? <div style={{ color: '#9eb3c2' }}>No incidents streamed yet.</div> : null}
      </div>
    </div>
  );
}

function AlertPanel({ alerts = [] }) {
  return (
    <div style={{ ...styles.card, gridColumn: 'span 12' }}>
      <SectionTitle title="Connector Deliveries" detail="SMS, email, CAD dispatch, and service alerts" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {alerts.slice(0, 6).map((alert, index) => (
          <div key={`${alert.incidentId || index}-${alert.service}`} style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <strong>{alert.service}</strong>
              <span style={{ color: '#f4c95d', fontSize: 12 }}>{alert.priority}</span>
            </div>
            <div style={{ marginTop: 8, color: '#d3d6de', fontSize: 14 }}>{alert.message}</div>
          </div>
        ))}
        {!alerts.length ? <div style={{ color: '#9eb3c2' }}>No connector activity yet.</div> : null}
      </div>
    </div>
  );
}

export default function App() {
  const [dashboard, setDashboard] = useState({
    activeIncidents: [],
    analytics: {
      incidentHeatmap: [],
      responseTimeTracking: { averageSeconds: 0, timeline: [] },
      falsePositiveAnalysis: { total: 0, falsePositives: 0, falsePositiveRate: 0 },
      totals: { incidents: 0, critical: 0 }
    },
    recentAlerts: [],
    deployments: []
  });
  const [mapPoints, setMapPoints] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [location, setLocation] = useState('Control Sector Alpha');
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceFile, setVoiceFile] = useState(null);
  const [cctvUrl, setCctvUrl] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [audioRecorder, setAudioRecorder] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previewWindowRef = useRef(null);

  useEffect(() => {
    async function loadDashboard() {
      const [dashboardResponse, mapResponse] = await Promise.all([
        fetch('http://localhost:5000/api/dashboard'),
        fetch('http://localhost:5000/api/map/incidents')
      ]);
      const [dashboardData, mapData] = await Promise.all([dashboardResponse.json(), mapResponse.json()]);
      startTransition(() => {
        setDashboard(dashboardData);
        setMapPoints(mapData);
      });
    }

    loadDashboard().catch((error) => console.error('Failed to load dashboard:', error));

    socket.on('DASHBOARD_SNAPSHOT', (data) => startTransition(() => setDashboard(data)));
    socket.on('INCIDENT_MAP_UPDATED', (data) => startTransition(() => setMapPoints(data)));
    socket.on('INCIDENT_PROCESSED', () => setIsProcessing(false));
    socket.on('ERROR', () => setIsProcessing(false));

    return () => {
      socket.off('DASHBOARD_SNAPSHOT');
      socket.off('INCIDENT_MAP_UPDATED');
      socket.off('INCIDENT_PROCESSED');
      socket.off('ERROR');
      if (previewWindowRef.current && !previewWindowRef.current.closed) {
        previewWindowRef.current.close();
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const openPreviewWindow = (stream) => {
    if (previewWindowRef.current && !previewWindowRef.current.closed) {
      previewWindowRef.current.focus();
      return;
    }

    const previewWindow = window.open('', 'aegis-webcam-preview', 'width=960,height=720');
    if (!previewWindow) {
      alert('Popup blocked. Please allow popups to see the webcam preview window.');
      return;
    }

    previewWindow.document.title = 'Webcam Preview';
    previewWindow.document.body.style.margin = '0';
    previewWindow.document.body.style.background = '#09111f';
    previewWindow.document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;padding:16px;font-family:Segoe UI,sans-serif;color:#f6f3eb;">
        <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#8ab6c8;">Live Camera Feed</div>
        <video id="previewVideo" autoplay playsinline muted style="width:100%;border-radius:16px;background:#000;box-shadow:0 16px 40px rgba(0,0,0,0.35);"></video>
        <div id="previewStatus" style="font-size:14px;color:#c7d8e3;">Camera feed active. Keep this window open to monitor what is being captured.</div>
      </div>
    `;

    const previewVideo = previewWindow.document.getElementById('previewVideo');
    previewVideo.srcObject = stream;
    previewWindow.onbeforeunload = () => {
      previewWindowRef.current = null;
    };
    previewWindowRef.current = previewWindow;
  };

  const emitIncident = (incident) => {
    setIsProcessing(true);
    socket.emit('REPORT_INCIDENT', incident);
  };

  const handleTextSubmit = (event) => {
    event.preventDefault();
    if (!userInput.trim()) {
      return;
    }
    emitIncident({
      type: 'text',
      inputType: 'text',
      description: userInput,
      location,
      severity: 'HIGH'
    });
    setUserInput('');
  };

  const startLiveCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      setCameraActive(true);
      openPreviewWindow(stream);
    }
  };

  const stopLiveCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      setCameraActive(false);
    }
    if (previewWindowRef.current && !previewWindowRef.current.closed) {
      previewWindowRef.current.close();
      previewWindowRef.current = null;
    }
  };

  const captureLiveFrame = async () => {
    if (!videoRef.current || !canvasRef.current) {
      return;
    }
    const context = canvasRef.current.getContext('2d');
    canvasRef.current.width = videoRef.current.videoWidth || 640;
    canvasRef.current.height = videoRef.current.videoHeight || 480;
    context.drawImage(videoRef.current, 0, 0);
    const blob = await new Promise((resolve) => canvasRef.current.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) {
      return;
    }
    setImageFile(blob);
    setImagePreview(URL.createObjectURL(blob));
  };

  const startLiveAudio = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const chunks = [];

    mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      setVoiceFile(blob);
    };

    setAudioRecorder(mediaRecorder);
    mediaRecorder.start();
    setVoiceRecording(true);
  };

  const stopLiveAudio = () => {
    if (!audioRecorder) {
      return;
    }
    audioRecorder.stop();
    audioRecorder.stream.getTracks().forEach((track) => track.stop());
    setVoiceRecording(false);
    setAudioRecorder(null);
  };

  const handleVoiceSubmit = async () => {
    if (!voiceFile) {
      return;
    }
    const audioBase64 = await toBase64(voiceFile);
    emitIncident({
      type: 'voice',
      inputType: 'voice',
      description: 'Live voice report submitted for transcription and urgency analysis',
      location,
      severity: 'HIGH',
      hasAudio: true,
      mediaSource: 'browser_microphone',
      audioBase64
    });
    setVoiceFile(null);
  };

  const handleImageSubmit = async () => {
    if (!imageFile && !cctvUrl.trim()) {
      return;
    }
    const frameBase64 = imageFile ? await toBase64(imageFile) : undefined;
    emitIncident({
      type: imageFile ? 'image' : 'cctv',
      inputType: imageFile ? 'image' : 'cctv',
      description: imageFile ? 'Captured frame submitted for computer vision analysis' : `Remote camera feed submitted from ${cctvUrl}`,
      location,
      severity: 'HIGH',
      mediaSource: imageFile ? 'browser_camera' : cctvUrl,
      frame_base64: frameBase64
    });
    setImageFile(null);
    setImagePreview('');
    setCctvUrl('');
  };

  const simulateEmergency = () => {
    emitIncident({
      type: 'text',
      inputType: 'text',
      description: 'Multiple vehicles near a smoke plume with crowd congestion at the bridge approach',
      location: 'Bridge Corridor Delta',
      severity: 'CRITICAL',
      detections: [
        { label: 'vehicle', confidence: 0.78, bbox: { x: 20, y: 20, w: 100, h: 60 } },
        { label: 'smoke', confidence: 0.84, bbox: { x: 120, y: 60, w: 80, h: 100 } },
        { label: 'person', confidence: 0.88, bbox: { x: 220, y: 90, w: 40, h: 120 } }
      ],
      face_count: 5,
      emotion_level: 'HIGH',
      motion_percentage: 8.4,
      opticalFlow: { averageMotion: 1.6, peakMotion: 4.4, motionDirection: 'leftward' }
    });
  };

  const totals = dashboard.analytics?.totals || { incidents: 0, critical: 0 };

  return (
    <div style={styles.app}>
      <div style={styles.hero}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: '0.22em', color: '#8ab6c8', textTransform: 'uppercase' }}>AI Emergency Ops</div>
          <h1 style={{ margin: '8px 0 6px 0', fontSize: 36 }}>Real-time command dashboard</h1>
          <div style={{ color: '#c7d8e3', maxWidth: 720 }}>
            Live incident streaming, incident map integration, deployment tracking, CV detections, transcription signals, and advanced analytics in one workspace.
          </div>
        </div>
        <button
          onClick={simulateEmergency}
          disabled={isProcessing}
          style={{ ...styles.button, width: 240, background: '#ff7b54', color: '#111827', alignSelf: 'center' }}
        >
          {isProcessing ? 'Processing...' : 'Simulate Critical Event'}
        </button>
      </div>

      <div style={styles.metrics}>
        <div style={styles.metricCard}>
          <div style={{ color: '#8ab6c8', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Total incidents</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{totals.incidents}</div>
        </div>
        <div style={styles.metricCard}>
          <div style={{ color: '#8ab6c8', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}>High risk</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8, color: '#ff7b54' }}>{totals.critical}</div>
        </div>
        <div style={styles.metricCard}>
          <div style={{ color: '#8ab6c8', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Avg response</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{dashboard.analytics?.responseTimeTracking?.averageSeconds || 0}s</div>
        </div>
        <div style={styles.metricCard}>
          <div style={{ color: '#8ab6c8', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}>False positives</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{dashboard.analytics?.falsePositiveAnalysis?.falsePositiveRate || 0}%</div>
        </div>
      </div>

      <div style={styles.shell}>
        <aside style={{ ...styles.panel, ...styles.sidebar }}>
          <SectionTitle title="Report Inputs" detail="Text, voice, webcam, CCTV, and image capture" />
          <div style={{ display: 'grid', gap: 12 }}>
            <input style={styles.input} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Incident location" />
            <form onSubmit={handleTextSubmit} style={{ display: 'grid', gap: 10 }}>
              <textarea
                style={{ ...styles.input, minHeight: 120, resize: 'vertical' }}
                value={userInput}
                onChange={(event) => setUserInput(event.target.value)}
                placeholder="Describe the incident..."
              />
              <button type="submit" disabled={isProcessing} style={{ ...styles.button, background: '#5dd39e', color: '#102a1f' }}>
                Send Text Report
              </button>
            </form>

            <div style={{ paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ marginBottom: 8, color: '#d3d6de' }}>Audio transcription and voice analysis</div>
              <div style={{ display: 'grid', gap: 10 }}>
                <button onClick={voiceRecording ? stopLiveAudio : startLiveAudio} style={{ ...styles.button, background: voiceRecording ? '#ff7b54' : '#8ab6c8', color: '#0d1a27' }}>
                  {voiceRecording ? 'Stop Recording' : 'Start Recording'}
                </button>
                <button onClick={handleVoiceSubmit} disabled={!voiceFile || isProcessing} style={{ ...styles.button, background: '#f4c95d', color: '#2a2005' }}>
                  Submit Voice Report
                </button>
              </div>
            </div>

            <div style={{ paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ marginBottom: 8, color: '#d3d6de' }}>Camera and computer vision</div>
              {!cameraActive ? (
                <button onClick={startLiveCamera} style={{ ...styles.button, background: '#8ab6c8', color: '#0d1a27' }}>
                  Start Webcam
                </button>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: 14, background: '#09111f' }} />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                  <button onClick={captureLiveFrame} style={{ ...styles.button, background: '#5dd39e', color: '#102a1f' }}>
                    Capture Frame
                  </button>
                  <button onClick={stopLiveCamera} style={{ ...styles.button, background: '#ff7b54', color: '#111827' }}>
                    Stop Webcam
                  </button>
                </div>
              )}
              {imagePreview ? <img src={imagePreview} alt="Captured preview" style={{ width: '100%', marginTop: 10, borderRadius: 14 }} /> : null}
              <input style={{ ...styles.input, marginTop: 10 }} value={cctvUrl} onChange={(event) => setCctvUrl(event.target.value)} placeholder="Remote CCTV URL" />
              <button onClick={handleImageSubmit} disabled={isProcessing} style={{ ...styles.button, background: '#f4c95d', color: '#2a2005', marginTop: 10 }}>
                Submit Visual Incident
              </button>
            </div>
          </div>
        </aside>

        <main style={{ display: 'grid', gap: 16 }}>
          <div style={{ ...styles.panel, padding: 18 }}>
            <div style={styles.grid}>
              <MapPanel points={mapPoints} heatmap={dashboard.analytics?.incidentHeatmap} />
              <DeploymentPanel deployments={dashboard.deployments} />
              <AnalyticsPanel analytics={dashboard.analytics} />
              <IncidentFeed incidents={dashboard.activeIncidents} />
              <AlertPanel alerts={dashboard.recentAlerts} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
