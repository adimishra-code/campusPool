import mongoose from "mongoose";

// Custom error carrying an HTTP status code for central error handler.
function tripError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const locationSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, trim: true, maxlength: 200 },
    coordinates: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true }
    },
    placeId: String,
    landmark: String
  },
  { _id: false }
);

const passengerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled", "completed"],
      default: "pending"
    },
    pickupSequence: Number,
    joinedAt: { type: Date, default: Date.now },
    approvedAt: Date,
    rejectedAt: Date,
    rejectionReason: String
  },
  { _id: false }
);

const splitDetailSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    settled: { type: Boolean, default: false },
    settledAt: Date,
    method: String
  },
  { _id: false }
);

const timelineEventSchema = new mongoose.Schema(
  {
    status: String,
    at: { type: Date, default: Date.now },
    note: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { _id: false }
);

const checkInSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    coordinates: { type: [Number], default: undefined }, // [lng, lat]
    note: { type: String, maxlength: 200 },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

// Trip-level safety state: en-route check-ins and safe-arrival confirmation.
const tripSafetySchema = new mongoose.Schema(
  {
    checkIns: { type: [checkInSchema], default: [] },
    arrivalConfirmedAt: Date,
    arrivalConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Set once the scheduler has escalated a missing safe-arrival confirmation,
    // so we never escalate the same trip twice.
    arrivalEscalatedAt: Date
  },
  { _id: false }
);

const tripSchema = new mongoose.Schema(
  {
    // Host (user offering the ride)
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    // Vehicle being used
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle"
    },

    // Route
    pickup: { type: locationSchema, required: true },
    destination: { type: locationSchema, required: true },

    // Trip metadata
    departureTime: { type: Date, required: true, index: true },
    arrivalTime: Date,

    // Recurring schedule hint (e.g. ["monday", "wednesday", "friday"]).
    recurringDays: [String],

    // Status
    status: {
      type: String,
      enum: [
        "draft",
        "offered",
        "open",
        "full",
        "departed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show"
      ],
      default: "offered",
      index: true
    },

    // Trip type (solo vs carpool)
    rideType: {
      type: String,
      enum: ["solo", "carpool"],
      default: "carpool",
      index: true
    },

    // Passengers
    passengers: [passengerSchema],

    // Capacity
    seatsTotal: { type: Number, default: 4, min: 2, max: 8 },
    seatsAvailable: { type: Number, default: 3, min: 0 },

    // Route details
    distanceKm: { type: Number, required: true },
    durationMin: { type: Number, required: true },
    etaSeconds: Number,

    route: {
      polyline: String,
      bounds: mongoose.Schema.Types.Mixed,
      provider: { type: String, enum: ["google", "fallback"], default: "fallback" },
      stops: [locationSchema]
    },

    // Cost sharing
    costPerPerson: { type: Number, required: true },
    totalCost: { type: Number, required: true },
    splitDetails: [splitDetailSchema],

    // Payment
    paymentMethod: {
      type: String,
      enum: ["cash", "upi"],
      default: "cash"
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "partial", "settled", "refunded"],
      default: "pending"
    },

    // Carbon tracking
    carbonSavedKg: { type: Number, default: 0 },

    // Matching (for route-based matching)
    matching: {
      candidatePassengers: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          score: Number,
          routeOverlap: Number,
          status: {
            type: String,
            enum: ["suggested", "invited", "joined", "ignored"],
            default: "suggested"
          }
        }
      ],
      matchScore: Number,
      recommendationReason: String
    },

    // Cancellation
    cancellation: {
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reason: String,
      cancelledAt: Date
    },

    // Timeline
    timeline: [timelineEventSchema],

    // Safety: en-route check-ins and safe-arrival confirmation
    safety: { type: tripSafetySchema, default: () => ({}) },

    // Trip completion
    completedAt: Date,
    receiptUrl: String,

    // Notes
    notes: String,
    cancellationPolicy: {
      type: String,
      enum: ["strict", "flexible", "moderate"],
      default: "moderate"
    },
    cancellationDeadline: Date // Hours before departure
  },
  {
    timestamps: true,
    collection: "rides" // Keep backward compatibility with existing collection
  }
);

// Indexes
tripSchema.index({ "pickup.coordinates": "2dsphere" });
tripSchema.index({ "destination.coordinates": "2dsphere" });
tripSchema.index({ host: 1, status: 1 });
tripSchema.index({ status: 1, departureTime: 1 });
tripSchema.index({ "passengers.user": 1 });
// (departureTime is already indexed inline on the field above)
tripSchema.index({ createdAt: -1, status: 1 });

// Virtual for isFull
tripSchema.virtual("isFull").get(function () {
  return this.seatsAvailable <= 0;
});

// Virtual for isUpcoming
tripSchema.virtual("isUpcoming").get(function () {
  return new Date() < new Date(this.departureTime);
});

