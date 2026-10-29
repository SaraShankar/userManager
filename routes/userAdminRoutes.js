const express = require('express');
const router = express.Router();

// Import models to ensure singleton registration
require('../models/userSchema');
require('../models/effortSchema');

// Import controllers
const { 
  getAllUsers, 
  createUser, 
  updateUser, 
  deleteUser, 
  getWhatsAppUsers, 
  sendUserWhatsApp,
  sendBatchWhatsApp,
  getWhatsAppConversations,
  getPhoneMessages,
  sendReplyWhatsApp
} = require('../controllers/userAdminController');

const {
  getCampaigns,
  createCampaign,
  updateCampaignStatus
} = require('../controllers/adsController');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// --- Standard User Management CRUD Routes ---
router.route('/users')
  .get(asyncHandler(getAllUsers))
  .post(asyncHandler(createUser));

router.route('/users/:id')
  .put(asyncHandler(updateUser))
  .delete(asyncHandler(deleteUser));

// --- WhatsApp Broadcast & Dispatch Routes ---
router.get('/whatsapp-eligible', asyncHandler(getWhatsAppUsers));
router.post('/send-whatsapp', asyncHandler(sendUserWhatsApp));

// Support both naming conventions so the Vue dispatch button never fails
router.post('/send-whatsapp-batch', asyncHandler(sendBatchWhatsApp));
router.post('/send-batch-whatsapp', asyncHandler(sendBatchWhatsApp)); // Alias

// --- WhatsApp 2-Way Inbox Routes ---
router.get('/whatsapp/conversations', asyncHandler(getWhatsAppConversations));
router.get('/whatsapp-conversations', asyncHandler(getWhatsAppConversations)); // Alias
router.get('/whatsapp/messages/:phone', asyncHandler(getPhoneMessages));
router.post('/whatsapp/reply', asyncHandler(sendReplyWhatsApp));

// --- Meta Marketing API Ad Campaign Routes ---
router.route('/ads/campaigns')
  .get(asyncHandler(getCampaigns))
  .post(asyncHandler(createCampaign));

router.post('/ads/campaigns/:id/status', asyncHandler(updateCampaignStatus));

module.exports = router;