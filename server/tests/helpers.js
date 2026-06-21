import request from "supertest";
import app from "../src/app.js";
import User from "../src/models/User.js";

export { app };
export const agent = () => request(app);
export const bearer = (token) => ["Authorization", `Bearer ${token}`];

const rnd = () => Math.random().toString(36).slice(2, 8);
const phone = () => String(9000000000 + Math.floor(Math.random() * 1e9));

export const COORDS = {
  campus: [77.5946, 12.9716],
  metro: [77.6408, 12.9784],
  coaching: [77.58, 12.955],
  airport: [77.7066, 13.1986]
};
export const loc = (address, c) => ({ address, coordinates: { type: "Point", coordinates: c } });
export const inMinutes = (mins) => new Date(Date.now() + mins * 60000).toISOString();

// Registers a user and — because login is now email-gated — completes the email
// verification step so callers receive a usable session token + user, exactly as
// before. Validation/duplicate errors (no previewOtp) pass straight through.
export async function register(overrides = {}) {
  const email = overrides.email || `u_${rnd()}@univ.edu`;
  const res = await request(app).post("/api/auth/register").send({
    name: "Test User",
    phone: phone(),
    password: "password123",
    role: "student",
    ...overrides,
    email
  });
  if (res.body?.needsEmailVerification && res.body?.previewOtp) {
    return request(app).post("/api/auth/verify-email").send({ email, otp: res.body.previewOtp });
  }
  return res;
}

export async function makeAdmin() {
  const email = `admin_${rnd()}@univ.edu`;
  await User.create({ name: "Admin", email, phone: phone(), password: "password123", role: "admin", verificationStatus: "approved", emailVerified: true });
  const res = await request(app).post("/api/auth/login").send({ email, password: "password123" });
  return res.body.token;
}

// A host with an admin-approved vehicle, ready to offer trips.
export async function makeVerifiedHost(adminToken, { hostel } = {}) {
  const reg = await register({ role: "host", hostel });
  const token = reg.body.token;
  const userId = reg.body.user.id;
  const v = await request(app).post("/api/vehicles").set(...bearer(token))
    .send({ make: "Maruti", model: "Swift", color: "Red", plateNumber: `KA${Math.floor(Math.random() * 1e8)}`, seats: 4, category: "car" });
  const vehicleId = v.body.vehicle._id;
  await request(app).patch(`/api/vehicles/admin/${vehicleId}/approve`).set(...bearer(adminToken)).send({});
  return { token, userId, vehicleId };
}

export async function offerTrip(hostToken, vehicleId, overrides = {}) {
  return request(app).post("/api/trips/offer").set(...bearer(hostToken)).send({
    pickup: loc("Main Campus Gate", COORDS.campus),
    destination: loc("Central Metro Station", COORDS.metro),
    departureTime: inMinutes(45),
    vehicleId,
    seats: 4,
    costPerPerson: 40,
    ...overrides
  });
}
