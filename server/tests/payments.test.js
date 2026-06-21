import crypto from "crypto";
import { agent, bearer, register, makeAdmin, makeVerifiedHost, offerTrip } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";
import {
  creditWallet, debitWallet, getOrCreateWallet,
  verifyRazorpaySignature, verifyWebhookSignature
} from "../src/services/payment.service.js";
import Transaction from "../src/models/Transaction.js";
import { env } from "../src/config/env.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

// A trip with one approved passenger, plus a handle on both tokens.
async function tripWithApprovedPassenger() {
  const adminToken = await makeAdmin();
  const host = await makeVerifiedHost(adminToken);
  const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;
  const passenger = await register({ email: "payer@univ.edu" });
  await agent().post(`/api/trips/${trip}/join`).set(...bearer(passenger.body.token)).send({});
  await agent().post(`/api/trips/${trip}/approve/${passenger.body.user.id}`).set(...bearer(host.token)).send({});
  return { adminToken, host, passenger, trip };
}

describe("Peer-to-peer trip payment", () => {
  test("host with a UPI ID exposes a QR + intent to an approved passenger", async () => {
    const { host, passenger, trip } = await tripWithApprovedPassenger();
    await agent().patch("/api/users/me").set(...bearer(host.token)).send({ upiId: "host@okbank" });

    const info = await agent().get(`/api/trips/${trip}/payment`).set(...bearer(passenger.body.token));
    expect(info.status).toBe(200);
    expect(info.body.host.hasUpi).toBe(true);
    expect(info.body.upi.intent).toContain("upi://pay?");
    expect(info.body.upi.intent).toContain("host@okbank");
    expect(info.body.upi.qr).toMatch(/^data:image\/png;base64,/);
    expect(info.body.mySettlement.settled).toBe(false);
  });

  test("an approved passenger can settle by UPI and the trip becomes settled", async () => {
    const { host, passenger, trip } = await tripWithApprovedPassenger();
    await agent().patch("/api/users/me").set(...bearer(host.token)).send({ upiId: "host@okbank" });

    const res = await agent().post(`/api/trips/${trip}/settle`).set(...bearer(passenger.body.token)).send({ method: "upi" });
    expect(res.status).toBe(201);
    expect(res.body.paymentStatus).toBe("settled");

    // It shows in the passenger's payment history.
    const mine = await agent().get("/api/payments").set(...bearer(passenger.body.token));
    expect(mine.body.payments.length).toBe(1);
    expect(mine.body.payments[0].method).toBe("upi");

    // Host sees the passenger's share marked paid.
    const hostView = await agent().get(`/api/trips/${trip}/payment`).set(...bearer(host.token));
    expect(hostView.body.split.find((s) => s.settled)).toBeTruthy();
  });

  test("cash settlement works even without a host UPI ID", async () => {
    const { passenger, trip } = await tripWithApprovedPassenger();
    const res = await agent().post(`/api/trips/${trip}/settle`).set(...bearer(passenger.body.token)).send({ method: "cash" });
    expect(res.status).toBe(201);
    expect(res.body.payment.method).toBe("cash");
    expect(res.body.paymentStatus).toBe("settled");
  });

  test("a non-participant cannot settle or view payment info (403)", async () => {
    const { trip } = await tripWithApprovedPassenger();
    const outsider = await register({ email: "pay-outsider@univ.edu" });
    const view = await agent().get(`/api/trips/${trip}/payment`).set(...bearer(outsider.body.token));
    expect(view.status).toBe(403);
    const settle = await agent().post(`/api/trips/${trip}/settle`).set(...bearer(outsider.body.token)).send({ method: "cash" });
    expect(settle.status).toBe(403);
  });

  test("an invalid UPI ID is rejected on profile update (422)", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const res = await agent().patch("/api/users/me").set(...bearer(host.token)).send({ upiId: "not a vpa" });
    expect(res.status).toBe(422);
  });

  test("settling twice does not create a duplicate payment", async () => {
    const { passenger, trip } = await tripWithApprovedPassenger();
    const first = await agent().post(`/api/trips/${trip}/settle`).set(...bearer(passenger.body.token)).send({ method: "cash" });
    expect(first.status).toBe(201);
    await agent().post(`/api/trips/${trip}/settle`).set(...bearer(passenger.body.token)).send({ method: "cash" });
    // Regardless of how a re-settle is handled, the passenger must not end up
    // with two charges for the same seat.
    const mine = await agent().get("/api/payments").set(...bearer(passenger.body.token));
    expect(mine.body.payments.length).toBe(1);
  });
});

describe("Wallet ledger", () => {
  test("credit then debit keeps balance and writes ledger entries", async () => {
    const u = await register({ email: "wallet@univ.edu" });
    const userId = u.body.user.id;

    await creditWallet({ userId, amount: 100, reason: "wallet_topup" });
    let wallet = await getOrCreateWallet(userId);
    expect(wallet.balance).toBe(100);

    const { wallet: afterDebit } = await debitWallet({ userId, amount: 40, reason: "ride_payment" });
    expect(afterDebit.balance).toBe(60);

    const ledger = await Transaction.find({ user: userId }).sort("createdAt");
    expect(ledger.map((t) => t.type)).toEqual(["credit", "debit"]);
    expect(ledger[1].balanceAfter).toBe(60);
  });

  test("debiting more than the balance is rejected (402)", async () => {
    const u = await register({ email: "broke@univ.edu" });
    await expect(debitWallet({ userId: u.body.user.id, amount: 999 }))
      .rejects.toMatchObject({ statusCode: 402 });
  });
});

describe("Razorpay signatures", () => {
  test("verifyRazorpaySignature accepts a correct HMAC and rejects a tampered one", () => {
    const orderId = "order_123";
    const paymentId = "pay_456";
    const good = crypto.createHmac("sha256", env.razorpayKeySecret).update(`${orderId}|${paymentId}`).digest("hex");
    expect(verifyRazorpaySignature({ orderId, paymentId, signature: good })).toBe(true);
    // Flip the last hex char but keep the length (timingSafeEqual needs equal length).
    const bad = good.slice(0, -1) + (good.endsWith("0") ? "1" : "0");
    expect(verifyRazorpaySignature({ orderId, paymentId, signature: bad })).toBe(false);
  });

  test("verifyWebhookSignature is false when no webhook secret is configured", () => {
    expect(verifyWebhookSignature("{}", "anything")).toBe(false);
  });
});
