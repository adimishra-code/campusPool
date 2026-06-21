import { Router } from "express";
import { createRating, createRatingRules } from "../controllers/rating.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";

const router = Router();

router.use(protect);
router.post("/", validate(createRatingRules), createRating);

export default router;
