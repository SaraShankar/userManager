require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const webhookRoutes = require('./routes/webhookRoutes');
const userAdminRoutes = require('./routes/userAdminRoutes');
const faqRoutes = require('./routes/faqRoutes');

const app = express();

// 1. Railway Proxy Configuration
// Required behind Railway's reverse proxy for correct client IP & protocol resolution
app.set('trust proxy', 1);

// Disable Mongoose command buffering to fail fast if DB connection drops
mongoose.set('bufferCommands', false);

// 2. Universal CORS Configuration
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
  })
);

// 3. Body Parser Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Railway Health Check Endpoints (Root & /health)
const healthHandler = (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  res.status(isDbConnected ? 200 : 503).json({
    status: isDbConnected ? 'OK' : 'DEGRADED',
    database: isDbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
};

app.get('/health', healthHandler);
app.head('/health', healthHandler);
app.get('/', healthHandler);
app.head('/', healthHandler);

// 5. Meta Webhooks Routing
app.use('/webhook', webhookRoutes);
app.use('/api/webhooks', webhookRoutes);

// 6. API Admin Routes
app.use('/api/admin', userAdminRoutes);

// 7. RAG Vector Search FAQ Endpoint
app.use('/api/faq', faqRoutes);

// 8. Global 404 Handler for Unmatched Routes
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
});

// 9. Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack || err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

// 10. Railway Port & Host Binding
const PORT = process.env.PORT || 5001;
const HOST = '0.0.0.0'; // Crucial for Railway container routing

let server;

const startServer = async () => {
  try {
    await connectDB();
    server = app.listen(PORT, HOST, () => {
      console.log(`🚀 UserManager running on ${HOST}:${PORT} (Railway Environment)`);
    });
  } catch (error) {
    console.error('❌ Database connection failed on startup:', error.message);
    process.exit(1);
  }
};

startServer();

// 11. Graceful Shutdown on Railway Deployment Rot