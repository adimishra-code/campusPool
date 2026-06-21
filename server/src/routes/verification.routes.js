import express from "express";
import {
  getVerificationStatus,
  requestCollegeEmailOtp,
  verifyCollegeEmail,
  uploadStudentId,
  uploadCollegeId,
  uploadVehicleDocument,
  getDocument,
  getPendingVerifications,
  approveVerification,
  rejectVerification,
  otpRequestRules,
  otpVerifyRules,
  studentIdRules,
  collegeIdRules,
  vehicleDocRules,
  verificationIdRule
} from "../controllers/verification.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";
import { uploadSingle } from "../middleware/upload.middleware.js";

const router = express.Router();

// Status
router.get("/status", protect, getVerificationStatus);

// College email verification
router.post("/college-email/otp", protect, validate(otpRequestRules), requestCollegeEmailOtp);
router.post("/college-email/verify", protect, validate(otpVerifyRules), verifyCollegeEmail);

// Document uploads (multipart field name: "document")
router.post("/upload/student-id", protect, uploadSingle("document"), validate(studentIdRules), uploadStudentId);
router.post("/upload/college-id", protect, uploadSingle("document"), validate(collegeIdRules), uploadCollegeId);
router.post("/upload/vehicle", protect, uploadSingle("document"), validate(vehicleDocRules), uploadVehicleDocument);

// Secure document streaming (owner or admin only)
router.get("/document/:fileId", protect, getDocument);

// Admin queues + decisions
router.get("/admin/pending", protect, authorize("admin"), getPendingVerifications);
router.patch("/admin/:id/approve", protect, authorize("admin"), validate(verificationIdRule), approveVerification);
router.patch("/admin/:id/reject", protect, authorize("admin"), validate(verificationIdRule), rejectVerification);

export default router;
