require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

// Route Imports
const webhookRoutes = require('./routes/webhookRoutes');
const userAdminRoutes = require('./routes/userAdminRoutes');
const faqRoutes = require('./routes/faqRoutes');
const assessmentRoutes = require('./routes/assessmentRoutes');

const app = express();

// 1. Port & Host Configuration (Declared early to prevent TDZ/ReferenceError)
const PORT = Number(process.env.PORT) || 5001;
const HOST = '0.0.0.0';

// 2. Railway Proxy Configuration
app.set('trust proxy', 1);

// Disable Mongoose command buffering to prevent request hangs if DB disconnects
mongoose.set('bufferCommands', false);

// 3. Universal CORS Configuration
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
  })
);

// 4. Body Parser Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Lightweight Health Check Endpoints (Guaranteed 200 for Railway Edge Proxy)
const healthHandler = (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
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

// 6. Application Routes
app.use('/webhook', webhookRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/admin', userAdminRoutes);
app.use('/api/faq', faqRoutes);
app.use('/api/assessment', assessmentRoutes);

// 7. Global 404 Handler for Unmatched Routes
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
});

// 8. Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack || err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

// 9. Startup & Database Connection
const startServer = async () => {
  const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 UserManager listening on http://${HOST}:${PORT}`);
  });

  server.on('error', (err) => {
    console.error('❌ Express server startup error:', err);
    process.exit(1);
  });

  try {
    await connectDB();
    console.log('✅ MongoDB connection established successfully.');
  } catch (dbError) {
    console.error('⚠️ Warning: Initial MongoDB connection failed:', dbError.message);
  }
};

startServer();