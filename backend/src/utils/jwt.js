const jwt = require('jsonwebtoken');

// Returns the JWT signing secret from env or throws if misconfigured.
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

// Signs a legacy single-token JWT used by routes that pre-date the access/refresh split.
function sign(payload) {
  return jwt.sign(payload, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
}

// Signs a short-lived access token (default 15 minutes).
function signAccess(payload) {
  return jwt.sign(payload, getSecret(), {
    expiresIn: process.env.JWT_ACCESS_TTL || '15m'
  });
}

// Signs a long-lived refresh token (default 30 days).
function signRefresh(payload) {
  return jwt.sign(payload, getSecret(), {
    expiresIn: process.env.JWT_REFRESH_TTL || '30d'
  });
}

// Verifies a JWT and returns its payload, or throws if invalid/expired.
function verify(token) {
  return jwt.verify(token, getSecret());
}

module.exports = { sign, signAccess, signRefresh, verify };
