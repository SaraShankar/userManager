require('dotenv').config();
const mongoose = require('mongoose');

async function syncUsers() {
  try {
    // 1. Fetch connection string from environment or process variables
    const mongoUri = process.env.MONGODB_URI_100SUM || process.env.MONGO_URI_100SUM || process.env.MONGO_URI;

    if (!mongoUri || !mongoUri.startsWith('mongodb')) {
      console.error('❌ Error: No valid MongoDB connection string found in process.env.');
      console.log('👉 Please paste your actual mongodb+srv:// connection string into syncUsers.js at line 14.');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB!');

    // 2. Update all 124 user records to restore visibility and opt-in consent
    const result = await mongoose.connection.db.collection('users').updateMany(
      {},
      {
        $set: {
          isActive: true,
          'whatsappConsent.optIn': true,
          'whatsappConsent.optInDate': new Date(),
          'whatsappConsent.optInSource': 'in_app'
        }
      }
    );

    console.log(`🚀 Success! Updated ${result.modifiedCount} user records with isActive: true and valid consent.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error syncing users:', error);
    process.exit(1);
  }
}

syncUsers();