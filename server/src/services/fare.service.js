import { env } from "../config/env.js";

const categoryMultipliers = {
  bike: 0.55,
  auto: 0.75,
  sedan: 1,
  suv: 1.35,
  premium: 1.8
};

export function calculateFare({ distanceKm, durationMin, category = "sedan", demandFactor = 1, poolDiscount = 0 }) {
  const base = env.baseFare;
  const distance = distanceKm * env.perKmRate;
  const time = durationMin * env.perMinRate;
  const surge = Math.max(env.surgeMultiplier, demandFactor);
  const categoryMultiplier = categoryMultipliers[category] || 1;
  const subtotal = (base + distance + time) * categoryMultiplier * surge;
  const total = Math.round(subtotal * (1 - poolDiscount));

  return { base, distance, time, surge, poolDiscount, total, currency: "INR" };
}

export function estimateDistanceAndDuration(pickup, destination) {
  const [lng1, lat1] = pickup.coordinates.coordinates;
  const [lng2, lat2] = destination.coordinates.coordinates;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const durationMin = Math.max(5, Math.round(distanceKm * 3.2));

  return {
    distanceKm: Number(distanceKm.toFixed(2)),
    durationMin
  };
}
