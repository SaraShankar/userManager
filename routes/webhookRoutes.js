const express = require('express');
const router = express.Router();
const { verifyWebhook, handleWebhook } = require('../controllers/webhookController');

/**
 * Meta Webhook Endpoints
 * 
 * Supports both root `/webhook` and path-specific `/webhook/whatsapp`
 * to handle WhatsApp Cloud API & Meta Lead Ads verification and payloads.
 */

// GET: Verification handshakes for Meta Webhooks
router.get('/', verifyWebhook);
router.get('/whatsapp', verifyWebhook);

// POST: Real-time event receiver (WhatsApp messages/statuses & Lead Ads)
router.post('/', handleWebhook);
router.post('/whatsapp', handleWebhook);

module.exports = router;