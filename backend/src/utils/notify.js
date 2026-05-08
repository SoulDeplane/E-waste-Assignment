const { getTransporter } = require('../config/mailer');

const FROM = process.env.MAIL_FROM || 'E-Waste <noreply@ewaste.local>';
const FRONTEND = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

// Sends mail through the configured transporter, swallowing failures so the API never breaks on mail issues.
function safeSend(opts) {
  return getTransporter()
    .sendMail({ from: FROM, ...opts })
    .catch((err) => console.error('[notify] mail send failed:', err.message));
}

// Emails a recycler that their store listing was approved by an admin.
function notifyStoreApproved(recyclerEmail, storeName) {
  return safeSend({
    to: recyclerEmail,
    subject: `Your store "${storeName}" is now Live`,
    text: `Good news! An admin has approved "${storeName}". Your store is now visible to users on the platform.`
  });
}

// Emails a recycler that a user has expressed interest by clicking Contact.
function notifyStoreContacted(recyclerEmail, userName, storeName) {
  return safeSend({
    to: recyclerEmail,
    subject: `New contact for "${storeName}"`,
    text: `${userName} has contacted your store "${storeName}". Log in to your dashboard to view their details.`
  });
}

// Emails a newly registered user a one-time link to verify their address.
function notifyEmailVerification(email, token) {
  const link = `${FRONTEND}/verify-email?token=${token}`;
  return safeSend({
    to: email,
    subject: 'Verify your E-Waste account',
    text: `Welcome! Please confirm your email by opening this link (valid for 24 hours):\n\n${link}\n\nIf you didn't sign up, you can ignore this email.`
  });
}

// Emails a user a one-time link to reset their password.
function notifyPasswordReset(email, token) {
  const link = `${FRONTEND}/reset-password?token=${token}`;
  return safeSend({
    to: email,
    subject: 'Reset your E-Waste password',
    text: `We received a request to reset your password. Open the link below within 1 hour:\n\n${link}\n\nIf you didn't request this, you can safely ignore this email.`
  });
}

// Emails a recycler that a user has requested a pickup at their store.
function notifyPickupRequested(recyclerEmail, userName, storeName, dateStr, timeSlot) {
  return safeSend({
    to: recyclerEmail,
    subject: `New pickup request for "${storeName}"`,
    text: `${userName} requested a pickup at "${storeName}" on ${dateStr} (${timeSlot}). Log in to your dashboard to confirm or decline.`
  });
}

// Emails a user when their pickup transitions to a new status (confirmed, declined, completed, cancelled).
function notifyPickupStatus(userEmail, storeName, status, dateStr) {
  const subject = `Pickup ${status} - ${storeName}`;
  const messages = {
    confirmed: `Your pickup at "${storeName}" on ${dateStr} has been confirmed.`,
    declined: `Sorry - "${storeName}" declined your pickup request for ${dateStr}.`,
    completed: `Your pickup at "${storeName}" on ${dateStr} is marked completed. You can now leave a review.`,
    cancelled: `Your pickup at "${storeName}" on ${dateStr} was cancelled.`
  };
  return safeSend({
    to: userEmail,
    subject,
    text: messages[status] || `Pickup status updated to ${status}.`
  });
}

module.exports = {
  notifyStoreApproved,
  notifyStoreContacted,
  notifyEmailVerification,
  notifyPasswordReset,
  notifyPickupRequested,
  notifyPickupStatus
};
