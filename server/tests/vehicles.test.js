import { agent, bearer, register, makeAdmin } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

const sampleVehicle = (over = {}) => ({
  make: "Honda",
  model: "City",
  color: "White",
  plateNumber: `KA${Math.floor(Math.random() * 1e8)}`,
  seats: 4,
  category: "car",
  ...over
});

describe("Vehicles (owner)", () => {
  test("registers a vehicle and lists it for the owner", async () => {
    const u = await register({ role: "host", email: "owner@univ.edu" });
    const token = u.body.token;

    const created = await agent()
      .post("/api/vehicles")
      .set(...bearer(token))
      .send(sampleVehicle());
    expect(created.status).toBe(201);
    expect(created.body.vehicle.verificationStatus).toBe("unverified");

    const mine = await agent()
      .get("/api/vehicles")
      .set(...bearer(token));
    expect(mine.status).toBe(200);
    expect(mine.body.vehicles.length).toBe(1);
  });

  test("rejects an invalid vehicle body (422) and requires auth (401)", async () => {
    const u = await register({ role: "host", email: "owner2@univ.edu" });
    const bad = await agent()
      .post("/api/vehicles")
      .set(...bearer(u.body.token))
      .send({ make: "" });
    expect(bad.status).toBe(422);

    const anon = await agent().post("/api/vehicles").send(sampleVehicle());
    expect(anon.status).toBe(401);
  });
});

describe("Vehicles (admin)", () => {
  test("an admin can list, approve and reject vehicles", async () => {
    const adminToken = await makeAdmin();
    const owner = await register({ role: "host", email: "owner3@univ.edu" });
    const v = await agent()
      .post("/api/vehicles")
      .set(...bearer(owner.body.token))
      .send(sampleVehicle());
    const vehicleId = v.body.vehicle._id;

    const list = await agent()
      .get("/api/vehicles/admin/all")
      .set(...bearer(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);

    const approve = await agent()
      .patch(`/api/vehicles/admin/${vehicleId}/approve`)
      .set(...bearer(adminToken))
      .send({});
    expect(approve.status).toBe(200);
    expect(approve.body.vehicle.verificationStatus).toBe("approved");

    const reject = await agent()
      .patch(`/api/vehicles/admin/${vehicleId}/reject`)
      .set(...bearer(adminToken))
      .send({ reason: "blurry docs" });
    expect(reject.status).toBe(200);
    expect(reject.body.vehicle.verificationStatus).toBe("rejected");
  });

  test("admin vehicle routes reject non-admins (403)", async () => {
    const u = await register({ email: "notadmin@univ.edu" });
    const res = await agent()
      .get("/api/vehicles/admin/all")
      .set(...bearer(u.body.token));
    expect(res.status).toBe(403);
  });
});
