const express = require('express');
const router = express.Router();
const faqController = require('../controllers/faqController');

router.post('/ask', faqController.handleFaqQuery);

module.exports = router;