import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "../services/api.js";
import Spinner from "../components/Spinner.jsx";
import EmptyState from "../components/EmptyState.jsx";
import MetricCard from "../components/MetricCard.jsx";

const REPORT_FILTERS = ["open", "reviewing", "actioned", "dismissed"];

export default function AdminSafety() {
  const { user } = useSelector((s) => s.auth);
  const [metrics, setMetrics] = useState(null);
  const [sosEvents, setSosEvents] = useState([]);
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState("open");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const loadSos = () => api.get("/safety/sos/active").then(({ data }) => setSosEvents(data.events || [])).catch(() => {});
  const loadMetrics = () => api.get("/analytics/safety").then(({ data }) => setMetrics(data)).catch(() => {});
  const loadReports = (status) =>
    api.get("/safety/reports", { params: status ? { status } : {} }).then(({ data }) => setReports(data.reports || [])).catch(() => {});

  useEffect(() => {
    if (user?.role !== "admin") return;
    setLoading(true);
    Promise.all([loadMetrics(), loadSos(), loadReports(filter)]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === "admin") loadReports(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const resolveSos = async (id) => {
    await api.post(`/safety/sos/${id}/resolve`).catch(() => {});
    loadSos();
    loadMetrics();
  };

  const resolveReport = async (id, status) => {
    setMsg(null);
    try {
      await api.post(`/safety/reports/${id}/resolve`, { status });
      setMsg(`Report ${status}`);
      loadReports(filter);
      loadMetrics();
    } catch (e) {
      setMsg(e.response?.data?.message || "Action failed");
    }
  };

  if (user?.role !== "admin") {
    return <div className="page"><EmptyState icon="🛡️" title="Admins only" hint="This panel is restricted to administrators." /></div>;
  }

  return (
    <div className="page">
      <header className="page-head"><div><p className="eyebrow">Admin</p><h1>Trust &amp; Safety</h1></div></header>

      {metrics && (
        <section className="panel">
          <p className="eyebrow">Safety overview (last 30 days)</p>
          <div className="metrics">
            <MetricCard label="Active SOS" value={metrics.activeSos ?? 0} tone={metrics.activeSos ? "red" : "green"} />
            <MetricCard label="Open reports" value={metrics.openReports ?? 0} tone={metrics.openReports ? "amber" : "green"} />
            <MetricCard label="Reports (30d)" value={metrics.totalReports ?? 0} />
            <MetricCard label="Arrivals confirmed" value={`${metrics.arrivalConfirmationRate ?? 0}%`} tone="green" />
            <MetricCard label="Completed trips" value={metrics.completedTrips ?? 0} />
          </div>
        </section>
      )}

      {loading && <Spinner label="Loading safety dashboard…" />}

      <section className="panel">
        <p className="eyebrow">🚨 Active SOS</p>
        {sosEvents.length === 0 ? (
          <EmptyState icon="✅" title="No active SOS" hint="All clear right now." />
        ) : (
          <div className="list">
            {sosEvents.map((e) => (
              <article key={e._id} className="queue-row sos-row">
                <div>
                  <strong>{e.user?.name || "Member"}</strong>
                  <small>{e.user?.phone || "—"}{e.trip ? ` · ${e.trip.pickup?.address} → ${e.trip.destination?.address}` : ""}</small>
                </div>
                <button className="secondary sm" onClick={() => resolveSos(e._id)}>Resolve</button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <p className="eyebrow">User reports</p>
        <div className="tabs">
          {REPORT_FILTERS.map((f) => (
            <button key={f} className={`tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {msg && <div className="alert info">{msg}</div>}

        {reports.length === 0 ? (
          <EmptyState icon="📋" title={`No ${filter} reports`} hint="Nothing in this queue." />
        ) : (
          <div className="list">
            {reports.map((r) => (
              <article key={r._id} className="queue-row">
                <div>
                  <strong>{r.reportedUser?.name || "User"} <span className="vbadge muted">{r.category}</span></strong>
                  <small>by {r.reporter?.name || "—"}{r.reportedUser?.safetyScore != null ? ` · safety ${r.reportedUser.safetyScore}` : ""}</small>
                  <p className="muted-text">{r.description}</p>
                </div>
                {["open", "reviewing"].includes(r.status) && (
                  <div className="passenger-actions">
                    {r.status === "open" && <button className="secondary sm" onClick={() => resolveReport(r._id, "reviewing")}>Review</button>}
                    <button className="primary sm" onClick={() => resolveReport(r._id, "actioned")}>Action</button>
                    <button className="secondary sm" onClick={() => resolveReport(r._id, "dismissed")}>Dismiss</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
