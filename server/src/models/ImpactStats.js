import mongoose from "mongoose";
const monthlyStatsSchema = new mongoose.Schema({
  year: { type: Number, required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  
  // Stats for this month
  tripsAsHost: { type: Number, default: 0 },
  tripsAsPassenger: { type: Number, default: 0 },
  distanceAsHost: { type: Number, default: 0 },
  distanceAsPassenger: { type: Number, default: 0 },
  carbonSaved: { type: Number, default: 0 },
  moneySaved: { type: Number, default: 0 },
  earned: { type: Number, default: 0 }
}, { _id: false });

const impactStatsSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true, 
    unique: true,
    index: true 
  },
  
  // Lifetime stats
  totalCarbonSaved: { type: Number, default: 0 }, // in kg CO2
  totalDistanceShared: { type: Number, default: 0 }, // in km
  totalMoneySaved: { type: Number, default: 0 }, // in INR
  totalTripsShared: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  
  // Trip breakdown
  tripsAsHost: { type: Number, default: 0 },
  tripsAsPassenger: { type: Number, default: 0 },
  distanceAsHost: { type: Number, default: 0 },
  distanceAsPassenger: { type: Number, default: 0 },
  
  // Monthly breakdown
  monthlyStats: [monthlyStatsSchema],
  
  // Streaks
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  lastTripDate: Date,
  
  // Achievement flags
  achievements: [{
    key: String,
    name: String,
    description: String,
    earnedAt: Date
  }]
}, { timestamps: true });

// Indexes ('user' is already unique+indexed inline on the field above)
impactStatsSchema.index({ totalCarbonSaved: -1 });
impactStatsSchema.index({ totalTripsShared: -1 });

// Static to get or create stats
impactStatsSchema.statics.getOrCreate = async function(userId) {
  let stats = await this.findOne({ user: userId });
  if (!stats) {
    stats = await this.create({ user: userId });
  }
  return stats;
};

// Method to record trip as host
impactStatsSchema.methods.recordAsHost = async function(distanceKm, carbonSaved, earnings) {
  this.tripsAsHost += 1;
  this.tripsAsPassenger += 0;
  this.distanceAsHost += distanceKm;
  this.totalTripsShared += 1;
  this.totalDistanceShared += distanceKm;
  this.totalCarbonSaved += carbonSaved;
  this.totalEarnings += earnings;
  this.earned += earnings;
  
  await this.updateStreak();
  await this.checkAchievements();
  await this.save();
  
  await this.updateMonthlyStats("host", distanceKm, carbonSaved, earnings);
};

// Method to record trip as passenger
impactStatsSchema.methods.recordAsPassenger = async function(distanceKm, carbonSaved, moneySaved) {
  this.tripsAsPassenger += 1;
  this.distanceAsPassenger += distanceKm;
  this.totalTripsShared += 1;
  this.totalDistanceShared += distanceKm;
  this.totalCarbonSaved += carbonSaved;
  this.totalMoneySaved += moneySaved;
  
  await this.updateStreak();
  await this.checkAchievements();
  await this.save();
  
  await this.updateMonthlyStats("passenger", distanceKm, carbonSaved, 0, moneySaved);
};

// Update streak
impactStatsSchema.methods.updateStreak = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (this.lastTripDate) {
    const lastDate = new Date(this.lastTripDate);
    lastDate.setHours(0, 0, 0, 0);
    
    const daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 1) {
      this.currentStreak += 1;
    } else if (daysDiff > 1) {
      this.currentStreak = 1;
    }
    // daysDiff === 0 means same day, don't change streak
  } else {
    this.currentStreak = 1;
  }
  
  if (this.currentStreak > this.longestStreak) {
    this.longestStreak = this.currentStreak;
  }
  
  this.lastTripDate = new Date();
};

// Update monthly stats
impactStatsSchema.methods.updateMonthlyStats = async function(role, distance, carbon, earned = 0, saved = 0) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  
  let monthStat = this.monthlyStats.find(m => m.year === year && m.month === month);
  
  if (!monthStat) {
    monthStat = { year, month };
    this.monthlyStats.push(monthStat);
  }
  
  if (role === "host") {
    monthStat.tripsAsHost += 1;
    monthStat.distanceAsHost += distance;
    monthStat.earned += earned;
  } else {
    monthStat.tripsAsPassenger += 1;
    monthStat.distanceAsPassenger += distance;
    monthStat.moneySaved += saved;
  }
  
  monthStat.carbonSaved += carbon;
  
  // Keep only last 12 months
  if (this.monthlyStats.length > 12) {
    this.monthlyStats = this.monthlyStats.slice(-12);
  }
};

// Check achievements
impactStatsSchema.methods.checkAchievements = async function() {
  const achievements = [];
  
  // First ride
  if (this.totalTripsShared === 1) {
    achievements.push({
      key: "first_ride",
      name: "First Ride",
      description: "Completed your first shared trip",
      earnedAt: new Date()
    });
  }
  
  // Eco warrior (100kg carbon saved)
  if (this.totalCarbonSaved >= 100 && !this.achievements.find(a => a.key === "eco_warrior")) {
    achievements.push({
      key: "eco_warrior",
      name: "Eco Warrior",
      description: "Saved 100kg of CO2 emissions",
      earnedAt: new Date()
    });
  }
  
  // Community builder (10 trips as host)
  if (this.tripsAsHost >= 10 && !this.achievements.find(a => a.key === "community_builder")) {
    achievements.push({
      key: "community_builder",
      name: "Community Builder",
      description: "Offered 10 rides to fellow students",
      earnedAt: new Date()
    });
  }
  
  // Week warrior (7 day streak)
  if (this.currentStreak >= 7 && !this.achievements.find(a => a.key === "week_warrior")) {
    achievements.push({
      key: "week_warrior",
      name: "Week Warrior",
      description: "Maintained a 7-day ride sharing streak",
      earnedAt: new Date()
    });
  }
  
  if (achievements.length > 0) {
    this.achievements.push(...achievements);
  }
};

// Static to get leaderboard
impactStatsSchema.statics.getLeaderboard = async function(limit = 10) {
  return this.find()
    .populate("user", "name avatarUrl hostel")
    .sort("-totalCarbonSaved")
    .limit(limit);
};

// Static to calculate carbon savings
// Average car emits ~0.21 kg CO2 per km
// We save this by carpooling
impactStatsSchema.statics.calculateCarbonSaved = function(distanceKm, passengersCount) {
  // Carbon saved = distance * (1 - 1/passengers) * emissionRate
  // More passengers = more savings
  const emissionRate = 0.21; // kg CO2 per km
  const savings = distanceKm * emissionRate * (1 - 1 / Math.max(2, passengersCount));
  return Math.round(savings * 100) / 100;
};

export default mongoose.model("ImpactStats", impactStatsSchema);
