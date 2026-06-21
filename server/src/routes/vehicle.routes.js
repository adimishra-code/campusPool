import express from "express";
import {
  getMyVehicles,
  getVehicle,
  registerVehicle,
  updateVehicle,
  submitVehicleDocuments,
  deleteVehicle,
  updateVehicleLocation,
  getAllVehicles,
  approveVehicle,
  rejectVehicle,
  vehicleRules,
  vehicleIdRule
} from "../controllers/vehicle.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";

const router = express.Router();

// User routes
router.get("/", protect, getMyVehicles);
router.get("/:id", protect, validate(vehicleIdRule), getVehicle);
router.post("/", protect, validate(vehicleRules), registerVehicle);
router.patch("/:id", protect, validate(vehicleIdRule), updateVehicle);
router.delete("/:id", protect, validate(vehicleIdRule), deleteVehicle);
router.patch("/:id/location", protect, validate(vehicleIdRule), updateVehicleLocation);

// Submit documents
router.post("/:id/documents", protect, validate(vehicleIdRule), submitVehicleDocuments);

// Admin routes
router.get("/admin/all", protect, authorize("admin"), getAllVehicles);
router.patch(
  "/admin/:id/approve",
  protect,
  authorize("admin"),
  validate(vehicleIdRule),
  approveVehicle
);
router.patch(
  "/admin/:id/reject",
  protect,
  authorize("admin"),
  validate(vehicleIdRule),
  rejectVehicle
);

export default router;
