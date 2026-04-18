const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.getLogisticsPlan = async (incident) => {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  const prompt = `System: City Emergency AI.
    Event: ${incident.description} at ${incident.location}.
    Task: Output JSON for logistics.
    Schema: { "reroute": boolean, "supplies": string[], "target_hospital": string }`;

  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
};