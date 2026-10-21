/* Opens the built game in Chrome, founds a nation, plays a few seasons, and checks for errors and broken characters.
   Needs Playwright (npm i -D playwright). Screenshots go to tests/out/.
   node tests/browser.test.js */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

(async () => {
  const out = path.join(__dirname, "out");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("file://" + path.join(__dirname, "..", "drawn-borders.html"));
  await page.waitForTimeout(5000);
  await page.click("text=Try a sample shape");
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Found this nation")');
  await page.waitForTimeout(5000);
  for (let i = 0; i < 3; i++) { await page.click('button:has-text("Next")'); await page.waitForTimeout(4000); }
  await page.screenshot({ path: path.join(out, "after-seasons.png") });
  const text = await page.evaluate(() => document.body.innerText);
  const broken = text.match(/â[\u0080-⃿]|Â·/g) || [];
  await browser.close();
  if (broken.length) errors.push(`broken characters on screen: ${broken.slice(0, 5).join(" ")}`);
  if (errors.length) { console.error("FAILED\n" + errors.join("\n")); process.exit(1); }
  console.log("browser test ok: founded a nation and played 3 seasons, no errors, characters fine");
})();
