import { agent, bearer, register, makeAdmin } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

const PNG = Buffer.from("89504e470d0a1a0a", "hex");

describe("Verification", () => {
  test("verifies college email via OTP (dev preview)", async () => {
    const reg = await register({ email: "otp@univ.edu" });
    const token = reg.body.token;

    // Request a fresh college-email OTP (the registration code was already
    // consumed by the email-gate verification in the helper).
    const issued = await agent().post("/api/verification/college-email/otp").set(...bearer(token)).send({});
    expect(issued.body.previewOtp).toBeTruthy();

    const wrong = await agent().post("/api/verification/college-email/verify").set(...bearer(token)).send({ otp: "000000" });
    expect(wrong.status).toBe(400);

    const ok = await agent().post("/api/verification/college-email/verify").set(...bearer(token)).send({ otp: issued.body.previewOtp });
    expect(ok.status).toBe(200);
  });

  test("uploads a student ID and an admin can approve it", async () => {
    const adminToken = await makeAdmin();
    const reg = await register({ email: "stud@univ.edu" });
    const token = reg.body.token;

    const up = await agent().post("/api/verification/upload/student-id").set(...bearer(token))
      .attach("document", PNG, { filename: "id.png", contentType: "image/png" }).field("number", "STU1");
    expect(up.status).toBe(201);
    await agent().post("/api/verification/upload/college-id").set(...bearer(token))
      .attach("document", PNG, { filename: "cid.png", contentType: "image/png" }).field("type", "college_id");

    const pending = await agent().get("/api/verification/admin/pending").set(...bearer(adminToken)).query({ type: "student" });
    const id = pending.body.verifications[0]._id;
    const approve = await agent().patch(`/api/verification/admin/${id}/approve`).set(...bearer(adminToken)).send({ type: "student" });
    expect(approve.status).toBe(200);

    const me = await agent().get("/api/auth/me").set(...bearer(token));
    expect(me.body.user.verificationStatus).toBe("approved");
  });

  test("rejects an unsupported file type", async () => {
    const reg = await register();
    const res = await agent().post("/api/verification/upload/student-id").set(...bearer(reg.body.token))
      .attach("document", Buffer.from("hi"), { filename: "x.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
  });

  test("only the owner or an admin can view a document", async () => {
    const owner = await register({ email: "owner@univ.edu" });
    const other = await register({ email: "other@univ.edu" });
    const up = await agent().post("/api/verification/upload/student-id").set(...bearer(owner.body.token))
      .attach("document", PNG, { filename: "id.png", contentType: "image/png" });
    const fileId = up.body.studentId.documentUrl.split("/").pop();

    const asOwner = await agent().get(`/api/verification/document/${fileId}`).set(...bearer(owner.body.token));
    expect(asOwner.status).toBe(200);
    const asOther = await agent().get(`/api/verification/document/${fileId}`).set(...bearer(other.body.token));
    expect(asOther.status).toBe(403);
  });
});
