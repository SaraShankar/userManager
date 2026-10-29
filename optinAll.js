// optinAll.js
const mongoose = require('mongoose');

// Paste your actual MongoDB URI directly in quotes
const MONGO_URI = 'mongodb+srv://Eynko_Saravanan:UMensEynko0407@cluster0.onsm0f9.mongodb.net/100Sum?retryWrites=true&w=majority';

async function optInAllUsers() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB...');

    const result = await mongoose.connection.db.collection('users').updateMany(
      {},
      {
        $set: {
          whatsappConsent: {
            optIn: true,
            consentedAt: new Date(),
            source: 'admin_bulk_optin'
          }
        }
      }
    );

    console.log(`✅ Successfully updated ${result.modifiedCount} users to Opted-In!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating users:', error);
    process.exit(1);
  }
}

optInAllUsers();