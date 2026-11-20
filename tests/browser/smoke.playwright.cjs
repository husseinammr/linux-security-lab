/**
 * tests/browser/smoke.playwright.cjs  (Linux Security Lab) — OPTIONAL real-browser smoke test.
 * Not part of `npm test` (it needs Playwright and a browser, which this project deliberately does not depend on).
 *
 *   python3 -m http.server 8000 &                       # serve the repository root
 *   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
 *   CHROMIUM=/path/to/chrome node tests/browser/smoke.playwright.cjs http://localhost:8000
 *
 * It opens every view, checks the home counters, runs terminal pipes, confirms the single terminal moves into the
 * Investigation view with its history, plays the network investigation (inv03) from evidence to verification,
 * checks the "section quiz" button, the Arabic/RTL switch and that nothing overflows horizontally on a phone.
 * Exit code 0 = every check passed, 1 = at least one failed.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.argv[2] || "http://localhost:8000";
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ["--no-sandbox"] });
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/index.html`);
  await page.waitForSelector("#view-home.active");
  check("title", (await page.title()).startsWith("Linux Security Lab"));
  check("home counters filled from data", await page.$$eval("[data-stat]", (n) => n.every((x) => /^\d+$/.test(x.textContent))));
  for (const v of ["fundamentals", "permissions", "users", "network", "logs", "investigation", "architecture", "terminal", "quiz", "cheatsheet", "about", "home"]) {
    await page.click(`.nav-item[data-view="${v}"]`);
    await page.waitForSelector(`#view-${v}.active`);
  }
  // the simulator and the calculator are reached from the File Permissions page; its sidebar entry stays highlighted
  await page.click('.nav-item[data-view="permissions"]');
  for (const tool of ["simulator", "calculator"]) {
    await page.locator(`#view-permissions [data-goto="${tool}"]`).click();
    await page.waitForSelector(`#view-${tool}.active`);
    check(`${tool} opens from File Permissions and keeps that entry highlighted`, await page.$eval('.nav-item.active', (e) => e.dataset.view) === "permissions");
    await page.click('.nav-item[data-view="permissions"]');
  }
  await page.waitForSelector("#terminal-slot-permissions #terminal-window");
  check("the terminal is mounted in the File Permissions page", true);
  check("all views open", true);
  const lessons = await page.evaluate(() => Object.fromEntries(["fundamentals", "permissions", "users", "network", "logs", "investigation", "architecture"].map((s) => [s, document.querySelectorAll(`#learn-list-${s} details`).length])));
  check("every section lists lessons", Object.values(lessons).every((n) => n >= 3), JSON.stringify(lessons));

  await page.click('.nav-item[data-view="terminal"]');
  const run = async (c) => { await page.fill("#terminal-input", c); await page.press("#terminal-input", "Enter"); };
  await run('sudo grep "Failed password" /var/log/auth.log | wc -l'); await run("ip route"); await run("ss -tn");
  const txt = await page.$eval("#terminal-body", (e) => e.innerText);
  check("pipe, ip route and ss -tn work", /\n5\n/.test(txt) && /default via 10\.0\.2\.2/.test(txt) && /ESTAB/.test(txt));
  await page.click('.nav-item[data-view="investigation"]');
  check("terminal moved into the Investigation view with its history",
    await page.evaluate(() => !!document.querySelector("#terminal-slot-investigation #terminal-window")) && /default via/.test(await page.$eval("#terminal-body", (e) => e.innerText)));

  const panel = () => page.$eval("#scenario-mount", (e) => e.innerText);
  await page.locator("#scenario-mount .challenge-card", { hasText: "cache is reachable" }).getByRole("button", { name: "Open" }).click();
  await page.getByRole("button", { name: "Start investigation" }).click();
  for (const c of ["sudo ss -tulpn", "ps aux", "systemctl status redis-server"]) await run(c);
  await page.locator("label", { hasText: "wrong port" }).click();
  await page.getByRole("button", { name: /Submit|Diagnose|Check diagnosis/i }).first().click();
  check("a wrong diagnosis is refused with an explanation", /Not the cause/.test(await panel()));
  await page.locator("label", { hasText: "bound to 0.0.0.0" }).click();
  await page.getByRole("button", { name: /Submit|Diagnose|Check diagnosis/i }).first().click();
  await run("sudo systemctl stop redis-server"); await run("sudo systemctl disable redis-server");
  await page.locator("#sc-fixcheck").click();
  await run("ss -tulpn"); await run("systemctl status redis-server");
  check("investigation completes with a minimal fix", /Your fix is minimal/.test(await panel()));
  await page.locator("#sc-back").click(); await run("ss -tulpn");
  check("leaving restores the original state", /0\.0\.0\.0:6379/.test(await page.$eval("#terminal-body", (e) => e.innerText.split("\n").slice(-12).join("\n"))));

  await page.click('.nav-item[data-view="logs"]');
  await page.getByRole("button", { name: "Take this section's quiz" }).click();
  check("section quiz button selects that section", (await page.$eval("#quiz-topic-tabs .btn-primary", (e) => e.textContent)) === "Log Analysis");
  await page.click("#lang-toggle-btn"); await page.click('.nav-item[data-view="network"]');
  check("Arabic switches to RTL", (await page.evaluate(() => document.documentElement.dir)) === "rtl");

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto(`${base}/index.html`); await phone.waitForSelector("#view-home.active");
  check("no horizontal overflow on a 390px phone", (await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
  check("no uncaught page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("ERROR", e.message.split("\n")[0]); process.exit(1); });
