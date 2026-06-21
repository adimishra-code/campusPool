import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api.js";
import Spinner from "../components/Spinner.jsx";

// Public, read-only "follow my trip" view opened by a guardian from a share
// link. No login required — the signed token in the URL is the only credential.
export default function SharedTrip() {
  const { token } = useParams();
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/safety/share/${token}`)
      .then(({ data }) => setTrip(data.trip))
      .catch((e) => setError(e.response?.data?.message || "This link is invalid or has expired."))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <Spinner label="Loading shared trip…" />;

  return (
    <div className="page" style={{ maxWidth: 560, margin: "0 auto" }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">CampusPool</p>
          <h1>Trip status</h1>
        </div>
      </header>
      {error ? (
        <div className="alert error">{error}</div>
      ) : (
        <section className="panel">
          <div className="detail-grid">
            <div>
              <small>Host</small>
              <strong>{trip.host}</strong>
            </div>
            <div>
              <small>Status</small>
              <strong style={{ textTransform: "capitalize" }}>
                {trip.status?.replace(/_/g, " ")}
              </strong>
            </div>
            <div>
              <small>From</small>
              <strong>{trip.pickup}</strong>
            </div>
            <div>
              <small>To</small>
              <strong>{trip.destination}</strong>
            </div>
            <div>
              <small>Departure</small>
              <strong>
                {trip.departureTime ? new Date(trip.departureTime).toLocaleString() : "—"}
              </strong>
            </div>
            <div>
              <small>Safe arrival</small>
              <strong>
                {trip.arrivalConfirmedAt
                  ? `Confirmed ${new Date(trip.arrivalConfirmedAt).toLocaleTimeString()}`
                  : "Not yet"}
              </strong>
            </div>
          </div>
          {trip.lastKnownLocation && (
            <p className="muted-text">
              Last shared location: {trip.lastKnownLocation[1]?.toFixed(4)},{" "}
              {trip.lastKnownLocation[0]?.toFixed(4)}
              {trip.lastCheckInAt ? ` · ${new Date(trip.lastCheckInAt).toLocaleTimeString()}` : ""}
            </p>
          )}
          <small className="muted-text">
            This is a temporary, read-only view shared by a trip member.
          </small>
        </section>
      )}
    </div>
  );
}
