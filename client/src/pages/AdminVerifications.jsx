import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "../services/api.js";
import Spinner from "../components/Spinner.jsx";
import EmptyState from "../components/EmptyState.jsx";
import MetricCard from "../components/MetricCard.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function DocLink({ url, label }) {
  if (!url) return null;
  // Documents are streamed by the API (auth required); open with the bearer token via a new tab is
  // limited, so we link to the absolute API path for admins who are authenticated in-session.
  const href = url.startsWith("http") ? url : `${API.replace(/\/api$/, "")}${url}`;
  return (
    <a className="link-button" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

export default function AdminVerifications() {
  const { user } = useSelector((s) => s.auth);
  const [tab, setTab] = useState("student");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [sosEvents, setSosEvents] = useState([]);

  const loadSos = () =>
    api
      .get("/safety/sos/active")
      .then(({ data }) => setSosEvents(data.events || []))
      .catch(() => {});
  useEffect(() => {
    if (user?.role === "admin") {
      api
        .get("/analytics/overview")
        .then(({ data }) => setAnalytics(data))
        .catch(() => {});
      loadSos();
    }
  }, [user?.role]);

  const resolveSos = async (id) => {
    await api.post(`/safety/sos/${id}/resolve`).catch(() => {});
    loadSos();
  };

  const load = async (type) => {
    setLoading(true);
    try {
      const { data } = await api.get("/verification/admin/pending", { params: { type } });
      setItems(data.verifications || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") load(tab);
  }, [tab, user?.role]);

  if (user?.role !== "admin") {
    return (
      <div className="page">
        <EmptyState
          icon="🛡️"
          title="Admins only"
          hint="This panel is restricted to administrators."
        />
      </div>
    );
  }

  const decide = async (id, action, type) => {
    setMsg(null);
    try {
      await api.patch(`/verification/admin/${id}/${action}`, {
        type,
        reason: action === "reject" ? "Document unclear" : undefined
      });
      setMsg(`${type} ${action === "approve" ? "approved" : "rejected"}`);
      load(tab);
    } catch (e) {
      setMsg(e.response?.data?.message || "Action failed");
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Verification queue</h1>
        </div>
      </header>

      {sosEvents.length > 0 && (
        <section className="panel">
          <p className="eyebrow">🚨 Active SOS</p>
          <div className="list">
            {sosEvents.map((e) => (
              <article key={e._id} className="queue-row sos-row">
                <div>
                  <strong>{e.user?.name || "Member"}</strong>
                  <small>
                    {e.user?.phone || "—"}
                    {e.trip ? ` · ${e.trip.pickup?.address} → ${e.trip.destination?.address}` : ""}
                  </small>
                </div>
                <button className="secondary sm" onClick={() => resolveSos(e._id)}>
                  Resolve
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {analytics && (
        <section className="panel">
          <p className="eyebrow">Recommendation engine (last 30 days)</p>
          <div className="metrics">
            <MetricCard label="Rec. views" value={analytics.recommendationViews ?? 0} />
            <MetricCard label="Rec. clicks" value={analytics.recommendationClicks ?? 0} />
            <MetricCard
              label="Rec. joins"
              value={analytics.recommendationJoins ?? 0}
              tone="green"
            />
            <MetricCard label="Match acceptance" value={`${analytics.matchAcceptanceRate ?? 0}%`} />
            <MetricCard label="Join conversion" value={`${analytics.joinConversionRate ?? 0}%`} />
          </div>
        </section>
      )}

      <div className="tabs">
        <button
          className={`tab ${tab === "student" ? "active" : ""}`}
          onClick={() => setTab("student")}
        >
          Pending Students
        </button>
        <button
          className={`tab ${tab === "vehicle" ? "active" : ""}`}
          onClick={() => setTab("vehicle")}
        >
          Pending Vehicles
        </button>
      </div>

      {msg && <div className="alert info">{msg}</div>}
      {loading && <Spinner label="Loading queue…" />}

      {!loading && items.length === 0 && (
        <EmptyState
          icon="✅"
          title={`No pending ${tab === "student" ? "students" : "vehicles"}`}
          hint="The queue is clear."
        />
      )}

      <div className="list">
        {items.map((v) => (
          <article key={v._id} className="queue-row">
            <div>
              <strong>{v.user?.name || "User"}</strong>
              <small>
                {v.user?.email} · {v.user?.role}
                {v.user?.hostel ? ` · ${v.user.hostel}` : ""}
              </small>
              <div className="doc-links">
                {tab === "student" && (
                  <>
                    <DocLink url={v.studentId?.documentUrl} label="Student ID" />
                    <DocLink url={v.identityProof?.documentUrl} label="College ID" />
                  </>
                )}
                {tab === "vehicle" &&
                  (v.vehicleVerification?.documents || []).map((d, i) => (
                    <DocLink key={i} url={d.url} label={d.type} />
                  ))}
              </div>
            </div>
            <div className="passenger-actions">
              <button className="primary sm" onClick={() => decide(v._id, "approve", tab)}>
                Approve
              </button>
              <button className="secondary sm" onClick={() => decide(v._id, "reject", tab)}>
                Reject
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
