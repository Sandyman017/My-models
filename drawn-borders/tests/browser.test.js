/* Opens the built game in Chrome, founds a nation, divides it into provinces, plays a few seasons, opens the Provinces
   panel, the Trade panel and the trade statistics,
   and checks for errors and broken characters.
   Needs Playwright (npm i -D playwright). Screenshots go to tests/out/.
   node tests/browser.test.js */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

(async () => {
  const out = path.join(__dirname, "out");
  fs.mkdirSync(out, { recursive: true });
  // cloud sessions have a Chromium at /opt/pw-browsers/chromium that may not match the Playwright version
  const opts = { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] };
  const browser = await chromium.launch(opts).catch(e => {
    if (fs.existsSync("/opt/pw-browsers/chromium")) return chromium.launch({ ...opts, executablePath: "/opt/pw-browsers/chromium" });
    throw e;
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("file://" + path.join(__dirname, "..", "drawn-borders.html"));
  await page.waitForTimeout(5000);
  await page.click("text=Try a sample shape");
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Found this nation")');
  await page.waitForTimeout(3000);
  // the founding's second step: divide the country into provinces (since v38)
  if (!(await page.$(".prov-list"))) errors.push("the provinces step did not open after the founding");
  await page.click('button[data-action="prov-auto"][data-k="3"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, "provinces-step.png") });
  await page.click('button:has-text("Start with these provinces")');
  await page.waitForTimeout(4000);
  for (let i = 0; i < 3; i++) { await page.click('button:has-text("Next")'); await page.waitForTimeout(4000); }
  await page.screenshot({ path: path.join(out, "after-seasons.png") });
  // the Provinces panel (key B): open a province
  await page.evaluate(() => { ui.dispatch = null; renderAll(); });
  for (let k = 0; k < 30 && (await page.evaluate(() => !!ui.play)); k++) await page.waitForTimeout(1000);
  await page.keyboard.press("b");
  await page.waitForTimeout(800);
  if (!(await page.$(".prov-cards"))) errors.push("the Provinces panel did not open");
  await page.evaluate(() => { const b = document.querySelector('[data-action="prov-open"]'); if (b) b.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = document.querySelector('[data-action="prov-fund"][data-k="3"]'); if (b) b.click(); });
  await page.waitForTimeout(500);
  if (!(await page.$('[data-action="prov-fund"].on'))) errors.push("the money buttons of a province did not work");
  await page.screenshot({ path: path.join(out, "provinces-panel.png") });
  await page.keyboard.press("b");
  // the Trade panel (key X), a good's sellers, the embargo card, and the Statistics trade view
  await page.keyboard.press("x");
  await page.waitForTimeout(800);
  if (!(await page.$(".trade-goods"))) errors.push("the Trade panel did not open");
  await page.evaluate(() => { const k = document.querySelector("tr.trade-good"); if (k) k.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = document.querySelector('[data-action="trade-embargo-open"]'); if (b) b.click(); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, "trade-panel.png") });
  for (let k = 0; k < 30 && (await page.evaluate(() => !!ui.play)); k++) await page.waitForTimeout(1000);   // the season still playing out on the map
  await page.keyboard.press("i");
  await page.waitForTimeout(800);
  await page.evaluate(() => { const b = document.querySelector('[data-action="st-view"][data-view="trade"]'); if (b) b.click(); });
  await page.waitForTimeout(800);
  if (!(await page.$(".st-matrix.trade"))) errors.push("the Statistics trade view did not open");
  await page.screenshot({ path: path.join(out, "statistics-trade.png") });
  // villages (v39): the Statistics villages view, then a village's own page
  await page.evaluate(() => { const b = document.querySelector('[data-action="st-view"][data-view="villages"]'); if (b) b.click(); });
  await page.waitForTimeout(800);
  if (!(await page.$(".st-share"))) errors.push("the Statistics villages view did not open");
  await page.screenshot({ path: path.join(out, "statistics-villages.png") });
  await page.keyboard.press("i");
  await page.waitForTimeout(500);
  const vname = await page.evaluate(() => { const v = game.villages.find(x => game.owner[x.cell] === PLAYER && x.status !== "ruin"); if (!v) return null; selectVillage(v.id); renderAll(); return v.name; });
  await page.waitForTimeout(800);
  const vpage = await page.evaluate(() => document.body.innerText);
  if (!vname || !vpage.includes(vname) || !vpage.includes("How it looks") || !vpage.includes("Its site")) errors.push(`the village page did not open (${vname})`);
  await page.screenshot({ path: path.join(out, "village-page.png") });
  const text = await page.evaluate(() => document.body.innerText);
  const broken = text.match(/â[\u0080-⃿]|Â·/g) || [];
  await browser.close();
  if (broken.length) errors.push(`broken characters on screen: ${broken.slice(0, 5).join(" ")}`);
  if (errors.length) { console.error("FAILED\n" + errors.join("\n")); process.exit(1); }
  console.log("browser test ok: founded a nation, divided it into provinces, played 3 seasons, opened the Provinces panel, the Trade panel, the trade and village statistics and a village's page; no errors, characters fine");
})();
