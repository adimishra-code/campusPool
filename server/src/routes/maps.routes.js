import { Router } from "express";
import { geocode, geocodeRules, reverse, route } from "../controllers/maps.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";

const router = Router();

router.use(protect);
router.get("/geocode", validate(geocodeRules), geocode);
router.get("/reverse-geocode", reverse);
router.post("/route", route);

export default router;
