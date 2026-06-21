import { useEffect, useRef, useState } from "react";
import api from "../services/api.js";
import { connectSocket } from "../services/socket.js";

const REPORT_CATEGORIES = [
  { value: "harassment", label: "Harassment" },
  { value: "unsafe_driving", label: "Unsafe driving" },
  { value: "no_show", label: "No-show" },
  { value: "inappropriate_behavior", label: "Inappropriate behaviour" },
  { value: "fraud", label: "Fraud / payment" },
  { value: "other", label: "Other" }
];

// Safety controls for a trip participant: SOS, live-location sharing, en-route
// check-ins, safe-arrival confirmation, an external share link, reporting a
// co-traveller, and a live SOS/location feed (relayed over the trip room).
export default function TripSafety({ tripId, onLiveLocation, members = [] }) {
  const [sosState, setSosState] = useState("idle"); // idle | sending | sent
  const [sharing, setSharing] = useState(false);
  const [incomingSos, setIncomingSos] = useState(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState({ reportedUser: "", category: "harassment", description: "" });
  const [reportMsg, setReportMsg] = useState(null);
  const socketRef = useRef(null);
  const watchRef = useRef(null);

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;
    socket.emit("chat:join", { tripId });

    const onLoc = (p) => { if (p.tripId === String(tripId) && onLiveLocation) onLiveLocation(p.coordinates); };
    const onSos = (a) => { if (a.trip === String(tripId)) setIncomingSos(a); };
    socket.on("trip:location", onLoc);
    socket.on("sos:alert", onSos);

    return () => {
      socket.off("trip:location", onLoc);
      socket.off("sos:alert", onSos);
      if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current);
    };
  }, [tripId, onLiveLocation]);

  const sendSos = () => {
    if (sosState !== "idle") return;
    if (!window.confirm("Send an SOS to your trip members and campus operations?")) return;
    setSosState("sending");
    const post = (location) =>
      api.post(`/trips/${tripId}/sos`, { location }).then(() => setSosState("sent")).catch(() => setSosState("idle"));
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => post([pos.coords.longitude, pos.coords.latitude]),
        () => post(undefined),
        { timeout: 4000 }
      );
    } else post(undefined);
  };

  const toggleShare = () => {
    if (!navigator.geolocation) return;
    if (sharing) {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      setSharing(false);
      return;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => socketRef.current?.emit("trip:location", { tripId, coordinates: [pos.coords.longitude, pos.coords.latitude] }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    setSharing(true);
  };

  const checkIn = () => {
    const post = (location) => api.post(`/trips/${tripId}/check-in`, { location }).then(() => setCheckedIn(true)).catch(() => {});
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => post([pos.coords.longitude, pos.coords.latitude]),
        () => post(undefined),
        { timeout: 4000 }
      );
    } else post(undefined);
  };

  const confirmArrival = () => {
    api.post(`/trips/${tripId}/confirm-arrival`).then(() => setArrived(true)).catch(() => {});
  };

  const createShareLink = () => {
    api.post(`/trips/${tripId}/share`).then(({ data }) => {
      setShareUrl(data.url);
      navigator.clipboard?.writeText(data.url).catch(() => {});
    }).catch(() => {});
  };

  const submitReport = (e) => {
    e.preventDefault();
    setReportMsg(null);
    api.post("/safety/reports", { ...report, trip: tripId })
      .then(() => { setReportMsg("Report submitted. Operations will review it."); setReport({ reportedUser: "", category: "harassment", description: "" }); setReportOpen(false); })
      .catch((err) => setReportMsg(err.response?.data?.message || "Could not submit report"));
  };

  return (
    <section className="panel safety-panel">
      <p className="eyebrow">Safety</p>
      {incomingSos && (
        <div className="alert error sos-banner">🚨 {incomingSos.user?.name || "A member"} raised an SOS on this trip.</div>
      )}
      <div className="button-row">
        <button className="danger sos-btn" onClick={sendSos} disabled={sosState !== "idle"}>
          {sosState === "sent" ? "SOS sent ✓" : sosState === "sending" ? "Sending…" : "🚨 SOS"}
        </button>
        <button className={sharing ? "primary" : "secondary"} onClick={toggleShare}>
          {sharing ? "Stop sharing location" : "Share live location"}
        </button>
        <button className="secondary" onClick={checkIn} disabled={checkedIn}>
          {checkedIn ? "Checked in ✓" : "Check in"}
        </button>
        <button className="secondary" onClick={confirmArrival} disabled={arrived}>
          {arrived ? "Arrival confirmed ✓" : "Confirm safe arrival"}
        </button>
        <button className="secondary" onClick={createShareLink}>Share trip link</button>
        {members.length > 0 && (
          <button className="secondary" onClick={() => setReportOpen((v) => !v)}>Report a member</button>
        )}
      </div>

      {shareUrl && (
        <small className="muted-text">Share link (copied, expires automatically): <a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a></small>
      )}

      {reportOpen && (
        <form className="report-form" onSubmit={submitReport}>
          <select value={report.reportedUser} onChange={(e) => setReport({ ...report, reportedUser: e.target.value })} required>
            <option value="">Select member…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={report.category} onChange={(e) => setReport({ ...report, category: e.target.value })}>
            {REPORT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <textarea
            placeholder="What happened?" minLength={5} maxLength={1000} required
            value={report.description} onChange={(e) => setReport({ ...report, description: e.target.value })}
          />
          <button className="primary sm" type="submit">Submit report</button>
        </form>
      )}
      {reportMsg && <div className="alert info">{reportMsg}</div>}

      <small className="muted-text">SOS alerts trip members, campus operations, and your emergency contacts.</small>
    </section>
  );
}
