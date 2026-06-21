import mongoose from "mongoose";
const auditLogSchema = new mongoose.Schema({
  action: { 
    type: String, 
    required: true,
    enum: [
      "user.login", "user.logout", "user.register",
      "user.profile.update", "user.preferences.update",
      "verification.submit", "verification.approve", "verification.reject",
      "vehicle.register", "vehicle.update", "vehicle.delete",
      "trip.offer", "trip.join", "trip.approve", "trip.reject", "trip.cancel",
      "trip.complete", "trip.start",
      "group.create", "group.join", "group.leave",
      "message.send", "message.read",
      "settlement.create", "settlement.complete",
      "admin.user.update", "admin.user.delete",
      "admin.verification.approve", "admin.verification.reject",
      "admin.trip.delete", "admin.feature.toggle"
    ]
  },
  
  entityType: { 
    type: String, 
    required: true,
    enum: ["User", "Verification", "Vehicle", "Trip", "RideGroup", "Conversation", "Message", "Settlement", "FeatureFlag", "Admin"]
  },
  
  entityId: mongoose.Schema.Types.ObjectId,
  
  performedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  
  performedAt: { type: Date, default: Date.now },
  
  details: mongoose.Schema.Types.Mixed,
  
  ipAddress: String,
  
  userAgent: String,
  
  status: { 
    type: String, 
    enum: ["success", "failure", "pending"],
    default: "success" 
  },
  
  errorMessage: String
}, { timestamps: true });

auditLogSchema.index({ performedBy: 1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ performedAt: -1 });

auditLogSchema.statics.log = async function(action, entityType, entityId, userId, details = {}, status = "success") {
  return this.create({
    action,
    entityType,
    entityId,
    performedBy: userId,
    details,
    status,
    performedAt: new Date()
  });
};

auditLogSchema.statics.getRecentByUser = function(userId, limit = 50) {
  return this.find({ performedBy: userId })
    .sort("-performedAt")
    .limit(limit)
    .populate("performedBy", "name email");
};

auditLogSchema.statics.getEntityHistory = function(entityType, entityId, limit = 50) {
  return this.find({ entityType, entityId })
    .sort("-performedAt")
    .limit(limit)
    .populate("performedBy", "name email");
};

export default mongoose.model("AuditLog", auditLogSchema);
