// controllers/faqController.js
const { askFaqAssistant } = require('../services/faqRagService');

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