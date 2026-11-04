// controllers/faqController.js
const { askFaqAssistant } = require('../services/faqRagService');
const { sendTelegramAdminAlert } = require('../services/telegramService');

// Helper to escape HTML characters so user input doesn't break Telegram HTML parsing
const escapeHtml = (text = '') => {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

exports.handleFaqQuery = async (req, res) => {
  try {
    const { question, userContext, phone, name } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'A valid question string is required.' 
      });
    }

    // Support either nested userContext or flat phone/name in req.body
    const context = userContext || { phone, name };

    const result = await askFaqAssistant(question, context);

    if (result.tier === 'LOW') {
      const rawPhone = context.phone ? String(context.phone) : '';
      const cleanPhone = rawPhone.replace(/\D/g, '');
      const visitorName = escapeHtml(context.name || 'Anonymous Visitor');
      const safeQuestion = escapeHtml(question);

      const replyAction = cleanPhone
        ? `👉 <a href="https://wa.me/${cleanPhone}"><b>Reply to Parent on WhatsApp</b></a>\n👉 Direct App Link: whatsapp://send?phone=${cleanPhone}`
        : `<i>No phone number provided by web visitor</i>`;

      const telegramAlertHtml =
        `🌐 <b>New Website FAQ Inquiry (Low Confidence Escalation)</b>\n\n` +
        `👤 <b>Visitor:</b> ${visitorName}\n` +
        `📞 <b>Phone:</b> ${cleanPhone ? '+' + cleanPhone : 'Not provided'}\n` +
        `🎯 <b>Top Score:</b> ${(result.topScore || 0).toFixed(3)}\n` +
        `💬 <b>Question:</b>\n"<i>${safeQuestion}</i>"\n\n` +
        replyAction;

      sendTelegramAdminAlert(telegramAlertHtml).catch((err) =>
        console.error('Failed to dispatch web FAQ Telegram alert:', err.message)
      );
    }

    // Return the response directly with full 3-tier routing metadata
    return res.status(200).json({
      success: true,
      answer: result.answer,
      tier: result.tier, // 'HIGH' | 'MEDIUM' | 'LOW'
      showClarificationButton: result.showClarificationButton, // boolean
      matchedFaqId: result.matchedFaqId,
      topScore: result.topScore,
      resources: result.resources || [],
      matchedFaqs: result.matchedFaqs || []
    });
  } catch (error) {
    console.error('FAQ Query Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error processing FAQ query.' 
    });
  }
};