// Pre-save middleware to update seats available
tripSchema.pre("save", function (next) {
  if (this.isModified("passengers")) {
    const approvedPassengers = this.passengers.filter((p) => p.status === "approved");
    this.seatsAvailable = this.seatsTotal - approvedPassengers.length;
  }

  // Update status based on seats
  if (this.isFull && this.status === "open") {
    this.status = "full";
  } else if (!this.isFull && this.status === "full") {
    this.status = "open";
  }

  next();
});

// Method to add passenger
tripSchema.methods.addPassenger = async function (userId, notes = "") {
  const existing = this.passengers.find((p) => p.user.toString() === userId.toString());
  if (existing) {
    throw tripError("Already applied to this trip", 400);
  }

  if (this.seatsAvailable <= 0) {
    throw tripError("Trip is full", 400);
  }

  this.passengers.push({
    user: userId,
    status: "pending",
    joinedAt: new Date()
  });

  this.timeline.push({
    status: "passenger_joined",
    note: notes || "Passenger requested to join",
    by: userId
  });

  await this.save();
  return this;
};

// Method to approve passenger
tripSchema.methods.approvePassenger = async function (userId) {
  const passenger = this.passengers.find((p) => p.user.toString() === userId.toString());
  if (!passenger) {
    throw tripError("Passenger not found", 404);
  }

  if (passenger.status !== "pending") {
    throw tripError("Passenger not pending", 400);
  }

  if (this.seatsAvailable <= 0) {
    throw tripError("No seats available", 400);
  }

  passenger.status = "approved";
  passenger.approvedAt = new Date();

  this.timeline.push({
    status: "passenger_approved",
    note: "Passenger approved",
    by: this.host
  });

  await this.save();
  return this;
};

// Method to reject passenger
tripSchema.methods.rejectPassenger = async function (userId, reason) {
  const passenger = this.passengers.find((p) => p.user.toString() === userId.toString());
  if (!passenger) {
    throw tripError("Passenger not found", 404);
  }

  passenger.status = "rejected";
  passenger.rejectedAt = new Date();
  passenger.rejectionReason = reason;

  this.timeline.push({
    status: "passenger_rejected",
    note: reason || "Passenger rejected",
    by: this.host
  });

  await this.save();
  return this;
};

// Method to cancel trip
tripSchema.methods.cancel = async function (userId, reason) {
  this.status = "cancelled";
  this.cancellation = {
    by: userId,
    reason,
    cancelledAt: new Date()
  };

  this.timeline.push({
    status: "cancelled",
    note: reason,
    by: userId
  });

  await this.save();
  return this;
};

// Method to start trip. Trips are created "offered" and remain joinable as
// "offered"/"open" (and "full" once seats run out), so all three are startable.
tripSchema.methods.start = async function () {
  if (!["offered", "open", "full"].includes(this.status)) {
    throw tripError("Trip cannot be started", 400);
  }

  this.status = "departed";
  this.timeline.push({
    status: "departed",
    note: "Trip started",
    by: this.host
  });

  await this.save();
  return this;
};

// Method to complete trip. Only a started (departed) trip can be completed.
tripSchema.methods.complete = async function () {
  if (this.status !== "departed") {
    throw tripError("Trip must be started before it can be completed", 400);
  }

  this.status = "completed";
  this.completedAt = new Date();

  // Mark all approved passengers as completed
  this.passengers.forEach((p) => {
    if (p.status === "approved") {
      p.status = "completed";
    }
  });

  this.timeline.push({
    status: "completed",
    note: "Trip completed successfully",
    by: this.host
  });

  await this.save();
  return this;
};

// Static to find available trips
tripSchema.statics.findAvailable = function (filters = {}) {
  const query = {
    status: { $in: ["offered", "open"] },
    departureTime: { $gte: new Date() }
  };

  if (filters.pickup) {
    query["pickup.coordinates"] = {
      $near: {
        $geometry: filters.pickup,
        $maxDistance: (filters.radiusKm || 10) * 1000
      }
    };
  }

  if (filters.destination) {
    query["destination.coordinates"] = {
      $near: {
        $geometry: filters.destination,
        $maxDistance: (filters.destinationRadiusKm || 10) * 1000
      }
    };
  }

  if (filters.date) {
    const startOfDay = new Date(filters.date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(filters.date);
    endOfDay.setHours(23, 59, 59, 999);
    query.departureTime = { $gte: startOfDay, $lte: endOfDay };
  }

  if (filters.host) {
    query.host = filters.host;
  }

  return this.find(query)
    .populate("host", "name avatarUrl hostel trustScore")
    .populate("vehicle", "make model color seats")
    .sort("departureTime")
    .limit(filters.limit || 50);
};

export default mongoose.model("Trip", tripSchema);
