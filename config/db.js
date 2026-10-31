const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Check primary URI first, with standard fallbacks
    const dbURI =
      process.env.MONGODB_URI_100SUM ||
      process.env.MONGODB_URI ||
      process.env.MONGO_URI;

    if (!dbURI) {
      throw new Error('MongoDB URI is missing in environment variables. Define MONGODB_URI_100SUM in Railway/env.');
    }

    // Production-ready connection options
    const options = {
      maxPoolSize: 10,              // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of hanging
      socketTimeoutMS: 45000,       // Close sockets after 45s of inactivity
    };

    const conn = await mongoose.connect(dbURI, options);
    console.log(`🚀 Connected to MongoDB Atlas (100Sum): ${conn.connection.host}/${conn.connection.name}`);

    // Lifecycle monitoring for Railway container restarts or Atlas failovers
    mongoose.connection.on('error', (err) => {
      console.error(`❌ MongoDB Runtime Error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB connection lost. Attempting reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB connection restored.');
    });

    return conn;
  } catch (error) {
    console.error(`❌ DB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;