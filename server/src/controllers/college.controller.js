import { body } from "express-validator";
import College from "../models/College.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const createCollegeRules = [
  body("name").trim().notEmpty().isLength({ max: 120 }),
  body("domains").isArray({ min: 1 }),
  body("status").optional().isIn(["active", "inactive"])
];

// Public: list active colleges (used to show supported campuses on signup).
export const listColleges = asyncHandler(async (_req, res) => {
  await College.initializeDefaults();
  const colleges = await College.find({ status: "active" }).select("name domains").sort("name");
  res.json({ colleges });
});

// Admin: register a new college / campus.
export const createCollege = asyncHandler(async (req, res) => {
  const { name, domains, status } = req.body;
  const college = await College.create({ name, domains, status });
  res.status(201).json({ college });
});
