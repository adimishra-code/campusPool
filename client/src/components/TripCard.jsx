import { useState } from "react";
import { Link } from "react-router-dom";
import StatusPill from "./StatusPill.jsx";

function fmtDate(d) {
  return new Date(d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}
function fmtTime(d) {
  return new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

const BREAKDOWN_LABELS = {
  route: "Route",
  timing: "Timing",
  trust: "Trust",
  hostel: "Hostel",
  rating: "Rating",
  seats: "Seats"
};

function MatchBadge({ score, breakdown, reason }) {
  const [open, setOpen] = useState(false);
  const tone = score >= 80 ? "score-high" : score >= 60 ? "score-mid" : "score-low";
  return (
    <div className="match-badge-wrap">
      <button
        type="button"
        className={`pill match ${tone}`}
        onClick={() => setOpen((o) => !o)}
        title="See why this matches"
      >
        {score}% Match
      </button>
      {open && breakdown && (
        <div className="match-popover">
          {reason && <p className="match-reason">{reason}</p>}
          {Object.entries(breakdown).map(([k, v]) => (
            <div className="match-row" key={k}>
              <span>{BREAKDOWN_LABELS[k] || k}</span>
              <span className="match-bar">
                <span style={{ width: `${Math.min(100, v * 2.5)}%` }} />
              </span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TripCard({ trip, score, onJoin, joining, onView }) {
  const host = trip.host || {};
  const matchScore = typeof score === "number" ? score : trip.matchScore;
  const reliability = host.hostReliability;

  return (
    <article className="trip-card">
      <header className="trip-card-top">
        <div className="host-chip">
          <span className="avatar sm" aria-hidden>
            {initials(host.name)}
          </span>
          <div>
            <strong>{host.name || "Host"}</strong>
            <small>
              {host.hostel || "Campus host"}
              {typeof reliability === "number" && (
                <span className={`rel-pill ${reliability >= 60 ? "ok" : "muted"}`}>
                  ★ {reliability}
                </span>
              )}
            </small>
          </div>
        </div>
        <div className="trip-card-tags">
          {typeof matchScore === "number" && (
            <MatchBadge
              score={matchScore}
              breakdown={trip.breakdown}
              reason={trip.recommendationReason}
            />
          )}
          <StatusPill status={trip.status} />
        </div>
      </header>

      <div className="route-line">
        <span className="dot start" /> <span className="route-place">{trip.pickup?.address}</span>
        <span className="route-arrow">→</span>
        <span className="dot end" />{" "}
        <span className="route-place">{trip.destination?.address}</span>
      </div>

      <div className="trip-meta">
        <div>
          <small>Date</small>
          <strong>{fmtDate(trip.departureTime)}</strong>
        </div>
        <div>
          <small>Time</small>
          <strong>{fmtTime(trip.departureTime)}</strong>
        </div>
        <div>
          <small>Seats left</small>
          <strong>{trip.seatsAvailable}</strong>
        </div>
        <div>
          <small>Distance</small>
          <strong>{trip.distanceKm ? `${Math.round(trip.distanceKm * 10) / 10} km` : "—"}</strong>
        </div>
        <div>
          <small>Per person</small>
          <strong>₹{trip.costPerPerson}</strong>
        </div>
      </div>

      <footer className="trip-card-actions">
        <Link className="secondary" to={`/trip/${trip._id}`} onClick={() => onView && onView(trip)}>
          View details
        </Link>
        {onJoin && (
          <button
            className="primary"
            disabled={joining || trip.seatsAvailable <= 0}
            onClick={() => onJoin(trip)}
          >
            {joining ? "Joining…" : trip.seatsAvailable <= 0 ? "Full" : "Join trip"}
          </button>
        )}
      </footer>
    </article>
  );
}
