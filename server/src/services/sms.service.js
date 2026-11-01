import fetch from "node-fetch";
import { env } from "../config/env.js";

/**
 * Send an SMS via Twilio's REST API when TWILIO_* env vars are configured.
 * We call the API directly with fetch (already a dependency) to avoid pulling
 * in the Twilio SDK. When unconfigured (local/dev/test) we log instead of
 * failing, so safety flows remain testable.
 */
export async function sendSms({ to, body }) {
  if (!to) return { delivered: false, skipped: true };

  if (!env.smsConfigured) {
    if (env.nodeEnv !== "test") console.log(`[sms:dev] To: ${to} | ${body}`);
    return { delivered: false, dev: true };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`;
  const auth = Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString("base64");
  const form = new URLSearchParams({ From: env.twilioFromNumber, To: to, Body: body });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error(`[sms] Twilio error ${res.status}: ${detail}`);
      return { delivered: false, error: res.status };
    }
    return { delivered: true };
  } catch (err) {
    console.error(`[sms] Twilio request failed: ${err.message}`);
    return { delivered: false, error: err.message };
  }
}

// Fan out the same message to many recipients; never throws.
export async function sendSmsBulk(recipients, body) {
  const results = await Promise.all(
    [...new Set(recipients.filter(Boolean))].map((to) => sendSms({ to, body }))
  );
  return { sent: results.filter((r) => r.delivered).length, total: results.length };
}
