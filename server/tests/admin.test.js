import { agent, bearer, register, makeAdmin } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

describe("Admin routes", () => {
  test("dashboard returns campus KPIs for an admin", async () => {
    const adminToken = await makeAdmin();
    await register({ role: "student" });
    await register({ role: "host" });

    const res = await agent().get("/api/admin/dashboard").set(...bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("students");
    expect(res.body).toHaveProperty("hosts");
    expect(res.body).toHaveProperty("activeTrips");
    expect(res.body).toHaveProperty("pendingVerifications");
  });

  test("lists users and trips for an admin", async () => {
    const adminToken = await makeAdmin();
    await register({ email: "listed@univ.edu" });

    const users = await agent().get("/api/admin/users").set(...bearer(adminToken));
    expect(users.status).toBe(200);
    expect(Array.isArray(users.body.users)).toBe(true);
    expect(users.body.users.length).toBeGreaterThanOrEqual(1);

    const trips = await agent().get("/api/admin/trips").set(...bearer(adminToken));
    expect(trips.status).toBe(200);
    expect(Array.isArray(trips.body.trips)).toBe(true);
  });

  test("refund endpoint is reachable for an admin (no-op on unknown id)", async () => {
    const adminToken = await makeAdmin();
    const res = await agent()
      .post("/api/admin/payments/5f9f1b9b9b9b9b9b9b9b9b9b/refund")
      .set(...bearer(adminToken))
      .send({ amount: 50, reason: "test" });
    expect(res.status).toBe(200);
    expect(res.body.payment).toBeNull();
  });

  test("blocks non-admins (403) and anonymous callers (401)", async () => {
    const u = await register({ email: "nosy@univ.edu" });
    const forbidden = await agent().get("/api/admin/dashboard").set(...bearer(u.body.token));
    expect(forbidden.status).toBe(403);

    const anon = await agent().get("/api/admin/users");
    expect(anon.status).toBe(401);
  });
});
