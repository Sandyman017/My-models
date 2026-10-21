/* =====================================================================
   14. Map painting
   ===================================================================== */
const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
const mapwrap = document.getElementById("mapwrap");
const view = { cs: 10, base: 10, zoom: 1, ox: 0, oy: 0, vw: 0, vh: 0, dpr: 1, overlay: null, maskCanvas: null, unitBoxes: [] };

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { t = clamp(t, 0, 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

/* ---------- Terrain painted in tiles, at more detail the closer you zoom ---------- */
const TILE = 8;                       // cells per tile side
const TERRAIN_LEVELS = [8, 16, 32];   // pixels per cell
const terrainCache = { seed: null, tiles: new Map(), order: [] };

/* ---------- The land as seen from orbit: relief, vegetation, water, farmland and cities ---------- */
const SAT = Object.fromEntries(Object.entries({
  deep: "#0a2236", ocean: "#0e3150", mid: "#154b6b", shelf: "#22677f", shoal: "#3f8c92", foam: "#d2e2da",
  sand: "#c9b98c", wetSand: "#8d8462",
  steppe: "#9c9763", dryGrass: "#7f874f", grass: "#647a42", lush: "#4a6735",
  forestDark: "#1b321d", forest: "#2a4628", forestLight: "#3d5d32",
  hillGrass: "#6e7548", hillSoil: "#7d6e50", scrub: "#56653b",
  rock: "#6b645b", rockLight: "#9a9184", rockDark: "#3f3a34", snow: "#eef1f3", snowShade: "#aab7c4",
  plowed: "#7b6648", hedge: "#3b4a2a", canal: "#3d7590",
  urban: "#9a948a", urbanDark: "#3c3a36", concrete: "#c2bcb0", roofRed: "#a0705a", park: "#56703f",
}).map(([k, v]) => [k, hexToRgb(v)]));
const FIELD_COLORS = ["#73883f", "#86904a", "#9a9656", "#678540", "#7f7a50", "#a29d62", "#5d7a3a", "#8e8a55"].map(hexToRgb);
const SUN = (() => { const v = [-0.62, -0.72, 0.7]; const l = Math.hypot(...v); return v.map(x => x / l); })();

function smooth01(a, b, v) { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function ridged(x, y, seed) { return 1 - Math.abs(2 * valueNoise(x, y, seed) - 1); }

/* What people have made of the land: farmland where they live, cities where they gather.
   Recomputed from the game state; terrain tiles whose land use changed are repainted gradually. */
const LANDUSE = { key: null, crop: new Float32Array(0), irr: new Float32Array(0), thin: new Float32Array(0), towns: [], pits: [] };
function updateLanduse() {
  if (ui.play) return;
  const key = game ? `${mapVersion}|${game.turn}|${game.cities.length}` : "none";
  if (LANDUSE.key === key && LANDUSE.crop.length === N_CELLS) return;
  LANDUSE.key = key;
  LANDUSE.crop = new Float32Array(N_CELLS);
  LANDUSE.irr = new Float32Array(N_CELLS);
  LANDUSE.thin = new Float32Array(N_CELLS);
  LANDUSE.towns = [];
  LANDUSE.pits = [];
  if (!game) return;
  // logged forest thins out; clear-cut land is open ground
  if (game.forest) for (let i = 0; i < N_CELLS; i++) if (world.terrain[i] === T.FOREST) LANDUSE.thin[i] = clamp(1 - game.forest[i], 0, 1);
  for (const c of game.cleared || []) LANDUSE.thin[c] = 1;
  // mines leave open pits that widen as they dig; oil fields leave pads and tracks
  for (const s of game.sites || []) {
    const def = SITE_KINDS[s.kind];
    if (!def.res) continue;
    const dug = world.depTotal[s.cell] > 0 ? 1 - game.depLeft[s.cell] / world.depTotal[s.cell] : 1;
    const r = (s.kind === "oilfield" ? 0.24 : 0.34) + 0.07 * s.level + (s.kind === "oilfield" ? 0 : 0.25 * dug);
    LANDUSE.pits.push({ id: s.id, x: cellX(s.cell) + 0.5 + 0.18 * (hash2(s.cell, 3, world.seed) - 0.5), y: cellY(s.cell) + 0.5 + 0.18 * (hash2(s.cell, 4, world.seed) - 0.5), r, oil: s.kind === "oilfield", coal: s.kind === "coalmine" });
  }
  for (let i = 0; i < N_CELLS; i++) {
    const t = world.terrain[i];
    if (t === T.SEA || t === T.MOUNTAIN) continue;
    const p = game.pop[i] || 0;
    const owned = game.owner[i] >= 0;
    let c = t === T.PLAINS ? smooth01(0.06, 0.5, p) : t === T.HILLS ? 0.7 * smooth01(0.06, 0.4, p) : 0.55 * smooth01(0.1, 0.6, p);
    if (!owned) c *= 0.35;
    LANDUSE.crop[i] = c;
    LANDUSE.irr[i] = game.irrigated[i] ? 1 : 0;
  }
  const econs = economies();
  for (const city of game.cities) {
    const r = econs[city.owner] && econs[city.owner].regions.find(x => x.city.id === city.id);
    const pop = r ? r.pop : 0.5;
    const ind = r ? r.ind.filter(k => k.kind !== "smelter" && INDUSTRIES[k.kind] && INDUSTRIES[k.kind].sector === "secondary").reduce((s, k) => s + k.lvl, 0) : 0;
    const lv = k => (r ? r.ind.filter(x => x.kind === k).reduce((s, x) => s + (x.lvl || 0), 0) : 0);
    const fo = activeFocus(game, city);
    LANDUSE.towns.push({ id: city.id, x: cellX(city.cell) + 0.5, y: cellY(city.cell) + 0.5, r: 0.24 + 0.21 * Math.sqrt(pop), cap: !!city.capital, pop, ind: ind + (fo === "industry" ? 1.5 : 0),
      owner: city.owner, port: !!city.port, era: game.era || 0, focus: fo,
      heavy: lv("heavy") + 0.5 * lv("smelter"), chem: lv("chemical"), power: lv("power_coal") + lv("power_gas"), nuclear: lv("power_nuclear"),
      light: lv("light") + lv("foodproc") + lv("electronics") + (fo === "industry" ? 1.5 : 0), office: lv("business") + lv("broadcast") + (fo === "market" || fo === "seat" ? 1 : 0) + (fo === "port" ? 0.5 : 0),
      campus: lv("university") + lv("techpark") + (fo === "learning" ? 2 : 0),
      resort: lv("resort") + (fo === "resort" ? 2 : 0), fishing: lv("fishing") });
  }
}
/* ---------- Photo textures for the ground ----------
   Real photographs of rock, meadow, dry ground, forest floor, sand and snow (public domain, CC0: Nobiax/yughues and
   rubberduck, prepared by CryHam for the Stunt Rally project), flattened so they tile without seams. The painter keeps
   its own colours for the land and lets the photos add what a satellite would see up close: crags and gullies in the
   rock, tree crowns and their shadows, grass and bare patches. The photos are stored at the end of this script
   (section 21). Until they load, or if they ever fail to, the land is painted by code alone. */
const TEX = { ready: false, version: 0, maps: {}, on: true };
const TEX_USE = {
  grass:  { period: 2.6, s: 0.75 },
  dry:    { period: 2.6, s: 0.75 },
  hill:   { period: 2.4, s: 0.75 },
  forest: { period: 1.5, s: 1.0 },
  rock:   { period: 2.8, s: 0.95 },
  snow:   { period: 2.8, s: 0.8 },
  sand:   { period: 1.1, s: 0.75 },
};
function texMips(im) {
  const n = im.width;
  const c = document.createElement("canvas"); c.width = n; c.height = n;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, n, n).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < n * n; i++) { sum[0] += d[i * 4]; sum[1] += d[i * 4 + 1]; sum[2] += d[i * 4 + 2]; }
  const mean = sum.map(v => Math.max(1, v / (n * n)));
  const inv = mean.map(v => 1 / v);                // a texel divided by the photo's average: 1 = "as the painter chose"
  // kept as bytes (small and quick to read), halved again and again for the farther zoom levels
  let size = n, rgb = new Uint8Array(n * n * 3);
  for (let i = 0; i < n * n; i++) { rgb[i * 3] = d[i * 4]; rgb[i * 3 + 1] = d[i * 4 + 1]; rgb[i * 3 + 2] = d[i * 4 + 2]; }
  const mips = [{ size, rgb }];
  while (size > 8) {
    const s2 = size >> 1, a = rgb, b = new Uint8Array(s2 * s2 * 3);
    for (let y = 0; y < s2; y++) for (let x = 0; x < s2; x++) for (let ch = 0; ch < 3; ch++) {
      const i0 = ((2 * y) * size + 2 * x) * 3 + ch, i1 = ((2 * y + 1) * size + 2 * x) * 3 + ch;
      b[(y * s2 + x) * 3 + ch] = (a[i0] + a[i0 + 3] + a[i1] + a[i1 + 3] + 2) >> 2;
    }
    mips.push({ size: s2, rgb: b });
    size = s2; rgb = b;
  }
  // brightness alone (as a ratio, in hundredths), for the relief the photo adds: crags in rock, crowns in a forest
  for (const M of mips) {
    const nn = M.size * M.size, l = new Uint8Array(nn);
    for (let i = 0; i < nn; i++) l[i] = Math.min(255, Math.round(100 * (M.rgb[i * 3] * inv[0] * 0.3 + M.rgb[i * 3 + 1] * inv[1] * 0.59 + M.rgb[i * 3 + 2] * inv[2] * 0.11)));
    M.lum = l;
  }
  return { mips, mean, inv };
}
/* Unpack the photos (a fraction of a second), then call `then`. The game waits for them so the map is painted
   once, with photos; if they are slow or fail, it starts anyway after a moment and paints by code alone. */
function loadTextures(then) {
  let called = false;
  const go = () => { if (called) return; called = true; if (then) then(); };
  if (typeof document === "undefined" || typeof Image === "undefined" || typeof artTextureData !== "function") { go(); return; }
  const src = artTextureData();
  const keys = Object.keys(src);
  let left = keys.length;
  const timer = setTimeout(go, 2500);
  const done = () => {
    if (--left > 0) return;
    clearTimeout(timer);
    TEX.ready = Object.keys(TEX_USE).every(k => TEX.maps[k]);
    if (TEX.ready) {
      TEX.version++;
      // if the game started without them, repaint what is on screen
      if (called) { view.staticKey = null; scheduleMapRender(); }
    }
    go();
  };
  for (const k of keys) {
    const im = new Image();
    im.onload = () => { try { TEX.maps[k] = texMips(im); } catch (e) { /* keep painting by code */ } done(); };
    im.onerror = done;
    im.src = src[k];
  }
}
/* Fast sampling. For each tile the detail level of every photo is chosen once (the zoom is the same across
   a tile); per pixel, a second copy turned by ~34° and scaled by 1.31 is mixed in by a slow noise, so the
   repeat of the photo never lines up. */
const TEX_ROT = { c: 0.8253, s: 0.5646, k: 1.31, lo: 0.28, hi: 0.72 };
/* Closer zoom levels show the photo in finer detail; the crags it adds are made lower in step, so the slopes
   (and so the light and shade) stay alike at every zoom and the big ridges and snowfields keep showing. */
const TEX_RELIEF_PPC = 8;
const TEX_BUMP = { rock: 0.026, hillShare: 0.4, forest: 0.02, crowns: 1.9 };
function texPick(T, period, ppc) {
  // the smallest level that still has at least one texel per pixel, so the photo is never blurred
  const want = period * ppc;                     // pixels across one repeat of the photo at this zoom
  let m = 0;
  while (m < T.mips.length - 1 && T.mips[m + 1].size >= want) m++;
  return T.mips[m];
}
function texTile(sub) {
  const out = {};
  for (const k of Object.keys(TEX_USE)) {
    const T = TEX.maps[k], P = TEX_USE[k].period;
    // the turned copy repeats 1.31 times as often, so it needs a level 1.31 times coarser
    const a = texPick(T, P, sub), b = texPick(T, P, sub / TEX_ROT.k);
    out[k] = { a, b, sa: a.size / P, sb: b.size / P, i0: T.inv[0], i1: T.inv[1], i2: T.inv[2] };
  }
  return out;
}
function texBil3(M, u, v, out, k) {
  const n = M.size, msk = n - 1, a = M.rgb;
  u -= 0.5; v -= 0.5;
  const u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0;
  const iu = u0 & msk, iv = v0 & msk, u1 = (iu + 1) & msk, v1 = (iv + 1) & msk;
  const i00 = (iv * n + iu) * 3, i10 = (iv * n + u1) * 3, i01 = (v1 * n + iu) * 3, i11 = (v1 * n + u1) * 3;
  const w00 = (1 - fu) * (1 - fv) * k, w10 = fu * (1 - fv) * k, w01 = (1 - fu) * fv * k, w11 = fu * fv * k;
  out[0] += a[i00] * w00 + a[i10] * w10 + a[i01] * w01 + a[i11] * w11;
  out[1] += a[i00 + 1] * w00 + a[i10 + 1] * w10 + a[i01 + 1] * w01 + a[i11 + 1] * w11;
  out[2] += a[i00 + 2] * w00 + a[i10 + 2] * w10 + a[i01 + 2] * w01 + a[i11 + 2] * w11;
}
function texBil1(M, u, v) {
  const n = M.size, msk = n - 1, a = M.lum;
  u -= 0.5; v -= 0.5;
  const u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0;
  const iu = u0 & msk, iv = v0 & msk, u1 = (iu + 1) & msk, v1 = (iv + 1) & msk;
  const top = a[iv * n + iu] + (a[iv * n + u1] - a[iv * n + iu]) * fu;
  const bot = a[v1 * n + iu] + (a[v1 * n + u1] - a[v1 * n + iu]) * fu;
  return top + (bot - top) * fv;
}
/* Colour detail at a point: x2, y2 are the turned coordinates, w the mix of the two copies, nrm keeps the contrast. */
function texRGB(t, x, y, x2, y2, w, nrm, out) {
  out[0] = 0; out[1] = 0; out[2] = 0;
  if (w < 0.999) texBil3(t.a, x * t.sa, y * t.sa, out, 1 - w);
  if (w > 0.001) texBil3(t.b, x2 * t.sb, y2 * t.sb, out, w);
  out[0] = 1 + (out[0] * t.i0 - 1) * nrm; out[1] = 1 + (out[1] * t.i1 - 1) * nrm; out[2] = 1 + (out[2] * t.i2 - 1) * nrm;
}
/* Brightness detail at a point, around 0: how much higher or lower the photo says the ground stands here. */
function texLumAt(t, x, y, x2, y2, w, nrm) {
  const a = w < 0.999 ? texBil1(t.a, x * t.sa, y * t.sa) * (1 - w) : 0;
  const b = w > 0.001 ? texBil1(t.b, x2 * t.sb, y2 * t.sb) * w : 0;
  return ((a + b) * 0.01 - 1) * nrm;
}
/* Colour times photo detail, at a given strength (0: ignore the photo, 1: full photo detail). */
function texApply(rgb, r, s) {
  return [rgb[0] * (1 + s * (r[0] - 1)), rgb[1] * (1 + s * (r[1] - 1)), rgb[2] * (1 + s * (r[2] - 1))];
}
const TEX_G = [1, 1, 1], TEX_D = [1, 1, 1], TEX_H = [1, 1, 1], TEX_F = [1, 1, 1], TEX_R = [1, 1, 1], TEX_S = [1, 1, 1], TEX_N = [1, 1, 1];

function tileSig(tx, ty) {
  let h = 7 + (TEX.ready && TEX.on ? TEX.version * 7919 : 0);
  if (!LANDUSE.crop.length) return h;
  const x0 = Math.max(0, tx * TILE - 1), x1 = Math.min(GRID_W - 1, tx * TILE + TILE), y0 = Math.max(0, ty * TILE - 1), y1 = Math.min(GRID_H - 1, ty * TILE + TILE);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(x, y);
    h = Math.imul(h ^ (Math.round(LANDUSE.crop[i] * 10) + 16 * LANDUSE.irr[i] + 64 * Math.round((LANDUSE.thin[i] || 0) * 6)), 16777619) >>> 0;
  }
  for (const p of LANDUSE.pits) {
    if (p.x + 1 < tx * TILE || p.x - 1 > (tx + 1) * TILE || p.y + 1 < ty * TILE || p.y - 1 > (ty + 1) * TILE) continue;
    h = Math.imul(h ^ (p.id * 977 + Math.round(p.r * 40)), 16777619) >>> 0;
  }
  for (const t of LANDUSE.towns) {
    if (t.x + 2 < tx * TILE || t.x - 2 > (tx + 1) * TILE || t.y + 2 < ty * TILE || t.y - 2 > (ty + 1) * TILE) continue;
    h = Math.imul(h ^ (t.id * 131 + Math.round(t.r * 20)), 16777619) >>> 0;
  }
  return h;
}

