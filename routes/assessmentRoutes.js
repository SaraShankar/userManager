const express = require('express');
const router = express.Router();
const { checkDuplicate, saveAssessment, requestCallback } = require('../controllers/assessmentController');

router.post('/check-duplicate', checkDuplicate);
router.post('/save', saveAssessment);
router.post('/request-callback', requestCallback);

module.exports = router;