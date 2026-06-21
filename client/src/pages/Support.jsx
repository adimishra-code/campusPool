import { useState } from "react";
import PublicLayout from "../components/PublicLayout.jsx";
import { SUPPORT_EMAIL } from "../components/Footer.jsx";
import api from "../services/api.js";
import { trackEvent } from "../services/tracking.js";

const CATEGORIES = [
  { value: "feedback", label: "General feedback" },
  { value: "payment", label: "Payment / refund" },
  { value: "safety", label: "Safety concern" },
  { value: "host", label: "Host issue" },
  { value: "passenger", label: "Passenger issue" },
  { value: "other", label: "Something else" }
];

export default function Support() {
  const [form, setForm] = useState({ subject: "", category: "feedback", message: "" });
  const [state, setState] = useState({ sending: false, ok: false, error: null });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    setState({ sending: true, ok: false, error: null });
    try {
      await api.post("/support", form);
      trackEvent("support_submit", { category: form.category });
      setState({ sending: false, ok: true, error: null });
      setForm({ subject: "", category: "feedback", message: "" });
    } catch (err) {
      const status = err.response?.status;
      setState({
        sending: false,
        ok: false,
        error:
          status === 401
            ? `Please sign in to submit a ticket, or email us directly at ${SUPPORT_EMAIL}.`
            : err.response?.data?.message ||
              "Could not send. Please try again or email us directly."
      });
    }
  };

  return (
    <PublicLayout
      title="Help & Support"
      description="Get help, share feedback, or contact the CampusPool team."
      seoPath="/support"
    >
      <div className="support-page">
        <h1>Help &amp; Support</h1>
        <p className="muted-text">
          We're here to help. Reach us anytime at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or send a message below.
        </p>

        {state.ok && (
          <div className="alert info">
            Thanks! Your message has been sent — we'll reply by email.
          </div>
        )}
        {state.error && <div className="alert error">{state.error}</div>}

        <form className="panel form-grid" onSubmit={submit}>
          <label className="field">
            <span>Subject</span>
            <input
              value={form.subject}
              onChange={set("subject")}
              placeholder="Briefly, what's it about?"
              maxLength={160}
            />
          </label>
          <label className="field">
            <span>Category</span>
            <select value={form.category} onChange={set("category")}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>Message</span>
            <textarea
              rows={6}
              value={form.message}
              onChange={set("message")}
              placeholder="Tell us what's going on…"
              maxLength={5000}
            />
          </label>
          <div className="field" style={{ alignSelf: "end" }}>
            <button className="primary" type="submit" disabled={state.sending}>
              {state.sending ? "Sending…" : "Send message"}
            </button>
          </div>
        </form>

        <p className="muted-text">
          Found a bug? <a href="/report-bug">Report a bug</a> instead so we can reproduce it faster.
        </p>
      </div>
    </PublicLayout>
  );
}
