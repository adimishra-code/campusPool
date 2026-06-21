import { Router } from "express";
import { listColleges, createCollege, createCollegeRules } from "../controllers/college.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";

const router = Router();

router.get("/", listColleges);
router.post("/", protect, authorize("admin"), validate(createCollegeRules), createCollege);

export default router;
