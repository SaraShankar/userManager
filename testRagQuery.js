require('dotenv').config();
const mongoose = require('mongoose');
const { OpenAI } = require('openai');
const FaqVector = require('./models/faqVectorSchema');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testQuery() {
  await mongoose.connect(process.env.MONGODB_URI_100SUM || process.env.MONGO_URI);

  const queryText = "can I talk to you guys?";

  // 1. Generate query embedding
  const embRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: queryText
  });
  const queryVector = embRes.data[0].embedding;

  // 2. Perform Atlas Vector Search aggregation
  // Inside testRagQuery.js
  const results = await FaqVector.aggregate([
    {
      $vectorSearch: {
        index: "faq_vector_index", // <--- Updated to match your Atlas index name
        path: "embedding",
        queryVector: queryVector,
        numCandidates: 10,
        limit: 3
      }
    },
    {
      $project: {
        id: 1,
        question: 1,
        score: { $meta: "vectorSearchScore" }
      }
    }
  ]);

  console.log("Results for query:", queryText);
  console.dir(results, { depth: null });
  process.exit(0);
}

testQuery();