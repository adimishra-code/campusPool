import { agent, bearer, register, makeAdmin, makeVerifiedHost, offerTrip } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

describe("Trips", () => {
  test("offer requires an approved vehicle", async () => {
    const reg = await register({ role: "host" });
    const v = await agent()
      .post("/api/vehicles")
      .set(...bearer(reg.body.token))
      .send({
        make: "Tata",
        model: "Tiago",
        color: "Blue",
        plateNumber: "KA99XX1",
        seats: 4,
        category: "car"
      });
    const res = await offerTrip(reg.body.token, v.body.vehicle._id);
    expect(res.status).toBe(400); // vehicle not yet verified
  });

  test("a verified host can offer a trip", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const res = await offerTrip(host.token, host.vehicleId);
    expect(res.status).toBe(201);
    expect(res.body.trip.id).toBeTruthy();
  });

  test("a student can join, host approves, and it appears in my-trips", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;
    const student = await register({ email: "joiner@univ.edu" });

    const join = await agent()
      .post(`/api/trips/${trip}/join`)
      .set(...bearer(student.body.token))
      .send({});
    expect(join.status).toBe(200);
    expect(join.body.status).toBe("pending");

    const approve = await agent()
      .post(`/api/trips/${trip}/approve/${student.body.user.id}`)
      .set(...bearer(host.token))
      .send({});
    expect(approve.status).toBe(200);

    const mine = await agent()
      .get("/api/users/me/trips")
      .set(...bearer(student.body.token));
    expect(mine.body.counts.joined).toBe(1);
  });

  test("LIFECYCLE: an offered trip can be started then completed (regression for the start bug)", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;

    const start = await agent()
      .post(`/api/trips/${trip}/start`)
      .set(...bearer(host.token))
      .send({});
    expect(start.status).toBe(200);
    expect(start.body.status).toBe("departed");

    const complete = await agent()
      .post(`/api/trips/${trip}/complete`)
      .set(...bearer(host.token))
      .send({});
    expect(complete.status).toBe(200);
  });

  test("duplicate join is a 400, not a 500 (domain error mapping)", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;
    const student = await register({ email: "dupjoin@univ.edu" });
    await agent()
      .post(`/api/trips/${trip}/join`)
      .set(...bearer(student.body.token))
      .send({});
    const again = await agent()
      .post(`/api/trips/${trip}/join`)
      .set(...bearer(student.body.token))
      .send({});
    expect(again.status).toBe(400);
  });

  test("I5: completing a trip that was never started is a 400", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;
    const complete = await agent()
      .post(`/api/trips/${trip}/complete`)
      .set(...bearer(host.token))
      .send({});
    expect(complete.status).toBe(400);
  });
});

describe("Trip status authorization (C1)", () => {
  test("a non-host, non-admin user cannot change trip status (403)", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;
    const outsider = await register({ email: "outsider@univ.edu" });

    const res = await agent()
      .patch(`/api/trips/${trip}/status`)
      .set(...bearer(outsider.body.token))
      .send({ status: "cancelled" });
    expect(res.status).toBe(403);

    // The trip is untouched.
    const after = await agent()
      .get(`/api/trips/${trip}`)
      .set(...bearer(host.token));
    expect(after.body.trip.status).toBe("offered");
  });

  test("an approved passenger still cannot change trip status (403)", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;
    const student = await register({ email: "passenger-status@univ.edu" });
    await agent()
      .post(`/api/trips/${trip}/join`)
      .set(...bearer(student.body.token))
      .send({});
    await agent()
      .post(`/api/trips/${trip}/approve/${student.body.user.id}`)
      .set(...bearer(host.token))
      .send({});

    const res = await agent()
      .patch(`/api/trips/${trip}/status`)
      .set(...bearer(student.body.token))
      .send({ status: "departed" });
    expect(res.status).toBe(403);
  });

  test("the host can apply a valid transition (offered -> departed)", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;

    const res = await agent()
      .patch(`/api/trips/${trip}/status`)
      .set(...bearer(host.token))
      .send({ status: "departed" });
    expect(res.status).toBe(200);
    expect(res.body.trip.status).toBe("departed");
  });

  test("an invalid transition is rejected (offered -> completed = 400)", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;

    const res = await agent()
      .patch(`/api/trips/${trip}/status`)
      .set(...bearer(host.token))
      .send({ status: "completed" });
    expect(res.status).toBe(400);
  });

  test("an admin can change trip status", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;

    const res = await agent()
      .patch(`/api/trips/${trip}/status`)
      .set(...bearer(adminToken))
      .send({ status: "cancelled" });
    expect(res.status).toBe(200);
    expect(res.body.trip.status).toBe("cancelled");
  });

  test("an unknown status value is rejected by validation (422)", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;

    const res = await agent()
      .patch(`/api/trips/${trip}/status`)
      .set(...bearer(host.token))
      .send({ status: "teleported" });
    expect(res.status).toBe(422);
  });
});

describe("Trip PII gating (I7)", () => {
  test("a non-participant does not receive the host phone or passenger roster", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;
    const joiner = await register({ email: "roster-member@univ.edu" });
    await agent()
      .post(`/api/trips/${trip}/join`)
      .set(...bearer(joiner.body.token))
      .send({});
    await agent()
      .post(`/api/trips/${trip}/approve/${joiner.body.user.id}`)
      .set(...bearer(host.token))
      .send({});

    const outsider = await register({ email: "nosy@univ.edu" });
    const res = await agent()
      .get(`/api/trips/${trip}`)
      .set(...bearer(outsider.body.token));
    expect(res.status).toBe(200);
    expect(res.body.trip.host.phone).toBeUndefined();
    expect(res.body.trip.passengers).toEqual([]);
  });

  test("the host sees their own phone and the passenger roster", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;
    const joiner = await register({ email: "visible-member@univ.edu" });
    await agent()
      .post(`/api/trips/${trip}/join`)
      .set(...bearer(joiner.body.token))
      .send({});
    await agent()
      .post(`/api/trips/${trip}/approve/${joiner.body.user.id}`)
      .set(...bearer(host.token))
      .send({});

    const res = await agent()
      .get(`/api/trips/${trip}`)
      .set(...bearer(host.token));
    expect(res.status).toBe(200);
    expect(res.body.trip.host.phone).toBeTruthy();
    expect(res.body.trip.passengers.length).toBe(1);
  });
});
