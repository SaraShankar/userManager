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
app.set('trust proxy', 1);

// Disable Mongoose command buffering to prevent request hangs if DB temporarily disconnects
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

// 4. Lightweight Health Check Endpoints (Guaranteed 200 for Railway Edge Proxy)
const healthHandler = (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  // Always return 200 so Railway's proxy never triggers a 502 Bad Gateway
  res.status(200).json({
    status: 'OK',
    database: isDbConnected ? 'connected' : 'connecting_or_disconnected',
    port: PORT,
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

// 10. Explicit Port & Host Binding for Railway
// Fallback defaults to 5001 to align with Railway Public Networking -> Port 5001
const PORT = Number(process.env.PORT) || 5001;
const HOST = '0.0.0.0';

const startServer = async () => {
  // Start Express first so Railway passes health checks immediately
  const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 UserManager listening on http://${HOST}:${PORT}`);
  });

  server.on('error', (err) => {
    console.error('❌ Express server startup error:', err);
    process.exit(1);
  });

  // Connect to Database
  try {
    await connectDB();
    console.log('✅ MongoDB connection established successfully.');
  } catch (dbError) {
    console.error('⚠️ Warning: Initial MongoDB connection failed:', dbError.message);
    // Do not crash the entire process immediately so the container stays up for debugging
  }
};

startServer();