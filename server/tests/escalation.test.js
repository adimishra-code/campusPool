import { agent, bearer, register, makeAdmin, makeVerifiedHost, offerTrip } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";
import { runArrivalEscalation } from "../src/services/escalation.service.js";
import Trip from "../src/models/Trip.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

async function startedTrip() {
  const adminToken = await makeAdmin();
  const host = await makeVerifiedHost(adminToken);
  await agent()
    .post("/api/users/me/emergency-contacts")
    .set(...bearer(host.token))
    .send({ name: "Mom", phone: "9876500000" });
  const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;
  const passenger = await register({ email: "esc-pax@univ.edu" });
  await agent()
    .post(`/api/trips/${trip}/join`)
    .set(...bearer(passenger.body.token))
    .send({});
  await agent()
    .post(`/api/trips/${trip}/approve/${passenger.body.user.id}`)
    .set(...bearer(host.token))
    .send({});
  await agent()
    .post(`/api/trips/${trip}/start`)
    .set(...bearer(host.token))
    .send({});
  return { host, passenger, trip };
}

// Far enough past any trip's expected arrival + grace window.
const FUTURE = new Date(Date.now() + 10 * 60 * 60 * 1000);

describe("Safe-arrival escalation", () => {
  test("escalates a started trip with no arrival confirmation and alerts participants", async () => {
    const { host, trip } = await startedTrip();

    const result = await runArrivalEscalation({ io: null, now: FUTURE });
    expect(result.escalated).toBe(1);

    const notes = await agent()
      .get("/api/notifications")
      .set(...bearer(host.token));
    expect(
      notes.body.notifications.some((n) => n.type === "sos" && /safe-arrival/i.test(n.title))
    ).toBe(true);

    const fresh = await Trip.findById(trip);
    expect(fresh.safety.arrivalEscalatedAt).toBeTruthy();
  });

  test("never escalates the same trip twice", async () => {
    await startedTrip();
    const first = await runArrivalEscalation({ io: null, now: FUTURE });
    expect(first.escalated).toBe(1);
    const second = await runArrivalEscalation({ io: null, now: FUTURE });
    expect(second.escalated).toBe(0);
  });

  test("does not escalate when arrival was confirmed", async () => {
    const { host, trip } = await startedTrip();
    await agent()
      .post(`/api/trips/${trip}/confirm-arrival`)
      .set(...bearer(host.token))
      .send({});
    const result = await runArrivalEscalation({ io: null, now: FUTURE });
    expect(result.escalated).toBe(0);
  });

  test("does not escalate before the expected arrival + grace window", async () => {
    await startedTrip();
    // 'now' = trip creation time; expected arrival is still in the future.
    const result = await runArrivalEscalation({ io: null, now: new Date() });
    expect(result.escalated).toBe(0);
  });
});
