const axios = require('axios');

/**
 * Sends an instant notification to your Telegram admin chat.
 * @param {string} text Markdown-formatted notification message
 */
const sendTelegramAdminAlert = async (text) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!token || !chatId) {
    console.warn('⚠️ Telegram bot token or admin chat ID missing in environment variables.');
    return null;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const res = await axios.post(
      url,
      {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false
      },
      { timeout: 8000 }
    );
    console.log(`🚀 Escalation alert successfully delivered to Telegram admin (chatId: ${chatId})`);
    return res.data;
  } catch (err) {
    console.error('❌ Failed to send Telegram alert:', err.response?.data || err.message);
    return null;
  }
};

module.exports = { sendTelegramAdminAlert };