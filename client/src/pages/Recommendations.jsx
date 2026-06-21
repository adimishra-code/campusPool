import { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { fetchRecommendations, joinTrip, trackClick } from "../store/tripSlice.js";
import TripCard from "../components/TripCard.jsx";
import Spinner from "../components/Spinner.jsx";
import EmptyState from "../components/EmptyState.jsx";

function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export default function Recommendations() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items, status, error } = useSelector((s) => s.trips.recommendations);

  useEffect(() => { dispatch(fetchRecommendations()); }, [dispatch]);

  // Derive recommended hosts (unique, ranked by reliability) and suggested (soonest).
  const recommendedHosts = useMemo(() => {
    const map = new Map();
    items.forEach(({ trip }) => {
      const h = trip.host;
      if (h && !map.has(h._id)) map.set(h._id, h);
    });
    return [...map.values()].sort((a, b) => (b.hostReliability || 0) - (a.hostReliability || 0)).slice(0, 5);
  }, [items]);

  const suggested = useMemo(
    () => [...items].sort((a, b) => new Date(a.trip.departureTime) - new Date(b.trip.departureTime)).slice(0, 4),
    [items]
  );

  const onJoin = async (trip) => {
    dispatch(trackClick({ id: trip._id, matchScore: trip.matchScore }));
    const res = await dispatch(joinTrip({ id: trip._id, notes: "" }));
    if (!res.error) navigate(`/trip/${trip._id}`);
  };
  const onView = (trip) => dispatch(trackClick({ id: trip._id, matchScore: trip.matchScore }));

  if (status === "loading") return <Spinner label="Finding your best matches…" />;

  return (
    <div className="page">
      <header className="page-head"><div><p className="eyebrow">For you</p><h1>Your recommendations</h1></div></header>

      {status === "failed" && <div className="alert error">{error}</div>}
      {status === "succeeded" && items.length === 0 && (
        <EmptyState icon="✨" title="No recommendations yet" hint="When hosts post trips near your campus, your best matches show up here." />
      )}

      {items.length > 0 && (
        <>
          <section>
            <p className="eyebrow">Top matches</p>
            <div className="trip-grid">
              {items.map(({ trip, matchScore, breakdown, recommendationReason }) => (
                <TripCard
                  key={trip._id}
                  trip={{ ...trip, matchScore, breakdown, recommendationReason }}
                  onJoin={onJoin}
                  onView={onView}
                />
              ))}
            </div>
          </section>

          <section className="panel">
            <p className="eyebrow">Recommended hosts</p>
            <div className="list">
              {recommendedHosts.map((h) => (
                <article key={h._id} className="host-rank-row">
                  <div className="host-chip">
                    <span className="avatar sm" aria-hidden>{initials(h.name)}</span>
                    <div>
                      <strong>{h.name}</strong>
                      <small>{h.hostel || "Campus host"}</small>
                    </div>
                  </div>
                  <span className={`rel-pill ${h.hostReliability >= 60 ? "ok" : "muted"}`}>★ {h.hostReliability} · {h.hostReliabilityLabel}</span>
                </article>
              ))}
            </div>
          </section>

          <section>
            <p className="eyebrow">Suggested trips (soonest)</p>
            <div className="trip-grid">
              {suggested.map(({ trip, matchScore, breakdown, recommendationReason }) => (
                <TripCard key={trip._id} trip={{ ...trip, matchScore, breakdown, recommendationReason }} onView={onView} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
