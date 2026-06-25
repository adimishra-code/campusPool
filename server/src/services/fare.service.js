// Calculates haversine distance and estimates duration between points to pre-fill cost-sharing distance.
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
