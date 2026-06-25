import express from "express";
import {
  getUser,
  updateProfile,
  updatePreferences,
  getUserTrips,
  getTrustScore,
  becomeHost,
  addEmergencyContact,
  removeEmergencyContact,
  deactivateAccount,
  getAllUsers,
  adminUpdateUser,
  updateProfileRules,
  updatePreferencesRules
} from "../controllers/user.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";

const router = express.Router();

// User routes
router.get("/me", protect, getUser);
router.patch("/me", protect, validate(updateProfileRules), updateProfile);
router.patch("/me/preferences", protect, validate(updatePreferencesRules), updatePreferences);
router.get("/me/trips", protect, getUserTrips);
router.post("/me/become-host", protect, becomeHost);
router.post("/me/emergency-contacts", protect, addEmergencyContact);
router.delete("/me/emergency-contacts/:contactId", protect, removeEmergencyContact);
router.delete("/me", protect, deactivateAccount);

// Trust score
router.get("/:id/trust", getTrustScore);
router.get("/me/trust", protect, getTrustScore);

// Public profile
router.get("/:id", getUser);

// Admin routes
router.get("/admin/all", protect, authorize("admin"), getAllUsers);
router.patch("/admin/:id", protect, authorize("admin"), adminUpdateUser);

export default router;
