const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/pickup.controller');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'pickups');
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

router.use(auth);

router.post('/', requireRole('user'), ctrl.createPickup);
router.get('/mine', requireRole('user'), ctrl.listMine);
router.patch('/:id/cancel', requireRole('user'), ctrl.cancelPickup);
router.post(
  '/:id/items/:itemId/photo',
  requireRole('user'),
  upload.single('photo'),
  ctrl.uploadItemPhoto
);

router.get('/store', requireRole('recycler'), ctrl.listForStore);
router.patch('/:id/status', requireRole('recycler'), ctrl.patchStatus);

router.get('/:id', requireRole('user', 'recycler'), ctrl.getPickup);

module.exports = router;
