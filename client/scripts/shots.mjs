import puppeteer from "puppeteer-core";
import fs from "fs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:5173";
const API = "http://localhost:5000";
const OUT = process.env.SHOT_OUT || "scripts/shots";
fs.mkdirSync(OUT, { recursive: true });

// Allow narrowing the run to a single viewport via SHOT_ONLY=phone|tablet|laptop
const ONLY = process.env.SHOT_ONLY;
const W = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  laptop: { width: 1366, height: 900 }
};
const WIDTHS = ONLY ? [ONLY] : ["phone", "tablet", "laptop"];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

// Each session gets its own incognito context so auth tokens never bleed
// between viewport runs (a shared context would keep us logged in and break
// the /login screenshots).
async function newPage(size) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("requestfailed", (r) => console.log("REQFAIL:", r.url(), r.failure()?.errorText));
  await page.setViewport(size);
  return { page, context };
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input[type=email]", { timeout: 20000 });
  await page.type("input[type=email]", email);
  await page.type("input[type=password]", "password123");
  await Promise.all([
    page.waitForFunction(() => location.pathname.startsWith("/feed"), { timeout: 15000 }),
    page.click("button[type=submit]")
  ]);
  await new Promise((r) => setTimeout(r, 1500));
}

async function shot(page, name) {
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("shot:", name);
}

async function tripId(page) {
  return page.evaluate(async (api) => {
    const t = localStorage.getItem("token");
    const r = await fetch(`${api}/api/trips/find`, { headers: { Authorization: `Bearer ${t}` } });
    const d = await r.json();
    const a = (d.trips || d || [])[0];
    return a ? a._id || a.id : null;
  }, API);
}

// Pages reachable by a normal logged-in user, shot at every viewport.
const USER_PAGES = [
  ["feed", "/feed"],
  ["recommendations", "/recommendations"],
  ["offer", "/offer"],
  ["my-trips", "/my-trips"],
  ["verify", "/verify"],
  ["profile", "/profile"]
];

try {
  // Logged-out login page at every viewport.
  for (const w of WIDTHS) {
    const { page, context } = await newPage(W[w]);
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await shot(page, `login-${w}`);
    await context.close();
  }

  // Host session: every user page + trip detail, at every viewport.
  for (const w of WIDTHS) {
    const { page, context } = await newPage(W[w]);
    await login(page, "aarav@univ.edu");
    for (const [name, path] of USER_PAGES) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2" });
      await shot(page, `${name}-${w}`);
    }
    const id = await tripId(page);
    if (id) {
      await page.goto(`${BASE}/trip/${id}`, { waitUntil: "networkidle2" });
      await shot(page, `trip-${w}`);
    }
    // Notification dropdown (open from feed) — checks overlay positioning.
    await page.goto(`${BASE}/feed`, { waitUntil: "networkidle2" });
    await page.click(".notif-trigger").catch(() => {});
    await shot(page, `notif-${w}`);
    // Mobile nav drawer (hamburger) — only rendered <=980px.
    if (w === "phone" || w === "tablet") {
      await page.goto(`${BASE}/feed`, { waitUntil: "networkidle2" });
      await page.click(".nav-toggle").catch(() => {});
      await shot(page, `menu-${w}`);
    }
    await context.close();
  }

  // Admin session: verifications + safety dashboard, at every viewport.
  for (const w of WIDTHS) {
    const { page, context } = await newPage(W[w]);
    await login(page, "admin@univ.edu");
    await page.goto(`${BASE}/admin/verifications`, { waitUntil: "networkidle2" });
    await shot(page, `admin-verify-${w}`);
    await page.goto(`${BASE}/admin/safety`, { waitUntil: "networkidle2" });
    await shot(page, `admin-safety-${w}`);
    await context.close();
  }
} catch (e) {
  console.error("SHOT ERROR:", e.message);
} finally {
  await browser.close();
  console.log("done");
}
