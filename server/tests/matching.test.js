import { agent, bearer, register, makeAdmin, makeVerifiedHost, offerTrip, loc, inMinutes, COORDS } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

async function seedTwoTrips() {
  const adminToken = await makeAdmin();
  const hostA = await makeVerifiedHost(adminToken, { hostel: "Block A" });
  const hostB = await makeVerifiedHost(adminToken, { hostel: "Block Z" });
  const t1 = (await offerTrip(hostA.token, hostA.vehicleId, {
    pickup: loc("Main Campus Gate", COORDS.campus), destination: loc("Central Metro Station", COORDS.metro), departureTime: inMinutes(30)
  })).body.trip.id;
  const t2 = (await offerTrip(hostB.token, hostB.vehicleId, {
    pickup: loc("City Coaching Hub", COORDS.coaching), destination: loc("Airport", COORDS.airport), departureTime: inMinutes(300)
  })).body.trip.id;
  const student = await register({ email: "seeker@univ.edu", hostel: "Block A" });
  return { adminToken, student, t1, t2 };
}

describe("Matching", () => {
  test("search returns match scores sorted descending, best route/hostel/time first", async () => {
    const { student, t1 } = await seedTwoTrips();
    const res = await agent().get("/api/trips/find").set(...bearer(student.body.token))
      .query({ pickupLng: COORDS.campus[0], pickupLat: COORDS.campus[1], destLng: COORDS.metro[0], destLat: COORDS.metro[1] });
    expect(res.status).toBe(200);
    expect(res.body.trips.length).toBe(2);
    expect(res.body.trips.every((t) => typeof t.matchScore === "number")).toBe(true);
    expect(res.body.trips[0].matchScore).toBeGreaterThanOrEqual(res.body.trips[1].matchScore);
    expect(res.body.trips[0]._id).toBe(t1);
  });

  test("recommendations are scored and cached on the second call", async () => {
    const { student } = await seedTwoTrips();
    const first = await agent().get("/api/trips/recommendations").set(...bearer(student.body.token));
    expect(first.status).toBe(200);
    expect(first.body.cached).toBe(false);
    expect(first.body.recommendations[0]).toHaveProperty("breakdown");
    const second = await agent().get("/api/trips/recommendations").set(...bearer(student.body.token));
    expect(second.body.cached).toBe(true);
  });

  test("match-score endpoint returns a breakdown and host reliability", async () => {
    const { student, t1 } = await seedTwoTrips();
    const res = await agent().get(`/api/trips/match-score/${t1}`).set(...bearer(student.body.token))
      .query({ pickupLng: COORDS.campus[0], pickupLat: COORDS.campus[1], destLng: COORDS.metro[0], destLat: COORDS.metro[1] });
    expect(res.status).toBe(200);
    expect(typeof res.body.score).toBe("number");
    expect(res.body.breakdown).toHaveProperty("route");
    expect(typeof res.body.hostReliability).toBe("number");
  });

  test("trip detail exposes host reliability and the viewer's match", async () => {
    const { student, t1 } = await seedTwoTrips();
    const res = await agent().get(`/api/trips/${t1}`).set(...bearer(student.body.token));
    expect(res.body.match).toHaveProperty("score");
    expect(typeof res.body.trip.host.hostReliability).toBe("number");
  });
});
