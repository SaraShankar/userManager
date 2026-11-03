// updateSingleFaq.js
require('dotenv').config();
const mongoose = require('mongoose');
const { OpenAI } = require('openai');
const FaqVector = require('./models/faqVectorSchema');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function updateSpecificFaq() {
  try {
    const mongoUri = process.env.MONGODB_URI_100SUM || process.env.MONGO_URI;
    await mongoose.connect(mongoUri);

    const faqId = 'faq_subjects_scope_specialization';
    const question =
      'Do you offer instruction in subjects besides mathematics? Do you teach 11+ maths or general 11 plus tuition? Do you teach other school subjects like English, Science, or Languages? Is this only abacus math?[cite: 1]';
    const answer =
      "At AbacusForKids, we specialize exclusively in Abacus Mental Arithmetic[cite: 1]. We do not offer tutoring in school curriculum subjects (such as English, Science, or Humanities), nor do we teach direct 11+ Maths or exam-paper coaching[cite: 1].\n\n" +
      "Instead, by focusing 100% on abacus calculation and mental bead visualization (Anzan), our students develop rapid calculation speed, high accuracy, and strong mental endurance[cite: 1]. While this numerical intuition provides a powerful foundation that naturally helps children excel in school and competitive 11+ exams, our curriculum is strictly dedicated to mental arithmetic[cite: 1].\n\n" +
      "Would you like to learn more about how our abacus belt levels work or schedule a trial assessment for your child?[cite: 1]";

    console.log(`Generating embedding for only: ${faqId}...`);
    
    // Embed question triggers
    const input = question.replace(/\s+/g, ' ').trim();
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input
    });

    await FaqVector.findOneAndUpdate(
      { id: faqId },
      {
        $set: {
          id: faqId,
          question,
          answer,
          embedding: embRes.data[0].embedding,
          metadata: {
            category: 'Curriculum & Subjects',
            updatedAt: new Date()
          }
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    console.log(`✅ Only ${faqId} was updated!`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

updateSpecificFaq();