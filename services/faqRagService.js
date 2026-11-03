const { OpenAI } = require('openai');
const FaqVector = require('../models/faqVectorSchema');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Confidence thresholds for 3-tier routing
const SIMILARITY_HIGH = 0.60;
const SIMILARITY_MEDIUM = 0.30;

/**
 * Answers incoming parent questions using Atlas Vector Search + OpenAI RAG with 3-tier confidence routing.
 *
 * @param {string} userQuestion - The question sent by the parent.
 * @param {object} [userContext] - Optional context: { phone, name }
 * @returns {Promise<object>} Result containing tier (HIGH | MEDIUM | LOW), answer text, button flags, and metadata.
 */
async function askFaqAssistant(userQuestion, userContext = {}) {
  if (!userQuestion || typeof userQuestion !== 'string') {
    throw new Error('Valid userQuestion string is required');
  }

  // 1. Clean incoming sender phone & name for prefilled link generation
  const cleanPhone = (userContext.phone || '').replace(/\D/g, '');
  const encodedName = encodeURIComponent((userContext.name || '').trim());

  let assessmentLink = 'https://eynko-server-production.up.railway.app/assessment/';
  const queryParams = [];
  if (cleanPhone) queryParams.push(`phone=${cleanPhone}`);
  if (encodedName) queryParams.push(`name=${encodedName}`);
  if (queryParams.length > 0) {
    assessmentLink += `?${queryParams.join('&')}`;
  }

  // 2. Vectorize the incoming question
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: userQuestion.trim(),
  });
  const queryVector = embeddingResponse.data[0].embedding;

  // 3. Query Atlas Vector Search
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

  const fallbackPayload = {
    isMatch: false,
    tier: 'LOW',
    topScore,
    answer:
      "I don't have the exact details on that right now. Please reach out directly to Dr. Geetha's team on WhatsApp, and we will assist you right away!",
    showClarificationButton: false,
    resources: [],
    matchedFaqId: null,
    matchedFaqs: [],
  };

  // Tier 3: Score below medium floor (Low Confidence / Unrelated)
  if (!matchedDocs.length || topScore < SIMILARITY_MEDIUM) {
    return fallbackPayload;
  }

  // 4. Assemble Grounding Context
  const contextText = matchedDocs
    .map((doc, idx) => `[Source ${idx + 1} (${doc.id})]\nQuestion: ${doc.question}\nAnswer: ${doc.answer}`)
    .join('\n\n---\n\n');

  const systemPrompt = `You are the official parent-support AI assistant for Dr. Geetha's AbacusForKids program in Bushey, Harrow, and Kenton.

STRICT INSTRUCTIONS:
1. Answer the question relying EXCLUSIVELY on the facts provided in the VERIFIED KNOWLEDGE below.
2. If the VERIFIED KNOWLEDGE does not contain a specific, direct answer to the parent's inquiry (e.g., questions about classroom visits, policies not documented, custom pricing requests, or special accommodations), you MUST reply with the exact token: [TRIGGER_ADMIN_FALLBACK]
3. NEVER make assumptions, speculate, or say phrases like "While we don't mention...", "We do not explicitly state...", or suggest unrelated alternatives when the direct answer is missing.
4. If the answer IS explicitly supported by the context:
- Provide an empathetic, authoritative, and concise response.
- Mention key concepts where relevant: 10-20 min daily home practice as a "brain warm-up", the bi-quinary 1+4 abacus frame reducing workload by ~75%, and 11+ grammar school pathways.
- When discussing trial sessions, offer this link: https://cal.com/abacusforkids/abacus-trial-session
- When discussing skill level, enrollment readiness, or assessments, invite the parent to use this personalized assessment link: 
${assessmentLink}`;

  // 5. Generate AI Completion
  const chatResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: `${systemPrompt}\n\n=== VERIFIED KNOWLEDGE ===\n${contextText}` },
      { role: 'user', content: userQuestion.trim() },
    ],
    temperature: 0.1,
  });

  const completionText = (chatResponse.choices[0]?.message?.content || '').trim();

  // Guardrail refusal check
  if (completionText.includes('[TRIGGER_ADMIN_FALLBACK]') || completionText.length === 0) {
    console.log(`🛡️ RAG Guardrail: Knowledge gap detected for query: "${userQuestion}". Falling back.`);
    return {
      ...fallbackPayload,
      topScore,
      matchedFaqs: matchedDocs.map((doc) => ({
        id: doc.id,
        question: doc.question,
        score: doc.score,
      })),
    };
  }

  const resources = matchedDocs.flatMap((doc) => doc.downloadable_resources || []);
  const isHighConfidence = topScore >= SIMILARITY_HIGH;

  return {
    isMatch: true,
    tier: isHighConfidence ? 'HIGH' : 'MEDIUM',
    topScore,
    answer: completionText,
    showClarificationButton: !isHighConfidence, // true when 0.30 <= topScore < 0.60
    matchedFaqId: topMatch.id,
    resources,
    matchedFaqs: matchedDocs.map((doc) => ({
      id: doc.id,
      question: doc.question,
      score: doc.score,
    })),
  };
}

module.exports = { askFaqAssistant };