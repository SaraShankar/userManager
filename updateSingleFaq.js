// updateSingleFaq.js
require('dotenv').config();
const mongoose = require('mongoose');
const { OpenAI } = require('openai');
const FaqVector = require('./models/faqVectorSchema');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function updateFaqQ26() {
  try {
    const mongoUri = process.env.MONGODB_URI_100SUM || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('Missing MongoDB URI in environment variables.');
    }

    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(mongoUri);

    const faqId = 'faq_q26';

    const question =
      'Why are your fees higher than some other providers? ' +
      'Are your abacus classes expensive compared to other tutors or tuition centres? ' +
      'What makes your tuition fee worth the price and what is the hourly rate value? ' +
      'How do your costs compare to low-cost alternatives in London?';

    const answer =
      'When compared to the full value, materials, and specialized instruction provided, our fees are actually among the most competitive for after-school education in London.\n\n' +
      'Here is why our program offers exceptional value for money:\n\n' +
      '1. Outstanding Hourly Value (£10.00 / Hour):\n' +
      'Our tuition is £350.00 per 4-month term. Because each term includes 2 hours weekly over 16+ weeks (totaling 32+ hours of direct instruction), our rate breaks down to just £10.00 per hour—far below standard private or group academic tutoring rates in London.\n\n' +
      '2. 20+ Years of Unmatched Price Stability:\n' +
      'When Dr. Geetha launched the program in the UK in 2005, tuition was £80 per month. Today at £350 per term (approx. £87.50 per month), our pricing has remained virtually unchanged for over two decades despite inflation.\n\n' +
      '3. All-Inclusive Learning Package:\n' +
      'Unlike low-cost providers that add hidden charges for software, books, or level tests, our term fee includes free home-practice software, custom digital visualization tools (Anzan++), and specialized classroom teaching applications.\n\n' +
      '4. Specialized Abacus Expertise:\n' +
      'Many lower-cost alternatives are run by general math tutors without formal abacus accreditation. We specialize 100% exclusively in abacus mental arithmetic, using a proven syllabus refined over 20+ years.\n\n' +
      '5. Small Batches & Dedicated Remedial Support:\n' +
      'We maintain focused, small cohorts (1–3 students online, 5–7 students in-person) and provide dedicated 1-on-1 remedial support sessions for students who need extra reinforcement at no additional cost.\n\n' +
      'Would you like to book a trial assessment to experience our teaching approach firsthand?';

    console.log(`Generating 1536-dim embedding for: ${faqId}...`);
    const input = question.replace(/\s+/g, ' ').trim();
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input,
    });

    const newEmbedding = embRes.data[0].embedding;

    const updatedDoc = await FaqVector.findOneAndUpdate(
      { id: faqId },
      {
        $set: {
          question,
          answer,
          embedding: newEmbedding,
          'metadata.category': 'Parent Support & Pricing',
          'metadata.updatedAt': new Date(),
          updatedAt: new Date(),
        },
      },
      { new: true, upsert: true }
    );

    console.log(`✅ Successfully updated ${faqId} in database!`);
    console.log(`Updated Question: "${updatedDoc.question}"`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating FAQ:', error);
    process.exit(1);
  }
}

updateFaqQ26();