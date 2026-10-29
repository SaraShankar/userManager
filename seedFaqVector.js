require('dotenv').config();
const mongoose = require('mongoose');
const { OpenAI } = require('openai');
const FaqVector = require('./models/faqVectorSchema');

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Complete 33 FAQ items structured according to your FaqVector schema
const rawFaqData = [
  {
    id: "faq_q1",
    question: "What is an Abacus, and what does the physical tool look like?",
    answer: "At AbacusForKids, an abacus is a calculated frame made of rods and tactile beads that converts abstract numerical concepts into a visible, physical form. Far from being a mere historical artifact, the modern bi-quinary 1+4 arrangement is an engineering marvel. It is objectively the fastest human-computable decimal abacus design ever created. By utilizing a single upper bead (value 5) and four lower beads (value 1) per rod, it minimizes finger travel, maximizes tactile distinctiveness, and cuts physical workload by roughly 75%. This extreme structural efficiency is precisely why the abacus becomes so effortless for children to visualize mentally (Anzan). The frame features vertical place-value rods, bi-conical tactile beads, and a central divider beam where beads only form numbers when moved toward it.",
    metadata: { category: "Program Overview", target_age: "Ages 4-12" }
  },
  {
    id: "faq_q2",
    question: "How Does the System Operate?",
    answer: "At AbacusForKids, the abacus system builds a permanent 'Maths Brain' by simultaneously developing two critical mathematical foundations: Understanding Sequential Number Values and Processing Arithmetic Calculations. Up to the number 10, most children manage sequential counting and basic addition on their fingers (e.g., 2+3=5, +4=9, -3=6). Moving beyond 10 with traditional abstract methods creates a massive hurdle because sequential counting is simple, but multi-digit mental processing requires a completely different cognitive setup. Abacus develops sequential understanding and arithmetic processing side-by-side, providing unlimited scalability across place-value rods. As physical bead routine becomes second nature, the frame transforms into an internal mental picture (Anzan) for effortless multi-digit mental arithmetic.",
    metadata: { category: "Program Overview", target_age: "Ages 4-12" }
  },
  {
    id: "faq_q3",
    question: "Will the abacus method of learning arithmetic confuse a child with the methods taught at school?",
    answer: "No, definitely not. Learning the abacus method at AbacusForKids alongside conventional school math is just like a child growing up learning two languages. Knowing more than one language builds a smarter, more adaptable brain, giving them multiple approaches to problem-solving. Learned early between ages 4 and 12, abacus becomes their default 'mother tongue' for numbers—a structured mental visualization framework (Anzan) used for life that keeps them steps ahead of peers relying purely on paper-and-pencil or abstract mental shortcuts.",
    metadata: { category: "Pedagogy & Technology", target_age: "Ages 4-12" }
  },
  {
    id: "faq_q4",
    question: "Who can Join?",
    answer: "AbacusForKids welcomes both young learners and adults! For children (ages 4+), the ideal age to start is 4+ years old, provided the child can read and write numbers from 1 to 20. Learning abacus early installs a smart number language that acts like high-performance running shoes for math. Adults and seniors can join at any time for mental sharpness or to learn how to teach children.",
    metadata: { category: "Program Overview", target_age: "All Ages" }
  },
  {
    id: "faq_q5",
    question: "Can a child enter a higher level directly based on their age or math ability?",
    answer: "No, all students must start from Level 1. Learning the abacus is like learning a new language: no matter prior knowledge, you must start with the alphabet. Level 1 teaches foundational finger mechanics, bead values, and movement logic. Skipping Level 1 misses the physical kinesthetic memory required to project and manipulate mental beads (Anzan) later on.",
    metadata: { category: "Program Overview", target_age: "All Ages" }
  },
  {
    id: "faq_q6",
    question: "What is the course duration?",
    answer: "The program consists of 9 Levels, with 3 months (12 weeks) per level. Classes are held once a week for 2 hours.",
    metadata: { category: "Logistics & Formats", target_age: "All Ages" }
  },
  {
    id: "faq_q7",
    question: "Is homework necessary, and what is the role of home practice?",
    answer: "Yes, short daily practice is essential. Mastering abacus arithmetic has two parts: learning the technique and practicing it to develop the skill in the mind. Once a week during class, instructors assess previous skill development and introduce new techniques. Over the next 6 days, students practice at home for 10 to 20 minutes a day to lock techniques into muscle memory and visual speed (Anzan). We strongly recommend doing this practice right before school homework, as it acts as a mental warm-up—activating focus, memory, and concentration.",
    metadata: { category: "Parent Support & Pricing", target_age: "All Ages" }
  },
  {
    id: "faq_q8",
    question: "What if my child misses a class?",
    answer: "At AbacusForKids, consistent attendance is essential because we follow a strict no-repetition weekly syllabus. Missing a class means a 14-day gap before seeing the group again, causing the child to fall behind and lose touch with their 7-day homework routine. Beyond math, abacus instills lifelong discipline and consistency. For unavoidable absences like illness, students must complete a free 1-hour 1-on-1 compensation class scheduled at teacher availability before attending their next regular session.",
    metadata: { category: "Logistics & Formats", target_age: "All Ages" }
  },
  {
    id: "faq_q9",
    question: "Will the class day/time remain the same?",
    answer: "At AbacusForKids we try to keep the same day timing throughout the programme, but in some exceptional cases we may change the batch timing with prior intimation.",
    metadata: { category: "Logistics & Formats", target_age: "All Ages" }
  },
  {
    id: "faq_q10",
    question: "Are the classes held throughout the year?",
    answer: "Classes are held throughout the year except during school holidays.",
    metadata: { category: "Logistics & Formats", target_age: "All Ages" }
  },
  {
    id: "faq_q11",
    question: "My child is not good at maths. What kind of improvement can I expect?",
    answer: "At AbacusForKids, we transform abstract numbers into visible, touchable beads that struggling children find far easier to master. Without abacus training, doing math is like running barefoot; learning abacus equips your child with high-performance running shoes, enabling drastic calculation speed and accuracy. Multi-sensory drills also sharpen active listening, spatial visualization, sustained focus, concentration, and working memory across all school subjects.",
    metadata: { category: "Pedagogy & Technology", target_age: "All Ages" }
  },
  {
    id: "faq_q12",
    question: "My child is already good at math. Is there still a benefit in learning abacus mental arithmetic?",
    answer: "Of course, yes! Doing standard math without abacus is like playing an instrument by ear—you might get by, but you lack formal structure. Learning abacus at AbacusForKids is like a musician mastering musical notation and theory, providing a structured framework that increases processing capacity without mental fatigue. It sharpens core cognitive powers and serves as an unshakeable gateway to top secondary schools and 11+ entrance exams.",
    metadata: { category: "Pedagogy & Technology", target_age: "All Ages" }
  },
  {
    id: "faq_q13",
    question: "Can my child use the abacus method for school homework?",
    answer: "Yes, children can use the abacus method for school homework. Because abacus training enables rapid mental calculation (Anzan), students often derive answers faster than their peers, leaving extra time to double-check their work.",
    metadata: { category: "Pedagogy & Technology", target_age: "All Ages" }
  },
  {
    id: "faq_q14",
    question: "Why is abacus learning more important now than ever in the age of AI?",
    answer: "In an AI-driven world, answers and information are instant and free, but the ability to process, evaluate, and make decisions remains a human skill. Abacus training in early childhood isn't just about calculation; it builds essential cognitive infrastructure—working memory, visualization (Anzan), spatial reasoning, and sustained focus. Practicing abacus early trains the brain to process complex data efficiently, giving children the mental agility and confidence needed to navigate an information-rich future.",
    metadata: { category: "Pedagogy & Technology", target_age: "All Ages" }
  },
  {
    id: "faq_q15",
    question: "My child is interested in numbers. Will she do well learning abacus?",
    answer: "Yes! An interest in numbers gives your child a great head start, but the abacus takes that interest a step further by bringing numbers to life through physical touch and movement. Unlike traditional pen-and-paper math, the abacus allows children to feel, slide, and visually manipulate numbers using tactile beads. This hands-on, multi-sensory approach strengthens their concrete understanding of quantities, place value, and patterns, turning math into a physical, game-like experience.",
    metadata: { category: "Pedagogy & Technology", target_age: "All Ages" }
  },
  {
    id: "faq_q16",
    question: "How long does it take for a child to master abacus mental math (Anzan)?",
    answer: "With our Anzan Digital Tool, students accelerate mental visual processing up to 3x faster than traditional methods, performing multi-digit mental math in as little as 6 months. Months 1-3 establish the physical foundation and early visualization drills; Months 3-6 achieve multi-digit mental addition, subtraction, and rapid-fire Anzan; Months 6+ expand to multi-digit multiplication, division, and high-speed complex operations with 10-15 minutes of daily practice.",
    metadata: { category: "Pedagogy & Technology", target_age: "All Ages" }
  },
  {
    id: "faq_q17",
    question: "Why do some children move their hands vigorously in the air during mental math, and is it required?",
    answer: "At AbacusForKids, initial finger movements are an essential bridge to mental math (Anzan), much like learning to touch-type on a keyboard. At first, slight finger movements help young learners 'feel' and position imaginary beads as kinesthetic muscle memory builds. Over time, as visualization solidifies in the brain, children naturally minimize and give up physical gestures altogether. While extreme arm waving is an unrefined habit, our guided learning path ensures students transition smoothly to performing rapid mental arithmetic calmly, silently, and motionlessly.",
    metadata: { category: "Pedagogy & Technology", target_age: "All Ages" }
  },
  {
    id: "faq_q18",
    question: "If my child grasps the abacus concepts quickly, can they skip levels or progress faster?",
    answer: "In the foundational stage: No. Understanding the technique intellectually is only 10% of the battle; the remaining 90% is converting it into kinesthetic muscle memory, requiring 6 to 9 months of consistent physical practice. In the mental math stage: Yes! Once physical logic is firmly set, students using our proprietary Anzan++ platform across 50+ stages who demonstrate mastery during mid-term assessments can be fast-tracked to higher levels immediately.",
    metadata: { category: "Pedagogy & Technology", target_age: "All Ages" }
  },
  {
    id: "faq_q19",
    question: "What is the difference between online and face-to-face abacus classes?",
    answer: "Face-to-Face (2 Hours) is ideal for young learners (ages 4-5 and up) requiring hands-on teacher guidance, physical workbooks, and iPad drills streamed to classroom TVs via AirPlay. Online (45 Minutes) is designed for older kids (ages 6+) who can manage focused screen time in micro-groups of 1 to 3 students using interactive screen simulations. Online classes are not recommended for 4 or 5-year-olds.",
    metadata: { category: "Logistics & Formats", target_age: "Ages 4-5" },
    downloadable_resources: [
      {
        resource_id: "res_curriculum_matrix",
        title: "Face-to-Face vs Online Curriculum Comparison Chart",
        file_type: "pdf",
        download_url: "https://assets.yourdomain.com/downloads/curriculum-comparison.pdf",
        description: "Summary comparison matrix detailing session durations, class sizes, and digital tools."
      }
    ]
  },
  {
    id: "faq_q20",
    question: "What is the class size, and is individual attention provided to each student?",
    answer: "Yes, both individual and collective attention are provided. Face-to-Face classes maintain 4 to 8 students per group, while Online classes maintain 1 to 3 students per group. Having taught since 2000 (and in the UK since 2005), we recognize children learn at different paces. If a student struggles with group progression, we provide dedicated 1-hour 1-on-1 support sessions with a teacher to rebuild their confidence.",
    metadata: { category: "Logistics & Formats", target_age: "All Ages" }
  },
  {
    id: "faq_q21",
    question: "Will a 2-hour face-to-face class be too long for a child who struggles to sit still?",
    answer: "Not at all. Sessions are broken into fast-paced, interactive blocks: 15 minutes of digital warm-up, 30 minutes of individual workbook practice (where children complete 50 to 150 sums), a 5-10 minute refresh break with individual homework feedback, and remaining time filled with gamified peer drills, oral speed runs, and Anzan++ challenges. The dynamic structure keeps children energized, and parents have never complained about duration in over 20 years.",
    metadata: { category: "Logistics & Formats", target_age: "Ages 4-5" }
  },
  {
    id: "faq_q22",
    question: "What if my child does not enjoy or get bored during the abacus class?",
    answer: "Classes transform math into hands-on play with colorful physical beads, safe frames, and onscreen peer-challenge games rather than rote drilling. Guided by instructors with over 20 years of experience, children gain real cognitive skills—focus, concentration, active listening, processing speed, and accuracy—that carry over into all school subjects.",
    metadata: { category: "Pedagogy & Technology", target_age: "All Ages" }
  },
  {
    id: "faq_q23",
    question: "Is homework necessary, and what is the role of parents in supporting it?",
    answer: "Yes, short daily practice of 10 to 20 minutes is essential to build muscle memory and Anzan visual speed. In the beginner stage, parents should sit alongside their child to encourage habit formation. In advanced stages, our digital practice tools track accuracy, speed, and auto-correction automatically, removing the need for parental policing. We recommend completing practice right before school homework as a brain warm-up.",
    metadata: { category: "Parent Support & Pricing", target_age: "All Ages" }
  },
  {
    id: "faq_q24",
    question: "Why do many children drop out of abacus programs mid-course, and how does your institute prevent this?",
    answer: "Dropouts rarely happen due to a lack of ability; they occur due to generic online tutors without standardized training or loss of momentum in the first 3 months. Unlike general tutoring centers, AbacusForKids specializes exclusively in abacus education with over 20 years of proven history. We guide parents through early routines and leverage proprietary Anzan visualization tools, ensuring long-term retention and mastery past the initial 6 months.",
    metadata: { category: "Parent Support & Pricing", target_age: "All Ages" }
  },
  {
    id: "faq_q25",
    question: "My child previously discontinued abacus classes elsewhere. Can they join your program and pick up from where they left off?",
    answer: "Yes, we warmly welcome students restarting their abacus journey! We conduct a friendly skills assessment before enrollment to evaluate current fluency, address any gaps in finger techniques or bead logic from generic tutoring, and ensure they are placed at the exact right level for long-term confidence.",
    metadata: { category: "Program Overview", target_age: "All Ages" }
  },
  {
    id: "faq_q26",
    question: "Why are your fees higher than some other providers?",
    answer: "Our fees offer unmatched value for money. When launched in the UK in 2005, tuition was £80 per month; today, we charge £350 per term (4 months), keeping pricing virtually unchanged for two decades despite inflation. Our fee is all-inclusive—covering free home-practice software, custom Anzan++ digital tools, small batch sizes (1-3 online, 4-8 in-person), and free 1-on-1 remedial sessions.",
    metadata: { category: "Parent Support & Pricing", target_age: "All Ages" }
  },
  {
    id: "faq_q27",
    question: "Can I learn the abacus myself to teach my own child at home?",
    answer: "Yes, absolutely! We offer a dedicated Teacher Training Program led by Dr. Geetha—the UK's top experienced abacus moderator, who has trained over 100+ certified teachers across the UK, US, and India. The curriculum spans 4 progressive stages (Starters, Movers, Master, Genius) with 8 hours of live online instruction per stage, 3 months practical application, and formal assessments, qualifying graduates to teach and build an income.",
    metadata: { category: "Teacher Training", target_age: "All Ages" }
  },
  {
    id: "faq_q28",
    question: "What qualifications are needed to become an abacus teacher?",
    answer: "No advanced mathematics degree or prior specialized teaching experience is needed. The core requirements are dedication to children's growth, clear and encouraging communication, teaching discipline, and completing our 4-stage Teacher Training Program. We provide all specialized teaching tools, digital portals, and pedagogical training.",
    metadata: { category: "Teacher Training", target_age: "All Ages" }
  },
  {
    id: "faq_q29",
    question: "What materials or tools does my child need to start classes?",
    answer: "At AbacusForKids, enrollment includes a one-time £150.00 Registration and Starter Materials Fee covering an Official Student Abacus, branded bag, Level 1 workbooks (2 books), dedicated practice notebook, and pencil. All subsequent level workbooks (2 books per level up to Level 9), additional practice notebooks, listening books, holiday packs, and digital homework tools are provided 100% free of charge as long as your child remains enrolled. Regular tuition is £350.00 per term across 3 terms per year (starting September, January, and May).",
    metadata: { category: "Parent Support & Pricing", target_age: "All Ages" }
  },
  {
    id: "faq_q30",
    question: "How is my child's progress evaluated, and how do they advance to the next level?",
    answer: "At AbacusForKids, advancement is based on skill mastery rather than arbitrary time. Around the 13th week of each 3-month level (12 weeks instruction), students take a 20- to 45-minute formal assessment conducted by the Centre Manager during class. Early levels evaluate physical bead mechanics; higher levels add Mental Oral, Mental Visual (Anzan), Multiplications, Divisions, and Flash Memory. Regular 10-15 minute daily practice is all that is required to pass. Corrected sheets and digital portal reports are reviewed with parents, and students receive an official Level Completion Certificate before advancing.",
    metadata: { category: "Program Overview", target_age: "All Ages" }
  },
  {
    id: "faq_q31",
    question: "What technical setup do we need at home for online abacus classes?",
    answer: "For online classes (ages 6+), your child needs a laptop, desktop, or iPad/tablet with a stable internet connection and a working camera and microphone. Because online groups are strictly capped at 1 to 3 students, teachers need to clearly observe your child's hands and finger movements on their physical or digital abacus during exercises.",
    metadata: { category: "Logistics & Formats", target_age: "Ages 6+" }
  },
  {
    id: "faq_q32",
    question: "Can my child attend a trial session before committing to a full term?",
    answer: "Yes, absolutely! At AbacusForKids, parents can first complete our Free Online Eligibility Assessment (https://eynko-server-production.up.railway.app/assessment/) to evaluate numerical fluency, image processing skills (translating numbers into beads and beads into numbers), and general math comfort. Parents automatically receive a WhatsApp message with results and booking links for a 1-on-1 or small group Taster Session, confirming readiness (numbers 1-20) before full term enrollment.",
    metadata: { category: "Program Overview", target_age: "Ages 4-5" }
  },
  {
    id: "faq_q33",
    question: "How does AbacusForKids help with 11+ and top secondary school entrance exams?",
    answer: "Gaining admission into top UK grammar and secondary schools is the premier gateway to top global universities like Oxford, Cambridge, and Imperial. While many Year 6 students prepare similarly, last-minute cramming cannot replace early cognitive groundwork laid in Years 1 to 3. Simply put, there is no alternative course that builds as strong a foundational skill for 11+ success as abacus. Anzan mental calculation enables rapid multi-digit arithmetic under severe time pressure, freeing up test time for complex word problems and non-verbal reasoning papers. In Dr. Geetha's 20+ years of experience, students completing our 2-year advanced curriculum clear 11+ exams comfortably, with alumni—including Dr. Geetha's own two children—graduating into elite careers as Doctors, Actuaries, Barristers, and Engineers.",
    metadata: { category: "Pedagogy & Technology", target_age: "All Ages" }
  }
];

async function seedDatabase() {
  try {
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(process.env.MONGODB_URI_100SUM);
    console.log("Connected successfully!");

    for (const item of rawFaqData) {
      console.log(`Generating embedding for: ${item.id} - ${item.question}`);
      
      // Combine question and answer for richer semantic context
      const textToEmbed = `Question: ${item.question}\nAnswer: ${item.answer}`;

      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: textToEmbed,
      });

      const vector = embeddingResponse.data[0].embedding;

      // Upsert into MongoDB Atlas
      await FaqVector.findOneAndUpdate(
        { id: item.id },
        {
          id: item.id,
          question: item.question,
          answer: item.answer,
          embedding: vector,
          metadata: item.metadata,
          downloadable_resources: item.downloadable_resources || []
        },
        { upsert: true, new: true }
      );
    }

    console.log("All 33 FAQs successfully embedded and saved to MongoDB Atlas!");
    process.exit(0);

  } catch (error) {
    console.error("Seeding Error:", error);
    process.exit(1);
  }
}

seedDatabase();