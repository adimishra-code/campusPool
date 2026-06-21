import { Router } from "express";
import { geocode, geocodeRules, reverse, route } from "../controllers/maps.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

const router = Router();

router.use(protect);
router.get("/geocode", geocodeRules, validate, geocode);
router.get("/reverse-geocode", reverse);
router.post("/route", route);

export default router;
