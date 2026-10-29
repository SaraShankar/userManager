const { askFaqAssistant } = require('../services/faqRagService');

exports.handleFaqQuery = async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, message: 'Question is required.' });
    }

    const result = await askFaqAssistant(question);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('FAQ Query Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error processing FAQ query.' });
  }
};