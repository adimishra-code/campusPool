// Focused screenshots of the launch-hardening pages against the fresh build
// (vite preview :4173) + in-memory API (:5000). Reports any page errors.
import puppeteer from "puppeteer-core";
import fs from "fs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4173";
const OUT = "scripts/shots/launch";
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const errors = [];

async function page() {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });
  await p.setViewport({ width: 1280, height: 900 });
  return p;
}

async function shot(name, path, prep) {
  const p = await page();
  await p.goto(`${BASE}${path}`, { waitUntil: "networkidle2" });
  if (prep) await prep(p);
  await new Promise((r) => setTimeout(r, 400));
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`✓ ${name}`);
  await p.browserContext().close();
}

// Public + auth pages
await shot("login", "/login");
await shot("register", "/login", async (p) => {
  await p.waitForSelector("button.link-button");
  const btns = await p.$$("button.link-button");
  for (const b of btns) { const t = await p.evaluate((e) => e.textContent, b); if (/Create an account/i.test(t)) { await b.click(); break; } }
  await new Promise((r) => setTimeout(r, 300));
});
await shot("privacy", "/privacy");
await shot("terms", "/terms");
await shot("support", "/support");
await shot("report-bug", "/report-bug");

// Register a fresh user through the UI to reach the email-verify screen.
await shot("verify-email", "/login", async (p) => {
  const btns = await p.$$("button.link-button");
  for (const b of btns) { const t = await p.evaluate((e) => e.textContent, b); if (/Create an account/i.test(t)) { await b.click(); break; } }
  await p.waitForSelector('input[autocomplete="name"]');
  await p.type('input[autocomplete="name"]', "Visual Tester");
  await p.type('input[type="email"]', `vis_${Date.now()}@univ.edu`);
  await p.type('input[inputmode="numeric"]', "9123456780");
  await p.type('input[type="password"]', "password123");
  await p.click('button[type="submit"]');
  await p.waitForFunction(() => /Verify your email/i.test(document.body.innerText), { timeout: 10000 });
});

// Forgot-password screen
await shot("forgot-password", "/login", async (p) => {
  const btns = await p.$$("button.link-button");
  for (const b of btns) { const t = await p.evaluate((e) => e.textContent, b); if (/Forgot password/i.test(t)) { await b.click(); break; } }
  await new Promise((r) => setTimeout(r, 300));
});

await browser.close();

if (errors.length) {
  console.log("\n⚠ PAGE ERRORS:\n" + [...new Set(errors)].join("\n"));
  process.exit(2);
}
console.log("\nNo page errors. Screenshots in " + OUT);
