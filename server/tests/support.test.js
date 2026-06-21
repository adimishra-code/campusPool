import { agent, bearer, register, makeAdmin } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

describe("Support tickets", () => {
  test("creates a ticket (incl. bug category) and lists it for the owner", async () => {
    const u = await register({ email: "helpme@univ.edu" });
    const token = u.body.token;

    const created = await agent()
      .post("/api/support")
      .set(...bearer(token))
      .send({ subject: "App crashed", message: "Tapped join and it froze", category: "bug" });
    expect(created.status).toBe(201);
    expect(created.body.ticket.category).toBe("bug");
    expect(created.body.ticket.priority).toBe("high"); // bugs default to high

    const list = await agent()
      .get("/api/support")
      .set(...bearer(token));
    expect(list.status).toBe(200);
    expect(list.body.tickets.length).toBe(1);
  });

  test("rejects a ticket with no subject/message", async () => {
    const u = await register({ email: "blank@univ.edu" });
    const res = await agent()
      .post("/api/support")
      .set(...bearer(u.body.token))
      .send({ category: "feedback" });
    expect(res.status).toBe(422);
  });

  test("requires auth to create a ticket", async () => {
    const res = await agent().post("/api/support").send({ subject: "x", message: "y" });
    expect(res.status).toBe(401);
  });

  test("I2: a user cannot reply to someone else's ticket (403)", async () => {
    const owner = await register({ email: "owner@univ.edu" });
    const created = await agent()
      .post("/api/support")
      .set(...bearer(owner.body.token))
      .send({ subject: "Mine", message: "Only I should touch this" });
    const ticketId = created.body.ticket._id || created.body.ticket.id;

    const attacker = await register({ email: "attacker@univ.edu" });
    const res = await agent()
      .post(`/api/support/${ticketId}/replies`)
      .set(...bearer(attacker.body.token))
      .send({ message: "injected", status: "resolved" });
    expect(res.status).toBe(403);
  });

  test("I2: the ticket owner can reply to their own ticket", async () => {
    const owner = await register({ email: "owner2@univ.edu" });
    const created = await agent()
      .post("/api/support")
      .set(...bearer(owner.body.token))
      .send({ subject: "Mine", message: "Following up" });
    const ticketId = created.body.ticket._id || created.body.ticket.id;

    const res = await agent()
      .post(`/api/support/${ticketId}/replies`)
      .set(...bearer(owner.body.token))
      .send({ message: "any updates?" });
    expect(res.status).toBe(200);
    expect(res.body.ticket.replies.length).toBe(1);
  });

  test("I2: an admin can reply to any ticket and change its status", async () => {
    const owner = await register({ email: "owner3@univ.edu" });
    const created = await agent()
      .post("/api/support")
      .set(...bearer(owner.body.token))
      .send({ subject: "Help", message: "stuck" });
    const ticketId = created.body.ticket._id || created.body.ticket.id;

    const adminToken = await makeAdmin();
    const res = await agent()
      .post(`/api/support/${ticketId}/replies`)
      .set(...bearer(adminToken))
      .send({ message: "looking into it", status: "resolved" });
    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe("resolved");
  });
});

describe("Analytics tracking", () => {
  test("accepts an anonymous page-view event", async () => {
    const res = await agent()
      .post("/api/analytics/track")
      .send({ type: "page_view", path: "/login" });
    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
  });

  test("accepts an authenticated event and attributes the user", async () => {
    const u = await register({ email: "tracker@univ.edu" });
    const res = await agent()
      .post("/api/analytics/track")
      .set(...bearer(u.body.token))
      .send({ type: "trip_join", meta: { tripId: "abc" } });
    expect(res.status).toBe(202);
  });

  test("the overview endpoint stays admin-only", async () => {
    const u = await register({ email: "peeker@univ.edu" });
    const res = await agent()
      .get("/api/analytics/overview")
      .set(...bearer(u.body.token));
    expect(res.status).toBe(403);
  });
});
