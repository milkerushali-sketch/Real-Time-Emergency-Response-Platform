const { buildCoordinates } = require('../analytics');

function buildDeploymentTracking(resources = [], incident, priority) {
  const baseTime = Date.now();

  return resources.map((resource, index) => ({
    id: `${incident.location || 'LOC'}_${resource}_${index}`.replace(/\s+/g, '_'),
    resource,
    status: index === 0 ? 'EN_ROUTE' : index === 1 ? 'STAGING' : 'DISPATCHED',
    team: `${resource} Team ${index + 1}`,
    etaMinutes: Math.max(2, priority * 3 + index * 2),
    destination: incident.location,
    lastUpdated: new Date(baseTime + index * 15000).toISOString()
  }));
}

function buildMapData(incident, classification) {
  const coords = buildCoordinates(incident.location);
  return {
    coordinates: coords,
    mapIntegration: {
      provider: 'OpenStreetMap-compatible',
      incidentLocation: coords,
      label: incident.location,
      navigationUrl: `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=13/${coords.lat}/${coords.lng}`
    },
    mapMarker: {
      id: `${incident.location || 'incident'}-${Date.now()}`,
      severity: classification,
      ...coords
    }
  };
}

function buildDashboardSnapshot({ events, analytics, alerts, deployments }) {
  return {
    activeIncidents: events.slice(0, 10),
    analytics,
    recentAlerts: alerts.slice(0, 12),
    deployments: deployments.slice(0, 12)
  };
}

module.exports = {
  buildDeploymentTracking,
  buildDashboardSnapshot,
  buildMapData
};