function bilinear(arr, x, y) {
  const fx = clamp(x - 0.5, 0, GRID_W - 1.001), fy = clamp(y - 0.5, 0, GRID_H - 1.001);
  const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
  const i = iy * GRID_W + ix;
  const a = arr[i], b = arr[i + 1] ?? a, c = arr[i + GRID_W] ?? a, d = arr[i + GRID_W + 1] ?? a;
  return a + (b - a) * ax + (c - a) * ay + (a - b - c + d) * ax * ay;
}

function terrainLevelFor(px) { return TERRAIN_LEVELS.find(l => l >= px * 0.85) || TERRAIN_LEVELS[TERRAIN_LEVELS.length - 1]; }

function paintTile(w, tx, ty, sub) {
  const cx0 = tx * TILE, cy0 = ty * TILE;
  const cw = Math.min(TILE, GRID_W - cx0), ch = Math.min(TILE, GRID_H - cy0);
  const W = cw * sub + 2, H = ch * sub + 2;             // one pixel of bleed on each side hides tile seams
  const EW = W + 2, EH = H + 2;                        // one more for slopes
  const seed = w.seed, L = w.seaLevel, hillL = w.hillLevel, mtnL = w.mountainLevel;
  const elev = new Float32Array(EW * EH), moist = new Float32Array(EW * EH), hgt = new Float32Array(EW * EH), rel = new Float32Array(EW * EH);
  const hgt0 = TEX.ready && TEX.on ? new Float32Array(EW * EH) : hgt;   // the land's shape before the photos' crags
  const fine = sub >= 16, finest = sub >= 32;
  const tex = TEX.ready && TEX.on;
  const TT = tex ? texTile(sub) : null;
  const reliefK = Math.min(1, TEX_RELIEF_PPC / sub);
  const tw = tex ? new Float32Array(EW * EH) : null;      // how much of the turned copy, per pixel
  for (let py = 0; py < EH; py++) for (let px = 0; px < EW; px++) {
    const x = cx0 + (px - 2 + 0.5) / sub, y = cy0 + (py - 2 + 0.5) / sub;
    const k = py * EW + px;
    const det = fbm(x * 1.9, y * 1.9, seed + 333, fine ? 4 : 3) - 0.5;
    const e = elevationAt(seed, x, y) + 0.03 * det;
    const up = clamp((e - hillL) / (mtnL - hillL), 0, 1.6);
    let r = 0;
    if (up > 0) {
      // rolling hills, turning into warped ridges (sharp crests, valleys between) toward the mountains
      const bump = fbm(x * 0.9, y * 0.9, seed + 640, 3);
      const wx = x + 0.9 * valueNoise(x * 0.45, y * 0.45, seed + 41), wy = y + 0.9 * valueNoise(x * 0.45 + 5.3, y * 0.45, seed + 42);
      const r1 = ridged(wx * 0.62, wy * 0.62, seed + 611), r2 = ridged(wx * 1.35, wy * 1.35, seed + 612);
      const r3 = fine ? ridged(wx * 3.1, wy * 3.1, seed + 613) : 0.5;
      const ridges = r1 * r1 * 0.6 + r2 * r2 * 0.28 * (0.3 + r1) + r3 * 0.1 * r2;
      r = bump + (ridges - bump) * smooth01(0.45, 1.05, up);
    }
    elev[k] = e;
    rel[k] = r;
    const mo = moistureAt(seed, x, y) + 0.07 * (valueNoise(x * 2.1, y * 2.1, seed + 88) - 0.5);
    moist[k] = mo;
    let hg = e > L ? e + Math.min(up, 1.3) * 0.085 * r + 0.007 * det : L;
    if (tex) hgt0[k] = hg;
    if (tex) {
      if (e > L) {
        const ww = smooth01(TEX_ROT.lo, TEX_ROT.hi, valueNoise(x * 0.23, y * 0.23, seed + 4401));
        tw[k] = ww;
        // the photos as relief: crags and gullies in the rock, crowns casting shadows in a forest
        const nrm = 1 / Math.sqrt((1 - ww) * (1 - ww) + ww * ww);
        const x2 = (x * TEX_ROT.c - y * TEX_ROT.s) * TEX_ROT.k + 17.3, y2 = (x * TEX_ROT.s + y * TEX_ROT.c) * TEX_ROT.k + 5.9;
        const mW = smooth01(mtnL - 0.02, mtnL + 0.03, e), hW = smooth01(hillL - 0.012, hillL + 0.03, e);
        const rocky = Math.max(mW, hW * TEX_BUMP.hillShare);
        if (rocky > 0.01) hg += TEX_BUMP.rock * reliefK * rocky * texLumAt(TT.rock, x, y, x2, y2, ww, nrm);
        const fo = smooth01(w.moistLevel - 0.035, w.moistLevel + 0.035, mo) * (1 - mW);
        if (fo > 0.01) hg += TEX_BUMP.forest * reliefK * fo * texLumAt(TT.forest, x, y, x2, y2, ww, nrm);
      }
    }
    hgt[k] = hg;
  }
  const img = new ImageData(W, H), mask = new ImageData(W, H);
  const Z = 7.5;                                    // relief exaggeration
  const towns = LANDUSE.towns.filter(t => t.x + 2 > cx0 && t.x - 2 < cx0 + cw && t.y + 2 > cy0 && t.y - 2 < cy0 + ch);
  const pits = LANDUSE.pits.filter(t => t.x + 1 > cx0 && t.x - 1 < cx0 + cw && t.y + 1 > cy0 && t.y - 1 < cy0 + ch);
  const hasUse = LANDUSE.crop.length === N_CELLS;
  const hasThin = LANDUSE.thin.length === N_CELLS;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const k = (py + 1) * EW + (px + 1);
    const e = elev[k], m = moist[k];
    const x = cx0 + (px - 1 + 0.5) / sub, y = cy0 + (py - 1 + 0.5) / sub;
    const gx = Math.floor(x), gy = Math.floor(y);
    const forcedSea = gx < 1 || gy < 1 || gx >= GRID_W - 1 || gy >= GRID_H - 1;
    const o = (py * W + px) * 4;
    let rgb;
    if (forcedSea || e <= L) {
      // water: colour by depth, sandy shallows, a faint line of surf at the shore
      const d = L - e;
      rgb = d < 0.012 ? mix(SAT.shoal, SAT.shelf, d / 0.012) : d < 0.05 ? mix(SAT.shelf, SAT.mid, (d - 0.012) / 0.038) : d < 0.14 ? mix(SAT.mid, SAT.ocean, (d - 0.05) / 0.09) : mix(SAT.ocean, SAT.deep, (d - 0.14) / 0.2);
      if (d < 0.01) rgb = mix(rgb, SAT.sand, (1 - d / 0.01) * 0.4);
      const rip = valueNoise(x * 9, y * 9, seed + 909) * 0.5 + valueNoise(x * 23, y * 23, seed + 910) * 0.5;
      const f = 0.965 + 0.07 * rip * clamp(1 - d * 3, 0.3, 1);
      rgb = [rgb[0] * f, rgb[1] * f, rgb[2] * f];
      if (!forcedSea && d < 0.0035 && (elev[k + 1] > L || elev[k - 1] > L || elev[k + EW] > L || elev[k - EW] > L)) rgb = mix(rgb, SAT.foam, finest ? 0.5 : 0.3);
    } else {
      let tW = 0, tN = 1, x2 = 0, y2 = 0;
      if (tex) {
        tW = tw[k]; tN = 1 / Math.sqrt((1 - tW) * (1 - tW) + tW * tW);
        x2 = (x * TEX_ROT.c - y * TEX_ROT.s) * TEX_ROT.k + 17.3; y2 = (x * TEX_ROT.s + y * TEX_ROT.c) * TEX_ROT.k + 5.9;
      }
      const dzx = (hgt[k + 1] - hgt[k - 1]) * sub * 0.5, dzy = (hgt[k + EW] - hgt[k - EW]) * sub * 0.5;
      // where rock and snow lie follows the land's shape; the photos' crags only catch the light
      const slope = tex ? Math.hypot((hgt0[k + 1] - hgt0[k - 1]) * sub * 0.5, (hgt0[k + EW] - hgt0[k - EW]) * sub * 0.5) * Z : Math.hypot(dzx, dzy) * Z;
      const hillW = smooth01(hillL - 0.012, hillL + 0.022, e), mtnW = smooth01(mtnL - 0.01, mtnL + 0.035, e);
      const r = rel[k];
      // ground cover by moisture: steppe → meadow → lush grass
      const wet = smooth01(0.24, 0.62, m);
      let g = wet < 0.5 ? mix(SAT.steppe, SAT.dryGrass, wet * 2) : wet < 0.8 ? mix(SAT.dryGrass, SAT.grass, (wet - 0.5) / 0.3) : mix(SAT.grass, SAT.lush, (wet - 0.8) / 0.2);
      const mott = valueNoise(x * 3.3, y * 3.3, seed + 120) - 0.5;
      g = mix(g, mott > 0 ? SAT.scrub : SAT.steppe, Math.abs(mott) * (tex ? 0.2 : 0.35));
      // how much of the open ground will still show once forest and bare rock are laid over it
      let groundSeen = 1;
      if (tex) {
        const fw0 = smooth01(w.moistLevel - 0.035, w.moistLevel + 0.035, m) * (1 - mtnW) * (1 - 0.35 * hillW);
        const rock0 = Math.max(mtnW * (0.65 + 0.35 * smooth01(0.1, 0.5, slope)), hillW * smooth01(0.55, 1.2, slope) * 0.6);
        const thinned = hasThin && fw0 > 0.01 && bilinear(LANDUSE.thin, x, y) > 0.02;
        groundSeen = thinned ? 1 : (1 - fw0) * (1 - rock0);
      }
      if (tex && groundSeen <= 0.02) { TEX_N[0] = 1; TEX_N[1] = 1; TEX_N[2] = 1; }
      else if (tex) {
        // the photos of meadow and of dry grass, blended by how wet the ground is
        if (wet > 0.98) texRGB(TT.grass, x, y, x2, y2, tW, tN, TEX_N);
        else if (wet < 0.02) texRGB(TT.dry, x, y, x2, y2, tW, tN, TEX_N);
        else {
          texRGB(TT.grass, x, y, x2, y2, tW, tN, TEX_G);
          texRGB(TT.dry, x, y, x2, y2, tW, tN, TEX_D);
          TEX_N[0] = TEX_D[0] + (TEX_G[0] - TEX_D[0]) * wet; TEX_N[1] = TEX_D[1] + (TEX_G[1] - TEX_D[1]) * wet; TEX_N[2] = TEX_D[2] + (TEX_G[2] - TEX_D[2]) * wet;
        }
        g = texApply(g, TEX_N, TEX_USE.grass.s);
      }
      let hillGround = mix(SAT.hillGrass, SAT.hillSoil, smooth01(0.2, 0.7, r + (1 - wet) * 0.3));
      if (tex && hillW > 0.01 && groundSeen > 0.02) { texRGB(TT.hill, x, y, x2, y2, tW, tN, TEX_H); hillGround = texApply(hillGround, TEX_H, TEX_USE.hill.s); }
      g = mix(g, hillGround, hillW * 0.85);
      // forest: a canopy of crowns, darker in its folds
      let fw = smooth01(w.moistLevel - 0.035, w.moistLevel + 0.035, m) * (1 - mtnW) * (1 - 0.35 * hillW);
      if (hasThin && fw > 0.01) {
        // logging: the canopy breaks into patches first, then gives way to stumps and open ground
        const th = bilinear(LANDUSE.thin, x, y);
        if (th > 0.02) {
          const patch = valueNoise(x * 2.6, y * 2.6, seed + 530);
          const gone = smooth01(patch - 0.15, patch + 0.15, th * 1.25);
          if (gone > 0.01) g = mix(g, mix(SAT.dryGrass, SAT.plowed, 0.35 + 0.3 * valueNoise(x * 6, y * 6, seed + 531)), gone * fw);
          fw *= 1 - gone;
        }
      }
      if (fw > 0.01) {
        let canopy;
        if (tex) {
          // crowns from the photo of a leafy forest floor, which from far above reads as treetops
          texRGB(TT.forest, x, y, x2, y2, tW, tN, TEX_F);
          const lum = TEX_F[0] * 0.3 + TEX_F[1] * 0.59 + TEX_F[2] * 0.11;
          canopy = clamp(0.5 + TEX_BUMP.crowns * (lum - 1) + 0.3 * (valueNoise(x * 1.4, y * 1.4, seed + 79) - 0.5), 0, 1);
        } else {
          const cf = sub / 2.4;
          const c1 = valueNoise(x * cf, y * cf, seed + 77), c2 = valueNoise(x * cf * 2.1, y * cf * 2.1, seed + 78);
          canopy = clamp(0.25 + 0.75 * c1 + 0.3 * (c2 - 0.5) + 0.25 * (valueNoise(x * 1.4, y * 1.4, seed + 79) - 0.5), 0, 1);
        }
        const fc = canopy < 0.5 ? mix(SAT.forestDark, SAT.forest, canopy * 2) : mix(SAT.forest, SAT.forestLight, (canopy - 0.5) * 2);
        g = mix(g, fc, fw);
      }
      // bare rock on mountains and on steep hillsides, lighter on the crests
      const rockAmt = Math.max(mtnW * (0.65 + 0.35 * smooth01(0.1, 0.5, slope)), hillW * smooth01(0.55, 1.2, slope) * 0.6);
      if (rockAmt > 0.01) {
        let rc = mix(mix(SAT.rockDark, SAT.rock, smooth01(0.1, 0.5, r)), SAT.rockLight, smooth01(0.55, 0.95, r));
        if (tex) { texRGB(TT.rock, x, y, x2, y2, tW, tN, TEX_R); rc = texApply(rc, TEX_R, TEX_USE.rock.s); }
        g = mix(g, rc, rockAmt);
      }
      // snow on the high peaks, thinner on the steepest faces
      const snow = smooth01(mtnL + 0.075, mtnL + 0.13, e + 0.05 * r) * smooth01(0.35, 0.7, r) * (1 - 0.6 * smooth01(1.0, 2.0, slope));
      // land use: farmland where people live, cities where they gather
      let farm = 0, urban = 0, core = 0;
      if (hasUse) {
        const c = bilinear(LANDUSE.crop, x, y);
        if (c > 0.05) farm = smooth01(0.3, 0.5, c + 0.32 * (valueNoise(x * 1.7, y * 1.7, seed + 501) - 0.5)) * (1 - mtnW) * (1 - 0.55 * hillW);
        for (const t of towns) {
          const dx = x - t.x, dy = y - t.y;
          if (Math.abs(dx) > t.r * 1.6 || Math.abs(dy) > t.r * 1.6) continue;
          const dd = Math.hypot(dx, dy) + t.r * 0.45 * (valueNoise(x * 3.2, y * 3.2, seed + 700 + t.id) - 0.5);
          urban = Math.max(urban, 1 - smooth01(t.r * 0.6, t.r * 1.15, dd));
          core = Math.max(core, 1 - smooth01(t.r * 0.1, t.r * 0.55, dd));
        }
      }
      if (farm > 0.01) {
        // fields: rectangular parcels in patches that each run their own way
        const ang = Math.floor(valueNoise(x * 0.8, y * 0.8, seed + 510) * 6) * 0.5;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const sc = 0.8 + 0.2 * Math.floor(valueNoise(x * 0.8, y * 0.8, seed + 511) * 3);
        const u = (x * ca - y * sa) * 7.5 * sc, v = (x * sa + y * ca) * 4.6 * sc;
        const iu = Math.floor(u), iv = Math.floor(v);
        const hsh = hash2(iu, iv, seed + 9);
        let fc = FIELD_COLORS[Math.floor(hsh * FIELD_COLORS.length)];
        if (hash2(iu, iv, seed + 10) < 0.12) fc = SAT.plowed;
        const irr = bilinear(LANDUSE.irr, x, y);
        if (irr > 0.3) fc = mix(fc, SAT.lush, 0.35 * irr);
        if (fine) {
          const fu = u - iu, fv = v - iv;
          const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
          if (edge < (finest ? 0.06 : 0.09)) fc = mix(fc, SAT.hedge, finest ? 0.4 : 0.22);
          if (finest && irr > 0.3 && Math.abs(fu - 0.5) < 0.04) fc = mix(fc, SAT.canal, 0.6);
        }
        if (tex) fc = texApply(fc, TEX_N, 0.35);
        g = mix(g, fc, farm * (sub >= 16 ? 0.9 : 0.6));
      }
      // shading from the sun in the north-west
      const nx = -dzx * Z, ny = -dzy * Z;
      const lam = (nx * SUN[0] + ny * SUN[1] + SUN[2]) / Math.hypot(nx, ny, 1);
      let shade = clamp(lam / SUN[2], 0.42, 1.45);
      shade = 1 + (shade - 1) * (0.55 + 0.45 * Math.max(hillW, mtnW));
      if (snow > 0.01) {
        let sn = tex ? mix(SAT.snow, SAT.snowShade, smooth01(1.0, 0.72, shade)) : shade < 0.85 ? SAT.snowShade : SAT.snow;
        if (tex) { texRGB(TT.snow, x, y, x2, y2, tW, tN, TEX_S); sn = texApply(sn, TEX_S, TEX_USE.snow.s); }
        g = mix(g, sn, snow * 0.95);
      }
      if (urban > 0.01) {
        const bs = 13;
        const bx = Math.floor(x * bs + 0.5 * valueNoise(x * 2, y * 2, seed + 720)), by = Math.floor(y * bs);
        const hb = hash2(bx, by, seed + 721);
        let uc = hb < 0.2 ? SAT.roofRed : hb < 0.6 ? SAT.urban : hb < 0.85 ? SAT.concrete : SAT.urbanDark;
        // the outskirts: houses among gardens
        if (core < 0.25 && hash2(bx, by, seed + 722) < 0.45 * (1 - core * 4)) uc = mix(SAT.park, g, 0.4);
        const fu = x * bs + 0.5 * valueNoise(x * 2, y * 2, seed + 720) - bx, fv = y * bs - by;
        if (fu < 0.18 || fv < 0.18) uc = mix(uc, SAT.urbanDark, fine ? 0.75 : 0.35);
        uc = mix(uc, SAT.concrete, core * 0.25);
        g = mix(g, uc, Math.min(1, urban * 1.15));
        shade = 1 + (shade - 1) * (1 - urban * 0.7);
      }
      // open pits: pale terraced rock with a dark floor; oil fields: a graded pad
      for (const p of pits) {
        const dd = Math.hypot(x - p.x, y - p.y) + p.r * 0.35 * (valueNoise(x * 5, y * 5, seed + 760 + p.id) - 0.5);
        if (dd > p.r * 1.25) continue;
        const a = 1 - smooth01(p.r * 0.8, p.r * 1.2, dd);
        let pc;
        if (p.oil) pc = mix(SAT.steppe, SAT.concrete, 0.5);
        else {
          const ring = Math.abs(Math.sin(dd / p.r * 9));
          pc = mix(p.coal ? SAT.rockDark : SAT.hillSoil, SAT.rockLight, 0.25 + 0.45 * ring * smooth01(0.2, 0.6, dd / p.r));
          if (dd < p.r * 0.3) pc = mix(pc, p.coal ? [30, 28, 26] : SAT.rockDark, 0.6);
        }
        g = mix(g, pc, a * 0.92);
        shade = 1 + (shade - 1) * (1 - a * 0.6);
      }
      // sand at the water's edge
      const ce = e - L;
      if (ce < 0.007 && slope < 1.2) {
        let sc = ce < 0.0025 ? SAT.wetSand : SAT.sand;
        if (tex) { texRGB(TT.sand, x, y, x2, y2, tW, tN, TEX_S); sc = texApply(sc, TEX_S, TEX_USE.sand.s); }
        g = mix(g, sc, (1 - ce / 0.007) * 0.75 * (1 - urban));
      }
      const grain = tex ? 0.99 + 0.02 * hash2(Math.floor(x * sub), Math.floor(y * sub), seed) : 0.975 + 0.05 * hash2(Math.floor(x * sub), Math.floor(y * sub), seed);
      const s = shade * grain;
      rgb = [g[0] * s, g[1] * s, g[2] * s];
      mask.data[o + 3] = 255;
    }
    img.data[o] = clamp(rgb[0], 0, 255);
    img.data[o + 1] = clamp(rgb[1], 0, 255);
    img.data[o + 2] = clamp(rgb[2], 0, 255);
    img.data[o + 3] = 255;
  }
  const toCanvas = data => { const c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").putImageData(data, 0, 0); return c; };
  return { img: toCanvas(img), mask: toCanvas(mask), cx0, cy0, cw, ch, sub };
}

