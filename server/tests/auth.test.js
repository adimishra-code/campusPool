import { agent, bearer, register } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

const reg = (email, extra = {}) => agent().post("/api/auth/register").send({
  name: "Test User", email, phone: String(9100000000 + Math.floor(Math.random() * 1e8)),
  password: "password123", role: "student", ...extra
});

describe("Registration", () => {
  test("registers a student but does NOT issue a token until email is verified", async () => {
    const res = await reg("riya@univ.edu");
    expect(res.status).toBe(201);
    expect(res.body.needsEmailVerification).toBe(true);
    expect(res.body.token).toBeFalsy();
    expect(res.body.previewOtp).toBeTruthy(); // dev preview (SMTP not configured under test)
    expect(res.body.user.role).toBe("student");
  });

  test("associates a college by email domain", async () => {
    const res = await reg("riya@univ.edu");
    expect(res.body.user.college?.name).toBe("Demo University");
  });

  test("blocks admin self-registration", async () => {
    const res = await reg("hacker@univ.edu", { role: "admin" });
    expect(res.status).toBe(422);
  });

  test("rejects duplicate email", async () => {
    await reg("dup@univ.edu");
    const res = await reg("dup@univ.edu");
    expect(res.status).toBe(400);
  });
});

describe("Email verification gate", () => {
  test("login is blocked until the email is verified, then succeeds", async () => {
    const r = await reg("gate@univ.edu");
    // Before verification: login is rejected with a needsEmailVerification hint.
    const blocked = await agent().post("/api/auth/login").send({ email: "gate@univ.edu", password: "password123" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.needsEmailVerification).toBe(true);
    // The blocked login re-issues a fresh code, so use that one.
    const code = blocked.body.previewOtp || r.body.previewOtp;

    // Verify with the wrong code → 400.
    const wrong = await agent().post("/api/auth/verify-email").send({ email: "gate@univ.edu", otp: "000000" });
    expect(wrong.status).toBe(400);

    // Verify with the right code → token issued.
    const verified = await agent().post("/api/auth/verify-email").send({ email: "gate@univ.edu", otp: code });
    expect(verified.status).toBe(200);
    expect(verified.body.token).toBeTruthy();

    // Now login works.
    const ok = await agent().post("/api/auth/login").send({ email: "gate@univ.edu", password: "password123" });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
  });
});

describe("Login", () => {
  test("rejects a bad password and locks the account after repeated failures", async () => {
    await register({ email: "login@univ.edu" }); // helper auto-verifies email

    const bad = await agent().post("/api/auth/login").send({ email: "login@univ.edu", password: "nope" });
    expect(bad.status).toBe(401);

    // 4 more wrong attempts (5 total) trips the lockout.
    let last;
    for (let i = 0; i < 4; i++) {
      last = await agent().post("/api/auth/login").send({ email: "login@univ.edu", password: "nope" });
    }
    expect(last.status).toBe(423); // locked

    // Even the correct password is refused while locked.
    const locked = await agent().post("/api/auth/login").send({ email: "login@univ.edu", password: "password123" });
    expect(locked.status).toBe(423);
  });
});

describe("Password reset", () => {
  test("forgot → reset → login with the new password", async () => {
    await register({ email: "reset@univ.edu" });

    const forgot = await agent().post("/api/auth/forgot-password").send({ email: "reset@univ.edu" });
    expect(forgot.status).toBe(200);
    expect(forgot.body.previewToken).toBeTruthy(); // dev echo

    const reset = await agent().post("/api/auth/reset-password")
      .send({ email: "reset@univ.edu", token: forgot.body.previewToken, password: "newpassword123" });
    expect(reset.status).toBe(200);

    const ok = await agent().post("/api/auth/login").send({ email: "reset@univ.edu", password: "newpassword123" });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
  });

  test("forgot-password does not reveal whether an account exists", async () => {
    const res = await agent().post("/api/auth/forgot-password").send({ email: "ghost@univ.edu" });
    expect(res.status).toBe(200);
  });

  test("rejects an invalid reset token", async () => {
    await register({ email: "badtoken@univ.edu" });
    const res = await agent().post("/api/auth/reset-password")
      .send({ email: "badtoken@univ.edu", token: "deadbeef", password: "whatever12345" });
    expect(res.status).toBe(400);
  });
});

describe("Two-factor login", () => {
  test("enabling 2FA requires an email OTP to complete login", async () => {
    const r = await register({ email: "tfa@univ.edu" });
    const token = r.body.token;

    const on = await agent().patch("/api/auth/2fa").set(...bearer(token)).send({ enabled: true });
    expect(on.status).toBe(200);
    expect(on.body.twoFactorEnabled).toBe(true);

    // Password login now returns a challenge instead of a token.
    const challenge = await agent().post("/api/auth/login").send({ email: "tfa@univ.edu", password: "password123" });
    expect(challenge.status).toBe(200);
    expect(challenge.body.twoFactorRequired).toBe(true);
    expect(challenge.body.token).toBeFalsy();
    expect(challenge.body.previewOtp).toBeTruthy();

    const done = await agent().post("/api/auth/login/verify-otp")
      .send({ email: "tfa@univ.edu", otp: challenge.body.previewOtp });
    expect(done.status).toBe(200);
    expect(done.body.token).toBeTruthy();
  });
});

describe("Session", () => {
  test("returns the current user from /auth/me", async () => {
    const r = await register({ email: "me@univ.edu" });
    const res = await agent().get("/api/auth/me").set(...bearer(r.body.token));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("me@univ.edu");
    expect(res.body).toHaveProperty("verification");
  });
});
