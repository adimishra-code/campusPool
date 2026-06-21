import mongoose from "mongoose";
const featureFlagSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    enabled: {
      type: Boolean,
      default: false
    },
    description: String,

    rollout: {
      percentage: { type: Number, default: 100, min: 0, max: 100 },
      userRoles: [{ type: String, enum: ["student", "host", "admin"] }],
      allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
    },

    enabledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    enabledAt: Date,
    disabledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    disabledAt: Date,

    requires: [String]
  },
  { timestamps: true }
);

// 'key' is already unique inline on the field above.
featureFlagSchema.index({ enabled: 1 });

featureFlagSchema.statics.isEnabled = async function (key, userId = null, userRole = null) {
  const flag = await this.findOne({ key });
  if (!flag || !flag.enabled) return false;

  const { rollout } = flag;

  if (rollout.percentage < 100 && Math.random() * 100 > rollout.percentage) {
    return false;
  }

  if (rollout.userRoles?.length > 0 && userRole && !rollout.userRoles.includes(userRole)) {
    return false;
  }

  if (rollout.allowedUsers?.length > 0 && userId) {
    if (!rollout.allowedUsers.some((id) => id.toString() === userId.toString())) {
      return false;
    }
  }

  if (rollout.blockedUsers?.length > 0 && userId) {
    if (rollout.blockedUsers.some((id) => id.toString() === userId.toString())) {
      return false;
    }
  }

  return true;
};

featureFlagSchema.statics.enable = async function (key, userId, options = {}) {
  return this.findOneAndUpdate(
    { key },
    { $set: { enabled: true, enabledBy: userId, enabledAt: new Date(), ...options } },
    { upsert: true, new: true }
  );
};

featureFlagSchema.statics.disable = async function (key, userId) {
  return this.findOneAndUpdate(
    { key },
    { $set: { enabled: false, disabledBy: userId, disabledAt: new Date() } }
  );
};

featureFlagSchema.statics.initializeDefaults = async function () {
  const defaults = [
    { key: "enable_ride_groups", enabled: true, description: "Enable ride groups feature" },
    { key: "enable_waitlists", enabled: true, description: "Enable waitlist feature" },
    { key: "enable_payments", enabled: false, description: "Enable payment settlements" },
    { key: "enable_carbon_tracking", enabled: true, description: "Enable carbon savings tracking" },
    { key: "enable_chat", enabled: true, description: "Enable in-app chat" },
    { key: "enable_recurring", enabled: true, description: "Enable recurring trips" },
    { key: "enable_route_matching", enabled: true, description: "Enable smart route matching" },
    { key: "enable_trust_scores", enabled: true, description: "Enable trust score system" },
    { key: "enable_verification", enabled: true, description: "Enable identity verification" },
    { key: "enable_analytics", enabled: true, description: "Enable analytics dashboard" },
    { key: "enable_sos", enabled: true, description: "Enable SOS emergency feature" },
    { key: "enable_ride_requests", enabled: true, description: "Enable ride request system" }
  ];

  for (const flag of defaults) {
    await this.findOneAndUpdate({ key: flag.key }, { $setOnInsert: flag }, { upsert: true });
  }
};

export default mongoose.model("FeatureFlag", featureFlagSchema);
