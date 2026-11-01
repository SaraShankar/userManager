require('dotenv').config();
const mongoose = require('mongoose');
const { OpenAI } = require('openai');
const FaqVector = require('./models/faqVectorSchema');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function updateScreenTimeFaq() {
  await mongoose.connect(process.env.MONGODB_URI_100SUM || process.env.MONGO_URI);

  const question = "I am concerned about screen time and avoiding phone addiction, but your course uses digital tools. Why are apps required?";
  const answer = 
    "We completely share your focus on avoiding passive phone and screen addiction. In our program, screen tools are never used for passive entertainment or repetitive drills. Learning abacus happens in two distinct stages:\n\n" +
    "1. Physical Abacus Stage: Children start exclusively with the physical abacus frame, workbooks, and direct teacher guidance. During this stage, errors are physical and immediately visible for teachers to guide and correct.\n\n" +
    "2. Mental Abacus Stage (Bead Visualization / Anzan): Once a child is fluent with the physical tool, they transition to internal visualization. At this advanced level, human observation alone cannot track the mental images inside a child's mind. Our specialized tools (TableClock, GearAnzan, OralPod, BingoBead) are essential to systematically assess mental skill levels, provide 50 stages of visualization, and offer structured error correction.\n\n" +
    "Phased & Purpose-Driven: Digital tools are introduced only after physical proficiency is proven. By targeting internal visualization, these dedicated home tools empower students to develop mental arithmetic 3x to 4x faster with purposeful, short brain training rather than aimless screen time.";

  const input = `${question} ${answer}`.replace(/\s+/g, ' ').trim();
  const embRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input
  });

  await FaqVector.findOneAndUpdate(
    { id: 'faq_screen_time_and_digital_tools' },
    {
      $set: {
        id: 'faq_screen_time_and_digital_tools',
        question,
        answer,
        embedding: embRes.data[0].embedding,
        metadata: {
          category: 'Pedagogy & Digital Tools',
          updatedAt: new Date()
        }
      }
    },
    { upsert: true, returnDocument: 'after' }
  );

  console.log("✅ Screen time & digital tools FAQ indexed successfully!");
  process.exit(0);
}

updateScreenTimeFaq();