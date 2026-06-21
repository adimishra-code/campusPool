import { agent, bearer, register, makeAdmin } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

describe("Colleges", () => {
  test("lists active colleges publicly (seeded defaults)", async () => {
    const res = await agent().get("/api/colleges");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.colleges)).toBe(true);
    expect(res.body.colleges.length).toBeGreaterThanOrEqual(1);
  });

  test("an admin can create a college", async () => {
    const adminToken = await makeAdmin();
    const res = await agent()
      .post("/api/colleges")
      .set(...bearer(adminToken))
      .send({ name: "Test Institute of Tech", domains: ["tit.edu"] });
    expect(res.status).toBe(201);
    expect(res.body.college.name).toBe("Test Institute of Tech");
  });

  test("rejects an invalid college body (422)", async () => {
    const adminToken = await makeAdmin();
    const res = await agent()
      .post("/api/colleges")
      .set(...bearer(adminToken))
      .send({ name: "No Domains College" }); // domains required
    expect(res.status).toBe(422);
  });

  test("creation is admin-only (403) and requires auth (401)", async () => {
    const u = await register({ email: "wannabe@univ.edu" });
    const forbidden = await agent()
      .post("/api/colleges")
      .set(...bearer(u.body.token))
      .send({ name: "X", domains: ["x.edu"] });
    expect(forbidden.status).toBe(403);

    const anon = await agent()
      .post("/api/colleges")
      .send({ name: "X", domains: ["x.edu"] });
    expect(anon.status).toBe(401);
  });
});
