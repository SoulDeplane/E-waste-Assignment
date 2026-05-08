const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/store.controller');

const router = express.Router();

router.use(auth, requireRole('user'));

router.get('/', ctrl.listStores);
router.get('/contacted', ctrl.listContacted);
router.post('/:id/contact', ctrl.contactStore);
router.delete('/:id/contact', ctrl.revokeContact);
router.get('/:id/reviews', ctrl.listStoreReviews);

module.exports = router;
