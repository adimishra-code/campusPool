import { agent, bearer, register } from "./helpers.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./setup/db.js";

beforeAll(connectTestDB);
afterAll(disconnectTestDB);
afterEach(clearTestDB);

// Maps endpoints require auth and a configured GOOGLE_MAPS_API_KEY. Tests run
// without a key, so a valid request degrades to a clear 503 (no network call is
// made — assertGoogleKey throws first). This verifies routing, auth and
// validation without depending on the external Google API.
describe("Maps routes", () => {
  test("requires authentication", async () => {
    const res = await agent().get("/api/maps/geocode?address=Campus");
    expect(res.status).toBe(401);
  });

  test("validates the address query (422)", async () => {
    const u = await register({ email: "mapper@univ.edu" });
    const res = await agent()
      .get("/api/maps/geocode")
      .set(...bearer(u.body.token));
    expect(res.status).toBe(422);
  });

  test("returns 503 when Maps is not configured", async () => {
    const u = await register({ email: "mapper2@univ.edu" });
    const res = await agent()
      .get("/api/maps/geocode?address=Main Gate")
      .set(...bearer(u.body.token));
    expect(res.status).toBe(503);
  });
});
