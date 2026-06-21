import { agent, bearer, register, makeAdmin, makeVerifiedHost, offerTrip } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

// Create a completed trip with one approved-then-completed passenger.
async function completedTripWithPassenger() {
  const adminToken = await makeAdmin();
  const host = await makeVerifiedHost(adminToken);
  const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;
  const student = await register({ email: "rater@univ.edu" });
  await agent().post(`/api/trips/${trip}/join`).set(...bearer(student.body.token)).send({});
  await agent().post(`/api/trips/${trip}/approve/${student.body.user.id}`).set(...bearer(host.token)).send({});
  await agent().post(`/api/trips/${trip}/complete`).set(...bearer(host.token)).send({});
  return { host, student, trip };
}

describe("Ratings", () => {
  test("host and passenger can rate each other on a completed trip", async () => {
    const { host, student, trip } = await completedTripWithPassenger();
    const hostRates = await agent().post("/api/ratings").set(...bearer(host.token)).send({ trip, toUser: student.body.user.id, score: 5, review: "Great" });
    expect(hostRates.status).toBe(201);
    expect(hostRates.body.rating.role).toBe("passenger");

    const passRates = await agent().post("/api/ratings").set(...bearer(student.body.token)).send({ trip, toUser: host.userId, score: 4 });
    expect(passRates.status).toBe(201);
    expect(passRates.body.rating.role).toBe("host");
  });

  test("a duplicate rating is rejected with 409", async () => {
    const { host, student, trip } = await completedTripWithPassenger();
    await agent().post("/api/ratings").set(...bearer(host.token)).send({ trip, toUser: student.body.user.id, score: 5 });
    const dup = await agent().post("/api/ratings").set(...bearer(host.token)).send({ trip, toUser: student.body.user.id, score: 3 });
    expect(dup.status).toBe(409);
  });

  test("you cannot rate yourself", async () => {
    const { host, trip } = await completedTripWithPassenger();
    const res = await agent().post("/api/ratings").set(...bearer(host.token)).send({ trip, toUser: host.userId, score: 5 });
    expect(res.status).toBe(400);
  });

  test("a non-participant cannot rate", async () => {
    const { student, trip } = await completedTripWithPassenger();
    const outsider = await register({ email: "outsider@univ.edu" });
    const res = await agent().post("/api/ratings").set(...bearer(outsider.body.token)).send({ trip, toUser: student.body.user.id, score: 2 });
    expect(res.status).toBe(403);
  });
});
