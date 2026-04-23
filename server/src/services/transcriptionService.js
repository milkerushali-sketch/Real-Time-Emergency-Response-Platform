function estimateSentiment(text) {
  const source = String(text || '').toLowerCase();
  const urgentWords = ['help', 'fire', 'smoke', 'gun', 'crash', 'scream', 'urgent', 'panic', 'bleeding'];
  const stressedHits = urgentWords.reduce((count, word) => count + (source.includes(word) ? 1 : 0), 0);
  const urgencyScore = Math.min(100, 25 + stressedHits * 15);

  return {
    stressLevel: stressedHits >= 3 ? 'HIGH' : stressedHits >= 1 ? 'MEDIUM' : 'LOW',
    urgencyScore,
    keywords: urgentWords.filter((word) => source.includes(word))
  };
}

async function transcribeWithGoogleCloud(incident) {
  try {
    // Optional dependency: keep the integration live when installed, without making the app crash when absent.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const speech = require('@google-cloud/speech');
    const client = new speech.SpeechClient();

    if (!incident.audioBase64) {
      return null;
    }

    const [response] = await client.recognize({
      audio: {
        content: incident.audioBase64
      },
      config: {
        encoding: 'WEBM_OPUS',
        languageCode: process.env.GOOGLE_SPEECH_LANGUAGE || 'en-US',
        enableAutomaticPunctuation: true
      }
    });

    const transcript = response.results?.map((result) => result.alternatives?.[0]?.transcript || '').join(' ').trim();
    return transcript || null;
  } catch (error) {
    console.warn('Google Cloud Speech unavailable:', error.message || error);
    return null;
  }
}

async function transcribeAudioIncident(incident) {
  const provider = process.env.GOOGLE_CLOUD_PROJECT ? 'google-cloud-speech' : 'fallback';
  const transcript =
    incident.transcription ||
    incident.liveTranscript ||
    (await transcribeWithGoogleCloud(incident)) ||
    incident.description ||
    'Voice incident received. Awaiting operator confirmation.';

  return {
    provider,
    transcript,
    voiceAnalysis: estimateSentiment(transcript)
  };
}

module.exports = {
  transcribeAudioIncident
};
