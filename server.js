require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const webhookRoutes = require('./routes/webhookRoutes');
const userAdminRoutes = require('./routes/userAdminRoutes');
const faqRoutes = require('./routes/faqRoutes');

const app = express();

// Disable Mongoose command buffering to prevent timeout hangs
mongoose.set('bufferCommands', false);

// 1. Universal CORS Configuration
app.use(cors({
  origin: true, // Auto-echoes requesting origin (localhost:5174, etc.)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// 2. Body Parser Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 4. Meta Webhooks Routing
// Mount both `/webhook` and `/api/webhooks` to handle root or nested Meta dashboard callbacks
app.use('/webhook', webhookRoutes);
app.use('/api/webhooks', webhookRoutes);

// 5. API Admin Routes (Users, WhatsApp Dispatch, WhatsApp Inbox, Ads Management)
app.use('/api/admin', userAdminRoutes);

// 6. RAG Vector Search FAQ Endpoint
app.use('/api/faq', faqRoutes);

// 7. Global 404 Handler for Unmatched API Requests
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
});

// 8. Connect Database FIRST, then start Express server
const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => console.log(`🚀 UserManager Admin Service running on port ${PORT}`));
  } catch (error) {
    console.error('❌ Database connection failed on startup:', error.message);
    process.exit(1);
  }
};

startServer();