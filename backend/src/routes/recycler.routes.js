const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/recycler.controller');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'logos');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `tmp-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Only jpg/png/webp images are allowed'), ok);
  }
});

router.use(auth, requireRole('recycler'));

router.get('/stores', ctrl.listStores);
router.post('/stores', ctrl.createStore);
router.get('/stores/:id', ctrl.getStore);
router.put('/stores/:id', ctrl.updateStore);
router.post('/stores/:id/logo', upload.single('logo'), ctrl.uploadLogo);
router.get('/stores/:id/contacts', ctrl.listOwnContacts);
router.post('/stores/:id/contacts/:contactId/connect', ctrl.connectContact);
router.get('/stores/:id/reviews', ctrl.listOwnReviews);

module.exports = router;
