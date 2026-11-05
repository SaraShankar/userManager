const axios = require('axios');
const { askFaqAssistant } = require('./faqRagService');
const { sendTelegramAdminAlert } = require('./telegramService');

const RAW_ADMIN_PHONE = process.env.ADMIN_PHONE_NUMBER || '447943611154';
const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.PUBLIC_URL ||
  'https://usermanager-production-a71a.up.railway.app';

/**
 * Sanitizes phone numbers to standard E.164 digits format (without '+')
 */
const cleanPhoneNumber = (phone) => {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
};

const ADMIN_FORWARD_PHONE = cleanPhoneNumber(RAW_ADMIN_PHONE);

/**
 * Core helper to dispatch HTTP requests to Meta Graph API
 */
const sendMetaRequest = async (payload) => {
  const token =
    process.env.META_WA_ACCESS_TOKEN ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.WHATSAPP_TOKEN;
  const phoneAccountId =
    process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_WA_PHONE_NUMBER_ID;

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
 * Sends a standard 2-way text message for direct replies
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

// Alias sendWhatsAppMessage directly to sendTextMessage for backwards compatibility
const sendWhatsAppMessage = sendTextMessage;

/**
 * Automated RAG responder:
 * - High-confidence FAQ match (score >= 0.60): Replies directly to parent.
 * - Low-confidence / Unmatched: Dispatches holding text to parent and notifies admin via Telegram.
 */
const handleAutomatedFaqReply = async (
  recipientPhone,
  incomingText,
  minConfidenceScore = 0.60,
  userContext = {}
) => {
  try {
    const cleanParentPhone = cleanPhoneNumber(recipientPhone);

    if (!incomingText || incomingText.trim().length < 2) {
      return { handled: false, reason: 'Inquiry too short or empty' };
    }

    const resolvedContext = typeof userContext === 'string'
      ? { name: userContext, phone: cleanParentPhone }
      : {
          name: userContext?.name || 'Parent',
          phone: userContext?.phone || cleanParentPhone
        };

    const resolvedParentName = resolvedContext.name !== 'Parent' ? resolvedContext.name : '';

    // 1. Query askFaqAssistant directly
    const ragResult = await askFaqAssistant(incomingText, {
      phone: cleanParentPhone,
      name: resolvedParentName
    });

    const { tier, answer, score, matchedFaqId } = ragResult;
    console.log(`🔍 [RAG Auto-Check] FAQ: ${matchedFaqId || 'none'} | Tier: ${tier} | Score: ${score?.toFixed(4) || 'N/A'}`);

    // 2. High or Borderline confidence match (tier HIGH or MEDIUM with answer)
    if ((tier === 'HIGH' || tier === 'MEDIUM') && answer) {
      const metaRes = await sendTextMessage(cleanParentPhone, answer, true);

      return {
        handled: true,
        type: 'faq_match',
        answer,
        score,
        tier,
        matchedFaqId,
        wamid: metaRes?.messages?.[0]?.id,
        metaResponse: metaRes
      };
    }

    // 3. Fallback Path: Low confidence
    console.log(`⚠️ Low confidence score (${score?.toFixed(4) || 0}). Initiating Telegram admin escalation...`);

    let personalizedAssessmentUrl = `${APP_BASE_URL}/assessment/?phone=${cleanParentPhone}`;
    if (resolvedParentName) {
      personalizedAssessmentUrl += `&name=${encodeURIComponent(resolvedParentName)}`;
    }

    const parentHoldingText =
      `Thank you for reaching out! Our team has received your specific inquiry, and Dr. Geetha will personally get back to you shortly.\n\n` +
      `In the meantime, you can explore our free online assessment or reserve a free trial session directly at your preferred time:\n` +
      `👉 Assessment: ${personalizedAssessmentUrl}\n` +
      `👉 Book Trial: https://cal.com/abacusforkids/abacus-trial-session`;

    const parentMetaRes = await sendTextMessage(cleanParentPhone, parentHoldingText, true);

    const telegramAlertHtml =
      `🚨 <b>New WhatsApp Parent Query (Escalation)</b>\n\n` +
      `👤 <b>Parent Name:</b> ${resolvedContext.name}\n` +
      `📞 <b>Parent Phone:</b> +${cleanParentPhone}\n` +
      `🎯 <b>Top Score:</b> ${score ? score.toFixed(3) : 'N/A'} (Threshold: ${minConfidenceScore})\n` +
      `💬 <b>Question:</b>\n"<i>${incomingText}</i>"\n\n` +
      `👉 <a href="https://wa.me/${cleanParentPhone}"><b>Reply on WhatsApp</b></a>`;

    const telegramRes = await sendTelegramAdminAlert(telegramAlertHtml);

    let adminWamid = null;
    try {
      const adminMetaRes = await sendTextMessage(ADMIN_FORWARD_PHONE, telegramAlertHtml.replace(/<[^>]*>/g, ''), false);
      adminWamid = adminMetaRes?.messages?.[0]?.id;
    } catch (_) {
      // Swallowed silently
    }

    return {
      handled: true,
      type: 'forwarded_to_admin',
      answer: parentHoldingText,
      adminAlertText: telegramAlertHtml,
      score,
      parentWamid: parentMetaRes?.messages?.[0]?.id,
      adminWamid,
      telegramDelivered: Boolean(telegramRes?.ok)
    };
  } catch (error) {
    console.error('❌ Automated FAQ reply failed:', error.message);
    return { handled: false, error: error.message };
  }
};

module.exports = {
  sendTemplateMessage,
  sendTextMessage,
  sendWhatsAppMessage, // Exported explicitly to eliminate the TypeError in webhookController
  handleAutomatedFaqReply,
  cleanPhoneNumber
};