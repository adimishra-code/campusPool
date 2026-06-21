import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const reliabilityStatsSchema = new mongoose.Schema(
  {
    cancellations: { type: Number, default: 0 },
    noShows: { type: Number, default: 0 },
    lateArrivals: { type: Number, default: 0 },
    totalTrips: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  { _id: false }
);

const trustBreakdownSchema = new mongoose.Schema(
  {
    reliability: { type: Number, default: 50 },
    punctuality: { type: Number, default: 50 },
    driving: { type: Number, default: 50 },
    communication: { type: Number, default: 50 }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    // Password is required for password-based accounts but optional for accounts
    // that authenticate exclusively through an OAuth provider (e.g. Google).
    password: {
      type: String,
      required: function requirePassword() {
        return !this.googleId;
      },
      minlength: 8,
      select: false
    },

    // OAuth provider linkage (Google). Sparse so non-OAuth accounts don't collide
    // on a null value.
    googleId: { type: String, sparse: true, index: true },

    // Role: student, host, admin
    role: {
      type: String,
      enum: ["student", "host", "admin"],
      default: "student",
      index: true
    },

    avatarUrl: String,

    // Campus-specific fields
    studentId: { type: String, trim: true, sparse: true },
    hostel: { type: String, trim: true },
    collegeEmail: { type: String, trim: true, lowercase: true },
    college: { type: mongoose.Schema.Types.ObjectId, ref: "College" },

    // Verification status
    verificationStatus: {
      type: String,
      enum: ["unverified", "pending", "approved", "rejected"],
      default: "unverified",
      index: true
    },

    // User preferences for ride matching
    preferences: {
      smoking: { type: Boolean, default: false },
      music: { type: Boolean, default: true },
      ac: { type: Boolean, default: false },
      onlySameGender: { type: Boolean, default: false },
      maxDetourMin: { type: Number, default: 15, min: 5, max: 60 },
      preferredPaymentMethod: { type: String, enum: ["cash", "upi"], default: "cash" }
    },

    // Trust Score (calculated from trustBreakdown and reliabilityStats)
    trustScore: { type: Number, default: 50, min: 0, max: 100 },
    trustBreakdown: { type: trustBreakdownSchema, default: () => ({}) },

    // Safety Score (0-100, higher is safer) derived from reports, reliability and
    // arrival/check-in compliance via safety.service.recomputeSafetyScore.
    safetyScore: { type: Number, default: 100, min: 0, max: 100 },

    // Reliability tracking
    reliabilityStats: { type: reliabilityStatsSchema, default: () => ({}) },

    // Legacy rating fields (kept for backward compatibility)
    ratingAverage: { type: Number, default: 5 },
    ratingCount: { type: Number, default: 0 },

    // Emergency contacts
    emergencyContacts: [
      {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        relationship: String
      }
    ],

    // UPI VPA (Virtual Payment Address) for receiving direct peer-to-peer
    // ride-share settlements via a QR / UPI intent — e.g. "alice@okhdfcbank".
    upiId: { type: String, trim: true },

    // OTP for verification (phone verification + email login 2FA challenge)
    otp: {
      code: String,
      expiresAt: Date,
      verifiedAt: Date,
      attempts: { type: Number, default: 0 }
    },

    // Email ownership verification — gates login (hard gate). Set true once the
    // account email OTP is confirmed (or when created via a trusted OAuth provider
    // / seed / admin).
    emailVerified: { type: Boolean, default: false },

    // Optional login 2FA: when enabled, a successful password check issues an
    // email OTP challenge that must be confirmed before a session is granted.
    twoFactorEnabled: { type: Boolean, default: false },

    // Brute-force protection: failed login counter + temporary lockout window.
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: Date,

    // Password reset: SHA-256 hash of a single-use token + its expiry.
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },

    // Account status
    isActive: { type: Boolean, default: true },
    isDeactivated: { type: Boolean, default: false },
    deactivationReason: String,
    deactivatedAt: Date,

    // Last seen for online status
    lastSeen: Date,

    // Device tokens for notifications
    deviceTokens: [String]
  },
  { timestamps: true }
);

// Indexes
// Note: email/phone (unique), role & verificationStatus (index:true) and
// studentId (sparse) already create their indexes inline on the fields above;
// only the additional indexes are declared here to avoid duplicate-index warnings.
userSchema.index({ hostel: 1 });
userSchema.index({ trustScore: -1 });
userSchema.index({ isActive: 1, role: 1 });
userSchema.index({ createdAt: -1 });

// Text index for search
userSchema.index({ name: "text", email: "text", studentId: "text", hostel: "text" });

// Pre-save middleware for password hashing
userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = function comparePassword(candidate) {
  // Guard against OAuth-only accounts and non-string (e.g. operator-injection) input.
  if (!this.password || typeof candidate !== "string") return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

// ---- Brute-force lockout helpers ----------------------------------------
// After MAX_FAILED consecutive failures the account is locked for LOCK_MINUTES.
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

userSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockUntil && this.lockUntil > Date.now());
};

// Record a failed login. Returns true if this failure tripped a fresh lockout.
userSchema.methods.registerFailedLogin = async function registerFailedLogin() {
  // A previous lock has expired — start the counter fresh.
  if (this.lockUntil && this.lockUntil <= Date.now()) {
    this.failedLoginAttempts = 0;
    this.lockUntil = undefined;
  }
  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;
  let lockedNow = false;
  if (this.failedLoginAttempts >= MAX_FAILED_LOGINS) {
    this.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    lockedNow = true;
  }
  await this.save();
  return lockedNow;
};

userSchema.methods.resetLoginAttempts = async function resetLoginAttempts() {
  if (this.failedLoginAttempts || this.lockUntil) {
    this.failedLoginAttempts = 0;
    this.lockUntil = undefined;
    await this.save();
  }
};

// Method to calculate trust score from breakdown
userSchema.methods.calculateTrustScore = function () {
  const { reliability, punctuality, driving, communication } = this.trustBreakdown;
  const reliabilityWeight = 0.3;
  const punctualityWeight = 0.3;
  const drivingWeight = 0.2; // Only for hosts
  const communicationWeight = 0.2;

  let score;
  if (this.role === "host") {
    score =
      reliability * reliabilityWeight +
      punctuality * punctualityWeight +
      driving * drivingWeight +
      communication * communicationWeight;
  } else {
    score = reliability * 0.35 + punctuality * 0.35 + communication * 0.3;
  }

  this.trustScore = Math.round(score);
  return this.trustScore;
};

// Method to update reliability stats
userSchema.methods.updateReliability = function (metric, increment = true) {
  const delta = increment ? 1 : -1;
  if (this.reliabilityStats) {
    if (this.reliabilityStats[metric] !== undefined) {
      this.reliabilityStats[metric] = Math.max(0, this.reliabilityStats[metric] + delta);
    }
    this.reliabilityStats.lastUpdated = new Date();
  }
  this.calculateTrustScore();
};

// Method to check if user can offer rides
userSchema.methods.canOfferRides = function () {
  return this.role === "host" && this.verificationStatus === "approved" && this.isActive;
};

// Method to check if user can join rides
userSchema.methods.canJoinRides = function () {
  return this.verificationStatus === "approved" && this.isActive;
};

export default mongoose.model("User", userSchema);
