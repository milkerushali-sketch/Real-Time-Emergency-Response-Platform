const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');
const { analyzeIncident, ALERT_CATEGORIES } = require('./services/aiService');
const { updateRoadStatus, findSafePath, initializeRoadNetwork } = require('./services/graphService');

require('dotenv').config();

// Create reports directory if it doesn't exist
const reportsDir = path.join(__dirname, '../reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// In-memory event store (for demo purposes)
let eventStore = [];

// Alert messaging system
class AlertSystem {
  static sendAlert(classification, incident, aiResponse) {
    const alertData = {
      timestamp: new Date().toISOString(),
      classification,
      incident,
      aiResponse,
      alertId: `ALERT_${Date.now()}`,
      status: 'SENT'
    };

    // Simulate sending alerts to different emergency services
    const alerts = this.generateServiceAlerts(classification, incident, aiResponse);

    console.log('🚨 ALERT SYSTEM ACTIVATED 🚨');
    console.log(`Classification: ${classification.toUpperCase()}`);
    console.log(`Incident: ${incident.description}`);
    console.log(`Location: ${incident.location}`);
    console.log(`Detected faces: ${incident.face_count || 0}`);
    console.log(`Detected emotions: ${incident.face_expressions || 'none'}`);
    console.log('Alerts sent to:');
    alerts.forEach(alert => console.log(`  - ${alert.service}: ${alert.message}`));

    if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_FROM && process.env.SMS_TO) {
      const smsText = `Emergency alert: ${incident.description} at ${incident.location}. Classification=${classification.toUpperCase()}.`;
      this.sendSms(process.env.SMS_TO, smsText);
    }

    return { alertData, serviceAlerts: alerts };
  }

  static sendSms(to, message) {
    try {
      const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      client.messages.create({
        body: message,
        from: process.env.TWILIO_FROM,
        to
      }).then((msg) => {
        console.log(`SMS alert sent: ${msg.sid}`);
      }).catch((smsError) => {
        console.error('SMS send failed:', smsError.message || smsError);
      });
    } catch (error) {
      console.error('SMS configuration error:', error.message || error);
    }
  }

  static generateServiceAlerts(classification, incident, aiResponse) {
    const alerts = [];

    // Always alert emergency dispatch
    alerts.push({
      service: 'Emergency Dispatch',
      message: aiResponse.alert_message,
      priority: this.getPriorityLevel(classification),
      resources: aiResponse.resources_needed
    });

    // Additional alerts based on classification
    if (classification === ALERT_CATEGORIES.HIGH_RISK) {
      if (aiResponse.resources_needed.includes('Fire Trucks')) {
        alerts.push({
          service: 'Fire Department',
          message: `URGENT: ${incident.description} at ${incident.location}. Immediate response required.`,
          priority: 'CRITICAL'
        });
      }
      if (aiResponse.resources_needed.includes('Ambulances')) {
        alerts.push({
          service: 'Medical Services',
          message: `CRITICAL: Medical emergency at ${incident.location}. ${aiResponse.immediate_actions.join(', ')}`,
          priority: 'CRITICAL'
        });
      }
      if (aiResponse.resources_needed.includes('Police Units')) {
        alerts.push({
          service: 'Police Department',
          message: `HIGH PRIORITY: Security incident at ${incident.location}. Officer response needed.`,
          priority: 'HIGH'
        });
      }
    } else if (classification === ALERT_CATEGORIES.UNSURE) {
      alerts.push({
        service: 'Emergency Operations Center',
        message: `REVIEW REQUIRED: Unclear incident at ${incident.location}. Human verification needed.`,
        priority: 'MEDIUM'
      });
    }

    return alerts;
  }

  static getPriorityLevel(classification) {
    switch (classification) {
      case ALERT_CATEGORIES.HIGH_RISK: return 'CRITICAL';
      case ALERT_CATEGORIES.UNSURE: return 'MEDIUM';
      case ALERT_CATEGORIES.NORMAL: return 'LOW';
      default: return 'MEDIUM';
    }
  }
}

