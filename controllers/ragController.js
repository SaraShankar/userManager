const FaqVector = require('../models/faqVectorSchema');

// Function to perform Atlas Vector Search
exports.searchKnowledgeBase = async (req, res) => {
  try {
    const { queryVector, category, limit = 3 } = req.body;

    // Build vector search pipeline
    const pipeline = [
      {
        $vectorSearch: {
          index: "vector_index", // Name of your Atlas Search index
          path: "embedding",
          queryVector: queryVector, // Array of numbers generated from user query
          numCandidates: 50,
          limit: limit
        }
      },
      {
        $project: {
          id: 1,
          question: 1,
          answer: 1,
          metadata: 1,
          downloadable_resources: 1,
          score: { $meta: "vectorSearchScore" }
        }
      }
    ];

    // Optional metadata pre-filtering
    if (category) {
      pipeline[0].$vectorSearch.filter = {
        "metadata.category": { $eq: category }
      };
    }

    const results = await FaqVector.aggregate(pipeline);
    
    return res.status(200).json({
      success: true,
      count: results.length,
      results: results
    });

  } catch (error) {
    console.error("RAG Search Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};