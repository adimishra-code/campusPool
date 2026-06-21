import { Router } from "express";
import { listPayments, updatePaymentStatus } from "../controllers/payment.controller.js";
import { authorize, protect } from "../middleware/auth.middleware.js";

const router = Router();

router.use(protect);
router.get("/", listPayments);
router.patch("/:id", authorize("admin"), updatePaymentStatus);

export default router;
