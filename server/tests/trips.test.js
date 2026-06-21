import { agent, bearer, register, makeAdmin, makeVerifiedHost, offerTrip } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

describe("Trips", () => {
  test("offer requires an approved vehicle", async () => {
    const reg = await register({ role: "host" });
    const v = await agent().post("/api/vehicles").set(...bearer(reg.body.token))
      .send({ make: "Tata", model: "Tiago", color: "Blue", plateNumber: "KA99XX1", seats: 4, category: "car" });
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

    const join = await agent().post(`/api/trips/${trip}/join`).set(...bearer(student.body.token)).send({});
    expect(join.status).toBe(200);
    expect(join.body.status).toBe("pending");

    const approve = await agent().post(`/api/trips/${trip}/approve/${student.body.user.id}`).set(...bearer(host.token)).send({});
    expect(approve.status).toBe(200);

    const mine = await agent().get("/api/users/me/trips").set(...bearer(student.body.token));
    expect(mine.body.counts.joined).toBe(1);
  });

  test("LIFECYCLE: an offered trip can be started then completed (regression for the start bug)", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;

    const start = await agent().post(`/api/trips/${trip}/start`).set(...bearer(host.token)).send({});
    expect(start.status).toBe(200);
    expect(start.body.status).toBe("departed");

    const complete = await agent().post(`/api/trips/${trip}/complete`).set(...bearer(host.token)).send({});
    expect(complete.status).toBe(200);
  });

  test("duplicate join is a 400, not a 500 (domain error mapping)", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;
    const student = await register({ email: "dupjoin@univ.edu" });
    await agent().post(`/api/trips/${trip}/join`).set(...bearer(student.body.token)).send({});
    const again = await agent().post(`/api/trips/${trip}/join`).set(...bearer(student.body.token)).send({});
    expect(again.status).toBe(400);
  });
});
