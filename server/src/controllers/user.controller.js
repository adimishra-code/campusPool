import { body, param } from "express-validator";
import User from "../models/User.js";
import Trip from "../models/Trip.js";
import AuditLog from "../models/AuditLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { escapeRegex } from "../utils/escapeRegex.js";

export const updateProfileRules = [
  body("name").optional().trim().notEmpty().isLength({ max: 100 }),
  body("hostel").optional().trim(),
  body("studentId").optional().trim(),
  body("avatarUrl").optional().trim().isURL(),
  body("emergencyContacts").optional().isArray(),
  body("preferences").optional().isObject(),
  // UPI VPA, e.g. name@bank — letters/digits/dot/underscore/hyphen then @handle.
  body("upiId")
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[\w.-]{2,}@[a-zA-Z]{2,}$/)
    .withMessage("Enter a valid UPI ID like name@bank")
];

export const updatePreferencesRules = [
  body("smoking").optional().isBoolean(),
  body("music").optional().isBoolean(),
  body("ac").optional().isBoolean(),
  body("onlySameGender").optional().isBoolean(),
  body("maxDetourMin").optional().isInt({ min: 5, max: 60 }),
  body("preferredPaymentMethod").optional().isIn(["cash", "upi"])
];

export const userIdRule = [param("id").isMongoId()];

// Get user profile. Serves both the public lookup (/:id) and the authenticated
// self lookup (/me, which has no :id param) — fall back to the signed-in user.
export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id || req.user?._id).select(
    "name avatarUrl hostel role verificationStatus trustScore trustBreakdown ratingAverage ratingCount createdAt"
  );

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  res.json({ user });
});

// Update own profile
export const updateProfile = asyncHandler(async (req, res) => {
  const allowedFields = ["name", "hostel", "studentId", "avatarUrl", "emergencyContacts", "upiId"];
  const updates = {};

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  // Log the action
  await AuditLog.log("user.profile.update", "User", user._id, req.user._id, {
    updatedFields: Object.keys(updates)
  });

  res.json({
    message: "Profile updated",
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      studentId: user.studentId,
      hostel: user.hostel,
      avatarUrl: user.avatarUrl,
      emergencyContacts: user.emergencyContacts,
      upiId: user.upiId
    }
  });
});

// Upgrades the authenticated student user to a host. Hosting still requires a verified vehicle.
export const becomeHost = asyncHandler(async (req, res) => {
  if (req.user.role === "student") {
    req.user.role = "host";
    await req.user.save();
    await AuditLog.log("user.profile.update", "User", req.user._id, req.user._id, {
      roleChange: "student->host"
    });
  }
  res.json({
    message: "You're a host now — verify a vehicle to start offering rides.",
    role: req.user.role
  });
});

// Update preferences
export const updatePreferences = asyncHandler(async (req, res) => {
  const { preferences } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { preferences } },
    { new: true, runValidators: true }
  );

  await AuditLog.log("user.preferences.update", "User", user._id, req.user._id, { preferences });

  res.json({
    message: "Preferences updated",
    preferences: user.preferences
  });
});

// Get the current user's trips, split by relationship to the trip:
//  - hosted    : trips the user offered (any status)
//  - joined    : trips where the user is an approved passenger and not yet completed
//  - pending   : trips where the user has a pending join request
//  - completed : completed trips the user was involved in (as host or passenger)
export const getUserTrips = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  const [hosted, joined, pending, completedAsPassenger, completedAsHost] = await Promise.all([
    Trip.find({ host: userId })
      .populate("vehicle", "make model color plateNumber")
      .sort("-departureTime")
      .limit(limit),

    Trip.find({
      passengers: { $elemMatch: { user: userId, status: "approved" } },
      status: { $nin: ["completed", "cancelled"] }
    })
      .populate("host", "name avatarUrl hostel trustScore")
      .populate("vehicle", "make model color")
      .sort("-departureTime")
      .limit(limit),

    Trip.find({ passengers: { $elemMatch: { user: userId, status: "pending" } } })
      .populate("host", "name avatarUrl hostel trustScore")
      .populate("vehicle", "make model color")
      .sort("-departureTime")
      .limit(limit),

    Trip.find({
      status: "completed",
      passengers: { $elemMatch: { user: userId, status: { $in: ["approved", "completed"] } } }
    })
      .populate("host", "name avatarUrl hostel")
      .sort("-completedAt")
      .limit(limit),

    Trip.find({ host: userId, status: "completed" })
      .populate("vehicle", "make model color")
      .sort("-completedAt")
      .limit(limit)
  ]);

  // Merge completed trips (host + passenger) and de-duplicate by id.
  const completedMap = new Map();
  [...completedAsHost, ...completedAsPassenger].forEach((t) =>
    completedMap.set(t._id.toString(), t)
  );
  const completed = [...completedMap.values()];

  res.json({
    hosted,
    joined,
    pending,
    completed,
    counts: {
      hosted: hosted.length,
      joined: joined.length,
      pending: pending.length,
      completed: completed.length
    }
  });
});

