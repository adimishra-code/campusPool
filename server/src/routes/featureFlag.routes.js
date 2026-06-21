import express from "express";
import {
  getAllFlags,
  getFlag,
  checkFlag,
  toggleFlag,
  initializeFlags,
  flagKeyRule,
  flagUpdateRules
} from "../controllers/featureFlag.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";

const router = express.Router();

router.get("/", getAllFlags);
router.get("/init", initializeFlags);
router.get("/:key", getFlag);
router.get("/:key/check", checkFlag);

router.patch(
  "/:key",
  protect,
  authorize("admin"),
  validate(flagKeyRule),
  validate(flagUpdateRules),
  toggleFlag
);

export default router;
