// checkDocs.js
require('dotenv').config();
const mongoose = require('mongoose');
const FaqVector = require('./models/faqVectorSchema');

async function check() {
  const uri = process.env.MONGODB_URI_100SUM || process.env.MONGO_URI;
  console.log('Connecting to URI database:', uri.split('/').pop().split('?')[0]);
  await mongoose.connect(uri);

  const count = await FaqVector.countDocuments();
  console.log('Total FAQ docs in collection:', count);

  const sample = await FaqVector.findOne({ id: 'faq_direct_phone_call_availability' });
  console.log('Found new FAQ doc?:', !!sample);
  if (sample) {
    console.log('Embedding array length:', sample.embedding?.length);
  }
  process.exit(0);
}
check();