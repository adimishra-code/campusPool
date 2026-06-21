// Preset campus locations so the core trip flows work without a Google Maps key.
// Each place carries GeoJSON-style coordinates ([lng, lat]) the backend expects.
// Hosts/passengers pick from these to guarantee valid coordinates; the map view
// still renders real routes when a Maps key is configured.
export const CAMPUS_PLACES = [
  {
    id: "campus",
    label: "Main Campus Gate",
    address: "Main Campus Gate",
    coordinates: [77.5946, 12.9716]
  },
  {
    id: "hostel-a",
    label: "Boys Hostel — Block A",
    address: "Boys Hostel Block A",
    coordinates: [77.605, 12.965]
  },
  {
    id: "hostel-b",
    label: "Girls Hostel — Block B",
    address: "Girls Hostel Block B",
    coordinates: [77.601, 12.969]
  },
  {
    id: "metro",
    label: "Central Metro Station",
    address: "Central Metro Station",
    coordinates: [77.6408, 12.9784]
  },
  {
    id: "coaching",
    label: "City Coaching Hub",
    address: "City Coaching Hub",
    coordinates: [77.58, 12.955]
  },
  {
    id: "railway",
    label: "Railway Station",
    address: "Railway Station",
    coordinates: [77.57, 12.978]
  },
  {
    id: "airport",
    label: "Airport (intercity)",
    address: "Airport",
    coordinates: [77.7066, 13.1986]
  }
];

export function placeByAddress(address) {
  return CAMPUS_PLACES.find((p) => p.address === address) || null;
}

// Build the GeoJSON location object the backend trip endpoints expect.
export function toLocation(place) {
  return {
    address: place.address,
    coordinates: { type: "Point", coordinates: place.coordinates }
  };
}
