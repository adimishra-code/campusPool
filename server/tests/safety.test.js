import jwt from "jsonwebtoken";
import { agent, bearer, register, makeAdmin, makeVerifiedHost, offerTrip } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";
import { env } from "../src/config/env.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

async function tripWithApprovedPassenger() {
  const adminToken = await makeAdmin();
  const host = await makeVerifiedHost(adminToken);
  const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;
  const passenger = await register({ email: "pax@univ.edu" });
  await agent().post(`/api/trips/${trip}/join`).set(...bearer(passenger.body.token)).send({});
  await agent().post(`/api/trips/${trip}/approve/${passenger.body.user.id}`).set(...bearer(host.token)).send({});
  return { adminToken, host, passenger, trip };
}

describe("Safety / SOS", () => {
  test("a participant can raise an SOS, alerting co-travellers", async () => {
    const { host, passenger, trip } = await tripWithApprovedPassenger();
    const res = await agent().post(`/api/trips/${trip}/sos`).set(...bearer(passenger.body.token)).send({ location: [77.59, 12.97] });
    expect(res.status).toBe(201);
    expect(res.body.sos.notifiedParticipants).toBe(1); // the host

    // host receives an in-app SOS notification
    const notes = await agent().get("/api/notifications").set(...bearer(host.token));
    expect(notes.body.notifications.some((n) => n.type === "sos")).toBe(true);
  });

  test("a non-participant cannot raise an SOS for the trip (403)", async () => {
    const { trip } = await tripWithApprovedPassenger();
    const outsider = await register({ email: "outsider@univ.edu" });
    const res = await agent().post(`/api/trips/${trip}/sos`).set(...bearer(outsider.body.token)).send({});
    expect(res.status).toBe(403);
  });

  test("emergency contacts are recorded on the SOS", async () => {
    const { host, trip } = await tripWithApprovedPassenger();
    await agent().post("/api/users/me/emergency-contacts").set(...bearer(host.token)).send({ name: "Mom", phone: "9876500000", relationship: "Parent" });
    const res = await agent().post(`/api/trips/${trip}/sos`).set(...bearer(host.token)).send({});
    expect(res.status).toBe(201);
    expect(res.body.sos.notifiedContacts).toBe(1);
  });

  test("admin can list and resolve active SOS events", async () => {
    const { adminToken, passenger, trip } = await tripWithApprovedPassenger();
    const sos = await agent().post(`/api/trips/${trip}/sos`).set(...bearer(passenger.body.token)).send({});
    const sosId = sos.body.sos.id;

    const active = await agent().get("/api/safety/sos/active").set(...bearer(adminToken));
    expect(active.status).toBe(200);
    expect(active.body.events.length).toBe(1);

    const resolve = await agent().post(`/api/safety/sos/${sosId}/resolve`).set(...bearer(adminToken)).send({});
    expect(resolve.status).toBe(200);
    expect(resolve.body.sos.status).toBe("resolved");

    const afterResolve = await agent().get("/api/safety/sos/active").set(...bearer(adminToken));
    expect(afterResolve.body.events.length).toBe(0);
  });

  test("a non-admin, non-owner cannot resolve someone else's SOS (403)", async () => {
    const { host, passenger, trip } = await tripWithApprovedPassenger();
    const sos = await agent().post(`/api/trips/${trip}/sos`).set(...bearer(passenger.body.token)).send({});
    const res = await agent().post(`/api/safety/sos/${sos.body.sos.id}/resolve`).set(...bearer(host.token)).send({});
    expect(res.status).toBe(403);
  });
});

describe("Check-ins & safe arrival", () => {
  test("a participant can check in and confirm safe arrival", async () => {
    const { passenger, trip } = await tripWithApprovedPassenger();

    const ci = await agent().post(`/api/trips/${trip}/check-in`).set(...bearer(passenger.body.token)).send({ location: [77.6, 12.97] });
    expect(ci.status).toBe(201);
    expect(ci.body.checkInCount).toBe(1);

    const arr = await agent().post(`/api/trips/${trip}/confirm-arrival`).set(...bearer(passenger.body.token)).send({});
    expect(arr.status).toBe(200);
    expect(arr.body.arrivalConfirmedAt).toBeTruthy();
  });

  test("a non-participant cannot check in (403)", async () => {
    const { trip } = await tripWithApprovedPassenger();
    const outsider = await register({ email: "ci-outsider@univ.edu" });
    const res = await agent().post(`/api/trips/${trip}/check-in`).set(...bearer(outsider.body.token)).send({});
    expect(res.status).toBe(403);
  });
});

describe("External trip sharing", () => {
  test("a participant mints a share link that resolves to a sanitized public view", async () => {
    const { host, trip } = await tripWithApprovedPassenger();
    const share = await agent().post(`/api/trips/${trip}/share`).set(...bearer(host.token)).send({});
    expect(share.status).toBe(201);
    expect(share.body.token).toBeTruthy();

    const view = await agent().get(`/api/safety/share/${share.body.token}`);
    expect(view.status).toBe(200);
    expect(view.body.trip.pickup).toBeTruthy();
    expect(view.body.trip).not.toHaveProperty("passengers");
  });

  test("an invalid share token is rejected", async () => {
    const res = await agent().get("/api/safety/share/not-a-real-token");
    expect(res.status).toBe(401);
  });

  test("an expired share token is rejected", async () => {
    const { trip } = await tripWithApprovedPassenger();
    const expired = jwt.sign({ tripId: trip, kind: "trip_share" }, env.jwtSecret, { expiresIn: "-1s" });
    const res = await agent().get(`/api/safety/share/${expired}`);
    expect(res.status).toBe(401);
  });
});

describe("User reporting & safety score", () => {
  test("a user can report another, admin can resolve, and the safety score drops", async () => {
    const { adminToken, host, passenger } = await tripWithApprovedPassenger();
    const hostId = host.userId;

    const filed = await agent().post("/api/safety/reports").set(...bearer(passenger.body.token))
      .send({ reportedUser: hostId, category: "unsafe_driving", description: "Drove far too fast." });
    expect(filed.status).toBe(201);

    // Pending report nudges the score below the 100 baseline.
    const afterFile = await agent().get(`/api/users/${hostId}/trust`);
    expect(afterFile.body.safetyScore).toBeLessThan(100);

    const reportId = filed.body.report.id;
    const list = await agent().get("/api/safety/reports").set(...bearer(adminToken));
    expect(list.body.reports.length).toBe(1);

    const resolve = await agent().post(`/api/safety/reports/${reportId}/resolve`).set(...bearer(adminToken))
      .send({ status: "actioned", resolution: "Warning issued." });
    expect(resolve.status).toBe(200);

    // An actioned report penalises the score more than a pending one.
    const afterAction = await agent().get(`/api/users/${hostId}/trust`);
    expect(afterAction.body.safetyScore).toBeLessThanOrEqual(80);
  });

  test("you cannot report yourself (400)", async () => {
    const me = await register({ email: "self-report@univ.edu" });
    const res = await agent().post("/api/safety/reports").set(...bearer(me.body.token))
      .send({ reportedUser: me.body.user.id, category: "other", description: "n/a placeholder" });
    expect(res.status).toBe(400);
  });

  test("a non-admin cannot list the reports queue (403)", async () => {
    const u = await register({ email: "nosy@univ.edu" });
    const res = await agent().get("/api/safety/reports").set(...bearer(u.body.token));
    expect(res.status).toBe(403);
  });
});
