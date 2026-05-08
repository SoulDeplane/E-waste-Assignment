const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../config/prisma');
const { signAccess, signRefresh, verify } = require('../utils/jwt');
const {
  notifyEmailVerification,
  notifyPasswordReset
} = require('../utils/notify');

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const registerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(190),
  password: z.string().min(8).max(128),
  role: z.enum(['user', 'recycler']),
  phone: z.string().max(20).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({
  token: z.string().min(20).max(128),
  password: z.string().min(8).max(128)
});
const tokenOnlySchema = z.object({ token: z.string().min(20).max(128) });
const refreshSchema = z.object({ refreshToken: z.string().min(20) });
const resendSchema = z.object({ email: z.string().email() });

// Generates a random 32-byte hex token used for verification, reset, and refresh secrets.
function rawToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Hashes a raw token with SHA-256 so only the digest is stored in the database.
function hashToken(t) {
  return crypto.createHash('sha256').update(t).digest('hex');
}

// Strips sensitive fields from a User row before sending it to the client.
function safeUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone,
    profilePicUrl: u.profilePicUrl,
    emailVerifiedAt: u.emailVerifiedAt ? u.emailVerifiedAt.toISOString() : null
  };
}

// Persists a new RefreshToken row for a user and returns the raw value to send back.
async function issueRefreshToken(userId, userAgent) {
  const token = rawToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent: userAgent ? String(userAgent).slice(0, 255) : null
    }
  });
  return token;
}

// Creates a new account, dispatches a verification email, and immediately logs the user in.
async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, email, password, role, phone } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role, phone }
  });

  const verifyToken = rawToken();
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(verifyToken),
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS)
    }
  });
  notifyEmailVerification(user.email, verifyToken);

  const accessToken = signAccess({ sub: user.id, role: user.role });
  const refreshToken = await issueRefreshToken(user.id, req.headers['user-agent']);
  res.status(201).json({
    accessToken,
    refreshToken,
    user: safeUser(user),
    verificationEmailSent: true
  });
}

// Authenticates an existing user by email and password and returns access + refresh tokens.
async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const accessToken = signAccess({ sub: user.id, role: user.role });
  const refreshToken = await issueRefreshToken(user.id, req.headers['user-agent']);
  res.json({ accessToken, refreshToken, user: safeUser(user) });
}

// Returns the currently authenticated user's profile.
async function me(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      profilePicUrl: true,
      createdAt: true,
      emailVerifiedAt: true
    }
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
}

const updateMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(190).optional(),
  phone: z.string().max(20).optional().nullable(),
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().min(8).max(128).optional()
});

// Updates the current user's profile fields, requiring current password for email or password changes.
async function updateMe(req, res) {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, email, phone, currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const data = {};
  let needsReverification = false;
  let needsCurrentPassword = false;

  if (typeof name === 'string' && name !== user.name) data.name = name;
  if (phone !== undefined && phone !== user.phone) data.phone = phone || null;

  const wantsEmailChange = typeof email === 'string' && email.toLowerCase() !== user.email.toLowerCase();
  if (wantsEmailChange) {
    needsCurrentPassword = true;
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists && exists.id !== user.id) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    data.email = email;
    data.emailVerifiedAt = null;
    needsReverification = true;
  }

  if (newPassword) {
    needsCurrentPassword = true;
    data.passwordHash = await bcrypt.hash(newPassword, 12);
  }

  if (needsCurrentPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required to change email or password.' });
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  if (Object.keys(data).length === 0) {
    return res.json({ user: safeUser(user) });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      profilePicUrl: true,
      emailVerifiedAt: true
    }
  });

  if (newPassword) {
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  if (needsReverification) {
    const token = rawToken();
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS)
      }
    });
    notifyEmailVerification(updated.email, token);
  }

  res.json({
    user: safeUser(updated),
    needsReverification,
    passwordChanged: !!newPassword
  });
}

// Saves a multer-uploaded avatar image and updates the user's profilePicUrl.
async function uploadAvatar(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, profilePicUrl: true }
  });
  if (!user) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'User not found' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const finalName = `${user.id}${ext}`;
  const finalPath = path.join(req.file.destination, finalName);
  fs.renameSync(req.file.path, finalPath);

  if (user.profilePicUrl) {
    const oldName = path.basename(user.profilePicUrl);
    if (oldName !== finalName) {
      const oldPath = path.join(req.file.destination, oldName);
      fs.unlink(oldPath, () => {});
    }
  }

  const profilePicUrl = `/uploads/avatars/${finalName}`;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { profilePicUrl },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      profilePicUrl: true
    }
  });

  res.json({ user: safeUser(updated) });
}

// Issues a password-reset token by email; always returns 200 to avoid leaking which emails exist.
async function forgotPassword(req, res) {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user) {
    const token = rawToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS)
      }
    });
    notifyPasswordReset(user.email, token);
  }
  res.json({ status: 'ok' });
}

// Consumes a password-reset token and replaces the user's password, revoking all refresh tokens.
async function resetPassword(req, res) {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) }
  });
  if (!record || record.consumedAt || record.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash }
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() }
    }),
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    })
  ]);

  res.json({ status: 'password_reset' });
}

// Consumes a one-time email-verification token and marks the user as verified.
async function verifyEmail(req, res) {
  const parsed = tokenOnlySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) }
  });
  if (!record || record.consumedAt || record.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() }
    }),
    prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() }
    })
  ]);

  res.json({ status: 'verified' });
}

const resendBuckets = new Map();

// Returns true if the email is allowed to resend now (in-memory rate cap of 1/min).
function checkResendRate(email) {
  const now = Date.now();
  const last = resendBuckets.get(email) || 0;
  if (now - last < 60_000) return false;
  resendBuckets.set(email, now);
  return true;
}

// Sends a fresh verification email for an unverified account, rate-limited per email.
async function resendVerification(req, res) {
  const parsed = resendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email } = parsed.data;

  if (!checkResendRate(email)) {
    return res.status(429).json({ error: 'Please wait a minute before requesting another email.' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerifiedAt) {
    const token = rawToken();
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS)
      }
    });
    notifyEmailVerification(user.email, token);
  }
  res.json({ status: 'ok' });
}

// Rotates a refresh token; on reuse of a revoked token, revokes the user's entire refresh chain.
async function refresh(req, res) {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const tokenHash = hashToken(parsed.data.refreshToken);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!record) return res.status(401).json({ error: 'Invalid refresh token' });

  if (record.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    return res.status(401).json({ error: 'Refresh token reuse detected - please log in again.' });
  }
  if (record.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Refresh token expired' });
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) return res.status(401).json({ error: 'User not found' });

  const newRaw = rawToken();
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() }
    }),
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(newRaw),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        userAgent: req.headers['user-agent']
          ? String(req.headers['user-agent']).slice(0, 255)
          : null
      }
    })
  ]);

  const accessToken = signAccess({ sub: user.id, role: user.role });
  res.json({ accessToken, refreshToken: newRaw, user: safeUser(user) });
}

// Revokes the supplied refresh token, ending one session.
async function logout(req, res) {
  const parsed = refreshSchema.safeParse(req.body || {});
  if (parsed.success) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(parsed.data.refreshToken), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }
  res.json({ status: 'ok' });
}

module.exports = {
  register,
  login,
  me,
  updateMe,
  uploadAvatar,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  refresh,
  logout
};
