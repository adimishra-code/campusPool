import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";
import { offerTrip } from "../store/tripSlice.js";
import { GBU_PLACES, toLocation, isCampusAnchor } from "../constants/places.js";
import EmptyState from "../components/EmptyState.jsx";
import GoogleMapPanel from "../components/GoogleMapPanel.jsx";
import LocationSelector from "../components/LocationSelector.jsx";

const blankVehicle = { make: "", model: "", color: "", plateNumber: "", seats: 4, category: "car" };

export default function OfferTrip() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);
  const offer = useSelector((s) => s.trips.offer);

  const isHost = user?.role === "host" || user?.role === "admin";

  const [vehicles, setVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [newVehicle, setNewVehicle] = useState(blankVehicle);
  const [vehicleError, setVehicleError] = useState(null);

  // Selected pickup & destination objects with GBU defaults
  const [pickupPlace, setPickupPlace] = useState(GBU_PLACES[0]); // GBU Gate 1
  const [destPlace, setDestPlace] = useState(
    GBU_PLACES.find((p) => p.id === "pari-chowk") || GBU_PLACES[1]
  );

  const [form, setForm] = useState({
    date: "",
    time: "",
    seats: 4,
    vehicleId: "",
    costPerPerson: "",
    notes: ""
  });
  const [estimate, setEstimate] = useState(null);
  const [estimateError, setEstimateError] = useState(null);
  const [formError, setFormError] = useState(null);

  // The "One-Anchor" Rule: If one point is custom-typed, the other MUST be an official GBU Campus location!
  const pickupLockedToCampus = Boolean(destPlace?.isCustom);
  const destLockedToCampus = Boolean(pickupPlace?.isCustom);

  const handleSetPickup = (newPlace) => {
    setPickupPlace(newPlace);
    // If setting pickup to custom, make sure destination is an official GBU campus location
    if (newPlace?.isCustom && !isCampusAnchor(destPlace)) {
      setDestPlace(GBU_PLACES[0]);
    }
  };

  const handleSetDest = (newPlace) => {
    setDestPlace(newPlace);
    // If setting destination to custom, make sure pickup is an official GBU campus location
    if (newPlace?.isCustom && !isCampusAnchor(pickupPlace)) {
      setPickupPlace(GBU_PLACES[0]);
    }
  };

  const loadVehicles = async () => {
    setLoadingVehicles(true);
    try {
      const { data } = await api.get("/vehicles");
      setVehicles(data.vehicles || []);
    } catch (err) {
      setVehicles([]);
      setVehicleError(
        err.response?.data?.message || "Could not load your vehicles — refresh to try again."
      );
    } finally {
      setLoadingVehicles(false);
    }
  };
  useEffect(() => {
    if (isHost) loadVehicles();
    else setLoadingVehicles(false);
  }, [isHost]);

  const approvedVehicles = vehicles.filter((v) => v.verificationStatus === "approved");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const buildLocations = () => {
    return {
      pickup: toLocation(pickupPlace),
      destination: toLocation(destPlace)
    };
  };

  const runEstimate = async () => {
    setEstimateError(null);
    try {
      const { pickup, destination } = buildLocations();
      const { data } = await api.post("/trips/estimate", {
        pickup,
        destination,
        seats: Number(form.seats)
      });
      setEstimate(data);
      setForm((f) => ({ ...f, costPerPerson: f.costPerPerson || String(data.costPerPerson) }));
    } catch (err) {
      setEstimate(null);
      setEstimateError(
        err.response?.data?.message || "Could not estimate cost — you can still enter it manually."
      );
    }
  };

  const addVehicle = async (e) => {
    e.preventDefault();
    setVehicleError(null);
    try {
      await api.post("/vehicles", { ...newVehicle, seats: Number(newVehicle.seats) });
      setNewVehicle(blankVehicle);
      await loadVehicles();
    } catch (err) {
      setVehicleError(err.response?.data?.message || "Could not add vehicle");
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const { pickup, destination } = buildLocations();
    if (!pickup.address || !destination.address) {
      return setFormError("Please select or enter both pickup and destination");
    }
    if (pickup.address.trim() === destination.address.trim()) {
      return setFormError("Pickup and destination must differ");
    }
    if (pickupPlace?.isCustom && destPlace?.isCustom) {
      return setFormError("At least one location must be an official GBU Campus location.");
    }
    if (!form.date || !form.time) return setFormError("Pick a date and time");
    if (!form.vehicleId) return setFormError("Select a verified vehicle");
    if (!form.costPerPerson) return setFormError("Enter cost per person");

    const departureTime = new Date(`${form.date}T${form.time}`).toISOString();
    const res = await dispatch(
      offerTrip({
        pickup,
        destination,
        departureTime,
        vehicleId: form.vehicleId,
        seats: Number(form.seats),
        costPerPerson: Number(form.costPerPerson),
        notes: form.notes || undefined
      })
    );
    if (!res.error) navigate("/my-trips");
  };

  if (!isHost) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <p className="eyebrow">Offer a trip</p>
            <h1>Become a host</h1>
          </div>
        </header>
        <EmptyState
          icon="🚗"
          title="Hosting is for verified hosts"
          hint="Your account is set up to join rides. Register a host account to start offering trips to fellow students."
        />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Offer a trip</p>
          <h1>Share your ride</h1>
        </div>
      </header>

      {loadingVehicles ? null : approvedVehicles.length === 0 ? (
        <section className="panel">
          <h2>Add a vehicle to get started</h2>
          <p className="muted-text">
            You need at least one verified vehicle before offering trips. Add it here — an admin
            verifies it before it goes live.
          </p>
          {vehicles.length > 0 && (
            <div className="alert info">
              You have {vehicles.length} vehicle(s) awaiting verification.
            </div>
          )}
          <form className="form-grid" onSubmit={addVehicle}>
            <input
              placeholder="Make (e.g. Maruti)"
              value={newVehicle.make}
              onChange={(e) => setNewVehicle({ ...newVehicle, make: e.target.value })}
              required
            />
            <input
              placeholder="Model (e.g. Swift)"
              value={newVehicle.model}
              onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
              required
            />
            <input
              placeholder="Color"
              value={newVehicle.color}
              onChange={(e) => setNewVehicle({ ...newVehicle, color: e.target.value })}
              required
            />
            <input
              placeholder="Plate number"
              value={newVehicle.plateNumber}
              onChange={(e) => setNewVehicle({ ...newVehicle, plateNumber: e.target.value })}
              required
            />
            <select
              value={newVehicle.seats}
              onChange={(e) => setNewVehicle({ ...newVehicle, seats: e.target.value })}
            >
              {[2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} seats
                </option>
              ))}
            </select>
            <select
              value={newVehicle.category}
              onChange={(e) => setNewVehicle({ ...newVehicle, category: e.target.value })}
            >
              <option value="car">Car</option>
              <option value="suv">SUV</option>
              <option value="bike">Bike</option>
              <option value="auto">Auto</option>
            </select>
            <button className="primary" type="submit">
              Add vehicle
            </button>
          </form>
          {vehicleError && <div className="alert error">{vehicleError}</div>}
        </section>
      ) : (
        <div className="two-column offer-layout">
          <form className="panel offer-form" onSubmit={submit}>
            <div className="form-grid">
              <LocationSelector
                label="From (Pickup)"
                value={pickupPlace}
                onChange={handleSetPickup}
                lockedToCampus={pickupLockedToCampus}
                lockReason="Destination is custom-typed, so pickup must be an official GBU Campus point"
              />
              <LocationSelector
                label="To (Destination)"
                value={destPlace}
                onChange={handleSetDest}
                lockedToCampus={destLockedToCampus}
                lockReason="Pickup is custom-typed, so destination must be an official GBU Campus point"
              />
              <label className="field">
                <span>Date</span>
                <input type="date" value={form.date} onChange={set("date")} />
              </label>
              <label className="field">
                <span>Time</span>
                <input type="time" value={form.time} onChange={set("time")} />
              </label>
              <label className="field">
                <span>Seats offered</span>
                <select value={form.seats} onChange={set("seats")}>
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Vehicle</span>
                <select value={form.vehicleId} onChange={set("vehicleId")}>
                  <option value="">Select a vehicle</option>
                  {approvedVehicles.map((v) => (
                    <option key={v._id} value={v._id}>
                      {v.make} {v.model} · {v.plateNumber}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Cost per person (₹)</span>
                <input
                  type="number"
                  min="0"
                  value={form.costPerPerson}
                  onChange={set("costPerPerson")}
                  placeholder="40"
                />
              </label>
              <label className="field">
                <span>Notes (optional)</span>
                <input
                  value={form.notes}
                  onChange={set("notes")}
                  placeholder="Leaving on time, AC on"
                />
              </label>
            </div>

            <div className="button-row">
              <button type="button" className="secondary" onClick={runEstimate}>
                Estimate cost
              </button>
              <button className="primary" type="submit" disabled={offer.status === "loading"}>
                {offer.status === "loading" ? "Publishing…" : "Publish trip"}
              </button>
            </div>

            {estimate && (
              <div className="estimate-row">
                <span>≈ {estimate.distanceKm} km</span>
                <span>≈ {estimate.durationMin} min</span>
                <span>Suggested ₹{estimate.costPerPerson}/person</span>
                <span>🌱 {estimate.carbonSavedKg} kg CO₂ saved</span>
              </div>
            )}

            {estimateError && <div className="alert info">{estimateError}</div>}
            {formError && <div className="alert error">{formError}</div>}
            {offer.error && <div className="alert error">{offer.error}</div>}
          </form>

          <aside className="offer-map">
            <GoogleMapPanel
              pickup={buildLocations().pickup}
              destination={buildLocations().destination}
              caption="Route preview — confirm pickup & drop before publishing."
            />
          </aside>
        </div>
      )}
    </div>
  );
}
