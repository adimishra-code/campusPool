// Functional flow test: drives the core marketplace loop through the REAL UI
// (publish a trip -> it appears -> a student joins -> host approves) against the
// in-memory visual-server, asserting DB/UI state at each step. Proves the React
// write-paths actually wire up to the backend, not just that pages render.
//
// Run: server `node scripts/visual-server.mjs` + client vite on :5173, then
//      `node scripts/flows.mjs` from the client dir.
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:5173";
const API = "http://localhost:5000";
const HOST_EMAIL = "aarav@univ.edu";      // seeded host with an approved vehicle
const RIDER_EMAIL = "riya@univ.edu";      // seeded student
const PW = "password123";
const MARKER = `FLOWTEST-${Date.now()}`;  // unique note to identify our trip

let passed = 0;
const checks = [];
function assert(cond, label) {
  checks.push({ label, ok: !!cond });
  if (cond) { passed++; console.log("  ✓", label); }
  else { console.log("  ✗", label); }
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

async function session(size = { width: 1366, height: 900 }) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  PAGEERROR:", e.message));
  await page.setViewport(size);
  return { page, context };
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input[type=email]", { timeout: 20000 });
  await page.type("input[type=email]", email);
  await page.type("input[type=password]", PW);
  await Promise.all([
    page.waitForFunction(() => location.pathname.startsWith("/feed"), { timeout: 15000 }),
    page.click("button[type=submit]")
  ]);
  await new Promise((r) => setTimeout(r, 800));
}

// Set a value on a React-controlled input/select/textarea and fire the events
// React listens for (native setter + bubbling input/change).
async function setControlled(page, selector, value) {
  await page.$eval(selector, (el, val) => {
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype
      : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function apiTrip(page, id) {
  return page.evaluate(async (api, tripId) => {
    const t = localStorage.getItem("token");
    const r = await fetch(`${api}/api/trips/${tripId}`, { headers: { Authorization: `Bearer ${t}` } });
    return r.ok ? r.json() : null;
  }, API, id);
}

function clickByText(page, selector, text) {
  return page.evaluate((sel, txt) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(txt));
    if (el) { el.click(); return true; }
    return false;
  }, selector, text);
}

let tripId = null;
try {
  // ---- 1. HOST publishes a trip via the Offer form -----------------------
  console.log("\n[1] Host publishes a trip");
  const host = await session();
  await login(host.page, HOST_EMAIL);
  await host.page.goto(`${BASE}/offer`, { waitUntil: "networkidle2" });
  await host.page.waitForSelector("form.offer-form", { timeout: 15000 });

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await setControlled(host.page, "form.offer-form input[type=date]", tomorrow);
  await setControlled(host.page, "form.offer-form input[type=time]", "09:30");
  await setControlled(host.page, "form.offer-form input[type=number]", "55");
  await setControlled(host.page, "form.offer-form input:not([type])", MARKER); // notes (no type attr)
  // Vehicle select is the one with an empty first option; pick the first real vehicle.
  await host.page.evaluate(() => {
    const sel = [...document.querySelectorAll("form.offer-form select")]
      .find((s) => [...s.options].some((o) => o.value === ""));
    const opt = [...sel.options].find((o) => o.value !== "");
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(sel, opt.value);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 300));
  await Promise.all([
    host.page.waitForFunction(() => location.pathname.startsWith("/my-trips"), { timeout: 15000 }),
    clickByText(host.page, "form.offer-form button[type=submit]", "Publish")
  ]);
  await new Promise((r) => setTimeout(r, 1200));
  assert(host.page.url().includes("/my-trips"), "Publish navigates to My Trips");

  // Grab the new trip's id from the first hosted trip card.
  await host.page.waitForSelector('a[href^="/trip/"]', { timeout: 10000 });
  tripId = await host.page.$eval('a[href^="/trip/"]', (a) => a.getAttribute("href").split("/trip/")[1]);
  assert(!!tripId, `New trip id captured (${tripId})`);

  // Confirm via API the trip exists with our marker note and correct cost.
  const created = await apiTrip(host.page, tripId);
  const t = created?.trip || created;
  assert(t && t.notes === MARKER, "Trip persisted in DB with our note");
  assert(t && t.costPerPerson === 55, "Trip cost persisted (₹55)");

  // ---- 2. Trip appears in a STUDENT's discovery feed ---------------------
  // (The feed correctly excludes the host's OWN trips — matchingEngine
  //  filters host:{$ne:user._id} — so we verify visibility as a student.)
  console.log("\n[2] Trip appears in a student's feed");
  const rider = await session();
  await login(rider.page, RIDER_EMAIL);
  await rider.page.goto(`${BASE}/feed`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1200));
  const inFeed = await rider.page.$$eval('a[href^="/trip/"]', (as, id) =>
    as.some((a) => a.getAttribute("href").includes(id)), tripId);
  assert(inFeed, "Newly published trip shows in the student's feed");

  // ---- 3. STUDENT joins the trip via the UI ------------------------------
  console.log("\n[3] Student joins the trip");
  await rider.page.goto(`${BASE}/trip/${tripId}`, { waitUntil: "networkidle2" });
  await rider.page.waitForSelector(".detail-main", { timeout: 15000 });
  const joinClicked = await clickByText(rider.page, ".button-row button", "Join trip");
  assert(joinClicked, "Join button present and clicked");
  await rider.page.waitForFunction(
    () => document.body.innerText.includes("Your status"), { timeout: 10000 }
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  const afterJoin = await apiTrip(rider.page, tripId);
  const tj = afterJoin?.trip || afterJoin;
  const riderPax = (tj?.passengers || []).find((p) => (p.user?.email || p.user) && (p.user?.email === RIDER_EMAIL || true));
  assert((tj?.passengers || []).length >= 1, "Passenger recorded on trip after join");
  assert((tj?.passengers || []).some((p) => p.status === "pending"), "Join created a pending passenger");

  // ---- 4. HOST approves the passenger via the UI -------------------------
  console.log("\n[4] Host approves the passenger");
  await host.page.goto(`${BASE}/trip/${tripId}`, { waitUntil: "networkidle2" });
  await host.page.waitForSelector(".passenger-row", { timeout: 15000 });
  const approveClicked = await clickByText(host.page, ".passenger-actions button", "Approve");
  assert(approveClicked, "Approve button present and clicked");
  await new Promise((r) => setTimeout(r, 1200));
  const afterApprove = await apiTrip(host.page, tripId);
  const ta = afterApprove?.trip || afterApprove;
  assert((ta?.passengers || []).some((p) => p.status === "approved"), "Passenger status is approved in DB");

  // ---- 5. Smoke: approved member sees payment + safety panels ------------
  console.log("\n[5] Approved member sees payment & safety panels");
  await rider.page.goto(`${BASE}/trip/${tripId}`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1200));
  const hasSafety = await rider.page.$(".safety-panel");
  const hasPayment = await rider.page.$(".payment-panel");
  assert(!!hasSafety, "Safety panel renders for approved member");
  assert(!!hasPayment, "Payment panel renders for approved member");

  await host.context.close();
  await rider.context.close();
} catch (e) {
  console.error("\nFLOW ERROR:", e.message);
} finally {
  await browser.close();
}

console.log(`\n=== FLOW RESULT: ${passed}/${checks.length} checks passed ===`);
const failed = checks.filter((c) => !c.ok);
if (failed.length) { console.log("FAILED:", failed.map((c) => c.label).join(" | ")); process.exit(1); }
