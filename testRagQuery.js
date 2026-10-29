require('dotenv').config();
const mongoose = require('mongoose');
const { OpenAI } = require('openai');
const FaqVector = require('./models/faqVectorSchema');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function runTestQuery(userQuestion) {
  try {
    console.log(`Connecting to MongoDB Atlas...`);
    await mongoose.connect(process.env.MONGODB_URI_100SUM);
    console.log(`Connected!`);

    console.log(`\n[1/3] Generating vector embedding for query: "${userQuestion}"...`);
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: userQuestion,
    });
    const queryVector = embeddingResponse.data[0].embedding;

    console.log(`[2/3] Executing MongoDB Atlas $vectorSearch...`);
    const pipeline = [
      {
        $vectorSearch: {
          index: "faq_vector_index",
          path: "embedding",
          queryVector: queryVector,
          numCandidates: 33,
          limit: 3
        }
      },
      {
        $project: {
          _id: 0,
          id: 1,
          question: 1,
          answer: 1,
          metadata: 1,
          score: { $meta: "vectorSearchScore" }
        }
      }
    ];

    const matchedDocs = await FaqVector.aggregate(pipeline);

    console.log(`\n--- TOP ${matchedDocs.length} MATCHED SOURCES ---`);
    matchedDocs.forEach((doc, idx) => {
      console.log(`${idx + 1}. [${doc.id}] (Score: ${doc.score.toFixed(4)}) ${doc.question}`);
    });

    console.log(`\n[3/3] Generating answer grounded in Dr. Geetha's pedagogy...`);
    const contextText = matchedDocs.map((doc, idx) => {
      return `Source ${idx + 1}:
Question: ${doc.question}
Answer: ${doc.answer}`;
    }).join('\n\n');

    const systemPrompt = `You are the official parent-support assistant for AbacusForKids, operated by Dr. Geetha.
Answer parent inquiries accurately, empathetically, and authoritatively based ONLY on the provided context below.
Always highlight: 10-20 min daily home practice as a "brain warm-up", the 1+4 bi-quinary abacus frame reducing workload by ~75%, 11+ grammar school advantages, and the free eligibility assessment link (https://eynko-server-production.up.railway.app/assessment/).`;

    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: `${systemPrompt}\n\n=== RETRIEVED CONTEXT ===\n${contextText}` },
        { role: "user", content: userQuestion }
      ],
      temperature: 0.3
    });

    console.log(`\n=== FINAL AI RESPONSE ===\n`);
    console.log(chatResponse.choices[0].message.content);
    console.log(`\n=========================\n`);

    process.exit(0);

  } catch (error) {
    console.error("Test Query Error:", error);
    process.exit(1);
  }
}

// Parent inquiry test
runTestQuery("Will abacus confuse my child with the math they teach at primary school?");