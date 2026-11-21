const mongoose = require('mongoose');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function normalizeDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const PERFORMANCE_KEYWORDS = [
  'progress', 'report', 'performance', 'score', 'rating', 'abacus', 'mental',
  'multiplication', 'division', 'homework', 'classwork', 'discipline',
  'attendance', 'punctuality', 'focus', 'teacher', 'feedback', 'doing',
  'improve', 'weak', 'strength', 'level', 'booster', 'xp', 'streak', 'session', 'child', 'son', 'daughter'
];

function isPerformanceQuestion(text) {
  const lower = String(text || '').toLowerCase();
  return PERFORMANCE_KEYWORDS.some((kw) => lower.includes(kw));
}

async function askStudentPerformanceRag(rawPhone, userQuestion) {
  const digits = normalizeDigits(rawPhone);
  const last10 = digits.slice(-10);
  if (last10.length < 7 || !isPerformanceQuestion(userQuestion)) return null;

  const boosterDb = mongoose.connection.useDb('BoosterDB', { useCache: true });
  const studentsCol = boosterDb.collection('students');
  const vectorsCol = boosterDb.collection('student_performance_vectors');

  const phoneRegex = new RegExp(last10 + '$');
  const linkedStudents = await studentsCol
    .find({ isActive: true, parentWhatsapp: { $regex: phoneRegex } })
    .toArray();

  if (!linkedStudents.length) return null;

  const studentCodes = linkedStudents.map((s) => s.studentCode);
  const approvedDocs = await vectorsCol
    .find({ studentCode: { $in: studentCodes } })
    .sort({ weekKey: -1, approvedAt: -1 })
    .limit(12)
    .toArray();

  if (!approvedDocs.length) return null;

  const embRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: userQuestion.trim()
  });
  const queryVec = embRes.data[0].embedding;

  const ranked = approvedDocs
    .map((doc) => ({
      ...doc,
      score: cosineSimilarity(queryVec, doc.embedding)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const liveSummary = linkedStudents
    .map(
      (s) =>
        `${s.name} (${s.studentCode}): Level ${s.level}, Batch ${s.batchCode}, Weekly Booster Sessions ${s.weeklyGoal?.completedThisWeek || 0}/${s.weeklyGoal?.targetSessions || 5}, Weekly XP ${s.weeklyXp || 0}, Streak ${s.streakDays || 0}d.`
    )
    .join('\n');

  const approvedContext = ranked
    .map((d, i) => `[Approved Evaluation ${i + 1} — ${d.weekKey}]
${d.canonicalSummary}`)
    .join('\n\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.15,
    messages: [
      {
        role: 'system',
        content:
          "You are Dr. Geetha's AbacusForKids Student Progress Assistant on WhatsApp. Answer the parent's question warmly, clearly, and concisely using ONLY the verified Centre-Admin-Approved Weekly Evaluations and Live Booster Practice metrics below. Never invent scores or discuss other students. Format cleanly for WhatsApp with bullet points where helpful."
      },
      {
        role: 'user',
        content: `LIVE BOOSTER STATS:
${liveSummary}

APPROVED WEEKLY TEACHER EVALUATIONS (0-9 SCALE):
${approvedContext}

PARENT QUESTION:
${userQuestion.trim()}`
      }
    ]
  });

  const answer = (completion.choices[0]?.message?.content || '').trim();
  if (!answer) return null;

  return {
    answer,
    topScore: ranked[0]?.score || 0,
    studentCodes
  };
}

module.exports = { askStudentPerformanceRag };
