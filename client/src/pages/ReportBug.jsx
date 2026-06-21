import { useState } from "react";
import PublicLayout from "../components/PublicLayout.jsx";
import { SUPPORT_EMAIL } from "../components/Footer.jsx";
import api from "../services/api.js";
import { trackEvent } from "../services/tracking.js";

export default function ReportBug() {
  const [form, setForm] = useState({ subject: "", message: "" });
  const [state, setState] = useState({ sending: false, ok: false, error: null });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    setState({ sending: true, ok: false, error: null });
    // Auto-attach environment details to speed up reproduction.
    const meta = {
      page: document.referrer || window.location.href,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      appVersion: import.meta.env.VITE_APP_VERSION || "dev"
    };
    try {
      await api.post("/support", {
        subject: form.subject,
        message: form.message,
        category: "bug",
        meta
      });
      trackEvent("bug_report", {});
      setState({ sending: false, ok: true, error: null });
      setForm({ subject: "", message: "" });
    } catch (err) {
      const status = err.response?.status;
      setState({
        sending: false,
        ok: false,
        error:
          status === 401
            ? `Please sign in to file a bug report, or email us at ${SUPPORT_EMAIL}.`
            : err.response?.data?.message ||
              "Could not send. Please try again or email us directly."
      });
    }
  };

  return (
    <PublicLayout
      title="Report a bug"
      description="Found something broken? Tell the CampusPool team."
      seoPath="/report-bug"
    >
      <div className="support-page">
        <h1>Report a bug</h1>
        <p className="muted-text">
          Help us squash it. Describe what happened and how to reproduce it — we auto-attach your
          browser and screen details. You can also email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>

        {state.ok && (
          <div className="alert info">
            Thanks for the report! We'll look into it and follow up by email.
          </div>
        )}
        {state.error && <div className="alert error">{state.error}</div>}

        <form className="panel form-grid" onSubmit={submit}>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>What went wrong?</span>
            <input
              value={form.subject}
              onChange={set("subject")}
              placeholder="e.g. Can't join a trip from the feed"
              maxLength={160}
            />
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>Steps to reproduce / details</span>
            <textarea
              rows={7}
              value={form.message}
              onChange={set("message")}
              placeholder={"1. Go to…\n2. Tap…\n3. Expected … but saw …"}
              maxLength={5000}
            />
          </label>
          <div className="field" style={{ alignSelf: "end" }}>
            <button className="primary" type="submit" disabled={state.sending}>
              {state.sending ? "Sending…" : "Submit bug report"}
            </button>
          </div>
        </form>
      </div>
    </PublicLayout>
  );
}
