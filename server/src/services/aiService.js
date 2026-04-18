const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Classification categories
const ALERT_CATEGORIES = {
  NORMAL: 'normal',
  UNSURE: 'not_sure',
  HIGH_RISK: 'high_risk'
};

async function analyzeIncident(incident) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });

    // Enhanced prompt for multi-source analysis and classification
    const prompt = `You are an advanced AI emergency response coordinator. Analyze this incident from multiple sources and provide a comprehensive response.

Incident Details:
- Description: ${incident.description}
- Location: ${incident.location}
- Severity: ${incident.severity}
- Source: ${incident.source || incident.type || 'text'} (can be: cctv, voice, image, text)
- Media Type: ${incident.mediaType || 'none'}
- Media Source: ${incident.mediaSource || 'none'}
- Motion Percentage: ${incident.motion_percentage ?? 'N/A'}
- Face Count: ${incident.face_count ?? '0'}
- Detected Emotions: ${incident.face_expressions || 'none'}
- Emotion Level: ${incident.emotion_level || 'LOW'}
- Transcribed Report: ${incident.transcribed_report || 'N/A'}

First, classify the incident into ONE of these categories:
- "normal": Routine situations, minor issues, no immediate danger
- "not_sure": Unclear situations, potential issues, needs human verification
- "high_risk": Immediate danger, life-threatening, requires urgent response

Then provide a structured JSON response with the following structure:
{
  "classification": "normal|not_sure|high_risk",
  "confidence_score": number (0-100),
  "analysis_summary": "brief explanation of classification",
  "immediate_actions": ["action1", "action2"],
  "resources_needed": ["Fire Trucks", "Ambulances", "Police Units", "Medical Teams"],
  "estimated_response_time": "time estimate",
  "risk_assessment": "detailed risk analysis",
  "alert_message": "message to send to emergency services",
  "follow_up_required": boolean
}

Respond only with valid JSON, no additional text.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Clean the response to ensure it's valid JSON
    const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
    const aiResponse = JSON.parse(cleanedText);

    // Validate classification
    if (!Object.values(ALERT_CATEGORIES).includes(aiResponse.classification)) {
      aiResponse.classification = ALERT_CATEGORIES.UNSURE;
    }

    return aiResponse;
  } catch (error) {
    console.error('AI Service Error:', error);
    // Return fallback response
    return {
      classification: ALERT_CATEGORIES.UNSURE,
      confidence_score: 50,
      analysis_summary: "Analysis failed - requires human review",
      immediate_actions: ["Manual assessment required"],
      resources_needed: ["Basic Response Team"],
      estimated_response_time: "TBD",
      risk_assessment: "Unable to determine risk level",
      alert_message: "Incident requires manual verification",
      follow_up_required: true
    };
  }
}

module.exports = { analyzeIncident, ALERT_CATEGORIES };