import { config } from '../config.js';
import { logger } from '../logger.js';

// ============================================================================
// Outbound email for auth flows (login OTP, signup email verification, password
// reset). One branded, email-client-safe HTML template (table layout + inline
// styles + preheader) is shared across all three for a consistent look.
//
// Transport is chosen by env: when SENDGRID_API_KEY is set we send via SendGrid
// (lazy-imported so the API boots/builds without the dep when unused); otherwise
// a dev/log transport just logs the message — so the whole flow is testable with
// no provider configured.
// ============================================================================

let sgMail = null;
let sgReady = false;

async function getSendgrid() {
  if (sgReady) return sgMail;
  const mod = await import('@sendgrid/mail');           // lazy — optional dependency
  sgMail = mod.default || mod;
  sgMail.setApiKey(config.email.sendgridApiKey);
  sgReady = true;
  return sgMail;
}

async function send({ to, subject, text, html }) {
  if (!config.email.sendgridApiKey) {
    // Dev/log transport: never send, just surface the content in the server log.
    logger.info({ to, subject, text }, '[email:dev] not sent (no SENDGRID_API_KEY)');
    return;
  }
  try {
    const sg = await getSendgrid();
    await sg.send({
      to,
      from: config.email.from,
      subject,
      text,
      html,
      // These are transactional security emails (reset link / OTP). Disable
      // SendGrid click tracking so it doesn't rewrite our links through the
      // account's branded-link domain (url####.jubileeinspire.com) — that
      // both hides the real jubilujah.com URL and routes the one-time reset
      // token through SendGrid's redirector. Open tracking pixel off too.
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
        openTracking: { enable: false },
        subscriptionTracking: { enable: false },
      },
    });
    logger.info({ to, subject }, 'email sent (sendgrid)');
  } catch (err) {
    // Surface to the caller; auth routes decide whether to swallow (anti-enum).
    logger.error({ err, to, subject }, 'email send failed');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Branded template — table-based, inline-styled, Outlook/Gmail/Apple-Mail safe.
// ---------------------------------------------------------------------------
const GOLD = '#e8a23e';
const INK = '#1c1b18';
const MUTED = '#8a877f';

function emailShell(preheader, bodyRows) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
</head>
<body style="margin:0; padding:0; background:#f1f1f4; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f1f4;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="width:560px; max-width:560px; background:#ffffff; border:1px solid #e6e4df; border-radius:14px; overflow:hidden;">
        <tr><td style="height:5px; background:${GOLD}; font-size:0; line-height:0;">&nbsp;</td></tr>
        <tr><td align="center" style="padding:30px 32px 4px; font-family:Georgia,'Times New Roman',serif; font-size:25px; font-weight:bold; color:${INK};">Jubilujah<span style="color:${GOLD};">.com</span></td></tr>
        ${bodyRows}
        <tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid #eceae5; font-size:0; line-height:0;">&nbsp;</div></td></tr>
        <tr><td align="center" style="padding:16px 32px 30px; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:1.6; color:#a7a49c;">&copy; 2026 Jubilujah.com &middot; Feel the Spirit Move<br>This is an automated message — please don't reply.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function headingRow(heading) {
  return `<tr><td align="center" style="padding:10px 32px 0; font-family:Arial,Helvetica,sans-serif;"><h1 style="margin:0; font-size:19px; font-weight:bold; color:${INK};">${heading}</h1></td></tr>`;
}
function introRow(intro) {
  return `<tr><td style="padding:14px 32px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:1.6; color:#4a4843;">${intro}</td></tr>`;
}
function codeRow(code) {
  return `<tr><td align="center" style="padding:22px 32px 4px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#fbf6ec; border:1px solid #ecd9b0; border-radius:10px; padding:16px 28px; font-family:'Courier New',Courier,monospace; font-size:34px; font-weight:bold; letter-spacing:8px; color:${INK};">${code}</td></tr></table>
  </td></tr>`;
}
function buttonRow(label, url) {
  return `<tr><td align="center" style="padding:24px 32px 4px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px; background:${GOLD};">
      <a href="${url}" style="display:inline-block; padding:13px 32px; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; color:${INK}; text-decoration:none; border-radius:8px;">${label}</a>
    </td></tr></table>
  </td></tr>`;
}
function expiryRow(text) {
  return `<tr><td align="center" style="padding:8px 32px 0; font-family:Arial,Helvetica,sans-serif; font-size:13px; color:${MUTED};">${text}</td></tr>`;
}
function fallbackLinkRow(url) {
  return `<tr><td style="padding:12px 32px 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:1.6; color:#a7a49c; word-break:break-all;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${url}" style="color:#bd7d27;">${url}</a></td></tr>`;
}
function noteRow(text) {
  return `<tr><td style="padding:18px 32px 0; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.6; color:${MUTED};">${text}</td></tr>`;
}