// Get trust score details. Reachable both as a public lookup (/:id/trust) and
// an authenticated self lookup (/me/trust), so resolve the id from either the
// route param (which is `id`) or the logged-in user.
export const getTrustScore = asyncHandler(async (req, res) => {
  const targetId = req.params.id || req.params.userId || req.user?._id;
  if (!targetId) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const user = await User.findById(targetId).select(
    "trustScore trustBreakdown reliabilityStats ratingAverage ratingCount safetyScore"
  );

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  res.json({
    trustScore: {
      total: user.trustScore,
      breakdown: user.trustBreakdown,
      reliability: user.reliabilityStats,
      ratingAverage: user.ratingAverage,
      ratingCount: user.ratingCount
    },
    safetyScore: user.safetyScore
  });
});

// Add emergency contact
export const addEmergencyContact = asyncHandler(async (req, res) => {
  const { name, phone, relationship } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $push: { emergencyContacts: { name, phone, relationship } } },
    { new: true }
  );

  res.json({
    message: "Emergency contact added",
    emergencyContacts: user.emergencyContacts
  });
});

// Remove emergency contact
export const removeEmergencyContact = asyncHandler(async (req, res) => {
  const { contactId } = req.params;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $pull: { emergencyContacts: { _id: contactId } } },
    { new: true }
  );

  res.json({
    message: "Emergency contact removed",
    emergencyContacts: user.emergencyContacts
  });
});

// Deactivate account
export const deactivateAccount = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  await User.findByIdAndUpdate(req.user._id, {
    isActive: false,
    isDeactivated: true,
    deactivationReason: reason,
    deactivatedAt: new Date()
  });

  await AuditLog.log("user.profile.update", "User", req.user._id, req.user._id, {
    action: "deactivate",
    reason
  });

  res.json({ message: "Account deactivated successfully" });
});

// ADMIN: Get all users
export const getAllUsers = asyncHandler(async (req, res) => {
  const { role, verificationStatus, hostel, page = 1, limit = 20, search } = req.query;

  const query = {};

  if (role) query.role = role;
  if (verificationStatus) query.verificationStatus = verificationStatus;
  if (hostel) query.hostel = hostel;
  if (search) {
    // Escape the input so metacharacters can't form a live (ReDoS-prone) regex.
    const safe = escapeRegex(search);
    query.$or = [
      { name: { $regex: safe, $options: "i" } },
      { email: { $regex: safe, $options: "i" } },
      { studentId: { $regex: safe, $options: "i" } }
    ];
  }

  const users = await User.find(query)
    .select("-password")
    .sort("-createdAt")
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await User.countDocuments(query);

  res.json({
    users,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit)
  });
});

// ADMIN: Update user
export const adminUpdateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role, verificationStatus, isActive } = req.body;

  const updates = {};
  if (role) updates.role = role;
  if (verificationStatus) updates.verificationStatus = verificationStatus;
  if (isActive !== undefined) {
    updates.isActive = isActive;
    updates.isDeactivated = !isActive;
  }

  const user = await User.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  await AuditLog.log("admin.user.update", "User", user._id, req.user._id, { updates });

  res.json({
    message: "User updated",
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      verificationStatus: user.verificationStatus,
      isActive: user.isActive
    }
  });
});

export const promoteRules = [body("email").trim().isEmail().withMessage("Enter a valid email")];

// ADMIN: grant admin rights to an existing user, by email. Creating admins is a
// privileged, audited action with no self-service path — this is the only way
// to mint a new admin from the app.
export const promoteToAdmin = asyncHandler(async (req, res) => {
  const email = String(req.body.email || "").toLowerCase();
  const user = await User.findOne({ email });
  if (!user) {
    const error = new Error("No user found with that email");
    error.statusCode = 404;
    throw error;
  }

  const alreadyAdmin = user.role === "admin";
  if (!alreadyAdmin) {
    user.role = "admin";
    await user.save();
    await AuditLog.log("admin.user.update", "User", user._id, req.user._id, {
      action: "promote_admin"
    });
  }

  res.json({
    message: alreadyAdmin ? `${user.name} is already an admin.` : `${user.name} is now an admin.`,
    user: { id: user._id, name: user.name, email: user.email, role: user.role }
  });
});
