import crypto from "crypto";
import { body, param } from "express-validator";
import Verification from "../models/Verification.js";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import AuditLog from "../models/AuditLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { putFile, getFileInfo, openDownloadStream } from "../services/storage.service.js";
import { sendOtpEmail } from "../services/email.service.js";
import { env } from "../config/env.js";

// ---- Validation rules ----------------------------------------------------
export const otpRequestRules = [body("email").optional().isEmail()];
export const otpVerifyRules = [body("otp").trim().isLength({ min: 4, max: 8 })];
export const studentIdRules = [body("number").optional().trim().isLength({ max: 60 })];
export const collegeIdRules = [
  body("type").optional().isIn(["college_id", "aadhaar", "passport", "driving_license", "voter_id"])
];
export const vehicleDocRules = [
  body("vehicleId").optional().isMongoId(),
  body("type").isIn(["license", "rc", "photo", "insurance", "pollution", "permit"])
];
export const verificationIdRule = [param("id").isMongoId()];

// ---- Helpers -------------------------------------------------------------
async function getOrCreateVerification(userId) {
  let v = await Verification.findOne({ user: userId });
  if (!v) v = new Verification({ user: userId });
  return v;
}

// Recompute the umbrella status from the individual parts.
function recomputeStatus(v) {
  const studentApproved = v.studentId?.status === "approved";
  const identityApproved = v.identityProof?.status === "approved";
  const vehicleApproved = v.vehicleVerification?.overallStatus === "approved";
  const anyRejected =
    v.studentId?.status === "rejected" ||
    v.identityProof?.status === "rejected" ||
    v.vehicleVerification?.overallStatus === "rejected";

  if (studentApproved && identityApproved) {
    v.status = v.vehicleVerification && !vehicleApproved ? "partial" : "approved";
  } else if (anyRejected) {
    v.status = "rejected";
  } else if (v.studentId || v.identityProof || v.vehicleVerification) {
    v.status = "pending";
  }
}

const docUrl = (fileId) => `/api/verification/document/${fileId}`;

/**
 * Generate a 6-digit OTP, store it on the verification record, and email it.
 * Exported so registration can trigger the verification email too.
 * Returns the OTP only when SMTP is NOT configured (dev), else null.
 */
export async function issueOtp(verification, email) {
  const otp = String(crypto.randomInt(100000, 1000000));
  verification.collegeEmail = {
    email,
    verified: false,
    otp,
    otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000)
  };
  await verification.save();
  try {
    await sendOtpEmail(email, otp);
  } catch (err) {
    console.error("OTP email failed:", err.message);
  }
  // Never echo OTPs to clients in production, even if SMTP is misconfigured.
  return env.mailConfigured || env.nodeEnv === "production" ? null : otp;
}

// ---- Status --------------------------------------------------------------
export const getVerificationStatus = asyncHandler(async (req, res) => {
  const v = await getOrCreateVerification(req.user._id);
  if (v.isNew) await v.save();

  res.json({
    verification: {
      id: v._id,
      status: v.status,
      progress: v.progress,
      studentId: v.studentId
        ? {
            number: v.studentId.number,
            documentUrl: v.studentId.documentUrl,
            status: v.studentId.status,
            rejectionReason: v.studentId.rejectionReason
          }
        : null,
      identityProof: v.identityProof
        ? {
            type: v.identityProof.type,
            documentUrl: v.identityProof.documentUrl,
            status: v.identityProof.status,
            rejectionReason: v.identityProof.rejectionReason
          }
        : null,
      vehicleVerification: v.vehicleVerification
        ? {
            vehicle: v.vehicleVerification.vehicle,
            overallStatus: v.vehicleVerification.overallStatus,
            documents: (v.vehicleVerification.documents || []).map((d) => ({
              type: d.type,
              url: d.url,
              status: d.status,
              rejectionReason: d.rejectionReason
            }))
          }
        : null,
      // Never expose the OTP itself.
      collegeEmail: {
        email: v.collegeEmail?.email,
        verified: !!v.collegeEmail?.verified,
        verifiedAt: v.collegeEmail?.verifiedAt
      },
      updatedAt: v.updatedAt
    }
  });
});

// ---- College email OTP ---------------------------------------------------
export const requestCollegeEmailOtp = asyncHandler(async (req, res) => {
  const email = req.body.email || req.user.collegeEmail || req.user.email;
  const v = await getOrCreateVerification(req.user._id);
  const previewOtp = await issueOtp(v, email);
  res.json({ message: `Verification code sent to ${email}`, previewOtp });
});

