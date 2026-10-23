/* Opens the built game in Chrome, founds a nation, plays some seasons, then does the steps you give and takes
   screenshots, so a change can be seen in the real game. Fails on any page error or broken characters.
   Needs Playwright (npm i --no-save playwright). Screenshots go to tests/out/look-<name>.png.

   node tests/look.js [--seasons N] [--no-found] [--provinces-step] [--size 1600x900] [steps...]
   --provinces-step stops at the founding's second step (dividing the country into provinces).

   Steps, done in order after the seasons:
     key:x              press a key (x = Trade panel, i = Statistics, o = People ...)
     click:<selector>   click the first element that matches a CSS or Playwright selector
     eval:<js>          run JavaScript in the page (the game's functions and `game`, `world`, `ui` are there)
     wait:<ms>          wait
     idle               wait until the season has finished playing out on the map
     shot:<name>        take a screenshot  -> tests/out/look-<name>.png
     text:<selector>    print the text of the first matching element (to read numbers without a screenshot)
   Without steps it takes one screenshot, "map".

   Example: node tests/look.js --seasons 2 idle key:x wait:800 shot:trade "eval:ui.zoom=3;renderAll()" shot:close */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
let seasons = 3, found = true, size = [1600, 900], stopAtProvinces = false;
const steps = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--seasons") seasons = Number(args[++i]);
  else if (a === "--no-found") found = false;
  else if (a === "--provinces-step") stopAtProvinces = true;
  else if (a === "--size") size = args[++i].split("x").map(Number);
  else steps.push(a);
}
if (!steps.length) steps.push("idle", "shot:map");

(async () => {
  const out = path.join(__dirname, "out");
  fs.mkdirSync(out, { recursive: true });
  // cloud sessions have a Chromium at /opt/pw-browsers/chromium that may not match the Playwright version
  const opts = { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] };
  const browser = await chromium.launch(opts).catch(e => {
    if (fs.existsSync("/opt/pw-browsers/chromium")) return chromium.launch({ ...opts, executablePath: "/opt/pw-browsers/chromium" });
    throw e;
  });
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("file://" + path.join(__dirname, "..", "drawn-borders.html"));
  await page.waitForTimeout(5000);
  if (found) {
    await page.click("text=Try a sample shape");
    await page.waitForTimeout(2000);
    await page.click('button:has-text("Found this nation")');
    await page.waitForTimeout(3000);
    // the optional provinces step after the founding (since v38): let the game divide the country
    const divide = stopAtProvinces ? null : await page.$('button:has-text("Divide it for me")');
    if (divide) { await divide.click(); await page.waitForTimeout(1500); }
    const start = stopAtProvinces ? null : await page.$('button:has-text("Start with these provinces")');
    if (start) { await start.click(); await page.waitForTimeout(3000); }
    for (let i = 0; i < (stopAtProvinces ? 0 : seasons); i++) {
      for (let k = 0; k < 30 && (await page.evaluate(() => !!ui.play)); k++) await page.waitForTimeout(1000);
      await page.evaluate(() => { ui.dispatch = null; renderAll(); });
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(4000);
    }
  }
  for (const s of steps) {
    const [cmd, ...rest] = s.split(":"), arg = rest.join(":");
    try {
      if (cmd === "key") await page.keyboard.press(arg);
      else if (cmd === "click") await page.click(arg, { timeout: 5000 });
      else if (cmd === "eval") { const r = await page.evaluate(arg); if (r !== undefined) console.log(`eval: ${JSON.stringify(r)}`); }
      else if (cmd === "wait") await page.waitForTimeout(Number(arg));
      else if (cmd === "idle") { for (let k = 0; k < 30 && (await page.evaluate(() => !!ui.play)); k++) await page.waitForTimeout(1000); await page.evaluate(() => { ui.dispatch = null; renderAll(); }); }
      else if (cmd === "shot") { const f = path.join(out, `look-${arg}.png`); await page.screenshot({ path: f }); console.log(`screenshot: ${f}`); }
      else if (cmd === "text") console.log(`text ${arg}: ${(await page.textContent(arg, { timeout: 5000 })) || ""}`.slice(0, 4000));
      else errors.push(`unknown step "${s}"`);
    } catch (e) { errors.push(`step "${s}": ${e.message.split("\n")[0]}`); }
    if (cmd !== "wait" && cmd !== "shot") await page.waitForTimeout(300);
  }
  const text = await page.evaluate(() => document.body.innerText);
  const broken = text.match(/â[\u0080-⃿]|Â·/g) || [];
  await browser.close();
  if (broken.length) errors.push(`broken characters on screen: ${broken.slice(0, 5).join(" ")}`);
  if (errors.length) { console.error("PROBLEMS\n" + errors.join("\n")); process.exit(1); }
  console.log("look ok: no page errors, characters fine");
})();
