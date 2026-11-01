import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { fetchTrips, joinTrip, trackClick } from "../store/tripSlice.js";
import TripCard from "../components/TripCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import GoogleMapPanel from "../components/GoogleMapPanel.jsx";
import LocationSelector from "../components/LocationSelector.jsx";
import Icon from "../components/Icon.jsx";

export default function FindTrips() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items, status, error } = useSelector((s) => s.trips.feed);
  const action = useSelector((s) => s.trips.action);

  const [sourcePlace, setSourcePlace] = useState(null);
  const [destPlace, setDestPlace] = useState(null);
  const [date, setDate] = useState("");
  const [minSeats, setMinSeats] = useState(1);
  const [joiningId, setJoiningId] = useState(null);
  const [showMap, setShowMap] = useState(false); // mobile map toggle

  // Pass the chosen route to the API so results are ranked by match score.
  useEffect(() => {
    const pickup = sourcePlace ? sourcePlace.coordinates : null;
    const dest = destPlace ? destPlace.coordinates : null;
    dispatch(fetchTrips({ date: date || undefined, pickup, destination: dest }));
  }, [dispatch, sourcePlace, destPlace, date]);

  // Results are already ranked server-side; only the seats filter is client-side.
  const filtered = useMemo(
    () => items.filter((t) => !minSeats || (t.seatsAvailable ?? 0) >= Number(minSeats)),
    [items, minSeats]
  );

  // Pickup pins for every trip currently shown, for the map panel.
  const markers = useMemo(
    () =>
      filtered
        .map((t) => ({ id: t._id, label: "P", coordinates: t.pickup?.coordinates?.coordinates }))
        .filter((m) => Array.isArray(m.coordinates)),
    [filtered]
  );

  const onJoin = async (trip) => {
    setJoiningId(trip._id);
    dispatch(trackClick({ id: trip._id, matchScore: trip.matchScore }));
    const res = await dispatch(joinTrip({ id: trip._id, notes: "" }));
    setJoiningId(null);
    if (!res.error) navigate(`/trip/${trip._id}`);
  };

  const onView = (trip) => dispatch(trackClick({ id: trip._id, matchScore: trip.matchScore }));
  const resetFilters = () => {
    setSourcePlace(null);
    setDestPlace(null);
    setDate("");
    setMinSeats(1);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Find a ride</p>
          <h1>Trips ranked for you</h1>
        </div>
        <button className="secondary" onClick={() => navigate("/recommendations")}>
          For you →
        </button>
      </header>

      <section className="panel filters">
        <div className="filters-grid">
          <LocationSelector
            label="From"
            value={sourcePlace}
            onChange={setSourcePlace}
            allowAnywhere={true}
          />
          <LocationSelector
            label="To"
            value={destPlace}
            onChange={setDestPlace}
            allowAnywhere={true}
          />
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Min seats</span>
            <select value={minSeats} onChange={(e) => setMinSeats(e.target.value)}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}+
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="filters-foot">
          <button className="link-button" onClick={resetFilters}>
            Clear filters
          </button>
          <button className="secondary sm map-toggle" onClick={() => setShowMap((v) => !v)}>
            <Icon name="map" size={15} />
            {showMap ? "Hide map" : "Show map"}
          </button>
        </div>
      </section>

      {action.error && <div className="alert error">{action.error}</div>}
      {status === "loading" && (
        <div className="skeleton-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      )}
      {status === "failed" && <div className="alert error">{error}</div>}

      {status === "succeeded" && filtered.length === 0 && (
        <EmptyState
          icon="🛣️"
          title="No trips match your search"
          hint="Try clearing filters — new trips are posted daily."
          action={
            <button className="secondary" onClick={resetFilters}>
              Clear filters
            </button>
          }
        />
      )}

      {filtered.length > 0 && (
        <div className="feed-layout">
          <div className="trip-grid feed-list">
            {filtered.map((trip) => (
              <TripCard
                key={trip._id}
                trip={trip}
                onJoin={onJoin}
                onView={onView}
                joining={joiningId === trip._id && action.status === "loading"}
              />
            ))}
          </div>
          <aside className={`feed-map ${showMap ? "open" : ""}`}>
            <GoogleMapPanel
              pickup={filtered[0]?.pickup}
              destination={filtered[0]?.destination}
              route={filtered[0]?.route}
              markers={markers}
              caption={`${filtered.length} trip${filtered.length === 1 ? "" : "s"} near campus`}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
