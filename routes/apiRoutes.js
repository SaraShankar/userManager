const express = require('express');
const router = express.Router();

// Controllers
const ragController = require('../controllers/ragController');
const adsController = require('../controllers/adsController');

// 1. Ads Routes (Guarded so missing methods don't crash startup)
if (adsController && typeof adsController.listCampaigns === 'function') {
  router.get('/ads/campaigns', adsController.listCampaigns);
}
if (adsController && typeof adsController.createCampaign === 'function') {
  router.post('/ads/campaigns', adsController.createCampaign);
}

// 2. RAG Vector Search Endpoint
if (typeof ragController.searchKnowledgeBase === 'function') {
  router.post('/rag/query', ragController.searchKnowledgeBase);
}

// 3. Web Chat Endpoint (for WordPress Deep Chat widget)
if (typeof ragController.handleWebChat === 'function') {
  router.post('/web-chat', ragController.handleWebChat);
} else {
  console.warn('⚠️ Warning: ragController.handleWebChat is not defined!');
}

module.exports = router;