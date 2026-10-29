const express = require('express');
const router = express.Router();

// Controllers
const adsController = require('../controllers/adsController');
const ragController = require('../controllers/ragController');

// Ads Routes
router.route('/ads/campaigns')
  .get(adsController.listCampaigns)
  .post(adsController.createCampaign);

// RAG Vector Search Endpoint
router.post('/rag/query', ragController.searchKnowledgeBase);

module.exports = router;