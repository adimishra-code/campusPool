import api from "./api.js";

// Lightweight product analytics. ALL tracking is gated behind cookie consent —
// nothing is sent unless the user explicitly accepted analytics cookies.
const CONSENT_KEY = "cc_consent";

export function hasAnalyticsConsent() {
  return localStorage.getItem(CONSENT_KEY) === "accepted";
}

// Stable-per-tab anonymous session id (not tied to identity).
function getSessionId() {
  let sid = sessionStorage.getItem("cc_sid");
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("cc_sid", sid);
  }
  return sid;
}

function send(type, { path, meta } = {}) {
  if (!hasAnalyticsConsent()) return;
  const payload = {
    type,
    path: path || (window.location.pathname + window.location.search),
    referrer: document.referrer || undefined,
    sessionId: getSessionId(),
    meta
  };
  // Fire-and-forget; never block UI or surface errors.
  api.post("/analytics/track", payload).catch(() => {});
}

export const trackPageView = (path) => send("page_view", { path });
export const trackEvent = (type, meta) => send(type, { meta });
