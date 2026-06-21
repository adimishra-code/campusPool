import { agent, bearer, register } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

describe("Support tickets", () => {
  test("creates a ticket (incl. bug category) and lists it for the owner", async () => {
    const u = await register({ email: "helpme@univ.edu" });
    const token = u.body.token;

    const created = await agent().post("/api/support").set(...bearer(token))
      .send({ subject: "App crashed", message: "Tapped join and it froze", category: "bug" });
    expect(created.status).toBe(201);
    expect(created.body.ticket.category).toBe("bug");
    expect(created.body.ticket.priority).toBe("high"); // bugs default to high

    const list = await agent().get("/api/support").set(...bearer(token));
    expect(list.status).toBe(200);
    expect(list.body.tickets.length).toBe(1);
  });

  test("rejects a ticket with no subject/message", async () => {
    const u = await register({ email: "blank@univ.edu" });
    const res = await agent().post("/api/support").set(...bearer(u.body.token)).send({ category: "feedback" });
    expect(res.status).toBe(422);
  });

  test("requires auth to create a ticket", async () => {
    const res = await agent().post("/api/support").send({ subject: "x", message: "y" });
    expect(res.status).toBe(401);
  });
});

describe("Analytics tracking", () => {
  test("accepts an anonymous page-view event", async () => {
    const res = await agent().post("/api/analytics/track").send({ type: "page_view", path: "/login" });
    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
  });

  test("accepts an authenticated event and attributes the user", async () => {
    const u = await register({ email: "tracker@univ.edu" });
    const res = await agent().post("/api/analytics/track").set(...bearer(u.body.token))
      .send({ type: "trip_join", meta: { tripId: "abc" } });
    expect(res.status).toBe(202);
  });

  test("the overview endpoint stays admin-only", async () => {
    const u = await register({ email: "peeker@univ.edu" });
    const res = await agent().get("/api/analytics/overview").set(...bearer(u.body.token));
    expect(res.status).toBe(403);
  });
});