// ---------------------------------------------------------------------------
// Auth emails
// ---------------------------------------------------------------------------
export async function sendLoginVerificationEmail({ to, code }) {
  const subject = 'Your Jubilujah.com sign-in code';
  const text =
    `Your Jubilujah.com sign-in code is: ${code}\n\n` +
    `Enter it to finish signing in. This code expires in 15 minutes.\n\n` +
    `If you didn't try to sign in, you can ignore this email — your account is safe.\n\n` +
    `— Jubilujah.com`;
  const html = emailShell(
    `Your sign-in code is ${code} — expires in 15 minutes.`,
    headingRow('Your sign-in code') +
    introRow('Use the code below to finish signing in to your Jubilujah.com account.') +
    codeRow(code) +
    expiryRow('This code expires in 15 minutes.') +
    noteRow("Didn't try to sign in? You can safely ignore this email — your account stays secure and no changes are made.")
  );
  await send({ to, subject, text, html });
}

export async function sendSignupVerificationEmail({ to, code }) {
  const subject = 'Verify your email for Jubilujah.com';
  const text =
    `Welcome to Jubilujah.com!\n\n` +
    `Your email verification code is: ${code}\n\n` +
    `Enter it to verify your email and finish creating your account. This code expires in 30 minutes.\n\n` +
    `If you didn't sign up for Jubilujah.com, you can safely ignore this email — no account will be created.\n\n` +
    `— Jubilujah.com`;
  const html = emailShell(
    `Welcome! Your verification code is ${code} — expires in 30 minutes.`,
    headingRow('Confirm your email address') +
    introRow('Welcome to Jubilujah.com! Enter the code below to verify your email and finish creating your account.') +
    codeRow(code) +
    expiryRow('This code expires in 30 minutes.') +
    noteRow("Didn't sign up? You can safely ignore this email — without this code, no account will be created.")
  );
  await send({ to, subject, text, html });
}

// ---------------------------------------------------------------------------
// Subscription / billing emails — generic branded template. Used for activation
// confirmations, payment receipts/failures, renewals, cancellations and family
// invitations (services/notifications.js + the family flow).
//   { to, subject, heading, intro, rows?: string[], ctaLabel?, ctaUrl?, note? }
// `rows` renders a labelled detail list (e.g. plan / price / renewal date).
// ---------------------------------------------------------------------------
function detailRows(rows) {
  if (!rows || !rows.length) return '';
  const items = rows.map((r) =>
    `<tr><td style="padding:6px 0; font-family:Arial,Helvetica,sans-serif; font-size:14px; color:${MUTED};">${r.label}</td>` +
    `<td align="right" style="padding:6px 0; font-family:Arial,Helvetica,sans-serif; font-size:14px; font-weight:bold; color:${INK};">${r.value}</td></tr>`
  ).join('');
  return `<tr><td style="padding:18px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf9f4; border:1px solid #ece7dc; border-radius:10px; padding:8px 18px;">
      ${items}
    </table></td></tr>`;
}

export async function sendSubscriptionEmail({ to, subject, heading, intro, rows = [], ctaLabel = null, ctaUrl = null, note = null }) {
  const textRows = rows.map((r) => `${r.label}: ${r.value}`).join('\n');
  const text =
    `${heading}\n\n${intro}\n\n${textRows ? textRows + '\n\n' : ''}` +
    `${ctaUrl ? `${ctaLabel || 'Manage subscription'}: ${ctaUrl}\n\n` : ''}` +
    `${note ? note + '\n\n' : ''}— Jubilujah.com`;
  const html = emailShell(
    intro,
    headingRow(heading) +
    introRow(intro) +
    detailRows(rows) +
    (ctaUrl ? buttonRow(ctaLabel || 'Manage subscription', ctaUrl) : '') +
    (note ? noteRow(note) : '')
  );
  await send({ to, subject: subject || heading, text, html });
}

export async function sendPasswordResetEmail({ to, resetUrl }) {
  const mins = config.email.resetTtlMinutes;
  const subject = 'Reset your Jubilujah.com password';
  const text =
    `We received a request to reset the password for your Jubilujah.com account.\n\n` +
    `Reset it here (this link expires in ${mins} minutes):\n${resetUrl}\n\n` +
    `If you didn't request this, you can safely ignore this email — your password won't change.\n\n` +
    `— Jubilujah.com`;
  const html = emailShell(
    `Reset your Jubilujah.com password — link expires in ${mins} minutes.`,
    headingRow('Reset your password') +
    introRow('We received a request to reset the password for your Jubilujah.com account. Click the button below to choose a new one.') +
    buttonRow('Reset password', resetUrl) +
    expiryRow(`This link expires in ${mins} minutes and can be used once.`) +
    fallbackLinkRow(resetUrl) +
    noteRow("Didn't request a password reset? You can safely ignore this email — your password won't change.")
  );
  await send({ to, subject, text, html });
}
