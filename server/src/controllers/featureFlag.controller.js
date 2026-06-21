import { body, param } from "express-validator";
import FeatureFlag from "../models/FeatureFlag.js";
import AuditLog from "../models/AuditLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const flagKeyRule = [param("key").trim().notEmpty()];

export const flagUpdateRules = [
  body("enabled").isBoolean(),
  body("percentage").optional().isInt({ min: 0, max: 100 }),
  body("userRoles").optional().isArray()
];

// Get all feature flags
export const getAllFlags = asyncHandler(async (req, res) => {
  const flags = await FeatureFlag.find().sort("key");
  
  const flagsMap = {};
  flags.forEach(flag => {
    flagsMap[flag.key] = {
      enabled: flag.enabled,
      description: flag.description,
      rollout: flag.rollout
    };
  });
  
  res.json({ flags: flagsMap });
});

// Get single flag
export const getFlag = asyncHandler(async (req, res) => {
  const flag = await FeatureFlag.findOne({ key: req.params.key });
  
  if (!flag) {
    const error = new Error("Feature flag not found");
    error.statusCode = 404;
    throw error;
  }
  
  res.json({ flag });
});

// Check if feature is enabled
export const checkFlag = asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { userId, role } = req.query;
  
  const isEnabled = await FeatureFlag.isEnabled(key, userId, role);
  
  res.json({ key, enabled: isEnabled });
});

// ADMIN: Toggle flag
export const toggleFlag = asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { enabled, percentage, userRoles } = req.body;
  
  let flag;
  if (enabled) {
    flag = await FeatureFlag.enable(key, req.user._id, {
      description: req.body.description,
      rollout: { percentage: percentage || 100, userRoles }
    });
  } else {
    flag = await FeatureFlag.disable(key, req.user._id);
  }
  
  // Log the action
  await AuditLog.log(
    "admin.feature.toggle",
    "FeatureFlag",
    flag._id,
    req.user._id,
    { key, enabled }
  );
  
  res.json({
    message: `Feature ${key} ${enabled ? "enabled" : "disabled"}`,
    flag: {
      key: flag.key,
      enabled: flag.enabled,
      rollout: flag.rollout
    }
  });
});

// Initialize default flags
export const initializeFlags = asyncHandler(async (req, res) => {
  await FeatureFlag.initializeDefaults();
  
  const flags = await FeatureFlag.find().sort("key");
  
  res.json({
    message: "Feature flags initialized",
    count: flags.length
  });
});
