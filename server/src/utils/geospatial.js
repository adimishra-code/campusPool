// Geospatial helpers for ride matching. Coordinates are [lng, lat] (GeoJSON order).

const R_KM = 6371;
const toRad = (v) => (v * Math.PI) / 180;

export function haversineKm(a, b) {
  if (!a || !b) return Infinity;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Distance proximity score (0-100):
 *   0-1 km  = excellent (100)
 *   1-3 km  = good      (75)
 *   3-5 km  = acceptable(45)
 *   5-10 km = low       (20)
 *   >10 km  = minimal   (0)
 */
export function proximityScore(km) {
  if (km <= 1) return 100;
  if (km <= 3) return 75;
  if (km <= 5) return 45;
  if (km <= 10) return 20;
  return 0;
}

/**
 * Combined route proximity from the passenger's pickup/destination to the
 * trip's pickup/destination. Returns { score, pickup, dest, known }.
 * When the passenger hasn't supplied a route, returns a neutral baseline so
 * recommendations still rank on the other signals.
 */
export function routeProximity(userPickup, userDest, tripPickup, tripDest) {
  if (userPickup && userDest) {
    const pickup = proximityScore(haversineKm(userPickup, tripPickup));
    const dest = proximityScore(haversineKm(userDest, tripDest));
    return { score: Math.round(pickup * 0.5 + dest * 0.5), pickup, dest, known: true };
  }
  if (userPickup) {
    const pickup = proximityScore(haversineKm(userPickup, tripPickup));
    return { score: pickup, pickup, dest: null, known: true };
  }
  return { score: 60, pickup: null, dest: null, known: false };
}
