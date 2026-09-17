import { config } from '../config.js';
import { logger } from '../logger.js';

// ============================================================================
// Outbound email for auth flows (login OTP, signup email verification, password
// reset). One branded, email-client-safe HTML template (table layout + inline
// styles + preheader) is shared across all three for a consistent look.
//
// Transport is chosen by env (see resolveProvider): Mailgun when MAILGUN_API_KEY
// + MAILGUN_DOMAIN are set, else the Mailgun SMTP relay when SMTP_USER + SMTP_PASS
// are set, else SendGrid when SENDGRID_API_KEY is set, else a dev/log transport
// that just logs the message — so the whole flow is testable with no provider
// configured. EMAIL_PROVIDER forces one explicitly. The SendGrid SDK and
// nodemailer are lazy-imported so the API boots/builds without them when unused;
// the Mailgun API transport uses the global fetch (no extra dependency).
// ============================================================================

// Explicit EMAIL_PROVIDER wins; otherwise prefer the Mailgun API when configured,
// then its SMTP relay, then SendGrid, else the dev/log transport.
function resolveProvider() {
  const { provider, mailgun, smtp, sendgridApiKey } = config.email;
  if (['mailgun', 'smtp', 'sendgrid', 'log'].includes(provider)) return provider;
  if (mailgun.apiKey && mailgun.domain) return 'mailgun';
  if (smtp.user && smtp.pass) return 'smtp';
  if (sendgridApiKey) return 'sendgrid';
  return 'log';
}

// These are transactional security emails (one-time reset link / OTP). We disable
// click + open tracking on every provider so the sending service never rewrites
// our links through its branded-link redirector — that would both hide the real
// jubileepraise.com URL and route the one-time token through a third-party tracker.

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

async function sendViaSendgrid({ to, subject, text, html }) {
  const sg = await getSendgrid();
  await sg.send({
    to,
    from: config.email.from,
    subject,
    text,
    html,
    trackingSettings: {
      clickTracking: { enable: false, enableText: false },
      openTracking: { enable: false },
      subscriptionTracking: { enable: false },
    },
  });
}

async function sendViaMailgun({ to, subject, text, html }) {
  const { apiKey, domain, apiBase } = config.email.mailgun;
  const form = new URLSearchParams();
  form.set('from', config.email.from);
  form.set('to', Array.isArray(to) ? to.join(',') : to);
  form.set('subject', subject);
  if (text) form.set('text', text);
  if (html) form.set('html', html);
  form.set('o:tracking', 'no');
  form.set('o:tracking-clicks', 'no');
  form.set('o:tracking-opens', 'no');

  const res = await fetch(`${apiBase}/v3/${domain}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`mailgun send failed: ${res.status} ${detail}`);
  }
}

// Mailgun SMTP relay (smtp.mailgun.org, the noreply@jubileepraise.com mailbox
// credentials). Same sending domain as the API transport, so SPF/DKIM alignment
// is unchanged; Mailgun's tracking is off for SMTP unless enabled per domain.
let smtpTransport = null;

async function getSmtp() {
  if (smtpTransport) return smtpTransport;
  const mod = await import('nodemailer');                // lazy — optional dependency
  const nodemailer = mod.default || mod;
  const { host, port, secure, user, pass } = config.email.smtp;
  smtpTransport = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return smtpTransport;
}

async function sendViaSmtp({ to, subject, text, html }) {
  const transport = await getSmtp();
  await transport.sendMail({
    from: config.email.from,
    to: Array.isArray(to) ? to.join(',') : to,
    subject,
    text,
    html,
    headers: { 'X-Mailgun-Track': 'no', 'X-Mailgun-Track-Clicks': 'no', 'X-Mailgun-Track-Opens': 'no' },
  });
}

async function send({ to, subject, text, html }) {
  const provider = resolveProvider();
  if (provider === 'log') {
    // Dev/log transport: never send, just surface the content in the server log.
    logger.info({ to, subject, text }, '[email:dev] not sent (no email provider configured)');
    return;
  }
  try {
    if (provider === 'mailgun') await sendViaMailgun({ to, subject, text, html });
    else if (provider === 'smtp') await sendViaSmtp({ to, subject, text, html });
    else await sendViaSendgrid({ to, subject, text, html });
    logger.info({ to, subject, provider }, 'email sent');
  } catch (err) {
    // Surface to the caller; auth routes decide whether to swallow (anti-enum).
    logger.error({ err, to, subject, provider }, 'email send failed');
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
        <tr><td align="center" style="padding:30px 32px 4px; font-family:Georgia,'Times New Roman',serif; font-size:25px; font-weight:bold; color:${INK};">JubileePraise<span style="color:${GOLD};">.com</span></td></tr>
        ${bodyRows}
        <tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid #eceae5; font-size:0; line-height:0;">&nbsp;</div></td></tr>
        <tr><td align="center" style="padding:16px 32px 30px; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:1.6; color:#a7a49c;">&copy; 2026 JubileePraise.com &middot; Feel the Spirit Move<br>This is an automated message — please don't reply.</td></tr>
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
  const subject = 'Your JubileePraise.com sign-in code';
  const text =
    `Your JubileePraise.com sign-in code is: ${code}\n\n` +
    `Enter it to finish signing in. This code expires in 15 minutes.\n\n` +
    `If you didn't try to sign in, you can ignore this email — your account is safe.\n\n` +
    `— JubileePraise.com`;
  const html = emailShell(
    `Your sign-in code is ${code} — expires in 15 minutes.`,
    headingRow('Your sign-in code') +
    introRow('Use the code below to finish signing in to your JubileePraise.com account.') +
    codeRow(code) +
    expiryRow('This code expires in 15 minutes.') +
    noteRow("Didn't try to sign in? You can safely ignore this email — your account stays secure and no changes are made.")
  );
  await send({ to, subject, text, html });
}

export async function sendSignupVerificationEmail({ to, code }) {
  const subject = 'Verify your email for JubileePraise.com';
  const text =
    `Welcome to JubileePraise.com!\n\n` +
    `Your email verification code is: ${code}\n\n` +
    `Enter it to verify your email and finish creating your account. This code expires in 30 minutes.\n\n` +
    `If you didn't sign up for JubileePraise.com, you can safely ignore this email — no account will be created.\n\n` +
    `— JubileePraise.com`;
  const html = emailShell(
    `Welcome! Your verification code is ${code} — expires in 30 minutes.`,
    headingRow('Confirm your email address') +
    introRow('Welcome to JubileePraise.com! Enter the code below to verify your email and finish creating your account.') +
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
    `${note ? note + '\n\n' : ''}— JubileePraise.com`;
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
  const subject = 'Reset your JubileePraise.com password';
  const text =
    `We received a request to reset the password for your JubileePraise.com account.\n\n` +
    `Reset it here (this link expires in ${mins} minutes):\n${resetUrl}\n\n` +
    `If you didn't request this, you can safely ignore this email — your password won't change.\n\n` +
    `— JubileePraise.com`;
  const html = emailShell(
    `Reset your JubileePraise.com password — link expires in ${mins} minutes.`,
    headingRow('Reset your password') +
    introRow('We received a request to reset the password for your JubileePraise.com account. Click the button below to choose a new one.') +
    buttonRow('Reset password', resetUrl) +
    expiryRow(`This link expires in ${mins} minutes and can be used once.`) +
    fallbackLinkRow(resetUrl) +
    noteRow("Didn't request a password reset? You can safely ignore this email — your password won't change.")
  );
  await send({ to, subject, text, html });
}