function getTile(tx, ty, sub, create) {
  const key = `${sub}:${tx}:${ty}`;
  let t = terrainCache.tiles.get(key);
  const sig = tileSig(tx, ty);
  if ((!t || t.sig !== sig) && create) {
    const old = t;
    t = paintTile(world, tx, ty, sub);
    t.sig = sig;
    terrainCache.tiles.set(key, t);
    if (!old) terrainCache.order.push(key);
    while (terrainCache.order.length > 260) {
      const k = terrainCache.order.shift();
      if (!k.startsWith("8:")) terrainCache.tiles.delete(k); else terrainCache.order.push(k);
    }
  }
  if (t) t.stale = t.sig !== sig;
  return t || null;
}

/* New world: forget the old tiles, trace the rivers, and paint the whole map at the base level at once. */
function resetTerrain(w) {
  terrainCache.seed = w.seed; terrainCache.tiles.clear(); terrainCache.order = [];
  LANDUSE.key = null; LANDUSE.crop = new Float32Array(0); LANDUSE.irr = new Float32Array(0); LANDUSE.thin = new Float32Array(0); LANDUSE.towns = []; LANDUSE.pits = [];
  computeRivers(w);
  if (glInit()) { glSetWorld(w); return; }
  const nx = Math.ceil(GRID_W / TILE), ny = Math.ceil(GRID_H / TILE);
  for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) getTile(tx, ty, 8, true);
}

