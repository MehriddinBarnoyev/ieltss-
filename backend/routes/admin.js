// routes/admin.js (updated with new routes)

const express = require('express');
const { authenticate, isAdmin } = require('../middleware/auth');
const { createTest, editTest, deleteTest, getTestResults, getTestFeedback, getAllResults } = require('../controllers/admin.controller');
const router = express.Router();

router.use(authenticate);
router.use(isAdmin);

router.post('/tests', createTest);
router.put('/tests/:id', editTest);
router.delete('/tests/:id', deleteTest);
router.get('/tests/:id/results', getTestResults);
router.get('/tests/:id/feedback', getTestFeedback);
router.get('/tests/results', getAllResults);

module.exports = router;