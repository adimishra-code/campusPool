import { agent, bearer, register } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

describe("Notifications", () => {
  test("lists notifications for the signed-in user (empty by default)", async () => {
    const u = await register({ email: "notif@univ.edu" });
    const res = await agent()
      .get("/api/notifications")
      .set(...bearer(u.body.token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.notifications)).toBe(true);
    expect(res.body.notifications.length).toBe(0);
  });

  test("mark-all-read and mark-one-read succeed", async () => {
    const u = await register({ email: "notif2@univ.edu" });

    const all = await agent()
      .patch("/api/notifications/read-all")
      .set(...bearer(u.body.token));
    expect(all.status).toBe(200);

    const one = await agent()
      .patch("/api/notifications/5f9f1b9b9b9b9b9b9b9b9b9b/read")
      .set(...bearer(u.body.token));
    expect(one.status).toBe(200);
    expect(one.body.notification).toBeNull(); // not found / not owned -> no-op
  });

  test("requires authentication", async () => {
    const res = await agent().get("/api/notifications");
    expect(res.status).toBe(401);
  });
});
