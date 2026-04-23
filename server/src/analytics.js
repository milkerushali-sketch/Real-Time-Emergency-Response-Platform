const locationBuckets = new Map();
const analyticsIncidents = [];

function buildCoordinates(location = 'Unknown') {
  const normalized = String(location).trim().toLowerCase() || 'unknown';
  let hash = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) % 1000000;
  }

  const lat = 12 + ((hash % 1700) / 100);
  const lng = 72 + (((Math.floor(hash / 1700)) % 1700) / 100);

  return {
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4))
  };
}

function buildBucketKey(coords) {
  return `${coords.lat.toFixed(1)},${coords.lng.toFixed(1)}`;
}

function trackResponseTime(incident) {
  const createdAt = new Date(incident.detectedAt || incident.timestamp || Date.now()).getTime();
  const dispatchedAt = new Date(incident.dispatchedAt || Date.now()).getTime();
  return Math.max(0, Math.round((dispatchedAt - createdAt) / 1000));
}

function analyzeFalsePositives() {
  const total = analyticsIncidents.length;
  const falsePositiveCount = analyticsIncidents.filter(
    (incident) => incident.classification === 'normal' || incident.analyticsFlags?.possibleFalsePositive
  ).length;

  return {
    total,
    falsePositives: falsePositiveCount,
    falsePositiveRate: total ? Number(((falsePositiveCount / total) * 100).toFixed(1)) : 0
  };
}

function ingestIncident(incident) {
  const coords = incident.mapCoordinates || buildCoordinates(incident.incident?.location || incident.location);
  const responseTimeSeconds = trackResponseTime(incident);
  const bucketKey = buildBucketKey(coords);
  const existingBucket = locationBuckets.get(bucketKey) || {
    lat: Number(coords.lat.toFixed(1)),
    lng: Number(coords.lng.toFixed(1)),
    intensity: 0,
    incidents: 0
  };

  existingBucket.intensity += incident.priority === 1 ? 4 : incident.priority === 2 ? 2 : 1;
  existingBucket.incidents += 1;
  locationBuckets.set(bucketKey, existingBucket);

  analyticsIncidents.unshift({
    id: incident.id,
    classification: incident.classification,
    coords,
    responseTimeSeconds,
    timestamp: incident.timestamp,
    analyticsFlags: incident.analyticsFlags
  });

  if (analyticsIncidents.length > 250) {
    analyticsIncidents.length = 250;
  }

  return getAnalyticsSnapshot();
}

function generateHeatmap() {
  return Array.from(locationBuckets.values())
    .sort((left, right) => right.intensity - left.intensity)
    .slice(0, 20);
}

function buildResponseTimeline() {
  return analyticsIncidents
    .slice(0, 12)
    .reverse()
    .map((incident) => ({
      id: incident.id,
      timestamp: incident.timestamp,
      responseTimeSeconds: incident.responseTimeSeconds,
      classification: incident.classification
    }));
}

function getIncidentMap() {
  return analyticsIncidents.slice(0, 25).map((incident) => ({
    id: incident.id,
    lat: incident.coords.lat,
    lng: incident.coords.lng,
    classification: incident.classification,
    timestamp: incident.timestamp
  }));
}

function getAnalyticsSnapshot() {
  const responseTimeline = buildResponseTimeline();
  const responseAverage = responseTimeline.length
    ? Math.round(
        responseTimeline.reduce((sum, item) => sum + item.responseTimeSeconds, 0) / responseTimeline.length
      )
    : 0;

  return {
    incidentHeatmap: generateHeatmap(),
    responseTimeTracking: {
      averageSeconds: responseAverage,
      timeline: responseTimeline
    },
    falsePositiveAnalysis: analyzeFalsePositives(),
    totals: {
      incidents: analyticsIncidents.length,
      critical: analyticsIncidents.filter((incident) => incident.classification === 'high_risk').length
    }
  };
}

module.exports = {
  buildCoordinates,
  generateHeatmap,
  getAnalyticsSnapshot,
  getIncidentMap,
  ingestIncident,
  trackResponseTime,
  analyzeFalsePositives
};
