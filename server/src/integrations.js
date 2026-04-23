const twilio = require('twilio');
const axios = require('axios');

function getSmsClient() {
  if (!process.env.TWILIO_SID || !process.env.TWILIO_TOKEN) {
    return null;
  }

  return twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
}

function getEmailTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null;
  }

  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const nodemailer = require('nodemailer');
    return nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  } catch (error) {
    console.warn('Nodemailer unavailable:', error.message || error);
    return null;
  }
}

async function sendSMS(to, message) {
  const client = getSmsClient();
  if (!client || !to || !process.env.TWILIO_FROM) {
    return {
      channel: 'sms',
      delivered: false,
      provider: 'twilio',
      reason: 'SMS integration not configured'
    };
  }

  try {
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_FROM,
      to
    });

    return {
      channel: 'sms',
      delivered: true,
      provider: 'twilio',
      id: result.sid
    };
  } catch (error) {
    return {
      channel: 'sms',
      delivered: false,
      provider: 'twilio',
      reason: error.message || 'SMS delivery failed'
    };
  }
}

async function sendEmail(to, subject, text) {
  const transporter = getEmailTransporter();
  if (!transporter || !to) {
    return {
      channel: 'email',
      delivered: false,
      provider: 'smtp',
      reason: 'Email integration not configured'
    };
  }

  try {
    const result = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text
    });

    return {
      channel: 'email',
      delivered: true,
      provider: 'smtp',
      id: result.messageId
    };
  } catch (error) {
    return {
      channel: 'email',
      delivered: false,
      provider: 'smtp',
      reason: error.message || 'Email delivery failed'
    };
  }
}

async function callCAD(incident) {
  if (!process.env.CAD_API_URL) {
    return {
      provider: 'cad',
      delivered: false,
      reason: 'CAD API not configured'
    };
  }

  try {
    const response = await axios.post(
      process.env.CAD_API_URL,
      incident,
      process.env.CAD_API_KEY
        ? {
            headers: {
              Authorization: `Bearer ${process.env.CAD_API_KEY}`
            }
          }
        : undefined
    );

    return {
      provider: 'cad',
      delivered: true,
      status: response.status
    };
  } catch (error) {
    return {
      provider: 'cad',
      delivered: false,
      reason: error.message || 'CAD dispatch failed'
    };
  }
}

async function sendIntegratedAlerts(incident, aiResponse, serviceAlerts = []) {
  const alertText = aiResponse.alert_message || `${incident.description} at ${incident.location}`;
  const [smsResult, emailResult, cadResult] = await Promise.all([
    sendSMS(process.env.SMS_TO, alertText),
    sendEmail(process.env.ALERT_EMAIL_TO, 'Emergency Incident Alert', alertText),
    callCAD({
      incidentId: incident.id,
      location: incident.location,
      classification: aiResponse.classification,
      resources: aiResponse.resources_needed,
      summary: aiResponse.analysis_summary
    })
  ]);

  return {
    serviceAlerts,
    deliveries: [smsResult, emailResult, cadResult]
  };
}

module.exports = {
  sendSMS,
  sendEmail,
  callCAD,
  sendIntegratedAlerts
};