export const verifyCollegeEmail = asyncHandler(async (req, res) => {
  const { otp } = req.body;
  const v = await Verification.findOne({ user: req.user._id });

  if (!v?.collegeEmail?.otp || !v.collegeEmail.otpExpiresAt) {
    const error = new Error("Request a verification code first");
    error.statusCode = 400;
    throw error;
  }
  if (v.collegeEmail.otpExpiresAt < new Date()) {
    const error = new Error("Verification code has expired");
    error.statusCode = 400;
    throw error;
  }
  if (v.collegeEmail.otp !== String(otp)) {
    const error = new Error("Invalid verification code");
    error.statusCode = 400;
    throw error;
  }

  v.collegeEmail.verified = true;
  v.collegeEmail.verifiedAt = new Date();
  v.collegeEmail.otp = undefined;
  v.collegeEmail.otpExpiresAt = undefined;
  await v.save();
  await User.findByIdAndUpdate(req.user._id, { collegeEmail: v.collegeEmail.email });

  await AuditLog.log("verification.submit", "Verification", v._id, req.user._id, {
    step: "email_verified"
  });
  res.json({
    message: "College email verified",
    collegeEmail: { email: v.collegeEmail.email, verified: true }
  });
});

// ---- Document uploads ----------------------------------------------------
function requireFile(req) {
  if (!req.file) {
    const error = new Error("A document file is required");
    error.statusCode = 400;
    throw error;
  }
}

export const uploadStudentId = asyncHandler(async (req, res) => {
  requireFile(req);
  const fileId = await putFile({
    buffer: req.file.buffer,
    filename: `student-id-${req.user._id}-${req.file.originalname}`,
    contentType: req.file.mimetype,
    metadata: { user: req.user._id.toString(), kind: "student_id" }
  });

  const v = await getOrCreateVerification(req.user._id);
  v.studentId = {
    number: req.body.number || v.studentId?.number,
    documentUrl: docUrl(fileId),
    status: "pending"
  };
  v.documentIds.push(fileId);
  recomputeStatus(v);
  await v.save();
  await User.findByIdAndUpdate(req.user._id, {
    verificationStatus: v.status,
    studentId: req.body.number || req.user.studentId
  });

  await AuditLog.log("verification.submit", "Verification", v._id, req.user._id, {
    step: "student_id"
  });
  res
    .status(201)
    .json({ message: "Student ID uploaded", studentId: v.studentId, progress: v.progress });
});

export const uploadCollegeId = asyncHandler(async (req, res) => {
  requireFile(req);
  const fileId = await putFile({
    buffer: req.file.buffer,
    filename: `college-id-${req.user._id}-${req.file.originalname}`,
    contentType: req.file.mimetype,
    metadata: { user: req.user._id.toString(), kind: "college_id" }
  });

  const v = await getOrCreateVerification(req.user._id);
  v.identityProof = {
    type: req.body.type || "college_id",
    documentUrl: docUrl(fileId),
    status: "pending"
  };
  v.documentIds.push(fileId);
  recomputeStatus(v);
  await v.save();
  await User.findByIdAndUpdate(req.user._id, { verificationStatus: v.status });

  await AuditLog.log("verification.submit", "Verification", v._id, req.user._id, {
    step: "college_id"
  });
  res
    .status(201)
    .json({ message: "College ID uploaded", identityProof: v.identityProof, progress: v.progress });
});

export const uploadVehicleDocument = asyncHandler(async (req, res) => {
  requireFile(req);
  const { vehicleId, type } = req.body;

  // Ownership check when a vehicle is referenced.
  if (vehicleId) {
    const owned = await Vehicle.findOne({ _id: vehicleId, owner: req.user._id });
    if (!owned) {
      const error = new Error("Vehicle not found or not yours");
      error.statusCode = 404;
      throw error;
    }
  }

  const fileId = await putFile({
    buffer: req.file.buffer,
    filename: `vehicle-${type}-${req.user._id}-${req.file.originalname}`,
    contentType: req.file.mimetype,
    metadata: { user: req.user._id.toString(), kind: `vehicle_${type}` }
  });

  const v = await getOrCreateVerification(req.user._id);
  if (!v.vehicleVerification) v.vehicleVerification = { documents: [], overallStatus: "pending" };
  if (vehicleId) v.vehicleVerification.vehicle = vehicleId;
  // Replace any existing doc of the same type.
  v.vehicleVerification.documents = (v.vehicleVerification.documents || []).filter(
    (d) => d.type !== type
  );
  v.vehicleVerification.documents.push({ type, url: docUrl(fileId), status: "pending" });
  v.vehicleVerification.overallStatus = "pending";
  v.documentIds.push(fileId);
  recomputeStatus(v);
  await v.save();

  if (vehicleId) await Vehicle.findByIdAndUpdate(vehicleId, { verificationStatus: "pending" });

  await AuditLog.log("verification.submit", "Verification", v._id, req.user._id, {
    step: `vehicle_${type}`
  });
  res.status(201).json({
    message: `Vehicle ${type} uploaded`,
    vehicleVerification: v.vehicleVerification,
    progress: v.progress
  });
});

