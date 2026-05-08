const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/admin.controller');

const router = express.Router();

router.use(auth, requireRole('admin'));

router.get('/stores', ctrl.listStores);
router.post('/stores/:id/approve', ctrl.approveStore);
router.post('/stores/:id/reject', ctrl.rejectStore);
router.get('/analytics/summary', ctrl.analyticsSummary);

module.exports = router;
