import mongoose from "mongoose";

const studentIdSchema = new mongoose.Schema(
  {
    number: { type: String },
    documentUrl: String,
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectionReason: String
  },
  { _id: false }
);

const identityProofSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["aadhaar", "passport", "driving_license", "voter_id", "college_id"],
      required: true
    },
    documentUrl: { type: String, required: true },
    number: String, // Last 4 digits for verification
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectionReason: String
  },
  { _id: false }
);

const vehicleVerificationSchema = new mongoose.Schema(
  {
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
    documents: [
      {
        type: {
          type: String,
          enum: ["rc", "insurance", "pollution", "permit", "license", "photo"],
          required: true
        },
        url: { type: String, required: true },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending"
        },
        rejectionReason: String,
        verifiedAt: Date
      }
    ],
    overallStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    approvedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { _id: false }
);

const verificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },

    // Student ID verification
    studentId: { type: studentIdSchema },

    // College email verification
    collegeEmail: {
      email: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date,
      otp: String,
      otpExpiresAt: Date,
      attempts: { type: Number, default: 0 }
    },

    // Identity proof
    identityProof: { type: identityProofSchema },

    // Vehicle verification (if user is host)
    vehicleVerification: { type: vehicleVerificationSchema },

    // Overall verification status
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "partial"],
      default: "pending"
    },

    // Notes from admin
    adminNotes: String,

    // Documents stored in GridFS
    documentIds: [mongoose.Schema.Types.ObjectId]
  },
  { timestamps: true }
);

// Indexes ('user' is already unique+indexed inline on the field above)
verificationSchema.index({ "studentId.status": 1 });
verificationSchema.index({ "identityProof.status": 1 });
verificationSchema.index({ "vehicleVerification.overallStatus": 1 });
verificationSchema.index({ status: 1 });
verificationSchema.index({ createdAt: -1 });

verificationSchema.virtual("progress").get(function () {
  let completed = 0;
  let total = 3; // email + studentId + identityProof

  if (this.collegeEmail?.verified) completed++;
  if (this.studentId?.status === "approved") completed++;
  if (this.identityProof?.status === "approved") completed++;

  if (this.vehicleVerification?.overallStatus === "approved") {
    total += 3; // rc, insurance, pollution
    if (this.vehicleVerification.documents.every((d) => d.status === "approved")) {
      completed += 3;
    }
  }

  return Math.round((completed / total) * 100);
});

// Method to check if verification is complete
verificationSchema.methods.isFullyVerified = function () {
  return this.status === "approved";
};

// Method to check if user can drive (needs vehicle verification)
verificationSchema.methods.canDrive = function () {
  return this.status === "approved" && this.vehicleVerification?.overallStatus === "approved";
};

// Static to get verification by user
verificationSchema.statics.findByUser = function (userId) {
  return this.findOne({ user: userId });
};

export default mongoose.model("Verification", verificationSchema);
