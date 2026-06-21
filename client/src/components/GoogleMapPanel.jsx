import { Autocomplete, GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import { useRef } from "react";
import Icon from "./Icon.jsx";

const libraries = ["places"];
const center = { lat: 12.9716, lng: 77.5946 };

function decodePolyline(encoded = "") {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const points = [];

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

function toLatLng(location) {
  const coordinates = location?.coordinates?.coordinates;
  return coordinates ? { lng: coordinates[0], lat: coordinates[1] } : center;
}

// Polished branded placeholder shown until a Maps key is configured — a stylized
// faux-map (grid + route arc + pins) so the app looks finished without a key.
function FallbackMap({ pickup, destination, caption }) {
  return (
    <section className="map-panel fallback">
      <div className="grid-lines" />
      <div className="route" />
      <div className="map-pin pickup" aria-hidden><Icon name="pin" size={16} /></div>
      <div className="map-pin destination" aria-hidden><Icon name="navigation" size={15} /></div>
      <div className="car" aria-hidden><Icon name="ride" size={14} /></div>
      <div className="map-caption">
        <strong>{pickup?.address || "Pickup"} → {destination?.address || "Destination"}</strong>
        <small>{caption || "Live map preview appears here once a Google Maps key is added."}</small>
      </div>
    </section>
  );
}

export default function GoogleMapPanel({
  pickup, destination, route, liveLocation, markers,
  interactive = false, onPickupSelected, onDestinationSelected, caption
}) {
  const pickupRef = useRef(null);
  const destinationRef = useRef(null);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey || "missing", libraries });
  const path = route?.polyline ? decodePolyline(route.polyline) : [];

  const selectPlace = (ref, handler) => {
    const place = ref.current?.getPlace();
    const location = place?.geometry?.location;
    if (!location) return;
    handler?.({
      address: place.formatted_address || place.name,
      coordinates: { type: "Point", coordinates: [location.lng(), location.lat()] }
    });
  };

  if (!apiKey) return <FallbackMap pickup={pickup} destination={destination} caption={caption} />;
  if (!isLoaded) return <section className="map-panel skeleton" />;

  return (
    <section className="google-map-shell">
      {interactive && (
        <div className="map-search-row">
          <Autocomplete onLoad={(instance) => { pickupRef.current = instance; }} onPlaceChanged={() => selectPlace(pickupRef, onPickupSelected)}>
            <input defaultValue={pickup?.address} placeholder="Pickup" />
          </Autocomplete>
          <Autocomplete onLoad={(instance) => { destinationRef.current = instance; }} onPlaceChanged={() => selectPlace(destinationRef, onDestinationSelected)}>
            <input defaultValue={destination?.address} placeholder="Destination" />
          </Autocomplete>
        </div>
      )}
      <GoogleMap mapContainerClassName="google-map" center={toLatLng(pickup)} zoom={12} options={{ disableDefaultUI: true, zoomControl: true }}>
        {pickup && <Marker position={toLatLng(pickup)} label="P" />}
        {destination && <Marker position={toLatLng(destination)} label="D" />}
        {(markers || []).map((m, i) => (
          m?.coordinates ? <Marker key={m.id || i} position={{ lng: m.coordinates[0], lat: m.coordinates[1] }} label={m.label} /> : null
        ))}
        {liveLocation?.coordinates && <Marker position={{ lng: liveLocation.coordinates[0], lat: liveLocation.coordinates[1] }} label="•" />}
        {path.length > 0 && <Polyline path={path} options={{ strokeColor: "#0a7a4b", strokeWeight: 6 }} />}
      </GoogleMap>
    </section>
  );
}
