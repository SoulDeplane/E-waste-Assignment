const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

const avatarDir = path.join(__dirname, '..', '..', 'uploads', 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `tmp-${Date.now()}${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Only jpg/png/webp images are allowed'), ok);
  }
});

router.post('/register', authLimiter, ctrl.register);
router.post('/login', authLimiter, ctrl.login);
router.get('/me', auth, ctrl.me);
router.patch('/me', auth, ctrl.updateMe);
router.post('/me/avatar', auth, avatarUpload.single('avatar'), ctrl.uploadAvatar);

router.post('/forgot-password', authLimiter, ctrl.forgotPassword);
router.post('/reset-password', authLimiter, ctrl.resetPassword);
router.post('/verify-email', authLimiter, ctrl.verifyEmail);
router.post('/resend-verification', authLimiter, ctrl.resendVerification);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);

module.exports = router;