function buildTextReportFromMedia(incident) {
  if (incident.type === 'voice') {
    if (incident.transcription) {
      return incident.transcription;
    }
    if (incident.mediaSource) {
      return `Voice input from ${incident.mediaSource} indicates a potential emergency at ${incident.location || 'the reported location'}.`;
    }
    return incident.description || 'Voice input indicates an unspecified emergency requiring rapid review.';
  }

  if (incident.type === 'cctv') {
    if (incident.mediaSource) {
      const emotionDetails = incident.face_expressions ? ` Emotion signals: ${incident.face_expressions}.` : '';
      return `Live CCTV feed at ${incident.mediaSource} shows suspicious activity or a possible emergency near ${incident.location || 'the monitored area'}.${emotionDetails}`;
    }
    return incident.description || 'Live CCTV footage indicates a potential emergency.';
  }

  if (incident.type === 'image') {
    if (incident.mediaSource) {
      return `Live image snapshot from ${incident.mediaSource} suggests an urgent situation at ${incident.location || 'the monitored area'}.`;
    }
    return incident.description || 'Image snapshot suggests a potential emergency.';
  }

  return incident.description || 'Reported emergency requires assessment.';
}

function saveFrameAndGenerateReport(incident, aiResponse, decisionResult) {
  try {
    const timestamp = Date.now();
    const reportId = `REPORT_${timestamp}`;
    
    // Save frame if provided
    let frameFilename = null;
    if (incident.frame_base64) {
      frameFilename = `${reportId}_frame.jpg`;
      const framePath = path.join(reportsDir, frameFilename);
      const buffer = Buffer.from(incident.frame_base64, 'base64');
      fs.writeFileSync(framePath, buffer);
    }
    
    // Generate incident report
    const report = {
      reportId,
      timestamp: new Date().toISOString(),
      incident: {
        type: incident.type,
        description: incident.description,
        location: incident.location,
        severity: incident.severity,
        mediaSource: incident.mediaSource,
        face_count: incident.face_count,
        face_expressions: incident.face_expressions,
        emotion_level: incident.emotion_level,
        motion_percentage: incident.motion_percentage
      },
      aiAnalysis: {
        classification: decisionResult.classification,
        confidence: aiResponse.confidence || 'N/A',
        alert_message: aiResponse.alert_message,
        reasoning: aiResponse.reasoning || 'Motion detected by OpenCV service'
      },
      resources: {
        needed: decisionResult.resources,
        priority: decisionResult.priority
      },
      routing: decisionResult.routing,
      alerts: decisionResult.alerts,
      mediaFiles: frameFilename ? [frameFilename] : []
    };
    
    // Save report as JSON
    const reportPath = path.join(reportsDir, `${reportId}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`📋 Report generated: ${reportId}`);
    return report;
  } catch (error) {
    console.error('Error generating report:', error);
    return null;
  }
}

// Decision Engine Components
class PriorityEngine {
  static determinePriority(incident, classification) {
    // Priority based on AI classification
    const priorityMap = {
      [ALERT_CATEGORIES.HIGH_RISK]: 1,
      [ALERT_CATEGORIES.UNSURE]: 2,
      [ALERT_CATEGORIES.NORMAL]: 3
    };
    return priorityMap[classification] || 2;
  }
}

class RoutingSystem {
  static async calculateRoute(incident, classification) {
    try {
      // Block roads only for high-risk incidents
      if (classification === ALERT_CATEGORIES.HIGH_RISK) {
        await updateRoadStatus(incident.location, 'BLOCKED');
      }

      const safePath = await findSafePath('Central_Hub', incident.location);
      return {
        originalRoute: `Central_Hub -> ${incident.location}`,
        alternativeRoute: safePath,
        estimatedTime: classification === ALERT_CATEGORIES.HIGH_RISK ? 'Emergency routing activated' : '15 minutes',
        roadStatus: classification === ALERT_CATEGORIES.HIGH_RISK ? 'BLOCKED' : 'CLEAR'
      };
    } catch (error) {
      console.error('Routing error:', error);
      return {
        originalRoute: `Central_Hub -> ${incident.location}`,
        alternativeRoute: 'Routing system offline - manual coordination required',
        estimatedTime: 'Unknown',
        roadStatus: 'UNKNOWN'
      };
    }
  }
}

class ResourceSuggestion {
  static suggestResources(classification, aiResources) {
    // Use AI-recommended resources, with fallbacks based on classification
    if (aiResources && aiResources.length > 0) {
      return aiResources;
    }

    const fallbackResources = {
      [ALERT_CATEGORIES.HIGH_RISK]: ['Fire Trucks', 'Ambulances', 'Police Units', 'Medical Teams', 'Emergency Response Team'],
      [ALERT_CATEGORIES.UNSURE]: ['Police Units', 'Basic Response Team'],
      [ALERT_CATEGORIES.NORMAL]: ['Basic Response Team']
    };
    return fallbackResources[classification] || ['Basic Response Team'];
  }
}

// Initialize road network simulation (no database required)
initializeRoadNetwork();

// API Routes
app.post('/api/incident', async (req, res) => {
  try {
    const incident = req.body;
    const textReport = buildTextReportFromMedia(incident);
    const enrichedIncident = {
      ...incident,
      description: textReport,
      transcribed_report: incident.transcription || textReport
    };

    // Step 1: AI Analysis with classification
    const aiResponse = await analyzeIncident(enrichedIncident);
    const classification = aiResponse.classification;

    // Step 2: Decision Engine processes AI response
    const priority = PriorityEngine.determinePriority(enrichedIncident, classification);
    const routing = await RoutingSystem.calculateRoute(enrichedIncident, classification);
    const resources = ResourceSuggestion.suggestResources(classification, aiResponse.resources_needed);

    // Step 3: Send automated alerts
    const alertResult = AlertSystem.sendAlert(classification, enrichedIncident, aiResponse);
    alertResult.serviceAlerts.forEach((alert) => io.emit('ALERT_SENT', alert));

    const decisionResult = {
      incident: enrichedIncident,
      aiResponse,
      classification,
      priority,
      routing,
      resources,
      alerts: alertResult.serviceAlerts,
      timestamp: new Date().toISOString(),
      face_count: enrichedIncident.face_count,
      face_expressions: enrichedIncident.face_expressions,
      emotion_level: enrichedIncident.emotion_level,
      motion_percentage: enrichedIncident.motion_percentage
    };

    // Step 4: Store in Real-Time Event Store
    eventStore.push(decisionResult);

    // Step 5: Generate and save incident report with frame image
    const report = saveFrameAndGenerateReport(incident, aiResponse, decisionResult);
    if (report) {
      decisionResult.report = report;
    }

    // Step 6: Emit to Live Dashboard
    io.emit('INCIDENT_PROCESSED', decisionResult);

    res.json(decisionResult);
  } catch (error) {
    console.error('Error processing incident:', error);
    res.status(500).json({ error: 'Failed to process incident' });
  }
});

app.get('/api/events', (req, res) => {
  res.json(eventStore.slice(-10)); // Return last 10 events
});

app.get('/api/reports', (req, res) => {
  try {
    const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));
    const reports = files
      .sort((a, b) => b.localeCompare(a)) // Most recent first
      .slice(0, 20) // Last 20 reports
      .map(file => {
        const filePath = path.join(reportsDir, file);
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      });
    res.json(reports);
  } catch (error) {
    console.error('Error reading reports:', error);
    res.status(500).json({ error: 'Failed to read reports' });
  }
});

app.get('/api/reports/:reportId/frame', (req, res) => {
  try {
    const { reportId } = req.params;
    const frameFile = `${reportId}_frame.jpg`;
    const framePath = path.join(reportsDir, frameFile);
    
    if (fs.existsSync(framePath)) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.sendFile(framePath);
    } else {
      res.status(404).json({ error: 'Frame not found' });
    }
  } catch (error) {
    console.error('Error retrieving frame:', error);
    res.status(500).json({ error: 'Failed to retrieve frame' });
  }
});

// Socket.IO handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle different input sources
  socket.on('REPORT_INCIDENT', async (incident) => {
    try {
      const textReport = buildTextReportFromMedia(incident);
      const enrichedIncident = {
        ...incident,
        description: textReport,
        transcribed_report: incident.transcription || textReport
      };

      // Process through the enhanced pipeline
      const aiResponse = await analyzeIncident(enrichedIncident);
      const classification = aiResponse.classification;
      const priority = PriorityEngine.determinePriority(enrichedIncident, classification);
      const routing = await RoutingSystem.calculateRoute(enrichedIncident, classification);
      const resources = ResourceSuggestion.suggestResources(classification, aiResponse.resources_needed);

      const alertResult = AlertSystem.sendAlert(classification, enrichedIncident, aiResponse);
      alertResult.serviceAlerts.forEach((alert) => io.emit('ALERT_SENT', alert));

      const result = {
        incident: enrichedIncident,
        aiResponse,
        classification,
        priority,
        routing,
        resources,
        alerts: alertResult.serviceAlerts,
        timestamp: new Date().toISOString()
      };

      eventStore.push(result);
      io.emit('INCIDENT_PROCESSED', result);
    } catch (error) {
      console.error('Incident processing error:', error);
      socket.emit('ERROR', { message: 'Failed to process incident' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚨 AI Emergency Response System running on port ${PORT}`);
  console.log('📡 Multi-source input analysis enabled');
  console.log('🚨 Automated alert system active');
});
