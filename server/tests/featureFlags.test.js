import { agent, bearer, register, makeAdmin } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

describe("Feature flags", () => {
  test("initializes defaults and lists flags publicly", async () => {
    const init = await agent().get("/api/features/init");
    expect(init.status).toBe(200);
    expect(init.body.count).toBeGreaterThanOrEqual(1);

    const all = await agent().get("/api/features");
    expect(all.status).toBe(200);
    expect(all.body.flags).toBeInstanceOf(Object);
  });

  test("check returns a boolean for any key; unknown getFlag is 404", async () => {
    const check = await agent().get("/api/features/some_feature/check");
    expect(check.status).toBe(200);
    expect(typeof check.body.enabled).toBe("boolean");

    const missing = await agent().get("/api/features/definitely_not_a_flag");
    expect(missing.status).toBe(404);
  });

  test("an admin can toggle a flag on", async () => {
    const adminToken = await makeAdmin();
    const res = await agent()
      .patch("/api/features/new_experiment")
      .set(...bearer(adminToken))
      .send({ enabled: true, percentage: 50 });
    expect(res.status).toBe(200);
    expect(res.body.flag.enabled).toBe(true);
    expect(res.body.flag.key).toBe("new_experiment");
  });

  test("toggling is admin-only (403) and requires auth (401)", async () => {
    const u = await register({ email: "flagger@univ.edu" });
    const forbidden = await agent()
      .patch("/api/features/x")
      .set(...bearer(u.body.token))
      .send({ enabled: true });
    expect(forbidden.status).toBe(403);

    const anon = await agent().patch("/api/features/x").send({ enabled: true });
    expect(anon.status).toBe(401);
  });
});
