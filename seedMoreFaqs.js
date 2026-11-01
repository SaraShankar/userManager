require('dotenv').config();
const mongoose = require('mongoose');
const { OpenAI } = require('openai');
const FaqVector = require('./models/faqVectorSchema');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const additionalFaqs = [
  {
    id: 'faq_classroom_visit_policy',
    question: 'Can parents sit in, observe, or visit the classroom to see if it is suitable?',
    answer:
      'To maintain an uninterrupted, distraction-free learning environment and ensure young children remain comfortable and focused without anxiety or panic, we do not permit parents or visitors inside the active classroom. Instead, your child can attend a structured 1-on-1 assessment and interactive trial where you receive full feedback on their readiness and comfort level. You can book an assessment slot here: https://cal.com/abacusforkids/abacus-trial-session',
    category: 'Logistics & Policies'
  },
  {
    id: 'faq_in_person_location',
    question: 'Where are your in-person abacus classes conducted?',
    answer:
      'Our in-person classes are held at Hillingdon House, 2nd Floor, 386-388 Kenton Road, Harrow, HA3 9DP, London, UK.',
    category: 'Logistics & Policies'
  },
  {
    id: 'faq_holiday_breaks',
    question: 'When are classes suspended for holidays?',
    answer:
      'Classes close three times a year for holiday breaks: Christmas, Easter, and Summer.',
    category: 'Schedule & Terms'
  },
  {
    id: 'faq_operating_hours',
    question: 'What are your operating hours?',
    answer:
      'Our office hours are from 11:00 am to 6:00 pm on weekdays (closed on Fridays) and 8:00 am to 3:00 pm on Saturdays. We are closed on Sundays.',
    category: 'Logistics & Policies'
  },
  {
    id: 'faq_new_enrollment_schedules',
    question: 'What class scheduling options do you offer for new student enrollment?',
    answer:
      'While we run multiple batches during the week, new students can only join batches that are newly starting or upcoming. Please call us at 02089078009 to check available beginner batch schedules, or our representative will contact you shortly.',
    category: 'Enrollment & Batches'
  },
  {
    id: 'faq_in_person_meeting',
    question: 'Would it be possible to schedule an in-person meeting to find out more details about your programs?',
    answer:
      'Yes, absolutely! We will inform you of the scheduled date and time for the meeting. In the meantime, feel free to ask any questions here and we will be delighted to assist.',
    category: 'Enrollment & Batches'
  },
  {
    id: 'faq_parking_availability',
    question: 'Is parking available for parents during pickup and drop-off?',
    answer:
      'While there is no dedicated parent parking, visitor parking spaces are available directly at the front of the building.',
    category: 'Logistics & Policies'
  },
  {
    id: 'faq_two_hour_class_breaks',
    question: 'Do you offer breaks during the 2-hour in-person class?',
    answer:
      'Our curriculum uses an active, play-based approach with mind gym drills. Combining the physical abacus with our Abacus Teaching Board (ATB) app keeps students fully engaged with teachers and peers. Structured over 20+ years for UK learners, the fast-paced modules keep students entertained and focused without room for distraction or fatigue.',
    category: 'Pedagogy & Curriculum'
  },
  {
    id: 'faq_disability_accessibility',
    question: 'Is the center accessible for individuals with disabilities?',
    answer:
      'Yes, our facility is fully accessible for individuals with physical disabilities.',
    category: 'Logistics & Policies'
  },
  {
    id: 'faq_special_needs_support',
    question: 'How do you support children with special needs?',
    answer:
      'Our staff are currently not trained to support children with special educational needs (SEN).',
    category: 'Logistics & Policies'
  },
  {
    id: 'faq_class_size_and_staff',
    question: 'How many staff members (teachers or teaching assistants) are present during class sessions?',
    answer:
      'Class sizes range strictly from 4 to 8 students per classroom. A qualified lead teacher is continuously present, and assistant teachers join during specific events such as term assessments.',
    category: 'Logistics & Policies'
  },
  {
    id: 'faq_childcare_vouchers',
    question: 'Do you accept childcare vouchers?',
    answer:
      'We do not accept childcare vouchers at this time.',
    category: 'Fees & Discounts'
  },
  {
    id: 'faq_discontinuation_notice',
    question: 'What is the notice period required to discontinue the course, and how are refunds processed?',
    answer:
      'A one-month notice period is required to discontinue the course.',
    category: 'Fees & Policies'
  },
  {
    id: 'faq_sibling_discount',
    question: 'Do you offer a sibling discount if I enroll two children?',
    answer:
      'Yes, we provide a 10% discount on the tuition fee for the second enrolled child.',
    category: 'Fees & Discounts'
  },
  {
    id: 'faq_mandatory_levels',
    question: 'Is it mandatory to complete all 9 levels?',
    answer:
      'Each level imparts a distinct skill set. Completing all 9 levels provides the full cognitive benefit; in particular, the first 6 levels are essential and mandatory to deeply embed mental arithmetic (Anzan) and maximize processing speed.',
    category: 'Pedagogy & Curriculum'
  },
  {
    id: 'faq_batch_timing_change',
    question: 'Can I change my batch timing?',
    answer:
      'Yes, batch timing changes are permitted subject to availability. Requests are reviewed and processed by our administrative team as quickly as possible.',
    category: 'Enrollment & Batches'
  },
  {
    id: 'faq_abacus_vs_kumon',
    question: 'How does Abacus differ from Kumon and other traditional tuitions?',
    answer:
      'Abacus leverages the critical developmental window (ages 4-8) when neuroplasticity allows children to turn physical bead movements into an internal mental calculator (Anzan). Unlike worksheet-based Kumon that can be started at any age to support school curricula, abacus is foundational cognitive brain training. It builds mental stamina, whole-brain engagement with zero screen time, and allows children to calculate multi-digit figures mentally faster than typing on a calculator.',
    category: 'Pedagogy & Comparison'
  },
  {
    id: 'faq_difference_from_other_abacus',
    question: 'How do you differ from other abacus classes?',
    answer:
      'With 20+ years of UK experience, 1,000+ students, and 50+ trained teachers, our curriculum is tailored specifically to UK education standards. We use our custom Abacus Teaching Board (ATB) app in class alongside dedicated home tools—TableClock (mastering times tables in 2 weeks), GearAnzan (50 visualization stages), OralPod, and BingoBead—helping students build mental arithmetic 3x to 4x faster.',
    category: 'Pedagogy & Comparison'
  }
];

async function seedDatabase() {
  const mongoUri =
    process.env.MONGODB_URI_100SUM ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL;

  if (!mongoUri) {
    console.error('❌ MongoDB connection URI is missing from your .env file!');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('📦 Connected to MongoDB Atlas.');

    console.log(`🚀 Generating embeddings and upserting ${additionalFaqs.length} FAQs...`);

    for (const item of additionalFaqs) {
      const cleanInput = `${item.question} ${item.answer}`.replace(/\s+/g, ' ').trim();

      const embRes = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: cleanInput
      });

      const embedding = embRes.data[0].embedding;

      await FaqVector.findOneAndUpdate(
        { id: item.id },
        {
          $set: {
            id: item.id,
            question: item.question,
            answer: item.answer,
            embedding,
            metadata: {
              category: item.category,
              updatedAt: new Date()
            }
          }
        },
        { upsert: true, returnDocument: 'after' }
      );

      console.log(`✅ Upserted: ${item.id}`);
    }

    console.log('\n🎉 All additional FAQs indexed and ready for Atlas Vector Search!');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seedDatabase();