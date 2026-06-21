import { agent, bearer, register, makeAdmin } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

describe("User profile", () => {
  test("returns and updates the signed-in profile", async () => {
    const u = await register({ email: "me@univ.edu" });
    const token = u.body.token;

    // /users/me serves the public projection of the signed-in user (email is
    // intentionally omitted here — full self profile lives at /auth/me).
    const me = await agent().get("/api/users/me").set(...bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.user).toBeTruthy();
    expect(me.body.user.role).toBe("student");

    const updated = await agent().patch("/api/users/me").set(...bearer(token)).send({ hostel: "Block C" });
    expect(updated.status).toBe(200);
    expect(updated.body.user.hostel).toBe("Block C");
  });

  test("exposes a public profile and 404s for an unknown id", async () => {
    const u = await register({ email: "pub@univ.edu" });
    const pub = await agent().get(`/api/users/${u.body.user.id}`).set(...bearer(u.body.token));
    expect(pub.status).toBe(200);
    expect(pub.body.user.name).toBeDefined();
    expect(pub.body.user.password).toBeUndefined();

    const missing = await agent().get("/api/users/5f9f1b9b9b9b9b9b9b9b9b9b").set(...bearer(u.body.token));
    expect(missing.status).toBe(404);
  });
});

describe("User admin routes", () => {
  test("an admin can list and update users", async () => {
    const adminToken = await makeAdmin();
    const target = await register({ email: "target@univ.edu" });

    const list = await agent().get("/api/users/admin/all").set(...bearer(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);

    const update = await agent().patch(`/api/users/admin/${target.body.user.id}`).set(...bearer(adminToken))
      .send({ verificationStatus: "approved" });
    expect(update.status).toBe(200);
    expect(update.body.user.verificationStatus).toBe("approved");
  });

  test("admin routes reject non-admins (403) and anonymous callers (401)", async () => {
    const u = await register({ email: "plebe@univ.edu" });
    const forbidden = await agent().get("/api/users/admin/all").set(...bearer(u.body.token));
    expect(forbidden.status).toBe(403);

    const anon = await agent().get("/api/users/admin/all");
    expect(anon.status).toBe(401);
  });
});
