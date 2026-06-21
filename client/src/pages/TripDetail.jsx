import { useEffect, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchTrip,
  joinTrip,
  cancelJoin,
  approvePassenger,
  rejectPassenger,
  cancelTrip,
  startTrip,
  completeTrip
} from "../store/tripSlice.js";
import GoogleMapPanel from "../components/GoogleMapPanel.jsx";
import StatusPill from "../components/StatusPill.jsx";
import Spinner from "../components/Spinner.jsx";
import ChatWindow from "../components/ChatWindow.jsx";
import TripSafety from "../components/TripSafety.jsx";
import TripPayment from "../components/TripPayment.jsx";
import Icon from "../components/Icon.jsx";

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
const idOf = (v) => (v && typeof v === "object" ? v._id : v);

// The three host-facing lifecycle stages, mapped from the richer backend status
// set (draft/offered/open/full → departed/in_progress → completed).
const LIFECYCLE = [
  { key: "offered", label: "Offered" },
  { key: "departed", label: "In progress" },
  { key: "completed", label: "Completed" }
];
const stageIndexOf = (status) =>
  status === "completed" ? 2 : ["departed", "in_progress"].includes(status) ? 1 : 0;

export default function TripDetail() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { trip, match, status, error } = useSelector((s) => s.trips.current);
  const action = useSelector((s) => s.trips.action);
  const me = useSelector((s) => s.auth.user);

  const [liveLocation, setLiveLocation] = useState(null);
  const onLiveLocation = useCallback((coordinates) => setLiveLocation({ coordinates }), []);

  useEffect(() => {
    dispatch(fetchTrip(id));
  }, [dispatch, id]);

  if (status === "loading" || (!trip && status !== "failed"))
    return <Spinner label="Loading trip…" />;
  if (status === "failed")
    return (
      <div className="page">
        <div className="alert error">{error}</div>
      </div>
    );
  if (!trip) return null;

  const myId = me?.id || me?._id;
  const isHost = idOf(trip.host) === myId;
  const myPassenger = (trip.passengers || []).find((p) => idOf(p.user) === myId);
  const canJoin =
    !isHost && !myPassenger && trip.seatsAvailable > 0 && ["offered", "open"].includes(trip.status);
  const canChat = isHost || (myPassenger && ["approved", "completed"].includes(myPassenger.status));
  const busy = action.status === "loading";

  // Host lifecycle controls — gated to match the backend's allowed transitions.
  const canStart = isHost && ["offered", "open", "full"].includes(trip.status);
  const canComplete = isHost && ["departed", "in_progress"].includes(trip.status);
  const canCancel = isHost && ["offered", "open", "full"].includes(trip.status);
  const isCancelled = trip.status === "cancelled";
  const stageIndex = stageIndexOf(trip.status);

  const host = trip.host || {};

  return (
    <div className="page detail-layout">
      <div className="detail-main">
        <header className="page-head">
          <div>
            <p className="eyebrow">Trip details</p>
            <h1>
              {trip.pickup?.address} → {trip.destination?.address}
            </h1>
          </div>
          <StatusPill status={trip.status} />
        </header>

        {action.error && <div className="alert error">{action.error}</div>}

        <section className="panel">
          <div className="detail-grid">
            <div>
              <small>Date</small>
              <strong>{new Date(trip.departureTime).toLocaleDateString()}</strong>
            </div>
            <div>
              <small>Time</small>
              <strong>
                {new Date(trip.departureTime).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </strong>
            </div>
            <div>
              <small>Seats left</small>
              <strong>
                {trip.seatsAvailable} / {trip.seatsTotal}
              </strong>
            </div>
            <div>
              <small>Distance</small>
              <strong>
                {trip.distanceKm ? `${Math.round(trip.distanceKm * 10) / 10} km` : "—"}
              </strong>
            </div>
            <div>
              <small>Per person</small>
              <strong>₹{trip.costPerPerson}</strong>
            </div>
            {typeof trip.carbonSavedKg === "number" && (
              <div>
                <small>CO₂ saved</small>
                <strong>🌱 {trip.carbonSavedKg} kg</strong>
              </div>
            )}
            {match && (
              <div>
                <small>Your match</small>
                <strong>{match.score}%</strong>
              </div>
            )}
          </div>
          {match?.breakdown && (
            <div className="match-inline">
              {Object.entries(match.breakdown).map(([k, v]) => (
                <span key={k} className="match-chip">
                  {k}: <strong>{v}</strong>
                </span>
              ))}
            </div>
          )}
          {trip.notes && <p className="muted-text">“{trip.notes}”</p>}

          <div className="button-row">
            {canJoin && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => dispatch(joinTrip({ id, notes: "" }))}
              >
                {busy ? "…" : "Join trip"}
              </button>
            )}
            {myPassenger && ["pending", "approved"].includes(myPassenger.status) && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => dispatch(cancelJoin(id))}
              >
                {myPassenger.status === "pending" ? "Cancel request" : "Leave trip"}
              </button>
            )}
            {myPassenger && (
              <span className="inline-status">
                Your status: <StatusPill status={myPassenger.status} kind="passenger" />
              </span>
            )}
          </div>
        </section>

        {/* Host-only lifecycle controls — kept distinct from the Safety panel
            (check-in / safe-arrival / SOS) and the Payment panel below. */}
        {isHost && (
          <section className="panel trip-controls">
            <p className="eyebrow">Trip controls</p>
            <ol className="lifecycle-steps" aria-label="Trip lifecycle">
              {LIFECYCLE.map((s, i) => {
                const state = isCancelled
                  ? ""
                  : i < stageIndex
                    ? "done"
                    : i === stageIndex
                      ? "active"
                      : "";
                return (
                  <li key={s.key} className={`lifecycle-step ${state}`}>
                    <span className="lifecycle-dot" aria-hidden>
                      {state === "done" ? <Icon name="check" size={14} /> : i + 1}
                    </span>
                    <span className="lifecycle-label">{s.label}</span>
                  </li>
                );
              })}
            </ol>

            {isCancelled && <div className="alert error">This trip was cancelled.</div>}

            <div className="button-row">
              {canStart && (
                <button className="primary" disabled={busy} onClick={() => dispatch(startTrip(id))}>
                  {busy ? "…" : "Start trip"}
                </button>
              )}
              {canComplete && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Complete this trip? This marks it finished for everyone on board."
                      )
                    )
                      dispatch(completeTrip(id));
                  }}
                >
                  {busy ? "…" : "Complete trip"}
                </button>
              )}
              {canCancel && (
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => dispatch(cancelTrip({ id, reason: "Cancelled by host" }))}
                >
                  Cancel trip
                </button>
              )}
              {trip.status === "completed" && (
                <span className="inline-status">Trip completed ✓</span>
              )}
            </div>

            <small className="muted-text">
              You control the trip here. Members use the Safety panel below for check-in, safe
              arrival and SOS.
            </small>
          </section>
        )}

        <section className="panel">
          <p className="eyebrow">Host</p>
          <div className="host-chip lg">
            <span className="avatar" aria-hidden>
              {initials(host.name)}
            </span>
            <div>
              <strong>{host.name || "Host"}</strong>
              <small>
                {host.hostel || "Campus host"}
                {typeof host.trustScore === "number" ? ` · Trust ${host.trustScore}` : ""}
              </small>
              {typeof host.hostReliability === "number" && (
                <span className={`rel-pill ${host.hostReliability >= 60 ? "ok" : "muted"}`}>
                  Reliability ★ {host.hostReliability} · {host.hostReliabilityLabel}
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">Passengers ({(trip.passengers || []).length})</p>
          {(trip.passengers || []).length === 0 && (
            <p className="muted-text">No one has joined yet.</p>
          )}
          <div className="list">
            {(trip.passengers || []).map((p) => (
              <article key={idOf(p.user)} className="passenger-row">
                <div className="host-chip">
                  <span className="avatar sm" aria-hidden>
                    {initials(p.user?.name)}
                  </span>
                  <div>
                    <strong>{p.user?.name || "Student"}</strong>
                    <small>{p.user?.hostel || "—"}</small>
                  </div>
                </div>
                <div className="passenger-actions">
                  <StatusPill status={p.status} kind="passenger" />
                  {isHost && p.status === "pending" && (
                    <>
                      <button
                        className="primary sm"
                        disabled={busy}
                        onClick={() => dispatch(approvePassenger({ id, userId: idOf(p.user) }))}
                      >
                        Approve
                      </button>
                      <button
                        className="secondary sm"
                        disabled={busy}
                        onClick={() =>
                          dispatch(
                            rejectPassenger({ id, userId: idOf(p.user), reason: "Not a match" })
                          )
                        }
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {canChat && (
          <TripSafety
            tripId={trip._id}
            onLiveLocation={onLiveLocation}
            members={[
              ...(idOf(trip.host) !== myId
                ? [{ id: idOf(trip.host), name: host.name || "Host" }]
                : []),
              ...(trip.passengers || [])
                .filter(
                  (p) => idOf(p.user) !== myId && ["approved", "completed"].includes(p.status)
                )
                .map((p) => ({ id: idOf(p.user), name: p.user?.name || "Member" }))
            ]}
          />
        )}
        {canChat && <TripPayment tripId={trip._id} isHost={isHost} />}
        {canChat && <ChatWindow tripId={trip._id} />}
      </div>

      <aside className="detail-aside">
        <GoogleMapPanel
          pickup={trip.pickup}
          destination={trip.destination}
          route={trip.route}
          liveLocation={liveLocation}
          caption={`${trip.distanceKm ? `${Math.round(trip.distanceKm * 10) / 10} km` : ""} route`}
        />
        <button className="link-button" onClick={() => navigate("/feed")}>
          ← Back to feed
        </button>
      </aside>
    </div>
  );
}
