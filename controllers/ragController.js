// controllers/ragController.js
const { OpenAI } = require('openai');
const FaqVector = require('../models/faqVectorSchema');
const { askFaqAssistant } = require('../services/faqRagService');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 1. Vector Search
exports.searchKnowledgeBase = async (req, res) => {
  try {
    const { query, queryVector, category, limit = 3 } = req.body;
    let searchVector = queryVector;

    if (!searchVector && query && typeof query === 'string') {
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query.trim(),
      });
      searchVector = embeddingResponse.data[0].embedding;
    }

    if (!Array.isArray(searchVector) || searchVector.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'A valid text "query" or numeric "queryVector" is required.'
      });
    }

    const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 3, 20));

    const pipeline = [
      {
        $vectorSearch: {
          index: 'faq_vector_index',
          path: 'embedding',
          queryVector: searchVector,
          numCandidates: Math.max(50, parsedLimit * 10),
          limit: parsedLimit,
        }
      },
      {
        $project: {
          _id: 0,
          id: 1,
          question: 1,
          answer: 1,
          metadata: 1,
          downloadable_resources: 1,
          score: { $meta: 'vectorSearchScore' },
        }
      }
    ];

    if (category && typeof category === 'string') {
      pipeline[0].$vectorSearch.filter = {
        'metadata.category': { $eq: category.trim() },
      };
    }

    const results = await FaqVector.aggregate(pipeline);
    return res.status(200).json({ success: true, count: results.length, results });
  } catch (error) {
    console.error('RAG Search Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 2. Web Chat Handler (Make sure this export is present)
exports.handleWebChat = async (req, res) => {
  try {
    const { message, sessionId, name, phone } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ reply: 'Please provide a valid question.' });
    }

    const result = await askFaqAssistant(message, {
      name: name || '',
      phone: phone || '',
    });

    if (!result.isMatch || !result.answer) {
      return res.status(200).json({
        reply: "I don't have the exact details on that right now. Please reach out directly to Dr. Geetha's team on WhatsApp, and we will assist you right away!",
        fallback: true,
      });
    }

    let finalReply = result.answer;

    if (result.resources && result.resources.length > 0) {
      const resourceBullets = result.resources
        .map((r) => `• [${r.title || 'Download Guide'}](${r.url})`)
        .join('\n');
      finalReply += `\n\n**Helpful Resources:**\n${resourceBullets}`;
    }

    return res.status(200).json({
      reply: finalReply,
      fallback: false,
    });
  } catch (error) {
    console.error('Web Chat Error in ragController:', error);
    return res.status(500).json({
      reply: 'We are experiencing a temporary issue. Please reach out to us via WhatsApp!',
      error: error.message,
    });
  }
};