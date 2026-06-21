import fetch from "node-fetch";
import { env } from "../config/env.js";

const googleBaseUrl = "https://maps.googleapis.com/maps/api";

function assertGoogleKey() {
  if (!env.googleMapsApiKey) {
    const error = new Error("GOOGLE_MAPS_API_KEY is required for Google Maps operations");
    error.statusCode = 503;
    throw error;
  }
}

function toLatLngParam(location) {
  const [lng, lat] = location.coordinates.coordinates;
  return `${lat},${lng}`;
}

async function googleGet(path, params) {
  assertGoogleKey();
  const url = new URL(`${googleBaseUrl}${path}`);
  Object.entries({ ...params, key: env.googleMapsApiKey }).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || !["OK", "ZERO_RESULTS"].includes(data.status)) {
    const error = new Error(data.error_message || `Google Maps request failed: ${data.status}`);
    error.statusCode = 502;
    throw error;
  }
  return data;
}

export async function geocodeAddress(address) {
  const data = await googleGet("/geocode/json", { address });
  const result = data.results[0];
  if (!result) return null;
  return {
    address: result.formatted_address,
    coordinates: {
      type: "Point",
      coordinates: [result.geometry.location.lng, result.geometry.location.lat]
    },
    placeId: result.place_id
  };
}

export async function reverseGeocode(coordinates) {
  const [lng, lat] = coordinates;
  const data = await googleGet("/geocode/json", { latlng: `${lat},${lng}` });
  return data.results[0]?.formatted_address || "";
}

export async function distanceMatrix({ pickup, destination }) {
  const data = await googleGet("/distancematrix/json", {
    origins: toLatLngParam(pickup),
    destinations: toLatLngParam(destination),
    mode: "driving",
    departure_time: "now",
    traffic_model: "best_guess"
  });
  const element = data.rows[0]?.elements[0];
  if (!element || element.status !== "OK") return null;
  return {
    distanceKm: Number((element.distance.value / 1000).toFixed(2)),
    durationMin: Math.max(
      1,
      Math.round((element.duration_in_traffic?.value || element.duration.value) / 60)
    ),
    etaSeconds: element.duration_in_traffic?.value || element.duration.value
  };
}

export async function routeDirections({ pickup, destination, waypoints = [] }) {
  const waypointParam = waypoints.length
    ? `optimize:true|${waypoints.map(toLatLngParam).join("|")}`
    : undefined;
  const data = await googleGet("/directions/json", {
    origin: toLatLngParam(pickup),
    destination: toLatLngParam(destination),
    waypoints: waypointParam,
    mode: "driving",
    departure_time: "now"
  });
  const route = data.routes[0];
  if (!route) return null;
  const totals = route.legs.reduce(
    (acc, leg) => ({
      distanceMeters: acc.distanceMeters + leg.distance.value,
      durationSeconds: acc.durationSeconds + (leg.duration_in_traffic?.value || leg.duration.value)
    }),
    { distanceMeters: 0, durationSeconds: 0 }
  );
  return {
    polyline: route.overview_polyline?.points,
    bounds: route.bounds,
    waypointOrder: route.waypoint_order || [],
    distanceKm: Number((totals.distanceMeters / 1000).toFixed(2)),
    durationMin: Math.max(1, Math.round(totals.durationSeconds / 60)),
    etaSeconds: totals.durationSeconds,
    provider: "google"
  };
}
