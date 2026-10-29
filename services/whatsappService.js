const axios = require('axios');
const { askFaqAssistant } = require('./faqRagService');

const ADMIN_FORWARD_PHONE = process.env.ADMIN_PHONE_NUMBER || '447943611154';

/**
 * Core helper to dispatch HTTP requests to Meta Graph API
 */
const sendMetaRequest = async (payload) => {
  const token = process.env.META_WA_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
  const phoneAccountId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_WA_PHONE_NUMBER_ID;

  if (!token || !phoneAccountId) {
    throw new Error('Meta API Access Token or Phone Number ID is missing in environment variables.');
  }

  const url = `https://graph.facebook.com/v21.0/${phoneAccountId}/messages`;

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    const metaError = error.response?.data?.error;
    const errorMessage = metaError?.message || error.message;
    const errorCode = metaError?.code ? `(#${metaError.code}) ` : '';

    console.error('❌ Meta Graph API Request Failed:', {
      status: error.response?.status,
      error: metaError || error.message,
      to: payload.to,
      type: payload.type
    });

    throw new Error(`${errorCode}${errorMessage}`);
  }
};

/**
 * Sanitizes phone numbers to standard E.164 digits format (without '+')
 */
const cleanPhoneNumber = (phone) => {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
};

/**
 * Normalizes template parameters into Meta's expected array format
 */
const formatBodyParameters = (parameters, fallback = 'Parent') => {
  const paramsArray = Array.isArray(parameters) ? parameters : [parameters].filter(Boolean);

  if (paramsArray.length === 0) {
    return [{ type: 'text', text: String(fallback) }];
  }

  return paramsArray.map((param) => ({
    type: 'text',
    text: String(typeof param === 'object' && param !== null ? param.text || fallback : param)
  }));
};

/**
 * Sends a WhatsApp Meta API template message
 */
const sendTemplateMessage = async ({
  recipientPhone,
  templateName = 'broadcast_notice',
  mediaUrl,
  mediaType = 'document',
  fileName,
  parameters = [],
  languageCode = 'en'
}) => {
  const cleanPhone = cleanPhoneNumber(recipientPhone);

  const isSingleParamTemplate =
    templateName === 'broadcast_notice' ||
    templateName === '3p_direct_integration_test_template';

  const isHelloWorld = templateName === 'hello_world';
  const targetLanguage = templateName === 'broadcast_notice' ? 'en' : (languageCode || 'en');

  const payload = {
    messaging_product: 'whatsapp',
    to: cleanPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: targetLanguage }
    }
  };

  const components = [];

  // 1. Header Component (Media Attachment)
  if (mediaUrl) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: mediaType,
          [mediaType]: {
            link: mediaUrl,
            ...(fileName && mediaType === 'document' ? { filename: fileName } : {})
          }
        }
      ]
    });
  }

  // 2. Body Component (Dynamic Text Placeholders)
  if (!isHelloWorld) {
    if (isSingleParamTemplate) {
      const paramVal = (Array.isArray(parameters) && parameters[0]) || 'Parent';
      components.push({
        type: 'body',
        parameters: [{ type: 'text', text: String(paramVal) }]
      });
    } else if (Array.isArray(parameters) && parameters.length > 0) {
      components.push({
        type: 'body',
        parameters: formatBodyParameters(parameters)
      });
    }
  }

  if (components.length > 0) {
    payload.template.components = components;
  }

  return await sendMetaRequest(payload);
};

/**
 * Sends a standard 2-way text message for Inbox replies
 */
const sendTextMessage = async (recipientPhone, textBody, previewUrl = false) => {
  const cleanPhone = cleanPhoneNumber(recipientPhone);
  const textContent = String(textBody || '').trim();

  if (!textContent) {
    throw new Error('Message text body cannot be empty.');
  }

  const safeText = textContent.length > 4096 ? `${textContent.slice(0, 4090)}...` : textContent;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone,
    type: 'text',
    text: {
      preview_url: Boolean(previewUrl),
      body: safeText
    }
  };

  return await sendMetaRequest(payload);
};

/**
 * Automated RAG responder:
 * - High-confidence FAQ match: Replies to the parent via AI.
 * - Low-confidence / Unmatched: Sends a holding message to the parent and forwards lead details to your personal WhatsApp.
 *
 * @param {string} recipientPhone The sender's phone number
 * @param {string} incomingText The inbound inquiry from the parent
 * @param {number} minConfidenceScore Minimum cosine similarity score required (default: 0.70)
 * @param {string} senderName Optional parent name
 */
const handleAutomatedFaqReply = async (
  recipientPhone,
  incomingText,
  minConfidenceScore = 0.70,
  senderName = 'Parent'
) => {
  try {
    const cleanParentPhone = cleanPhoneNumber(recipientPhone);

    if (!incomingText || incomingText.trim().length < 3) {
      return { handled: false, reason: 'Inquiry too short or empty' };
    }

    // 1. Query Vector Search via your existing service
    const ragResult = await askFaqAssistant(incomingText);
    const topMatch = ragResult.matchedFaqs?.[0];
    const topScore = topMatch?.score || 0;

    console.log(`🔍 [RAG Auto-Check] Top match: ${topMatch?.id || 'none'} | Score: ${topScore.toFixed(4)}`);

    // 2. High-Confidence Path: FAQ match found (score >= minConfidenceScore)
    if (topScore >= minConfidenceScore && ragResult.answer) {
      const metaRes = await sendTextMessage(cleanParentPhone, ragResult.answer, true);

      return {
        handled: true,
        type: 'faq_match',
        answer: ragResult.answer,
        score: topScore,
        matchedFaqId: topMatch.id,
        wamid: metaRes?.messages?.[0]?.id,
        metaResponse: metaRes
      };
    }

    // 3. Fallback Path: Score < 0.70 (Forward to your personal number + send holding note)
    console.log(`⚠️ Low confidence score (${topScore.toFixed(4)}). Initiating fallback to admin...`);

    const parentHoldingText =
      `Thank you for reaching out! Our team has received your specific inquiry, and Dr. Geetha will personally get back to you shortly.\n\n` +
      `In the meantime, you can explore our free online assessment or reserve a free trial session directly at your preferred time:\n` +
      `👉 Assessment: https://eynko-server-production.up.railway.app/assessment/\n` +
      `👉 Book Trial: https://cal.com/abacusforkids/abacus-trial-session`;

    const parentMetaRes = await sendTextMessage(cleanParentPhone, parentHoldingText, true);

    const adminAlertText =
      `🚨 *New WhatsApp Parent Query (Escalation)*\n\n` +
      `*Parent Name:* ${senderName}\n` +
      `*Parent Phone:* +${cleanParentPhone}\n` +
      `*Top Match Score:* ${topScore.toFixed(3)} (Threshold: ${minConfidenceScore})\n` +
      `*Question:* "${incomingText}"\n\n` +
      `👉 Direct Reply Link: https://wa.me/${cleanParentPhone}`;

    const adminMetaRes = await sendTextMessage(ADMIN_FORWARD_PHONE, adminAlertText, false);

    return {
      handled: true,
      type: 'forwarded_to_admin',
      answer: parentHoldingText,
      adminAlertText,
      score: topScore,
      parentWamid: parentMetaRes?.messages?.[0]?.id,
      adminWamid: adminMetaRes?.messages?.[0]?.id
    };
  } catch (error) {
    console.error('❌ Automated FAQ reply failed:', error.message);
    return { handled: false, error: error.message };
  }
};

module.exports = {
  sendTemplateMessage,
  sendTextMessage,
  handleAutomatedFaqReply,
  cleanPhoneNumber
};