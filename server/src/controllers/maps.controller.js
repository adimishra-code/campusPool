import { query } from "express-validator";
import { asyncHandler } from "../utils/asyncHandler.js";
import { distanceMatrix, geocodeAddress, reverseGeocode, routeDirections } from "../services/googleMaps.service.js";

export const geocodeRules = [query("address").trim().notEmpty()];

export const geocode = asyncHandler(async (req, res) => {
  const result = await geocodeAddress(req.query.address);
  res.json({ result });
});

export const reverse = asyncHandler(async (req, res) => {
  const coordinates = [Number(req.query.lng), Number(req.query.lat)];
  const address = await reverseGeocode(coordinates);
  res.json({ address });
});

export const route = asyncHandler(async (req, res) => {
  const { pickup, destination, waypoints = [] } = req.body;
  const [matrix, directions] = await Promise.all([
    distanceMatrix({ pickup, destination }),
    routeDirections({ pickup, destination, waypoints })
  ]);
  res.json({ ...matrix, route: directions });
});
