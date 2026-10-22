/* =====================================================================
   14d. The map drawn by the graphics card
   The whole land is worked out pixel by pixel on the graphics card (WebGL 2): the same continent, coasts,
   mountains and forests as the game's own map, plus every finer detail as you zoom in, down to fields, villages,
   streets and buildings. Farmland, irrigation, logging, mines and towns come from the game, so the land changes
   as nations grow. Nothing is stored: each view is drawn fresh, so zooming costs nothing but the graphics card's
   work. If WebGL 2 is not available, the game paints the map in tiles as before.
   ===================================================================== */
const GLMAP = { ok: false, tried: false, gl: null, canvas: null, prog: null, U: {}, tex: {}, landKey: null, nTowns: 0, nPits: 0, lastDraw: 0, low: false, timer: 0, villages: null, qIdle: 1, qMove: 0.5 };
const GL_RIVER_W = [0.0012, 0.0028, 0.006, 0.012];   // real river widths in cells (60 m to 600 m)
/* Compile one map painter program in the given context. Returns { prog } or { err }. */
function glBuild(gl, src) {
  try {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, "#version 300 es\nin vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }");
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, src);
    gl.compileShader(fs);
    if (gl.isContextLost()) return { err: "the graphics card stopped (context lost)" };
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return { err: "compile: " + (gl.getShaderInfoLog(fs) || "no message").slice(0, 300) };
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (gl.isContextLost()) return { err: "the graphics card stopped (context lost)" };
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { err: "link: " + (gl.getProgramInfoLog(prog) || "no message").slice(0, 300) };
    return { prog };
  } catch (e) { return { err: "error: " + (e && e.message || e) }; }
}
const MAPKEY = { fail: "drawn-borders-map-fail", trying: "drawn-borders-map-trying" };
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage may be off */ } }
const GL_UNIFORMS = ["uFrame", "uRiv", "uOrigin", "uScale", "uH", "uMode", "uOne", "uSea", "uHill", "uMtn", "uMoist", "uSeed", "uLand", "uTowns", "uNTowns", "uPits", "uNPits", "uVillages", "uVGrid", "uTownIdx", "uRV", "uRCell", "uRList", "uRivOn"];
/* The painters this game can use, best first. The full map is three small programs drawn one over another (land and
   rivers; towns; river water and quays inside towns), because one huge program is too much for some graphics
   drivers (Windows translates every shader for DirectX, and a very long one can fail there). */
function glPlans() {
  const full = glShaderSource(), v = (src, defs) => src.replace("#version 300 es", "#version 300 es\n" + defs);
  const plans = [
    { name: "full map", parts: [v(full, "#define PASS 1"), v(full, "#define PASS 2")] },
    { name: "full map with lighter cities", parts: [v(full, "#define PASS 1"), v(full, "#define PASS 2\n#define CITY_LITE")] },
  ];
  if (typeof glShaderSourceSafe === "function") plans.push({ name: "the simpler map from version 26", parts: [glShaderSourceSafe()], simple: true });
  return plans;
}
function glInit() {
  if (GLMAP.tried) return GLMAP.ok;
  GLMAP.tried = true;
  try {
    if (typeof document === "undefined" || window.__noWebGL || typeof glShaderSource !== "function") { GLMAP.note = "old tile map (WebGL not used)"; return false; }
    const cv = document.createElement("canvas");
    const gl = cv.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) { GLMAP.note = "old tile map: the browser gave no WebGL 2 (switched off, or blocked after a graphics crash)"; return false; }
    const build = String(GAME_BUILD);
    // a plan that failed on this computer before (or stopped the page while it was being prepared) is not tried again
    const failed = (lsGet(MAPKEY.fail) || "").split(",");
    const tryingBefore = lsGet(MAPKEY.trying);
    if (tryingBefore && tryingBefore.startsWith(build + ":")) failed.push(tryingBefore);
    const notes = [];
    let chosen = null;
    for (const [pi, plan] of glPlans().entries()) {
      const key = build + ":" + pi;
      if (failed.includes(key) && !window.__retryMap) { notes.push(plan.name + ": skipped (failed here before)"); continue; }
      lsSet(MAPKEY.trying, key);
      const progs = [];
      let err = null;
      for (const [k, src] of plan.parts.entries()) {
        const r = glBuild(gl, src);
        if (r.err) { err = (plan.parts.length > 1 ? `part ${k + 1}: ` : "") + r.err; break; }
        progs.push(r.prog);
      }
      lsSet(MAPKEY.trying, null);
      if (err) {
        notes.push(plan.name + " could not start (" + err + ")");
        console.warn("map:", plan.name, err);
        lsSet(MAPKEY.fail, [...failed.filter(f => f.startsWith(build + ":")), key].join(","));
        continue;
      }
      chosen = { plan, progs, pi };
      break;
    }
    if (!chosen) { GLMAP.note = notes.join(" · ") + " · using the old tile map"; return false; }
    gl.useProgram(chosen.progs[0]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    GLMAP.progs = chosen.progs.map(prog => {
      const U = {};
      for (const n of GL_UNIFORMS) U[n] = gl.getUniformLocation(prog, n);
      const loc = gl.getAttribLocation(prog, "a");
      return { prog, U, loc };
    });
    GLMAP.prog = chosen.progs[0]; GLMAP.U = GLMAP.progs[0].U;
    const mk = (unit, filter) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    GLMAP.tex.land = mk(0, gl.LINEAR);
    GLMAP.tex.towns = mk(1, gl.NEAREST);
    GLMAP.tex.pits = mk(2, gl.NEAREST);
    GLMAP.tex.vill = mk(3, gl.NEAREST);
    GLMAP.tex.tidx = mk(4, gl.NEAREST);
    GLMAP.tex.rv = mk(5, gl.NEAREST); GLMAP.tex.rcell = mk(6, gl.NEAREST); GLMAP.tex.rlist = mk(7, gl.NEAREST);
    Object.assign(GLMAP, { gl, canvas: cv, ok: true, simple: !!chosen.plan.simple });
    glEachProg(U => {
      gl.uniform1i(U.uLand, 0); gl.uniform1i(U.uTowns, 1); gl.uniform1i(U.uPits, 2); gl.uniform1i(U.uVillages, 3);
      gl.uniform1i(U.uTownIdx, 4); gl.uniform1i(U.uRV, 5); gl.uniform1i(U.uRCell, 6); gl.uniform1i(U.uRList, 7);
      if (U.uOne) gl.uniform1i(U.uOne, 1);
      if (U.uFrame) gl.uniform1i(U.uFrame, 8);
      if (U.uRiv) gl.uniform1i(U.uRiv, 9);
    });
    // the first part draws into two pictures (the land, and where the rivers are) that the second part reads
    if (GLMAP.progs.length > 1) {
      GLMAP.tex.frame = mk(8, gl.NEAREST); GLMAP.tex.riv = mk(9, gl.NEAREST);
      GLMAP.fbo = gl.createFramebuffer(); GLMAP.fboSize = [0, 0];
    }
    GLMAP.note = (notes.length ? notes.join(" · ") + " · using " : "") + chosen.plan.name + " (version " + build + ")";
    // if the graphics card gives up later, remember it and carry on with the tile painter
    cv.addEventListener("webglcontextlost", e => {
      e.preventDefault();
      lsSet(MAPKEY.fail, [...(lsGet(MAPKEY.fail) || "").split(",").filter(f => f.startsWith(build + ":")), build + ":" + chosen.pi].join(","));
      GLMAP.ok = false; GLMAP.note = "The graphics card stopped while drawing the map (" + chosen.plan.name + "); the old map is used until the page is reloaded, then a lighter map is tried";
      ZOOM.max = 5;
      if (view.zoom > ZOOM.max) { view.zoom = ZOOM.max; view.cs = view.base * view.zoom; clampCamera(); }
      try { resetTerrain(world); view.staticKey = ""; renderAll(); } catch (err) { console.warn(err); }
    });
    glUploadEmpty();
    ZOOM.max = 1000;   // down to about three metres a pixel
    return true;
  } catch (e) { console.warn("map: WebGL 2 not used", e); GLMAP.note = "Map error: " + (e && e.message || e); GLMAP.ok = false; return false; }
}
/* Set uniforms in every program of the map painter. */
function glEachProg(fn) {
  const gl = GLMAP.gl;
  for (const P of GLMAP.progs || []) { gl.useProgram(P.prog); fn(P.U, P); }
}
function glTex(unit, tex, w, h, internal, format, type, data) {
  const gl = GLMAP.gl;
  gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
}
function glUploadEmpty() {
  const gl = GLMAP.gl;
  glTex(0, GLMAP.tex.land, GRID_W, GRID_H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(N_CELLS * 4));
  glTex(1, GLMAP.tex.towns, 1, 2, gl.RGBA32F, gl.RGBA, gl.FLOAT, new Float32Array(8));
  glTex(2, GLMAP.tex.pits, 1, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, new Float32Array(4));
  glTex(3, GLMAP.tex.vill, 1, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, new Float32Array(4));
  glTex(4, GLMAP.tex.tidx, GRID_W, GRID_H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(N_CELLS * 4));
  glTex(5, GLMAP.tex.rv, 5, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, new Float32Array(20));
  glTex(6, GLMAP.tex.rcell, GRID_W, GRID_H, gl.RGBA32F, gl.RGBA, gl.FLOAT, new Float32Array(N_CELLS * 4));
  glTex(7, GLMAP.tex.rlist, 1, 1, gl.R32F, gl.RED, gl.FLOAT, new Float32Array(1));
  GLMAP.nTowns = 0; GLMAP.nPits = 0; GLMAP.rivOn = 0;
}
/* A town's random number, shared by the painter (its streets) and the cars driving on them. */
function townHash(id) { return hash2(id, 7, 991); }
/* Each nation builds its towns its own way: straight grids and superblocks (0), boulevards meeting at star squares (1),
   or old-world quarters of crooked streets (2). Dry lands lean to grids. */
function townStyle(t) {
  const h = hash2(t.owner + 3, 11, (world && world.seed) || 0);
  const m = moistureAt(world.seed, t.x, t.y);
  let s = m < 0.25 && h < 0.5 ? 0 : h < 0.34 ? 0 : h < 0.67 ? 1 : 2;
  // most towns follow their nation's way of building, but about one in four grew up differently
  const own = hash2(t.id, 12, world.seed + 3);
  if (own < 0.35) s = (s + 1 + Math.floor(own * 5.8)) % 3;
  return s;
}
/* What makes each town itself: the way it stretches (along its river or coast, or in a direction of its own), its
   colours and how green it is, and the things only some towns have: a great park, canals, rows of terraced houses,
   a skyline of towers. */
function townPersona(t, geo) {
  const s = (world && world.seed) || 0, h = k => hash2(t.id, 40 + k, s + 77);
  const Ru = t.r * 0.62;
  let axis = h(1) * Math.PI, elong = 1.0 + 0.5 * h(2), river = 0;
  // a big river through or beside the town: the town lines its banks
  if (typeof RIVNET !== "undefined" && RIVNET.rivers) {
    let best = null, bd = Ru * 0.6;
    for (const rv of RIVNET.rivers) for (let i = 0; i < (rv.V || []).length - 1; i++) {
      const v = rv.V[i]; if (v.size < 0.22) continue;
      const d = Math.hypot(v.x - t.x, v.y - t.y); if (d < bd) { bd = d; best = [v, rv.V[i + 1]]; }
    }
    if (best) { axis = Math.atan2(best[1].y - best[0].y, best[1].x - best[0].x); elong = 1.45 + 0.4 * h(3); river = 1; }
  }
  // by the sea: along the coast
  if (!river && geo.seaD < 1.5) { axis = Math.atan2(geo.sx, -geo.sy); elong = 1.35 + 0.45 * h(3); }
  const pop = t.pop || 0, era = t.era || 0, st = t.style !== undefined ? t.style : townStyle(t);
  const tint = h(4) * 2 - 1;                                   // warmer or cooler roofs
  const green = Math.max(0.1, (0.25 + 0.75 * h(5)) * (1 - 0.8 * geo.arid));
  const park = (pop > 2.5 && h(6) < 0.4) || (t.cap && pop > 1.5 && h(6) < 0.7) ? 1 : 0;
  const canal = st === 2 && geo.seaD < 1.2 && geo.hill < 0.3 && geo.arid < 0.5 && h(7) < 0.55 ? 1 : 0;
  const rows = st !== 2 && geo.arid < 0.55 && h(8) < 0.6 ? 1 : 0;
  const sky = era >= 2 ? smooth01(1.0, 9.0, pop) * (0.55 + 0.6 * h(9)) * (1 + 0.05 * Math.min(t.office || 0, 8)) : 0.15 * smooth01(1.0, 9.0, pop);
  return { axis, elong, tint, green, park, canal, rows, sky, river };
}
/* Where a town stands: how dry, how hilly, and which way (and how far) the sea is. */
function townGeo(t) {
  const m = moistureAt(world.seed, t.x, t.y);
  const arid = 1 - smooth01(0.2, 0.45, m);
  let hill = 0, cnt = 0, best = 9, sx = 0, sy = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = Math.floor(t.x) + dx, y = Math.floor(t.y) + dy;
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
    const ter = world.terrain[y * GRID_W + x];
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) { hill += ter === T.HILLS ? 1 : ter === T.MOUNTAIN ? 1.5 : 0; cnt++; }
    if (ter === T.SEA) { const d = Math.hypot(x + 0.5 - t.x, y + 0.5 - t.y); if (d < best) { best = d; sx = (x + 0.5 - t.x) / (d || 1); sy = (y + 0.5 - t.y) / (d || 1); } }
  }
  // walk towards the sea to find the real coastline (the same height the painter draws the coast at)
  let coastD = 9;
  if (best < 3) {
    for (let s = 0; s <= 2.5; s += 0.01) {
      const x = t.x + sx * s, y = t.y + sy * s;
      if (elevationAt(world.seed, x, y) + 0.03 * (fbm(x * 1.9, y * 1.9, world.seed + 333, 4) - 0.5) <= world.seaLevel) { coastD = s; break; }
    }
  }
  return { arid, hill: Math.min(1, hill / Math.max(1, cnt)), sx, sy, seaD: coastD };
}
/* A town by the sea is built on the water: its downtown and harbour sit at the coast, so the drawn town is moved a
   little towards it (never far from the town's own square). */
function townCentre(t, geo) {
  const Ru = t.r * 0.62;
  if (geo.seaD > 2.5) return [t.x, t.y];
  const want = t.port ? 0.2 * Ru : 0.45 * Ru;           // a harbour town's centre is right by the water
  const shift = clamp(geo.seaD - want, 0, t.port ? 0.45 : 0.25);
  return [t.x + geo.sx * shift, t.y + geo.sy * shift];
}
/* What people have made of the land, sent to the graphics card whenever it changes. */
function glUpdateLand() {
  if (!GLMAP.ok || !world) return;
  const key = `${world.seed}|${LANDUSE.key}`;
  if (GLMAP.landKey === key) return;
  GLMAP.landKey = key;
  const gl = GLMAP.gl;
  const L = new Uint8Array(N_CELLS * 4);
  const has = LANDUSE.crop.length === N_CELLS;
  for (let i = 0; i < N_CELLS; i++) {
    if (!has) break;
    L[i * 4] = Math.round(clamp(LANDUSE.crop[i], 0, 1) * 255);
    L[i * 4 + 1] = Math.round(clamp(LANDUSE.irr[i], 0, 1) * 255);
    L[i * 4 + 2] = Math.round(clamp(LANDUSE.thin[i] || 0, 0, 1) * 255);
  }
  glTex(0, GLMAP.tex.land, GRID_W, GRID_H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, L);
  // towns: what each one is made of, six rows per town
  //  0: x, y, radius, flags (capital 1, harbour 2)      1: industry, people, its random number, era
  //  2: heavy industry, chemicals, power stations, light industry
  //  3: offices, campuses, resorts, planning style (0 grid, 1 boulevards, 2 old world)
  //  4: dryness, hills, direction to the sea (x, y)     5: distance to the sea, nuclear, fishing, how grand (capital)
  const towns = (LANDUSE.towns || []).slice(0, 96);
  const n = Math.max(1, towns.length), ROWS = 8;
  const T = new Float32Array(n * ROWS * 4);
  const put = (row, k, a, b, c, d) => T.set([a, b, c, d], (row * n + k) * 4);
  towns.forEach((t, k) => {
    const city = game && game.cities.find(c => c.id === t.id);
    if (typeof window !== "undefined" && window.__townMod) window.__townMod(t, k);
    const geo = townGeo(t);
    if (t.arid !== undefined) geo.arid = t.arid;
    [t.gx, t.gy] = townCentre(t, geo);
    geo.seaD = Math.max(0, geo.seaD - Math.hypot(t.gx - t.x, t.gy - t.y));
    put(0, k, t.gx, t.gy, t.r, (t.cap ? 1 : 0) + (city && city.port ? 2 : 0));
    put(1, k, t.ind || 0, t.pop || 0, townHash(t.id), t.era || 0);
    put(2, k, t.heavy || 0, t.chem || 0, t.power || 0, t.light || 0);
    const st = t.style !== undefined ? t.style : townStyle(t);
    put(3, k, t.office || 0, t.campus || 0, t.resort || 0, st);
    put(4, k, geo.arid, geo.hill, geo.sx, geo.sy);
    put(5, k, geo.seaD, t.nuclear || 0, t.fishing || 0, t.cap ? 1 : 0);
    const P = Object.assign(townPersona(t, geo), t.persona || {});
    if (t.focus === "garden" && !t.persona) { P.green = Math.min(1, P.green * 1.5 + 0.2); P.park = 1; }   // a garden city: trees, lawns and a great park
    t.persona = P;
    put(6, k, P.axis, P.elong, P.tint, P.green);
    put(7, k, P.park, P.canal, P.rows, P.sky);
  });
  glTex(1, GLMAP.tex.towns, n, ROWS, gl.RGBA32F, gl.RGBA, gl.FLOAT, T);
  GLMAP.nTowns = towns.length;
  // which towns reach each map cell, so each pixel looks at no more than four
  const TI = new Uint8Array(N_CELLS * 4), cnt = new Uint8Array(N_CELLS);
  towns.forEach((t, k) => {
    const rr = t.r * 1.8, cx = t.gx ?? t.x, cy = t.gy ?? t.y;
    for (let y = Math.max(0, Math.floor(cy - rr)); y <= Math.min(GRID_H - 1, Math.floor(cy + rr)); y++)
      for (let x = Math.max(0, Math.floor(cx - rr)); x <= Math.min(GRID_W - 1, Math.floor(cx + rr)); x++) {
        const i = y * GRID_W + x;
        if (cnt[i] < 4) TI[i * 4 + cnt[i]++] = k + 1;
      }
  });
  glTex(4, GLMAP.tex.tidx, GRID_W, GRID_H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, TI);
  const pits = (LANDUSE.pits || []).slice(0, 64);
  const P = new Float32Array(Math.max(1, pits.length) * 4);
  pits.forEach((p, k) => { P[k * 4] = p.x; P[k * 4 + 1] = p.y; P[k * 4 + 2] = p.r; P[k * 4 + 3] = p.oil ? 2 : p.coal ? 1 : 0; });
  glTex(2, GLMAP.tex.pits, Math.max(1, pits.length), 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, P);
  GLMAP.nPits = pits.length;
  // villages: one may stand in each 6 km square of farmland, more where more people farm
  const VG = 0.12, VX = Math.ceil(GRID_W / VG), VY = Math.ceil(GRID_H / VG);
  const V = new Float32Array(VX * VY * 4);
  if (has) for (let cy = 0; cy < VY; cy++) for (let cx = 0; cx < VX; cx++) {
    const x = (cx + 0.5) * VG, y = (cy + 0.5) * VG;
    const c = bilinear(LANDUSE.crop, x, y);
    if (c < 0.3) continue;
    const hv = hash2(cx, cy, world.seed + 7100);
    if (hv > 0.6 * c) continue;
    if (towns.some(t => Math.hypot(x - t.x, y - t.y) < t.r * 1.15)) continue;
    if (elevationAt(world.seed, x, y) + 0.03 * (fbm(x * 1.9, y * 1.9, world.seed + 333, 4) - 0.5) <= world.seaLevel + 0.003) continue;
    const o = (cy * VX + cx) * 4;
    V[o] = 0.2 + 0.6 * hash2(cx, cy, world.seed + 7101);
    V[o + 1] = 0.2 + 0.6 * hash2(cx, cy, world.seed + 7102);
    V[o + 2] = (0.004 + 0.007 * hash2(cx, cy, world.seed + 7103)) * (hv < 0.04 ? 2.5 : 1);
    V[o + 3] = 1;
  }
  glTex(3, GLMAP.tex.vill, VX, VY, gl.RGBA32F, gl.RGBA, gl.FLOAT, V);
  GLMAP.vgrid = [VX, VY];
}
function glSetWorld(w) {
  if (!GLMAP.ok) return;
  const gl = GLMAP.gl;
  glEachProg(U => { gl.uniform1f(U.uSea, w.seaLevel); gl.uniform1f(U.uHill, w.hillLevel); gl.uniform1f(U.uMtn, w.mountainLevel); gl.uniform1f(U.uMoist, w.moistLevel); gl.uniform1i(U.uSeed, w.seed); });
  GLMAP.landKey = null;
  glUploadEmpty();
  // the rivers, worked out once for each world
  try {
    const R = buildRiverNet(w);
    if (R.nVerts > 1) {
      glTex(5, GLMAP.tex.rv, R.vtW, R.vtH, gl.RGBA32F, gl.RGBA, gl.FLOAT, R.verts);
      glTex(6, GLMAP.tex.rcell, GRID_W, GRID_H, gl.RGBA32F, gl.RGBA, gl.FLOAT, R.cells);
      glTex(7, GLMAP.tex.rlist, R.lW, R.lH, gl.R32F, gl.RED, gl.FLOAT, R.list);
      GLMAP.rivOn = 1;
    }
  } catch (e) { console.warn("rivers:", e); GLMAP.rivOn = 0; }
}
/* Draw the land for the current view into a 2D context (kind "img"), or just where land is ("mask"). While the
   camera moves, a coarser picture is drawn so it stays smooth; the sharp one follows when it stops. */
function glDrawTerrain(c, kind) {
  const gl = GLMAP.gl, U = GLMAP.U, cv = GLMAP.canvas;
  if (kind === "img") {
    const now = performance.now();
    const moving = now - GLMAP.lastDraw < 140;
    GLMAP.lastDraw = now;
    GLMAP.low = moving;
    clearTimeout(GLMAP.timer);
    if (moving) GLMAP.timer = setTimeout(() => { view.staticKey = ""; GLMAP.lastDraw = 0; scheduleMapRender(); }, 180);
  }
  // how sharp: adjusted to how fast this computer's graphics card turns out to be
  const q = GLMAP.low ? GLMAP.qMove : GLMAP.qIdle;
  const t0 = performance.now();
  const W = Math.max(1, Math.round(canvas.width * q)), H = Math.max(1, Math.round(canvas.height * q));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  gl.viewport(0, 0, W, H);
  const cellsPerPx = 1 / (view.cs * view.dpr * q);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.imageSmoothingEnabled = true;
  // the land (and where the rivers are) first; then, where towns are on screen, the towns over it
  const x0 = -view.ox / view.cs, y0 = -view.oy / view.cs, x1 = x0 + view.vw / view.cs, y1 = y0 + view.vh / view.cs;
  const townsOn = kind !== "mask" && GLMAP.progs.length > 1 && (LANDUSE.towns || []).some(t => { const cx = t.gx ?? t.x, cy = t.gy ?? t.y, r = t.r * 1.8; return cx + r > x0 && cx - r < x1 && cy + r > y0 && cy - r < y1; });
  const setU = P => {
    const U = P.U;
    gl.useProgram(P.prog);
    gl.enableVertexAttribArray(P.loc); gl.vertexAttribPointer(P.loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(U.uOrigin, -view.ox / view.cs, -view.oy / view.cs);
    gl.uniform1f(U.uScale, cellsPerPx);
    gl.uniform1f(U.uH, H);
    gl.uniform1i(U.uMode, kind === "mask" ? 1 : 0);
    gl.uniform1i(U.uNTowns, GLMAP.nTowns); gl.uniform1i(U.uNPits, GLMAP.nPits); gl.uniform1i(U.uRivOn, GLMAP.rivOn || 0);
    gl.uniform2i(U.uVGrid, (GLMAP.vgrid || [1, 1])[0], (GLMAP.vgrid || [1, 1])[1]);
  };
  if (townsOn) {
    if (GLMAP.fboSize[0] !== W || GLMAP.fboSize[1] !== H) {
      for (const [unit, tex] of [[8, GLMAP.tex.frame], [9, GLMAP.tex.riv]]) glTex(unit, tex, W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, GLMAP.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, GLMAP.tex.frame, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, GLMAP.tex.riv, 0);
      GLMAP.fboSize = [W, H];
    }
    // the land into the two pictures (unbound from the texture units while they are drawn into)
    gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, GLMAP.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    setU(GLMAP.progs[0]);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, GLMAP.tex.frame);
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, GLMAP.tex.riv);
    setU(GLMAP.progs[1]);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    setU(GLMAP.progs[0]);
  }
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  c.drawImage(cv, 0, 0, canvas.width, canvas.height);
  if (kind === "img") {
    const dt = performance.now() - t0;
    if (GLMAP.low) GLMAP.qMove = clamp(GLMAP.qMove * (dt > 28 ? 0.85 : dt < 12 ? 1.08 : 1), 0.3, 0.7);
    else GLMAP.qIdle = clamp(GLMAP.qIdle * (dt > 160 ? 0.9 : dt < 70 ? 1.05 : 1), 0.6, 1);
  }
  return false;
}

/* ---------- Rivers close up: the same rivers, meandering, as wide as they really are ---------- */
function fineRiverPaths() {
  if (riverCache.fine && riverCache.fineSeed === riverCache.seed) return riverCache.fine;
  const seed = riverCache.seed, out = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  (riverCache.lines || []).forEach((list, cls) => {
    for (const sm of list) {
      const fine = [];
      for (let i = 0; i < sm.length - 1; i++) {
        const [x0, y0] = sm[i], [x1, y1] = sm[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.02));
        const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
        for (let k = 0; k < n; k++) {
          const t = k / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
          const off = 0.035 * (valueNoise(x * 9, y * 9, seed + 805) - 0.5) + 0.012 * (valueNoise(x * 31, y * 31, seed + 806) - 0.5);
          fine.push(i === 0 && k === 0 ? [x, y] : [x + nx / nl * off, y + ny / nl * off]);
        }
      }
      fine.push(sm[sm.length - 1]);
      const s2 = chaikin(fine, false, 2);
      out[cls].moveTo(s2[0][0], s2[0][1]);
      for (let i = 1; i < s2.length; i++) out[cls].lineTo(s2[i][0], s2[i][1]);
    }
  });
  riverCache.fine = out; riverCache.fineSeed = seed;
  return out;
}

/* ---------- Life in the towns: cars on the main roads, seen when you are close ---------- */
function drawTownTraffic(c, cs, now) {
  if (!GLMAP.ok || cs < 160 || !LANDUSE.towns) return;
  const t = now / 1000;
  const x0 = -view.ox / cs, y0 = -view.oy / cs, x1 = x0 + view.vw / cs, y1 = y0 + view.vh / cs;
  const carPx = clamp(4.5 / 50000 * cs, 1.2, 3.2);
  const colors = ["#f2f0ea", "#d9d6cf", "#b8382f", "#2f4f86", "#1d1d1d", "#cfa63a", "#8a8f96"];
  for (const tw of LANDUSE.towns) {
    const twx = tw.gx ?? tw.x, twy = tw.gy ?? tw.y;
    if (twx + tw.r * 1.3 < x0 || twx - tw.r * 1.3 > x1 || twy + tw.r * 1.3 < y0 || twy - tw.r * 1.3 > y1) continue;
    const hh = townHash(tw.id), N = 5 + Math.floor(hh * 4), a0 = hh * 43.98, R = tw.r;
    for (let k = 0; k < N; k++) {
      const ang = a0 + k * 2 * Math.PI / N + 0.15 * Math.sin(k * 1.7 + a0);
      const cars = Math.round(60 * R);
      for (let j = 0; j < cars; j++) {
        const lane = j % 2 ? 1 : -1;
        const sp = 0.012 + 0.01 * hash2(tw.id * 13 + k, j, 77);          // cells a second
        let d = ((hash2(tw.id, k * 97 + j, 78) * 1.25 * R + sp * t * lane) % (1.25 * R) + 1.25 * R) % (1.25 * R);
        const s01 = clamp(d / (0.2 * R), 0, 1), wob = 0.12 * Math.sin(d / R * 5 + k * 2.1) * s01 * s01 * (3 - 2 * s01);
        const th = ang + wob + lane * (9 / 50000) / Math.max(d, 1e-4);
        const x = twx + d * Math.cos(th), y = twy + d * Math.sin(th);
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        c.fillStyle = colors[(j * 7 + k) % colors.length];
        c.fillRect(x * cs - carPx / 2, y * cs - carPx / 2, carPx, carPx);
      }
    }
  }
}

/* ---------- Rivers as they really behave (for the graphics card) ----------
   The same rivers as the game's (rain runs downhill), but each one now knows how much water it carries, how steep
   its bed is and how much gravel and mud the mountains upstream give it. From that it takes its shape:
   - steep mountain streams run narrow and fairly straight in deep valleys;
   - rivers leaving the mountains with a heavy load of gravel spread over a wide bed of sand bars and braided channels;
   - slow lowland rivers meander in loops that grow until they are cut off, leaving oxbow lakes, with sand on the
     inside of each bend and old banks (scroll bars) behind it;
   - a river widens downstream as it gathers water (width grows with the flow), and opens into a mouth at the sea.
   Water is muddy where the river carries sediment and dark where it is clear. Tributaries join the main channel
   itself, wherever its loops have wandered. Each pixel works its shape out from these numbers on the graphics card. */
const RIVNET = { seed: null, verts: null, nVerts: 0, rivers: [] };
const RN_STRIDE = 5;   // texels per vertex
function rnVn(x, y, seed) { return valueNoise(x, y, seed); }
/* the channel's position at valley distance u, in the river's own frame: (along, across) */
function rnChanPt(seed, rid, phiV, sV, k, A, beta, u, kq = 0) {
  const phl = phiV + k * (u - sV) + kq * (u - sV) * (u - sV);
  const ph = phl + 6.0 * (rnVn(phl * 0.06, rid * 7.31, seed + 8800) - 0.5) + 2.2 * (rnVn(phl * 0.21, rid * 7.31 + 9.7, seed + 8803) - 0.5);
  let am = rnVn(phl * 0.16, rid * 7.31 + 3.3, seed + 8801); am = 0.2 + 1.6 * am * am;
  const bm = 0.3 + 1.4 * rnVn(phl * 0.1, rid * 7.31 + 6.1, seed + 8802);
  const wander = 1.8 * (rnVn(phl * 0.045, rid * 7.31 + 1.7, seed + 8804) - 0.5);
  return [u - Math.min(beta * bm, 0.95) / k * Math.sin(2 * ph), A * (am * Math.sin(ph) + wander)];
}
function buildRiverNet(w) {
  if (RIVNET.seed === w.seed) return RIVNET;
  const F = riverField(w);
  const { R, GW, N, land, down, acc } = F;
  const seed = w.seed;
  const TH = 75;
  // where the land is high, and how much of each river's water (and gravel) came down from hills and mountains
  const rain = new Float32Array(N), sedAcc = new Float32Array(N), indeg = new Int32Array(N);
  for (let p = 0; p < N; p++) {
    if (!land[p]) continue;
    const x = ((p % GW) + 0.5) / R, y = (((p / GW) | 0) + 0.5) / R;
    const e = elevationAt(seed, x, y);
    rain[p] = 0.4 + moistureAt(seed, x, y);
    sedAcc[p] = rain[p] * smooth01(w.hillLevel - 0.01, w.mountainLevel + 0.03, e);
    if (down[p] >= 0 && land[down[p]]) indeg[down[p]]++;
  }
  const queue = [];
  for (let p = 0; p < N; p++) if (land[p] && !indeg[p]) queue.push(p);
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi], d = down[p];
    if (d >= 0 && land[d]) { sedAcc[d] += sedAcc[p]; if (--indeg[d] === 0) queue.push(d); }
  }
  // trace the rivers from each mouth upstream, always following the bigger branch, so a great river stays one line
  // from source to sea and every tributary is smaller than the river it joins (the same paths as the game's rivers)
  const ups = new Int32Array(N).fill(-1), nextUp = new Int32Array(N).fill(-1);
  for (let p = 0; p < N; p++) if (land[p] && acc[p] >= TH && down[p] >= 0) { const d = down[p]; nextUp[p] = ups[d]; ups[d] = p; }
  const rivers = [];
  const starts = [];
  for (let p = 0; p < N; p++) if (land[p] && acc[p] >= TH && down[p] >= 0 && !land[down[p]]) starts.push([p, -1]);
  starts.sort((x, y) => acc[y[0]] - acc[x[0]]);
  for (let si = 0; si < starts.length; si++) {
    const [mouth, parent] = starts[si];
    const up = [];   // from the mouth (or the junction) upstream
    if (parent >= 0) up.push(down[mouth]);   // the junction point on the river it joins
    let p = mouth;
    while (p >= 0) {
      up.push(p);
      let best = -1;
      for (let q = ups[p]; q >= 0; q = nextUp[q]) if (best < 0 || acc[q] > acc[best]) best = q;
      for (let q = ups[p]; q >= 0; q = nextUp[q]) if (q !== best) starts.push([q, rivers.length]);
      p = best;
    }
    const pts = up.reverse();
    if (pts.length < 4) continue;
    const xy = pts.map((q, i) => {
      const x = ((q % GW) + 0.5) / R, y = (((q / GW) | 0) + 0.5) / R;
      const j = i === 0 || i === pts.length - 1 ? 0 : 0.42;
      return [x + j * (valueNoise(x * 1.4, y * 1.4, seed + 801) - 0.5) + 0.12 * (valueNoise(x * 4, y * 4, seed + 803) - 0.5), y + j * (valueNoise(x * 1.4, y * 1.4, seed + 802) - 0.5) + 0.12 * (valueNoise(x * 4, y * 4, seed + 804) - 0.5)];
    });
    const last = pts.length - 1;
    const toSea = parent < 0;
    if (toSea) pts.push(down[mouth]), xy.push([((down[mouth] % GW) + 0.5) / R, (((down[mouth] / GW) | 0) + 0.5) / R]);
    const L2 = pts.length - 1;
    // the river's flow and load at each point (where it joins another, it keeps its own)
    const own = i => (i === L2 ? pts[L2 - 1] : pts[i]);
    const flow = pts.map((_, i) => acc[own(i)]);
    const sed = pts.map((_, i) => sedAcc[own(i)] / Math.max(1e-6, acc[own(i)]));
    rivers.push({ pts, xy, flow, sed, joins: parent, toSea });
  }
  // smooth and space the points evenly (about every 3.5 km); carry flow and load along
  const STEP = 0.07;
  const allV = [];
  rivers.forEach((rv, ri) => {
    const sm = chaikin(rv.xy, false, 2);
    if (rv.toSea) {   // run on a little past the coast so the mouth reaches the sea
      const a = sm[sm.length - 2], b = sm[sm.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      sm.push([b[0] + (b[0] - a[0]) / l * 0.15, b[1] + (b[1] - a[1]) / l * 0.15]);
    }
    if (rv.joins >= 0) {   // end on the river it joins (its smoothed line), not beside it
      const tg = rivers[rv.joins].res;
      if (tg) {
        const e = sm[sm.length - 1];
        let bd = 1e9, bp = null;
        for (let i = 0; i < tg.x.length - 1; i++) {
          const ax = tg.x[i], ay = tg.y[i], dx = tg.x[i + 1] - ax, dy = tg.y[i + 1] - ay;
          const t = clamp(((e[0] - ax) * dx + (e[1] - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
          const d = Math.hypot(ax + dx * t - e[0], ay + dy * t - e[1]);
          if (d < bd) { bd = d; bp = [ax + dx * t, ay + dy * t]; }
        }
        if (bp) sm[sm.length - 1] = bp;
      }
    }
    // arc length of the smoothed line, and a map back to the original points (by share of length)
    const cum = [0];
    for (let i = 1; i < sm.length; i++) cum.push(cum[i - 1] + Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]));
    const total = cum[cum.length - 1];
    const n = Math.max(2, Math.ceil(total / STEP) + 1);
    const X = [], Y = [], S = [], FL = [], SD = [];
    let j = 0;
    const origN = rv.pts.length - 1;
    for (let k = 0; k < n; k++) {
      const s = total * k / (n - 1);
      while (j < sm.length - 2 && cum[j + 1] < s) j++;
      const t = clamp((s - cum[j]) / ((cum[j + 1] - cum[j]) || 1), 0, 1);
      X.push(sm[j][0] + (sm[j + 1][0] - sm[j][0]) * t); Y.push(sm[j][1] + (sm[j + 1][1] - sm[j][1]) * t); S.push(s);
      const fi = Math.min(origN, (s / (total || 1)) * origN * (rv.toSea ? (total / Math.max(1e-6, total - 0.15)) : 1));
      const i0 = Math.min(origN, Math.floor(fi)), i1 = Math.min(origN, i0 + 1), ft = fi - i0;
      FL.push(rv.flow[i0] + (rv.flow[i1] - rv.flow[i0]) * ft);
      SD.push(rv.sed[i0] + (rv.sed[i1] - rv.sed[i0]) * ft);
    }
    rv.res = { x: X, y: Y, s: S, flow: FL, sed: SD };
    // what kind of river each stretch is
    const E = X.map((x, i) => elevationAt(seed, x, Y[i]));
    const Es = E.map((_, i) => { let a = 0, c = 0; for (let k = -3; k <= 3; k++) { const q = clamp(i + k, 0, n - 1); a += E[q]; c++; } return a / c; });
    const rh = hash2(ri, 3, seed + 8810);
    const V = [];
    let phi = hash2(ri, 1, seed + 8811) * 6.2832;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 4), i1 = Math.min(n - 1, i + 4);
      const slope = Math.max(0, (Es[i0] - Es[i1]) / Math.max(1e-6, S[i1] - S[i0]));       // height lost per cell
      const flow = FL[i], size = clamp(Math.log(flow / 75) / Math.log(3000 / 75), 0, 1);
      const wM = clamp(22 * Math.pow(flow / 75, 0.8), 12, 1400);
      let wc = wM / 50000;
      const e = Es[i];
      const conf = smooth01(w.hillLevel - 0.005, w.mountainLevel + 0.02, e);             // hemmed in by hills and mountains
      const m = moistureAt(seed, X[i], Y[i]);
      const arid = 1 - smooth01(0.2, 0.45, m);
      const steep = smooth01(0.02, 0.09, slope);
      // braided: plenty of gravel from the mountains, a fair slope, and out of the narrow valleys
      const braid = smooth01(0.3, 0.6, SD[i]) * smooth01(0.008, 0.03, slope) * (1 - 0.85 * conf) * smooth01(0.12, 0.35, size);
      // meandering: gentle slopes out in the plains
      const mea = (1 - steep) * (1 - conf) * (1 - smooth01(0.006, 0.03, slope) * 0.6);
      const lam = (12 + 7 * valueNoise(S[i] * 0.6, ri * 3.7, seed + 8812)) * wc;
      const k = 6.2832 / lam;
      let A = lam * (0.06 + 0.34 * mea) * (1 - 0.8 * braid) * (0.6 + 0.4 * size) + 0.4 * wc * conf;   // small streams wander less
      let beta = (0.1 + 0.75 * mea) * (1 - braid);
      // calm near the source; straightening as it reaches the river it joins; opening into a mouth at the sea
      A *= smooth01(0, 0.35, S[i]);
      const toEnd = S[n - 1] - S[i];
      if (!rv.toSea) { const tp = smooth01(0.15 * lam, 1.0 * lam, toEnd); A *= tp; beta *= tp; }
      let est = 0;
      if (rv.toSea) { est = 1 - smooth01(0.1, 0.6, toEnd); wc *= 1 + 2.5 * est * est; A *= 1 - est; beta *= 1 - est; }
      const turbRaw = 0.12 + 0.95 * SD[i] + 0.45 * (rh - 0.5) + 0.25 * arid * size;
      const turb = smooth01(0.25, 0.6, turbRaw);   // rivers are either clearly muddy or clear and dark
      const oxb = mea * (0.25 + 0.6 * hash2(ri, 5, seed + 8813));
      // valleys: deep and steep-sided in the mountains, a canyon where a dry plateau is cut by a river, shallow in the plains
      const vD = 0.0012 + 0.028 * conf + 0.025 * arid * smooth01(w.hillLevel - 0.02, w.hillLevel + 0.02, e) * (1 - conf);
      V.push({ x: X[i], y: Y[i], s: S[i], phi: 0, w: wc, A, beta, k, braid, turb, conf, arid, vD, oxb, est, size });
    }
    // the loops' rhythm changes smoothly (even where a tributary suddenly adds water), and the phase follows it exactly
    const ks = V.map((_, i) => { let a = 0, c = 0; for (let q = -6; q <= 6; q++) { const vv = V[clamp(i + q, 0, n - 1)]; a += 1 / vv.k; c++; } return c / a; });
    for (let i = 0; i < n; i++) V[i].k = ks[i];
    for (let i = 0; i < n; i++) { V[i].phi = phi; if (i < n - 1) phi += 0.5 * (V[i].k + V[i + 1].k) * (S[i + 1] - S[i]); }
    rv.V = V;
  });
  // tributaries join the main channel where its loops have wandered: move each joining end onto that channel
  rivers.forEach((rv, ri) => {
    if (rv.joins < 0 || !rv.V || rv.V.length < 3) return;
    const tg = rivers[rv.joins].V;
    if (!tg) return;
    const end = rv.V[rv.V.length - 1], app = rv.V[Math.max(0, rv.V.length - 3)];
    let bi = 0, bd = 1e9;
    for (let i = 0; i < tg.length; i++) { const d = Math.hypot(tg[i].x - end.x, tg[i].y - end.y); if (d < bd) { bd = d; bi = i; } }
    const vi = Math.min(bi, tg.length - 2), v = tg[vi];
    const lam = 6.2832 / v.k;
    let best = null, bdist = 1e9;
    for (let q = -24; q <= 24; q++) {
      const u = tg[bi].s + q * lam / 32;
      // the frame at u: find the segment
      let si = vi; while (si > 0 && tg[si].s > u) si--; while (si < tg.length - 2 && tg[si + 1].s < u) si++;
      const a = tg[si], b = tg[si + 1], t = clamp((u - a.s) / ((b.s - a.s) || 1), 0, 1);
      const [cu, cn] = rnChanPt(seed, rv.joins + 1, a.phi, a.s, a.k, a.A + (b.A - a.A) * t, a.beta + (b.beta - a.beta) * t, u, 0.5 * (b.k - a.k) / ((b.s - a.s) || 1));
      let s2 = si; while (s2 > 0 && tg[s2].s > cu) s2--; while (s2 < tg.length - 2 && tg[s2 + 1].s < cu) s2++;
      const a2 = tg[s2], b2 = tg[s2 + 1], t2 = clamp((cu - a2.s) / ((b2.s - a2.s) || 1), 0, 1);
      const bx = a2.x + (b2.x - a2.x) * t2, by = a2.y + (b2.y - a2.y) * t2;
      const nrm = rnNormalAt(tg, s2, t2);
      const px = bx + nrm[0] * cn, py = by + nrm[1] * cn;
      const d = Math.hypot(px - app.x, py - app.y);
      if (d < bdist) { bdist = d; best = [px, py]; }
    }
    if (best) {
      // bend the last stretch over gently, so no sharp corner is made
      const dx = best[0] - end.x, dy = best[1] - end.y, L = Math.hypot(dx, dy);
      const m = Math.min(rv.V.length - 1, Math.max(3, Math.ceil(L / 0.03) + 2));
      for (let q = 0; q <= m; q++) { const wq = 1 - q / m, f = wq * wq * (3 - 2 * wq); const vv = rv.V[rv.V.length - 1 - q]; vv.x += dx * f; vv.y += dy * f; }
    }
  });
  // normals at every point (the frame each pixel is measured in)
  rivers.forEach(rv => { if (!rv.V) return; const V = rv.V; for (let i = 0; i < V.length; i++) { const a = V[Math.max(0, i - 1)], b = V[Math.min(V.length - 1, i + 1)]; const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; V[i].nx = -(b.y - a.y) / l; V[i].ny = (b.x - a.x) / l; } });
  // pack for the graphics card: 5 texels per point; and for every map cell, the points whose stretch can reach it
  let nV = 0;
  rivers.forEach(rv => { if (rv.V) { rv.base = nV; nV += rv.V.length; } });
  const TW = 1024, TH_ = Math.max(1, Math.ceil(nV * RN_STRIDE / TW));
  const T = new Float32Array(TW * TH_ * 4);
  const lists = Array.from({ length: N_CELLS }, () => []);
  rivers.forEach((rv, ri) => {
    if (!rv.V) return;
    rv.V.forEach((v, i) => {
      const o = (rv.base + i) * RN_STRIDE * 4;
      const ends = (i === 0 ? 1 : 0) + (i >= rv.V.length - 2 ? 2 : 0);
      T.set([v.x, v.y, v.s, v.phi, v.nx, v.ny, v.w, v.A, v.beta, v.k, v.braid, v.turb, v.conf, v.arid, v.vD, ri + 1, v.oxb, v.est, v.size, ends], o);
      if (i === rv.V.length - 1) return;
      const b = rv.V[i + 1];
      const bed = v.w * (0.6 + 5 * smooth01(0.3, 0.8, v.braid));
      // as far as anything of this stretch can show: its floodplain, or the sides of its valley
      const reach = Math.max(0.17, v.A * 2.6 + 8 * v.w + bed, v.A * 2.2 + 1.5 * v.w + bed + 0.09 + 0.24 * v.conf + 0.02);
      const x0 = Math.floor(Math.min(v.x, b.x) - reach), x1 = Math.floor(Math.max(v.x, b.x) + reach);
      const y0 = Math.floor(Math.min(v.y, b.y) - reach), y1 = Math.floor(Math.max(v.y, b.y) + reach);
      for (let y = Math.max(0, y0); y <= Math.min(GRID_H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(GRID_W - 1, x1); x++) lists[y * GRID_W + x].push(rv.base + i);
    });
  });
  let total = 0; for (const l of lists) total += l.length;
  const LW = 2048, LH = Math.max(1, Math.ceil(total / LW));
  const L = new Float32Array(LW * LH), C = new Float32Array(N_CELLS * 4);
  let off = 0;
  lists.forEach((l, i) => { C[i * 4] = off; C[i * 4 + 1] = l.length; for (const v of l) L[off++] = v; });
  Object.assign(RIVNET, { seed: w.seed, verts: T, vtW: TW, vtH: TH_, nVerts: nV, list: L, lW: LW, lH: LH, cells: C, rivers, maxList: Math.max(...lists.map(l => l.length)) });
  return RIVNET;
}
function rnNormalAt(V, i, t) {
  const a = V[Math.max(0, i - 1)], b = V[Math.min(V.length - 1, i + 1)], c = V[Math.min(V.length - 1, i + 2)], d = V[i];
  const n0 = [-(b.y - a.y), b.x - a.x], n1 = [-(c.y - d.y), c.x - d.x];
  const l0 = Math.hypot(n0[0], n0[1]) || 1, l1 = Math.hypot(n1[0], n1[1]) || 1;
  const nx = n0[0] / l0 * (1 - t) + n1[0] / l1 * t, ny = n0[1] / l0 * (1 - t) + n1[1] / l1 * t, l = Math.hypot(nx, ny) || 1;
  return [nx / l, ny / l];
}

function glShaderSourceSafe() {
  return `#version 300 es
precision highp float;
precision highp int;
// One pixel of the world as a satellite sees it. Positions are in map cells (one cell = 50 km).
uniform vec2 uOrigin;     // the map point (in cells) at the top-left pixel
uniform float uScale;     // cells per pixel
uniform float uH;         // canvas height in pixels
uniform int uMode;        // 0 colour, 1 land mask
uniform sampler2D uLand;  // per map cell: farmland, irrigation, logged forest, -
uniform highp sampler2D uTowns;   // per town, two rows: (x, y, radius, flags) and (industry, people, hash, -)
uniform int uNTowns;
uniform sampler2D uTownIdx;       // per map cell: up to four towns that reach it (index + 1)
uniform highp sampler2D uPits;    // mines and oil fields: (x, y, radius, kind)
uniform int uNPits;
uniform float uSea, uHill, uMtn, uMoist;
uniform int uSeed;
uniform highp sampler2D uVillages;   // one texel per 6 km square: village position (x, y in the square), radius, 1 if there is one
uniform ivec2 uVGrid;
out vec4 outColor;

// ---------- the game's own noise, bit for bit (hash2, valueNoise, fbm) ----------
float hash2(int ix, int iy, int seed) {
  uint h = uint(ix) * 374761393u + uint(iy) * 668265263u + uint(seed) * 1442695041u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h) * (1.0 / 4294967296.0);
}
float vnoise(vec2 p, int seed) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  int ix = int(i.x), iy = int(i.y);
  float a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}
float fbm(vec2 p, int seed, int oct) {
  float s = 0.0, amp = 1.0, norm = 0.0, fq = 1.0;
  for (int o = 0; o < 8; o++) {
    if (o >= oct) break;
    s += amp * vnoise(p * fq, seed + o * 101);
    norm += amp; amp *= 0.5; fq *= 2.0;
  }
  return s / norm;
}
float ridged(vec2 p, int seed) { return 1.0 - abs(2.0 * vnoise(p, seed) - 1.0); }
// gradient noise (no square grid shows through), range about -0.7..0.7
vec2 grad2(int ix, int iy, int seed) { float a = 6.2831853 * hash2(ix, iy, seed); return vec2(cos(a), sin(a)); }
float gnoise(vec2 p, int seed) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  int ix = int(i.x), iy = int(i.y);
  float a = dot(grad2(ix, iy, seed), f), b = dot(grad2(ix + 1, iy, seed), f - vec2(1, 0));
  float c = dot(grad2(ix, iy + 1, seed), f - vec2(0, 1)), d = dot(grad2(ix + 1, iy + 1, seed), f - vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
float sstep(float a, float b, float v) { float t = clamp((v - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

// the game's continent: elevationAt and moistureAt, exactly as in the game
float elevationAt(vec2 p) {
  float nx = (p.x / 96.0) * 2.0 - 1.0, ny = (p.y / 64.0) * 2.0 - 1.0;
  float radial = sqrt(nx * nx * 0.85 + ny * ny);
  float edge = max(abs(nx), abs(ny));
  float edgeFall = edge > 0.88 ? (edge - 0.88) * 6.0 : 0.0;
  return fbm(p / 13.0, uSeed, 4) - 0.6 * pow(radial, 2.4) - edgeFall;
}
float moistureAt(vec2 p) { return fbm(p / 8.0, uSeed + 977, 3); }

// ---------- the land's height, with more detail the closer you look ----------
// how many octaves are worth drawing: down to features about 1.5 pixels across
float octFade(float freq) { float px = 1.0 / (freq * uScale); return sstep(1.2, 3.0, px); }
// features far wider than the screen hardly change across it: they are left out, fading, to save work
float octTop(float freq) { float px = 1.0 / (freq * uScale); return 1.0 - sstep(900.0, 1800.0, px); }

// the coastline: the game's own (detail down to ~3 km), then finer bays and points as you zoom in
float coastE(vec2 p) {
  float e = elevationAt(p) + 0.03 * (fbm(p * 1.9, uSeed + 333, 4) - 0.5);
  float amp = 0.03 * 0.0625, fq = 1.9 * 16.0;
  for (int o = 0; o < 9; o++) {
    float k = octFade(fq);
    if (k <= 0.0) break;
    k *= octTop(fq);
    if (k > 0.0) e += amp * k * (vnoise(p * fq, uSeed + 3400 + o * 37) - 0.5);
    amp *= 0.5; fq *= 2.0;
  }
  return e;
}
// relief on top of the coastline height: hills and mountains as in the game's painter, then fractal detail
float reliefAt(vec2 p, float e) {
  if (e <= uSea) return e;
  float up = clamp((e - uHill) / (uMtn - uHill), 0.0, 1.6);
  float r = 0.0;
  if (up > 0.0) {
    float bump = fbm(p * 0.9, uSeed + 640, 3);
    vec2 w = p + 0.9 * vec2(vnoise(p * 0.45, uSeed + 41), vnoise(p * 0.45 + vec2(5.3, 0.0), uSeed + 42));
    float r1 = ridged(w * 0.62, uSeed + 611), r2 = ridged(w * 1.35, uSeed + 612), r3 = ridged(w * 3.1, uSeed + 613);
    float ridges = r1 * r1 * 0.6 + r2 * r2 * 0.28 * (0.3 + r1) + r3 * 0.1 * r2;
    r = bump + (ridges - bump) * sstep(0.45, 1.05, up);
  }
  float h = e + min(up, 1.3) * 0.085 * r;
  // finer and finer. Mountains: sharp ridges with softer valleys between (each octave weighted by the one before);
  // lowlands: gentle swells that fade quickly, so fields stay flat
  float mt = sstep(0.15, 0.9, up);
  float amp = mix(0.0035, 0.016, mt), fq = 5.0, wgt = 1.0, gain = mix(0.36, 0.47, mt);
  vec2 q = p * fq;
  for (int o = 0; o < 12; o++) {
    float k = sstep(2.5, 5.0, 1.0 / (fq * uScale));
    if (k <= 0.0) break;
    k *= octTop(fq);
    if (k > 0.0) {
      float g = gnoise(q, uSeed + 5000 + o * 13);
      float rr = 1.0 - abs(g * 1.4); rr *= rr; rr *= wgt; wgt = clamp(rr * 1.6, 0.0, 1.0);
      h += amp * k * mix(g, rr - 0.45, mt);
    }
    q = ROT * q * 2.03 + vec2(1.7, -3.1);
    amp *= gain; fq *= 2.03;
  }
  return max(h, uSea + 0.0001);
}

// ---------- colors measured from satellite pictures ----------
const vec3 DEEP = vec3(0.039, 0.133, 0.212), OCEAN = vec3(0.055, 0.192, 0.314), MID = vec3(0.082, 0.294, 0.420), SHELF = vec3(0.133, 0.404, 0.498), SHOAL = vec3(0.247, 0.549, 0.573);
const vec3 SAND = vec3(0.788, 0.725, 0.549), WETSAND = vec3(0.553, 0.518, 0.384);
const vec3 STEPPE = vec3(0.612, 0.592, 0.388), DRYGRASS = vec3(0.498, 0.529, 0.310), GRASS = vec3(0.392, 0.478, 0.259), LUSH = vec3(0.290, 0.404, 0.208);
const vec3 SCRUB = vec3(0.337, 0.396, 0.231), HILLGRASS = vec3(0.431, 0.459, 0.282), HILLSOIL = vec3(0.490, 0.431, 0.314);
const vec3 FORESTDARK = vec3(0.106, 0.196, 0.114), FOREST = vec3(0.165, 0.275, 0.157), FORESTLIGHT = vec3(0.239, 0.365, 0.196);
const vec3 ROCK = vec3(0.420, 0.392, 0.357), ROCKLIGHT = vec3(0.604, 0.569, 0.518), ROCKDARK = vec3(0.247, 0.227, 0.204), SNOW = vec3(0.933, 0.945, 0.953), SNOWSHADE = vec3(0.667, 0.718, 0.769);
const vec3 HEDGE = vec3(0.231, 0.290, 0.165), TRACK = vec3(0.62, 0.58, 0.48), ROAD = vec3(0.55, 0.54, 0.52), ROOF1 = vec3(0.60, 0.36, 0.28), ROOF2 = vec3(0.56, 0.54, 0.52), ROOF3 = vec3(0.42, 0.40, 0.38), GARDEN = vec3(0.30, 0.40, 0.22);
// crops: the colors of real fields (sampled from a Copernicus Sentinel-2 picture of Bavarian farmland), a little livelier
vec3 cropColor(float h, float v) {
  // mostly greens, some ripe and harvested fields, a few ploughed: as in the Bavarian picture
  vec3 c;
  if (h < 0.30) c = vec3(0.30, 0.40, 0.24);
  else if (h < 0.52) c = vec3(0.36, 0.45, 0.28);
  else if (h < 0.66) c = vec3(0.44, 0.50, 0.32);
  else if (h < 0.78) c = vec3(0.56, 0.56, 0.40);
  else if (h < 0.88) c = vec3(0.66, 0.62, 0.47);
  else if (h < 0.95) c = vec3(0.50, 0.42, 0.30);
  else c = vec3(0.40, 0.50, 0.22);
  return c * (0.92 + 0.16 * v);
}
float segDist(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * t); }

// villages on a loose grid, about one every 6 km where there is farmland
const float VG = 0.12;
bool villageAt(ivec2 c, out vec2 pos, out float rad) {
  if (c.x < 0 || c.y < 0 || c.x >= uVGrid.x || c.y >= uVGrid.y) return false;
  vec4 v = texelFetch(uVillages, c, 0);
  pos = (vec2(c) + v.xy) * VG;
  rad = v.z * 1.5;
  return v.w > 0.5;
}
float cropAt(vec2 p) { return texture(uLand, p / vec2(96.0, 64.0)).r; }
float gFarm = 0.0;
vec3 landColor(vec2 p, float e, float h, vec3 n, float slope) {
  float pxm = uScale;                      // cells per pixel
  float m = moistureAt(p) + 0.07 * (vnoise(p * 2.1, uSeed + 88) - 0.5);
  // ragged edges between forest and open land, more ragged the closer you look
  float amp = 0.02, fq = 9.0;
  for (int o = 0; o < 7; o++) { float k = octFade(fq); if (k <= 0.0) break; k *= octTop(fq); if (k > 0.0) m += amp * k * (vnoise(p * fq, uSeed + 6100 + o * 7) - 0.5);  amp *= 0.62; fq *= 2.0; }
  float hillW = sstep(uHill - 0.012, uHill + 0.022, e), mtnW = sstep(uMtn - 0.01, uMtn + 0.035, e);
  float wet = sstep(0.24, 0.62, m);
  vec3 g = wet < 0.5 ? mix(STEPPE, DRYGRASS, wet * 2.0) : wet < 0.8 ? mix(DRYGRASS, GRASS, (wet - 0.5) / 0.3) : mix(GRASS, LUSH, (wet - 0.8) / 0.2);
  float mott = fbm(p * 3.3, uSeed + 120, 3) - 0.5;
  g = mix(g, mott > 0.0 ? SCRUB : STEPPE, abs(mott) * 0.4);
  // fine mottle of grass and bare ground at every scale
  float fm = 0.0; amp = 0.08; fq = 16.0;
  for (int o = 0; o < 9; o++) { float k = octFade(fq); if (k <= 0.0) break; k *= octTop(fq); if (k > 0.0) fm += amp * k * (vnoise(p * fq, uSeed + 6200 + o * 7) - 0.5);  amp *= 0.7; fq *= 2.0; }
  g *= 1.0 + fm;
  vec3 hillGround = mix(HILLGRASS, HILLSOIL, sstep(0.2, 0.7, (1.0 - wet) * 0.6 + 0.3 * fbm(p * 2.0, uSeed + 130, 3)));
  g = mix(g, hillGround, hillW * 0.85);

  vec3 farmCol = g;
  // farmland: parcels that each run their own way, hedges and tracks between them, villages and roads
  vec4 lu = texture(uLand, p / vec2(96.0, 64.0));
  float farm = lu.r > 0.03 ? sstep(0.3, 0.5, lu.r + 0.32 * (fbm(p * 1.7, uSeed + 501, 3) - 0.5)) * (1.0 - mtnW) * (1.0 - 0.55 * hillW) : 0.0;
  gFarm = farm;
  float fw = sstep(uMoist - 0.03, uMoist + 0.03, m) * (1.0 - mtnW) * (1.0 - 0.35 * hillW);
  // logging: the canopy breaks into patches first, then gives way to stumps and open ground
  if (lu.b > 0.02 && fw > 0.01) {
    float patchv = fbm(p * 2.6, uSeed + 530, 3);
    float gone = sstep(patchv - 0.15, patchv + 0.15, lu.b * 1.25);
    g = mix(g, mix(DRYGRASS, vec3(0.48, 0.40, 0.28), 0.4), gone * fw);
    fw *= 1.0 - gone;
  }
  if (farm > 0.01) {
    float ang = floor(vnoise(p * 0.9, uSeed + 510) * 5.0) * 0.35 + 0.2;
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 q = rot * p;
    vec2 bs = vec2(0.026, 0.017) * (0.75 + 0.5 * floor(vnoise(p * 0.9, uSeed + 511) * 3.0) / 2.0);
    vec2 bc = floor(q / bs), bf = q / bs - bc;
    int bx = int(bc.x), by = int(bc.y);
    // a block holds 1 to 4 strips
    float ns = 1.0 + floor(hash2(bx, by, uSeed + 512) * 5.0);
    float sid = floor(bf.x * ns);
    float fh = hash2(bx * 7 + int(sid), by, uSeed + 513);
    vec3 fc = cropColor(fh, hash2(bx * 7 + int(sid), by, uSeed + 515));
    // inside a field: almost flat colour, a little texture of the crop
    fc *= 1.0 + 0.06 * (vnoise(p * 2400.0, uSeed + 516) - 0.5) * sstep(1.0, 3.0, 0.0004 / pxm);
    // stripes of the plough and the crop rows, close up
    float rowPx = 0.00012 / pxm;
    fc *= 1.0 + 0.05 * sstep(1.5, 4.0, rowPx) * sin(bf.y * 6.2832 * 40.0);
    float blockPx = min(bs.x / ns, bs.y) / pxm;
    vec3 avg = vec3(0.40, 0.46, 0.29);
    // from further away, fields blur into a patchwork of larger parcels, each its own colour
    vec2 gs = bs * vec2(3.0, 4.0), gc = floor(q / gs);
    vec3 gcol = mix(avg, cropColor(hash2(int(gc.x), int(gc.y), uSeed + 522), hash2(int(gc.x), int(gc.y), uSeed + 523)), 0.75);
    vec3 farC = mix(avg, gcol, sstep(0.9, 2.5, min(gs.x, gs.y) / pxm));
    fc = mix(farC, fc, sstep(1.5, 4.0, blockPx));
    // hedges and farm tracks
    float edge = min(min(bf.x * ns - sid, sid + 1.0 - bf.x * ns) * bs.x / ns, min(bf.y, 1.0 - bf.y) * bs.y);
    float hedgeW = 0.00025;
    float hv = 1.0 - sstep(hedgeW * 0.5, hedgeW * 0.5 + pxm, edge);
    fc = mix(fc, hash2(bx, by, uSeed + 514) < 0.5 ? HEDGE : TRACK, hv * sstep(1.0, 3.0, hedgeW / pxm) * 0.8);
    // woodlots and copses among the fields, as in real farmland
    float wl = 0.6 * gnoise(p * 9.0, uSeed + 517) + 0.3 * gnoise(p * 27.0, uSeed + 518) + 0.1 * gnoise(p * 81.0, uSeed + 519);
    float wood = sstep(0.17, 0.172 + 30.0 * pxm, wl + 0.03 * gnoise(p * 900.0, uSeed + 521));
    vec3 woodc = mix(FORESTDARK, FOREST, 0.5 + 0.5 * gnoise(p * 300.0, uSeed + 520));
    fc = mix(fc, woodc, wood);
    // irrigated land: greener, with canals close up
    if (lu.g > 0.3) { fc = mix(fc, LUSH, 0.35 * lu.g); float cw = 0.0003; fc = mix(fc, vec3(0.24, 0.46, 0.56), lu.g * (1.0 - sstep(cw * 0.5, cw * 0.5 + pxm, abs(bf.y - 0.5) * bs.y)) * sstep(1.0, 3.0, cw / pxm)); }
    farmCol = fc;
  }
  // forest: a canopy; crowns of single trees once a pixel is smaller than a tree
  if (fw > 0.01) {
    float c1 = fbm(p * 7.0, uSeed + 77, 3);
    float crown = 0.0; amp = 0.35; fq = 40.0;
    for (int o = 0; o < 9; o++) { float k = octFade(fq); if (k <= 0.0) break; k *= octTop(fq); if (k > 0.0) crown += amp * k * (vnoise(p * fq, uSeed + 6300 + o * 7) - 0.5);  amp *= 0.75; fq *= 2.0; }
    float canopy = clamp(0.25 + 0.75 * c1 + crown, 0.0, 1.0);
    vec3 fc = canopy < 0.5 ? mix(FORESTDARK, FOREST, canopy * 2.0) : mix(FOREST, FORESTLIGHT, (canopy - 0.5) * 2.0);
    g = mix(g, fc, fw);
  }
  if (farm > 0.01) g = mix(g, farmCol, farm * (pxm < 0.02 ? 0.95 : 0.8));
  // bare rock on mountains and steep hillsides; snow on the peaks
  float rockAmt = max(mtnW * (0.65 + 0.35 * sstep(0.1, 0.5, slope)), hillW * sstep(0.55, 1.2, slope) * 0.6);
  if (rockAmt > 0.01) {
    float strata = fbm(p * 6.0, uSeed + 4105, 3);
    float sd = 0.0; amp = 0.25; fq = 24.0;
    for (int o = 0; o < 9; o++) { float k = octFade(fq); if (k <= 0.0) break; k *= octTop(fq); if (k > 0.0) sd += amp * k * (vnoise(p * fq, uSeed + 6400 + o * 7) - 0.5);  amp *= 0.7; fq *= 2.0; }
    vec3 rc = mix(mix(ROCKDARK, ROCK, sstep(0.25, 0.6, strata + sd)), ROCKLIGHT, sstep(0.62, 0.9, strata + sd));
    g = mix(g, rc, rockAmt);
  }
  float snow = sstep(uMtn + 0.075, uMtn + 0.13, h + 0.02 * n.y) * (1.0 - 0.6 * sstep(1.0, 2.0, slope));
  if (snow > 0.01) g = mix(g, mix(SNOWSHADE, SNOW, sstep(0.55, 0.9, dot(n, normalize(vec3(-0.62, -0.72, 0.7))))), snow * 0.95);

  // villages and the roads between them
  if (farm > 0.02 && pxm < 0.012) {
    ivec2 vc = ivec2(floor(p / VG));
    float best = 1e9; vec3 vcol = vec3(0.0); float vmix = 0.0;
    float road = 1e9;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      ivec2 c = vc + ivec2(i, j);
      vec2 pos; float rad;
      if (!villageAt(c, pos, rad)) continue;
      float d = length(p - pos) + rad * 0.35 * (vnoise(p * 900.0, uSeed + 7200) - 0.5);
      if (d < rad * 1.3) {
        // houses on a grid of plots, streets every few plots, gardens around
        // streets run out from the centre; houses stand along them with gardens behind
        vec2 rel = p - pos;
        float va = hash2(c.x, c.y, uSeed + 7304) * 3.14159;
        mat2 vr = mat2(cos(va), -sin(va), sin(va), cos(va));
        vec2 hp = (vr * rel) / 0.0007, hc = floor(hp), hf = hp - hc;
        float house = hash2(int(hc.x) + 4096, int(hc.y) + 4096, uSeed + 7300);
        bool street = abs(mod(hc.x, 5.0)) < 0.5 || abs(mod(hc.y, 4.0)) < 0.5;
        float inner = 1.0 - sstep(rad * 0.5, rad * 1.15, d);
        float dens = sstep(0.0, 0.8, inner);
        vec3 roof = house < 0.45 ? vec3(0.66, 0.36, 0.26) : house < 0.7 ? vec3(0.58, 0.30, 0.24) : house < 0.85 ? vec3(0.62, 0.60, 0.57) : vec3(0.40, 0.38, 0.36);
        vec3 hcol = street ? vec3(0.60, 0.59, 0.56) : (house < dens * 0.9 && hf.x > 0.15 && hf.x < 0.85 && hf.y > 0.2 && hf.y < 0.8) ? roof : mix(GARDEN, vec3(0.42, 0.48, 0.28), hash2(int(hc.x), int(hc.y), uSeed + 7305));
        float plotPx = 0.0007 / pxm;
        hcol = mix(vec3(0.50, 0.47, 0.42), hcol, sstep(1.5, 3.5, plotPx));
        if (inner > vmix) { vmix = inner; vcol = hcol; }
      }
      // roads to the next villages east and south
      for (int k = 0; k < 2; k++) {
        ivec2 c2 = c + (k == 0 ? ivec2(1, 0) : ivec2(0, 1));
        vec2 pos2; float rad2;
        if (!villageAt(c2, pos2, rad2)) continue;
        vec2 wob = 0.004 * vec2(vnoise(p * 40.0, uSeed + 7400) - 0.5, vnoise(p * 40.0, uSeed + 7401) - 0.5);
        road = min(road, segDist(p + wob, pos, pos2));
      }
    }
    g = mix(g, vcol, vmix);
    float rw = 0.00024;   // about 12 m wide
    float rv = 1.0 - sstep(rw * 0.5, rw * 0.5 + pxm, road);
    g = mix(g, vec3(0.70, 0.68, 0.63), rv * sstep(0.2, 1.2, rw / pxm + 0.4) * farm * 0.9);
  }
  // a strip of sand where the coast is low
  float ce = e - uSea;
  if (ce < 0.006 && slope < 1.2) g = mix(g, ce < 0.002 ? WETSAND : SAND, (1.0 - ce / 0.006) * 0.75);
  return g;
}


// ---------- towns and cities ----------
// A city is drawn the way cities grow. Its built-up area thins out from a dense centre, reaches out along the main
// roads and swallows nearby villages; its edge is ragged at every scale, so the outermost blocks give way to fields
// one by one. Main roads run out from the centre and ring roads circle it; between them lie neighbourhoods, each
// with its own street grid (the seams between them run under avenues). Block by block the city is offices in the
// centre, flats, houses with gardens, parks, or industry. Each part shows finer detail (blocks, then buildings with
// their shadows, gardens and trees) once it is a few pixels across; before that it is the colour it has from far away.
const float M = 1.0 / 50000.0;          // one metre, in map cells
const vec2 SUNDIR = vec2(-0.62, -0.72);
float wrapA(float a) { return a - 6.2831853 * floor((a + 3.14159265) / 6.2831853); }
// the direction of main road k at distance d from the centre (the cars in the game code use the same numbers)
float artAng(int k, int N, float a0, float d, float R) {
  float fk = float(k);
  return a0 + fk * 6.2831853 / float(N) + 0.15 * sin(fk * 1.7 + a0) + 0.12 * sin(d / R * 5.0 + fk * 2.1) * sstep(0.0, 0.2 * R, d);
}
// distance to the nearest main road; and which wedge between main roads the point is in (its first road's angle, its span)
float arterialDist(vec2 rel, float d, float R, float hh, out float ringD, out float wedgeA, out float wedgeSpan, out int wedge) {
  float th = atan(rel.y, rel.x);
  int N = 5 + int(hh * 4.0);
  float a0 = hh * 43.98;
  float best = 1e9, bestPos = 1e9;
  wedge = 0; wedgeA = 0.0; wedgeSpan = 1.0;
  for (int k = 0; k < 9; k++) {
    if (k >= N) break;
    float ang = artAng(k, N, a0, d, R);
    float dl = wrapA(th - ang);
    if (abs(dl) < 1.5) best = min(best, d * abs(sin(dl)));
    float pos = dl < 0.0 ? dl + 6.2831853 : dl;
    if (pos < bestPos) { bestPos = pos; wedge = k; wedgeA = ang; }
  }
  float nxt = artAng(wedge + 1 >= N ? 0 : wedge + 1, N, a0, d, R);
  wedgeSpan = wrapA(nxt - wedgeA); if (wedgeSpan <= 0.0) wedgeSpan += 6.2831853;
  ringD = min(abs(d - 0.3 * R * (1.0 + 0.05 * sin(3.0 * th + a0))), abs(d - 0.62 * R * (1.0 + 0.06 * sin(2.0 * th + a0 * 1.3))));
  return best;
}
// how built-up the ground is (about 0.32 is the edge of the city)
float townDens(vec2 rel, float R, float Ru, float art, int seed, float pxm) {
  vec2 wv = vec2(fbm(rel / Ru * 1.4 + 3.1, seed + 20, 3), fbm(rel / Ru * 1.4 + 7.7, seed + 21, 3)) - 0.5;
  float u = length(rel + wv * Ru * 0.5 * sstep(0.0, 0.4 * Ru, length(rel))) / Ru;   // irregular, but the heart stays at the centre
  float d = length(rel);
  float core = 1.0 - u;
  float corr = 0.6 * (1.0 - sstep(0.012 * R, 0.045 * R, art)) * (1.0 - sstep(0.55 * R, 1.15 * R, d));
  float sat = 0.62 * sstep(0.68, 0.76, fbm(rel / (0.1 * R) + 11.0, seed + 22, 2)) * (1.0 - sstep(0.5 * R, 1.2 * R, d));
  float dn = max(max(core, corr), sat);
  // a ragged edge, down to single blocks
  float amp = 0.17, sc = 0.08 * Ru;
  for (int o = 0; o < 7; o++) {
    float k = sstep(1.5, 4.0, sc / pxm);
    if (k <= 0.0) break;
    dn += amp * k * (vnoise(rel / sc, seed + 30 + o) - 0.5);
    amp *= 0.6; sc *= 0.5;
  }
  return dn;
}
// a lot with one building: returns 1 inside the building, -1 in its shadow, 0 outside; coords in metres
float building(vec2 q, vec2 lot, float margin, float height) {
  vec2 lo = lot * margin, hi = lot * (1.0 - margin);
  if (all(greaterThan(q, lo)) && all(lessThan(q, hi))) return 1.0;
  vec2 s = q + normalize(SUNDIR) * height * 0.55;   // towards the sun: is the building between us and it?
  if (all(greaterThan(s, lo)) && all(lessThan(s, hi))) return -1.0;
  return 0.0;
}
float gCityFlat = 0.0;
float gTownRoad = 0.0;
// far-away colours: offices, flats, houses with gardens, industry, park
const vec3 C_CBD = vec3(0.57, 0.56, 0.54), C_FLATS = vec3(0.52, 0.51, 0.49), C_HOUSES = vec3(0.47, 0.46, 0.41), C_IND = vec3(0.60, 0.60, 0.58), C_PARK = vec3(0.29, 0.39, 0.21);
vec3 kindColor(int kind) { return kind == 0 ? C_CBD : kind == 1 ? C_FLATS : kind == 2 ? C_IND : kind == 3 ? C_PARK : C_HOUSES; }
vec4 cityColor(vec2 p, float pxm, vec3 ground) {
  vec4 outc = vec4(0.0);
  vec4 ti = floor(texelFetch(uTownIdx, ivec2(clamp(floor(p), vec2(0.0), vec2(95.0, 63.0))), 0) * 255.0 + 0.5);
  for (int kk = 0; kk < 4; kk++) {
    int i = int(ti[kk]) - 1;
    if (i < 0) break;
    vec4 A = texelFetch(uTowns, ivec2(i, 0), 0);
    vec2 rel = p - A.xy;
    float R = A.z;
    if (abs(rel.x) > R * 1.45 || abs(rel.y) > R * 1.45) continue;
    vec4 B = texelFetch(uTowns, ivec2(i, 1), 0);
    float d = length(rel), hh = B.z, ind = B.x;
    float Ru = R * 0.62;                       // the continuous built-up area (R is the whole district)
    int seed = uSeed + 9000 + i * 31;
    float ringD, wA, wSpan; int wedge;
    float art = arterialDist(rel, d, R, hh, ringD, wA, wSpan, wedge);
    float dens = townDens(rel, R, Ru, art, seed, pxm);
    float cover = sstep(0.29, 0.34, dens);
    // the main roads run on into the country; ring roads and avenues only through the built-up area
    float roadW = 40.0 * M, ringW = 30.0 * M, aveW = 20.0 * M;
    float onArt = (1.0 - sstep(roadW * 0.5, roadW * 0.5 + pxm, art)) * (1.0 - sstep(1.1 * R, 1.3 * R, d)) * min(1.0, max(roadW / pxm, 0.45));
    float onRing = (1.0 - sstep(ringW * 0.5, ringW * 0.5 + pxm, ringD)) * sstep(0.22, 0.3, dens) * min(1.0, max(ringW / pxm, 0.35));
    if (cover < 0.005 && onArt < 0.01 && onRing < 0.01) continue;
    // ---- the neighbourhood: a piece of a wedge between main roads, between ring roads and avenues ----
    float r1 = 0.3 * R, r2 = 0.62 * R;
    int band = d < r1 ? 0 : d < r2 ? 1 : 2;
    float L = 0.075 * R;
    float frac = clamp(wrapA(atan(rel.y, rel.x) - wA) / wSpan, 0.0, 1.0);
    float rr = (d + 0.03 * R * (gnoise(vec2(float(wedge) * 3.1 + frac * 2.5, d / L * 0.7), seed + 40))) / L;
    float ri = floor(rr);
    float hs = hash2(wedge * 17 + band, int(ri), seed + 41);
    float sp = 0.3 + 0.4 * hs + 0.12 * gnoise(vec2(d / L * 0.8, float(wedge) * 1.7), seed + 39);
    int sub = frac < sp ? 0 : 1;
    float nh = hash2(wedge * 37 + sub * 7 + band * 3, int(ri) + 100, seed + 42), nh2 = hash2(wedge * 37 + sub * 7 + band * 3, int(ri) + 200, seed + 43);
    // each neighbourhood has its own character: leafy or bare, tiled roofs or grey
    float leafy = sstep(0.35, 0.75, fbm(rel / (0.05 * R) + 1.3, seed + 51, 2));
    // avenues on the seams between neighbourhoods
    float aveD = min(min(fract(rr), 1.0 - fract(rr)) * L, d * abs(sin((frac - sp) * wSpan)));
    if (band == 0 && d < 0.1 * R) aveD = 1e9;
    float onAve = (1.0 - sstep(aveW * 0.5, aveW * 0.5 + pxm, aveD)) * cover * min(1.0, max(aveW / pxm, 0.3));
    // what the neighbourhood is: industry sits in whole districts, away from the centre
    float midA = wA + wSpan * (sub == 0 ? sp * 0.5 : (sp + 1.0) * 0.5), midD = (ri + 0.5) * L;
    vec2 nc = vec2(cos(midA), sin(midA)) * midD;
    float indLvl = 0.009 * min(ind, 14.0);
    float indF = fbm(rel / (0.07 * R) + 4.0, seed + 44, 3) + indLvl - 0.25 * (1.0 - sstep(0.12 * R, 0.25 * R, d));
    bool industry = indF > 0.72;
    bool bigPark = nh2 < 0.03 && midD < 0.7 * R && midD > 0.1 * R;
    // the street grid: along or across the neighbourhood's own direction; an old irregular town at the very centre
    float gAng = midA + (nh < 0.5 ? 0.0 : 1.5707963) + (nh2 - 0.5) * 0.5;
    if (d < 0.03 * R) gAng = hh * 6.28;
    mat2 rot = mat2(cos(gAng), -sin(gAng), sin(gAng), cos(gAng));
    vec2 q = (rot * rel) / M;                                   // metres, turned to the street grid
    bool oldTown = d < 0.022 * R + 0.012 * R * (vnoise(rel / (0.012 * R), seed + 45) - 0.5);
    if (oldTown) q += 18.0 * vec2(gnoise(q / 90.0, seed + 46), gnoise(q / 90.0 + 3.3, seed + 47));
    // newer suburbs: streets that curve (some neighbourhoods more than others)
    float curvy = sstep(0.55, 0.75, 1.0 - dens) * step(0.35, nh2) * (0.5 + leafy);
    if (!oldTown && !industry && curvy > 0.0) q += 70.0 * curvy * vec2(gnoise(q / 420.0, seed + 52), gnoise(q / 420.0 + 7.7, seed + 53));
    vec2 wv0 = vec2(fbm(rel / Ru * 1.4 + 3.1, seed + 20, 3), fbm(rel / Ru * 1.4 + 7.7, seed + 21, 3)) - 0.5;
    float uC = length(rel + wv0 * Ru * 0.5 * sstep(0.0, 0.4 * Ru, d)) / Ru;
    vec2 bsz = oldTown ? vec2(70.0, 55.0) : industry ? vec2(240.0, 170.0) : uC < 0.12 ? vec2(115.0, 100.0) : dens > 0.6 ? vec2(150.0, 110.0) : vec2(130.0, 62.0);
    bsz *= 0.85 + 0.3 * nh;
    float streetW = oldTown ? 9.0 : uC < 0.12 ? 20.0 : industry ? 16.0 : 12.0;
    vec2 bc = floor(q / bsz), bf = q - bc * bsz;
    float bh = hash2(int(bc.x), int(bc.y), seed + 5), bh2 = hash2(int(bc.x), int(bc.y), seed + 19);
    float blockPx = min(bsz.x, bsz.y) * M / pxm;
    // ---- far away: the colour of each part of the city, varying smoothly ----
    float parkF = fbm(rel / (0.04 * Ru) + 2.0, seed + 48, 2);
    // seen from far the kinds blend into each other
    vec3 far = mix(mix(C_HOUSES, vec3(0.32, 0.39, 0.25), 0.45 * leafy), C_FLATS, sstep(0.5, 0.7, dens));
    far = mix(far, C_CBD, 1.0 - sstep(0.06, 0.14, uC + 0.04 * (vnoise(rel / (0.02 * R), seed + 50) - 0.5)));
    far = mix(far, C_IND * 0.95, sstep(0.7, 0.74, indF));
    far = mix(far, C_PARK, max(sstep(0.7, 0.76, parkF), bigPark ? 1.0 : 0.0));
    float tone = fbm(rel / (0.06 * Ru), seed + 16, 3);
    far *= 0.9 + 0.2 * tone;
    far = mix(far, far * vec3(1.06, 1.0, 0.9), sstep(0.45, 0.7, fbm(rel / (0.1 * Ru), seed + 17, 2)));   // older brick here, newer concrete there
    // the grain of blocks and streets, before single blocks can be made out
    // the grain of blocks, streets and trees, at every scale down to the pixel
    float gr = 0.0, gamp = 0.14, gsc = bsz.x * M * 4.0;
    for (int o = 0; o < 4; o++) { gr += gamp * (vnoise(rel / gsc, seed + 49 + o) - 0.5) * sstep(0.7, 2.0, gsc / pxm); gamp *= 0.8; gsc *= 0.5; }
    far *= 1.0 + gr;
    vec3 col = far;
    float a = cover;
    // ---- blocks: each built or not, each its own kind ----
    if (blockPx > 1.0) {
      vec2 qc = (bc + 0.5) * bsz * M;
      vec2 relC = transpose(rot) * qc;
      if (oldTown) relC = rel;          // the old town's crooked blocks: judge them where they are
      float ringC, wAc, wSc; int wc;
      float artC = arterialDist(relC, length(relC), R, hh, ringC, wAc, wSc, wc);
      float densC = townDens(relC, R, Ru, artC, seed, max(pxm, bsz.x * M * 0.6)) + 0.12 * (bh2 - 0.5);
      bool built = densC > 0.32;
      float parkC = fbm(relC / (0.04 * Ru) + 2.0, seed + 48, 2);
      float indC = fbm(relC / (0.07 * R) + 4.0, seed + 44, 3) + indLvl - 0.25 * (1.0 - sstep(0.12 * R, 0.25 * R, length(relC)));
      vec2 wvC = vec2(fbm(relC / Ru * 1.4 + 3.1, seed + 20, 3), fbm(relC / Ru * 1.4 + 7.7, seed + 21, 3)) - 0.5;
      float uCC = length(relC + wvC * Ru * 0.5 * sstep(0.0, 0.4 * Ru, length(relC))) / Ru + 0.04 * (vnoise(relC / (0.02 * R), seed + 50) - 0.5);
      int kind = indC > 0.72 ? 2 : (bigPark || parkC > 0.73) ? 3 : uCC < 0.1 ? 0 : densC > 0.6 ? 1 : 4;
      if (kind == 4 && artC < 140.0 * M && densC > 0.4) kind = 1;     // the main roads are lined with bigger buildings
      if (oldTown) kind = 0;
      vec3 bcol = kindColor(kind) * (0.88 + 0.24 * bh);
      if (kind != 3 && bh < 0.04) bcol = mix(bcol, vec3(0.33, 0.43, 0.25), 0.85);     // a square or a sports ground
      float edge = min(min(bf.x, bsz.x - bf.x), min(bf.y, bsz.y - bf.y));
      float street = 1.0 - sstep(streetW * 0.5 - pxm / M * 0.5, streetW * 0.5 + pxm / M * 0.5, edge);
      vec3 stc = oldTown ? vec3(0.49, 0.48, 0.46) : vec3(0.44, 0.44, 0.43);
      float blockA = built ? 1.0 : 0.0;
      vec3 detail = bcol;
      float lotK = 0.0;
      if (built && kind == 3) {
        // a park: grass, paths, clumps of trees
        vec3 pc = C_PARK * (0.95 + 0.1 * vnoise(q / 7.0, seed + 6));
        float tr = gnoise(q / 22.0, seed + 7) + 0.5 * gnoise(q / 9.0, seed + 8);
        pc = mix(pc, vec3(0.16, 0.27, 0.15), sstep(0.12, 0.22, tr));
        float path = abs(gnoise(q / 90.0, seed + 9));
        pc = mix(pc, vec3(0.70, 0.67, 0.58), (1.0 - sstep(0.012, 0.02, path)) * sstep(1.0, 3.0, 4.0 * M / pxm));
        detail = mix(bcol, pc, sstep(1.0, 3.0, 20.0 * M / pxm));
      } else if (built) {
        // lots inside the block, one building on each
        vec2 inner = bf - streetW * 0.5, isz = bsz - streetW;
        vec2 nl = kind == 0 ? vec2(1.0 + floor(bh2 * 3.0), 1.0 + floor(fract(bh2 * 7.0) * 2.0)) : kind == 1 ? vec2(1.0 + floor(bh2 * 2.0), 2.0 + floor(fract(bh2 * 5.0) * 2.0)) : kind == 2 ? vec2(1.0 + floor(bh * 2.0), 1.0) : vec2(6.0 + floor(bh2 * 3.0), 2.0);
        vec2 lot = isz / nl;
        vec2 li = floor(inner / lot), lf = inner - li * lot;
        float lh = hash2(int(bc.x * 8.0 + li.x), int(bc.y * 8.0 + li.y), seed + 10);
        float uB = length(relC) / Ru;
        float height = kind == 0 ? 15.0 + 90.0 * lh * lh * (1.0 - sstep(0.0, 0.18, uB)) : kind == 1 ? 12.0 + 15.0 * lh : kind == 2 ? 10.0 : 6.0;
        float margin = kind == 0 ? 0.04 + 0.12 * fract(lh * 13.0) : kind == 1 ? 0.1 : kind == 2 ? 0.08 : 0.15 + 0.09 * fract(lh * 13.0);
        float sparse = kind == 4 ? sstep(0.3, 0.6, densC) : 1.0;   // the outskirts: houses further apart
        // flats are long slabs with lawns between them
        vec2 lf2 = lf, lot2 = lot;
        if (kind == 1) { lf2.y = (lf.y - lot.y * 0.3) / 0.4; lot2.y = lot.y; lf2.y = lf.y < lot.y * 0.28 || lf.y > lot.y * 0.72 ? -1.0 : (lf.y - lot.y * 0.28) / 0.44; lot2.y = lot.y; }
        float b = lh < 0.94 * sparse + 0.03 ? building(lf2, lot2, margin, height) : 0.0;
        bool open_ = kind == 0 && lh > 0.9;
        if (open_) b = 0.0;
        float warmth = sstep(0.4, 0.65, fbm(relC / (0.05 * R), seed + 17, 2));   // tiled roofs in older quarters, grey in newer ones
        vec3 roof = kind == 0 ? (lh < 0.3 ? vec3(0.66, 0.66, 0.64) : lh < 0.55 ? vec3(0.50, 0.50, 0.50) : lh < 0.75 ? vec3(0.38, 0.39, 0.40) : vec3(0.58, 0.55, 0.50))
                  : kind == 1 ? (lh < 0.4 ? vec3(0.58, 0.57, 0.55) : lh < 0.75 ? vec3(0.48, 0.47, 0.46) : vec3(0.60, 0.42, 0.35))
                  : kind == 2 ? (lh < 0.25 ? vec3(0.64, 0.64, 0.63) : lh < 0.7 ? vec3(0.50, 0.52, 0.53) : vec3(0.45, 0.39, 0.34))
                  : mix(lh < 0.5 ? vec3(0.46, 0.46, 0.46) : lh < 0.8 ? vec3(0.36, 0.35, 0.35) : vec3(0.56, 0.54, 0.50), lh < 0.6 ? vec3(0.62, 0.36, 0.27) : vec3(0.52, 0.31, 0.25), warmth * step(0.15, fract(lh * 7.0)));
        // roofs have a ridge or a parapet: a lighter and a darker half
        float half_ = (kind == 4 ? lf.y / lot.y : lf.x / lot.x) > 0.5 ? 0.92 : 1.05;
        vec3 yard = kind == 4 ? mix(vec3(0.33, 0.44, 0.24), vec3(0.42, 0.47, 0.30), hash2(int(bc.x * 8.0 + li.x), int(bc.y * 8.0 + li.y), seed + 11))
                  : kind == 2 ? vec3(0.55, 0.54, 0.50) : open_ && fract(lh * 31.0) < 0.5 ? vec3(0.26, 0.36, 0.21) : vec3(0.46, 0.46, 0.44);
        // trees in the gardens and courtyards
        if (kind == 1) yard = mix(vec3(0.36, 0.45, 0.27), vec3(0.42, 0.42, 0.40), step(0.7, fract(lh * 11.0)));
        if (kind == 4 || kind == 1) { float tg = gnoise(q / 7.0, seed + 12) + 0.5 * gnoise(q / 2.8, seed + 13); yard = mix(yard, mix(vec3(0.14, 0.24, 0.12), vec3(0.22, 0.33, 0.17), vnoise(q / 1.5, seed + 14)), sstep(0.3 - 0.4 * leafy, 0.42 - 0.4 * leafy, tg) * (kind == 4 ? 0.95 : 0.8)); }
        vec3 dc = b > 0.5 ? roof * half_ : b < -0.5 ? yard * 0.55 : yard;
        float lotPx = min(lot.x, lot.y) * M / pxm;
        // a plot only a pixel or two across: its roof and its garden blended in proportion
        float cov = (lh < 0.94 * sparse + 0.03 && !open_) ? (1.0 - 2.0 * margin) * (1.0 - 2.0 * margin) * (kind == 1 ? 0.44 : 1.0) : 0.0;
        vec3 yardAvg = kind == 4 ? mix(vec3(0.40, 0.45, 0.30), vec3(0.20, 0.30, 0.16), 0.2 + 0.6 * leafy) : kind == 1 ? vec3(0.36, 0.43, 0.29) : yard;
        vec3 lotAvg = mix(yardAvg, roof, cov) * (0.92 + 0.16 * fract(lh * 17.0));
        lotK = sstep(1.6, 3.2, lotPx);
        detail = mix(mix(bcol, lotAvg, sstep(0.5, 1.4, lotPx)), dc, lotK);
      }
      // streets: always between built blocks; on the ragged edge they run on a little into the fields
      vec3 bl = mix(detail, stc, street);
      float streetHere = 0.0;   // a street is drawn as part of the blocks it serves; empty plots at the edge have none
      float k = sstep(1.0, 3.0, blockPx);
      col = mix(col, built ? bl : stc, k);
      a = mix(a, max(blockA, streetHere), k);
    }
    // trees over gardens, courtyards and streets: crowns of 6 to 15 metres, clumped, more in leafy neighbourhoods
    if (!industry) {
      vec2 qt = rel / M;
      float can = 0.55 * gnoise(qt / 38.0, seed + 60) + 0.3 * gnoise(qt / 14.0, seed + 61) + 0.15 * gnoise(qt / 5.0, seed + 62);
      float thr = 0.3 - 0.22 * leafy - 0.06 * (1.0 - sstep(0.3, 0.6, dens)) + 0.25 * (1.0 - sstep(0.06, 0.16, uC));
      float crownPx = 10.0 * M / pxm;
      float tree = sstep(thr - 0.03, thr + 0.03, can);
      float treeAvg = sstep(thr - 0.35, thr + 0.35, 0.0) * 0.5;                  // what a mix of trees and roofs looks like from far
      float tv = mix(treeAvg, tree, sstep(0.6, 2.0, crownPx));
      vec3 tc = mix(vec3(0.13, 0.22, 0.11), vec3(0.24, 0.34, 0.17), vnoise(qt / 4.0, seed + 63)) * (1.0 + 0.15 * sstep(0.3, 0.5, gnoise(qt / 3.0 + 9.0, seed + 64)));
      col = mix(col, tc, tv * cover * 0.9);
    }
    col = mix(col, vec3(0.52, 0.51, 0.49), onAve * 0.8);
    float roads = max(onArt, onRing);
    a = max(a, roads);
    col = mix(col, uC < 0.16 ? vec3(0.62, 0.61, 0.58) : vec3(0.68, 0.67, 0.63), roads * 0.9 / max(a, 0.001));
    if (a > outc.a) { outc = vec4(col, a); gCityFlat = a; }
    gTownRoad = max(gTownRoad, onArt);
  }
  return outc;
}
// mines and oil fields: open pits with terraces, pads with tracks
vec4 pitColor(vec2 p, float pxm) {
  for (int i = 0; i < 64; i++) {
    if (i >= uNPits) break;
    vec4 P = texelFetch(uPits, ivec2(i, 0), 0);
    float r = P.z;
    float dd = length(p - P.xy);
    if (dd > r * 1.3) continue;
    dd += r * 0.35 * (vnoise(p * 5.0 / max(r, 0.05) , uSeed + 760 + i) - 0.5);
    float a = 1.0 - sstep(r * 0.8, r * 1.2, dd);
    vec3 pc;
    if (P.w > 1.5) pc = mix(STEPPE, vec3(0.75, 0.73, 0.68), 0.5 + 0.2 * sin(dd / r * 40.0));
    else {
      float ring = abs(sin(dd / r * 9.0));
      pc = mix(P.w > 0.5 ? ROCKDARK : HILLSOIL, ROCKLIGHT, 0.25 + 0.45 * ring * sstep(0.2, 0.6, dd / r));
      if (dd < r * 0.3) pc = mix(pc, P.w > 0.5 ? vec3(0.12, 0.11, 0.10) : ROCKDARK, 0.6);
    }
    return vec4(pc, a * 0.92);
  }
  return vec4(0.0);
}

// ---------- rivers ----------
// Each river is a line of points (5 texels each: position, distance along, meander phase; frame normal, width,
// loop size; loop lean, phase rate, braiding, mud; hemmed-in, dryness, valley depth, river id; oxbows, mouth, size).
// A pixel finds the nearest stretch, measures itself in the river's frame (along, across), and from there finds the
// channel: a loop curve that grows, leans and turns back on itself in the plains, braids over gravel below mountains.
uniform highp sampler2D uRV;
uniform highp sampler2D uRCell;
uniform highp sampler2D uRList;
uniform int uRivOn;
vec4 rvT(int v, int k) { int i = v * 5 + k; return texelFetch(uRV, ivec2(i & 1023, i >> 10), 0); }
float cr2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
// position on segment v (0..1) whose interpolated normal passes through P, and the signed distance along that normal
bool rnProj(vec2 P, int v, out float t, out float n, out vec2 nn) {
  vec4 a0 = rvT(v, 0), b0 = rvT(v + 1, 0), a1 = rvT(v, 1), b1 = rvT(v + 1, 1);
  vec2 d = b0.xy - a0.xy, na = a1.xy, dn = b1.xy - a1.xy, q = P - a0.xy;
  float c0 = cr2(q, na), c1 = cr2(q, dn) - cr2(d, na), c2 = -cr2(d, dn);
  if (abs(c2) < 1e-7) { if (abs(c1) < 1e-12) return false; t = -c0 / c1; }
  else {
    float disc = c1 * c1 - 4.0 * c2 * c0;
    if (disc < 0.0) return false;
    float qq = -0.5 * (c1 + (c1 < 0.0 ? -1.0 : 1.0) * sqrt(disc));
    float r1 = qq / c2, r2 = abs(qq) > 1e-12 ? c0 / qq : 1e9;
    t = abs(r1 - 0.5) < abs(r2 - 0.5) ? r1 : r2;
  }
  if (t < -0.35 || t > 1.35) return false;
  // never past the true ends of a river
  float ends = rvT(v, 4).w;
  if ((t < 0.0 && mod(ends, 2.0) > 0.5) || (t > 1.0 && ends > 1.5)) return false;
  nn = normalize(na + t * dn);
  n = dot(q - t * d, nn);
  return true;
}
// the channel at valley distance u: (along, across, phase)
float gKq = 0.0;
float gD2 = 1e9;   // distance to the nearest other arm of the channel   // how fast the loops' rhythm changes along the current stretch (half the rate)
vec3 rnChan(float u, float phiV, float sV, float k, float A, float beta, float rid, int sd, float phShift) {
  float du_ = u - sV;
  float phl = phiV + k * du_ + gKq * du_ * du_ + phShift;
  // no two loops alike: the rhythm drifts, loops grow and shrink, lean more or less, and the whole belt wanders
  float ph = phl + 6.0 * (vnoise(vec2(phl * 0.06, rid * 7.31), sd) - 0.5) + 2.2 * (vnoise(vec2(phl * 0.21, rid * 7.31 + 9.7), sd + 3) - 0.5);
  float am = vnoise(vec2(phl * 0.16, rid * 7.31 + 3.3), sd + 1); am = 0.2 + 1.6 * am * am;
  float bm = 0.3 + 1.4 * vnoise(vec2(phl * 0.1, rid * 7.31 + 6.1), sd + 2);
  float wander = 1.8 * (vnoise(vec2(phl * 0.045, rid * 7.31 + 1.7), sd + 4) - 0.5);
  return vec3(u - min(beta * bm, 0.95) / k * sin(2.0 * ph), A * (am * sin(ph) + wander), ph);
}
// nearest point of a channel to (s, n): distance, and the valley distance and phase there
vec3 rnNearest(vec2 P, float phiV, float sV, float k, float A, float beta, float rid, int sd, float phShift) {
  float lam = 6.2831853 / k;
  float u0 = P.x - 0.8 * lam, du = 1.6 * lam / 28.0;
  vec3 prev = rnChan(u0, phiV, sV, k, A, beta, rid, sd, phShift);
  float best = 1e9, bu = P.x, bph = 0.0;
  float dl[28];
  for (int i = 1; i <= 28; i++) {
    vec3 cur = rnChan(u0 + du * float(i), phiV, sV, k, A, beta, rid, sd, phShift);
    vec2 ba = cur.xy - prev.xy, pa = P - prev.xy;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-14), 0.0, 1.0);
    float dd = length(pa - ba * h);
    dl[i - 1] = dd;
    if (dd < best) { best = dd; bu = u0 + du * (float(i) - 1.0 + h); bph = mix(prev.z, cur.z, h); }
    prev = cur;
  }
  // the nearest other arm of the channel (beyond the bend this point belongs to): where a loop nearly meets itself
  gD2 = 1e9;
  for (int i = 0; i < 28; i++) {
    float um = u0 + du * (float(i) + 0.5);
    if (abs(um - bu) > 0.3 * lam) gD2 = min(gD2, dl[i]);
  }
  // then home in on it, so the banks are smooth curves however close you look
  float hstep = du * 0.5;
  vec3 c0 = rnChan(bu, phiV, sV, k, A, beta, rid, sd, phShift);
  float b0 = length(P - c0.xy);
  for (int it = 0; it < 6; it++) {
    vec3 cm = rnChan(bu - hstep, phiV, sV, k, A, beta, rid, sd, phShift), cp = rnChan(bu + hstep, phiV, sV, k, A, beta, rid, sd, phShift);
    float dm = length(P - cm.xy), dp = length(P - cp.xy);
    if (dm < b0 && dm <= dp) { bu -= hstep; b0 = dm; c0 = cm; } else if (dp < b0) { bu += hstep; b0 = dp; c0 = cp; }
    hstep *= 0.5;
  }
  return vec3(b0, bu, c0.z);
}
vec4 gRiv = vec4(0.0);     // what the rivers paint over the land: water, sand, gravel (colour, cover)
float gRivWater = 0.0;     // open water only
float gFP = 0.0, gFPDry = 0.0;   // floodplain: how much, and how much of it is a green strip through dry land
float gVal = 0.0; vec2 gValGrad = vec2(0.0);   // valleys cut by the rivers (height, slope)
float gValFlat = 0.0;                           // how much the rough ground is smoothed out on the valley floor
const vec3 RCLEAR = vec3(0.065, 0.11, 0.14), RCLEARSH = vec3(0.15, 0.24, 0.24), RMUD = vec3(0.56, 0.49, 0.37), RMUDSH = vec3(0.64, 0.58, 0.46);
const vec3 BAR = vec3(0.76, 0.72, 0.62), BARWET = vec3(0.58, 0.55, 0.47), GRAVEL = vec3(0.68, 0.66, 0.60);
vec3 riverWater(float turb, float conf, float est, float depth) {
  vec3 clear = mix(RCLEARSH, RCLEAR, depth), mud = mix(RMUDSH, RMUD, depth);
  vec3 c = mix(clear, mud, turb);
  c = mix(c, mix(vec3(0.24, 0.36, 0.36), vec3(0.14, 0.25, 0.27), depth), conf * 0.6);   // mountain water: green, milky
  return mix(c, SHOAL, est * 0.45);
}
void rnPaint(vec3 col, float a) { gRiv.rgb = mix(gRiv.rgb, col, a); gRiv.a = max(gRiv.a, a); }
void riverOne(vec2 p, float pxm, int v, float t, float n, vec2 nn) {
  vec4 a0 = rvT(v, 0), b0 = rvT(v + 1, 0), a1 = rvT(v, 1), b1 = rvT(v + 1, 1), a2 = rvT(v, 2), b2 = rvT(v + 1, 2);
  vec4 a3 = rvT(v, 3), b3 = rvT(v + 1, 3), a4 = rvT(v, 4), b4 = rvT(v + 1, 4);
  float s = mix(a0.z, b0.z, t);
  float w = mix(a1.z, b1.z, t), A = mix(a1.w, b1.w, t), beta = mix(a2.x, b2.x, t), k = a2.y;
  gKq = 0.5 * (b2.y - a2.y) / max(b0.z - a0.z, 1e-6);
  float braid = mix(a2.z, b2.z, t), turb = mix(a2.w, b2.w, t), conf = mix(a3.x, b3.x, t), arid = mix(a3.y, b3.y, t), vD = mix(a3.z, b3.z, t), rid = a3.w;
  float oxb = mix(a4.x, b4.x, t), est = mix(a4.y, b4.y, t), size = mix(a4.z, b4.z, t);
  float an = abs(n);
  int sd = uSeed + 8800;
  // distance along the river in river-widths, counted so that it never bunches up where the river widens
  float al = (a0.w + k * (s - a0.z) + gKq * (s - a0.z) * (s - a0.z)) * 1.9;
  // a braided river's bed of gravel and sand, many times wider than its water
  float bedK = sstep(0.3, 0.8, braid);
  float bedH = w * (0.5 + 3.2 * bedK) * (0.75 + 0.5 * vnoise(vec2(al / 16.0, rid), uSeed + 8820));
  // the valley: a flat floor the river wanders over, and sides; deep in the mountains, a canyon in dry uplands
  float vfloor = A * 2.2 + 1.5 * w + bedH * bedK;
  float Vw = mix(0.07, 0.22, conf) * mix(1.0, 0.35, arid * (1.0 - conf));
  float vDep = vD * sstep(0.0, 0.5, s);
  float vt = clamp((an - vfloor) / Vw, 0.0, 1.0);
  float carve = -vDep * (1.0 - vt * vt * (3.0 - 2.0 * vt));
  if (carve < gVal) { gVal = carve; gValGrad = (vDep * 6.0 * vt * (1.0 - vt) / Vw) * sign(n) * nn; }
  gValFlat = max(gValFlat, (1.0 - sstep(vfloor * 0.8, vfloor + Vw * 0.3, an)) * mix(0.5, 0.8, conf) * sstep(0.0, 0.5, s));
  // seen from far, a river is drawn as a line of a pixel or so; close up, at its true width
  float wD = max(w, min(0.02 + 0.09 * size, (0.9 + 2.0 * size) * pxm));
  float Ae = A * (1.0 - sstep(1.2, 2.5, wD / w));
  float reach = max(Ae * 2.5 + wD, bedH * bedK) + 6.0 * w + 2.0 * pxm;
  // the floodplain: meadows and riverside woods; a green ribbon through dry country
  float fpW = Ae * 2.0 + 2.5 * w + bedH * bedK;
  float fp = 1.0 - sstep(fpW, fpW * 1.6 + 4.0 * w + pxm, an + fpW * 0.5 * (vnoise(vec2(al / 25.0, rid), uSeed + 8825) - 0.5));
  gFP = max(gFP, fp * (1.0 - conf * 0.7));
  gFPDry = max(gFPDry, fp * arid * (1.0 - conf * 0.5));
  if (an > reach) return;
  float lam = 6.2831853 / k;
  vec3 nr = Ae > 0.15 * w ? rnNearest(vec2(s, n), a0.w, a0.z, k, Ae, beta, rid, sd, 0.0) : vec3(an, s, al / 1.9);
  float dist = nr.x;
  // the shape of the bend here: which side is the inside, and how tight it is
  float kap = 0.0, side = 0.0;
  if (Ae > 0.15 * w) {
    float dl = 0.04 * lam;
    vec2 P0 = rnChan(nr.y, a0.w, a0.z, k, Ae, beta, rid, sd, 0.0).xy, Pm = rnChan(nr.y - dl, a0.w, a0.z, k, Ae, beta, rid, sd, 0.0).xy, Pp = rnChan(nr.y + dl, a0.w, a0.z, k, Ae, beta, rid, sd, 0.0).xy;
    vec2 T = Pp - Pm, K = Pp + Pm - 2.0 * P0;
    kap = 4.0 * cr2(T, K) / max(pow(length(T), 3.0), 1e-18);
    side = cr2(T, vec2(s, n) - P0);
  }
  float d2main = Ae > 0.15 * w ? gD2 : 1e9;
  // fade the bend's own features out before the line where another arm of the river is as near
  float own = sstep(0.0, 0.8 * w, (d2main - dist) * 0.5);
  bool inner = kap * side > 0.0;
  float innerAmt = sstep(0.08, 0.4, kap * w * sign(side));   // how strongly this is the inside of a bend (0 near the turn-over)
  float rad = 1.0 / max(abs(kap), 1e-6);
  float hw = wD * 0.5;
  float pxa = pxm * 0.5;
  float bankD = dist - hw;                         // distance from the bank (negative in the water)
  float detail = sstep(0.8, 2.5, w / pxm);         // close enough to see sand bars and old channels
  // ----- the bed of a braided river: gravel and sand bars, threads of water, islands with trees -----
  if (bedK > 0.01) {
    float bedE = bedH * (1.0 + 0.3 * (vnoise(vec2(al / 9.0, rid), uSeed + 8821) - 0.5));
    float bedA = (1.0 - sstep(bedE - pxa, bedE + pxa, an)) * bedK;
    if (bedA > 0.0) {
      // bars: lens shapes drawn out along the flow (about 9 widths long, 2 across); water runs between them
      vec2 q = vec2(al / 13.0, n / (w * 2.0));
      q += 0.32 * vec2(gnoise(q * 1.3, uSeed + 8838), gnoise(q * 1.3 + 5.2, uSeed + 8839));   // round the bars' edges
      vec2 qi = floor(q);
      float f1 = 9.0, f2 = 9.0; vec2 c1 = vec2(0.0), c2 = vec2(0.0);
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 c = qi + vec2(x, y);
        vec2 pt = c + 0.1 + 0.8 * vec2(hash2(int(c.x), int(c.y) + 64, uSeed + 8840), hash2(int(c.x), int(c.y) + 64, uSeed + 8841));
        float dd = length(q - pt);
        if (dd < f1) { f2 = f1; c2 = c1; f1 = dd; c1 = c; } else if (dd < f2) { f2 = dd; c2 = c; }
      }
      float ed = (f2 - f1) * 0.5 * w * 2.0;                   // how far to the edge of this bar, across the flow
      float eh = hash2(int(c1.x + c2.x) + 300, int(c1.y + c2.y) + 300, uSeed + 8842);
      float live = sstep(0.22, 0.36, eh);                        // some channels carry water, others are dry hollows
      float chw = w * (0.08 + 0.5 * eh * eh) * (0.7 + 0.6 * vnoise(vec2(al / 3.0, n / w), uSeed + 8843));
      float thread = (1.0 - sstep(chw - pxa, chw + pxa, ed)) * live;
      float hollow = (1.0 - sstep(chw * 1.2, chw * 1.2 + w * 0.3 + pxa, ed)) * (1.0 - live);
      float wetNear = (1.0 - sstep(chw, chw + w * 0.8, ed)) * live;
      float age = hash2(int(c1.x), int(c1.y) + 64, uSeed + 8848);
      // older, higher bars are grown over with grass and trees
      float isle = sstep(0.0, w * 1.2, ed - chw) * sstep(0.7, 0.8, 1.0 - age);
      vec3 sandc = mix(BAR, GRAVEL, vnoise(vec2(al / 4.0, n / (w * 2.0)), uSeed + 8845)) * (0.95 + 0.1 * vnoise(vec2(al * 1.5, n / (w * 0.25)), uSeed + 8846));
      sandc = mix(sandc, BARWET, max(wetNear * 0.75, hollow * 0.6));
      vec3 bc = mix(sandc, mix(vec3(0.17, 0.27, 0.14), vec3(0.32, 0.41, 0.23), vnoise(vec2(al, n / (w * 0.5)), uSeed + 8847)), isle * detail);
      bc = mix(mix(BAR, vec3(0.62, 0.60, 0.52), 0.5), bc, detail);      // from far: a pale ribbon
      vec3 wc = mix(riverWater(turb, conf, est, 0.5 + 0.5 * sstep(0.0, chw, chw - ed)), vec3(0.36, 0.37, 0.34), 0.35);
      bc = mix(bc, wc, thread * mix(0.5, 1.0, detail));
      rnPaint(bc, bedA);
      gRivWater = max(gRivWater, bedA * thread);
    }
  }
  // ----- the main channel -----
  float water = 1.0 - sstep(-pxa, pxa, bankD);
  // inside each bend, a sand bar (point bar); the tighter the bend, the bigger
  if (detail > 0.0 && inner && bedK < 0.9 && beta > 0.15) {
    float barW = min(w * 1.3, (rad - hw) * 0.45) * innerAmt * (0.7 + 0.6 * vnoise(vec2(nr.z * 0.5, rid), uSeed + 8850));
    barW = min(barW, (d2main - dist) * 0.45);
    float bar = (1.0 - sstep(barW - pxa, barW + pxa, bankD)) * sstep(-pxa, pxa, bankD) * detail * own;
    if (bar > 0.0) rnPaint(mix(BARWET, BAR, sstep(0.0, barW * 0.6, bankD)), bar * (1.0 - bedK));
    // behind the bar, the old banks the river left as it moved out: ridges and hollows in the meadow
    float scrollZ = (rad - hw) * 0.5;
    if (bankD > 0.0 && bankD < scrollZ && rad < 9.0 * w) {
      float st = 0.5 + 0.5 * cos(bankD / (0.6 * w) * 6.2831853 + 2.0 * vnoise(vec2(nr.z * 0.8, bankD / w), uSeed + 8851));
      float vis = (1.0 - sstep(scrollZ * 0.5, scrollZ, bankD)) * sstep(0.6, 1.6, 0.6 * w / pxm) * (1.0 - arid * 0.6) * own * innerAmt;
      rnPaint(mix(vec3(0.26, 0.37, 0.20), vec3(0.40, 0.47, 0.28), st), vis * 0.45);
    }
  }
  // oxbow lakes: bends the river cut off long ago (and the scars of others), beside today's channel
  if (detail > 0.0 && oxb > 0.05 && Ae > 1.5 * w) {
    vec3 ox = rnNearest(vec2(s, n), a0.w, a0.z, k, Ae * 1.3, min(beta * 1.3, 0.9), rid + 0.37, sd + 7, 2.3);
    float loopId = floor(ox.z / 3.1415927);
    float apex = abs(sin(ox.z));
    float pick = hash2(int(loopId), int(rid), uSeed + 8860);
    float awayFromRiver = sstep(1.0 * w, 2.0 * w, bankD);
    if (pick < oxb * 0.7) {
      float wl = w * 0.9 * sstep(0.5, 0.8, apex);
      float lake = (1.0 - sstep(wl * 0.5 - pxa, wl * 0.5 + pxa, ox.x)) * awayFromRiver * detail;
      float age = hash2(int(loopId), int(rid), uSeed + 8861);
      vec3 lc = age < 0.6 ? mix(vec3(0.05, 0.09, 0.10), vec3(0.10, 0.17, 0.15), age) : mix(vec3(0.22, 0.32, 0.18), vec3(0.12, 0.20, 0.13), vnoise(vec2(al, n / w), uSeed + 8862));
      rnPaint(lc, lake);
      if (age < 0.6) gRivWater = max(gRivWater, lake);
    } else {
      float scar = (1.0 - sstep(w * 0.3, w * 0.6, ox.x)) * awayFromRiver * detail * sstep(0.5, 0.8, apex) * step(0.55, pick);
      rnPaint(vec3(0.36, 0.45, 0.26), scar * 0.3 * (1.0 - arid));
    }
  }
  if (water > 0.0) {
    float depth = clamp(1.0 - (dist / max(hw, 1e-6)) * (dist / max(hw, 1e-6)), 0.0, 1.0);
    // the deep water swings to the outside of each bend
    if (!inner) depth = min(1.0, depth * 1.25);
    vec3 wc = riverWater(turb, conf, est, depth * sstep(0.5, 3.0, w / pxm) + (1.0 - sstep(0.5, 3.0, w / pxm)) * 0.6);
    // drawn wider than it is (seen from far): a little bluer, so the map stays easy to read
    wc = mix(wc, vec3(0.25, 0.39, 0.47), 0.55 * sstep(1.3, 3.0, wD / w));
    // ripples; white water where mountain streams run steep
    wc *= 1.0 + 0.05 * (vnoise(vec2(al * 40.0, n * 40.0 / w), uSeed + 8870) - 0.5) * detail;
    float foam = conf * sstep(0.62, 0.8, vnoise(vec2(al / 1.5, n / (w * 0.3)), uSeed + 8871)) * detail;
    wc = mix(wc, vec3(0.80, 0.84, 0.82), foam * 0.6);
    rnPaint(wc, water);
    gRivWater = max(gRivWater, water);
  }
  // the banks: a thin line of wet mud, and trees along them where the land is not too dry
  if (detail > 0.0) {
    float bank = (1.0 - sstep(0.0, min(0.06 * w, 12.0 * M) + pxm, bankD)) * sstep(-pxa, pxa, bankD);
    rnPaint(mix(BARWET, vec3(0.30, 0.30, 0.24), 0.4), bank * 0.45 * detail);
    float tband = 40.0 * M + 0.25 * w;
    float trees = sstep(0.0, 0.1, 0.6 * gnoise(p / (60.0 * M), uSeed + 8875) + 0.3 * gnoise(p / (18.0 * M), uSeed + 8877) + 0.15 * gnoise(p / (6.0 * M), uSeed + 8878) + 0.25 - 0.5 * bankD / tband);
    float tz = sstep(-pxa, pxa, bankD) * (1.0 - sstep(tband, tband * 2.0, bankD)) * (1.0 - bedK);
    rnPaint(mix(FORESTDARK, FOREST, vnoise(p / (6.0 * M), uSeed + 8876)), trees * tz * sstep(1.0, 3.0, 20.0 * M / pxm) * (1.0 - 0.6 * arid) * 0.85);
  }
}
void riverAt(vec2 p, float pxm) {
  gRiv = vec4(0.0); gRivWater = 0.0; gFP = 0.0; gFPDry = 0.0; gVal = 0.0; gValGrad = vec2(0.0); gValFlat = 0.0;
  if (uRivOn == 0) return;
  vec4 cl = texelFetch(uRCell, ivec2(clamp(floor(p), vec2(0.0), vec2(95.0, 63.0))), 0);
  int off = int(cl.x), cnt = int(cl.y);
  // the nearest stretch of each of up to three rivers
  int hv[3] = int[3](-1, -1, -1); float hd[3] = float[3](1e9, 1e9, 1e9), ht[3] = float[3](0.0, 0.0, 0.0), hn[3] = float[3](0.0, 0.0, 0.0), hr[3] = float[3](-1.0, -1.0, -1.0);
  vec2 hnn[3] = vec2[3](vec2(0.0), vec2(0.0), vec2(0.0));
  for (int i = 0; i < 160; i++) {
    if (i >= cnt) break;
    int li = off + i;
    int v = int(texelFetch(uRList, ivec2(li & 2047, li >> 11), 0).r + 0.5);
    vec4 A0 = rvT(v, 0), B0 = rvT(v + 1, 0);
    if (segDist(p, A0.xy, B0.xy) > min(hd[2] + 0.08, 0.6)) continue;
    float t, n; vec2 nn;
    if (!rnProj(p, v, t, n, nn)) continue;
    float over = max(-t, t - 1.0);
    float ad = abs(n) + (over > 0.0 ? 0.05 + over * length(B0.xy - A0.xy) * 2.0 : 0.0);
    t = clamp(t, 0.0, 1.0);
    float rid = rvT(v, 3).w;
    // already holding this river? keep the nearer stretch
    int slot = -1;
    for (int k = 0; k < 3; k++) if (hr[k] == rid) slot = k;
    if (slot >= 0) { if (ad >= hd[slot]) continue; }
    else { slot = 2; if (ad >= hd[2]) continue; }
    hv[slot] = v; hd[slot] = ad; ht[slot] = t; hn[slot] = n; hnn[slot] = nn; hr[slot] = rid;
    // keep the three in order, nearest first
    for (int k = 2; k > 0; k--) if (hd[k] < hd[k - 1]) {
      int tv = hv[k]; hv[k] = hv[k - 1]; hv[k - 1] = tv;
      float tf = hd[k]; hd[k] = hd[k - 1]; hd[k - 1] = tf; tf = ht[k]; ht[k] = ht[k - 1]; ht[k - 1] = tf;
      tf = hn[k]; hn[k] = hn[k - 1]; hn[k - 1] = tf; tf = hr[k]; hr[k] = hr[k - 1]; hr[k - 1] = tf;
      vec2 t2 = hnn[k]; hnn[k] = hnn[k - 1]; hnn[k - 1] = t2;
    }
  }
  // smaller rivers first, so where they meet the bigger one's water shows on top
  float sz[3];
  for (int k = 0; k < 3; k++) sz[k] = hv[k] >= 0 ? rvT(hv[k], 1).z : -1.0;
  for (int pass = 0; pass < 3; pass++) {
    int pick = -1; float ps = 1e9;
    for (int k = 0; k < 3; k++) if (hv[k] >= 0 && sz[k] < ps) { ps = sz[k]; pick = k; }
    if (pick < 0) break;
    sz[pick] = 1e10;
    riverOne(p, pxm, hv[pick], ht[pick], hn[pick], hnn[pick]);
  }
}

vec3 waterColor(vec2 p, float e) {
  float d = uSea - e;
  vec3 c = d < 0.012 ? mix(SHOAL, SHELF, d / 0.012) : d < 0.05 ? mix(SHELF, MID, (d - 0.012) / 0.038) : d < 0.14 ? mix(MID, OCEAN, (d - 0.05) / 0.09) : mix(OCEAN, DEEP, clamp((d - 0.14) / 0.2, 0.0, 1.0));
  if (d < 0.01) c = mix(c, SAND, (1.0 - d / 0.01) * 0.4);
  // ripples and swell, finer the closer you look
  float w = 0.0, amp = 0.05, fq = 9.0;
  for (int o = 0; o < 10; o++) { float k = octFade(fq); if (k <= 0.0) break; k *= octTop(fq); if (k > 0.0) w += amp * k * (vnoise(p * fq * vec2(1.0, 2.2), uSeed + 6500 + o * 7) - 0.5);  amp *= 0.72; fq *= 2.0; }
  c *= 1.0 + w * clamp(1.0 - d * 3.0, 0.3, 1.0);
  if (d < 0.0012) c = mix(c, vec3(0.86, 0.9, 0.88), (1.0 - d / 0.0012) * 0.35);   // surf
  // harbours: piers and moored ships off the port towns
  vec4 ti = floor(texelFetch(uTownIdx, ivec2(clamp(floor(p), vec2(0.0), vec2(95.0, 63.0))), 0) * 255.0 + 0.5);
  if (d < 0.004) for (int kk = 0; kk < 4; kk++) {
    int i = int(ti[kk]) - 1;
    if (i < 0) break;
    vec4 A = texelFetch(uTowns, ivec2(i, 0), 0);
    if (mod(A.w, 4.0) < 1.5) continue;
    vec2 rel = p - A.xy;
    if (length(rel) > A.z * 0.55) continue;
    float hh = texelFetch(uTowns, ivec2(i, 1), 0).z;
    float ang = hh * 6.28;
    vec2 q = (mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * rel) / M;
    vec2 cell = floor(q / vec2(160.0, 420.0)), f = q - cell * vec2(160.0, 420.0);
    float pier = (f.x < 26.0 && f.y < 330.0) ? 1.0 : 0.0;
    float ship = (f.x > 46.0 && f.x < 70.0 && f.y > 40.0 && f.y < 40.0 + 120.0 + 100.0 * hash2(int(cell.x), int(cell.y), uSeed + 9900)) && hash2(int(cell.x), int(cell.y), uSeed + 9901) < 0.6 ? 1.0 : 0.0;
    float k = sstep(1.0, 3.0, 26.0 * M / uScale) * (1.0 - sstep(0.002, 0.004, d));
    c = mix(c, vec3(0.62, 0.60, 0.56), pier * k);
    c = mix(c, hash2(int(cell.x), int(cell.y), uSeed + 9902) < 0.5 ? vec3(0.55, 0.22, 0.18) : vec3(0.82, 0.82, 0.80), ship * k);
    break;
  }
  return c;
}

void main() {
  vec2 p = uOrigin + vec2(gl_FragCoord.x, uH - gl_FragCoord.y) * uScale;
  bool outside = p.x < 0.0 || p.y < 0.0 || p.x > 96.0 || p.y > 64.0;
  float e = outside ? -1.0 : coastE(p);
  bool forced = outside || p.x < 1.0 || p.y < 1.0 || p.x >= 95.0 || p.y >= 63.0;
  bool water = forced || e <= uSea;
  if (uMode == 1) { outColor = water ? vec4(0.0) : vec4(1.0); return; }
  if (outside) { outColor = vec4(0.039, 0.133, 0.212, 1.0); return; }
  vec3 col;
  if (water) col = waterColor(p, forced ? min(e, uSea - 0.2) : e);
  else {
    float h = reliefAt(p, e);
    // the slope: the height a pixel to the east and to the south
    float dx = uScale;
    float hx = reliefAt(p + vec2(dx, 0.0), e), hy = reliefAt(p + vec2(0.0, dx), e);
    const float Z = 7.5;
    vec2 grad = vec2(hx - h, hy - h) / dx;
    // rivers, and the valleys they have cut
    riverAt(p, uScale);
    h = e + (h - e) * (1.0 - gValFlat) + gVal;
    grad = grad * (1.0 - gValFlat) + gValGrad;
    vec3 n = normalize(vec3(-grad * Z, 1.0));
    float slope = length(grad) * Z;
    vec4 town = cityColor(p, uScale, vec3(0.44, 0.47, 0.32));
    vec3 g = town.a > 0.995 ? vec3(0.0) : landColor(p, e, h, n, slope);
    // the floodplain: lusher along the river; in dry country a green ribbon of meadows, reeds and orchards
    g = mix(g, mix(g, vec3(0.23, 0.33, 0.18), 0.18), gFP * (1.0 - gFarm * 0.6));
    g = mix(g, mix(vec3(0.24, 0.37, 0.17), vec3(0.34, 0.43, 0.22), vnoise(p * 300.0, uSeed + 8890)), gFPDry);
    vec4 pit = pitColor(p, uScale);
    g = mix(g, pit.rgb, pit.a);
    g = mix(g, town.rgb, town.a);
    g = mix(g, gRiv.rgb, gRiv.a);
    // bridges: the town's main roads cross the water
    g = mix(g, vec3(0.62, 0.61, 0.58), gTownRoad * gRivWater);
    vec3 sun = normalize(vec3(-0.62, -0.72, 0.7));
    float lam = dot(n, sun);
    float shade = clamp(lam / sun.z, 0.42, 1.45);
    float hillW = sstep(uHill - 0.012, uHill + 0.022, e), mtnW = sstep(uMtn - 0.01, uMtn + 0.035, e);
    shade = 1.0 + (shade - 1.0) * (0.55 + 0.45 * max(hillW, mtnW)) * (1.0 - 0.7 * gFarm) * (1.0 - 0.75 * town.a) * (1.0 - 0.5 * pit.a) * (1.0 - 0.85 * gRivWater);
    col = g * shade;
  }
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
}
function glShaderSource() {
  return `#version 300 es
#ifndef PASS
#define PASS 1
#endif
precision highp float;
precision highp int;
// One pixel of the world as a satellite sees it. Positions are in map cells (one cell = 50 km).
uniform vec2 uOrigin;     // the map point (in cells) at the top-left pixel
uniform float uScale;     // cells per pixel
uniform float uH;         // canvas height in pixels
uniform int uMode;
uniform int uOne;        // always 1: loops counted with it are not copied out by the graphics driver (keeps the shader small to prepare)        // 0 colour, 1 land mask
uniform sampler2D uLand;  // per map cell: farmland, irrigation, logged forest, -
uniform highp sampler2D uTowns;   // per town, six rows (see glUpdateLand)
uniform int uNTowns;
uniform sampler2D uTownIdx;       // per map cell: up to four towns that reach it (index + 1)
uniform highp sampler2D uPits;    // mines and oil fields: (x, y, radius, kind)
uniform int uNPits;
uniform float uSea, uHill, uMtn, uMoist;
uniform int uSeed;
uniform highp sampler2D uVillages;   // one texel per 6 km square: village position (x, y in the square), radius, 1 if there is one
uniform ivec2 uVGrid;
layout(location = 0) out vec4 outColor;
#if PASS == 1
layout(location = 1) out vec4 outRiv;   // for the town pass: how much river water here, and how far the river's bank is
#endif
#if PASS == 2
uniform sampler2D uFrame;   // the land as the first pass drew it
uniform sampler2D uRiv;     // the river information the first pass left
#endif

// ---------- the game's own noise, bit for bit (hash2, valueNoise, fbm) ----------
float hash2(int ix, int iy, int seed) {
  uint h = uint(ix) * 374761393u + uint(iy) * 668265263u + uint(seed) * 1442695041u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h) * (1.0 / 4294967296.0);
}
float vnoise(vec2 p, int seed) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  int ix = int(i.x), iy = int(i.y);
  float a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}
float fbm(vec2 p, int seed, int oct) {
  float s = 0.0, amp = 1.0, norm = 0.0, fq = 1.0;
  for (int o = 0; o < 8; o++) {
    if (o >= oct) break;
    s += amp * vnoise(p * fq, seed + o * 101);
    norm += amp; amp *= 0.5; fq *= 2.0;
  }
  return s / norm;
}
float ridged(vec2 p, int seed) { return 1.0 - abs(2.0 * vnoise(p, seed) - 1.0); }
// gradient noise (no square grid shows through), range about -0.7..0.7
vec2 grad2(int ix, int iy, int seed) { float a = 6.2831853 * hash2(ix, iy, seed); return vec2(cos(a), sin(a)); }
float gnoise(vec2 p, int seed) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  int ix = int(i.x), iy = int(i.y);
  float a = dot(grad2(ix, iy, seed), f), b = dot(grad2(ix + 1, iy, seed), f - vec2(1, 0));
  float c = dot(grad2(ix, iy + 1, seed), f - vec2(0, 1)), d = dot(grad2(ix + 1, iy + 1, seed), f - vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
float sstep(float a, float b, float v) { float t = clamp((v - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

// the game's continent: elevationAt and moistureAt, exactly as in the game
float elevationAt(vec2 p) {
  float nx = (p.x / 96.0) * 2.0 - 1.0, ny = (p.y / 64.0) * 2.0 - 1.0;
  float radial = sqrt(nx * nx * 0.85 + ny * ny);
  float edge = max(abs(nx), abs(ny));
  float edgeFall = edge > 0.88 ? (edge - 0.88) * 6.0 : 0.0;
  return fbm(p / 13.0, uSeed, 4) - 0.6 * pow(radial, 2.4) - edgeFall;
}
float moistureAt(vec2 p) { return fbm(p / 8.0, uSeed + 977, 3); }

// ---------- the land's height, with more detail the closer you look ----------
// how many octaves are worth drawing: down to features about 1.5 pixels across
float octFade(float freq) { float px = 1.0 / (freq * uScale); return sstep(1.2, 3.0, px); }
// features far wider than the screen hardly change across it: they are left out, fading, to save work
float octTop(float freq) { float px = 1.0 / (freq * uScale); return 1.0 - sstep(900.0, 1800.0, px); }

// the coastline: the game's own (detail down to ~3 km), then finer bays and points as you zoom in
float coastE(vec2 p) {
  float e = elevationAt(p) + 0.03 * (fbm(p * 1.9, uSeed + 333, 4) - 0.5);
  float amp = 0.03 * 0.0625, fq = 1.9 * 16.0;
  for (int o = 0; o < 9; o++) {
    float k = octFade(fq);
    if (k <= 0.0) break;
    k *= octTop(fq);
    if (k > 0.0) e += amp * k * (vnoise(p * fq, uSeed + 3400 + o * 37) - 0.5);
    amp *= 0.5; fq *= 2.0;
  }
  return e;
}
// relief on top of the coastline height: hills and mountains as in the game's painter, then fractal detail
float reliefAt(vec2 p, float e) {
  if (e <= uSea) return e;
  float up = clamp((e - uHill) / (uMtn - uHill), 0.0, 1.6);
  float r = 0.0;
  if (up > 0.0) {
    float bump = fbm(p * 0.9, uSeed + 640, 3);
    vec2 w = p + 0.9 * vec2(vnoise(p * 0.45, uSeed + 41), vnoise(p * 0.45 + vec2(5.3, 0.0), uSeed + 42));
    float r1 = ridged(w * 0.62, uSeed + 611), r2 = ridged(w * 1.35, uSeed + 612), r3 = ridged(w * 3.1, uSeed + 613);
    float ridges = r1 * r1 * 0.6 + r2 * r2 * 0.28 * (0.3 + r1) + r3 * 0.1 * r2;
    r = bump + (ridges - bump) * sstep(0.45, 1.05, up);
  }
  float h = e + min(up, 1.3) * 0.085 * r;
  // finer and finer. Mountains: sharp ridges with softer valleys between (each octave weighted by the one before);
  // lowlands: gentle swells that fade quickly, so fields stay flat
  float mt = sstep(0.15, 0.9, up);
  float amp = mix(0.002, 0.016, mt), fq = 5.0, wgt = 1.0, gain = mix(0.36, 0.47, mt);
  vec2 q = p * fq;
  for (int o = 0; o < 12; o++) {
    float k = sstep(2.5, 5.0, 1.0 / (fq * uScale));
    if (k <= 0.0) break;
    k *= octTop(fq);
    if (k > 0.0) {
      float g = gnoise(q, uSeed + 5000 + o * 13);
      float rr = 1.0 - abs(g * 1.4); rr *= rr; rr *= wgt; wgt = clamp(rr * 1.6, 0.0, 1.0);
      h += amp * k * mix(g, rr - 0.45, mt);
    }
    q = ROT * q * 2.03 + vec2(1.7, -3.1);
    amp *= gain; fq *= 2.03;
  }
  return max(h, uSea + 0.0001);
}

// ---------- colors measured from satellite pictures ----------
// (v36) measured again from Maz's satellite pictures (North Sea, the Gulf, Mesopotamia, the Sahara, the Amazon, East
// Anglia): real seas are slate and teal, not blue; dry land is pale beige-grey; forests and fields are greyer greens.
// These are the colours before satLook() adds the camera's haze.
const vec3 DEEP = vec3(0.075, 0.150, 0.170), OCEAN = vec3(0.085, 0.170, 0.190), MID = vec3(0.100, 0.200, 0.215), SHELF = vec3(0.140, 0.260, 0.265), SHOAL = vec3(0.230, 0.370, 0.345);
const vec3 TURQ = vec3(0.40, 0.60, 0.55), SILT = vec3(0.28, 0.40, 0.34), BANK = vec3(0.55, 0.58, 0.48);
const vec3 SAND = vec3(0.788, 0.725, 0.549), WETSAND = vec3(0.553, 0.518, 0.384);
const vec3 STEPPE = vec3(0.720, 0.670, 0.560), DRYGRASS = vec3(0.580, 0.560, 0.420), GRASS = vec3(0.430, 0.470, 0.300), LUSH = vec3(0.350, 0.420, 0.250);
const vec3 SCRUB = vec3(0.400, 0.430, 0.300), HILLGRASS = vec3(0.470, 0.480, 0.340), HILLSOIL = vec3(0.560, 0.500, 0.400), ERG = vec3(0.870, 0.740, 0.540);
const vec3 FORESTDARK = vec3(0.120, 0.200, 0.120), FOREST = vec3(0.190, 0.270, 0.170), FORESTLIGHT = vec3(0.260, 0.340, 0.210);
// what a satellite camera does to every colour: a little less saturated, and a thin blue-grey haze of air over it all
vec3 satLook(vec3 c) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(vec3(l), c, 0.88) * 0.93 + vec3(0.035, 0.040, 0.044);
}
const vec3 ROCK = vec3(0.420, 0.392, 0.357), ROCKLIGHT = vec3(0.604, 0.569, 0.518), ROCKDARK = vec3(0.247, 0.227, 0.204), SNOW = vec3(0.933, 0.945, 0.953), SNOWSHADE = vec3(0.667, 0.718, 0.769);
const vec3 HEDGE = vec3(0.231, 0.290, 0.165), TRACK = vec3(0.62, 0.58, 0.48), ROAD = vec3(0.55, 0.54, 0.52), ROOF1 = vec3(0.60, 0.36, 0.28), ROOF2 = vec3(0.56, 0.54, 0.52), ROOF3 = vec3(0.42, 0.40, 0.38), GARDEN = vec3(0.30, 0.40, 0.22);
// crops: the colors of real fields (sampled from a Copernicus Sentinel-2 picture of Bavarian farmland), a little livelier
vec3 cropColor(float h, float v) {
  // mostly greens, some ripe and harvested fields, a few ploughed: as in the Bavarian picture
  vec3 c;
  if (h < 0.30) c = vec3(0.30, 0.40, 0.24);
  else if (h < 0.52) c = vec3(0.36, 0.45, 0.28);
  else if (h < 0.66) c = vec3(0.44, 0.50, 0.32);
  else if (h < 0.78) c = vec3(0.56, 0.56, 0.40);
  else if (h < 0.88) c = vec3(0.66, 0.62, 0.47);
  else if (h < 0.95) c = vec3(0.50, 0.42, 0.30);
  else c = vec3(0.40, 0.50, 0.22);
  return c * (0.92 + 0.16 * v);
}
float segDist(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * t); }

// villages on a loose grid, about one every 6 km where there is farmland
const float VG = 0.12;
bool villageAt(ivec2 c, out vec2 pos, out float rad) {
  if (c.x < 0 || c.y < 0 || c.x >= uVGrid.x || c.y >= uVGrid.y) return false;
  vec4 v = texelFetch(uVillages, c, 0);
  pos = (vec2(c) + v.xy) * VG;
  rad = v.z * 1.5;
  return v.w > 0.5;
}
float cropAt(vec2 p) { return texture(uLand, p / vec2(96.0, 64.0)).r; }
float gFarm = 0.0;
vec3 landColor(vec2 p, float e, float h, vec3 n, float slope) {
  float pxm = uScale;                      // cells per pixel
  float m = moistureAt(p) + 0.07 * (vnoise(p * 2.1, uSeed + 88) - 0.5);
  float m0 = m;   // without the ragged forest edge: dry and wet land shade into each other slowly
  // ragged edges between forest and open land, more ragged the closer you look
  m += 0.06 * (fbm(p * 3.2 + 0.6 * vec2(gnoise(p * 1.3, uSeed + 6090), gnoise(p * 1.3 + 3.7, uSeed + 6091)), uSeed + 6092, 3) - 0.5);
  float amp = 0.035, fq = 9.0;
  for (int o = 0; o < 7; o++) { float k = octFade(fq); if (k <= 0.0) break; k *= octTop(fq); if (k > 0.0) m += amp * k * (vnoise(p * fq, uSeed + 6100 + o * 7) - 0.5);  amp *= 0.62; fq *= 2.0; }
  float hillW = sstep(uHill - 0.012, uHill + 0.022, e), mtnW = sstep(uMtn - 0.01, uMtn + 0.035, e);
  // how dry the open land is: the driest plains (about one in six) are semi-arid, pale beige-grey earth with thin grass
  // as in Mesopotamia; most are green grassland; the wettest, next to the forests, lush
  float wet = sstep(0.22, 0.52, m0);
  vec3 g = wet < 0.35 ? mix(STEPPE, DRYGRASS, wet / 0.35) : wet < 0.7 ? mix(DRYGRASS, GRASS, (wet - 0.35) / 0.35) : mix(GRASS, LUSH, (wet - 0.7) / 0.3);
  // broad patches of other soils and plant cover, as every real satellite picture shows: some paler, some greyer
  float mac = fbm(p * 0.55, uSeed + 140, 3) - 0.5, mac2 = fbm(p * 1.6 + 4.0, uSeed + 141, 3) - 0.5;
  g *= 1.0 + 0.16 * mac;
  g = mix(g, vec3(dot(g, vec3(0.3333))), sstep(0.05, 0.25, mac2) * 0.3);
  float mott = fbm(p * 3.3, uSeed + 120, 3) - 0.5;
  g = mix(g, mott > 0.0 ? SCRUB : g * 1.12, abs(mott) * 0.35);
  // dry country: stream beds and wadis show as a fine tree of darker, greener lines; sand sheets and low dunes
  // gather in the driest hollows
  float dryW = 1.0 - sstep(0.15, 0.55, wet);
  if (dryW > 0.01) {
    vec2 wq = p + 0.25 * vec2(gnoise(p * 3.0, uSeed + 150), gnoise(p * 3.0 + 7.0, uSeed + 151));
    float v1 = 1.0 - abs(gnoise(wq * 6.0, uSeed + 152)) * 1.6, v2 = 1.0 - abs(gnoise(wq * 17.0, uSeed + 153)) * 1.6;
    float lines = sstep(0.93, 0.99, v1) * sstep(0.4, 1.4, 0.02 / pxm) + 0.7 * sstep(0.93, 0.99, v2) * sstep(0.3, 0.7, v1) * sstep(0.4, 1.4, 0.008 / pxm);
    g = mix(g, vec3(0.44, 0.46, 0.33), min(lines, 1.0) * dryW * 0.55);
    // scrub and bare ground: dry land is a speckle of olive bushes, pale earth and darker stony patches
    float sp = fbm(p * 11.0, uSeed + 155, 4), st = fbm(p * 4.5 + 2.0, uSeed + 156, 3);
    g = mix(g, vec3(0.50, 0.50, 0.38), sstep(0.5, 0.72, sp) * dryW * 0.45);
    g = mix(g, vec3(0.80, 0.75, 0.65), sstep(0.5, 0.25, sp) * dryW * 0.25);
    g = mix(g, vec3(0.52, 0.49, 0.44), sstep(0.62, 0.8, st) * dryW * 0.35);
    float sandP = sstep(0.55, 0.75, fbm(p * 1.1, uSeed + 160, 4)) * sstep(0.75, 1.0, dryW) * 0.75;
    if (sandP > 0.01) {
      float dune = 0.5 + 0.5 * sin((dot(p, vec2(0.8, 0.6)) + 0.03 * gnoise(p * 40.0, uSeed + 161)) * 220.0);
      g = mix(g, mix(g, ERG, 0.7) * (1.0 + 0.07 * (dune - 0.5) * sstep(2.0, 5.0, 0.028 / pxm)), sandP);
    }
  }
  // fine mottle of grass and bare ground at every scale
  float fm = 0.0; amp = 0.08; fq = 16.0;
  for (int o = 0; o < 9; o++) { float k = octFade(fq); if (k <= 0.0) break; k *= octTop(fq); if (k > 0.0) fm += amp * k * (vnoise(p * fq, uSeed + 6200 + o * 7) - 0.5);  amp *= 0.7; fq *= 2.0; }
  g *= 1.0 + fm;
  vec3 hillGround = mix(HILLGRASS, HILLSOIL, sstep(0.2, 0.7, (1.0 - wet) * 0.6 + 0.3 * fbm(p * 2.0, uSeed + 130, 3)));
  g = mix(g, hillGround, hillW * 0.85);

  vec3 farmCol = g;
  // farmland: parcels that each run their own way, hedges and tracks between them, villages and roads
  vec4 lu = texture(uLand, p / vec2(96.0, 64.0));
  float farm = lu.r > 0.03 ? sstep(0.3, 0.5, lu.r + 0.32 * (fbm(p * 1.7, uSeed + 501, 3) - 0.5)) * (1.0 - mtnW) * (1.0 - 0.55 * hillW) : 0.0;
  gFarm = farm;
  float fw = sstep(uMoist - 0.03, uMoist + 0.03, m) * (1.0 - mtnW) * (1.0 - 0.35 * hillW);
  // logging: the canopy breaks into patches first, then gives way to stumps and open ground
  if (lu.b > 0.02 && fw > 0.01) {
    float patchv = fbm(p * 2.6, uSeed + 530, 3);
    float gone = sstep(patchv - 0.15, patchv + 0.15, lu.b * 1.25);
    g = mix(g, mix(DRYGRASS, vec3(0.48, 0.40, 0.28), 0.4), gone * fw);
    fw *= 1.0 - gone;
  }
  if (farm > 0.01) {
    float ang = floor(vnoise(p * 0.9, uSeed + 510) * 5.0) * 0.35 + 0.2;
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 q = rot * p;
    vec2 bs = vec2(0.026, 0.017) * (0.75 + 0.5 * floor(vnoise(p * 0.9, uSeed + 511) * 3.0) / 2.0);
    vec2 bc = floor(q / bs), bf = q / bs - bc;
    int bx = int(bc.x), by = int(bc.y);
    // a block holds 1 to 4 strips
    float ns = 1.0 + floor(hash2(bx, by, uSeed + 512) * 5.0);
    float sid = floor(bf.x * ns);
    float fh = hash2(bx * 7 + int(sid), by, uSeed + 513);
    vec3 fc = cropColor(fh, hash2(bx * 7 + int(sid), by, uSeed + 515));
    // inside a field: almost flat colour, a little texture of the crop
    fc *= 1.0 + 0.06 * (vnoise(p * 2400.0, uSeed + 516) - 0.5) * sstep(1.0, 3.0, 0.0004 / pxm);
    // stripes of the plough and the crop rows, close up
    float rowPx = 0.00012 / pxm;
    fc *= 1.0 + 0.05 * sstep(1.5, 4.0, rowPx) * sin(bf.y * 6.2832 * 40.0);
    float blockPx = min(bs.x / ns, bs.y) / pxm;
    vec3 avg = vec3(0.37, 0.42, 0.26);
    // from further away, fields blur into a patchwork of larger parcels, each its own colour
    vec2 gs = bs * vec2(3.0, 4.0), gc = floor(q / gs);
    vec3 gcol = mix(avg, cropColor(hash2(int(gc.x), int(gc.y), uSeed + 522), hash2(int(gc.x), int(gc.y), uSeed + 523)), 0.75);
    vec3 farC = mix(avg, gcol, sstep(0.9, 2.5, min(gs.x, gs.y) / pxm));
    fc = mix(farC, fc, sstep(1.5, 4.0, blockPx));
    // hedges and farm tracks
    float edge = min(min(bf.x * ns - sid, sid + 1.0 - bf.x * ns) * bs.x / ns, min(bf.y, 1.0 - bf.y) * bs.y);
    float hedgeW = 0.00025;
    float hv = 1.0 - sstep(hedgeW * 0.5, hedgeW * 0.5 + pxm, edge);
    fc = mix(fc, hash2(bx, by, uSeed + 514) < 0.5 ? HEDGE : TRACK, hv * sstep(1.0, 3.0, hedgeW / pxm) * 0.8);
    // woodlots and copses among the fields, as in real farmland
    float wl = 0.6 * gnoise(p * 9.0, uSeed + 517) + 0.3 * gnoise(p * 27.0, uSeed + 518) + 0.1 * gnoise(p * 81.0, uSeed + 519);
    float wood = sstep(0.17, 0.172 + 30.0 * pxm, wl + 0.03 * gnoise(p * 900.0, uSeed + 521));
    vec3 woodc = mix(FOREST, FORESTLIGHT, 0.4 + 0.5 * gnoise(p * 300.0, uSeed + 520)) * 0.92;
    fc = mix(fc, woodc, wood);
    // irrigated land: greener, with canals close up
    if (lu.g > 0.3) { fc = mix(fc, LUSH, 0.35 * lu.g); float cw = 0.0003; fc = mix(fc, vec3(0.24, 0.46, 0.56), lu.g * (1.0 - sstep(cw * 0.5, cw * 0.5 + pxm, abs(bf.y - 0.5) * bs.y)) * sstep(1.0, 3.0, cw / pxm)); }
    farmCol = fc;
  }
  // forest: a canopy; crowns of single trees once a pixel is smaller than a tree
  if (fw > 0.01) {
    float c1 = fbm(p * 7.0, uSeed + 77, 3);
    float crown = 0.0; amp = 0.35; fq = 40.0;
    for (int o = 0; o < 9; o++) { float k = octFade(fq); if (k <= 0.0) break; k *= octTop(fq); if (k > 0.0) crown += amp * k * (vnoise(p * fq, uSeed + 6300 + o * 7) - 0.5);  amp *= 0.75; fq *= 2.0; }
    float canopy = clamp(0.25 + 0.75 * c1 + crown, 0.0, 1.0);
    vec3 fc = canopy < 0.5 ? mix(FORESTDARK, FOREST, canopy * 2.0) : mix(FOREST, FORESTLIGHT, (canopy - 0.5) * 2.0);
    g = mix(g, fc, fw);
  }
  if (farm > 0.01) g = mix(g, farmCol, farm * (pxm < 0.02 ? 0.95 : 0.8));
  // bare rock on mountains and steep hillsides; snow on the peaks
  float rockAmt = max(mtnW * (0.65 + 0.35 * sstep(0.1, 0.5, slope)), hillW * sstep(0.55, 1.2, slope) * 0.6);
  if (rockAmt > 0.01) {
    float strata = fbm(p * 6.0, uSeed + 4105, 3);
    float sd = 0.0; amp = 0.25; fq = 24.0;
    for (int o = 0; o < 9; o++) { float k = octFade(fq); if (k <= 0.0) break; k *= octTop(fq); if (k > 0.0) sd += amp * k * (vnoise(p * fq, uSeed + 6400 + o * 7) - 0.5);  amp *= 0.7; fq *= 2.0; }
    vec3 rc = mix(mix(ROCKDARK, ROCK, sstep(0.25, 0.6, strata + sd)), ROCKLIGHT, sstep(0.62, 0.9, strata + sd));
    g = mix(g, rc, rockAmt);
  }
  float snow = sstep(uMtn + 0.075, uMtn + 0.13, h + 0.02 * n.y) * (1.0 - 0.6 * sstep(1.0, 2.0, slope));
  if (snow > 0.01) g = mix(g, mix(SNOWSHADE, SNOW, sstep(0.55, 0.9, dot(n, normalize(vec3(-0.62, -0.72, 0.7))))), snow * 0.95);

  // villages and the roads between them
  if (farm > 0.02 && pxm < 0.012) {
    ivec2 vc = ivec2(floor(p / VG));
    float best = 1e9; vec3 vcol = vec3(0.0); float vmix = 0.0;
    float road = 1e9;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      ivec2 c = vc + ivec2(i, j);
      vec2 pos; float rad;
      if (!villageAt(c, pos, rad)) continue;
      float d = length(p - pos) + rad * 0.35 * (vnoise(p * 900.0, uSeed + 7200) - 0.5);
      if (d < rad * 1.3) {
        // houses on a grid of plots, streets every few plots, gardens around
        // streets run out from the centre; houses stand along them with gardens behind
        vec2 rel = p - pos;
        float va = hash2(c.x, c.y, uSeed + 7304) * 3.14159;
        mat2 vr = mat2(cos(va), -sin(va), sin(va), cos(va));
        vec2 hp = (vr * rel) / 0.0007, hc = floor(hp), hf = hp - hc;
        float house = hash2(int(hc.x) + 4096, int(hc.y) + 4096, uSeed + 7300);
        bool street = abs(mod(hc.x, 5.0)) < 0.5 || abs(mod(hc.y, 4.0)) < 0.5;
        float inner = 1.0 - sstep(rad * 0.5, rad * 1.15, d);
        float dens = sstep(0.0, 0.8, inner);
        vec3 roof = house < 0.45 ? vec3(0.66, 0.36, 0.26) : house < 0.7 ? vec3(0.58, 0.30, 0.24) : house < 0.85 ? vec3(0.62, 0.60, 0.57) : vec3(0.40, 0.38, 0.36);
        vec3 hcol = street ? vec3(0.60, 0.59, 0.56) : (house < dens * 0.9 && hf.x > 0.15 && hf.x < 0.85 && hf.y > 0.2 && hf.y < 0.8) ? roof : mix(GARDEN, vec3(0.42, 0.48, 0.28), hash2(int(hc.x), int(hc.y), uSeed + 7305));
        float plotPx = 0.0007 / pxm;
        hcol = mix(vec3(0.50, 0.47, 0.42), hcol, sstep(1.5, 3.5, plotPx));
        if (inner > vmix) { vmix = inner; vcol = hcol; }
      }
      // roads to the next villages east and south
      for (int k = 0; k < 2; k++) {
        ivec2 c2 = c + (k == 0 ? ivec2(1, 0) : ivec2(0, 1));
        vec2 pos2; float rad2;
        if (!villageAt(c2, pos2, rad2)) continue;
        vec2 wob = 0.004 * vec2(vnoise(p * 40.0, uSeed + 7400) - 0.5, vnoise(p * 40.0, uSeed + 7401) - 0.5);
        road = min(road, segDist(p + wob, pos, pos2));
      }
    }
    g = mix(g, vcol, vmix);
    float rw = 0.00024;   // about 12 m wide
    float rv = 1.0 - sstep(rw * 0.5, rw * 0.5 + pxm, road);
    g = mix(g, vec3(0.70, 0.68, 0.63), rv * sstep(0.2, 1.2, rw / pxm + 0.4) * farm * 0.9);
  }
  // a strip of sand where the coast is low
  float ce = e - uSea;
  if (ce < 0.006 && slope < 1.2) g = mix(g, ce < 0.002 ? WETSAND : SAND, (1.0 - ce / 0.006) * 0.75);
  return g;
}


// how far a point is from the shore, in metres (positive on land): the coast height divided by its slope
float coastSmooth(vec2 p) { return elevationAt(p) + 0.03 * (fbm(p * 1.9, uSeed + 333, 4) - 0.5) - uSea; }
float shoreDistM(vec2 p) {
  float h = 0.004;
  float e0 = coastSmooth(p), ex = coastSmooth(p + vec2(h, 0.0)), ey = coastSmooth(p + vec2(0.0, h));
  float gl = length(vec2(ex - e0, ey - e0)) / h;
  return e0 / max(gl, 1e-4) * 50000.0;
}
// ---------- towns and cities ----------
// Every town is drawn from what it really is. Its people set its size, how dense and tall its centre is, and whether
// it has motorways, an airport and a stadium. Its industries set the factory districts: steel works with sheds, coal
// heaps and rail yards; chemical works with tank farms; light industry as white boxes and car parks; power stations
// with cooling towers. Offices raise the downtown towers; universities and tech parks make green campuses; harbours
// get container yards and breakwaters; resorts line the beach with hotels. Its climate sets its colours (grey roofs
// under trees in wet lands, terracotta and white in warm ones, sand and white in deserts, with empty sand lots), and
// each nation plans its towns its own way: straight grids of superblocks, boulevards meeting at star squares, or
// old-world quarters of crooked lanes. Steep slopes stay green; coasts and rivers shape the edge.
const float M = 1.0 / 50000.0;          // one metre, in map cells
const vec2 SUNDIR = vec2(-0.62, -0.72);
float wrapA(float a) { return a - 6.2831853 * floor((a + 3.14159265) / 6.2831853); }
mat2 rot2(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
// the direction of main road k at distance d from the centre (the cars in the game code use the same numbers)
float artAng(int k, int N, float a0, float d, float R) {
  float fk = float(k);
  return a0 + fk * 6.2831853 / float(N) + 0.15 * sin(fk * 1.7 + a0) + 0.12 * sin(d / R * 5.0 + fk * 2.1) * sstep(0.0, 0.2 * R, d);
}
// distance to the nearest radial main road; the wedge between main roads the point is in; distances to the two rings
float radialRoads(vec2 rel, float d, float R, float hh, out float ring1, out float ring2, out float wedgeA, out float wedgeSpan, out int wedge) {
  float th = atan(rel.y, rel.x);
  int N = 5 + int(hh * 4.0);
  float a0 = hh * 43.98;
  float best = 1e9, bestPos = 1e9;
  wedge = 0; wedgeA = 0.0; wedgeSpan = 1.0;
  for (int k = 0; k < 9 * uOne; k++) {
    if (k >= N) break;
    float ang = artAng(k, N, a0, d, R);
    float dl = wrapA(th - ang);
    if (abs(dl) < 1.5) best = min(best, d * abs(sin(dl)));
    float pos = dl < 0.0 ? dl + 6.2831853 : dl;
    if (pos < bestPos) { bestPos = pos; wedge = k; wedgeA = ang; }
  }
  float nxt = artAng(wedge + 1 >= N ? 0 : wedge + 1, N, a0, d, R);
  wedgeSpan = wrapA(nxt - wedgeA); if (wedgeSpan <= 0.0) wedgeSpan += 6.2831853;
  ring1 = abs(d - 0.3 * R * (1.0 + 0.05 * sin(3.0 * th + a0)));
  ring2 = abs(d - 0.62 * R * (1.0 + 0.06 * sin(2.0 * th + a0 * 1.3)));
  return best;
}
struct Town {
  vec2 c; float R, Ru, hh, pop, era, ind, heavy, chem, power, light, office, campus, resort, arid, hill, seaD, nuclear, fishing, big, med;
  vec2 seaDir; int style, seed; bool cap, port;
  float axis, elong, tint, green, park, canal, rows, sky;     // what makes this town itself
};
Town loadTown(int i) {
  Town t;
  vec4 r0 = texelFetch(uTowns, ivec2(i, 0), 0), r1 = texelFetch(uTowns, ivec2(i, 1), 0), r2 = texelFetch(uTowns, ivec2(i, 2), 0);
  vec4 r3 = texelFetch(uTowns, ivec2(i, 3), 0), r4 = texelFetch(uTowns, ivec2(i, 4), 0), r5 = texelFetch(uTowns, ivec2(i, 5), 0);
  t.c = r0.xy; t.R = r0.z; t.cap = mod(r0.w, 2.0) > 0.5; t.port = mod(r0.w, 4.0) > 1.5;
  t.ind = r1.x; t.pop = r1.y; t.hh = r1.z; t.era = r1.w;
  t.heavy = r2.x; t.chem = r2.y; t.power = r2.z; t.light = r2.w;
  t.office = r3.x; t.campus = r3.y; t.resort = r3.z; t.style = int(r3.w + 0.5);
  t.arid = r4.x; t.hill = r4.y; t.seaDir = r4.zw; t.seaD = r5.x; t.nuclear = r5.y; t.fishing = r5.z;
  t.Ru = t.R * 0.62; t.big = sstep(0.8, 6.0, t.pop); t.seed = uSeed + 9000 + i * 31;
  vec4 r6 = texelFetch(uTowns, ivec2(i, 6), 0), r7 = texelFetch(uTowns, ivec2(i, 7), 0);
  t.axis = r6.x; t.elong = max(r6.y, 1.0); t.tint = r6.z; t.green = r6.w;
  t.park = r7.x; t.canal = r7.y; t.rows = r7.z; t.sky = r7.w;
  // how much of a warm-country building tradition (tiled roofs, pale walls): old-world towns most, grids least
  t.med = (t.style == 2 ? 0.75 : t.style == 1 ? 0.35 : 0.15) * (1.0 - 0.6 * t.arid);
  if (t.canal > 0.5) t.med = 0.95;
  return t;
}
// a point measured in the town's own shape: stretched along its axis (its river, its coast), squeezed across it
vec2 aniso(vec2 rel, Town t) { vec2 r = rot2(t.axis) * rel; float e = sqrt(t.elong); return vec2(r.x / e, r.y * e); }
// how built-up the ground is (about 0.32 is the edge of the town)
float townDens(vec2 rel, Town t, float art, float pxm) {
  vec2 wv = vec2(fbm(rel / t.Ru * 1.4 + 3.1, t.seed + 20, 3), fbm(rel / t.Ru * 1.4 + 7.7, t.seed + 21, 3)) - 0.5;
  float d = length(rel);
  float u = length(aniso(rel + wv * t.Ru * 0.5 * sstep(0.0, 0.4 * t.Ru, d), t)) / t.Ru;
  float core = 1.0 - u;
  float R = t.R;
  float corr = 0.6 * (1.0 - sstep(0.012 * R, 0.045 * R, art)) * (1.0 - sstep(0.55 * R, 1.15 * R, d));
  float sat = 0.62 * sstep(0.68, 0.76, fbm(rel / (0.1 * R) + 11.0, t.seed + 22, 2)) * (1.0 - sstep(0.5 * R, 1.2 * R, d));
  float dn = max(max(core, corr), sat);
  float amp = 0.17, sc = 0.08 * t.Ru;
  for (int o = 0; o < 7 * uOne; o++) {
    float k = sstep(1.5, 4.0, sc / pxm);
    if (k <= 0.0) break;
    dn += amp * k * (vnoise(rel / sc, t.seed + 30 + o) - 0.5);
    amp *= 0.6; sc *= 0.5;
  }
  return dn;
}
vec2 gSunQ = vec2(-0.65, -0.76);   // the direction of the sun in the street grid being drawn
// a lot with one building: returns 1 inside the building, -1 in its shadow, 0 outside; coords in metres
float building(vec2 q, vec2 lot, float margin, float height) {
  vec2 lo = lot * margin, hi = lot * (1.0 - margin);
  if (all(greaterThan(q, lo)) && all(lessThan(q, hi))) return 1.0;
  vec2 s = q + gSunQ * height * 0.55;   // towards the sun: is the building between us and it?
  if (all(greaterThan(s, lo)) && all(lessThan(s, hi))) return -1.0;
  return 0.0;
}
// a building between lo and hi inside its lot (metres): 1 building, -1 its shadow, 0 outside
float buildingAt(vec2 q, vec2 lo, vec2 hi, float height) {
  if (all(greaterThan(q, lo)) && all(lessThan(q, hi))) return 1.0;
  vec2 s = q + gSunQ * height * 0.55;
  if (all(greaterThan(s, lo)) && all(lessThan(s, hi))) return -1.0;
  return 0.0;
}
// a perimeter block (buildings round the edge, a courtyard inside): 1 building, -1 shadow, 0 courtyard
float perimeter(vec2 q, vec2 sz, float depth, float height) {
  vec2 e2 = min(q, sz - q);
  bool inB = all(greaterThan(q, vec2(0.0))) && all(lessThan(q, sz));
  if (inB && min(e2.x, e2.y) < depth) return 1.0;
  vec2 s = q + gSunQ * height * 0.55;
  vec2 es = min(s, sz - s);
  if (all(greaterThan(s, vec2(0.0))) && all(lessThan(s, sz)) && min(es.x, es.y) < depth) return -1.0;
  return 0.0;
}
// a round thing seen from above (a tank, a cooling tower, a dome): 1 top, -1 its shadow, 0 outside; r and h in metres
float roundThing(vec2 q, float r, float h) {
  if (length(q) < r) return 1.0;
  if (length(q + gSunQ * h * 0.55) < r) return -1.0;
  return 0.0;
}
// roof colours by building tradition and climate: grid towns have grey and brown shingles, boulevard towns grey zinc
// and cream stone, old-world towns terracotta tiles among pale walls; warm lands add tiles and whitewash, deserts
// flat roofs of white, beige and sand
vec3 roofCol(Town t, float lh) {
  vec3 grid = lh < 0.35 ? vec3(0.34, 0.34, 0.35) : lh < 0.6 ? vec3(0.47, 0.47, 0.47) : lh < 0.82 ? vec3(0.45, 0.38, 0.33) : vec3(0.62, 0.61, 0.58);
  vec3 boul = lh < 0.4 ? vec3(0.50, 0.52, 0.54) : lh < 0.65 ? vec3(0.42, 0.44, 0.46) : lh < 0.88 ? vec3(0.72, 0.68, 0.60) : vec3(0.58, 0.40, 0.33);
  vec3 old_ = lh < 0.45 ? vec3(0.66, 0.42, 0.32) : lh < 0.65 ? vec3(0.58, 0.38, 0.30) : lh < 0.85 ? vec3(0.76, 0.70, 0.60) : vec3(0.84, 0.82, 0.78);
  vec3 c = t.style == 0 ? grid : t.style == 1 ? boul : old_;
  float warm = 0.5 * (1.0 - sstep(0.3, 0.6, 1.0 - t.arid)) ;     // semi-dry lands: more tiles and whitewash
  vec3 warmC = lh < 0.5 ? vec3(0.68, 0.43, 0.33) : lh < 0.8 ? vec3(0.80, 0.75, 0.66) : vec3(0.87, 0.86, 0.83);
  c = mix(c, warmC, warm * (t.style == 0 ? 0.4 : 0.7));
  vec3 dry = lh < 0.45 ? vec3(0.86, 0.84, 0.79) : lh < 0.75 ? vec3(0.78, 0.73, 0.64) : lh < 0.9 ? vec3(0.70, 0.64, 0.54) : vec3(0.58, 0.57, 0.55);
  c = mix(c, dry, sstep(0.55, 0.9, t.arid));
  if (t.canal > 0.5) c = lh < 0.78 ? vec3(0.66, 0.38, 0.29) * (0.88 + 0.24 * fract(lh * 9.1)) : vec3(0.74, 0.66, 0.56);
  return c * vec3(1.0 + 0.07 * t.tint, 1.0 + 0.01 * t.tint, 1.0 - 0.07 * t.tint);
}
vec3 roofAvg(Town t) { return (roofCol(t, 0.2) + roofCol(t, 0.5) + roofCol(t, 0.72) + roofCol(t, 0.95)) * 0.25; }
vec3 yardCol(Town t) { return mix(vec3(0.39, 0.43, 0.33), vec3(0.71, 0.63, 0.49), t.arid); }
vec3 sandCol(Town t, vec2 q) { return mix(vec3(0.52, 0.47, 0.38), vec3(0.76, 0.67, 0.52), t.arid) * (0.94 + 0.12 * vnoise(q / 23.0, t.seed + 80)); }
const vec3 ASPHALT = vec3(0.27, 0.27, 0.28), STREET = vec3(0.35, 0.35, 0.35), CONCRETE = vec3(0.62, 0.61, 0.58), TREE = vec3(0.15, 0.25, 0.13), RAIL = vec3(0.36, 0.33, 0.30);
float gCityFlat = 0.0;
float gRivBank = 1e9;   // metres from the edge of a sizeable river (for quays and riverside parks; set by the rivers)
float gTownRoad = 0.0;
// ---- the big sites a town may have: an airport, a power station, a stadium, a palace ----
// returns colour and cover; drawn over the town
vec4 townSites(Town t, vec2 rel, float pxm) {
  vec4 o = vec4(0.0);
  vec2 sea = length(t.seaDir) > 0.5 && t.seaD < 2.5 ? normalize(t.seaDir) : vec2(cos(t.hh * 9.0), sin(t.hh * 9.0));
  // airport: once a town is big enough and aircraft fly; on the landward side, just beyond the built-up area
  if (t.era >= 2.0 && t.pop > 1.2) {
    vec2 dirA = rot2((t.hh - 0.5) * 1.6) * -sea;
    vec2 ac = dirA * (t.Ru * 0.95 + 0.06);
    vec2 aq = (rot2(t.hh * 5.3) * (rel - ac)) / M;
    gSunQ = normalize(rot2(t.hh * 5.3) * SUNDIR);
    float big = sstep(1.2, 8.0, t.pop);
    vec2 half_ = vec2(2100.0 + 900.0 * big, 1100.0 + 300.0 * big);
    if (abs(aq.x) < half_.x && abs(aq.y) < half_.y) {
      vec3 c = mix(vec3(0.44, 0.50, 0.33), vec3(0.74, 0.67, 0.53), t.arid) * (0.95 + 0.1 * vnoise(aq / 60.0, t.seed + 90));
      float rl = half_.x - 250.0;
      // two runways (one for a smaller town), with markings; parallel taxiways
      for (int r = 0; r < 2 * uOne; r++) {
        if (r == 1 && big < 0.3) break;
        float ry = r == 0 ? -half_.y * 0.45 : half_.y * 0.45;
        float off = r == 0 ? 0.0 : 400.0;
        float dx = abs(aq.x - off) - rl, dy = abs(aq.y - ry);
        if (dx < 0.0 && dy < 30.0) { c = vec3(0.33, 0.33, 0.33); if (dy < 1.5 && fract(aq.x / 60.0) < 0.5) c = vec3(0.9); if (abs(dx + 30.0) < 30.0 && fract(aq.y / 6.0) < 0.5) c = vec3(0.9); }
        if (dx < 0.0 && abs(dy - 180.0) < 11.0) c = vec3(0.40, 0.40, 0.39);
      }
      // apron and terminal in the middle; aircraft parked on the apron
      vec2 tq = aq - vec2(0.0, 0.0);
      if (abs(tq.x) < 600.0 && abs(tq.y) < 120.0) {
        c = vec3(0.60, 0.60, 0.58);
        vec2 pc = tq - vec2(80.0, 50.0) * floor(tq / vec2(80.0, 50.0) + 0.5);
        float plane = (abs(pc.x) < 3.0 && abs(pc.y) < 22.0) || (abs(pc.x) < 20.0 && abs(pc.y - 2.0) < 3.0) ? 1.0 : 0.0;
        c = mix(c, vec3(0.93), plane * step(0.4, hash2(int(floor(tq.x / 80.0 + 0.5)), int(floor(tq.y / 50.0 + 0.5)), t.seed + 91)));
      }
      float tb = building(tq - vec2(-500.0, 120.0), vec2(1000.0, 90.0), 0.0, 18.0);
      if (tb > 0.5) c = vec3(0.80, 0.80, 0.78); else if (tb < -0.5) c *= 0.6;
      o = vec4(c, 1.0);
    }
  }
  // power station: on the water if there is any, beyond the town
  if (t.power + t.nuclear > 0.0) {
    vec2 pc = sea * min(t.Ru * 0.85, max(t.seaD - 0.1, 0.3 * t.Ru)) + rot2(1.5708) * sea * t.Ru * 0.2;
    vec2 pq = (rot2(t.hh * 3.1) * (rel - pc)) / M;
    gSunQ = normalize(rot2(t.hh * 3.1) * SUNDIR);
    if (abs(pq.x) < 450.0 && abs(pq.y) < 300.0) {
      vec3 c = vec3(0.55, 0.55, 0.53);
      if (t.nuclear > 0.0) {
        for (int k = 0; k < 2 * uOne; k++) { float r = roundThing(pq - vec2(-150.0 + 120.0 * float(k), -120.0), 28.0, 40.0); if (r > 0.5) c = vec3(0.88, 0.88, 0.86) * (0.85 + 0.15 * sstep(-28.0, 28.0, -dot(pq - vec2(-150.0 + 120.0 * float(k), -120.0), gSunQ))); else if (r < -0.5) c *= 0.6; }
      } else {
        // the coal heap
        if (abs(pq.x + 200.0) < 160.0 && abs(pq.y + 150.0) < 90.0) c = vec3(0.12, 0.12, 0.12) * (0.9 + 0.2 * vnoise(pq / 8.0, t.seed + 92));
      }
      // cooling towers: hollow rings that cast long shadows
      for (int k = 0; k < 3 * uOne; k++) {
        vec2 cq = pq - vec2(-250.0 + 170.0 * float(k), 130.0);
        float ct = roundThing(cq, 55.0, 120.0);
        if (ct > 0.5) c = length(cq) > 44.0 ? vec3(0.70, 0.70, 0.68) : vec3(0.32, 0.32, 0.31); else if (ct < -0.5) c *= 0.55;
      }
      float hall = building(pq - vec2(150.0, -220.0), vec2(250.0, 110.0), 0.0, 35.0);
      if (hall > 0.5) c = vec3(0.62, 0.58, 0.52); else if (hall < -0.5) c *= 0.6;
      o = vec4(c, 1.0);
    }
  }
  // stadium: for a city of a million or more, by the inner ring
  if (t.pop > 0.8 && t.era >= 1.0) {
    vec2 sc = vec2(cos(t.hh * 17.0), sin(t.hh * 17.0)) * 0.3 * t.R;
    vec2 sq = (rot2(t.hh * 2.0) * (rel - sc)) / M;
    gSunQ = normalize(rot2(t.hh * 2.0) * SUNDIR);
    float ev = length(sq / vec2(135.0, 100.0));
    if (ev < 1.7) {
      vec3 c = vec3(0.50, 0.50, 0.49);                              // car parks around it
      if (ev < 1.0) c = vec3(0.86, 0.86, 0.84);                     // the roof over the stands
      if (ev < 0.72) c = vec3(0.55, 0.52, 0.50);                    // seats
      if (ev < 0.55) c = vec3(0.27, 0.48, 0.24) * (0.93 + 0.07 * step(0.5, fract(sq.x / 12.0)));   // the pitch, mown in stripes
      float sh = length((sq + gSunQ * 25.0) / vec2(135.0, 100.0));
      if (ev >= 1.0 && sh < 1.0) c *= 0.6;
      o = vec4(c, 1.0);
    }
  }
  return o;
}
// the height of the downtown building standing at q (0 on streets and open lots), the same rules as when drawn
float cbdHeight(vec2 q, vec2 bsz, float streetW, int seed, float towers, float fall) {
  vec2 bc = floor(q / bsz), bf = q - bc * bsz;
  vec2 inner = bf - streetW * 0.5, isz = bsz - streetW;
  if (any(lessThan(inner, vec2(0.0))) || any(greaterThan(inner, isz))) return 0.0;
  float bh2 = hash2(int(bc.x), int(bc.y), seed + 19);
  vec2 nl = vec2(1.0 + floor(bh2 * 3.0), 1.0 + floor(fract(bh2 * 7.0) * 2.0));
  vec2 lot = isz / nl, li = floor(inner / lot), lf = inner - li * lot;
  float lh = hash2(int(bc.x * 8.0 + li.x), int(bc.y * 8.0 + li.y), seed + 10);
  if (lh > 0.92) return 0.0;
  float margin = 0.04 + 0.12 * fract(lh * 13.0);
  if (any(lessThan(lf, lot * margin)) || any(greaterThan(lf, lot * (1.0 - margin)))) return 0.0;
  return 15.0 + 230.0 * towers * lh * lh * fall;
}
// a town's great park: a long rectangle in a grid town (Central Park, Golden Gate Park), a broad park with a
// winding lake in a boulevard town (Hyde Park), an irregular wooded hill park in an old-world town; inside: woods,
// meadows, a lake, paths. Returns colour and cover.
vec4 greatPark(Town t, vec2 rel, float pxm, float ang) {
  vec2 c0 = vec2(cos(t.hh * 23.0), sin(t.hh * 23.0)) * 0.13 * t.Ru;
  vec2 pq = (rot2(ang) * (rel - c0)) / M;                       // metres, along the park
  float Lm = clamp(0.2 * t.Ru / M, 1400.0, 4800.0);
  vec2 hs = t.style == 0 ? vec2(Lm, Lm * 0.2) : t.style == 1 ? vec2(Lm * 0.75, Lm * 0.32) : vec2(Lm * 0.55, Lm * 0.4);
  float pm = pxm / M;
  float edgeN = t.style == 0 ? 0.0 : (t.style == 1 ? 0.06 : 0.22) * (vnoise(pq / (hs.y * 0.6), t.seed + 90) - 0.5);
  vec2 e = abs(pq) / hs;
  float box = t.style == 0 ? max(e.x, e.y) : length(pow(e, vec2(t.style == 1 ? 4.0 : 2.0))) ;
  box = t.style == 0 ? box : pow(box, t.style == 1 ? 0.25 : 0.5);
  float inside = 1.0 - sstep(1.0 + edgeN - pm / hs.y * 0.5, 1.0 + edgeN + pm / hs.y * 0.5, box);
  if (inside <= 0.0) return vec4(0.0);
  vec3 c = vec3(0.31, 0.44, 0.23) * (0.94 + 0.12 * vnoise(pq / 40.0, t.seed + 91));
  // woods: big clumps of trees, more than half the park
  float wd = 0.6 * gnoise(pq / 260.0, t.seed + 92) + 0.3 * gnoise(pq / 70.0, t.seed + 93) + 0.1 * gnoise(pq / 18.0, t.seed + 94);
  float woods = sstep(-0.08, 0.0, wd);
  vec3 tc = mix(vec3(0.12, 0.21, 0.10), vec3(0.22, 0.32, 0.15), vnoise(pq / 6.0, t.seed + 95));
  c = mix(c, mix(tc, vec3(0.20, 0.30, 0.15), 1.0 - sstep(0.6, 2.0, 8.0 / pm)), woods);
  // a lake (a long winding one in a boulevard town), with a reservoir in a grid town
  vec2 lq = pq - vec2(hs.x * 0.25, 0.0);
  float lake = t.style == 1 ? abs(lq.y - hs.y * 0.3 * sin(lq.x / (hs.x * 0.35))) / (hs.y * 0.12) + max(0.0, abs(lq.x) - hs.x * 0.45) / 50.0
                            : length(lq / vec2(hs.x * 0.16, hs.y * 0.45)) + 0.25 * (vnoise(pq / 120.0, t.seed + 96) - 0.5);
  float lw = 1.0 - sstep(1.0 - pm / 80.0, 1.0 + pm / 80.0, lake);
  c = mix(c, vec3(0.10, 0.18, 0.21), lw);
  if (t.style == 0) { vec2 rq = abs(pq + vec2(hs.x * 0.45, 0.0)) / (hs.y * vec2(0.9, 0.55)); float res = 1.0 - sstep(1.0 - pm / 60.0, 1.0 + pm / 60.0, length(pow(rq, vec2(3.0)))); c = mix(c, vec3(0.11, 0.19, 0.24), res); }
  // paths and a drive winding through
  float path = abs(gnoise(pq / 330.0, t.seed + 97)) * 330.0;
  c = mix(c, vec3(0.70, 0.67, 0.58), (1.0 - sstep(2.5, 2.5 + pm, path)) * sstep(0.6, 2.0, 5.0 / pm) * (1.0 - lw));
  // a wall of trees along the edge
  c = mix(c, tc, (1.0 - sstep(0.0, 30.0 + pm, (1.0 - box) * hs.y)) * 0.8 * (1.0 - lw));
  return vec4(c, inside);
}
// the riverside in a town: a stone quay, a road along the water, a strip of trees and lawns
vec4 riversideColor(Town t, vec2 rel, float pxm, float cover) {
  if (gRivBank >= 160.0 || cover <= 0.0) return vec4(0.0);
  float rb = gRivBank, pm = pxm / M;
  float bigT = sstep(1.5, 6.0, t.pop);
  float roadW = 14.0 + 22.0 * bigT;
  float quay = 1.0 - sstep(4.0, 4.0 + pm, rb);
  float road = sstep(6.0 - pm * 0.5, 6.0 + pm * 0.5, rb) * (1.0 - sstep(6.0 + roadW, 6.0 + roadW + pm, rb));
  float greenW = 25.0 + 90.0 * t.green;
  float strip = sstep(6.0 + roadW, 6.0 + roadW + pm, rb) * (1.0 - sstep(6.0 + roadW + greenW, 6.0 + roadW + greenW + pm, rb));
  vec2 qt = rel / M;
  float tr = sstep(-0.05, 0.05, gnoise(qt / 14.0, t.seed + 98) + 0.3);
  vec3 sc = mix(vec3(0.34, 0.45, 0.25), mix(TREE, vec3(0.22, 0.33, 0.16), vnoise(qt / 5.0, t.seed + 99)), tr);
  float vis = sstep(0.5, 2.0, 12.0 / pm);
  vec3 col = ASPHALT;
  col = mix(col, mix(vec3(0.62, 0.60, 0.55), vec3(0.75, 0.70, 0.60), t.arid), quay);
  float sA = strip * (1.0 - t.arid * 0.5) * sstep(0.3, 1.5, greenW / pm);
  col = mix(col, mix(sc, vec3(0.60, 0.56, 0.47), t.arid * 0.6), strip);
  return vec4(col, max(quay, max(road, sA)) * cover * vis);
}
vec4 cityColor(vec2 p, float pxm, float ce, float slope) {
  vec4 outc = vec4(0.0);
  float shoreM = -1.0;   // worked out only when a town by the sea needs it
  vec4 ti = floor(texelFetch(uTownIdx, ivec2(clamp(floor(p), vec2(0.0), vec2(95.0, 63.0))), 0) * 255.0 + 0.5);
  for (int kk = 0; kk < 4 * uOne; kk++) {
    int i = int(ti[kk]) - 1;
    if (i < 0) break;
    vec4 r0 = texelFetch(uTowns, ivec2(i, 0), 0);
    vec2 rel = p - r0.xy;
    if (abs(rel.x) > r0.z * 1.8 || abs(rel.y) > r0.z * 1.8) continue;
    Town t = loadTown(i);
    if (shoreM < 0.0) shoreM = t.seaD < 2.0 ? max(shoreDistM(p), 0.0) : -1.0;
    float shoreT = shoreM < 0.0 ? 1e6 : shoreM;
    float R = t.R, Ru = t.Ru, hh = t.hh; int seed = t.seed;
    float d = length(rel);
    // ---- the main roads ----
    float ring1, ring2, wA, wSpan; int wedge;
    float radial = radialRoads(rel, d, R, hh, ring1, ring2, wA, wSpan, wedge);
    float da = length(aniso(rel, t));
    { float th = atan(rel.y, rel.x), a0 = hh * 43.98;
      ring1 = abs(da - 0.3 * R * (1.0 + 0.05 * sin(3.0 * th + a0)));
      ring2 = abs(da - 0.62 * R * (1.0 + 0.06 * sin(2.0 * th + a0 * 1.3))); }
    float ang0 = hh * 1.5707963;
    float seamD = 1e9;
    if (t.style == 0) {
      float PS = 0.4 * Ru;
      vec2 pq = rel / PS, pi_ = floor(pq);
      float f1 = 9.0, f2 = 9.0; vec2 c1 = vec2(0.0), p1 = vec2(0.0);
      for (int y = -1; y <= 1 * uOne; y++) for (int x = -1; x <= 1 * uOne; x++) {
        vec2 c = pi_ + vec2(x, y);
        vec2 pt = c + 0.15 + 0.7 * vec2(hash2(int(c.x) + 700, int(c.y) + 700, seed + 61), hash2(int(c.x) + 700, int(c.y) + 700, seed + 62));
        float dd = length(pq - pt);
        if (dd < f1) { f2 = f1; f1 = dd; c1 = c; p1 = pt; } else if (dd < f2) f2 = dd;
      }
      float ph = hash2(int(c1.x) + 700, int(c1.y) + 700, seed + 63);
      // the oldest patch, at the centre, keeps the town's first grid
      float off = length(p1 * PS) < 0.35 * Ru ? 0.0 : ph < 0.35 ? 0.0 : ph < 0.55 ? 0.7854 : ph < 0.78 ? 0.36 : -0.5;
      ang0 += off;
      seamD = (f2 - f1) * 0.5 * PS;
    }
    vec2 q0 = (rot2(ang0) * rel) / M;
    float S = mix(1500.0, 1100.0, t.arid);                      // superblocks (a mile apart in a wet grid town)
    vec2 gq = abs(q0 - S * floor(q0 / S + 0.5));
    float gridArt = min(gq.x, gq.y) * M;
    bool hwOn = t.era >= 3.0 && t.pop > 1.5;                     // motorways, in the age of the car
    float hwR = 0.72 * Ru;
    float dens = townDens(rel, t, radial, pxm);
    // steep slopes stay green; hill towns climb only so far
    dens -= 0.55 * sstep(0.5, 1.3, slope) * (0.5 + 0.5 * t.hill);
    float cover = sstep(0.29, 0.34, dens);
    float popW = sstep(0.3, 6.0, t.pop);
    float artW = (30.0 + 25.0 * popW) * M;
    // which roads are main roads: a grid town's are its superblock lines (and motorways outside); others radiate
    float art = t.style == 0 ? (d < hwR ? min(gridArt, seamD) : radial) : radial;
    if (t.style == 0 && d < hwR) {
      vec2 gi = floor(q0 / S + 0.5);
      bool major = (gq.x < gq.y ? mod(gi.x, 3.0) : mod(gi.y, 3.0)) < 0.5;
      artW = major ? artW : artW * 0.6;
    }
    float onArt = (1.0 - sstep(artW * 0.5, artW * 0.5 + pxm, art)) * min(1.0, max(artW / pxm, 0.4));
    onArt *= t.style == 0 && d < hwR ? sstep(0.25, 0.32, dens) : (1.0 - sstep(1.1 * R, 1.3 * R, d));
    float hwW = 70.0 * M;
    if (t.canal > 0.5 && d < 0.12 * R) onArt *= sstep(0.09 * R, 0.12 * R, d);
    float onHw = 0.0, hwD = 1e9;
    if (hwOn) {
      float ringHw = abs(da - hwR * (1.0 + 0.08 * sin(3.0 * atan(rel.y, rel.x) + hh * 9.0)));
      hwD = min(ringHw, da > hwR * 0.95 ? radial : 1e9);
      onHw = (1.0 - sstep(hwW * 0.5, hwW * 0.5 + pxm, hwD)) * min(1.0, max(hwW / pxm, 0.45)) * (1.0 - sstep(1.2 * R, 1.35 * R, d));
    }
    float ringW = 30.0 * M;
    float onRing = (1.0 - sstep(ringW * 0.5, ringW * 0.5 + pxm, min(ring1, hwOn ? 1e9 : ring2))) * sstep(0.22, 0.3, dens) * min(1.0, max(ringW / pxm, 0.35));
    if (t.style == 0) onRing *= 0.0;
    // railway: from a station near the centre out into the country
    float railA = hh * 13.0 + 0.4;
    vec2 rd = vec2(cos(railA), sin(railA));
    float along = dot(rel, rd), across = abs(rd.x * rel.y - rd.y * rel.x);
    float railOn = (t.heavy + t.chem + t.pop > 0.6) ? (1.0 - sstep(7.0 * M, 7.0 * M + pxm, across)) * sstep(0.05 * R, 0.07 * R, along) * (1.0 - sstep(1.25 * R, 1.4 * R, along)) * min(1.0, max(14.0 * M / pxm, 0.3)) : 0.0;
#ifdef CITY_LITE
    vec4 site = vec4(0.0);
#else
    vec4 site = townSites(t, rel, pxm);
#endif
    if (cover < 0.005 && onArt < 0.01 && onRing < 0.01 && onHw < 0.01 && railOn < 0.01 && site.a < 0.01) continue;
    // ---- neighbourhoods and their street grids ----
    float r1 = 0.3 * R, r2 = 0.62 * R;
    int band = d < r1 ? 0 : d < r2 ? 1 : 2;
    float L = 0.075 * R;
    float frac = clamp(wrapA(atan(rel.y, rel.x) - wA) / wSpan, 0.0, 1.0);
    float rr = (d + 0.03 * R * (gnoise(vec2(float(wedge) * 3.1 + frac * 2.5, d / L * 0.7), seed + 40))) / L;
    float ri = floor(rr);
    float hs = hash2(wedge * 17 + band, int(ri), seed + 41);
    float sp = 0.3 + 0.4 * hs + 0.12 * gnoise(vec2(d / L * 0.8, float(wedge) * 1.7), seed + 39);
    int sub = frac < sp ? 0 : 1;
    float nh = hash2(wedge * 37 + sub * 7 + band * 3, int(ri) + 100, seed + 42), nh2 = hash2(wedge * 37 + sub * 7 + band * 3, int(ri) + 200, seed + 43);
    float aveW = 22.0 * M;
    float aveD = t.style == 0 ? 1e9 : min(min(fract(rr), 1.0 - fract(rr)) * L, d * abs(sin((frac - sp) * wSpan)));
    if (d < 0.1 * R) aveD = 1e9;
    float onAve = (1.0 - sstep(aveW * 0.5, aveW * 0.5 + pxm, aveD)) * cover * min(1.0, max(aveW / pxm, 0.3));
    float midA = wA + wSpan * (sub == 0 ? sp * 0.5 : (sp + 1.0) * 0.5);
    float leafy = sstep(0.35, 0.75, fbm(rel / (0.05 * R) + 1.3, seed + 51, 2));
    float trees = clamp((1.0 - t.arid * 0.85) * (0.35 + 1.0 * t.green), 0.0, 1.0);   // how much a garden can grow here, and how much this town plants
    leafy *= 0.4 + 0.9 * t.green;
    // the grid: one for the whole town in a grid town; each neighbourhood its own otherwise
    float gAng = t.style == 0 ? ang0 : midA + (nh < 0.5 ? 0.0 : 1.5707963) + (nh2 - 0.5) * 0.5;
    float oldR = t.canal > 0.5 ? 0.11 * R : t.style == 2 ? 0.035 * R : t.style == 1 ? 0.022 * R : 0.0;
    bool oldTown = t.style != 0 && oldR > 0.0 && d < oldR * (1.0 + 0.7 * (fbm(rel / (0.5 * oldR), seed + 45, 3) - 0.5));
    if (oldTown) gAng = hh * 6.28;
    mat2 rot = rot2(gAng);
    vec2 q = (rot * rel) / M;
    gSunQ = normalize(rot * SUNDIR);
    if (oldTown || t.style == 2) {
      float wamp = oldTown ? 18.0 : 9.0;
      q += wamp * vec2(gnoise(q / 90.0, seed + 46), gnoise(q / 90.0 + 3.3, seed + 47));
    }
    // newer suburbs: streets that curve
    float curvy = sstep(0.55, 0.75, 1.0 - dens) * step(0.35, nh2) * (0.5 + leafy) * (t.style == 0 ? 0.4 : 1.0);
    if (!oldTown && curvy > 0.0) q += 70.0 * curvy * vec2(gnoise(q / 420.0, seed + 52), gnoise(q / 420.0 + 7.7, seed + 53));
    vec2 wv0 = vec2(fbm(rel / Ru * 1.4 + 3.1, seed + 20, 3), fbm(rel / Ru * 1.4 + 7.7, seed + 21, 3)) - 0.5;
    float uC = length(aniso(rel + wv0 * Ru * 0.5 * sstep(0.0, 0.4 * Ru, d), t)) / Ru;
    // the downtown: bigger with more people and more offices
    float cbdR = 0.035 + 0.06 * min(t.sky, 1.0) + 0.006 * min(t.office, 10.0);
    uC += cbdR * 0.9 * (fbm(rel / (cbdR * Ru * 0.7) + 5.0, seed + 54, 2) - 0.5);
    // industry: districts, more of them where more is made, along the coast in a harbour town
    float indAmt = t.heavy + t.chem + t.light + 0.5 * t.power;
    float coastBias = t.port ? 0.12 * (1.0 - sstep(300.0, 1500.0, shoreT)) : 0.0;
    float indThr = 0.74 - 0.012 * min(indAmt, 25.0);
    float indF = fbm(rel / (0.07 * R) + 4.0, seed + 44, 3) + coastBias - 0.25 * (1.0 - sstep(0.12 * R, 0.25 * R, d));
    bool industry = indAmt > 0.0 && indF > indThr;
    vec2 bsz = oldTown ? vec2(70.0, 55.0) : industry ? vec2(240.0, 170.0) : uC < cbdR ? vec2(115.0, 100.0)
             : t.style == 0 ? (t.arid > 0.5 ? vec2(110.0, 52.0) : vec2(125.0, 90.0)) : dens > 0.6 ? vec2(150.0, 110.0) : vec2(130.0, 62.0);
    if (!oldTown) bsz *= 0.85 + 0.3 * (t.style == 0 ? 0.5 : nh);
    float streetW = oldTown ? 8.0 : uC < cbdR ? 20.0 : industry ? 16.0 : t.arid > 0.5 ? 10.0 : 12.0;
    vec2 bc = floor(q / bsz), bf = q - bc * bsz;
    float bh = hash2(int(bc.x), int(bc.y), seed + 5), bh2 = hash2(int(bc.x), int(bc.y), seed + 19);
    float blockPx = min(bsz.x, bsz.y) * M / pxm;
    // ---- far away: the colour of each part of the town, varying smoothly ----
    vec3 housesFar = mix(roofAvg(t), yardCol(t), 0.3);
    housesFar = mix(housesFar, TREE * 1.3, (0.15 + 0.45 * leafy) * trees);
    vec3 flatsFar = mix(roofAvg(t), vec3(0.5, 0.5, 0.48), 0.4);
    vec3 far = mix(housesFar, flatsFar, sstep(0.5, 0.7, dens));
    // downtown from far: dark with the shadows of its towers, the more so the taller they are
    vec3 cbdFar = mix(mix(vec3(0.55, 0.55, 0.54), roofAvg(t), 0.3), vec3(0.27, 0.29, 0.32), sstep(0.2, 1.0, t.sky) * 0.85);
    far = mix(far, cbdFar, 1.0 - sstep(cbdR * 0.8, cbdR * 1.4, uC));
    far = mix(far, mix(vec3(0.60, 0.60, 0.58), vec3(0.45, 0.41, 0.37), sstep(0.3, 0.7, t.heavy / max(indAmt, 0.1))), sstep(indThr - 0.02, indThr + 0.02, indF) * step(0.01, indAmt));
    float parkF = fbm(rel / (0.04 * Ru) + 2.0, seed + 48, 2);
    far = mix(far, mix(vec3(0.29, 0.39, 0.21), vec3(0.45, 0.47, 0.30), t.arid), sstep(0.72, 0.76, parkF) * (1.0 - t.arid * 0.6));
    float tone = fbm(rel / (0.06 * Ru), seed + 16, 3);
    far *= 0.92 + 0.16 * tone;
    float gr = 0.0, gamp = 0.14, gsc = bsz.x * M * 4.0;
    for (int o = 0; o < 4 * uOne; o++) { gr += gamp * (vnoise(rel / gsc, seed + 49 + o) - 0.5) * sstep(0.7, 2.0, gsc / pxm); gamp *= 0.8; gsc *= 0.5; }
    far *= 1.0 + gr;
    // the grain a satellite sees when blocks are smaller than a pixel: each patch of ground a little lighter or darker
    // (roofs, streets, shadows and trees mixed in different amounts), fixed to the ground so it does not crawl
    float gcell = max(bsz.x * M, pxm * 0.9);
    vec2 gi = floor(rel / gcell);
    float gn = hash2(int(gi.x) + 5000, int(gi.y) + 5000, seed + 66) - 0.5;
    float grainK = (1.0 - sstep(0.8, 2.0, blockPx)) * (0.18 + 0.12 * sstep(0.5, 0.9, dens));
    far *= 1.0 + grainK * gn;
    // and the dark lines of the busier streets, every few blocks
    vec2 sq4 = abs(fract((rot2(ang0) * rel) / (bsz * M * 4.0)) - 0.5);
    float sl = (1.0 - sstep(0.0, pxm / (bsz.x * M * 4.0) * 0.8, 0.5 - max(sq4.x, sq4.y))) * (1.0 - sstep(1.0, 3.0, blockPx)) * sstep(0.35, 0.6, dens);
    far = mix(far, ASPHALT * 1.2, sl * 0.35 * (t.style == 0 ? 1.0 : 0.5));
    vec3 col = far;
    float a = cover;
    // ---- blocks ----
    if (blockPx > 1.0) {
      vec2 qc = (bc + 0.5) * bsz * M;
      vec2 relC = transpose(rot) * qc;
      if (oldTown || t.style == 2 || curvy > 0.0) relC = rel;
      float r1c, r2c, wAc, wSc; int wc;
      float artC = radialRoads(relC, length(relC), R, hh, r1c, r2c, wAc, wSc, wc);
      float densC = townDens(relC, t, artC, max(pxm, bsz.x * M * 0.6)) + 0.12 * (bh2 - 0.5) - 0.55 * sstep(0.5, 1.3, slope) * (0.5 + 0.5 * t.hill);
      bool built = densC > 0.32;
      float parkC = fbm(relC / (0.04 * Ru) + 2.0, seed + 48, 2);
      float indC = fbm(relC / (0.07 * R) + 4.0, seed + 44, 3) + coastBias - 0.25 * (1.0 - sstep(0.12 * R, 0.25 * R, length(relC)));
      vec2 wvC = vec2(fbm(relC / Ru * 1.4 + 3.1, seed + 20, 3), fbm(relC / Ru * 1.4 + 7.7, seed + 21, 3)) - 0.5;
      float uCC = length(aniso(relC + wvC * Ru * 0.5 * sstep(0.0, 0.4 * Ru, length(relC)), t)) / Ru + cbdR * 0.9 * (fbm(relC / (cbdR * Ru * 0.7) + 5.0, seed + 54, 2) - 0.5);
      float campF = fbm(relC / (0.025 * R) + 9.0, seed + 70, 2);
      // what each block is: 0 offices, 1 flats, 2 industry, 3 park, 4 houses, 5 empty lot, 6 campus, 7 harbour yard, 8 hotels
      int kind = indAmt > 0.0 && indC > indThr ? 2 : parkC > 0.74 + 0.1 * t.arid ? 3 : uCC < cbdR ? 0 : densC > 0.6 ? 1 : 4;
      if (kind == 4 && artC < 140.0 * M && densC > 0.4) kind = 1;                // the main roads are lined with bigger buildings
      if ((kind == 4 || kind == 1) && t.campus > 0.0 && campF > 0.78 - 0.015 * min(t.campus, 8.0)) kind = 6;
      if (kind == 4 && hash2(int(bc.x), int(bc.y), seed + 71) < 0.28 * t.arid + 0.04) kind = 5;   // desert towns grow round empty plots
      // the harbour yard: along the shore beside the piers
      vec2 seaV = length(t.seaDir) > 0.5 ? normalize(t.seaDir) : vec2(1.0, 0.0);
      float alongC = abs(dot(relC, vec2(-seaV.y, seaV.x))) / M;
      float spanM = min(Ru * 0.45, 0.06 + 0.02 * t.pop) / M;
      if (t.port && shoreT < 260.0 + 60.0 * min(t.heavy + t.chem, 6.0) && alongC < spanM && kind != 3) kind = 7;
      if (t.resort > 0.0 && shoreT < 250.0 && kind != 7 && kind != 2) kind = 8;
      if (oldTown) kind = 0;
      vec3 bcol = (kind == 0 ? mix(vec3(0.55, 0.55, 0.54), roofAvg(t), 0.4) : kind == 1 ? flatsFar : kind == 2 ? vec3(0.58, 0.58, 0.56) : kind == 3 ? mix(vec3(0.29, 0.39, 0.21), vec3(0.42, 0.45, 0.30), t.arid)
                : kind == 5 ? sandCol(t, q) : kind == 6 ? vec3(0.38, 0.46, 0.30) : kind == 7 ? vec3(0.55, 0.52, 0.48) : kind == 8 ? vec3(0.80, 0.78, 0.74) : housesFar) * (0.9 + 0.2 * bh);
      float edge = min(min(bf.x, bsz.x - bf.x), min(bf.y, bsz.y - bf.y));
      float pxmM = pxm / M;   // metres a pixel
      // streets show as fine lines even before they are a pixel wide
      float street = (1.0 - sstep(streetW * 0.5 - pxmM * 0.5, streetW * 0.5 + pxmM * 0.5, edge)) * min(1.0, max(streetW / pxmM, 0.4));
      vec3 stc = mix(STREET, vec3(0.50, 0.47, 0.42), t.arid * 0.7);
      if (oldTown) stc = mix(vec3(0.50, 0.48, 0.45), vec3(0.70, 0.64, 0.55), t.arid);
      vec3 detail = bcol;
      vec2 inner = bf - streetW * 0.5, isz = bsz - streetW;
      float lotPx = 0.0;
      if (built && kind == 3) {
        // a park: grass, paths, clumps of trees (fewer in dry lands, where parks are watered lawns and palms)
        vec3 pc = mix(vec3(0.30, 0.42, 0.22), vec3(0.42, 0.48, 0.28), t.arid) * (0.95 + 0.1 * vnoise(q / 7.0, seed + 6));
        float tr = gnoise(q / 22.0, seed + 7) + 0.5 * gnoise(q / 9.0, seed + 8);
        pc = mix(pc, TREE, sstep(0.12 + 0.2 * t.arid, 0.22 + 0.2 * t.arid, tr));
        float path = abs(gnoise(q / 90.0, seed + 9));
        pc = mix(pc, vec3(0.70, 0.67, 0.58), (1.0 - sstep(0.012, 0.02, path)) * sstep(1.0, 3.0, 4.0 * M / pxm));
        detail = mix(bcol, pc, sstep(1.0, 3.0, 20.0 * M / pxm));
      } else if (built && kind == 5) {
        // an empty plot of sand, crossed by tracks, sometimes walled for building
        vec3 sc = sandCol(t, q);
        sc = mix(sc, sc * 0.85, (1.0 - sstep(1.0, 2.5, abs(gnoise(q / 60.0, seed + 72)) * 60.0)) * 0.6);
        detail = sc;
      } else if (built && kind == 6) {
        // a campus: big buildings scattered over lawns, a running track
        vec3 cc = vec3(0.36, 0.46, 0.28) * (0.95 + 0.1 * vnoise(q / 9.0, seed + 73));
        float b = building(mod(inner, vec2(isz.x * 0.5, isz.y * 0.5)), isz * 0.5, 0.18 + 0.1 * bh, 15.0);
        if (b > 0.5) cc = mix(vec3(0.66, 0.64, 0.60), vec3(0.55, 0.40, 0.33), step(0.5, bh2)); else if (b < -0.5) cc *= 0.6;
        float tr = length((inner - isz * 0.5) / vec2(isz.x * 0.42, isz.y * 0.3));
        if (bh < 0.3 && tr < 1.0) cc = tr > 0.8 ? vec3(0.60, 0.33, 0.27) : vec3(0.28, 0.48, 0.24);
        detail = mix(bcol, cc, sstep(1.0, 3.0, 25.0 * M / pxm));
      } else if (built && kind == 2) {
        // industry, by what is made here: steel works, chemical works or light industry
        float zh = hash2(int(floor(relC.x / (0.05 * R))), int(floor(relC.y / (0.05 * R))), seed + 74) * max(indAmt, 0.01);
        int itype = zh < t.heavy + 0.5 * t.power ? 0 : zh < t.heavy + 0.5 * t.power + t.chem ? 1 : 2;
        vec3 ic = mix(vec3(0.46, 0.46, 0.44), vec3(0.62, 0.57, 0.48), t.arid) * (0.95 + 0.1 * vnoise(q / 13.0, seed + 75));
        if (itype == 0) {
          // long sheds with ridged roofs (rusty or grey), heaps of coal and ore, rail sidings
          float b = building(inner, isz, 0.1, 25.0);
          if (b > 0.5) { ic = mix(vec3(0.46, 0.37, 0.31), vec3(0.50, 0.52, 0.54), step(0.5, bh2)); ic *= 0.92 + 0.08 * step(0.5, fract(inner.y / 8.0)); }
          else if (b < -0.5) ic *= 0.55;
          if (bh < 0.35 && b < 0.5) ic = mix(ic, vec3(0.13, 0.12, 0.12), sstep(0.0, 0.2, gnoise(q / 40.0, seed + 76) + 0.1));
          if (b < 0.5 && abs(fract(inner.y / 9.0) - 0.5) < 0.12 && inner.y < isz.y * 0.25) ic = RAIL;
        } else if (itype == 1) {
          // a tank farm: round tanks on a gravel yard, joined by pipes
          vec2 tc = mod(inner, vec2(46.0)) - 23.0;
          float tk = roundThing(tc, 14.0 + 6.0 * bh, 14.0);
          if (tk > 0.5) ic = vec3(0.86, 0.86, 0.84) * (0.85 + 0.15 * sstep(-14.0, 14.0, -dot(tc, gSunQ))); else if (tk < -0.5) ic *= 0.55;
          if (abs(tc.y) < 1.5 && tk == 0.0) ic = vec3(0.70, 0.70, 0.68);
        } else {
          // light industry: big white boxes and car parks
          float b = building(inner, isz, 0.12 + 0.12 * bh, 12.0);
          if (b > 0.5) ic = mix(vec3(0.85, 0.85, 0.83), vec3(0.62, 0.66, 0.70), step(0.75, bh2)); else if (b < -0.5) ic *= 0.6;
          else if (fract(inner.x / 5.5) < 0.5 && fract(inner.y / 12.0) < 0.75) ic = mix(ic, hash2(int(inner.x / 5.5), int(inner.y / 12.0), seed + 77) < 0.5 ? vec3(0.8) : vec3(0.3, 0.32, 0.4), 0.5 * step(0.4, hash2(int(inner.x / 5.5) + 9, int(inner.y / 12.0), seed + 78)));
        }
        detail = mix(bcol, ic, sstep(0.8, 2.0, 50.0 * M / pxm));
      } else if (built && kind == 7) {
        // the harbour yard: stacks of containers in many colours, gantry cranes along the quay
        vec2 cq = inner;
        vec2 cell = floor(cq / vec2(14.0, 3.2));
        float ch = hash2(int(cell.x), int(cell.y), seed + 79);
        vec3 cont = ch < 0.25 ? vec3(0.62, 0.22, 0.18) : ch < 0.45 ? vec3(0.20, 0.33, 0.55) : ch < 0.6 ? vec3(0.75, 0.70, 0.62) : ch < 0.72 ? vec3(0.25, 0.45, 0.30) : ch < 0.85 ? vec3(0.70, 0.55, 0.20) : vec3(0.45, 0.45, 0.45);
        vec3 yc = fract(cq.x / 70.0) < 0.75 && ch > 0.12 ? mix(cont, vec3(0.55, 0.54, 0.52), 0.25) : vec3(0.55, 0.54, 0.52);
        if (abs(fract(cq.y / 160.0) - 0.5) < 0.025) yc = vec3(0.30, 0.30, 0.30);   // the rails the cranes run on
        detail = mix(bcol, yc, sstep(0.8, 2.0, 25.0 * M / pxm));
      } else if (built) {
        // lots inside the block, one building on each
        float uB = length(relC) / Ru;
        vec2 nl = kind == 0 ? vec2(1.0 + floor(bh2 * 3.0), 1.0 + floor(fract(bh2 * 7.0) * 2.0)) : kind == 1 ? vec2(1.0 + floor(bh2 * 2.0), 2.0 + floor(fract(bh2 * 5.0) * 2.0)) : kind == 8 ? vec2(2.0, 1.0)
                : t.arid > 0.5 ? vec2(4.0 + floor(bh2 * 3.0), 2.0) : vec2(6.0 + floor(bh2 * 3.0), 2.0);
        vec2 lot = isz / nl;
        vec2 li = floor(inner / lot), lf = inner - li * lot;
        float lh = hash2(int(bc.x * 8.0 + li.x), int(bc.y * 8.0 + li.y), seed + 10);
        // towers rise with the size of the city, its offices, and the age of steel and glass
        float towers = t.sky;
        float height = kind == 0 ? 15.0 + 230.0 * towers * lh * lh * (1.0 - sstep(0.0, cbdR * 1.6, uB)) : kind == 1 ? 12.0 + 15.0 * lh : kind == 8 ? 30.0 + 40.0 * lh : t.arid > 0.5 ? 7.0 : 6.0;
        if (oldTown) height = 12.0 + 6.0 * lh;
        float margin = kind == 0 ? 0.04 + 0.12 * fract(lh * 13.0) : kind == 1 ? 0.1 : kind == 8 ? 0.15 : t.arid > 0.5 ? 0.1 + 0.06 * fract(lh * 13.0) : 0.11 + 0.08 * fract(lh * 13.0);
        float sparse = kind == 4 ? sstep(0.28, 0.4, densC) : 1.0;
        float b;
        bool perim = (t.style == 1 && (kind == 1 || (kind == 0 && towers < 0.5))) || (oldTown && t.style != 0);
        if (perim) b = perimeter(inner, isz, oldTown ? 9.0 + 0.3 * min(isz.x, isz.y) * (0.5 + bh) : 18.0, oldTown ? 14.0 : 22.0);   // buildings round a courtyard
        else {
          vec2 lf2 = lf;
          if (kind == 1) lf2.y = lf.y < lot.y * 0.28 || lf.y > lot.y * 0.72 ? -1.0 : (lf.y - lot.y * 0.28) / 0.44;   // flats as slabs
          b = lh < 0.94 * sparse + 0.03 ? building(lf2, lot, margin, height) : 0.0;
          if (kind == 4) {
            // a detached house near the street, with a garden behind; widths and setbacks differ from plot to plot
            float wx = 0.55 + 0.25 * fract(lh * 7.3), dy = 0.32 + 0.16 * fract(lh * 3.7), off = (1.0 - wx) * fract(lh * 11.1);
            bool front0 = mod(li.y, 2.0) < 0.5;
            float y0 = front0 ? 0.1 + 0.08 * fract(lh * 5.9) : 0.9 - 0.08 * fract(lh * 5.9) - dy;
            b = lh < 0.94 * sparse + 0.03 ? buildingAt(lf / lot, vec2(off, y0), vec2(off + wx, y0 + dy), height / max(lot.x, 1.0)) : 0.0;
          }
        }
        bool open_ = kind == 0 && lh > 0.92 && !perim;
        if (open_) b = 0.0;
        // downtown towers cast their shadows across streets and neighbouring lots
#ifdef CITY_LITE
        if (false) {
#else
        if (kind == 0 && !perim && !oldTown && b < 0.5 && towers > 0.3 && sstep(1.0, 2.0, 15.0 * M / pxm) > 0.0) {
#endif
          float fall = 1.0 - sstep(0.0, cbdR * 1.6, uB);
          for (int s3 = 1; s3 <= 7 * uOne; s3++) {
            float dd = float(s3) * 20.0;
            float hq = cbdHeight(q + gSunQ * dd, bsz, streetW, seed, towers, fall);
            if (hq * 0.8 > dd) { b = -1.0; break; }
          }
        }
        vec3 roof = roofCol(t, lh);
        if (kind == 0 && !oldTown) roof = mix(roof, lh < 0.35 ? vec3(0.22, 0.27, 0.32) : lh < 0.6 ? vec3(0.66, 0.66, 0.65) : lh < 0.8 ? vec3(0.36, 0.38, 0.41) : vec3(0.50, 0.52, 0.54), min(towers * 1.3, 1.0));   // glass and concrete
        // big towers' roofs carry plant rooms
        if (kind == 0 && towers > 0.4 && b > 0.5 && fract(lh * 41.0) < 0.5) { vec2 rc = lf / lot - 0.5; if (max(abs(rc.x), abs(rc.y)) < 0.12) roof *= 1.25; }
        if (kind == 8) roof = vec3(0.88, 0.87, 0.84);
        float half_ = (kind == 4 ? lf.y / lot.y : lf.x / lot.x) > 0.5 ? 0.92 : 1.05;
        if (t.arid > 0.5) half_ = 1.0;                                // flat roofs in dry lands
        float yh = hash2(int(bc.x * 8.0 + li.x), int(bc.y * 8.0 + li.y), seed + 11);
        vec3 yard = kind == 4 ? mix(yardCol(t) * (0.88 + 0.22 * yh), vec3(0.52, 0.52, 0.48), step(0.8, yh) * 0.6) : kind == 1 ? mix(vec3(0.36, 0.45, 0.27), vec3(0.62, 0.57, 0.48), t.arid) : vec3(0.46, 0.46, 0.44);
        if (perim) yard = oldTown ? mix(vec3(0.55, 0.52, 0.46), vec3(0.34, 0.42, 0.26), step(0.6, bh2)) : mix(vec3(0.40, 0.42, 0.36), vec3(0.62, 0.58, 0.50), t.arid);
        if (kind == 8 && fract(lh * 23.0) < 0.6) yard = mix(yard, vec3(0.30, 0.70, 0.78), step(lf.x, lot.x * 0.3) * step(lot.y * 0.6, lf.y));   // hotel pools
        if (kind == 4 || kind == 1 || perim) { float tg = gnoise(q / 9.0, seed + 12) + 0.35 * gnoise(q / 3.5, seed + 13); yard = mix(yard, mix(TREE * 0.9, vec3(0.22, 0.33, 0.17), vnoise(q / 1.5, seed + 14)), sstep(0.3 - 0.4 * leafy, 0.42 - 0.4 * leafy, tg) * trees * (kind == 4 ? 0.95 : 0.8)); }
        // terraced houses: long rows of narrow houses facing the street, back yards and an alley behind
        bool rowH = kind == 4 && t.rows > 0.5 && densC > 0.4 && !oldTown;
        if (rowH) {
          float lotW = 6.0 + 1.5 * bh;
          float li2 = floor(inner.x / lotW), lx = inner.x - li2 * lotW;
          bool front = inner.y < isz.y * 0.5;
          float yy = front ? inner.y : isz.y - inner.y;               // metres from the street
          float depth = isz.y * (0.26 + 0.08 * bh2);
          float rh = hash2(int(bc.x * 64.0 + li2), int(bc.y * 2.0) + (front ? 0 : 1), seed + 15);
          float sideS = front ? -gSunQ.y : gSunQ.y;                     // the sun's pull towards the back yard
          if (yy < depth) { b = 1.0; roof = roofCol(t, rh) * (lx < 0.6 ? 0.7 : 1.0); half_ = 1.0; }
          else if (yy < depth + max(0.0, sideS) * 9.0) b = -1.0;
          else b = 0.0;
          yard = mix(vec3(0.44, 0.43, 0.38), vec3(0.34, 0.41, 0.25), step(0.45, rh));
          if (abs(inner.y - isz.y * 0.5) < 2.2) { yard = vec3(0.48, 0.47, 0.44); if (b < 0.0) b = 0.0; }   // the alley
          lot = vec2(lotW, isz.y * 0.5);
        }
        vec3 dc = b > 0.5 ? roof * half_ : b < -0.5 ? yard * (kind == 0 ? 0.42 : 0.55) : yard;
        lotPx = min(lot.x, lot.y) * M / pxm;
        float cov = perim ? 0.55 : (lh < 0.94 * sparse + 0.03 && !open_) ? (1.0 - 2.0 * margin) * (1.0 - 2.0 * margin) * (kind == 1 ? 0.44 : 1.0) : 0.0;
        vec3 yAvg = kind == 4 ? mix(yardCol(t), TREE * 1.3, (0.2 + 0.6 * leafy) * trees) : yard;
        vec3 lotAvg = mix(yAvg, roof, cov) * (0.92 + 0.16 * fract(lh * 17.0));
        detail = mix(mix(bcol, lotAvg, sstep(0.5, 1.4, lotPx)), dc, sstep(1.6, 3.2, lotPx));
      }
      vec3 stcS = stc;
#ifdef CITY_LITE
      if (false) {
#else
      if (kind == 0 && !oldTown && street > 0.0 && sstep(1.0, 2.0, 15.0 * M / pxm) > 0.0) {
#endif
        float towersS = t.sky;
        float fall = 1.0 - sstep(0.0, cbdR * 1.6, length(relC) / Ru);
        for (int s3 = 1; s3 <= 7 * uOne; s3++) {
          float dd = float(s3) * 20.0;
          if (cbdHeight(q + gSunQ * dd, bsz, streetW, seed, towersS, fall) * 0.8 > dd) { stcS *= 0.45; break; }
        }
      }
      // a canal town: in its old quarter many streets are canals, and a great canal winds through it
      if (oldTown && t.canal > 0.5) {
        float cn = hash2(int(bc.y) + 900, 3, seed + 81);
        bool canalStreet = min(bf.y, bsz.y - bf.y) < streetW * 0.5 && cn < 0.6;
        if (canalStreet) stcS = vec3(0.24, 0.35, 0.34);
        float gc = abs(q.y - 260.0 * sin(q.x / 620.0 + hh * 7.0) - 120.0 * sin(q.x / 230.0));
        float wGC = 1.0 - sstep(32.0, 32.0 + pxm / M, gc);
        detail = mix(detail, vec3(0.22, 0.33, 0.33), wGC); street *= 1.0 - wGC;
      }
      // houses and roofs smaller than a pixel still make a grain: each pixel-sized patch its own mix of roof and garden
      if (built && kind != 3 && kind != 2) {
        float gc2 = max(18.0 * M, pxm * 0.95);
        vec2 g2 = floor(rel / gc2);
        float gk = 1.0 - sstep(1.2, 3.0, 18.0 * M / pxm);
        detail *= 1.0 + gk * 0.26 * (hash2(int(g2.x) + 9000, int(g2.y) + 9000, seed + 67) - 0.5);
        detail = mix(detail, TREE * 1.2, gk * trees * leafy * 0.5 * step(0.72, hash2(int(g2.x) + 9100, int(g2.y) + 9100, seed + 68)));
      }
      vec3 bl = mix(detail, stcS, street);
      float k = sstep(1.0, 3.0, blockPx);
      col = mix(col, bl, k * (built ? 1.0 : 0.0));
      col *= 1.0 - 0.1 * (bh - 0.5) * (1.0 - sstep(3.0, 8.0, blockPx)) * k;   // blocks differ in tone
      a = mix(a, built ? 1.0 : 0.0, k);
    }
    // trees over gardens and streets in wet lands
    if (!industry && trees > 0.05) {
      vec2 qt = rel / M;
      float can = 0.55 * gnoise(qt / 38.0, seed + 60) + 0.35 * gnoise(qt / 11.0, seed + 61) + 0.1 * gnoise(qt / 4.0, seed + 62);
      float thr = 0.3 - 0.22 * leafy - 0.06 * (1.0 - sstep(0.3, 0.6, dens)) + 0.25 * (1.0 - sstep(cbdR * 0.6, cbdR * 1.6, uC)) + 0.4 * (1.0 - trees);
      float crownPx = 10.0 * M / pxm;
      float tree = sstep(thr - 0.03, thr + 0.03, can);
      float treeAvg = sstep(thr - 0.35, thr + 0.35, 0.0) * 0.5;
      float tv = mix(treeAvg, tree, sstep(0.6, 2.0, crownPx));
      vec3 tc = mix(vec3(0.13, 0.22, 0.11), vec3(0.24, 0.34, 0.17), vnoise(qt / 4.0, seed + 63)) * (1.0 + 0.15 * sstep(0.3, 0.5, gnoise(qt / 3.0 + 9.0, seed + 64)));
      col = mix(col, tc, tv * cover * 0.9);
    }
    // ---- the great park ----
#ifdef CITY_LITE
    if (false) {
#else
    if (t.park > 0.5) {
#endif
      vec4 gp = greatPark(t, rel, pxm, hh * 1.5707963);
      col = mix(col, gp.rgb, gp.a); a = max(a, gp.a * sstep(0.1, 0.3, dens));
      // streets stop at the park's edge; only the town's main radial roads cross it
      onAve *= 1.0 - gp.a; onRing *= 1.0 - gp.a;
      if (t.style == 0) onArt *= 1.0 - gp.a;
    }
    // ---- the riverside (the first pass tells where the river's bank is) ----
    { vec4 rs = riversideColor(t, rel, pxm, cover); col = mix(col, rs.rgb, rs.a); a = max(a, rs.a); }
    // ---- roads over everything: avenues, main roads (tree-lined boulevards in a boulevard town), rings, motorways, railway ----
    col = mix(col, ASPHALT * 1.15, onAve * 0.85);
    float roads = max(onArt, onRing);
    vec3 roadC = ASPHALT;
    if (t.style == 1 && max(art, ring1) < 1e8) {
      // boulevards: a row of trees down each side
      float side = min(abs(art - artW * 0.5), abs(ring1 - ringW * 0.5));
      float rowT = (1.0 - sstep(3.5 * M, 3.5 * M + pxm, side)) * step(0.5, fract((dot(rel, vec2(0.7, 0.7))) / (12.0 * M))) * sstep(1.0, 3.0, 8.0 * M / pxm);
      col = mix(col, TREE, rowT * cover);
    }
    // star squares where a boulevard town's main roads meet its rings, and at the centre
    if (t.style == 1) {
      float sq = min(d, 1e9);
      float star = abs(sq - 110.0 * M);
      roads = max(roads, (1.0 - sstep(14.0 * M, 14.0 * M + pxm, star)) * cover);
      if (sq < 96.0 * M) col = mix(col, vec3(0.32, 0.43, 0.24), cover);
    }
    a = max(a, roads);
    col = mix(col, roadC, roads * 0.92 / max(a, 0.001));
    if (onHw > 0.0) {
      // a motorway: two concrete carriageways with a median; slip roads looping round each junction
      float lane = abs(hwD) < 4.0 * M ? 0.0 : 1.0;
      col = mix(col, mix(vec3(0.38, 0.40, 0.33), CONCRETE, lane), onHw);
      a = max(a, onHw);
    }
    if (hwOn && abs(da - hwR) < 400.0 * M) {
      for (int k = 0; k < 9 * uOne; k++) {
        int N = 5 + int(hh * 4.0);
        if (k >= N) break;
        float ang = artAng(k, N, hh * 43.98, hwR, R);
        vec2 jc = vec2(cos(ang), sin(ang)) * hwR;
        for (int s2 = 0; s2 < 4 * uOne; s2++) {
          vec2 lc = jc + rot2(ang + 0.785 + 1.5708 * float(s2)) * vec2(170.0 * M, 0.0);
          float lp = abs(length(rel - lc) - 105.0 * M);
          float on = (1.0 - sstep(7.0 * M, 7.0 * M + pxm, lp)) * min(1.0, 14.0 * M / pxm);
          col = mix(col, CONCRETE, on); a = max(a, on);
        }
      }
    }
    if (railOn > 0.0) {
      float rail = abs(fract(across / (3.0 * M)) - 0.5) < 0.2 ? 1.0 : 0.0;
      col = mix(col, mix(vec3(0.48, 0.44, 0.40), RAIL * 0.7, rail * sstep(1.0, 3.0, 3.0 * M / pxm)), railOn);
      a = max(a, railOn);
    }
    // the big sites lie over the town
    col = mix(col, site.rgb, site.a);
    a = max(a, site.a);
    if (a > outc.a) { outc = vec4(col, a); gCityFlat = a; }
    gTownRoad = max(gTownRoad, max(onArt, onHw) * max(cover, step(0.5, onArt)));
  }
  return outc;
}
// mines and oil fields: open pits with terraces, pads with tracks
vec4 pitColor(vec2 p, float pxm) {
  for (int i = 0; i < 64; i++) {
    if (i >= uNPits) break;
    vec4 P = texelFetch(uPits, ivec2(i, 0), 0);
    float r = P.z;
    float dd = length(p - P.xy);
    if (dd > r * 1.3) continue;
    dd += r * 0.35 * (vnoise(p * 5.0 / max(r, 0.05) , uSeed + 760 + i) - 0.5);
    float a = 1.0 - sstep(r * 0.8, r * 1.2, dd);
    vec3 pc;
    if (P.w > 1.5) pc = mix(STEPPE, vec3(0.75, 0.73, 0.68), 0.5 + 0.2 * sin(dd / r * 40.0));
    else {
      float ring = abs(sin(dd / r * 9.0));
      pc = mix(P.w > 0.5 ? ROCKDARK : HILLSOIL, ROCKLIGHT, 0.25 + 0.45 * ring * sstep(0.2, 0.6, dd / r));
      if (dd < r * 0.3) pc = mix(pc, P.w > 0.5 ? vec3(0.12, 0.11, 0.10) : ROCKDARK, 0.6);
    }
    return vec4(pc, a * 0.92);
  }
  return vec4(0.0);
}

// ---------- rivers ----------
// Each river is a line of points (5 texels each: position, distance along, meander phase; frame normal, width,
// loop size; loop lean, phase rate, braiding, mud; hemmed-in, dryness, valley depth, river id; oxbows, mouth, size).
// A pixel finds the nearest stretch, measures itself in the river's frame (along, across), and from there finds the
// channel: a loop curve that grows, leans and turns back on itself in the plains, braids over gravel below mountains.
uniform highp sampler2D uRV;
uniform highp sampler2D uRCell;
uniform highp sampler2D uRList;
uniform int uRivOn;
vec4 rvT(int v, int k) { int i = v * 5 + k; return texelFetch(uRV, ivec2(i & 1023, i >> 10), 0); }
float cr2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
// position on segment v (0..1) whose interpolated normal passes through P, and the signed distance along that normal
bool rnProj(vec2 P, int v, out float t, out float n, out vec2 nn) {
  vec4 a0 = rvT(v, 0), b0 = rvT(v + 1, 0), a1 = rvT(v, 1), b1 = rvT(v + 1, 1);
  vec2 d = b0.xy - a0.xy, na = a1.xy, dn = b1.xy - a1.xy, q = P - a0.xy;
  float c0 = cr2(q, na), c1 = cr2(q, dn) - cr2(d, na), c2 = -cr2(d, dn);
  if (abs(c2) < 1e-7) { if (abs(c1) < 1e-12) return false; t = -c0 / c1; }
  else {
    float disc = c1 * c1 - 4.0 * c2 * c0;
    if (disc < 0.0) return false;
    float qq = -0.5 * (c1 + (c1 < 0.0 ? -1.0 : 1.0) * sqrt(disc));
    float r1 = qq / c2, r2 = abs(qq) > 1e-12 ? c0 / qq : 1e9;
    t = abs(r1 - 0.5) < abs(r2 - 0.5) ? r1 : r2;
  }
  if (t < -0.35 || t > 1.35) return false;
  // never past the true ends of a river
  float ends = rvT(v, 4).w;
  if ((t < 0.0 && mod(ends, 2.0) > 0.5) || (t > 1.0 && ends > 1.5)) return false;
  nn = normalize(na + t * dn);
  n = dot(q - t * d, nn);
  return true;
}
// the channel at valley distance u: (along, across, phase)
float gKq = 0.0;
float gD2 = 1e9;   // distance to the nearest other arm of the channel   // how fast the loops' rhythm changes along the current stretch (half the rate)
vec3 rnChan(float u, float phiV, float sV, float k, float A, float beta, float rid, int sd, float phShift) {
  float du_ = u - sV;
  float phl = phiV + k * du_ + gKq * du_ * du_ + phShift;
  // no two loops alike: the rhythm drifts, loops grow and shrink, lean more or less, and the whole belt wanders
  float ph = phl + 6.0 * (vnoise(vec2(phl * 0.06, rid * 7.31), sd) - 0.5) + 2.2 * (vnoise(vec2(phl * 0.21, rid * 7.31 + 9.7), sd + 3) - 0.5);
  float am = vnoise(vec2(phl * 0.16, rid * 7.31 + 3.3), sd + 1); am = 0.2 + 1.6 * am * am;
  float bm = 0.3 + 1.4 * vnoise(vec2(phl * 0.1, rid * 7.31 + 6.1), sd + 2);
  float wander = 1.8 * (vnoise(vec2(phl * 0.045, rid * 7.31 + 1.7), sd + 4) - 0.5);
  return vec3(u - min(beta * bm, 0.95) / k * sin(2.0 * ph), A * (am * sin(ph) + wander), ph);
}
// nearest point of a channel to (s, n): distance, and the valley distance and phase there
vec3 rnNearest(vec2 P, float phiV, float sV, float k, float A, float beta, float rid, int sd, float phShift) {
  float lam = 6.2831853 / k;
  float u0 = P.x - 0.8 * lam, du = 1.6 * lam / 28.0;
  vec3 prev = rnChan(u0, phiV, sV, k, A, beta, rid, sd, phShift);
  float best = 1e9, bu = P.x, bph = 0.0;
  float dl[28];
  for (int i = 1; i <= 28; i++) {
    vec3 cur = rnChan(u0 + du * float(i), phiV, sV, k, A, beta, rid, sd, phShift);
    vec2 ba = cur.xy - prev.xy, pa = P - prev.xy;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-14), 0.0, 1.0);
    float dd = length(pa - ba * h);
    dl[i - 1] = dd;
    if (dd < best) { best = dd; bu = u0 + du * (float(i) - 1.0 + h); bph = mix(prev.z, cur.z, h); }
    prev = cur;
  }
  // the nearest other arm of the channel (beyond the bend this point belongs to): where a loop nearly meets itself
  gD2 = 1e9;
  for (int i = 0; i < 28; i++) {
    float um = u0 + du * (float(i) + 0.5);
    if (abs(um - bu) > 0.3 * lam) gD2 = min(gD2, dl[i]);
  }
  // then home in on it, so the banks are smooth curves however close you look
  float hstep = du * 0.5;
  vec3 c0 = rnChan(bu, phiV, sV, k, A, beta, rid, sd, phShift);
  float b0 = length(P - c0.xy);
  for (int it = 0; it < 6; it++) {
    vec3 cm = rnChan(bu - hstep, phiV, sV, k, A, beta, rid, sd, phShift), cp = rnChan(bu + hstep, phiV, sV, k, A, beta, rid, sd, phShift);
    float dm = length(P - cm.xy), dp = length(P - cp.xy);
    if (dm < b0 && dm <= dp) { bu -= hstep; b0 = dm; c0 = cm; } else if (dp < b0) { bu += hstep; b0 = dp; c0 = cp; }
    hstep *= 0.5;
  }
  return vec3(b0, bu, c0.z);
}
vec4 gRiv = vec4(0.0);     // what the rivers paint over the land: water, sand, gravel (colour, cover)
float gRivWater = 0.0;     // open water only
float gFP = 0.0, gFPDry = 0.0;   // floodplain: how much, and how much of it is a green strip through dry land
float gVal = 0.0; vec2 gValGrad = vec2(0.0);   // valleys cut by the rivers (height, slope)
float gValFlat = 0.0;                           // how much the rough ground is smoothed out on the valley floor
const vec3 RCLEAR = vec3(0.065, 0.11, 0.14), RCLEARSH = vec3(0.15, 0.24, 0.24), RMUD = vec3(0.56, 0.49, 0.37), RMUDSH = vec3(0.64, 0.58, 0.46);
const vec3 BAR = vec3(0.76, 0.72, 0.62), BARWET = vec3(0.58, 0.55, 0.47), GRAVEL = vec3(0.68, 0.66, 0.60);
vec3 riverWater(float turb, float conf, float est, float depth) {
  vec3 clear = mix(RCLEARSH, RCLEAR, depth), mud = mix(RMUDSH, RMUD, depth);
  vec3 c = mix(clear, mud, turb);
  c = mix(c, mix(vec3(0.24, 0.36, 0.36), vec3(0.14, 0.25, 0.27), depth), conf * 0.6);   // mountain water: green, milky
  return mix(c, SHOAL, est * 0.45);
}
void rnPaint(vec3 col, float a) { gRiv.rgb = mix(gRiv.rgb, col, a); gRiv.a = max(gRiv.a, a); }
void riverOne(vec2 p, float pxm, int v, float t, float n, vec2 nn) {
  vec4 a0 = rvT(v, 0), b0 = rvT(v + 1, 0), a1 = rvT(v, 1), b1 = rvT(v + 1, 1), a2 = rvT(v, 2), b2 = rvT(v + 1, 2);
  vec4 a3 = rvT(v, 3), b3 = rvT(v + 1, 3), a4 = rvT(v, 4), b4 = rvT(v + 1, 4);
  float s = mix(a0.z, b0.z, t);
  float w = mix(a1.z, b1.z, t), A = mix(a1.w, b1.w, t), beta = mix(a2.x, b2.x, t), k = a2.y;
  gKq = 0.5 * (b2.y - a2.y) / max(b0.z - a0.z, 1e-6);
  float braid = mix(a2.z, b2.z, t), turb = mix(a2.w, b2.w, t), conf = mix(a3.x, b3.x, t), arid = mix(a3.y, b3.y, t), vD = mix(a3.z, b3.z, t), rid = a3.w;
  float oxb = mix(a4.x, b4.x, t), est = mix(a4.y, b4.y, t), size = mix(a4.z, b4.z, t);
  float an = abs(n);
  int sd = uSeed + 8800;
  // distance along the river in river-widths, counted so that it never bunches up where the river widens
  float al = (a0.w + k * (s - a0.z) + gKq * (s - a0.z) * (s - a0.z)) * 1.9;
  // a braided river's bed of gravel and sand, many times wider than its water
  float bedK = sstep(0.3, 0.8, braid);
  float bedH = w * (0.5 + 3.2 * bedK) * (0.75 + 0.5 * vnoise(vec2(al / 16.0, rid), uSeed + 8820));
  // the valley: a flat floor the river wanders over, and sides; deep in the mountains, a canyon in dry uplands
  float vfloor = A * 2.2 + 1.5 * w + bedH * bedK;
  float Vw = mix(0.07, 0.22, conf) * mix(1.0, 0.35, arid * (1.0 - conf));
  float vDep = vD * sstep(0.0, 0.5, s);
  float vt = clamp((an - vfloor) / Vw, 0.0, 1.0);
  float carve = -vDep * (1.0 - vt * vt * (3.0 - 2.0 * vt));
  if (carve < gVal) { gVal = carve; gValGrad = (vDep * 6.0 * vt * (1.0 - vt) / Vw) * sign(n) * nn; }
  gValFlat = max(gValFlat, (1.0 - sstep(vfloor * 0.8, vfloor + Vw * 0.3, an)) * mix(0.5, 0.8, conf) * sstep(0.0, 0.5, s));
  // seen from far, a river is drawn as a line of a pixel or so; close up, at its true width
  float wD = max(w, min(0.02 + 0.09 * size, (0.9 + 2.0 * size) * pxm));
  float Ae = A * (1.0 - sstep(1.2, 2.5, wD / w));
  float reach = max(Ae * 2.5 + wD, bedH * bedK) + 6.0 * w + 2.0 * pxm;
  // the floodplain: meadows and riverside woods; a green ribbon through dry country
  float fpW = Ae * 2.0 + 2.5 * w + bedH * bedK;
  float fp = 1.0 - sstep(fpW, fpW * 1.6 + 4.0 * w + pxm, an + fpW * 0.5 * (vnoise(vec2(al / 25.0, rid), uSeed + 8825) - 0.5));
  gFP = max(gFP, fp * (1.0 - conf * 0.7));
  gFPDry = max(gFPDry, fp * arid * (1.0 - conf * 0.5));
  if (an > reach) return;
  float lam = 6.2831853 / k;
  vec3 nr = Ae > 0.15 * w ? rnNearest(vec2(s, n), a0.w, a0.z, k, Ae, beta, rid, sd, 0.0) : vec3(an, s, al / 1.9);
  float dist = nr.x;
  // the shape of the bend here: which side is the inside, and how tight it is
  float kap = 0.0, side = 0.0;
  if (Ae > 0.15 * w) {
    float dl = 0.04 * lam;
    vec2 P0 = rnChan(nr.y, a0.w, a0.z, k, Ae, beta, rid, sd, 0.0).xy, Pm = rnChan(nr.y - dl, a0.w, a0.z, k, Ae, beta, rid, sd, 0.0).xy, Pp = rnChan(nr.y + dl, a0.w, a0.z, k, Ae, beta, rid, sd, 0.0).xy;
    vec2 T = Pp - Pm, K = Pp + Pm - 2.0 * P0;
    kap = 4.0 * cr2(T, K) / max(pow(length(T), 3.0), 1e-18);
    side = cr2(T, vec2(s, n) - P0);
  }
  float d2main = Ae > 0.15 * w ? gD2 : 1e9;
  // fade the bend's own features out before the line where another arm of the river is as near
  float own = sstep(0.0, 0.8 * w, (d2main - dist) * 0.5);
  bool inner = kap * side > 0.0;
  float innerAmt = sstep(0.08, 0.4, kap * w * sign(side));   // how strongly this is the inside of a bend (0 near the turn-over)
  float rad = 1.0 / max(abs(kap), 1e-6);
  float hw = wD * 0.5;
  float pxa = pxm * 0.5;
  float bankD = dist - hw;                         // distance from the bank (negative in the water)
  if (w > 35.0 * M && bedK < 0.5) gRivBank = min(gRivBank, bankD / M);
  float detail = sstep(0.8, 2.5, w / pxm);         // close enough to see sand bars and old channels
  // ----- the bed of a braided river: gravel and sand bars, threads of water, islands with trees -----
  if (bedK > 0.01) {
    float bedE = bedH * (1.0 + 0.3 * (vnoise(vec2(al / 9.0, rid), uSeed + 8821) - 0.5));
    float bedA = (1.0 - sstep(bedE - pxa, bedE + pxa, an)) * bedK;
    if (bedA > 0.0) {
      // bars: lens shapes drawn out along the flow (about 9 widths long, 2 across); water runs between them
      vec2 q = vec2(al / 13.0, n / (w * 2.0));
      q += 0.32 * vec2(gnoise(q * 1.3, uSeed + 8838), gnoise(q * 1.3 + 5.2, uSeed + 8839));   // round the bars' edges
      vec2 qi = floor(q);
      float f1 = 9.0, f2 = 9.0; vec2 c1 = vec2(0.0), c2 = vec2(0.0);
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 c = qi + vec2(x, y);
        vec2 pt = c + 0.1 + 0.8 * vec2(hash2(int(c.x), int(c.y) + 64, uSeed + 8840), hash2(int(c.x), int(c.y) + 64, uSeed + 8841));
        float dd = length(q - pt);
        if (dd < f1) { f2 = f1; c2 = c1; f1 = dd; c1 = c; } else if (dd < f2) { f2 = dd; c2 = c; }
      }
      float ed = (f2 - f1) * 0.5 * w * 2.0;                   // how far to the edge of this bar, across the flow
      float eh = hash2(int(c1.x + c2.x) + 300, int(c1.y + c2.y) + 300, uSeed + 8842);
      float live = sstep(0.22, 0.36, eh);                        // some channels carry water, others are dry hollows
      float chw = w * (0.08 + 0.5 * eh * eh) * (0.7 + 0.6 * vnoise(vec2(al / 3.0, n / w), uSeed + 8843));
      float thread = (1.0 - sstep(chw - pxa, chw + pxa, ed)) * live;
      float hollow = (1.0 - sstep(chw * 1.2, chw * 1.2 + w * 0.3 + pxa, ed)) * (1.0 - live);
      float wetNear = (1.0 - sstep(chw, chw + w * 0.8, ed)) * live;
      float age = hash2(int(c1.x), int(c1.y) + 64, uSeed + 8848);
      // older, higher bars are grown over with grass and trees
      float isle = sstep(0.0, w * 1.2, ed - chw) * sstep(0.7, 0.8, 1.0 - age);
      vec3 sandc = mix(BAR, GRAVEL, vnoise(vec2(al / 4.0, n / (w * 2.0)), uSeed + 8845)) * (0.95 + 0.1 * vnoise(vec2(al * 1.5, n / (w * 0.25)), uSeed + 8846));
      sandc = mix(sandc, BARWET, max(wetNear * 0.75, hollow * 0.6));
      vec3 bc = mix(sandc, mix(vec3(0.17, 0.27, 0.14), vec3(0.32, 0.41, 0.23), vnoise(vec2(al, n / (w * 0.5)), uSeed + 8847)), isle * detail);
      bc = mix(mix(BAR, vec3(0.62, 0.60, 0.52), 0.5), bc, detail);      // from far: a pale ribbon
      vec3 wc = mix(riverWater(turb, conf, est, 0.5 + 0.5 * sstep(0.0, chw, chw - ed)), vec3(0.36, 0.37, 0.34), 0.35);
      bc = mix(bc, wc, thread * mix(0.5, 1.0, detail));
      rnPaint(bc, bedA);
      gRivWater = max(gRivWater, bedA * thread);
    }
  }
  // ----- the main channel -----
  float water = 1.0 - sstep(-pxa, pxa, bankD);
  // inside each bend, a sand bar (point bar); the tighter the bend, the bigger
  if (detail > 0.0 && inner && bedK < 0.9 && beta > 0.15) {
    float barW = min(w * 1.3, (rad - hw) * 0.45) * innerAmt * (0.7 + 0.6 * vnoise(vec2(nr.z * 0.5, rid), uSeed + 8850));
    barW = min(barW, (d2main - dist) * 0.45);
    float bar = (1.0 - sstep(barW - pxa, barW + pxa, bankD)) * sstep(-pxa, pxa, bankD) * detail * own;
    if (bar > 0.0) rnPaint(mix(BARWET, BAR, sstep(0.0, barW * 0.6, bankD)), bar * (1.0 - bedK));
    // behind the bar, the old banks the river left as it moved out: ridges and hollows in the meadow
    float scrollZ = (rad - hw) * 0.5;
    if (bankD > 0.0 && bankD < scrollZ && rad < 9.0 * w) {
      float st = 0.5 + 0.5 * cos(bankD / (0.6 * w) * 6.2831853 + 2.0 * vnoise(vec2(nr.z * 0.8, bankD / w), uSeed + 8851));
      float vis = (1.0 - sstep(scrollZ * 0.5, scrollZ, bankD)) * sstep(0.6, 1.6, 0.6 * w / pxm) * (1.0 - arid * 0.6) * own * innerAmt;
      rnPaint(mix(vec3(0.26, 0.37, 0.20), vec3(0.40, 0.47, 0.28), st), vis * 0.45);
    }
  }
  // oxbow lakes: bends the river cut off long ago (and the scars of others), beside today's channel
  if (detail > 0.0 && oxb > 0.05 && Ae > 1.5 * w) {
    vec3 ox = rnNearest(vec2(s, n), a0.w, a0.z, k, Ae * 1.3, min(beta * 1.3, 0.9), rid + 0.37, sd + 7, 2.3);
    float loopId = floor(ox.z / 3.1415927);
    float apex = abs(sin(ox.z));
    float pick = hash2(int(loopId), int(rid), uSeed + 8860);
    float awayFromRiver = sstep(1.0 * w, 2.0 * w, bankD);
    if (pick < oxb * 0.7) {
      float wl = w * 0.9 * sstep(0.5, 0.8, apex);
      float lake = (1.0 - sstep(wl * 0.5 - pxa, wl * 0.5 + pxa, ox.x)) * awayFromRiver * detail;
      float age = hash2(int(loopId), int(rid), uSeed + 8861);
      vec3 lc = age < 0.6 ? mix(vec3(0.05, 0.09, 0.10), vec3(0.10, 0.17, 0.15), age) : mix(vec3(0.22, 0.32, 0.18), vec3(0.12, 0.20, 0.13), vnoise(vec2(al, n / w), uSeed + 8862));
      rnPaint(lc, lake);
      if (age < 0.6) gRivWater = max(gRivWater, lake);
    } else {
      float scar = (1.0 - sstep(w * 0.3, w * 0.6, ox.x)) * awayFromRiver * detail * sstep(0.5, 0.8, apex) * step(0.55, pick);
      rnPaint(vec3(0.36, 0.45, 0.26), scar * 0.3 * (1.0 - arid));
    }
  }
  if (water > 0.0) {
    float depth = clamp(1.0 - (dist / max(hw, 1e-6)) * (dist / max(hw, 1e-6)), 0.0, 1.0);
    // the deep water swings to the outside of each bend
    if (!inner) depth = min(1.0, depth * 1.25);
    vec3 wc = riverWater(turb, conf, est, depth * sstep(0.5, 3.0, w / pxm) + (1.0 - sstep(0.5, 3.0, w / pxm)) * 0.6);
    // drawn wider than it is (seen from far): a little bluer, so the map stays easy to read
    wc = mix(wc, vec3(0.25, 0.39, 0.47), 0.55 * sstep(1.3, 3.0, wD / w));
    // ripples; white water where mountain streams run steep
    wc *= 1.0 + 0.05 * (vnoise(vec2(al * 40.0, n * 40.0 / w), uSeed + 8870) - 0.5) * detail;
    float foam = conf * sstep(0.62, 0.8, vnoise(vec2(al / 1.5, n / (w * 0.3)), uSeed + 8871)) * detail;
    wc = mix(wc, vec3(0.80, 0.84, 0.82), foam * 0.6);
    rnPaint(wc, water);
    gRivWater = max(gRivWater, water);
  }
  // the banks: a thin line of wet mud, and trees along them where the land is not too dry
  if (detail > 0.0) {
    float bank = (1.0 - sstep(0.0, min(0.06 * w, 12.0 * M) + pxm, bankD)) * sstep(-pxa, pxa, bankD);
    rnPaint(mix(BARWET, vec3(0.30, 0.30, 0.24), 0.4), bank * 0.45 * detail);
    float tband = 40.0 * M + 0.25 * w;
    float trees = sstep(0.0, 0.1, 0.6 * gnoise(p / (60.0 * M), uSeed + 8875) + 0.3 * gnoise(p / (18.0 * M), uSeed + 8877) + 0.15 * gnoise(p / (6.0 * M), uSeed + 8878) + 0.25 - 0.5 * bankD / tband);
    float tz = sstep(-pxa, pxa, bankD) * (1.0 - sstep(tband, tband * 2.0, bankD)) * (1.0 - bedK);
    rnPaint(mix(FORESTDARK, FOREST, vnoise(p / (6.0 * M), uSeed + 8876)), trees * tz * sstep(1.0, 3.0, 20.0 * M / pxm) * (1.0 - 0.6 * arid) * 0.85);
  }
}
void riverAt(vec2 p, float pxm) {
  gRiv = vec4(0.0); gRivWater = 0.0; gFP = 0.0; gFPDry = 0.0; gVal = 0.0; gValGrad = vec2(0.0); gValFlat = 0.0; gRivBank = 1e9;
  if (uRivOn == 0) return;
  vec4 cl = texelFetch(uRCell, ivec2(clamp(floor(p), vec2(0.0), vec2(95.0, 63.0))), 0);
  int off = int(cl.x), cnt = int(cl.y);
  // the nearest stretch of each of up to three rivers
  int hv[3] = int[3](-1, -1, -1); float hd[3] = float[3](1e9, 1e9, 1e9), ht[3] = float[3](0.0, 0.0, 0.0), hn[3] = float[3](0.0, 0.0, 0.0), hr[3] = float[3](-1.0, -1.0, -1.0);
  vec2 hnn[3] = vec2[3](vec2(0.0), vec2(0.0), vec2(0.0));
  for (int i = 0; i < 160; i++) {
    if (i >= cnt) break;
    int li = off + i;
    int v = int(texelFetch(uRList, ivec2(li & 2047, li >> 11), 0).r + 0.5);
    vec4 A0 = rvT(v, 0), B0 = rvT(v + 1, 0);
    if (segDist(p, A0.xy, B0.xy) > min(hd[2] + 0.08, 0.6)) continue;
    float t, n; vec2 nn;
    if (!rnProj(p, v, t, n, nn)) continue;
    float over = max(-t, t - 1.0);
    float ad = abs(n) + (over > 0.0 ? 0.05 + over * length(B0.xy - A0.xy) * 2.0 : 0.0);
    t = clamp(t, 0.0, 1.0);
    float rid = rvT(v, 3).w;
    // already holding this river? keep the nearer stretch
    int slot = -1;
    for (int k = 0; k < 3; k++) if (hr[k] == rid) slot = k;
    if (slot >= 0) { if (ad >= hd[slot]) continue; }
    else { slot = 2; if (ad >= hd[2]) continue; }
    hv[slot] = v; hd[slot] = ad; ht[slot] = t; hn[slot] = n; hnn[slot] = nn; hr[slot] = rid;
    // keep the three in order, nearest first
    for (int k = 2; k > 0; k--) if (hd[k] < hd[k - 1]) {
      int tv = hv[k]; hv[k] = hv[k - 1]; hv[k - 1] = tv;
      float tf = hd[k]; hd[k] = hd[k - 1]; hd[k - 1] = tf; tf = ht[k]; ht[k] = ht[k - 1]; ht[k - 1] = tf;
      tf = hn[k]; hn[k] = hn[k - 1]; hn[k - 1] = tf; tf = hr[k]; hr[k] = hr[k - 1]; hr[k - 1] = tf;
      vec2 t2 = hnn[k]; hnn[k] = hnn[k - 1]; hnn[k - 1] = t2;
    }
  }
  // smaller rivers first, so where they meet the bigger one's water shows on top
  float sz[3];
  for (int k = 0; k < 3; k++) sz[k] = hv[k] >= 0 ? rvT(hv[k], 1).z : -1.0;
  for (int pass = 0; pass < 3; pass++) {
    int pick = -1; float ps = 1e9;
    for (int k = 0; k < 3; k++) if (hv[k] >= 0 && sz[k] < ps) { ps = sz[k]; pick = k; }
    if (pick < 0) break;
    sz[pick] = 1e10;
    riverOne(p, pxm, hv[pick], ht[pick], hn[pick], hnn[pick]);
  }
}

vec3 waterColor(vec2 p, float e) {
  float d = uSea - e;
  vec3 c = d < 0.012 ? mix(SHOAL, SHELF, d / 0.012) : d < 0.05 ? mix(SHELF, MID, (d - 0.012) / 0.038) : d < 0.14 ? mix(MID, OCEAN, (d - 0.05) / 0.09) : mix(OCEAN, DEEP, clamp((d - 0.14) / 0.2, 0.0, 1.0));
  // the open sea is never one flat colour: broad patches of greyer and greener water
  c *= 1.0 + 0.12 * (fbm(p * 0.4, uSeed + 7690, 3) - 0.5);
  // silt stirred up near the coast: milky turquoise and green clouds that the currents draw out into long streaks
  vec2 wq = p + 1.6 * vec2(fbm(p * 0.7, uSeed + 7700, 3), fbm(p * 0.7 + 9.1, uSeed + 7701, 3));
  vec2 sq = ROT * wq;
  float swirl = fbm(sq * vec2(1.4, 4.2), uSeed + 7702, 4);
  float near = 1.0 - sstep(0.003, 0.025 + 0.045 * swirl, d);
  float turb = clamp(near * (0.2 + 1.3 * (swirl - 0.3)), 0.0, 1.0);
  vec3 silt = mix(SILT, TURQ, sstep(0.42, 0.68, fbm(wq * 1.1, uSeed + 7703, 3)));
  c = mix(c, silt, turb * 0.7);
  // sandbanks in shallow water: pale ridges laid along the current
  if (d < 0.02) { float bank = sstep(0.6, 0.72, fbm(sq * vec2(2.5, 9.0), uSeed + 7704, 4)); c = mix(c, BANK, bank * (1.0 - d / 0.02) * 0.55); }
  if (d < 0.01) c = mix(c, SAND, (1.0 - d / 0.01) * 0.3);
  // ripples and swell, finer the closer you look
  float w = 0.0, amp = 0.05, fq = 9.0;
  for (int o = 0; o < 10; o++) { float k = octFade(fq); if (k <= 0.0) break; k *= octTop(fq); if (k > 0.0) w += amp * k * (vnoise(p * fq * vec2(1.0, 2.2), uSeed + 6500 + o * 7) - 0.5);  amp *= 0.72; fq *= 2.0; }
  c *= 1.0 + w * clamp(1.0 - d * 3.0, 0.3, 1.0);
  if (d < 0.0012) c = mix(c, vec3(0.86, 0.9, 0.88), (1.0 - d / 0.0012) * 0.35);   // surf
  // harbours: piers reaching out from the shore with ships alongside, a breakwater guarding the harbour mouth,
  // and a marina of small white boats beside it
  vec4 ti = floor(texelFetch(uTownIdx, ivec2(clamp(floor(p), vec2(0.0), vec2(95.0, 63.0))), 0) * 255.0 + 0.5);
  if (d < 0.02 && ti.x > 0.5 && uScale < 0.004) {
    float sm = -shoreDistM(p);                                 // metres out from the shore
    for (int kk = 0; kk < 4 * uOne; kk++) {
      int i = int(ti[kk]) - 1;
      if (i < 0) break;
      vec4 A = texelFetch(uTowns, ivec2(i, 0), 0);
      vec2 rel = p - A.xy;
      float Ru = A.z * 0.62;
      if (length(rel) > Ru * 0.9) continue;
      vec4 B = texelFetch(uTowns, ivec2(i, 1), 0), S4 = texelFetch(uTowns, ivec2(i, 4), 0), S2 = texelFetch(uTowns, ivec2(i, 2), 0), S3 = texelFetch(uTowns, ivec2(i, 3), 0), S5 = texelFetch(uTowns, ivec2(i, 5), 0);
      bool port = mod(A.w, 4.0) > 1.5;
      vec2 sea = length(S4.zw) > 0.5 ? normalize(S4.zw) : vec2(1.0, 0.0);
      float alongC = dot(rel, vec2(-sea.y, sea.x)) / M;
      float pop = B.y;
      float span = min(Ru * 0.45, 0.06 + 0.02 * pop) / M;
      float pm = uScale / M;                                   // metres a pixel
      if (port && abs(alongC) < span) {
        float slot = floor(alongC / 180.0 + 0.5), pc = alongC - 180.0 * slot;
        float pierLen = 260.0 + 80.0 * hash2(int(slot), 1, uSeed + 9900);
        float pier = (1.0 - sstep(12.0, 12.0 + pm, abs(pc))) * (1.0 - sstep(pierLen, pierLen + pm, sm));
        // ships moored along the piers
        float sc = abs(pc) - 40.0;
        float sh = hash2(int(slot), 3, uSeed + 9901);
        float sl = 70.0 + 70.0 * hash2(int(slot), 5, uSeed + 9903);
        float ship = (1.0 - sstep(15.0, 15.0 + pm, abs(sc))) * (1.0 - sstep(sl, sl + pm, abs(sm - pierLen * 0.5))) * step(sh, 0.6 + 0.04 * min(S2.x + S2.y, 6.0));
        float hullCol = hash2(int(slot) * 2 + int(sign(pc)), 4, uSeed + 9902);
        vec3 hc = hullCol < 0.3 ? vec3(0.55, 0.22, 0.18) : hullCol < 0.55 ? vec3(0.20, 0.30, 0.45) : hullCol < 0.8 ? vec3(0.25, 0.25, 0.27) : vec3(0.8);
        hc = mix(hc, vec3(0.92), step(sl * 0.6, sm - pierLen * 0.5 + sl) * 0.8 * step(0.0, sm - pierLen * 0.5 + sl * 0.4));
        float vis = sstep(0.5, 2.0, 24.0 / pm);
        c = mix(c, hc, ship * vis);
        c = mix(c, vec3(0.62, 0.60, 0.56), pier * vis);
        // the breakwater: a stone wall offshore, open at the harbour mouth
        float bw = (1.0 - sstep(10.0, 10.0 + pm, abs(sm - 520.0))) * step(160.0, abs(alongC)) * (1.0 - sstep(span * 1.05, span * 1.05 + pm, abs(alongC)));
        c = mix(c, vec3(0.66, 0.64, 0.60), bw * sstep(0.3, 1.0, 20.0 / pm));
      }
      // a marina (or fishing harbour) beside the main harbour, or in any sizeable town on the coast
      float mx = alongC - (port ? span + 400.0 : 0.0);
      if ((pop > 2.0 || S3.z > 0.0 || S5.z > 0.0) && abs(mx) < 350.0 && sm < 160.0) {
        vec2 mq = vec2(mx, sm);
        vec2 cell = floor(mq / vec2(8.0, 24.0)), f = mq - cell * vec2(8.0, 24.0);
        float jetty = (f.y < 2.5) ? 1.0 : 0.0;
        float boat = (abs(f.x - 4.0) < 1.5 && abs(f.y - 9.0) < 5.0 && hash2(int(cell.x), int(cell.y), uSeed + 9905) < 0.7) ? 1.0 : 0.0;
        float wall = (1.0 - sstep(6.0, 6.0 + pm, abs(sm - 150.0))) + (1.0 - sstep(6.0, 6.0 + pm, abs(abs(mx) - 345.0)));
        c = mix(c, vec3(0.93, 0.93, 0.91), boat * sstep(1.0, 3.0, 4.0 / pm));
        c = mix(c, vec3(0.60, 0.58, 0.54), max(jetty * sstep(1.0, 3.0, 3.0 / pm), min(1.0, wall) * sstep(0.3, 1.0, 12.0 / pm)));
      }
      break;
    }
  }
  return c;
}

#if PASS == 1
// pass 1: land, sea, rivers, farms, forests, mountains, mines and harbours (no towns)
void main() {
  outRiv = vec4(0.0, 1.0, 0.0, 1.0);
  vec2 p = uOrigin + vec2(gl_FragCoord.x, uH - gl_FragCoord.y) * uScale;
  bool outside = p.x < 0.0 || p.y < 0.0 || p.x > 96.0 || p.y > 64.0;
  float e = outside ? -1.0 : coastE(p);
  bool forced = outside || p.x < 1.0 || p.y < 1.0 || p.x >= 95.0 || p.y >= 63.0;
  bool water = forced || e <= uSea;
  if (uMode == 1) { outColor = water ? vec4(0.0) : vec4(1.0); return; }
  if (outside) { outColor = vec4(satLook(DEEP), 1.0); return; }
  vec3 col;
  if (water) col = waterColor(p, forced ? min(e, uSea - 0.2) : e);
  else {
    float h = reliefAt(p, e);
    // the slope: the height a pixel to the east and to the south
    float dx = uScale;
    float hx = reliefAt(p + vec2(dx, 0.0), e), hy = reliefAt(p + vec2(0.0, dx), e);
    const float Z = 7.5;
    vec2 grad = vec2(hx - h, hy - h) / dx;
    // rivers, and the valleys they have cut
    riverAt(p, uScale);
    h = e + (h - e) * (1.0 - gValFlat) + gVal;
    grad = grad * (1.0 - gValFlat) + gValGrad;
    vec3 n = normalize(vec3(-grad * Z, 1.0));
    float slope = length(grad) * Z;
    vec4 town = vec4(0.0);   // towns are drawn by the second pass
    vec3 g = landColor(p, e, h, n, slope);
    // the floodplain: lusher along the river; in dry country a green ribbon of meadows, reeds and orchards
    g = mix(g, mix(g, vec3(0.23, 0.33, 0.18), 0.18), gFP * (1.0 - gFarm * 0.6));
    g = mix(g, mix(vec3(0.24, 0.37, 0.17), vec3(0.34, 0.43, 0.22), vnoise(p * 300.0, uSeed + 8890)), gFPDry);
    vec4 pit = pitColor(p, uScale);
    g = mix(g, pit.rgb, pit.a);
    g = mix(g, town.rgb, town.a);
    g = mix(g, gRiv.rgb, mix(gRiv.a, gRivWater, town.a));
    vec3 sun = normalize(vec3(-0.62, -0.72, 0.7));
    float lam = dot(n, sun);
    float shade = clamp(lam / sun.z, 0.42, 1.45);
    float hillW = sstep(uHill - 0.012, uHill + 0.022, e), mtnW = sstep(uMtn - 0.01, uMtn + 0.035, e);
    shade = 1.0 + (shade - 1.0) * (0.35 + 0.65 * max(hillW, mtnW)) * (1.0 - 0.7 * gFarm) * (1.0 - 0.75 * town.a) * (1.0 - 0.5 * pit.a) * (1.0 - 0.85 * gRivWater);
    col = g * shade;
    outRiv = vec4(gRivWater, clamp(gRivBank / 160.0, 0.0, 1.0), 0.0, 1.0);
  }
  outColor = vec4(clamp(satLook(col), 0.0, 1.0), 1.0);
}
#elif PASS == 2
// pass 2: the towns, over the land the first pass drew; the river water comes back on top (bridges where main roads
// cross), and quays and green strips line the banks
void main() {
  ivec2 fc = ivec2(gl_FragCoord.xy);
  vec4 base = texelFetch(uFrame, fc, 0);
  outColor = base;
  vec2 p = uOrigin + vec2(gl_FragCoord.x, uH - gl_FragCoord.y) * uScale;
  if (p.x < 1.0 || p.y < 1.0 || p.x >= 95.0 || p.y >= 63.0) return;
  if (texelFetch(uTownIdx, ivec2(floor(p)), 0).x < 0.5 / 255.0) return;
  float e = coastE(p);
  if (e <= uSea) return;
  vec4 rv = texelFetch(uRiv, fc, 0);
  gRivBank = rv.y < 0.999 ? rv.y * 160.0 : 1e9;
  // how steep the ground is (from the land's broad height, a little coarser than its own relief)
  float dx = max(uScale * 2.0, 0.004);
  float e0 = elevationAt(p);
  float slope = length(vec2(elevationAt(p + vec2(dx, 0.0)) - e0, elevationAt(p + vec2(0.0, dx)) - e0) / dx) * 7.5 * 2.5;
  vec4 town = cityColor(p, uScale, e - uSea, slope);
  vec3 col = mix(base.rgb, satLook(clamp(town.rgb, 0.0, 1.0)), town.a);
  col = mix(col, base.rgb, rv.x * (1.0 - gTownRoad));
  col = mix(col, satLook(vec3(0.62, 0.61, 0.58)), rv.x * gTownRoad * town.a);   // bridges
  outColor = vec4(col, 1.0);
}
#endif
`;
}

/* ---------- Rivers: rain runs downhill to the sea ---------- */
const riverCache = { seed: null, paths: [] };
function computeRivers(w) {
  const F = riverField(w);
  const { R, GW, N, land, down, acc } = F;
  const seed = w.seed;
  const TH = 75;
  const inflow = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (land[p] && acc[p] >= TH && down[p] >= 0) inflow[down[p]] = 1;
  const traced = new Uint8Array(N);
  const classOf = a => (a < 190 ? 0 : a < 520 ? 1 : a < 1400 ? 2 : 3);
  const paths = [[], [], [], []];
  for (let s = 0; s < N; s++) {
    if (!land[s] || acc[s] < TH || inflow[s]) continue;
    // follow the river from its source until it reaches the sea or joins a bigger one
    const pts = [];
    let p = s;
    while (p >= 0) {
      pts.push(p);
      if (traced[p] || !land[p]) break;
      traced[p] = 1;
      p = down[p];
    }
    if (pts.length < 4) continue;
    const xy = pts.map((q, i) => {
      const x = ((q % GW) + 0.5) / R, y = (((q / GW) | 0) + 0.5) / R;
      const j = i === 0 || i === pts.length - 1 ? 0 : 0.42;
      return [x + j * (valueNoise(x * 1.4, y * 1.4, seed + 801) - 0.5) + 0.12 * (valueNoise(x * 4, y * 4, seed + 803) - 0.5), y + j * (valueNoise(x * 1.4, y * 1.4, seed + 802) - 0.5) + 0.12 * (valueNoise(x * 4, y * 4, seed + 804) - 0.5)];
    });
    const sm = chaikin(xy, false, 2);
    // split into pieces by width, so a river widens as it flows
    let cur = classOf(acc[pts[0]]), start = 0;
    const per = sm.length / pts.length;
    for (let i = 1; i <= sm.length; i++) {
      const cls = i < sm.length ? classOf(acc[pts[Math.min(pts.length - 1, Math.floor(i / per))]]) : -1;
      if (cls !== cur) { paths[cur].push(sm.slice(start, Math.min(sm.length, i + 1))); start = i; cur = cls; }
    }
  }
  riverCache.seed = seed;
  riverCache.lines = paths; riverCache.fine = null;
  riverCache.paths = paths.map(list => { const p = new Path2D(); for (const l of list) { p.moveTo(l[0][0], l[0][1]); for (let i = 1; i < l.length; i++) p.lineTo(l[i][0], l[i][1]); } return p; });
}
function drawRivers(c, cs) {
  if (riverCache.seed !== world.seed) return;
  c.save();
  c.scale(cs, cs);
  c.lineCap = "round"; c.lineJoin = "round";
  const widths = [0.03, 0.05, 0.075, 0.11], caps = [1.6, 2.6, 4, 6];
  const close = GLMAP.ok && cs > 90;
  const paths = close ? fineRiverPaths() : riverCache.paths;
  for (let k = 0; k < 4; k++) {
    const px = GLMAP.ok ? Math.max(GL_RIVER_W[k] * cs, Math.min(cs * widths[k], caps[k])) : cs * widths[k];
    if (px < 0.55) continue;
    c.strokeStyle = close ? "rgba(46,74,38,0.4)" : "rgba(24,60,70,0.35)"; c.lineWidth = (close ? px * 1.8 + 3 : px + 1.2) / cs; c.stroke(paths[k]);
    c.strokeStyle = k >= 2 ? "rgb(44,104,128)" : "rgb(48,100,118)"; c.lineWidth = Math.max(0.6, px) / cs; c.stroke(paths[k]);
  }
  c.restore();
}

function resizeCanvas() {
  const w = mapwrap.clientWidth, h = mapwrap.clientHeight;
  if (!w || !h) return;
  const cx = view.vw ? (view.vw / 2 - view.ox) / view.cs : GRID_W / 2, cy = view.vh ? (view.vh / 2 - view.oy) / view.cs : GRID_H / 2;
  view.vw = w; view.vh = h;
  view.base = Math.min(w / GRID_W, h / GRID_H);
  view.dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * view.dpr);
  canvas.height = Math.round(h * view.dpr);
  view.staticKey = "";
  for (const k of ["overlay", "maskCanvas", "staticCanvas"]) {
    view[k] = view[k] || document.createElement("canvas");
    view[k].width = canvas.width; view[k].height = canvas.height;
  }
  view.cs = view.base * view.zoom;
  view.ox = w / 2 - cx * view.cs; view.oy = h / 2 - cy * view.cs;
  clampCamera();
  updateZoomBox();
  renderMap();
}

function ownerAt(i) {
  if (game) return game.owner[i];
  return ui.drawCellSet && ui.drawCellSet.has(i) ? PLAYER : -1;
}

function cellCenter(i, cs) { return [(cellX(i) + 0.5) * cs, (cellY(i) + 0.5) * cs]; }

/* ---------- Camera: zoom with the wheel, pan by dragging with the right or middle button ---------- */
const ZOOM = { min: 1, max: 5 };

function clampCamera() {
  const mw = GRID_W * view.cs, mh = GRID_H * view.cs;
  view.ox = mw <= view.vw ? (view.vw - mw) / 2 : clamp(view.ox, view.vw - mw, 0);
  view.oy = mh <= view.vh ? (view.vh - mh) / 2 : clamp(view.oy, view.vh - mh, 0);
}
function zoomAt(z, sx, sy) {
  z = clamp(z, ZOOM.min, ZOOM.max);
  const mx = (sx - view.ox) / view.cs, my = (sy - view.oy) / view.cs;
  view.zoom = z;
  view.cs = view.base * z;
  view.ox = sx - mx * view.cs; view.oy = sy - my * view.cs;
  clampCamera();
  updateZoomBox();
  scheduleMapRender();
}
function panBy(dx, dy) { view.ox += dx; view.oy += dy; clampCamera(); scheduleMapRender(); }
function zoomStep(dir) { zoomAt(view.zoom * (dir > 0 ? 1.35 : 1 / 1.35), view.vw / 2, view.vh / 2); }
function zoomFit() { zoomAt(1, view.vw / 2, view.vh / 2); }
function centerOnCell(cell, z) {
  view.zoom = clamp(z || view.zoom, ZOOM.min, ZOOM.max); view.cs = view.base * view.zoom;
  view.ox = view.vw / 2 - (cellX(cell) + 0.5) * view.cs; view.oy = view.vh / 2 - (cellY(cell) + 0.5) * view.cs;
  clampCamera(); updateZoomBox(); scheduleMapRender();
}
function updateZoomBox() {
  const el = document.getElementById("zoom-level");
  if (el) el.textContent = `${Math.round(view.zoom * 100)}%`;
}

/* ---------- Smooth outlines: marching squares over cell centres, then corner rounding ---------- */
function contourLines(inside, keepQuad) {
  const segs = [];
  const v = (x, y) => (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H ? 0 : inside(x, y) ? 1 : 0);
  for (let y = -1; y < GRID_H; y++) for (let x = -1; x < GRID_W; x++) {
    const tl = v(x, y), tr = v(x + 1, y), br = v(x + 1, y + 1), bl = v(x, y + 1);
    const code = tl * 8 + tr * 4 + br * 2 + bl;
    if (code === 0 || code === 15) continue;
    if (keepQuad && !keepQuad(x, y)) continue;
    const T_ = [x + 1, y + 0.5], R = [x + 1.5, y + 1], B = [x + 1, y + 1.5], L = [x + 0.5, y + 1];
    const add = (a, b) => segs.push([a, b]);
    switch (code) {
      case 1: case 14: add(L, B); break;
      case 2: case 13: add(B, R); break;
      case 3: case 12: add(L, R); break;
      case 4: case 11: add(T_, R); break;
      case 6: case 9: add(T_, B); break;
      case 7: case 8: add(L, T_); break;
      case 5: add(L, B); add(T_, R); break;
      case 10: add(L, T_); add(B, R); break;
    }
  }
  return chainSegments(segs);
}
function chainSegments(segs) {
  const key = p => Math.round(p[0] * 2 + 4) * 1000 + Math.round(p[1] * 2 + 4);
  const at = new Map();
  segs.forEach((s, i) => { for (const p of s) { const k = key(p); if (!at.has(k)) at.set(k, []); at.get(k).push(i); } });
  const used = new Uint8Array(segs.length);
  const lines = [];
  const extend = (pts, from) => {
    for (;;) {
      const end = pts[pts.length - 1];
      const next = (at.get(key(end)) || []).find(i => !used[i]);
      if (next === undefined) return;
      used[next] = 1;
      const s = segs[next];
      pts.push(key(s[0]) === key(end) ? s[1] : s[0]);
      void from;
    }
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const pts = [segs[i][0], segs[i][1]];
    extend(pts);
    pts.reverse();
    extend(pts);
    const closed = pts.length > 2 && key(pts[0]) === key(pts[pts.length - 1]);
    if (closed) pts.pop();
    lines.push({ pts, closed });
  }
  return lines;
}
function chaikin(pts, closed, rounds = 2) {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    const out = [];
    const n = p.length;
    if (!closed) out.push(p[0]);
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}
function linesToPath(lines, rounds = 2) {
  const path = new Path2D();
  for (const l of lines) {
    const pts = l.pts.length > 2 ? chaikin(l.pts, l.closed, rounds) : l.pts;
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
    if (l.closed) path.closePath();
  }
  return path;
}

/* Everything drawn from ownership is rebuilt only when the map changes. */
const shapeCache = { key: "", nations: [], occupied: [], fronts: null, roads: null, labels: [] };

function shapesKey() {
  if (!game) return `draw|${ui.drawCells ? ui.drawCells.length + ":" + ui.drawCells[0] : 0}`;
  return `${mapVersion}|${game.ver}|${game.roads.size}|${game.wars.length}`;
}

function buildShapes() {
  const key = shapesKey();
  if (shapeCache.key === key) return shapeCache;
  shapeCache.key = key;
  shapeCache.traffic = null;
  const owner = i => ownerAt(i);
  const sea = i => !isLand(world, i);
  // Sea cells next to a nation count as its own, so its border never runs along the coast.
  const claims = (x, y, nid) => {
    const i = idx(x, y);
    if (!sea(i)) return owner(i) === nid;
    for (const [dx, dy] of DIRS8) { const nx = x + dx, ny = y + dy; if (inBounds(nx, ny) && !sea(idx(nx, ny)) && owner(idx(nx, ny)) === nid) return true; }
    return false;
  };
  shapeCache.nations = [];
  shapeCache.labels = [];
  const ids = game ? game.nations.filter(n => n.alive).map(n => n.id) : ui.drawCellSet ? [PLAYER] : [];
  for (const nid of ids) {
    shapeCache.nations.push({ nid, path: linesToPath(contourLines((x, y) => claims(x, y, nid))) });
    let sx = 0, sy = 0, count = 0;
    for (let i = 0; i < N_CELLS; i++) if (owner(i) === nid) { sx += cellX(i) + 0.5; sy += cellY(i) + 0.5; count++; }
    if (count && game) shapeCache.labels.push({ nid, x: sx / count, y: sy / count, count });
  }
  shapeCache.occupied = [];
  shapeCache.fronts = null;
  shapeCache.roads = null;
  if (!game) return shapeCache;
  const occupiers = new Set();
  for (let i = 0; i < N_CELLS; i++) if (game.occ[i] >= 0) occupiers.add(game.occ[i]);
  for (const by of occupiers) shapeCache.occupied.push({ by, path: linesToPath(contourLines((x, y) => game.occ[idx(x, y)] === by), 1) });
  if (game.wars.length) {
    const lines = [];
    for (const war of game.wars) for (const a of war.sideA) for (const b of war.sideB) {
      const ctl = (x, y) => (inBounds(x, y) ? controller(game, idx(x, y)) : -1);
      const keep = (x, y) => [ctl(x, y), ctl(x + 1, y), ctl(x, y + 1), ctl(x + 1, y + 1)].includes(b);
      lines.push(...contourLines((x, y) => !sea(idx(x, y)) && ctl(x, y) === a, keep));
    }
    shapeCache.fronts = linesToPath(lines, 2);
  }
  shapeCache.roads = roadPath();
  return shapeCache;
}

/* Roads drawn as smooth curves: each bend is a curve through the town or cell it passes. */
function roadPath() {
  const path = new Path2D();
  const nbrs = new Map();
  for (const k of game.roads) {
    const [a, b] = edgeEnds(k);
    if (!nbrs.has(a)) nbrs.set(a, []); if (!nbrs.has(b)) nbrs.set(b, []);
    nbrs.get(a).push(b); nbrs.get(b).push(a);
  }
  const ctr = c => [cellX(c) + 0.5, cellY(c) + 0.5];
  const mid = (a, b) => { const p = ctr(a), q = ctr(b); return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; };
  for (const [c, list] of nbrs) {
    const p = ctr(c);
    const town = game.cities.some(t => t.cell === c);
    if (list.length === 2 && !town) {
      const m1 = mid(c, list[0]), m2 = mid(c, list[1]);
      path.moveTo(m1[0], m1[1]); path.quadraticCurveTo(p[0], p[1], m2[0], m2[1]);
    } else {
      for (const n of list) { const m = mid(c, n); path.moveTo(p[0], p[1]); path.lineTo(m[0], m[1]); }
    }
  }
  return path;
}

function hatchPattern(c, color) {
  const t = document.createElement("canvas");
  t.width = t.height = 9;
  const g = t.getContext("2d");
  g.strokeStyle = color; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(-1, 10); g.lineTo(10, -1); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(8, 10); g.lineTo(10, 8); g.stroke();
  return c.createPattern(t, "repeat");
}

/* Territory: a light wash of the nation's colour, a soft band inside the border, and a crisp border line. */
function drawTerritories(o, cs) {
  const sh = buildShapes();
  o.save();
  o.scale(cs, cs);
  const px = v => v / cs;
  o.lineJoin = "round"; o.lineCap = "round";
  for (const { nid, path } of sh.nations) {
    const color = NATION_COLORS[nid];
    o.fillStyle = rgba(color, 0.08);
    o.fill(path, "evenodd");
    o.save();
    o.clip(path, "evenodd");
    o.strokeStyle = rgba(color, 0.16); o.lineWidth = px(clamp(cs * 1.2, 12, 40)); o.stroke(path);
    o.strokeStyle = rgba(color, 0.26); o.lineWidth = px(clamp(cs * 0.4, 5, 14)); o.stroke(path);
    o.restore();
  }
  if (game) {
    for (const { by, path } of sh.occupied) {
      const pat = hatchPattern(o, rgba(NATION_COLORS[by], 0.6));
      pat.setTransform(new DOMMatrix().scale(1 / cs));
      o.fillStyle = pat;
      o.fill(path, "evenodd");
      o.strokeStyle = rgba(NATION_COLORS[by], 0.9); o.lineWidth = px(1.4); o.setLineDash([px(4), px(3)]);
      o.stroke(path);
      o.setLineDash([]);
    }
  }
  for (const { nid, path } of sh.nations) {
    o.strokeStyle = "rgba(10,10,10,0.5)"; o.lineWidth = px(clamp(cs * 0.2, 2.6, 5)); o.stroke(path);
    o.strokeStyle = NATION_COLORS[nid]; o.lineWidth = px(clamp(cs * 0.085, 1.3, 2.4)); o.stroke(path);
  }
  o.restore();
}

function drawFronts(c, cs) {
  const sh = buildShapes();
  if (!sh.fronts) return;
  c.save();
  c.scale(cs, cs);
  c.lineCap = "round"; c.lineJoin = "round";
  c.strokeStyle = "rgba(255,90,50,0.22)"; c.lineWidth = clamp(cs * 0.7, 6, 20) / cs; c.stroke(sh.fronts);
  c.strokeStyle = "rgba(20,4,2,0.8)"; c.lineWidth = clamp(cs * 0.34, 4, 9) / cs; c.stroke(sh.fronts);
  c.strokeStyle = "#ff6a3d"; c.lineWidth = clamp(cs * 0.16, 2, 4.5) / cs; c.stroke(sh.fronts);
  c.restore();
}

function strokeEdges(c, edges, cs) {
  c.beginPath();
  for (const e of edges) {
    const [a, b] = edgeEnds(e);
    const [ax, ay] = cellCenter(a, cs), [bx, by] = cellCenter(b, cs);
    c.moveTo(ax, ay); c.lineTo(bx, by);
  }
  c.stroke();
}

/* Roads: pale ribbons with a soft dark edge, like seen from the air. */
function drawRoads(c, cs) {
  const sh = buildShapes();
  c.save();
  c.scale(cs, cs);
  c.lineCap = "round"; c.lineJoin = "round";
  c.strokeStyle = "rgba(26,22,18,0.55)"; c.lineWidth = clamp(cs * 0.17, 1.8, 5.5) / cs; c.stroke(sh.roads);
  c.strokeStyle = "#ddd5c1"; c.lineWidth = clamp(cs * 0.075, 0.8, 2.6) / cs; c.stroke(sh.roads);
  c.restore();
  for (const p of game.projects) {
    if (p.kind === "road") {
      c.setLineDash([cs * 0.3, cs * 0.25]);
      c.strokeStyle = rgba(NATION_COLORS[p.nid], 0.95);
      c.lineWidth = clamp(cs * 0.1, 1.3, 3);
      strokeEdges(c, p.edges.filter(e => !game.roads.has(e)), cs);
      c.setLineDash([]);
    }
    if (p.kind === "town") {
      const [x, y] = cellCenter(p.site, cs);
      c.setLineDash([3, 3]);
      c.strokeStyle = rgba(NATION_COLORS[p.nid], 0.9);
      c.lineWidth = 1.3;
      c.beginPath(); c.arc(x, y, BUILD.townClaimRadius * cs, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      drawTownMarker(c, x, y, 3, NATION_COLORS[p.nid], false, 0.65);
    }
  }
}

/* Towns: the city itself is painted into the land; on top sits a small atlas marker and its name. */
function drawTownMarker(c, x, y, r, color, capital, alpha = 1) {
  c.globalAlpha = alpha;
  if (capital) {
    c.fillStyle = "rgba(12,10,8,0.85)";
    c.beginPath(); c.arc(x, y, r + 2.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = color;
    c.beginPath(); c.arc(x, y, r + 1.6, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = "#f7f3ea";
  c.strokeStyle = "rgba(12,10,8,0.9)";
  c.lineWidth = 1.2;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
  if (capital) { c.fillStyle = "rgba(12,10,8,0.9)"; c.beginPath(); c.arc(x, y, r * 0.38, 0, Math.PI * 2); c.fill(); }
  c.globalAlpha = 1;
}
function drawPlaceLabel(c, text, x, y, size, weight, alpha = 1) {
  c.font = `${weight} ${size}px "IBM Plex Sans", system-ui, sans-serif`;
  c.textAlign = "left"; c.textBaseline = "middle"; c.lineJoin = "round";
  c.globalAlpha = alpha;
  c.lineWidth = Math.max(2.5, size * 0.3);
  c.strokeStyle = "rgba(10,9,8,0.82)";
  c.strokeText(text, x, y);
  c.fillStyle = "#f8f4ea";
  c.fillText(text, x, y);
  c.globalAlpha = 1;
}
function drawSmoke(c, x, y, s, k) {
  const t = motion.on ? motion.now / 1000 : 0;
  for (let j = 0; j < 3; j++) {
    const ph = (t * 0.35 + j / 3 + k * 0.37) % 1;
    c.fillStyle = `rgba(214,214,210,${0.45 * (1 - ph)})`;
    c.beginPath(); c.arc(x + s * (0.4 + ph * 1.3), y - s * (0.4 + ph * 2.2), s * (0.25 + ph * 0.55), 0, Math.PI * 2); c.fill();
  }
}
function drawAnchor(c, x, y, s) {
  giDraw(c, "lorc/anchor", x, y, s * 1.2, "#d5ecf6", "#0e1a22", 2.6);
}
function drawLabel(c, text, x, y, size, weight = 700, alpha = 1, spacing = 0) {
  c.font = `${weight} ${size}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
  if ("letterSpacing" in c) c.letterSpacing = `${spacing}px`;
  c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round";
  c.globalAlpha = alpha;
  c.lineWidth = Math.max(3, size * 0.28);
  c.strokeStyle = "rgba(12,10,8,0.8)";
  c.strokeText(text, x, y);
  c.fillStyle = "#fbf6ea";
  c.fillText(text, x, y);
  c.globalAlpha = 1;
  if ("letterSpacing" in c) c.letterSpacing = "0px";
}

const econCache = { version: -1, data: [] };
let mapVersion = 0;
function bumpMap() { mapVersion++; }
function economies() {
  if (!game) return [];
  const key = game.__display ? `d${game.ver}` : mapVersion;
  if (econCache.version !== key) {
    econCache.data = game.nations.map(n => computeEconomy(world, game, n.id));
    econCache.version = key;
  }
  return econCache.data;
}

function drawNationLabels(c, cs) {
  const sh = buildShapes();
  if (view.zoom > 3.2) return;
  const fade = view.zoom > 1.7 ? 0.24 : 0.42;
  // big countries first; a label that would sit on top of another one is left out
  const placed = [];
  const items = sh.labels.map(l => {
    const n = game.nations[l.nid];
    const minor = n.minor;
    const text = (minor ? n.name.replace(/^(Free City|Principality) of /, "") : n.name).toUpperCase();
    const size = minor ? clamp(Math.sqrt(l.count) * cs * 0.12, 11, 26) : clamp(Math.sqrt(l.count) * cs * 0.16, 13, 72);
    return { l, text, size, minor, y: l.y * cs - (minor ? Math.max(cs * 1.6, 22) : cs * 1.8) };
  }).sort((a, b) => b.size - a.size);
  for (const it of items) {
    c.font = `800 ${it.size}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
    const wdt = c.measureText(it.text).width + it.text.length * it.size * 0.14;
    const box = { x0: it.l.x * cs - wdt / 2, x1: it.l.x * cs + wdt / 2, y0: it.y - it.size * 0.55, y1: it.y + it.size * 0.55 };
    if (placed.some(p => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
    placed.push(box);
    drawLabel(c, it.text, it.l.x * cs, it.y, it.size, 800, it.minor ? Math.min(0.85, fade + 0.3) : fade, it.size * 0.14);
  }
}

function drawCities(c, cs) {
  const econs = economies();
  const labelSize = clamp(cs * 0.75, 11, 16);
  const near = cs >= 24;
  const placed = [];
  const fits = box => { if (placed.some(p => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) return false; placed.push(box); return true; };
  const list = [];
  for (const n of game.nations) for (const r of econs[n.id].regions) list.push({ city: r.city, pop: r.pop, r, color: NATION_COLORS[n.id], occBy: -1 });
  for (const city of game.cities) if (game.occ[city.cell] >= 0) list.push({ city, pop: 0.5, r: null, color: NATION_COLORS[city.owner], occBy: game.occ[city.cell] });
  list.sort((a, b) => (b.city.capital ? 1 : 0) - (a.city.capital ? 1 : 0) || b.pop - a.pop);
  for (const it of list) {
    const { city, pop, r } = it;
    const [x, y] = cellCenter(city.cell, cs);
    const rad = near ? clamp(cs * 0.09, 2.6, 4) : clamp(1.9 + Math.sqrt(pop) * 0.75, 2.4, 5.2);
    // industry: smoke rising from the town's factories
    if (r && cs >= 20) {
      const n = r.ind.filter(k => k.kind !== "smelter" && ["secondary"].includes(INDUSTRIES[k.kind].sector)).reduce((s, k) => s + k.lvl, 0);
      const u = (0.24 + 0.21 * Math.sqrt(pop)) * cs;
      for (let k = 0; k < Math.min(4, Math.ceil(n / 3)); k++) {
        const a = hash2(city.id, k, 41) * Math.PI * 2, d = u * (0.35 + 0.4 * hash2(city.id, k, 42));
        drawSmoke(c, x + Math.cos(a) * d, y + Math.sin(a) * d, clamp(cs * 0.12, 3, 9), k + city.id);
      }
    }
    const markerA = GLMAP.ok ? 1 - smooth01(110, 200, cs) : 1;
    if (markerA > 0.02) drawTownMarker(c, x, y, rad, it.color, city.capital, markerA);
    if (it.occBy >= 0) {
      c.strokeStyle = NATION_COLORS[it.occBy]; c.lineWidth = 2.2; c.setLineDash([3, 3]);
      c.beginPath(); c.arc(x, y, rad + 5, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
    if (city.port && cs >= 14) drawAnchor(c, x - rad - clamp(cs * 0.3, 6, 12), y + rad + 2, clamp(cs * 0.45, 7, 14));
    drawPortMarks(c, cs, city, x, y, rad);
    if (r && r.foodRatio < ECON.famineLine) {
      c.fillStyle = "#ef7c68"; c.strokeStyle = "#1a0d0a"; c.lineWidth = 1;
      c.beginPath(); c.arc(x - rad - 4, y - rad - 3, 3.2, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    if (ui.selectedCity === city.id) {
      c.strokeStyle = "#dcb85e"; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, rad + 6, 0, Math.PI * 2); c.stroke();
    }
    // name to the upper right, as on an atlas; small towns give way when crowded
    const impF = clamp(0.86 + (city.imp || 20) / 220, 0.86, 1.3);
    const size = labelSize * (city.capital ? Math.max(1.12, impF) : impF);
    const text = city.capital ? city.name.toUpperCase() : city.name;
    const weight = city.capital ? 700 : (city.imp || 0) >= 45 ? 600 : 500;
    c.font = `${weight} ${size}px "IBM Plex Sans", system-ui, sans-serif`;
    const tw = c.measureText(text).width + (city.capital ? text.length * 0.8 : 0);
    const lx = x + rad + 4, ly = y + size * 0.15;
    const box = { x0: lx - 2, x1: lx + tw + 2, y0: ly - size * 0.6, y1: ly + size * 0.6 };
    if (!fits(box) && !city.capital && !(ui.selectedCity === city.id)) continue;
    if ("letterSpacing" in c) c.letterSpacing = city.capital ? "0.8px" : "0px";
    drawPlaceLabel(c, text, lx, ly, size, weight);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    drawCityMarks(c, city, lx, ly, tw, size);
  }
}
function drawToolPreview(c, cs) {
  if (ui.tool === "road" && ui.roadFrom) {
    const from = game.cities.find(x => x.id === ui.roadFrom);
    if (from) {
      const [x, y] = cellCenter(from.cell, cs);
      c.strokeStyle = "#dcb85e"; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, cs * 1.1, 0, Math.PI * 2); c.stroke();
    }
  }
  const q = ui.pending || ui.hoverQuote;
  if (!q) return;
  if (q.kind === "road" && q.path) {
    c.setLineDash([cs * 0.4, cs * 0.25]);
    c.strokeStyle = q.ok === false ? "#ef7c68" : "#dcb85e";
    c.lineWidth = Math.max(2.4, cs * 0.24);
    c.lineCap = "round";
    c.beginPath();
    q.path.forEach((cell, k) => { const [x, y] = cellCenter(cell, cs); k ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.stroke();
    c.setLineDash([]);
  }
  if (q.kind === "town" && q.site !== undefined) {
    if (q.claim) {
      c.fillStyle = "rgba(220,184,94,0.34)";
      q.claim.forEach(i => c.fillRect(cellX(i) * cs, cellY(i) * cs, cs + 0.5, cs + 0.5));
    }
    const [x, y] = cellCenter(q.site, cs);
    drawTownMarker(c, x, y, 4, q.ok ? "#dcb85e" : "#ef7c68", false, 0.9);
  }
  if (q.kind === "irrigation" && q.cells) {
    c.fillStyle = "rgba(80,150,210,0.38)";
    q.cells.forEach(i => c.fillRect(cellX(i) * cs, cellY(i) * cs, cs + 0.5, cs + 0.5));
  }
}

function drawHover(c, cs) {
  if (ui.hoverCell < 0 || ui.phase === "draw") return;
  c.strokeStyle = "rgba(255,255,255,0.6)"; c.lineWidth = 1;
  c.strokeRect(cellX(ui.hoverCell) * cs + 0.5, cellY(ui.hoverCell) * cs + 0.5, cs - 1, cs - 1);
}

function drawPathLine(c, pts, cs) {
  if (pts.length < 2) return;
  c.strokeStyle = "#dcb85e"; c.lineWidth = 2.5; c.setLineDash([7, 5]);
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x * cs, y * cs) : c.moveTo(x * cs, y * cs)));
  c.stroke(); c.setLineDash([]);
}

function drawFoundingPreview(c, cs) {
  const p = ui.preview;
  if (!p) return;
  p.towns.forEach((cell, k) => { const [x, y] = cellCenter(cell, cs); drawTownMarker(c, x, y, 4, NATION_COLORS[PLAYER], k === 0); });
  const cells = ui.drawCells;
  const mx = cells.reduce((s, k) => s + cellX(k) + 0.5, 0) / cells.length;
  const my = cells.reduce((s, k) => s + cellY(k) + 0.5, 0) / cells.length;
  const size = clamp(Math.sqrt(cells.length) * cs * 0.16, 13, 34);
  drawLabel(c, cleanName(ui.name).toUpperCase(), mx * cs, my * cs - cs * 1.8, size, 800, 0.75, size * 0.12);
}

/* ---------- Armies on the map: counters, routes, battles ---------- */
const UNIT_ICON_ORDER = ["arm", "art", "inf"];
function cssRgb(rgb) { return `rgb(${rgb.map(v => Math.round(v)).join(",")})`; }
function counterSize(cs) { return { w: clamp(cs * 1.26, 17, 40), h: clamp(cs * 0.8, 11, 25) }; }
function unitAnchor(cell, cs) {
  const [x, y] = cellCenter(cell, cs);
  return [x, game.cities.some(c => c.cell === cell) ? y - clamp(cs * 0.9, 12, 40) : y];
}
function stackStrength(list) { return list.reduce((s, d) => s + menFill(d) * equipFill(d), 0) / list.length; }

function selectedDivs() {
  if (!game) return [];
  const out = ui.sel.map(id => game.divisions.find(d => d.id === id && d.owner === PLAYER)).filter(Boolean);
  if (out.length !== ui.sel.length) ui.sel = out.map(d => d.id);
  return out;
}

function drawNatoSymbol(c, type, x, y, w, h) {
  c.strokeStyle = "#fbf6ea"; c.fillStyle = "#fbf6ea"; c.lineWidth = 1.2;
  c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  c.beginPath();
  if (type === "inf") { c.moveTo(x + 1, y + 1); c.lineTo(x + w - 1, y + h - 1); c.moveTo(x + w - 1, y + 1); c.lineTo(x + 1, y + h - 1); c.stroke(); }
  else if (type === "arm") { c.ellipse(x + w / 2, y + h / 2, w * 0.3, h * 0.26, 0, 0, Math.PI * 2); c.stroke(); }
  else { c.arc(x + w / 2, y + h / 2, Math.max(1.6, Math.min(w, h) * 0.2), 0, Math.PI * 2); c.fill(); }
}

function drawUnits(c, cs) {
  view.unitBoxes = [];
  if (!game.divisions.length) return;
  const index = new Map();
  for (const d of game.divisions) {
    const key = d._moving ? `m${d.id}` : `${d.cell}|${d.owner}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(d);
  }
  const sel = new Set(ui.sel);
  const { w, h } = counterSize(cs);
  const cells = [...index.keys()].sort((a, b) => (index.get(a)[0].owner === PLAYER) - (index.get(b)[0].owner === PLAYER));
  // zoomed out, the armies of nations at peace stay off the map so the land can be read
  const calm = cs < 16 && !ui.play;
  for (const key of cells) {
    const list = index.get(key);
    const owner = list[0].owner, cell = list[0].cell;
    if (calm && owner !== PLAYER && !enemiesOf(game, owner).length && !list.some(d => sel.has(d.id))) continue;
    const [ax, ay] = list[0]._pos ? [list[0]._pos[0] * cs, list[0]._pos[1] * cs] : unitAnchor(cell, cs);
    const x = Math.round(ax - w / 2), y = Math.round(ay - h / 2);
    const selected = list.some(d => sel.has(d.id));
    const fade = Math.min(...list.map(d => d._alpha ?? 1));
    c.globalAlpha = (list.every(d => d.training) ? 0.62 : 1) * fade;
    c.fillStyle = "rgba(8,6,4,0.55)";
    c.fillRect(x + 1.5, y + 2, w, h + 4);
    c.fillStyle = cssRgb(mix(hexToRgb(NATION_COLORS[owner]), [18, 14, 10], 0.3));
    c.fillRect(x, y, w, h);
    const type = UNIT_ICON_ORDER.find(t => list.some(d => d.type === t));
    const many = list.length > 1;
    const sw = Math.round(many ? w * 0.56 : w - 6), sh = Math.round(h * 0.62);
    drawNatoSymbol(c, type, x + (many ? 2 : 3), y + Math.round((h - sh) / 2), sw, sh);
    if (many) {
      c.fillStyle = "#fbf6ea";
      c.font = `600 ${Math.round(Math.max(8, h * 0.78))}px "IBM Plex Mono", monospace`;
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(String(list.length), x + 2 + sw + (w - sw - 2) / 2, y + h / 2 + 0.5);
    }
    const st = clamp(stackStrength(list), 0, 1), org = list.reduce((s, d) => s + d.org, 0) / list.length;
    c.fillStyle = "rgba(8,6,4,0.85)"; c.fillRect(x, y + h, w, 3);
    c.fillStyle = org > 0.6 ? "#6fc28c" : org > 0.3 ? "#e4b14d" : "#ef7c68";
    c.fillRect(x, y + h + 0.5, w * st, 2.5);
    c.lineWidth = 1; c.strokeStyle = "rgba(10,8,6,0.95)";
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h + 2);
    const rank = Math.max(...list.map(d => expRank(d.exp)));
    if (rank >= 2 && cs >= 12) drawChevrons(c, x + 2, y, w, rank);
    if (list.some(d => !d.supplied)) {
      c.fillStyle = "#ef7c68"; c.strokeStyle = "#1a0d0a";
      c.beginPath(); c.moveTo(x + w - 7, y - 3); c.lineTo(x + w + 3, y - 3); c.lineTo(x + w - 2, y + 6); c.closePath(); c.fill(); c.stroke();
    }
    c.globalAlpha = 1;
    if (selected && !ui.play) {
      c.strokeStyle = "#dcb85e"; c.lineWidth = 2;
      c.strokeRect(x - 1.5, y - 1.5, w + 3, h + 7);
      c.strokeStyle = "rgba(220,184,94,0.3)"; c.lineWidth = 4;
      c.strokeRect(x - 4, y - 4, w + 8, h + 12);
    }
    view.unitBoxes.push({ x, y, w, h: h + 3, cell, owner });
  }
}

function drawRoute(c, cs, cells, color, width, dash) {
  if (cells.length < 2) return;
  c.save();
  c.strokeStyle = color; c.fillStyle = color; c.lineWidth = width; c.lineCap = "round"; c.lineJoin = "round";
  c.setLineDash(dash);
  c.beginPath();
  cells.forEach((cell, k) => { const [x, y] = cellCenter(cell, cs); k ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.stroke();
  c.setLineDash([]);
  const n = cells.length;
  const [x1, y1] = cellCenter(cells[n - 2], cs), [x2, y2] = cellCenter(cells[n - 1], cs);
  const a = Math.atan2(y2 - y1, x2 - x1), s = Math.max(7, cs * 0.5);
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - s * Math.cos(a - 0.45), y2 - s * Math.sin(a - 0.45));
  c.lineTo(x2 - s * Math.cos(a + 0.45), y2 - s * Math.sin(a + 0.45));
  c.closePath(); c.fill();
  c.restore();
}

function drawUnitPaths(c, cs) {
  const sel = new Set(ui.sel);
  const seen = new Set();
  for (const d of game.divisions) {
    if (d.owner !== PLAYER || !d.path || !d.path.length) continue;
    const on = sel.has(d.id);
    const key = `${on}|${d.cell}>${d.path.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const color = on ? "#dcb85e" : d.auto ? "rgba(251,246,234,0.38)" : "rgba(251,246,234,0.7)";
    drawRoute(c, cs, [d.cell, ...d.path], color, on ? 2.6 : 1.6, [7, 5]);
  }
  // divisions bound for the sea: the voyage after the march
  for (const d of ui.play ? [] : game.divisions) {
    if (d.owner !== PLAYER || !d.voyage) continue;
    const key = `v${d.voyage.embark}>${d.voyage.to}|${sel.has(d.id)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cells = voyageSeaCells(d);
    if (cells && cells.length > 1) drawRoute(c, cs, cells, sel.has(d.id) ? "#9fd3ee" : "rgba(170,215,240,0.55)", sel.has(d.id) ? 2.6 : 1.6, [3, 5]);
  }
  const hp = ui.hoverPath;
  if (hp && hp.cells && !ui.play) {
    drawRoute(c, cs, hp.cells, "rgba(12,9,6,0.75)", 4.5, [4, 4]);
    drawRoute(c, cs, hp.cells, hp.attack ? "#ff8a5c" : "#f3dc9a", 2.4, [4, 4]);
  }
  if (hp && hp.seaCells && !ui.play) {
    drawRoute(c, cs, hp.seaCells, "rgba(4,12,20,0.75)", 4.5, [4, 4]);
    drawRoute(c, cs, hp.seaCells, hp.bad ? "#ff8a5c" : hp.attack ? "#ffb38a" : "#9fd3ee", 2.4, [4, 4]);
  }
}

function drawBurst(c, x, y, r, color) {
  c.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8, rr = k % 2 === 0 ? r : r * 0.45;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = color; c.strokeStyle = "rgba(10,6,4,0.9)"; c.lineWidth = 1.3;
  c.fill(); c.stroke();
}
function drawBattles(c, cs) {
  for (const b of game.battles || []) {
    const [x, y] = cellCenter(b.cell, cs);
    const mine = b.attacker === PLAYER || b.defender === PLAYER;
    const weWon = (b.attacker === PLAYER && b.won) || (b.defender === PLAYER && !b.won);
    drawBurst(c, x + cs * 0.62, y - cs * 0.62, Math.max(5, cs * 0.42), !mine ? "#f4e9d2" : weWon ? "#8fdcaa" : "#ff8a6e");
  }
}

function drawSelectionBox(c) {
  const b = ui.box;
  if (!b) return;
  const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1), w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
  c.fillStyle = "rgba(220,184,94,0.12)"; c.fillRect(x, y, w, h);
  c.strokeStyle = "#dcb85e"; c.lineWidth = 1.2; c.setLineDash([4, 3]); c.strokeRect(x + 0.5, y + 0.5, w, h); c.setLineDash([]);
}

/* ---------- Words for places and armies ---------- */
function placeName(cell) {
  const town = game.cities.find(c => c.cell === cell);
  if (town) return town.name;
  let best = null, bd = 5;
  for (const c of game.cities) { const d = dist(c.cell, cell); if (d < bd) { bd = d; best = c; } }
  const t = TERRAIN[world.terrain[cell]].name.toLowerCase();
  return best ? `${t} near ${best.name}` : `open ${t}`;
}
function pathSeasons(d) {
  if (!d.path || !d.path.length) return 0;
  let cost = 0, from = d.cell;
  for (const c of d.path) { cost += moveCost(world, game, d.type, from, c, d.owner); from = c; }
  return Math.max(1, Math.ceil(cost / DIV_TYPES[d.type].mp)) + (d.training || 0);
}
function natoSvg(type) {
  const inner = type === "inf" ? '<path d="M1 1L21 13M21 1L1 13"/>' : type === "arm" ? '<ellipse cx="11" cy="7" rx="6.5" ry="3.6"/>' : type === "art" ? '<circle cx="11" cy="7" r="2.4" fill="currentColor"/>' : '<path d="M3 9c3-5 6-6 8-6s5 1 8 6M11 3v8"/>';
  return `<svg class="nato" viewBox="0 0 22 14" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="0.65" y="0.65" width="20.7" height="12.7"/>${inner}</svg>`;
}
function equipText(d) {
  const t = DIV_TYPES[d.type];
  const part = k => `${fmtCount(d[k])}/${fmtCount(t[k])} ${k === "kits" ? "weapon sets" : EQUIP[k].unit}`;
  return ["kits", "guns", "tanks"].filter(k => t[k] > 0).map(part).join(" · ");
}
function divStatus(d) {
  if (d.training) return { text: `Training · ready in ${d.training} season${d.training > 1 ? "s" : ""}`, tone: "warn" };
  if (d.voyage) return voyageStatus(d);
  if (!d.supplied) return { text: "Out of supply · losing men and organization", tone: "bad" };
  if (d.path && d.path.length) { const s = pathSeasons(d); return { text: `Marching to ${placeName(d.path[d.path.length - 1])} · ${s} season${s > 1 ? "s" : ""}`, tone: "neutral" }; }
  if (d.org < 0.35) return { text: "Shaken · recovering organization", tone: "warn" };
  if (d.entrench >= 0.15) return { text: "Dug in", tone: "good" };
  return { text: "Holding", tone: "neutral" };
}

function moveRefusal(d, target) {
  if (!isLand(world, target)) return canShipTroops() ? "Armies can't walk on water: right-click a coast or a harbor across the sea to send them by ship." : "Armies can't cross the sea. With a harbor and freighters they could sail.";
  const c = controller(game, target);
  if (c >= 0 && c !== PLAYER && !atWar(game, PLAYER, c) && !alliesOf(game, PLAYER).includes(c)) return `That land is held by the ${nameOf(game, c)}, and you are not at war with them.`;
  return `The ${d.name} can't find a route there.`;
}

function orderMove(target, force) {
  const divs = selectedDivs();
  if (!divs.length || target < 0) return;
  const lead = divs.find(d => !d.training) || divs[0];
  if (lead.cell !== target && isLand(world, target)) {
    const land = findDivPath(world, game, lead, target);
    const sea = seaRouteChoice(divs, target, land, force);
    if (sea && sea.plan) {
      const plan = sea.plan;
      const sent = setVoyage(world, game, divs, plan);
      sent.forEach(d => { d.auto = false; });
      ui.hoverPath = null;
      if (!sent.length) { flashHint(`None of them can reach ${plan.embark.name} to board the ships.`); return; }
      flashHint(`${sent.length === 1 ? `The ${sent[0].name}` : `${sent.length} divisions`} will ${plan.landSeasons > 0 ? `march to ${plan.embark.name}, ` : ""}board ${plan.freighters} freighters and ${plan.kind === "port" ? `sail to ${plan.destCity.name}` : `land at ${placeNameW(world, game, plan.target)}`} · about ${plan.seasons} season${plan.seasons > 1 ? "s" : ""}.${sent.length < divs.length ? ` ${divs.length - sent.length} can't reach ${plan.embark.name} and stay.` : ""}${plan.enough ? "" : ` You have ${plan.have} free freighters: they wait in port until there are enough.`}`);
      return;
    }
    if (sea && sea.fail && (!land || force)) { ui.hoverPath = null; flashHint(sea.fail); return; }
  }
  let ok = 0, eta = 0, refusal = null;
  for (const d of divs) {
    if (d.cell === target) { d.path = []; d.auto = false; d.voyage = null; ok++; continue; }
    const p = findDivPath(world, game, d, target);
    if (!p) { refusal = moveRefusal(d, target); continue; }
    d.path = p.path; d.auto = false; d.voyage = null; ok++;
    eta = Math.max(eta, p.seasons + (d.training || 0));
  }
  ui.hoverPath = null;
  if (!ok) { flashHint(refusal); return; }
  const foes = game.divisions.filter(e => e.cell === target && atWar(game, PLAYER, e.owner)).length;
  const what = foes ? `attack ${placeName(target)} (${foes} enemy division${foes > 1 ? "s" : ""} there)` : eta ? `march to ${placeName(target)}` : "hold here";
  flashHint(`${ok} division${ok > 1 ? "s" : ""} ordered to ${what}${eta ? ` · about ${eta} season${eta > 1 ? "s" : ""}` : ""}. Orders are carried out when the season ends.`);
}

function hoverRoute(cell, force) {
  const divs = selectedDivs();
  if (!divs.length || cell < 0 || ui.tool !== "select") return null;
  const lead = divs.find(d => !d.training) || divs[0];
  if (lead.cell === cell) return { cells: null, text: "Right-click to halt here" };
  const p = isLand(world, cell) ? findDivPath(world, game, lead, cell) : null;
  const sea = seaRouteChoice(divs, cell, p, force);
  if (sea && sea.plan) return { cells: [lead.cell, ...sea.plan.landPath], seaCells: sea.plan.sea, attack: sea.plan.defenders > 0, bad: !sea.plan.enough || sea.plan.threats.some(x => x.hostile), text: seaHoverText(sea.plan, p) };
  if (!p) return { cells: null, text: sea && sea.fail ? sea.fail : moveRefusal(lead, cell), bad: true };
  const foes = game.divisions.filter(e => e.cell === cell && atWar(game, PLAYER, e.owner));
  const s = p.seasons + (lead.training || 0);
  return {
    cells: [lead.cell, ...p.path], attack: foes.length > 0,
    text: (foes.length ? `Right-click to attack ${foes.length} enemy division${foes.length > 1 ? "s" : ""} · ${s} season${s > 1 ? "s" : ""} to reach` : `Right-click to march here · ${s} season${s > 1 ? "s" : ""}`)
      + (!force && s >= 2 && canShipTroops() && beachSeaCell(world, cell) >= 0 ? " · Shift+right-click to go by sea" : "") + routeWeatherNote(lead, p.path),
  };
}

function unitsTooltipHtml(cell) {
  const here = game.divisions.filter(d => d.cell === cell);
  if (!here.length) return "";
  const owner = here[0].owner;
  const rows = here.map(d => `<span class="tt-line">${natoSvg(d.type)}${escapeHtml(d.name)} · ${pct(menFill(d) * equipFill(d))}${d.training ? " · training" : !d.supplied ? " · no supply" : ""}</span>`).join("");
  return `<span class="tt-line" style="color:${NATION_COLORS[owner]}">${owner === PLAYER ? "Your forces" : `The ${escapeHtml(nameOf(game, owner))}`}</span>${rows}`;
}

/* ---------- Army tab ---------- */
function gaugeHtml(label, frac, text) {
  const f = clamp(frac, 0, 1);
  const color = f > 0.7 ? "var(--good)" : f > 0.4 ? "var(--warn)" : "var(--bad)";
  return `<div class="gauge"><span>${label}</span><div class="bar"><span style="width:${f * 100}%;background:${color}"></span></div><span class="num">${text}</span></div>`;
}

function divisionCardHtml(d) {
  const t = DIV_TYPES[d.type];
  const st = divStatus(d);
  return `<div class="unit-card">
    <div class="unit-head">${natoSvg(d.type)}<strong>${escapeHtml(d.name)}</strong><span class="muted small">${escapeHtml(placeName(d.cell))}</span></div>
    ${gaugeHtml("Soldiers", d.men / t.men, `${fmtCount(d.men)}`)}
    ${gaugeHtml("Equipment", equipFill(d), pct(equipFill(d)))}
    ${gaugeHtml("Organization", d.org, pct(d.org))}
    <p class="muted small">${equipText(d)} · ${expLevel(d.exp).label.toLowerCase()} (${pct(d.exp)} experience)${d.battles ? ` · ${d.battles} battle${d.battles > 1 ? "s" : ""}${d.wins ? `, ${d.wins} won` : ""}` : ""}${d.entrench > 0.05 ? ` · dug in +${pct(d.entrench)}` : ""}</p>
    <p class="small tone-${st.tone}">${escapeHtml(st.text)} · ${d.auto ? "under the generals" : "under your orders"}</p>
  </div>`;
}

function selectionHtml() {
  const divs = selectedDivs();
  if (!divs.length) return "";
  const anyAuto = divs.some(d => d.auto), anyManual = divs.some(d => !d.auto);
  const cards = divs.length <= 2 ? divs.map(divisionCardHtml).join("")
    : `<table class="regions divlist"><tbody>${divs.map(d => { const st = divStatus(d); return `<tr data-action="select-div" data-id="${d.id}"><td>${natoSvg(d.type)}${escapeHtml(d.name)}</td><td class="num">${pct(menFill(d) * equipFill(d))}</td><td class="num">${pct(d.org)}</td><td class="small tone-${st.tone}">${escapeHtml(st.text.split(" · ")[0])}</td></tr>`; }).join("")}</tbody></table>
      <p class="muted small">Columns: strength, organization. Click one to look at it alone.</p>`;
  return `<div class="block selection">
    <div class="law-head"><span class="eyebrow">Selected · ${divs.length} division${divs.length > 1 ? "s" : ""}</span><button class="linkbtn" type="button" data-action="clear-sel">Clear</button></div>
    <p class="small">Right-click the map to march or attack. Shift-click or drag a box to select more.</p>
    ${cards}
    <div class="actions">
      <button class="btn" type="button" data-action="halt-sel">Halt <kbd>H</kbd></button>
      ${anyManual ? `<button class="btn" type="button" data-action="auto-sel">Hand to the generals <kbd>G</kbd></button>` : ""}
      ${anyAuto ? `<button class="btn" type="button" data-action="manual-sel">Take command</button>` : ""}
      ${ui.confirmDisband ? `<button class="btn danger" type="button" data-action="disband-sel">Disband ${divs.length}: confirm</button>` : `<button class="btn danger" type="button" data-action="disband-ask">Disband</button>`}
    </div>
    ${ui.confirmDisband ? `<p class="muted small">Disbanded soldiers go home; their equipment returns to the depots.</p>` : ""}
  </div>`;
}

function warRoomHtml() {
  const g = game;
  const wars = g.wars.filter(x => x.sideA.includes(PLAYER) || x.sideB.includes(PLAYER));
  if (!wars.length) return "";
  return wars.map(war => {
    const foes = (war.sideA.includes(PLAYER) ? war.sideB : war.sideA);
    const score = sideScore(war, PLAYER);
    let held = 0, lost = 0;
    for (let i = 0; i < N_CELLS; i++) {
      if (g.occ[i] === PLAYER && foes.includes(g.owner[i])) held++;
      if (g.owner[i] === PLAYER && foes.includes(g.occ[i])) lost++;
    }
    const theirs = g.divisions.filter(d => foes.includes(d.owner)).length;
    return `<div class="warbox"><strong>At war with ${foes.map(f => `the ${escapeHtml(nameOf(g, f))}`).join(" and ")}</strong>
      <div class="meter dual"><span style="left:50%;width:0"></span><i style="left:calc(${50 + score / 2}% - 1px)"></i></div>
      <span class="small">${score > 0 ? `You are ahead (${signed(score)})` : score < 0 ? `They are ahead (${signed(-score)})` : "Neither side is ahead"} · you hold ${held} of their cells, they hold ${lost} of yours · they field ${theirs} divisions</span></div>`;
  }).join("");
}

function staffHtml() {
  const n = game.nations[PLAYER];
  const mine = game.divisions.filter(d => d.owner === PLAYER);
  const auto = mine.filter(d => d.auto).length;
  const stance = (n.warPlan && n.warPlan.stance) || "defensive";
  const opt = (v, label, sub) => `<button type="button" data-action="stance" data-value="${v}" class="${stance === v ? "on" : ""}" aria-pressed="${stance === v}">${label}<small>${sub}</small></button>`;
  return `<div class="law">
      <div class="law-head"><strong>Generals' orders</strong><span class="law-effect">${auto} of ${mine.length} divisions under the generals</span></div>
      <div class="seg" style="grid-template-columns:repeat(2,minmax(0,1fr))">${opt("defensive", "Hold the line", "attack only at 2 : 1")}${opt("offensive", "Take the offensive", "push where odds favor")}</div>
      <p class="muted small">In peace the generals garrison the towns most at risk. In war they man the front and follow this order. Any division you move yourself stays under your orders until you hand it back.</p>
      <div class="actions"><button class="btn" type="button" data-action="all-auto" ${auto === mine.length ? "disabled" : ""}>Give all to the generals</button><button class="btn" type="button" data-action="all-manual" ${auto === 0 ? "disabled" : ""}>Take command of all</button></div>
    </div>`;
}

function factoriesHtml(plan, econ) {
  const n = game.nations[PLAYER];
  const short = shortfall(game, PLAYER);
  const fill = industryFill(econ);
  const limit = plan.limit === "none" ? "Arms production is switched off." : plan.limit === "factories"
    ? `Factories are the bottleneck: ${fmtMoney(plan.budget - plan.spend)} of the arms budget goes unspent. More raw materials on your road networks, or a higher arms law, would raise capacity.`
    : plan.limit === "priorities" ? "Every kind of equipment is switched off." : "Money is the bottleneck: the factories could make more with a bigger arms budget.";
  const rows = EQUIP_ORDER.map(k => {
    const p = (n.prod && n.prod[k]) || "normal";
    const seg = PRIORITY_ORDER.map(v => `<button type="button" data-action="prio" data-k="${k}" data-value="${v}" class="${p === v ? "on" : ""}" aria-pressed="${p === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("");
    const need = short[k];
    return `<tr><td><strong>${EQUIP[k].label}</strong><span class="sub">${EQUIP[k].note}</span></td><td class="num">${fmtCount(n.stock[k])}</td><td class="num ${need > n.stock[k] ? "tone-bad" : "muted"}">${need ? fmtCount(need) : "–"}</td><td class="num tone-good">+${fmtCount(plan.units[k])}</td></tr>
      <tr class="prio-row"><td colspan="4"><div class="seg mini" role="group" aria-label="${EQUIP[k].label} priority">${seg}</div></td></tr>`;
  }).join("");
  const full = stockValue(n) > 0.06 * econ.gdp && !enemiesOf(game, PLAYER).length;
  return `<div class="block">
    <span class="eyebrow">Factories and depots</span>
    <div class="rows">
      <div class="row"><span>Factory capacity<span class="sub">Raw materials reach ${pct(fill)} of what industry wants</span></span><span class="num">${Math.round(plan.ppUsed)} / ${Math.round(plan.pp)}</span></div>
      <div class="row"><span>Spent on equipment</span><span class="num">${fmtMoney(plan.spend)} a season</span></div>
    </div>
    <p class="muted small">${escapeHtml(limit)}</p>
    <table class="regions equip"><thead><tr><th>Equipment</th><th class="num">Depots</th><th class="num">Missing</th><th class="num">Season</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted small">"Missing" is what your divisions lack right now. Depots refill them at the start of every season.${full ? " Your depots are well stocked; a lower arms law would free money for other things." : ""}</p>
  </div>`;
}

function raiseHtml(econ) {
  const g = game, n = g.nations[PLAYER];
  const towns = g.cities.filter(c => c.owner === PLAYER && g.occ[c.cell] < 0);
  if (!towns.length) return "";
  if (!towns.some(c => c.id === ui.raiseCity)) ui.raiseCity = (towns.find(c => c.capital) || towns[0]).id;
  const opts = towns.map(c => `<option value="${c.id}" ${c.id === ui.raiseCity ? "selected" : ""}>${escapeHtml(c.name)}${c.capital ? " (capital)" : ""} · ${stackAt(g, c.cell, PLAYER)}/${MIL.maxStack}</option>`).join("");
  const card = type => {
    const q = raiseQuote(world, g, PLAYER, type, ui.raiseCity);
    const isAir = type === "air";
    const title = isAir ? "Air wing" : DIV_TYPES[type].label;
    const blurb = isAir ? "Contests the sky over every front. Air superiority strengthens your attacks and wears down the enemy." : DIV_TYPES[type].blurb;
    const facts = !q.ok ? `<span class="tone-bad">${escapeHtml(q.reason)}</span>`
      : isAir ? `${q.planes} planes from the depots · ${fmtMoney(q.cost)}`
      : `${fmtCount(q.men)} soldiers · ${fmtMoney(q.cost)} · equipped ${pct(q.fill)}`;
    return `<div class="raise"><div class="unit-head">${natoSvg(type)}<strong>${title}</strong></div><span class="muted small">${blurb}</span><span class="small">${facts}</span>
      <button class="btn" type="button" data-action="raise" data-type="${type}" ${q.ok ? "" : "disabled"}>Raise</button></div>`;
  };
  const free = manpowerFree(n, econ);
  return `<div class="block">
    <span class="eyebrow">Raise new forces</span>
    <label class="field small"><span class="muted">Muster at</span><select id="raise-city">${opts}</select></label>
    <div class="raise-grid">${card("inf")}${card("art")}${card("arm")}${card("air")}</div>
    <p class="muted small">${fmtCount(free)} more people can be called up under your conscription law. New divisions train for ${MIL.trainSeasons} seasons and fight at half strength until then. Each soldier costs $${MIL.upkeepK / 4}k a season in pay, food and fuel.</p>
  </div>`;
}

function divisionListHtml() {
  const mine = game.divisions.filter(d => d.owner === PLAYER);
  if (!mine.length) return `<div class="block"><span class="eyebrow">Divisions</span><p class="muted small">You have no divisions. Raise some below.</p></div>`;
  const sel = new Set(ui.sel);
  const rows = mine.map(d => {
    const st = divStatus(d);
    return `<tr data-action="select-div" data-id="${d.id}" class="${sel.has(d.id) ? "sel" : ""}"><td>${natoSvg(d.type)}${escapeHtml(d.name)}${d.auto ? "" : ' <span class="tone-warn small" title="Under your orders">●</span>'}</td><td class="small">${escapeHtml(placeName(d.cell))}</td><td class="num">${pct(menFill(d) * equipFill(d))}</td><td class="small xp ${expRank(d.exp) >= 3 ? "tone-good" : expRank(d.exp) === 0 ? "tone-warn" : "muted"}">${expLevel(d.exp).label}</td><td class="small tone-${st.tone}">${escapeHtml(st.text.split(" · ")[0])}</td></tr>`;
  }).join("");
  return `<div class="block"><span class="eyebrow">Divisions · ${mine.length}</span>
    <table class="regions divlist"><thead><tr><th>Division</th><th>Where</th><th class="num">Str.</th><th class="xp">Exp.</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted small">Click a row or a counter on the map to select it. <span class="tone-warn">●</span> marks divisions under your own orders.</p></div>`;
}

function airHtml() {
  const wings = game.airwings.filter(a => a.owner === PLAYER);
  if (!wings.length) return "";
  const rows = wings.map(a => {
    const base = game.cities.find(c => c.id === a.base);
    const btn = (v, l) => `<button type="button" data-action="air-mission" data-id="${a.id}" data-value="${v}" class="${a.mission === v ? "on" : ""}" aria-pressed="${a.mission === v}">${l}</button>`;
    return `<div class="air-row"><div class="unit-head">${natoSvg("air")}<strong>${escapeHtml(a.name)}</strong><span class="muted small">${base ? escapeHtml(base.name) : ""} · ${a.planes}/${AIR.planes} planes</span></div>
      <div class="seg mini" style="grid-template-columns:repeat(2,minmax(0,1fr))">${btn("support", "Fly over the front")}${btn("reserve", "Hold in reserve")}</div></div>`;
  }).join("");
  const enemies = enemiesOf(game, PLAYER);
  const balance = enemies.length ? enemies.map(e => { const b = airBalance(game, PLAYER, e); return `against the ${escapeHtml(nameOf(game, e))}: ${Math.abs(b) < 0.1 ? "contested" : b > 0 ? `yours (${pct(b)} margin)` : `theirs (${pct(-b)} margin)`}`; }).join("; ") : "";
  return `<div class="block"><span class="eyebrow">Air force</span>${rows}
    <p class="muted small">Wings over the front fight for the sky and lose planes doing it. Wings in reserve are safe but help no one.${balance ? ` Control of the air ${balance}.` : ""}</p></div>`;
}

function battleReportHtml(r, open = false) {
  const g = game;
  const weAtt = r.attacker === PLAYER || (r.attacker !== r.defender && sameSideAs(g, PLAYER, r.attacker) && r.defender !== PLAYER);
  const involved = r.attacker === PLAYER || r.defender === PLAYER;
  const weWon = weAtt ? r.won : !r.won;
  const where = r.town ? `${r.town} (${r.terrain.toLowerCase()})` : `the ${r.terrain.toLowerCase()} near ${placeName(r.cell).replace(/^.* near /, "")}`;
  const title = involved
    ? (weAtt ? (r.won ? `Victory at ${where}` : `Attack repulsed at ${where}`) : (r.won ? `Driven out at ${where}` : `Held at ${where}`))
    : `${r.won ? "The " + nameOf(g, r.attacker) + " won" : "The " + nameOf(g, r.defender) + " held"} at ${where}`;
  const lossA = r.losses[r.attacker] || { men: 0, tanks: 0 }, lossD = r.losses[r.defender] || { men: 0, tanks: 0 };
  const factorLines = r.lines.map(l => {
    const helpsAttacker = (l.side === "att") === (l.mult >= 1);
    const tone = !involved && !weAtt ? "neutral" : helpsAttacker === weAtt ? "good" : "bad";
    return `<li><span>${escapeHtml(l.label)}</span><span class="num tone-${tone}">${l.side === "att" ? "attack" : "defense"} ×${l.mult.toFixed(2)}</span></li>`;
  }).join("");
  return `<details class="battle ${weWon ? "won" : "lost"}" ${open ? "open" : ""}>
    <summary><strong>${escapeHtml(title)}</strong><span class="muted small"> · ${seasonLabel(r.turn ?? g.turn - 1)}</span></summary>
    <div class="battle-body">
      <p class="small"><span style="color:${NATION_COLORS[r.attacker]}">Attackers</span>: ${escapeHtml(r.attDivs.join(", "))}<br><span style="color:${NATION_COLORS[r.defender]}">Defenders</span>: ${escapeHtml(r.defDivs.join(", "))}</p>
      <p class="small">Strength ${fmtCount(r.attPower)} against ${fmtCount(r.defPower)} after all modifiers: ${r.ratio.toFixed(2)} to 1. Attackers need ${MIL.winRatio} to 1 to take the ground.</p>
      ${factorLines ? `<ul class="factors">${factorLines}</ul>` : ""}
      <p class="small">Losses: attackers ${fmtCount(lossA.men)} soldiers${lossA.tanks ? ` and ${fmtCount(lossA.tanks)} tanks` : ""}; defenders ${fmtCount(lossD.men)}${lossD.tanks ? ` and ${fmtCount(lossD.tanks)} tanks` : ""}.${r.retreated.length ? ` Retreated: ${escapeHtml(r.retreated.join(", "))}.` : ""}${r.destroyed.length ? ` <span class="tone-bad">Destroyed: ${escapeHtml(r.destroyed.join(", "))}.</span>` : ""}</p>
    </div></details>`;
}

function battlesHtml() {
  const mine = (game.battles || []).filter(r => r.attacker === PLAYER || r.defender === PLAYER);
  if (!mine.length) return "";
  return `<div class="block"><span class="eyebrow">Battles last season</span>${mine.slice(0, 8).map(r => battleReportHtml(r)).join("")}</div>`;
}

function armyTabHtml() {
  const g = game, n = g.nations[PLAYER];
  const econ = economies()[PLAYER];
  const fc = forecast(world, g, PLAYER, n.laws);
  const plan = fc.budget.arms;
  const mine = g.divisions.filter(d => d.owner === PLAYER);
  const c = { inf: 0, art: 0, arm: 0 };
  mine.forEach(d => { c[d.type]++; });
  const planes = g.airwings.filter(a => a.owner === PLAYER).reduce((s, a) => s + a.planes, 0);
  const men = n.mil ? n.mil.men : 0, cap = manpowerCap(n, econ);
  const overview = `<div class="stats-grid">
      <div class="stat-cell"><span class="k">Divisions</span><span class="v">${mine.length}</span><span class="muted small">${c.inf} infantry · ${c.art} artillery · ${c.arm} armored</span></div>
      <div class="stat-cell"><span class="k">Under arms</span><span class="v">${fmtCount(men)}</span><span class="muted small">of ${fmtCount(cap)} allowed${men > cap ? ' · <span class="tone-warn">over the limit</span>' : ""}</span></div>
      <div class="stat-cell"><span class="k">Aircraft</span><span class="v">${fmtCount(planes)}</span><span class="muted small">${fmtCount(n.stock.planes)} more in depots</span></div>
      <div class="stat-cell"><span class="k">Upkeep</span><span class="v">${fmtMoney(fc.budget.armyUpkeep)}</span><span class="muted small">a season, plus ${fmtMoney(plan.spend)} on equipment</span></div>
    </div>`;
  const laws = `<div class="block">
      <span class="eyebrow">Military laws · take effect when the season ends</span>
      ${lawHtml("army", "Conscription", ARMY_ORDER.map(k => ({ value: k, label: ARMY_LAWS[k].label.split(" ")[0], sub: `${+(ARMY_LAWS[k].share * 100).toFixed(2)}%` })))}
      ${lawHtml("arms", "Arms production", ARMS_ORDER.map(k => ({ value: k, label: k === "war" ? "War" : ARMS_LAWS[k].label, sub: `${+(ARMS_LAWS[k].share * 100).toFixed(1)}%` })))}
    </div>`;
  return selectionHtml() + warRoomHtml() + weatherBlockHtml() + overview + `<div class="block"><span class="eyebrow">General staff</span>${staffHtml()}</div>` + laws
    + factoriesHtml(plan, econ) + raiseHtml(econ) + divisionListHtml() + airHtml() + battlesHtml();
}

/* ---------- Army actions ---------- */
function playerRaise(type) {
  const q = raiseQuote(world, game, PLAYER, type, ui.raiseCity);
  if (!q.ok) { flashHint(q.reason); return; }
  const unit = raiseForce(game, PLAYER, q);
  const city = game.cities.find(c => c.id === q.cityId);
  addChronicle(game, `You raised the ${unit.name} at ${city.name} (${fmtMoney(q.cost)}).`, "neutral", PLAYER);
  if (type !== "air") { ui.sel = [unit.id]; ui.fleetSel = []; }
  bumpMap();
}
function setSelAuto(auto) {
  for (const d of selectedDivs()) { d.auto = auto; if (auto) { d.path = []; d.voyage = null; } }
}
function haltSel() { for (const d of selectedDivs()) { d.path = []; d.auto = false; d.voyage = null; } }
function disbandSel() {
  const divs = selectedDivs();
  divs.forEach(d => disbandDivision(game, d));
  if (divs.length) addChronicle(game, `You disbanded ${divs.length === 1 ? `the ${divs[0].name}` : `${divs.length} divisions`}.`, "neutral", PLAYER);
  ui.sel = []; ui.confirmDisband = false;
  bumpMap();
}
function selectStackAt(cell, add) {
  const ids = game.divisions.filter(d => d.cell === cell && d.owner === PLAYER).map(d => d.id);
  if (!ids.length) return false;
  if (add) {
    const all = ids.every(id => ui.sel.includes(id));
    ui.sel = all ? ui.sel.filter(id => !ids.includes(id)) : [...new Set([...ui.sel, ...ids])];
  } else ui.sel = ids;
  ui.confirmDisband = false;
  ui.fleetSel = [];
  ui.tab = "army";
  return true;
}
function hitUnit(px, py) {
  const boxes = view.unitBoxes || [];
  for (let k = boxes.length - 1; k >= 0; k--) {
    const b = boxes[k];
    if (px >= b.x - 2 && px <= b.x + b.w + 2 && py >= b.y - 2 && py <= b.y + b.h + 2) return b;
  }
  return null;
}
function boxSelect(b, add) {
  const cs = view.cs;
  const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
  const ids = (view.unitBoxes || []).filter(u => u.owner === PLAYER && u.x + u.w / 2 >= x0 && u.x + u.w / 2 <= x1 && u.y + u.h / 2 >= y0 && u.y + u.h / 2 <= y1)
    .flatMap(u => game.divisions.filter(d => d.cell === u.cell && d.owner === PLAYER).map(d => d.id));
  void cs;
  ui.sel = add ? [...new Set([...ui.sel, ...ids])] : ids;
  ui.confirmDisband = false;
  if (ids.length) ui.fleetSel = [];
  if (ui.sel.length) ui.tab = "army";
}

function renderMap() {
  if (!view.vw || !view.overlay || !(GLMAP.ok ? terrainCache.seed !== null : terrainCache.tiles.size)) return;
  if (ui.play && game) {
    const real = game;
    game = ui.play.display;
    try { renderMapNow(); } finally { game = real; }
    return;
  }
  renderMapNow();
}
function renderMapNow() {
  const cs = view.cs, dpr = view.dpr;
  if (GLMAP.ok) updateLanduse();
  // Terrain and territories only change when the camera or the map does; hovering redraws just the top layers.
  const skey = `${view.ox.toFixed(2)}|${view.oy.toFixed(2)}|${cs.toFixed(3)}|${canvas.width}x${canvas.height}|${shapesKey()}|${terrainCache.seed}|${GLMAP.ok ? LANDUSE.key : ""}`;
  if (skey !== view.staticKey || view.staticMissing) {
    view.staticMissing = renderStatic(cs, dpr);
    view.staticKey = skey;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(view.staticCanvas, 0, 0);
  const missing = view.staticMissing;

  ctx.setTransform(dpr, 0, 0, dpr, view.ox * dpr, view.oy * dpr);
  if (game) {
    drawResourceViewShade(ctx);
    drawSeaZones(ctx, cs);
    drawRoads(ctx, cs);
    if (motion.on || ui.play) drawTraffic(ctx, cs, motion.now);
    drawTradeFlows(ctx, cs, motion.now);
    if (motion.on) drawTownTraffic(ctx, cs, motion.now);
    drawFronts(ctx, cs);
    drawNationLabels(ctx, cs);
    drawKnownDeposits(ctx, cs);
    drawToolPreview(ctx, cs);
    drawCities(ctx, cs);
    drawSites(ctx, cs);
    drawWorks(ctx, cs);
    drawUnitPaths(ctx, cs);
    drawFleetRoutes(ctx, cs);
    drawBattles(ctx, cs);
    drawFleets(ctx, cs);
    drawUnits(ctx, cs);
    if (ui.play) drawPlaybackEffects(ctx, cs, ui.play);
    drawSelectionBox(ctx);
  } else {
    drawKnownDeposits(ctx, cs);
    drawFoundingPreview(ctx, cs);
  }
  if (drawingPath) drawPathLine(ctx, drawingPath, cs);
  drawHover(ctx, cs);
  if (missing) scheduleMapRender();
}

function renderStatic(cs, dpr) {
  const sc = view.staticCanvas.getContext("2d");
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.fillStyle = GLMAP.ok ? "#1b2f35" : "#0a2236";
  sc.fillRect(0, 0, canvas.width, canvas.height);
  updateLanduse();
  sc.imageSmoothingEnabled = true;
  sc.imageSmoothingQuality = "high";
  if (GLMAP.ok) glUpdateLand();
  const missing = GLMAP.ok ? glDrawTerrain(sc, "img") : drawTerrainTiles(sc, "img", 24);
  const o = view.overlay.getContext("2d");
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = "source-over";
  o.clearRect(0, 0, view.overlay.width, view.overlay.height);
  o.setTransform(dpr, 0, 0, dpr, view.ox * dpr, view.oy * dpr);
  if (!GLMAP.ok) drawRivers(o, cs);   // with the graphics card, rivers are part of the land

  drawTerritories(o, cs);
  const m = view.maskCanvas.getContext("2d");
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.clearRect(0, 0, view.maskCanvas.width, view.maskCanvas.height);
  m.imageSmoothingEnabled = true;
  if (GLMAP.ok) glDrawTerrain(m, "mask"); else drawTerrainTiles(m, "mask", 0);
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = "destination-in";
  o.drawImage(view.maskCanvas, 0, 0);
  o.globalCompositeOperation = "source-over";
  sc.drawImage(view.overlay, 0, 0);
  sc.setTransform(1, 0, 0, 1, 0, 0);
  // a soft vignette, like lamplight on a map table
  const g = sc.createRadialGradient(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.45, canvas.width / 2, canvas.height / 2, Math.hypot(canvas.width, canvas.height) * 0.6);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(4,8,10,0.2)");
  sc.fillStyle = g; sc.fillRect(0, 0, canvas.width, canvas.height);
  return missing;
}

let renderQueued = false;
function scheduleMapRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderMap(); });
}

