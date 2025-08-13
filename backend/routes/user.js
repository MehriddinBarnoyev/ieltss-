// routes/user.js (updated with new route)

const express = require('express');
const { startTest, submitTest, submitFeedback } = require('../controllers/user.controller');
const router = express.Router();

router.post('/tests/start', startTest);
router.post('/tests/:id/submit', submitTest);
router.post('/tests/:id/feedback', submitFeedback);

module.exports = router;