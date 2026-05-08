const nodemailer = require('nodemailer');

let transporter = null;

// Returns a singleton Nodemailer transporter; falls back to a console-only stub when SMTP_HOST is unset.
function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) {
    console.warn('[mailer] SMTP_HOST not set - emails will be logged to this terminal only.');
    transporter = {
      sendMail: async (opts) => {
        const sep = '='.repeat(72);
        console.log('\n' + sep);
        console.log('[mailer:dev] To:     ', opts.to);
        console.log('[mailer:dev] Subject:', opts.subject);
        console.log('[mailer:dev] Body:');
        console.log(opts.text || opts.html || '(no body)');
        console.log(sep + '\n');
        return { messageId: 'dev-' + Date.now() };
      }
    };
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });
  return transporter;
}

module.exports = { getTransporter };
