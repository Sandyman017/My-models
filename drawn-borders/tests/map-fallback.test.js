/* How the graphics-card map recovers when something fails on a player's computer (v39.2, after the new map fell
   back to the old tile map on Maz's PC):
     A  a map plan crashes the graphics card while it is prepared: a fresh context and the next plan, and only that
        plan is remembered as failed
     B  the roads' own program cannot start: the full map, with the roads drawn on top
     C  the graphics card stops while drawing: the full map comes back by itself, without the roads painter
   Views are kept on the open sea, so frames are cheap even without a graphics card.
   node tests/map-fallback.test.js      Needs Playwright (npm i --no-save playwright). */
"use strict";
const path = require("path"), fs = require("fs"), { chromium } = require("playwright");
(async () => {
  const opts = { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] };
  const browser = await chromium.launch(opts).catch(e => {
    if (fs.existsSync("/opt/pw-browsers/chromium")) return chromium.launch({ ...opts, executablePath: "/opt/pw-browsers/chromium" });
    throw e;
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.setDefaultTimeout(600000);
  await page.addInitScript(() => { window.__noWebGL = true; });
  await page.goto("file://" + path.join(__dirname, "..", "drawn-borders.html"));
  await page.waitForTimeout(3000);
  await page.evaluate(() => { motion.on = false; applyClaimResult(sampleShape()); foundNation(); startWithProvinces(); ui.dispatch = null; });
  await page.setViewportSize({ width: 360, height: 240 });
  await page.waitForTimeout(1000);
  const problems = [];
  const step = async (name, fn, want) => {
    const r = await page.evaluate(fn);
    const bad = Object.entries(want).filter(([k, v]) => typeof v === "function" ? !v(r[k]) : r[k] !== v).map(([k]) => k);
    console.log((bad.length ? "FAIL " : "ok   ") + name.padEnd(34), bad.length ? JSON.stringify(r) : "");
    if (bad.length) problems.push(name + ": " + bad.join(", "));
  };
  const build = await page.evaluate(() => String(GAME_BUILD));
  const state = `({ ok: GLMAP.ok, roads: !!GLMAP.roadP, noRoads: GLMAP.noRoads, zoomMax: ZOOM.max, failed: localStorage.getItem("drawn-borders-map-fail"), note: GLMAP.note })`;
  // keep every view on the open sea in the corner (cheap to draw)
  await page.evaluate(() => { window.__sea = () => { view.zoom = 50; view.cs = view.base * 50; view.ox = 0; view.oy = 0; }; });
  // A: the first plan crashes the graphics card while it is being prepared
  await step("A: plan 0 crashes while prepared", `(() => {
    localStorage.removeItem("drawn-borders-map-fail"); localStorage.removeItem("drawn-borders-map-trying");
    const real = glBuild; let n = 0;
    window.glBuild = glBuild = (gl, src) => { if (n++ === 0) { gl.getExtension("WEBGL_lose_context").loseContext(); return { err: "the graphics card stopped (context lost)" }; } return real(gl, src); };
    window.__noWebGL = false; GLMAP.tried = false; __sea(); resetTerrain(world);
    glBuild = real; window.glBuild = real;
    return ${state};
  })()`, { ok: true, zoomMax: 1000, failed: build + ":0" });
  await step("A2: next start skips plan 0", `(() => { GLMAP.tried = false; __sea(); resetTerrain(world); return ${state}; })()`, { ok: true, failed: build + ":0", note: n => /skipped/.test(n) });
  // B: the roads program cannot start
  await step("B: roads program fails to compile", `(() => {
    localStorage.removeItem("drawn-borders-map-fail");
    const real = roadShaderSource; roadShaderSource = () => "#version 300 es\\nthis is not a shader";
    GLMAP.tried = false; __sea(); resetTerrain(world); roadShaderSource = real;
    updateLanduse(); glUpdateLand();
    const painted = GLMAP.ok && !GLMAP.simple && !GLMAP.noRoads && GLMAP.roadEdges;
    return { ...${state}, overlayDrawsRoads: !painted };
  })()`, { ok: true, roads: false, overlayDrawsRoads: true, failed: build + ":roads", note: n => /using full map \(/.test(n) });
  // C: the graphics card stops while drawing with the roads painter: it starts again by itself, without it
  await step("C0: fresh start with roads", `(() => { localStorage.removeItem("drawn-borders-map-fail"); GLMAP.tried = false; __sea(); resetTerrain(world); return ${state}; })()`, { ok: true, roads: true });
  await step("C1: graphics card stops", `(() => { GLMAP.gl.getExtension("WEBGL_lose_context").loseContext(); return ${state}; })()`, {});
  await page.waitForTimeout(2500);
  await step("C2: a moment later", `(${state})`, { ok: true, roads: false, zoomMax: 1000, failed: build + ":roads" });
  await browser.close();
  if (errors.length) problems.push("page errors: " + errors.join(" | "));
  if (problems.length) { console.error("map fallback test FAILED\n" + problems.join("\n")); process.exit(1); }
  console.log("map fallback test ok: a crash while preparing, a roads program that cannot start, and a crash while drawing all end on the full map");
})();
