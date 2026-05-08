const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/review.controller');

const router = express.Router();

router.post('/', auth, requireRole('user'), ctrl.createReview);

module.exports = router;
