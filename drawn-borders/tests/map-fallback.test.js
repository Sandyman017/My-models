/* How the graphics-card map gets ready and recovers when something fails on a player's computer (v39.3, after the new
   map fell back to the old tile map on Maz's PC with "full map could not start (part 1: link: no message) · …"):
     A  the graphics card stops while the first plan is prepared, without saying so (link: no message, as on Maz's
        PC): only that plan is remembered as failed, and the next plan starts on a fresh context
     A2 the next start skips that plan and does not blame any other
     L  the same with the context reported lost
     B  the roads' own program cannot start: the full map, with the roads drawn on top
     C  the graphics card stops while drawing: the full map comes back by itself, without the roads painter
     P  where the browser prepares programs in the background (KHR_parallel_shader_compile, imitated here): the old
        tile map shows while they are prepared, then the full map switches on by itself
   and the land and town programs are exactly those of version 39 (a computer reuses the program it prepared then).
   Views are kept on the open sea, so frames are cheap even without a graphics card.
   node tests/map-fallback.test.js      Needs Playwright (npm i --no-save playwright). */
"use strict";
const path = require("path"), fs = require("fs"), crypto = require("crypto"), { chromium } = require("playwright");
const { execSync } = require("child_process");
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
  const check = (name, r, want) => {
    const bad = Object.entries(want).filter(([k, v]) => typeof v === "function" ? !v(r[k]) : r[k] !== v).map(([k]) => k);
    console.log((bad.length ? "FAIL " : "ok   ") + name.padEnd(46), bad.length ? JSON.stringify(r) : (r.note || "").slice(0, 150));
    if (bad.length) problems.push(name + ": " + bad.join(", "));
  };
  const build = await page.evaluate(() => String(GAME_BUILD));
  const state = () => page.evaluate(() => ({ ok: GLMAP.ok, preparing: !!GLMAP.preparing, roads: !!GLMAP.roadP, zoomMax: ZOOM.max,
    plan: GLMAP.ok ? (GLMAP.note.match(/using ([^,(]+)/) || [])[1] : null, failed: localStorage.getItem("drawn-borders-map-fail"), note: GLMAP.note }));
  // wait until the map is ready (or has given up)
  const settle = async () => { for (let k = 0; k < 600; k++) { const r = await state(); if (!r.preparing && (r.ok || /old tile map/.test(r.note))) return r; await page.waitForTimeout(100); } return state(); };
  // keep every view on the open sea in the corner (cheap to draw); start again from a clean slate
  await page.evaluate(() => {
    window.__sea = () => { view.zoom = 50; view.cs = view.base * 50; view.ox = 0; view.oy = 0; };
    window.__start = (clear = true) => { if (clear) { localStorage.removeItem("drawn-borders-map-fail"); localStorage.removeItem("drawn-borders-map-trying"); } GLMAP.restarts = 0; window.__noWebGL = false; GLMAP.tried = false; GLMAP.ok = false; __sea(); resetTerrain(world); };
    // the next result the graphics card gives is a silent stop (as on Maz's PC), optionally with the context lost
    // imitate background preparation: the programs say "not ready yet" n times before they are
    window.__fakePar = n => { const real = glFreshContext; window.__unfake = () => { glFreshContext = real; };
      glFreshContext = S => { const gl = real(S); if (!gl) return gl; let left = n; S.par = { COMPLETION_STATUS_KHR: 0x91B1 };
        const gp = gl.getProgramParameter.bind(gl); gl.getProgramParameter = (p, q) => q === 0x91B1 ? left-- <= 0 : gp(p, q); return gl; }; };
    window.__stopOnce = lose => { const real = glProgramResult; window.glProgramResult = glProgramResult = (gl, b) => { glProgramResult = real; window.glProgramResult = real; if (lose) gl.getExtension("WEBGL_lose_context").loseContext(); return { err: "link: no message: the graphics card stopped", crash: true }; }; };
  });
  // the land and town programs are exactly those of version 39
  const v39 = execSync("git show 42896ab:drawn-borders/drawn-borders.html", { cwd: path.join(__dirname, ".."), maxBuffer: 64e6 }).toString();
  const v39Plans = await (async () => {
    const p2 = await browser.newPage(); await p2.addInitScript(() => { window.__noWebGL = true; });
    const f = path.join(__dirname, "out", "v39-for-map-test.html"); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, v39);
    await p2.goto("file://" + f); await p2.waitForTimeout(2000);
    const r = await p2.evaluate(() => glPlans().map(p => p.parts)); await p2.close(); return r;
  })();
  const nowPlans = await page.evaluate(() => glPlans().map(p => p.parts));
  const h = x => crypto.createHash("sha1").update(JSON.stringify(x)).digest("hex");
  check("map programs as in version 39", { same: h(v39Plans) === h(nowPlans) }, { same: true });

  await page.evaluate(() => { __stopOnce(false); __start(); });
  check("A: silent stop while preparing plan 0", await settle(), { ok: true, zoomMax: 1000, failed: build + ":0", plan: "full map with lighter cities" });
  await page.evaluate(() => __start(false));
  check("A2: next start skips plan 0 only", await settle(), { ok: true, failed: build + ":0", note: n => /full map: skipped/.test(n) && !/lighter cities: skipped/.test(n) });
  await page.evaluate(() => { __stopOnce(true); __start(); });
  check("L: context lost while preparing plan 0", await settle(), { ok: true, failed: build + ":0" });
  await page.evaluate(() => { const real = roadShaderSource; roadShaderSource = () => { roadShaderSource = real; return "#version 300 es\nthis is not a shader"; }; __start(); });
  const b = await settle();
  b.overlayDrawsRoads = await page.evaluate(() => { updateLanduse(); glUpdateLand(); return !(GLMAP.ok && !GLMAP.simple && !GLMAP.noRoads && GLMAP.roadEdges); });
  check("B: roads program cannot compile", b, { ok: true, roads: false, overlayDrawsRoads: true, failed: build + ":roads", plan: "full map " });
  await page.evaluate(() => __start());
  check("C0: clean start, roads painted", await settle(), { ok: true, roads: true, failed: "", note: n => /roads painted into the land/.test(n) });
  await page.evaluate(() => GLMAP.gl.getExtension("WEBGL_lose_context").loseContext());
  await page.waitForTimeout(2000);
  check("C: graphics card stops while drawing", await settle(), { ok: true, roads: false, zoomMax: 1000, failed: build + ":roads" });
  await page.evaluate(() => { __fakePar(12); __start(); });
  check("P1: preparing in the background", await state(), { ok: false, preparing: true, zoomMax: 5 });
  const p = await settle();
  await page.evaluate(() => __unfake());
  check("P2: then the full map switches on", p, { ok: true, roads: true, zoomMax: 1000, note: n => /prepared in the background/.test(n) });
  await browser.close();
  if (errors.length) problems.push("page errors: " + errors.join(" | "));
  if (problems.length) { console.error("map fallback test FAILED\n" + problems.join("\n")); process.exit(1); }
  console.log("map fallback test ok: the map programs are version 39's; a silent stop or a lost context while preparing, a roads program that cannot start and a stop while drawing all end on the full map");
})();
