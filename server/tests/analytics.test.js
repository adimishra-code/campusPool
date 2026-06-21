import { agent, bearer, register, makeAdmin } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

describe("Analytics admin dashboards", () => {
  test("overview and safety return data for an admin", async () => {
    const adminToken = await makeAdmin();

    const overview = await agent().get("/api/analytics/overview").set(...bearer(adminToken));
    expect(overview.status).toBe(200);
    expect(overview.body).toBeInstanceOf(Object);

    const safety = await agent().get("/api/analytics/safety").set(...bearer(adminToken));
    expect(safety.status).toBe(200);
    expect(safety.body).toBeInstanceOf(Object);
  });

  test("safety overview is admin-only (403) and requires auth (401)", async () => {
    const u = await register({ email: "snoop@univ.edu" });
    const forbidden = await agent().get("/api/analytics/safety").set(...bearer(u.body.token));
    expect(forbidden.status).toBe(403);

    const anon = await agent().get("/api/analytics/overview");
    expect(anon.status).toBe(401);
  });

  test("track ingests an anonymous event without auth", async () => {
    const res = await agent().post("/api/analytics/track").send({ type: "page_view", path: "/feed" });
    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
  });
});
