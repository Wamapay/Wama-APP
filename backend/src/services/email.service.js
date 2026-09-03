/**
 * Transactional email — Resend.
 *
 * Server-side only. RESEND_API_KEY is read once from config (never from
 * process.env directly, never logged, never returned in any API
 * response). If sending fails, the caller decides what that means for
 * the request in progress — this module never throws the raw provider
 * error outward, and never logs the API key or the token/link being sent.
 */
"use strict";

const { Resend } = require("resend");
const { config } = require("../config/env");
const logger = require("../config/logger");

let client = null;
function getClient() {
  if (!config.email.resendApiKey) return null;
  if (!client) client = new Resend(config.email.resendApiKey);
  return client;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Sends the email-verification link. Returns { sent: boolean } rather
 * than throwing on provider failure — issueEmailVerificationToken (the
 * only caller) has already committed the token to the database by the
 * time this runs, and a failed send must never roll that back or leave
 * the account in a broken state; the caller/controller decides how to
 * word the response based on `sent`.
 */
async function sendVerificationEmail({ to, fullName, verificationUrl }) {
  const resend = getClient();
  if (!resend) {
    logger.error("[email] RESEND_API_KEY is not configured — cannot send verification email.");
    return { sent: false };
  }
  if (!config.email.from) {
    logger.error("[email] EMAIL_FROM is not configured — cannot send verification email.");
    return { sent: false };
  }

  const safeName = escapeHtml(fullName || "there");
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #101828;">
      <h2 style="margin: 0 0 16px;">Learn &amp; Earn</h2>
      <p>Hi ${safeName},</p>
      <p>Thanks for creating an account. Please verify your email address to activate it and log in.</p>
      <p style="margin: 28px 0;">
        <a href="${verificationUrl}"
           style="background:#146B4B;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600;">
          Verify my email
        </a>
      </p>
      <p style="font-size: 13px; color: #475467;">Or paste this link into your browser:<br>
        <a href="${verificationUrl}" style="color:#146B4B;">${verificationUrl}</a>
      </p>
      <p style="font-size: 13px; color: #475467;">This link expires in 24 hours and can only be used once.</p>
      <p style="font-size: 13px; color: #475467;">If you didn't create this account, you can safely ignore this email — no action is needed.</p>
    </div>
  `;
  const text =
    `Hi ${fullName || "there"},\n\n` +
    `Thanks for creating a Learn & Earn account. Verify your email to activate it:\n` +
    `${verificationUrl}\n\n` +
    `This link expires in 24 hours and can only be used once.\n` +
    `If you didn't create this account, you can safely ignore this email.`;

  try {
    const { error } = await resend.emails.send({
      from: config.email.from,
      to,
      subject: "Verify your email — Learn & Earn",
      html,
      text,
    });
    if (error) {
      // Real provider error object (e.g. invalid_from_address,
      // rate_limit_exceeded) — safe to log the error's own message/name,
      // never the recipient's token/link and never the API key.
      logger.error(`[email] Resend rejected the verification email: ${error.name || "error"} — ${error.message || "unknown"}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    logger.error(`[email] Unexpected error sending verification email: ${err.message}`);
    return { sent: false };
  }
}

module.exports = { sendVerificationEmail };