/* Draw terrain (or its land mask) into a context in device pixels. Missing or outdated tiles are painted
   within a time budget; what is already there shows until they are ready. */
function drawTerrainTiles(c, kind, budget) {
  const cs = view.cs, dpr = view.dpr;
  const nx = Math.ceil(GRID_W / TILE), ny = Math.ceil(GRID_H / TILE);
  const level = terrainLevelFor(cs * dpr);
  const t0 = performance.now();
  let missing = false;
  const edge = v => Math.round(v * dpr);
  const draw = t => {
    const x0 = edge(view.ox + t.cx0 * cs), x1 = edge(view.ox + (t.cx0 + t.cw) * cs);
    const y0 = edge(view.oy + t.cy0 * cs), y1 = edge(view.oy + (t.cy0 + t.ch) * cs);
    if (x1 < 0 || y1 < 0 || x0 > canvas.width || y0 > canvas.height) return;
    c.drawImage(kind === "mask" ? t.mask : t.img, 1, 1, t.cw * t.sub, t.ch * t.sub, x0, y0, x1 - x0, y1 - y0);
  };
  const time = () => budget && performance.now() - t0 < budget;
  for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
    const visible = !(view.ox + (tx + 1) * TILE * cs < 0 || view.oy + (ty + 1) * TILE * cs < 0 || view.ox + tx * TILE * cs > view.vw || view.oy + ty * TILE * cs > view.vh);
    if (!visible) continue;
    let t = getTile(tx, ty, level, level === 8 ? (!terrainCache.tiles.has(`8:${tx}:${ty}`) || time()) : time());
    if (!t || t.stale) missing = true;
    if (!t) t = (level === 32 && getTile(tx, ty, 16, false)) || getTile(tx, ty, 8, true);
    draw(t);
  }
  return missing;
}


