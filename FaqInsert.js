require('dotenv').config();
const mongoose = require('mongoose');
const { OpenAI } = require('openai');
const FaqVector = require('./models/faqVectorSchema');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const faqsToInsert = [
  {
    id: 'faq_direct_phone_call_availability',
    category: 'Communication & Scheduling',
    question:
      'Is it possible to speak directly with someone on your team? Can I call you or talk to you guys over the phone? Can we schedule a phone call? Can I talk to someone?',
    answer:
      "Yes, absolutely! We are always delighted to speak directly with parents.\n\n" +
      "Because Dr. Geetha and our academic instructors are actively teaching and running live student sessions throughout the day, we are unable to take unscheduled, immediate phone calls. However, we would love to arrange a dedicated call for you. Please reply here with:\n" +
      "1. Your preferred day & time window\n" +
      "2. Your child's age or current school year\n" +
      "3. Any specific questions or goals you have\n\n" +
      "Once received, Dr. Geetha or a member of our senior team will confirm the slot and call you directly on this number!"
  },
  {
    id: 'faq_subjects_scope_specialization',
    category: 'Curriculum & Subjects',
    question:
      'Do you offer instruction in subjects besides mathematics? Do you teach 11+ maths or general 11 plus tuition? Do you teach other school subjects like English, Science, or Languages? Is this only abacus math?',
    answer:
      "At AbacusForKids, we specialize exclusively in Abacus Mental Arithmetic. We do not offer tutoring in school curriculum subjects (such as English, Science, or Humanities), nor do we teach direct 11+ Maths or exam-paper coaching.\n\n" +
      "Instead, by focusing 100% on abacus calculation and mental bead visualization (Anzan), our students develop rapid calculation speed, high accuracy, and strong mental endurance. While this numerical intuition provides a powerful foundation that naturally helps children excel in school and competitive 11+ exams, our curriculum is strictly dedicated to mental arithmetic.\n\n" +
      "Would you like to learn more about how our abacus belt levels work or schedule a trial assessment for your child?"
  },
  {
    id: 'faq_mode_batch_switching_policy',
    category: 'Attendance & Batch Policy',
    question:
      'Can my child switch between online and face-to-face learning depending on what is most convenient for them? Can we switch batches or change timings weekly?',
    answer:
      "No, switching freely between online and face-to-face sessions on a weekly basis is not permitted. In our programme, each batch is strictly structured so that all students in that session are at the exact same belt level and curriculum week. This ensures every child works through synchronized classwork, timed speed training, and homework reviews together. Allowing students to drop into random batches at will disrupts both their personal learning pace and the classroom dynamic.\n\n" +
      "Special Face-to-Face Exception: At the teacher's discretion, an online student may be permitted to attend one face-to-face class per level (for example, to review finger techniques or complete a level assessment). This must be arranged and approved in advance with the instructor.\n\n" +
      "Permanent Schedule Changes: If your routine permanently changes and you need to move between online and in-person learning, let us know with advance notice. We will gladly accommodate the transfer as soon as a slot opens in a batch matching your child's exact level and curriculum week.\n\n" +
      "Would you like to view our current class schedule to find the batch that best fits your routine?"
  },
  {
    id: 'faq_abacus_vs_school_math_methodology',
    category: 'Methodology & Benefits',
    question:
      'How does the abacus method differ from standard school mathematics, and what are its key calculation benefits? ' +
      'Why calculate left-to-right instead of traditional right-to-left carry over? ' +
      'How does mental abacus help with word problems and multi-operation sums? ' +
      'Will abacus confuse my child with school maths? What are the advantages over traditional column addition?',
    answer:
      "Abacus Mental Arithmetic differs from standard school mathematics in several key ways:\n\n" +
      "1. Natural Left-to-Right Calculation: Abacus calculates numbers from left to right—the exact same direction we read and write—eliminating cumbersome right-to-left column carry-overs.\n\n" +
      "2. Instant Problem Solving: Empowers children to solve multi-digit and multi-row problems immediately. When numbers are read aloud, students can state the final answer right after hearing the last digit.\n\n" +
      "3. Simplified Word Problems: Children calculate seamlessly as they read through the sentence, removing the extra barrier of pulling out numbers on scrap paper first.\n\n" +
      "4. Simultaneous Operations: Addition, subtraction, multiplication, and division blend into a single continuous calculation (e.g., 304 + 56 - 129 + 903), building sharp agility for competitive 11+ exams.\n\n" +
      "5. Zero School Confusion: The abacus does not conflict with classroom teaching; it acts as a lightning-fast mental calculation engine. Children still show standard school working steps on paper, but complete them with total accuracy, zero finger-counting, and unmatched speed.\n\n" +
      "Would you like to explore how our mental bead visualization (Anzan) works or schedule a trial assessment for your child?"
  }
];

async function insertFaqs() {
  try {
    const mongoUri = process.env.MONGODB_URI_100SUM || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('Missing MongoDB URI in environment variables.');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);

    // Optional: Pass an ID via terminal command line to update only one (e.g. node FaqInsert.js faq_abacus_vs_school_math_methodology)
    const targetId = process.argv[2];
    const itemsToProcess = targetId
      ? faqsToInsert.filter((f) => f.id === targetId)
      : faqsToInsert;

    if (itemsToProcess.length === 0) {
      console.log(`⚠️ No FAQ found matching ID: "${targetId}"`);
      process.exit(1);
    }

    for (const faq of itemsToProcess) {
      console.log(`Generating embedding for: "${faq.id}"...`);

      // Embed question triggers directly to ensure maximum cosine score on parent queries
      const input = faq.question.replace(/\s+/g, ' ').trim();
      const embRes = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input
      });

      const embedding = embRes.data[0].embedding;

      await FaqVector.findOneAndUpdate(
        { id: faq.id },
        {
          $set: {
            id: faq.id,
            question: faq.question,
            answer: faq.answer,
            embedding,
            metadata: {
              category: faq.category,
              updatedAt: new Date()
            }
          }
        },
        { upsert: true, returnDocument: 'after' }
      );

      console.log(`✅ Indexed: ${faq.id}`);
    }

    console.log('\n🎉 Indexing complete! Embeddings stored in MongoDB Atlas.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating FAQs:', error);
    process.exit(1);
  }
}

insertFaqs();