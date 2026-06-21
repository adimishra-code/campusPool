import mongoose from "mongoose";
import crypto from "crypto";
const routeTemplateSchema = new mongoose.Schema({
  // Source location
  source: {
    address: { type: String, required: true },
    coordinates: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true }
    },
    placeId: String, // Google Places ID
    hostel: String   // Named location (e.g., "Hostel A")
  },
  
  // Destination location
  destination: {
    address: { type: String, required: true },
    coordinates: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true }
    },
    placeId: String,
    landmark: String  // e.g., "Main Campus", "Library"
  },
  
  // Route hash for quick matching (unique index declared below)
  routeHash: {
    type: String,
    required: true
  },
  
  // Encoded polyline from Google Maps
  routePolyline: String,
  
  // Route metadata
  distance: {
    value: Number, // in meters
    text: String
  },
  duration: {
    value: Number, // in seconds
    text: String
  },
  
  // Usage statistics
  usageCount: { 
    type: Number, 
    default: 0 
  },
  lastUsed: Date,
  
  // Popularity score (calculated)
  popularityScore: { 
    type: Number, 
    default: 0 
  },
  
  // Associated users (for personalized routes)
  frequentUsers: [{ 
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    count: { type: Number, default: 0 }
  }],
  
  // Associated trips count
  tripCount: { 
    type: Number, 
    default: 0 
  },
  
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { timestamps: true });

// Indexes
routeTemplateSchema.index({ "source.coordinates": "2dsphere" });
routeTemplateSchema.index({ "destination.coordinates": "2dsphere" });
routeTemplateSchema.index({ routeHash: 1 }, { unique: true });
routeTemplateSchema.index({ popularityScore: -1 });
routeTemplateSchema.index({ usageCount: -1 });
routeTemplateSchema.index({ lastUsed: -1 });

// Static method to generate route hash
routeTemplateSchema.statics.generateHash = function(sourceCoords, destCoords) {
  const src = coordinatesToArray(sourceCoords);
  const dest = coordinatesToArray(destCoords);
  const hash = crypto.createHash("md5");
  hash.update(`${src[0]},${src[1]}-${dest[0]},${dest[1]}`);
  return hash.digest("hex");
};

// Static method to find or create route
routeTemplateSchema.statics.findOrCreate = async function(source, destination, polyline, distance, duration) {
  const routeHash = this.generateHash(source.coordinates, destination.coordinates);
  
  let route = await this.findOne({ routeHash });
  
  if (route) {
    route.usageCount += 1;
    route.lastUsed = new Date();
    await route.save();
  } else {
    route = await this.create({
      source,
      destination,
      routeHash,
      routePolyline: polyline,
      distance,
      duration,
      usageCount: 1,
      lastUsed: new Date()
    });
  }
  
  return route;
};

// Static method to find nearby routes
routeTemplateSchema.statics.findNearby = async function(coordinates, radiusKm = 5) {
  return this.find({
    "source.coordinates": {
      $near: {
        $geometry: { type: "Point", coordinates },
        $maxDistance: radiusKm * 1000
      }
    },
    isActive: true
  })
  .sort("-popularityScore")
  .limit(10);
};

// Method to increment usage
routeTemplateSchema.methods.incrementUsage = async function(userId = null) {
  this.usageCount += 1;
  this.lastUsed = new Date();
  
  // Update popularity score based on recency and frequency
  const daysSinceLastUse = this.lastUsed 
    ? (Date.now() - this.lastUsed.getTime()) / (1000 * 60 * 60 * 24) 
    : 30;
  
  // Score = usageCount / days since first use (decay over time)
  this.popularityScore = Math.round(this.usageCount / Math.max(1, daysSinceLastUse));
  
  // Update frequent users
  if (userId) {
    const existingUser = this.frequentUsers.find(u => u.user.toString() === userId.toString());
    if (existingUser) {
      existingUser.count += 1;
    } else {
      this.frequentUsers.push({ user: userId, count: 1 });
    }
  }
  
  await this.save();
};

// Helper to convert coordinate object to array
function coordinatesToArray(coords) {
  if (Array.isArray(coords)) return coords;
  return coords?.coordinates || [0, 0];
}

export default mongoose.model("RouteTemplate", routeTemplateSchema);
