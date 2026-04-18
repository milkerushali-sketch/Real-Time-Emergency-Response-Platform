import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';

// Connect to the Node.js backend
const socket = io('http://localhost:5000');

export default function App() {
  const [incidents, setIncidents] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('cctv');  // Default to camera tab
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceFile, setVoiceFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [cctvUrl, setCctvUrl] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [audioRecorder, setAudioRecorder] = useState(null);
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);

  useEffect(() => {
    // Listen for processed incidents from the backend
    socket.on('INCIDENT_PROCESSED', (data) => {
      setIncidents((prev) => [data, ...prev]);
      setIsProcessing(false);
    });

    socket.on('ALERT_SENT', (alert) => {
      setAlerts((prev) => [alert, ...prev]);
    });

    socket.on('ERROR', (error) => {
      console.error('Error:', error.message);
      setIsProcessing(false);
    });

    return () => {
      if (cameraActive && videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      socket.off();
    };
  }, [cameraActive]);

  const startLiveCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (error) {
      console.error('Camera access denied:', error);
      alert('Unable to access camera. Check permissions.');
    }
  };

  const captureLiveFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth || 640;
      canvasRef.current.height = videoRef.current.videoHeight || 480;
      context.drawImage(videoRef.current, 0, 0);
      
      canvasRef.current.toBlob((blob) => {
        const preview = URL.createObjectURL(blob);
        setImagePreview(preview);
        setImageFile(blob);
      }, 'image/jpeg', 0.9);
    }
  };

  const stopLiveCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      setCameraActive(false);
    }
  };

  const startLiveAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setVoiceFile(blob);
      };

      setAudioRecorder(mediaRecorder);
      mediaRecorder.start();
      setVoiceRecording(true);
    } catch (error) {
      console.error('Microphone access denied:', error);
      alert('Unable to access microphone. Check permissions.');
    }
  };

  const stopLiveAudio = () => {
    if (audioRecorder) {
      audioRecorder.stop();
      audioRecorder.stream.getTracks().forEach(track => track.stop());
      setVoiceRecording(false);
      setAudioRecorder(null);
    }
  };

  const emitIncident = (incident) => {
    setIsProcessing(true);
    socket.emit('REPORT_INCIDENT', incident);
  };

  const handleTextSubmit = async (e) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const incident = {
      type: 'text',
      inputType: 'text',
      description: userInput,
      location: "User_Reported_Location",
      severity: "HIGH"
    };

    emitIncident(incident);
    setUserInput('');
  };

  const handleVoiceFileChange = (e) => {
    const file = e.target.files?.[0];
    setVoiceFile(file || null);
  };

  const handleVoiceSubmit = async () => {
    if (voiceFile) {
      const incident = {
        type: 'voice',
        inputType: 'voice',
        description: 'Live voice recording submitted for emergency analysis',
        location: "Voice_Reported_Location",
        severity: "HIGH",
        mediaType: 'audio',
        mediaSource: 'desktop_microphone',
        hasAudio: true
      };
      emitIncident(incident);
      setVoiceFile(null);
    } else {
      alert('No voice recording. Click "Start Recording" first.');
    }
  };

  const handleCctvSubmit = () => {
    if (!cctvUrl.trim()) return;

    const incident = {
      type: 'cctv',
      inputType: 'cctv',
      description: `Live CCTV feed at ${cctvUrl}`,
      location: "CCTV_Monitored_Area",
      severity: "HIGH",
      mediaType: 'video',
      mediaSource: cctvUrl
    };
    emitIncident(incident);
    setCctvUrl('');
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    } else {
      setImageFile(null);
      setImagePreview('');
    }
  };

  const handleImageSubmit = () => {
    if (!imageFile && !cctvUrl.trim()) return;

    const incident = {
      type: imageFile ? 'image' : 'cctv',
      inputType: imageFile ? 'image' : 'cctv',
      description: imageFile ? `Live image snapshot from ${imageFile.name}` : `Live camera feed at ${cctvUrl}`,
      location: "Camera_Monitored_Area",
      severity: "HIGH",
      mediaType: imageFile ? 'image' : 'video',
      mediaSource: imageFile ? imageFile.name : cctvUrl,
      mediaPreview: imagePreview
    };

    emitIncident(incident);
    if (imageFile) {
      setImageFile(null);
      setImagePreview('');
    }
    setCctvUrl('');
  };

  const simulateEmergency = () => {
    const incident = {
      type: 'text',
      inputType: 'text',
      description: "Severe Structural Fire - Main Bridge",
      location: "Bridge_Alpha",
      severity: "CRITICAL"
    };
    emitIncident(incident);
  };

  const getClassificationColor = (category) => {
    switch (category) {
      case 'normal': return '#00ff88';
      case 'not_sure': return '#ffa500';
      case 'high_risk': return '#ff4b2b';
      default: return '#888';
    }
  };

  const getClassificationIcon = (category) => {
    switch (category) {
      case 'normal': return '✅';
      case 'not_sure': return '⚠️';
      case 'high_risk': return '🚨';
      default: return '❓';
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', backgroundColor: '#0f0f23', color: '#ffffff', minHeight: '100vh' }}>
      <header style={{ borderBottom: '2px solid #00d4ff', paddingBottom: '10px', marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ color: '#00d4ff', margin: 0 }}>🚨 AI Emergency Response System</h1>
            <p style={{ color: '#888' }}>Multi-source AI analysis with automated emergency coordination</p>
          </div>
          <div style={{ fontSize: '0.8em', color: '#00ff88', padding: '8px 12px', backgroundColor: '#16213e', borderRadius: '4px' }}>
            OpenCV ✓
          </div>
        </div>
      </header>

      {/* Alert Notifications */}
      {alerts.length > 0 && (
        <div style={{ backgroundColor: '#1a1a2e', padding: '15px', borderRadius: '8px', marginBottom: '20px', borderLeft: '4px solid #ff4b2b' }}>
          <h3 style={{ color: '#ff4b2b', margin: '0 0 10px 0' }}>🚨 Active Alerts</h3>
          {alerts.slice(0, 3).map((alert, index) => (
            <div key={index} style={{ marginBottom: '8px', padding: '8px', backgroundColor: '#16213e', borderRadius: '4px' }}>
              <strong>{alert.service}:</strong> {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* Input Source Tabs */}
      <div style={{ backgroundColor: '#1a1a2e', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
        <div style={{ display: 'flex', marginBottom: '20px', borderBottom: '1px solid #333' }}>
          {[
            { id: 'text', label: '📝 Text Report', desc: 'Type emergency description' },
            { id: 'voice', label: '🎤 Voice Report', desc: 'Record voice emergency' },
            { id: 'cctv', label: '📹 CCTV Analysis', desc: 'Analyze camera footage' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: activeTab === tab.id ? '#00d4ff' : 'transparent',
                color: activeTab === tab.id ? '#0f0f23' : '#ffffff',
                border: 'none',
                borderRadius: '4px 4px 0 0',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: '1.1em', fontWeight: 'bold' }}>{tab.label}</div>
              <div style={{ fontSize: '0.8em', opacity: 0.8 }}>{tab.desc}</div>
            </button>
          ))}
        </div>

        {/* Text Input Tab */}
        {activeTab === 'text' && (
          <div>
            <h3 style={{ color: '#00d4ff' }}>Text Emergency Report</h3>
            <form onSubmit={handleTextSubmit} style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Describe the emergency situation..."
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#16213e',
                  border: '1px solid #00d4ff',
                  borderRadius: '4px',
                  color: '#ffffff'
                }}
                disabled={isProcessing}
              />
              <button
                type="submit"
                disabled={isProcessing}
                style={{
                  padding: '10px 20px',
                  backgroundColor: isProcessing ? '#555' : '#ff4b2b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isProcessing ? 'not-allowed' : 'pointer'
                }}
              >
                {isProcessing ? 'Processing...' : 'Report Emergency'}
              </button>
            </form>
          </div>
        )}

        {/* Voice Input Tab */}
        {activeTab === 'voice' && (
          <div>
            <h3 style={{ color: '#00d4ff' }}>📢 Live Voice Emergency Report</h3>
            <p style={{ color: '#888', marginBottom: '15px' }}>Use your desktop microphone to record an emergency report in real-time.</p>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
              <button
                onClick={voiceRecording ? stopLiveAudio : startLiveAudio}
                disabled={isProcessing}
                style={{
                  padding: '15px 30px',
                  backgroundColor: voiceRecording ? '#ff0000' : '#00ff88',
                  color: voiceRecording ? 'white' : '#0f0f23',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  fontSize: '1.1em',
                  fontWeight: 'bold'
                }}
              >
                {voiceRecording ? '⏹️ Stop Recording' : '🎙️ Start Recording'}
              </button>
              <button
                onClick={handleVoiceSubmit}
                disabled={isProcessing || !voiceFile}
                style={{
                  padding: '15px 30px',
                  backgroundColor: !voiceFile || isProcessing ? '#555' : '#ff4b2b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isProcessing || !voiceFile ? 'not-allowed' : 'pointer',
                  fontSize: '1.1em',
                  fontWeight: 'bold'
                }}
              >
                {isProcessing ? 'Processing...' : '📤 Send Voice Report'}
              </button>
            </div>
            {voiceFile && <p style={{ color: '#00ff88' }}>✅ Voice recording ready to send</p>}
          </div>
        )}

        {/* CCTV / Image Input Tab */}
        {activeTab === 'cctv' && (
          <div>
            <h3 style={{ color: '#00d4ff' }}>📹 Live Webcam / Image Analysis</h3>
            <p style={{ color: '#888', marginBottom: '15px' }}>Capture live frames from your desktop webcam for emergency analysis.</p>
            
            {!cameraActive ? (
              <button
                onClick={startLiveCamera}
                disabled={isProcessing}
                style={{
                  padding: '15px 30px',
                  backgroundColor: isProcessing ? '#555' : '#00d4ff',
                  color: '#0f0f23',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  fontSize: '1.1em',
                  fontWeight: 'bold',
                  marginBottom: '15px',
                  width: '100%'
                }}
              >
                🎥 Start Webcam
              </button>
            ) : (
              <div style={{ marginBottom: '15px' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  style={{
                    width: '100%',
                    border: '3px solid #00d4ff',
                    borderRadius: '8px',
                    marginBottom: '15px',
                    maxHeight: '500px',
                    backgroundColor: '#000'
                  }}
                />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexDirection: 'column' }}>
                  <button
                    onClick={captureLiveFrame}
                    disabled={isProcessing}
                    style={{
                      padding: '15px 30px',
                      backgroundColor: isProcessing ? '#555' : '#00ff88',
                      color: '#0f0f23',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isProcessing ? 'not-allowed' : 'pointer',
                      fontSize: '1.1em',
                      fontWeight: 'bold'
                    }}
                  >
                    📸 Capture Frame
                  </button>
                  <button
                    onClick={stopLiveCamera}
                    disabled={isProcessing}
                    style={{
                      padding: '15px 30px',
                      backgroundColor: isProcessing ? '#555' : '#ff4b2b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isProcessing ? 'not-allowed' : 'pointer',
                      fontSize: '1.1em',
                      fontWeight: 'bold'
                    }}
                  >
                    ⏹️ Stop Webcam
                  </button>
                </div>
              </div>
            )}

            {imagePreview && (
              <div style={{ marginBottom: '15px', border: '2px solid #00d4ff', borderRadius: '8px', overflow: 'hidden' }}>
                <p style={{ color: '#888', margin: '10px', fontSize: '0.9em' }}>📸 Captured Frame:</p>
                <img src={imagePreview} alt="Captured Frame" style={{ width: '100%', display: 'block', maxHeight: '300px', objectFit: 'cover' }} />
              </div>
            )}

            <button
              onClick={handleImageSubmit}
              disabled={isProcessing || !imageFile}
              style={{
                padding: '12px 24px',
                backgroundColor: !imageFile || isProcessing ? '#555' : '#ff4b2b',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: !imageFile || isProcessing ? 'not-allowed' : 'pointer',
                fontSize: '1em',
                fontWeight: 'bold',
                width: '100%'
              }}
            >
              {isProcessing ? 'Analyzing...' : '📤 Send Captured Frame for Analysis'}
            </button>
          </div>
        )}

        <button
          onClick={simulateEmergency}
          disabled={isProcessing}
          style={{
            padding: '10px 20px',
            backgroundColor: '#ff4b2b',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            opacity: isProcessing ? 0.5 : 1,
            marginTop: '15px'
          }}
        >
          🚨 Simulate Critical Emergency
        </button>
      </div>

      {/* Incident Processing Pipeline Display */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
        {incidents.map((incident, index) => (
          <div key={index} style={{ backgroundColor: '#1a1a2e', padding: '20px', borderRadius: '8px', borderLeft: `4px solid ${getClassificationColor(incident.classification)}` }}>
            <h3 style={{ color: '#00d4ff', marginTop: 0 }}>
              Incident #{incidents.length - index} {getClassificationIcon(incident.classification)}
            </h3>

            {/* Input Source */}
            <div style={{ marginBottom: '15px' }}>
              <h4 style={{ color: '#888' }}>📥 Input Source: {incident.inputType?.toUpperCase()}</h4>
              <p><strong>Description:</strong> {incident.incident?.description || incident.description}</p>
              <p><strong>Location:</strong> {incident.incident?.location || incident.location}</p>
            </div>

            {/* AI Classification */}
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#16213e', borderRadius: '4px' }}>
              <h4 style={{ color: getClassificationColor(incident.classification), margin: '0 0 8px 0' }}>
                🤖 AI Classification: {incident.classification?.toUpperCase()}
              </h4>
              <p style={{ margin: '4px 0' }}><strong>Confidence:</strong> {incident.confidence}%</p>
              <p style={{ margin: '4px 0' }}><strong>Analysis:</strong> {incident.analysis}</p>
              {incident.recommendedResources && (
                <p style={{ margin: '4px 0' }}><strong>Resources:</strong> {incident.recommendedResources.join(', ')}</p>
              )}
            </div>

            {/* Decision Engine Output */}
            <div style={{ marginBottom: '15px' }}>
              <h4 style={{ color: '#ffa500' }}>⚙️ Response Plan</h4>
              <p><strong>Priority:</strong> {incident.priority}</p>
              <p><strong>Routing:</strong> {incident.routing?.alternativeRoute || 'Direct route'}</p>
              <p><strong>ETA:</strong> {incident.routing?.estimatedTime || 'Calculating...'}</p>
              <p><strong>Resources Deployed:</strong> {incident.resources?.join(', ') || 'None'}</p>
            </div>

            {/* Alerts Sent */}
            {incident.alerts && incident.alerts.length > 0 && (
              <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#16213e', borderRadius: '4px' }}>
                <h4 style={{ color: '#ff4b2b', margin: '0 0 8px 0' }}>🚨 Alerts Sent</h4>
                {incident.alerts.map((alert, alertIndex) => (
                  <div key={alertIndex} style={{ fontSize: '0.9em', marginBottom: '4px' }}>
                    <strong>{alert.service}:</strong> {alert.message}
                  </div>
                ))}
              </div>
            )}

            {/* Timestamp */}
            <div style={{ fontSize: '0.8em', color: '#888', borderTop: '1px solid #333', paddingTop: '10px' }}>
              Processed at: {new Date(incident.timestamp || Date.now()).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {incidents.length === 0 && (
        <div style={{ textAlign: 'center', color: '#888', marginTop: '50px' }}>
          <p>No incidents processed yet. Use any input source above to report an emergency and see AI analysis in action.</p>
        </div>
      )}
    </div>
  );
}