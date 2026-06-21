import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchMyTrips } from "../store/tripSlice.js";
import TripCard from "../components/TripCard.jsx";
import Spinner from "../components/Spinner.jsx";
import EmptyState from "../components/EmptyState.jsx";

const TABS = [
  { key: "hosted", label: "Hosted" },
  { key: "joined", label: "Joined" },
  { key: "pending", label: "Pending" },
  { key: "completed", label: "Completed" }
];

export default function MyTrips() {
  const dispatch = useDispatch();
  const { hosted, joined, pending, completed, counts, status, error } = useSelector(
    (s) => s.trips.mine
  );
  const [tab, setTab] = useState("hosted");

  useEffect(() => {
    dispatch(fetchMyTrips());
  }, [dispatch]);

  const data = { hosted, joined, pending, completed }[tab] || [];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Your activity</p>
          <h1>My trips</h1>
        </div>
        <button className="secondary" onClick={() => dispatch(fetchMyTrips())}>
          Refresh
        </button>
      </header>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="tab-count">
              {counts?.[t.key] ?? { hosted, joined, pending, completed }[t.key]?.length ?? 0}
            </span>
          </button>
        ))}
      </div>

      {status === "loading" && <Spinner label="Loading your trips…" />}
      {status === "failed" && <div className="alert error">{error}</div>}

      {status === "succeeded" && data.length === 0 && (
        <EmptyState
          icon="🧳"
          title={`No ${tab} trips`}
          hint={
            tab === "hosted"
              ? "Offer a trip from the Offer Trip tab."
              : "Join a trip from the Feed to see it here."
          }
        />
      )}

      <div className="trip-grid">
        {data.map((trip) => (
          <TripCard key={trip._id} trip={trip} />
        ))}
      </div>
    </div>
  );
}
