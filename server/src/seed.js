// Seed script: one-command demo data.
//   npm run seed   (needs MONGO_URI reachable)
// Wipes core collections and creates colleges, verified demo users, approved
// vehicles, and a handful of upcoming trips so the app is clickable immediately.
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import College from "./models/College.js";
import User from "./models/User.js";
import Vehicle from "./models/Vehicle.js";
import Verification from "./models/Verification.js";
import Trip from "./models/Trip.js";
import { estimateDistanceAndDuration } from "./services/fare.service.js";

const PLACES = {
  campus: { address: "Main Campus Gate", c: [77.5946, 12.9716] },
  hostelA: { address: "Boys Hostel Block A", c: [77.605, 12.965] },
  metro: { address: "Central Metro Station", c: [77.6408, 12.9784] },
  coaching: { address: "City Coaching Hub", c: [77.58, 12.955] },
  airport: { address: "Airport", c: [77.7066, 13.1986] }
};
const loc = (p) => ({ address: p.address, coordinates: { type: "Point", coordinates: p.c } });

async function makeVerifiedUser({ name, email, phone, role, hostel }, collegeId) {
  const user = await User.create({
    name,
    email,
    phone,
    password: "password123",
    role,
    hostel,
    college: collegeId,
    collegeEmail: email,
    verificationStatus: "approved",
    emailVerified: true,
    trustScore: 70 + Math.floor(Math.random() * 25),
    ratingAverage: 4 + Math.random(),
    ratingCount: 3 + Math.floor(Math.random() * 10)
  });
  await Verification.create({
    user: user._id,
    status: "approved",
    collegeEmail: { email, verified: true, verifiedAt: new Date() },
    studentId: { number: `STU${Math.floor(Math.random() * 9000) + 1000}`, status: "approved" },
    identityProof: { type: "college_id", documentUrl: "seed://college-id", status: "approved" }
  });
  return user;
}

async function makeTrip(host, vehicle, from, to, minutesFromNow, cost) {
  const route = estimateDistanceAndDuration(loc(from), loc(to));
  const seats = 4;
  return Trip.create({
    host: host._id,
    vehicle: vehicle._id,
    pickup: loc(from),
    destination: loc(to),
    departureTime: new Date(Date.now() + minutesFromNow * 60000),
    seatsTotal: seats,
    seatsAvailable: seats - 1,
    rideType: "carpool",
    distanceKm: route.distanceKm,
    durationMin: route.durationMin,
    costPerPerson: cost,
    totalCost: cost * (seats - 1),
    carbonSavedKg: Math.round(route.distanceKm * 0.21 * (seats - 1) * 100) / 100,
    status: "offered",
    timeline: [{ status: "offered", note: "Seeded trip" }]
  });
}

async function run() {
  await connectDB();
  await Promise.all([
    College.deleteMany({}),
    User.deleteMany({}),
    Vehicle.deleteMany({}),
    Verification.deleteMany({}),
    Trip.deleteMany({})
  ]);

  await College.initializeDefaults();
  const college = await College.findOne({ domains: "univ.edu" });

  await User.create({
    name: "Campus Admin",
    email: "admin@univ.edu",
    phone: "9000000000",
    password: "password123",
    role: "admin",
    verificationStatus: "approved",
    emailVerified: true
  });

  const hostA = await makeVerifiedUser(
    {
      name: "Aarav Mehta",
      email: "aarav@univ.edu",
      phone: "9000000001",
      role: "host",
      hostel: "Block A"
    },
    college._id
  );
  const hostB = await makeVerifiedUser(
    {
      name: "Bhavna Rao",
      email: "bhavna@univ.edu",
      phone: "9000000002",
      role: "host",
      hostel: "Block C"
    },
    college._id
  );
  await makeVerifiedUser(
    {
      name: "Riya Sharma",
      email: "riya@univ.edu",
      phone: "9000000003",
      role: "student",
      hostel: "Block A"
    },
    college._id
  );
  await makeVerifiedUser(
    {
      name: "Sam Iyer",
      email: "sam@univ.edu",
      phone: "9000000004",
      role: "student",
      hostel: "Block B"
    },
    college._id
  );

  const vA = await Vehicle.create({
    owner: hostA._id,
    make: "Maruti",
    model: "Swift",
    color: "Red",
    plateNumber: "KA01AA1001",
    seats: 4,
    category: "car",
    verificationStatus: "approved"
  });
  const vB = await Vehicle.create({
    owner: hostB._id,
    make: "Hyundai",
    model: "i20",
    color: "White",
    plateNumber: "KA01BB2002",
    seats: 4,
    category: "car",
    verificationStatus: "approved"
  });

  await makeTrip(hostA, vA, PLACES.campus, PLACES.metro, 30, 40);
  await makeTrip(hostA, vA, PLACES.hostelA, PLACES.campus, 90, 20);
  await makeTrip(hostB, vB, PLACES.coaching, PLACES.airport, 180, 120);
  await makeTrip(hostB, vB, PLACES.campus, PLACES.coaching, 60, 35);

  const [users, vehicles, trips] = await Promise.all([
    User.countDocuments(),
    Vehicle.countDocuments(),
    Trip.countDocuments()
  ]);
  console.log(`Seed complete: ${users} users, ${vehicles} vehicles, ${trips} trips.`);
  console.log(
    "Demo logins (password: password123): admin@univ.edu, aarav@univ.edu (host), riya@univ.edu (student)"
  );

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
