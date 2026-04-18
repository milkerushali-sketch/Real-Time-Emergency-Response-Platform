# AI Emergency Response System

A real-time AI-powered emergency coordination system that processes incidents through a structured pipeline from user input to resource allocation.

## Architecture

```
[ Frontend (React Dashboard) ]
            |
            |  (user input: text / voice / simulation)
            v
[ Backend API (Node.js / Express) ]
            |
            |  sends prompt
            v
[ AI Layer (Gemini API) ]
            |
            |  returns structured JSON
            v
[ Decision Engine (Node.js) ]
   |         |            |
   |         |            |
   v         v            v
Priority   Routing     Resource
Engine     System      Suggestion
   |
   v
[ Real-Time Event Store ]
            |
            v
[ Live Dashboard Update (React UI) ]
```

## Features

- Real-time Incident Processing: Submit emergency reports via text input or simulation
- AI-Powered Analysis: Google Gemini AI analyzes incidents and provides structured responses
- Decision Engine: Automatically determines priority levels, routing adjustments, and resource allocation
- Simplified Routing: Basic routing logic for emergency vehicle coordination
- Live Dashboard: Real-time updates showing the complete processing pipeline
- Event Storage: In-memory event store for tracking incident history

## Quick Start

1. Start the System:
   ```bash
   cd ai-emergency-system
   docker-compose up --build
   ```

2. Access the Dashboard:
   - Frontend: http://localhost:3000

3. Test the System:
   - Use the text input to describe an emergency
   - Or click "Simulate Critical Emergency" for a demo incident
   - Watch the real-time processing pipeline in action

## API Endpoints

- `POST /api/incident` - Process a new emergency incident
- `GET /api/events` - Retrieve recent incident history

## Components

### Frontend (React)
- Real-time dashboard with Socket.IO integration
- Incident reporting interface
- Live pipeline visualization

### Backend (Node.js/Express)
- RESTful API for incident processing
- WebSocket support for real-time updates
- Decision engine with priority, routing, and resource components

### AI Layer (Google Gemini)
- Natural language processing of emergency descriptions
- Structured JSON output for logistics planning
- Risk assessment and response time estimation

### Routing System
- Simplified routing logic for emergency coordination
- Basic path optimization without graph database
- Emergency protocol activation for critical incidents

## Example Incident Flow

1. User Input: "Major chemical spill at Industrial Zone"
2. AI Analysis: Determines rerouting needed, required supplies, target hospital
3. Decision Engine:
   - Priority: 1 (Critical)
   - Routing: Block affected roads, find alternative paths
   - Resources: Hazmat Team, Fire Trucks, Medical Units
4. Live Update: Dashboard shows complete processing result

## Development

The system is containerized with Docker for easy deployment. All components communicate via:
- HTTP APIs for incident processing
- WebSockets for real-time updates