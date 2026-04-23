const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { analyzeIncident, ALERT_CATEGORIES } = require('./services/aiService');
const { updateRoadStatus, findSafePath, initializeRoadNetwork } = require('./services/graphService');
const { buildCoordinates, getAnalyticsSnapshot, getIncidentMap, ingestIncident } = require('./analytics');
const { sendIntegratedAlerts } = require('./integrations');
const { transcribeAudioIncident } = require('./services/transcriptionService');
const { buildDeploymentTracking, buildDashboardSnapshot, buildMapData } = require('./services/dashboardService');

require('dotenv').config();

const reportsDir = path.join(__dirname, '../reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const eventStore = [];
const alertStore = [];
const deploymentStore = [];

class AlertSystem {
  static generateServiceAlerts(classification, incident, aiResponse) {
    const alerts = [
      {
        service: 'Emergency Dispatch',
        message: aiResponse.alert_message,
        priority: this.getPriorityLevel(classification),
        resources: aiResponse.resources_needed
      }
    ];

    if (classification === ALERT_CATEGORIES.HIGH_RISK) {
      alerts.push({
        service: 'Fire Department',
        message: `Urgent deployment for ${incident.location}. Detected risks: ${aiResponse.analysis_summary}`,
        priority: 'CRITICAL'
      });
      alerts.push({
        service: 'Medical Services',
        message: `Critical medical standby at ${incident.location}.`,
        priority: 'CRITICAL'
      });
    }

    if (classification === ALERT_CATEGORIES.UNSURE) {
      alerts.push({
        service: 'Emergency Operations Center',
        message: `Operator review required for ${incident.location}.`,
        priority: 'MEDIUM'
      });
    }

    return alerts;
  }

  static getPriorityLevel(classification) {
    switch (classification) {
      case ALERT_CATEGORIES.HIGH_RISK:
        return 'CRITICAL';
      case ALERT_CATEGORIES.UNSURE:
        return 'MEDIUM';
      default:
        return 'LOW';
    }
  }
}

function buildTextReportFromMedia(incident) {
  if (incident.type === 'voice') {
    return (
      incident.transcription ||
      incident.liveTranscript ||
      incident.description ||
      `Voice input from ${incident.mediaSource || 'operator microphone'} indicates an emergency near ${
        incident.location || 'reported location'
      }.`
    );
  }

  if (incident.type === 'cctv') {
    return (
      incident.description ||
      `Video feed from ${incident.mediaSource || 'camera'} indicates suspicious activity at ${
        incident.location || 'monitored area'
      }.`
    );
  }

  if (incident.type === 'image') {
    return (
      incident.description ||
      `Image input from ${incident.mediaSource || 'uploaded image'} suggests an incident at ${
        incident.location || 'monitored area'
      }.`
    );
  }

  return incident.description || 'Reported emergency requires assessment.';
}

function saveFrameAndGenerateReport(incident, aiResponse, decisionResult) {
  try {
    const timestamp = Date.now();
    const reportId = `REPORT_${timestamp}`;
    let frameFilename = null;

    if (incident.frame_base64) {
      frameFilename = `${reportId}_frame.jpg`;
      fs.writeFileSync(path.join(reportsDir, frameFilename), Buffer.from(incident.frame_base64, 'base64'));
    }

    const report = {
      reportId,
      timestamp: new Date().toISOString(),
      incident: decisionResult.incident,
      aiAnalysis: {
        classification: decisionResult.classification,
        confidence: aiResponse.confidence_score,
        summary: aiResponse.analysis_summary,
        riskAssessment: aiResponse.risk_assessment
      },
      map: decisionResult.map,
      analytics: decisionResult.analytics,
      resources: decisionResult.resources,
      deploymentTracking: decisionResult.resourceDeployments,
      alertDeliveries: decisionResult.integrationDeliveries,
      mediaFiles: frameFilename ? [frameFilename] : []
    };

    fs.writeFileSync(path.join(reportsDir, `${reportId}.json`), JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    console.error('Error generating report:', error);
    return null;
  }
}

class PriorityEngine {
  static determinePriority(classification, incident) {
    if (classification === ALERT_CATEGORIES.HIGH_RISK || incident.severity === 'CRITICAL') {
      return 1;
    }
    if (classification === ALERT_CATEGORIES.UNSURE) {
      return 2;
    }
    return 3;
  }
}

class RoutingSystem {
  static async calculateRoute(incident, classification) {
    try {
      if (classification === ALERT_CATEGORIES.HIGH_RISK) {
        await updateRoadStatus(incident.location, 'BLOCKED');
      }

      const safePath = await findSafePath('Central_Hub', incident.location);
      return {
        originalRoute: `Central_Hub -> ${incident.location}`,
        alternativeRoute: safePath,
        estimatedTime: classification === ALERT_CATEGORIES.HIGH_RISK ? '6 minutes' : '15 minutes',
        roadStatus: classification === ALERT_CATEGORIES.HIGH_RISK ? 'BLOCKED' : 'CLEAR'
      };
    } catch (error) {
      return {
        originalRoute: `Central_Hub -> ${incident.location}`,
        alternativeRoute: 'Manual routing required',
        estimatedTime: 'Unknown',
        roadStatus: 'UNKNOWN'
      };
    }
  }
}

class ResourceSuggestion {
  static suggestResources(classification, aiResources = [], detections = []) {
    const inferredResources = [];

    if (detections.some((item) => item.label === 'fire' || item.label === 'smoke')) {
      inferredResources.push('Fire Trucks', 'Hazmat Team');
    }
    if (detections.some((item) => item.label === 'person')) {
      inferredResources.push('Ambulances', 'Crowd Control Unit');
    }
    if (detections.some((item) => item.label === 'vehicle')) {
      inferredResources.push('Traffic Police', 'Rescue Tow Unit');
    }

    const fallbackResources = {
      [ALERT_CATEGORIES.HIGH_RISK]: ['Fire Trucks', 'Ambulances', 'Police Units', 'Medical Teams'],
      [ALERT_CATEGORIES.UNSURE]: ['Police Units', 'Rapid Assessment Team'],
      [ALERT_CATEGORIES.NORMAL]: ['Field Monitor']
    };

    const merged = [...new Set([...(aiResources || []), ...inferredResources, ...(fallbackResources[classification] || [])])];
    return merged.filter(Boolean);
  }
}

function summarizeDetections(incident) {
  const detections = Array.isArray(incident.detections) ? incident.detections : [];
  const summary = detections.reduce((accumulator, detection) => {
    accumulator[detection.label] = (accumulator[detection.label] || 0) + 1;
    return accumulator;
  }, {});

  return {
    detections,
    detectionSummary: summary,
    opticalFlow: incident.opticalFlow || {
      averageMotion: incident.motion_percentage || 0,
      motionDirection: 'steady',
      motionTracking: 'background-subtraction'
    }
  };
}

async function enrichIncident(incident) {
  const textReport = buildTextReportFromMedia(incident);
  const enriched = {
    ...incident,
    id: incident.id || `INC_${Date.now()}`,
    description: textReport,
    transcribed_report: incident.transcription || textReport,
    detectedAt: incident.detectedAt || new Date().toISOString(),
    mapCoordinates: incident.mapCoordinates || buildCoordinates(incident.location)
  };

  if (incident.type === 'voice' || incident.hasAudio) {
    const transcription = await transcribeAudioIncident(incident);
    enriched.transcription = transcription.transcript;
    enriched.voiceAnalysis = transcription.voiceAnalysis;
    enriched.transcriptionProvider = transcription.provider;
    enriched.transcribed_report = transcription.transcript;
  }

  return {
    ...enriched,
    ...summarizeDetections(incident)
  };
}

function emitDashboardState() {
  const analytics = getAnalyticsSnapshot();
  const snapshot = buildDashboardSnapshot({
    events: eventStore,
    analytics,
    alerts: alertStore,
    deployments: deploymentStore
  });

  io.emit('DASHBOARD_SNAPSHOT', snapshot);
  io.emit('ANALYTICS_UPDATED', analytics);
  io.emit('INCIDENT_MAP_UPDATED', getIncidentMap());
  io.emit('RESOURCE_TRACKING_UPDATED', deploymentStore.slice(0, 12));
}

async function processIncident(incident) {
  const enrichedIncident = await enrichIncident(incident);
  const aiResponse = await analyzeIncident(enrichedIncident);
  const classification = aiResponse.classification;
  const priority = PriorityEngine.determinePriority(classification, enrichedIncident);
  const routing = await RoutingSystem.calculateRoute(enrichedIncident, classification);
  const map = buildMapData(enrichedIncident, classification);
  const resources = ResourceSuggestion.suggestResources(
    classification,
    aiResponse.resources_needed,
    enrichedIncident.detections
  );
  const resourceDeployments = buildDeploymentTracking(resources, enrichedIncident, priority);

  const serviceAlerts = AlertSystem.generateServiceAlerts(classification, enrichedIncident, aiResponse);
  const integrationResult = await sendIntegratedAlerts(
    { ...enrichedIncident, id: enrichedIncident.id },
    { ...aiResponse, classification },
    serviceAlerts
  );

  const decisionResult = {
    id: enrichedIncident.id,
    incident: enrichedIncident,
    aiResponse,
    classification,
    priority,
    routing,
    resources,
    resourceDeployments,
    alerts: serviceAlerts,
    integrationDeliveries: integrationResult.deliveries,
    map,
    timestamp: new Date().toISOString(),
    inputType: enrichedIncident.inputType || enrichedIncident.type,
    analyticsFlags: {
      possibleFalsePositive:
        classification === ALERT_CATEGORIES.NORMAL &&
        (enrichedIncident.motion_percentage || 0) < 3 &&
        !enrichedIncident.face_count
    }
  };

  decisionResult.analytics = ingestIncident({
    ...decisionResult,
    mapCoordinates: map.coordinates,
    dispatchedAt: new Date().toISOString()
  });

  eventStore.unshift(decisionResult);
  eventStore.splice(50);

  deploymentStore.unshift(...resourceDeployments);
  deploymentStore.splice(12);

  alertStore.unshift(
    ...serviceAlerts.map((alert) => ({
      ...alert,
      incidentId: decisionResult.id,
      timestamp: decisionResult.timestamp
    }))
  );
  alertStore.splice(20);

  const report = saveFrameAndGenerateReport(enrichedIncident, aiResponse, decisionResult);
  if (report) {
    decisionResult.report = report;
  }

  serviceAlerts.forEach((alert) => io.emit('ALERT_SENT', alert));
  io.emit('INCIDENT_PROCESSED', decisionResult);
  emitDashboardState();

  return decisionResult;
}

initializeRoadNetwork();

app.post('/api/incident', async (req, res) => {
  try {
    const decisionResult = await processIncident(req.body);
    res.json(decisionResult);
  } catch (error) {
    console.error('Error processing incident:', error);
    res.status(500).json({ error: 'Failed to process incident' });
  }
});

app.get('/api/events', (req, res) => {
  res.json(eventStore.slice(0, 10));
});

app.get('/api/analytics', (req, res) => {
  res.json(getAnalyticsSnapshot());
});

app.get('/api/map/incidents', (req, res) => {
  res.json(getIncidentMap());
});

app.get('/api/dashboard', (req, res) => {
  res.json(
    buildDashboardSnapshot({
      events: eventStore,
      analytics: getAnalyticsSnapshot(),
      alerts: alertStore,
      deployments: deploymentStore
    })
  );
});

app.get('/api/reports', (req, res) => {
  try {
    const files = fs.readdirSync(reportsDir).filter((file) => file.endsWith('.json'));
    const reports = files
      .sort((left, right) => right.localeCompare(left))
      .slice(0, 20)
      .map((file) => JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf8')));

    res.json(reports);
  } catch (error) {
    console.error('Error reading reports:', error);
    res.status(500).json({ error: 'Failed to read reports' });
  }
});

app.get('/api/reports/:reportId/frame', (req, res) => {
  try {
    const framePath = path.join(reportsDir, `${req.params.reportId}_frame.jpg`);
    if (!fs.existsSync(framePath)) {
      return res.status(404).json({ error: 'Frame not found' });
    }

    res.setHeader('Content-Type', 'image/jpeg');
    return res.sendFile(framePath);
  } catch (error) {
    console.error('Error retrieving frame:', error);
    return res.status(500).json({ error: 'Failed to retrieve frame' });
  }
});

io.on('connection', (socket) => {
  socket.emit(
    'DASHBOARD_SNAPSHOT',
    buildDashboardSnapshot({
      events: eventStore,
      analytics: getAnalyticsSnapshot(),
      alerts: alertStore,
      deployments: deploymentStore
    })
  );
  socket.emit('INCIDENT_MAP_UPDATED', getIncidentMap());

  socket.on('REPORT_INCIDENT', async (incident) => {
    try {
      await processIncident(incident);
    } catch (error) {
      console.error('Incident processing error:', error);
      socket.emit('ERROR', { message: 'Failed to process incident' });
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`AI Emergency Response System running on port ${PORT}`);
  console.log('Real-time dashboard feeds enabled');
  console.log('Connector, analytics, and transcription pipelines active');
});
