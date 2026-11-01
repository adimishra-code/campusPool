import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter = null;

// Lazily build a real SMTP transport when SMTP_* env vars are configured.
function getTransporter() {
  const hasSmtp = Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
  if (!hasSmtp) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: { user: env.smtpUser, pass: env.smtpPass },
      connectionTimeout: 2500, // fail fast if network/host blocks ports
      greetingTimeout: 2500,
      socketTimeout: 2500
    });
  }
  return transporter;
}

// Send via Google Apps Script HTTPS Webhook (Port 443 — sends directly from user's Gmail with 0 port blocks).
async function sendViaGmailRelay({ to, subject, text, html, replyTo, name }) {
  const res = await fetch(env.gmailRelayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: env.gmailRelaySecret,
      to,
      subject,
      text,
      html,
      replyTo,
      name
    })
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gmail relay HTTP error (${res.status}): ${errText}`);
  }
  const data = await res.json().catch(() => ({}));
  if (data.error) {
    throw new Error(`Gmail relay error: ${data.error}`);
  }
  return { delivered: true, dev: false, provider: "gmail-relay" };
}

// Send via Resend HTTP REST API (Port 443 — works across all cloud providers and free tiers).
async function sendViaResend({ to, subject, text, html }) {
  const from = env.resendFrom || "CampusPool <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html
    })
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(`Resend API error (${res.status}): ${JSON.stringify(errorBody)}`);
  }
  return { delivered: true, dev: false, provider: "resend" };
}

/**
 * Send an email.
 * 1. Uses Resend HTTP API (Port 443) if RESEND_API_KEY is provided.
 * 2. Uses SMTP if SMTP_HOST is configured.
 * 3. Falls back to console logging so codes/passwords are never lost even if ports are blocked.
 */
export async function sendMail({ to, subject, text, html, replyTo, name }) {
  // 1. Try Gmail Webhook Relay (Port 443 — sends directly from personal Gmail, 100% free, unblocked on Render)
  if (env.gmailRelayUrl) {
    try {
      return await sendViaGmailRelay({ to, subject, text, html, replyTo, name });
    } catch (err) {
      console.error(`[email:gmail-relay:error] ${err.message}`);
    }
  }

  // 2. Try Resend HTTP API (Port 443 — unblocked on Render)
  if (env.resendApiKey) {
    try {
      return await sendViaResend({ to, subject, text, html });
    } catch (err) {
      console.error(`[email:resend:error] ${err.message}`);
    }
  }

  // 3. Try SMTP transport if configured
  const tx = getTransporter();
  if (tx) {
    try {
      const from = name ? `"${name}" <${env.smtpFrom}>` : env.smtpFrom;
      await tx.sendMail({ from, to, subject, text, html, replyTo });
      return { delivered: true, dev: false, provider: "smtp" };
    } catch (err) {
      console.error(`[email:smtp:error] Failed to send via SMTP (${err.message})`);
    }
  }

  // 4. Fallback / Dev: Log clearly to server console so OTP is immediately visible in logs
  console.log(`\n==================================================\n[EMAIL OTP FALLBACK]\nTo: ${to}\nSubject: ${subject}\n${text || ""}\n==================================================\n`);
  return { delivered: false, dev: true };
}

export async function sendOtpEmail(to, otp) {
  const subject = `${env.appName} email verification code`;
  const text = `Your ${env.appName} verification code is ${otp}. It expires in 10 minutes.`;
  const html = `<p>Your <strong>${env.appName}</strong> verification code is:</p>
    <h2 style="letter-spacing:4px">${otp}</h2>
    <p>This code expires in 10 minutes. If you didn't request it, ignore this email.</p>`;
  return sendMail({ to, subject, text, html });
}

// One-time code used as the login 2FA challenge.
export async function sendLoginOtpEmail(to, otp) {
  const subject = `${env.appName} login verification code`;
  const text = `Your ${env.appName} login code is ${otp}. It expires in 5 minutes. If this wasn't you, change your password.`;
  const html = `<p>Use this code to finish signing in to <strong>${env.appName}</strong>:</p>
    <h2 style="letter-spacing:4px">${otp}</h2>
    <p>This code expires in 5 minutes. If this wasn't you, change your password immediately.</p>`;
  return sendMail({ to, subject, text, html });
}

// Password-reset email. We send both a deep link (for the SPA) and the raw token
// so the user can paste it if the link is mangled by their mail client.
export async function sendPasswordResetEmail(to, rawToken) {
  const link = `${env.clientUrl}/reset-password?email=${encodeURIComponent(to)}&token=${rawToken}`;
  const subject = `Reset your ${env.appName} password`;
  const text = `Reset your ${env.appName} password using this link (valid 1 hour):\n${link}\n\nIf you didn't request this, ignore this email — your password is unchanged.`;
  const html = `<p>We received a request to reset your <strong>${env.appName}</strong> password.</p>
    <p><a href="${link}">Click here to choose a new password</a> (valid for 1 hour).</p>
    <p>If the link doesn't work, paste this code on the reset page:</p>
    <pre style="word-break:break-all">${rawToken}</pre>
    <p>If you didn't request this, you can safely ignore this email.</p>`;
  return sendMail({ to, subject, text, html });
}

// Fan a safety / SOS alert out to several recipients by email. Never throws, so
// it's safe to fire-and-forget from request handlers and the escalation loop.
export async function sendSafetyAlertEmail(recipients, { subject, text, html }) {
  const unique = [...new Set((recipients || []).filter(Boolean))];
  const results = await Promise.all(
    unique.map((to) => sendMail({ to, subject, text, html }).catch(() => ({ delivered: false })))
  );
  return { sent: results.filter((r) => r.delivered).length, total: unique.length };
}

// Notify the support inbox about a new ticket/feedback/bug report.
export async function sendSupportEmail({ subject, text, html, replyTo, name }) {
  return sendMail({ to: env.supportEmail, subject, text, html, replyTo, name });
}

// Confirmation back to the user who opened a ticket.
export async function sendSupportConfirmation(to, ticket) {
  const subject = `We received your ${env.appName} ${ticket.category || "support"} request`;
  const text = `Hi,\n\nThanks for reaching out. We've logged your ${ticket.category || "support"} request "${ticket.subject}" and our team will get back to you at this address.\n\nYou can also reach us anytime at ${env.supportEmail}.\n\n— The ${env.appName} team`;
  const html = `<p>Thanks for reaching out. We've logged your <strong>${ticket.category || "support"}</strong> request:</p>
    <blockquote><strong>${ticket.subject}</strong><br/>${ticket.message || ""}</blockquote>
    <p>Our team will follow up at this address. You can also reach us anytime at
    <a href="mailto:${env.supportEmail}">${env.supportEmail}</a>.</p>
    <p>— The ${env.appName} team</p>`;
  return sendMail({ to, subject, text, html });
}
