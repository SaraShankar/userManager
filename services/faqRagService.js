const { OpenAI } = require('openai');
const FaqVector = require('../models/faqVectorSchema');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Scores below 0.70 indicate weak semantic relevance to your stored FAQs
const SIMILARITY_THRESHOLD = 0.70;

async function askFaqAssistant(userQuestion) {
  if (!userQuestion || typeof userQuestion !== 'string') {
    throw new Error('Valid userQuestion string is required');
  }

  // 1. Vectorize the incoming question
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: userQuestion.trim(),
  });
  const queryVector = embeddingResponse.data[0].embedding;

  // 2. Query Atlas Vector Search
  const pipeline = [
    {
      $vectorSearch: {
        index: 'faq_vector_index',
        path: 'embedding',
        queryVector: queryVector,
        numCandidates: 33,
        limit: 3,
      },
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
      },
    },
  ];

  const matchedDocs = await FaqVector.aggregate(pipeline);
  const topMatch = matchedDocs[0];
  const topScore = topMatch?.score || 0;

  // Layer 1 Safeguard: Vector similarity check
  if (!matchedDocs.length || topScore < SIMILARITY_THRESHOLD) {
    return {
      isMatch: false,
      topScore,
      answer: null,
      resources: [],
      matchedFaqs: [],
    };
  }

  // 3. Assemble Grounding Context
  const contextText = matchedDocs
    .map(
      (doc, idx) => `[Source ${idx + 1} - ${doc.id}]\nQuestion: ${doc.question}\nAnswer: ${doc.answer}`
    )
    .join('\n\n---\n\n');

  // Layer 2 Safeguard: Strict refusal rule in system prompt
  const systemPrompt = `You are the official parent-support AI assistant for Dr. Geetha's AbacusForKids program.

STRICT INSTRUCTIONS:
1. Answer the question relying EXCLUSIVELY on the facts provided in the VERIFIED KNOWLEDGE below.
2. If the VERIFIED KNOWLEDGE does not contain a specific, direct answer to the parent's inquiry (e.g., questions about classroom visits, policies not documented, custom pricing requests, or special accommodations), you MUST reply with the exact token: [TRIGGER_ADMIN_FALLBACK]
3. NEVER make assumptions, speculate, or say phrases like "While we don't mention...", "We do not explicitly state...", or suggest unrelated alternatives when the direct answer is missing.
4. If the answer IS explicitly supported by the context:
   - Provide an empathetic, authoritative, and concise response.
   - Mention key concepts where relevant: 10-20 min daily home practice as a "brain warm-up", the bi-quinary 1+4 abacus frame reducing workload by ~75%, and 11+ grammar school pathways.
   - Where helpful, provide the trial booking link: https://cal.com/abacusforkids/abacus-trial-session
   - Where helpful, provide the assessment link: https://eynko-server-production.up.railway.app/assessment/`;

  // 4. Generate AI Completion
  const chatResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: `${systemPrompt}\n\n=== VERIFIED KNOWLEDGE ===\n${contextText}` },
      { role: 'user', content: userQuestion.trim() },
    ],
    temperature: 0.1, // Reduced temperature to minimize hallucination and enforce rule following
  });

  const completionText = (chatResponse.choices[0]?.message?.content || '').trim();

  // Layer 3 Safeguard: Intercept model refusal to trigger human handover
  if (completionText.includes('[TRIGGER_ADMIN_FALLBACK]') || completionText.length === 0) {
    console.log(`🛡️ RAG Guardrail: Knowledge gap detected for query: "${userQuestion}". Triggering fallback.`);
    return {
      isMatch: false,
      topScore,
      answer: null,
      resources: [],
      matchedFaqs: matchedDocs.map((doc) => ({
        id: doc.id,
        question: doc.question,
        score: doc.score,
      })),
    };
  }

  const resources = matchedDocs.flatMap((doc) => doc.downloadable_resources || []);

  return {
    isMatch: true,
    topScore,
    answer: completionText,
    matchedFaqs: matchedDocs.map((doc) => ({
      id: doc.id,
      question: doc.question,
      score: doc.score,
    })),
    resources,
  };
}

module.exports = { askFaqAssistant };