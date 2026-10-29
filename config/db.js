const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const dbURI = process.env.MONGODB_URI_100SUM;

        if (!dbURI) {
            throw new Error("MONGODB_URI_100SUM is undefined. Check your .env file!");
        }

        const conn = await mongoose.connect(dbURI);
        console.log(`🚀 Connected to MongoDB Atlas (100Sum): ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ DB Connection Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;