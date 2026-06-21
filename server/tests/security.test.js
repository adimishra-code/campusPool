// NoSQL (MongoDB operator) injection tests.
// This stack uses MongoDB, not SQL, so "SQL injection" does not apply — the
// equivalent threat is query-operator injection, covered here.
import { agent, bearer, register } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";
import { mongoSanitize } from "../src/middleware/sanitize.middleware.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

describe("Sanitizer (unit)", () => {
  test("strips $-prefixed and dotted keys from body/query/params, keeps normal keys", () => {
    const req = {
      body: { email: { $gt: "" }, name: "Riya", nested: { $ne: null, ok: 1 }, "a.b": 2 },
      query: { role: { $ne: "admin" } },
      params: { id: "abc" }
    };
    mongoSanitize(req, {}, () => {});
    expect(req.body.email).toEqual({}); // $gt removed
    expect(req.body.name).toBe("Riya"); // scalar kept
    expect(req.body.nested).toEqual({ ok: 1 }); // $ne removed, ok kept
    expect(req.body["a.b"]).toBeUndefined(); // dotted key removed
    expect(req.query.role).toEqual({}); // operator stripped
    expect(req.params.id).toBe("abc");
  });
});

describe("Auth is not bypassable via operator injection", () => {
  test("login with operator objects returns no token", async () => {
    await register({ email: "victim@univ.edu", password: "password123" });
    const res = await agent()
      .post("/api/auth/login")
      .send({ email: { $gt: "" }, password: { $gt: "" } });
    expect(res.status).not.toBe(200);
    expect(res.body.token).toBeFalsy();
  });

  test("login with operator password against a known email fails", async () => {
    await register({ email: "real@univ.edu", password: "password123" });
    const res = await agent()
      .post("/api/auth/login")
      .send({ email: "real@univ.edu", password: { $ne: "x" } });
    expect(res.status).not.toBe(200);
    expect(res.body.token).toBeFalsy();
  });

  test("operator payloads never cause a 5xx (resilience)", async () => {
    const r1 = await agent()
      .post("/api/auth/login")
      .send({ email: { $gt: "" }, password: { $gt: "" } });
    const r2 = await agent()
      .post("/api/auth/register")
      .send({ name: { $gt: "" }, email: { $gt: "" }, phone: { $gt: "" }, password: { $gt: "" } });
    expect(r1.status).toBeLessThan(500);
    expect(r2.status).toBeLessThan(500);
  });
});

describe("Operators cannot reach Mongo through the API", () => {
  test("an injected operator field is not persisted as an operator", async () => {
    const reg = await register({ email: "prof@univ.edu" });
    const token = reg.body.token;
    // Attempt to set hostel to a query operator object.
    await agent()
      .patch("/api/users/me")
      .set(...bearer(token))
      .send({ hostel: { $gt: "" } });
    const me = await agent()
      .get("/api/auth/me")
      .set(...bearer(token));
    expect(me.status).toBe(200);
    // hostel must never be persisted as an object/operator.
    expect(typeof me.body.user.hostel === "object").toBe(false);
  });

  test("operator in a search query does not leak or error", async () => {
    const reg = await register({ email: "searcher@univ.edu" });
    // attacker-style operator query params on the ranked search route
    const res = await agent()
      .get("/api/trips/find?seatsAvailable[$gt]=0&host[$ne]=x")
      .set(...bearer(reg.body.token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.trips)).toBe(true);
  });
});
