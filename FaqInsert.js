const { OpenAI } = require('openai');
const mongoose = require('mongoose');
const FaqVector = require('./models/faqVectorSchema');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function run() {
  const mongoUri =
    process.env.MONGODB_URI_100SUM ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL;

  if (!mongoUri) {
    console.error("❌ MongoDB connection URI is missing from your .env file!");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const question = "Can parents sit in, observe, or visit the classroom to see if it is suitable?";
  const answer = "To maintain an uninterrupted, distraction-free learning environment and ensure young children remain comfortable and focused without anxiety or panic, we do not permit parents or visitors inside the active classroom. Instead, your child can attend a structured 1-on-1 assessment and interactive trial where you receive full feedback on their readiness and comfort level. You can book an assessment slot here: https://cal.com/abacusforkids/abacus-trial-session";

  console.log("Generating embedding...");
  const embRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: `${question} ${answer}`.replace(/\n/g, ' ')
  });

  await FaqVector.create({
    id: "faq_classroom_visit_policy",
    question,
    answer,
    embedding: embRes.data[0].embedding,
    metadata: { 
      category: "Logistics & Formats" 
    }
  });

  console.log("✅ Classroom policy FAQ inserted successfully!");
  process.exit(0);
}

run();