// Stream a stored document. Only the owner or an admin may view it.
export const getDocument = asyncHandler(async (req, res) => {
  const info = await getFileInfo(req.params.fileId);
  if (!info) {
    const error = new Error("Document not found");
    error.statusCode = 404;
    throw error;
  }
  if (req.user.role !== "admin" && info.metadata?.user !== req.user._id.toString()) {
    const error = new Error("Not allowed to view this document");
    error.statusCode = 403;
    throw error;
  }
  res.set("Content-Type", info.contentType || "application/octet-stream");
  openDownloadStream(req.params.fileId)
    .on("error", () => res.sendStatus(404))
    .pipe(res);
});

// ---- Admin: queues + approvals ------------------------------------------
export const getPendingVerifications = asyncHandler(async (req, res) => {
  const { type, page = 1, limit = 20 } = req.query;

  let query = { status: { $in: ["pending", "partial"] } };
  if (type === "student") query = { "studentId.status": "pending" };
  else if (type === "identity") query = { "identityProof.status": "pending" };
  else if (type === "vehicle") query = { "vehicleVerification.overallStatus": "pending" };

  const verifications = await Verification.find(query)
    .populate("user", "name email phone role studentId hostel verificationStatus")
    .sort("-createdAt")
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Verification.countDocuments(query);
  res.json({ verifications, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

export const approveVerification = asyncHandler(async (req, res) => {
  const { type, notes } = req.body;
  const v = await Verification.findById(req.params.id).populate("user", "name email role");
  if (!v) {
    const error = new Error("Verification not found");
    error.statusCode = 404;
    throw error;
  }

  if ((type === "student" || !type) && v.studentId) {
    v.studentId.status = "approved";
    v.studentId.verifiedAt = new Date();
    v.studentId.verifiedBy = req.user._id;
  }
  if ((type === "identity" || type === "student" || !type) && v.identityProof) {
    v.identityProof.status = "approved";
    v.identityProof.verifiedAt = new Date();
    v.identityProof.verifiedBy = req.user._id;
  }
  if ((type === "vehicle" || !type) && v.vehicleVerification) {
    v.vehicleVerification.documents.forEach((d) => {
      d.status = "approved";
      d.verifiedAt = new Date();
    });
    v.vehicleVerification.overallStatus = "approved";
    v.vehicleVerification.approvedAt = new Date();
    v.vehicleVerification.approvedBy = req.user._id;
    // Reflect approval onto the Vehicle so the host can offer trips.
    if (v.vehicleVerification.vehicle) {
      await Vehicle.findByIdAndUpdate(v.vehicleVerification.vehicle, {
        verificationStatus: "approved"
      });
    }
  }

  recomputeStatus(v);
  v.adminNotes = notes;
  await v.save();

  const vehicleApproved = v.vehicleVerification?.overallStatus === "approved";
  await User.findByIdAndUpdate(v.user._id, {
    verificationStatus: v.status,
    ...(vehicleApproved ? { role: "host" } : {})
  });

  await AuditLog.log("verification.approve", "Verification", v._id, req.user._id, {
    type,
    userId: v.user._id
  });
  res.json({
    message: "Verification approved",
    verification: { id: v._id, status: v.status, progress: v.progress }
  });
});

export const rejectVerification = asyncHandler(async (req, res) => {
  const { type, reason } = req.body;
  const v = await Verification.findById(req.params.id).populate("user", "name email");
  if (!v) {
    const error = new Error("Verification not found");
    error.statusCode = 404;
    throw error;
  }

  if ((type === "student" || !type) && v.studentId) {
    v.studentId.status = "rejected";
    v.studentId.rejectionReason = reason;
  }
  if ((type === "identity" || !type) && v.identityProof) {
    v.identityProof.status = "rejected";
    v.identityProof.rejectionReason = reason;
  }
  if ((type === "vehicle" || !type) && v.vehicleVerification) {
    v.vehicleVerification.documents.forEach((d) => {
      d.status = "rejected";
      d.rejectionReason = reason;
    });
    v.vehicleVerification.overallStatus = "rejected";
    if (v.vehicleVerification.vehicle) {
      await Vehicle.findByIdAndUpdate(v.vehicleVerification.vehicle, {
        verificationStatus: "rejected"
      });
    }
  }

  v.status = "rejected";
  v.adminNotes = reason;
  await v.save();
  await User.findByIdAndUpdate(v.user._id, { verificationStatus: "rejected" });

  await AuditLog.log("verification.reject", "Verification", v._id, req.user._id, {
    type,
    reason,
    userId: v.user._id
  });
  res.json({ message: "Verification rejected", verification: { id: v._id, status: v.status } });
});
