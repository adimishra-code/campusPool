import { agent, bearer, register, makeAdmin, makeVerifiedHost, offerTrip } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

// Trip with host + one approved passenger + one outsider.
async function tripWithParticipants() {
  const adminToken = await makeAdmin();
  const host = await makeVerifiedHost(adminToken);
  const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;
  const passenger = await register({ email: "pax@univ.edu" });
  await agent()
    .post(`/api/trips/${trip}/join`)
    .set(...bearer(passenger.body.token))
    .send({});
  await agent()
    .post(`/api/trips/${trip}/approve/${passenger.body.user.id}`)
    .set(...bearer(host.token))
    .send({});
  const outsider = await register({ email: "outsider@univ.edu" });
  return { host, passenger, outsider, trip };
}

describe("Trip chat", () => {
  test("host and approved passenger can send and read messages", async () => {
    const { host, passenger, trip } = await tripWithParticipants();

    const sent = await agent()
      .post(`/api/trips/${trip}/messages`)
      .set(...bearer(host.token))
      .send({ body: "Leaving at 5pm sharp" });
    expect(sent.status).toBe(201);
    expect(sent.body.message.body).toBe("Leaving at 5pm sharp");
    expect(sent.body.message.sender.name).toBeTruthy();

    await agent()
      .post(`/api/trips/${trip}/messages`)
      .set(...bearer(passenger.body.token))
      .send({ body: "Great, see you!" });

    const list = await agent()
      .get(`/api/trips/${trip}/messages`)
      .set(...bearer(passenger.body.token));
    expect(list.status).toBe(200);
    expect(list.body.messages.length).toBe(2);
    expect(list.body.messages.map((m) => m.body)).toEqual([
      "Leaving at 5pm sharp",
      "Great, see you!"
    ]);
  });

  test("a non-participant cannot read or send messages (403)", async () => {
    const { outsider, trip } = await tripWithParticipants();
    const read = await agent()
      .get(`/api/trips/${trip}/messages`)
      .set(...bearer(outsider.body.token));
    expect(read.status).toBe(403);
    const send = await agent()
      .post(`/api/trips/${trip}/messages`)
      .set(...bearer(outsider.body.token))
      .send({ body: "let me in" });
    expect(send.status).toBe(403);
  });

  test("a pending (not yet approved) passenger has no chat access", async () => {
    const adminToken = await makeAdmin();
    const host = await makeVerifiedHost(adminToken);
    const trip = (await offerTrip(host.token, host.vehicleId)).body.trip.id;
    const pending = await register({ email: "pending@univ.edu" });
    await agent()
      .post(`/api/trips/${trip}/join`)
      .set(...bearer(pending.body.token))
      .send({});
    const res = await agent()
      .get(`/api/trips/${trip}/messages`)
      .set(...bearer(pending.body.token));
    expect(res.status).toBe(403);
  });

  test("read receipts: a recipient's id is added to readBy after they fetch", async () => {
    const { host, passenger, trip } = await tripWithParticipants();
    await agent()
      .post(`/api/trips/${trip}/messages`)
      .set(...bearer(host.token))
      .send({ body: "ping" });
    await agent()
      .get(`/api/trips/${trip}/messages`)
      .set(...bearer(passenger.body.token)); // passenger reads
    const afterRead = await agent()
      .get(`/api/trips/${trip}/messages`)
      .set(...bearer(host.token));
    const msg = afterRead.body.messages[0];
    const readByIds = msg.readBy.map(String);
    expect(readByIds).toContain(passenger.body.user.id);
  });

  test("empty messages are rejected", async () => {
    const { host, trip } = await tripWithParticipants();
    const res = await agent()
      .post(`/api/trips/${trip}/messages`)
      .set(...bearer(host.token))
      .send({ body: "   " });
    expect(res.status).toBe(422);
  });
});
