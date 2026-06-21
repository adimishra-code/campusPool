import mongoose from "mongoose";
const vehicleSchema = new mongoose.Schema({
  // Owner (User with role="host")
  owner: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true, 
    index: true 
  },
  
  // Vehicle details
  make: { type: String, required: true, trim: true, maxlength: 50 },
  model: { type: String, required: true, trim: true, maxlength: 50 },
  color: { type: String, required: true, trim: true },
  year: { type: Number, min: 2000, max: new Date().getFullYear() + 1 },
  plateNumber: { 
    type: String, 
    required: true, 
    unique: true, 
    uppercase: true, 
    trim: true 
  },
  
  // Seats for carpooling
  seats: { 
    type: Number, 
    default: 4, 
    min: 2, 
    max: 8 
  },
  
  // Category
  category: { 
    type: String, 
    enum: ["bike", "auto", "car", "suv"], 
    default: "car" 
  },
  
  // Vehicle amenities (matching user preferences)
  amenities: {
    ac: { type: Boolean, default: false },
    music: { type: Boolean, default: true },
    charging: { type: Boolean, default: false },
    luggageSpace: { type: Boolean, default: false }
  },
  
  // Verification status (requires documents)
  verificationStatus: { 
    type: String, 
    enum: ["unverified", "pending", "approved", "rejected"], 
    default: "unverified",
    index: true 
  },
  
  // Document URLs stored as object (in production, store in GridFS/S3)
  documents: {
    rc: String,
    insurance: String,
    pollution: String,
    permit: String
  },
  
  // Status
  isActive: { type: Boolean, default: true },
  
  // Current location (for active trips)
  currentLocation: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: [0, 0] },
    updatedAt: Date
  },
  
  // Usage stats
  stats: {
    totalTrips: { type: Number, default: 0 },
    totalDistanceKm: { type: Number, default: 0 },
    rating: { type: Number, default: 5 },
    ratingCount: { type: Number, default: 0 }
  }
}, { timestamps: true });

// Indexes (owner, plateNumber [unique] and verificationStatus are indexed
// inline on the fields above; only the extra indexes are declared here)
vehicleSchema.index({ category: 1 });
vehicleSchema.index({ isActive: 1, verificationStatus: 1 });
vehicleSchema.index({ currentLocation: "2dsphere" });

// Virtual for available seats
vehicleSchema.virtual('availableSeats').get(function() {
  // This would be calculated based on active trips
  return this.seats;
});

// Method to check if vehicle can be used
vehicleSchema.methods.canDrive = function() {
  return this.isActive && this.verificationStatus === "approved";
};

// Method to calculate average rating
vehicleSchema.methods.updateRating = function(newRating) {
  const total = this.stats.rating * this.stats.ratingCount + newRating;
  this.stats.ratingCount += 1;
  this.stats.rating = total / this.stats.ratingCount;
  return this.stats.rating;
};

// Static to find available vehicles for a host
vehicleSchema.statics.findAvailableForHost = function(hostId) {
  return this.find({ 
    owner: hostId, 
    isActive: true, 
    verificationStatus: "approved" 
  });
};

export default mongoose.model("Vehicle", vehicleSchema);
