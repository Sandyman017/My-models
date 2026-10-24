/* =====================================================================
   14e. Villages on the map
   Every village and hamlet is drawn from what it really is: its people set its size, its look (from the engine,
   10w) sets how it is built, and its place sets which way it runs (along its river or road, its back to the sea,
   beside its mine). The looks come from satellite pictures Maz sent: villages among trees with red roofs in
   Bengal, a street village along a winding stream, walled yards with round huts in the Sahel, a packed village
   by a great river, and a modern village of curving closes. Each village is one texel in two textures on the
   6 km grid (where it is and how big; its look, direction and random number); the painter looks at the few
   squares around each pixel.
   ===================================================================== */
// square metres of village for each house (streets, gardens and yards included), by look
const VILLAGE_AREA = { cluster: 380, grove: 700, line: 450, compound: 650, hill: 280, harbor: 420, camp: 260, market: 420, scatter: 9000, modern: 600 };
const VDRAW = { key: null, list: [], byCell: new Map(), rivers: null, riversSeed: null };

/* The radius a place of `pop` million people covers, in cells (one house for every 4.5 people). */
function villageRadius(pop, plan) {
  const houses = Math.max(6, (pop || 0) * 1e6 / 4.5);
  const m = Math.sqrt(houses * (VILLAGE_AREA[plan] || 400) / Math.PI);
  return clamp(m, 45, 0.6 * VIL.grid * 50000) / 50000;
}
/* River points near each cell (for street villages along the water), worked out once a world. */
function villageRiverPoints() {
  if (VDRAW.riversSeed === world.seed && VDRAW.rivers) return VDRAW.rivers;
  const by = new Map();
  if (typeof RIVNET !== "undefined" && RIVNET.rivers && RIVNET.seed === world.seed) {
    for (const rv of RIVNET.rivers) {
      const V = rv.V || [];
      for (let i = 0; i < V.length - 1; i++) {
        const a = V[i], b = V[i + 1];
        const k = Math.floor(a.y) * GRID_W + Math.floor(a.x);
        if (!by.has(k)) by.set(k, []);
        by.get(k).push({ x: a.x, y: a.y, ang: Math.atan2(b.y - a.y, b.x - a.x) });
      }
    }
  }
  VDRAW.rivers = by; VDRAW.riversSeed = world.seed;
  return by;
}
function landAt(x, y) { return elevationAt(world.seed, x, y) + 0.03 * (fbm(x * 1.9, y * 1.9, world.seed + 333, 4) - 0.5) > world.seaLevel + 0.003; }
/* Where a named village stands inside its cell, and which way it runs. */
function villageSpot(v) {
  const G = VIL.grid, x0 = cellX(v.cell), y0 = cellY(v.cell);
  const h = k => hash2(v.cell, k, world.seed + 7400);
  let tx = x0 + 0.3 + 0.4 * h(1), ty = y0 + 0.3 + 0.4 * h(2), ang = h(3) * Math.PI;
  const plan = v.status === "ruin" ? (v.plan || "cluster") : v.plan;
  // its road: the line to a neighbouring cell's centre
  let roadAng = null;
  for (const [dx, dy] of DIRS8) {
    const X = x0 + dx, Y = y0 + dy;
    if (inBounds(X, Y) && game.roads.has(edgeKey(v.cell, idx(X, Y)))) { roadAng = Math.atan2(dy, dx); break; }
  }
  if (plan === "market" || (roadAng !== null && ["line", "modern"].includes(plan))) { tx = x0 + 0.5; ty = y0 + 0.5; if (roadAng !== null) ang = roadAng; }
  if (plan === "line") {
    const pts = villageRiverPoints().get(v.cell) || [];
    if (pts.length) { const p = pts[Math.floor(h(4) * pts.length)]; const off = 0.012; tx = p.x + Math.cos(p.ang + Math.PI / 2) * off; ty = p.y + Math.sin(p.ang + Math.PI / 2) * off; ang = p.ang; }
  }
  if (plan === "harbor") {
    // find the sea: walk out from the middle of the cell, stand just inland, back to the land
    let best = null;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2;
      for (let s = 0.05; s < 0.9; s += 0.03) {
        const x = x0 + 0.5 + Math.cos(a) * s, y = y0 + 0.5 + Math.sin(a) * s;
        if (!landAt(x, y)) { if (!best || s < best.s) best = { s, a }; break; }
      }
    }
    if (best) { const s = Math.max(0.03, best.s - 0.035); tx = x0 + 0.5 + Math.cos(best.a) * s; ty = y0 + 0.5 + Math.sin(best.a) * s; ang = best.a - Math.PI / 2; }
  }
  if (plan === "camp") {
    const pit = (LANDUSE.pits || []).filter(p => Math.abs(p.x - (x0 + 0.5)) < 1.6 && Math.abs(p.y - (y0 + 0.5)) < 1.6).sort((a, b) => Math.hypot(a.x - x0 - 0.5, a.y - y0 - 0.5) - Math.hypot(b.x - x0 - 0.5, b.y - y0 - 0.5))[0];
    if (pit) {
      const a = Math.atan2(pit.y - (y0 + 0.5), pit.x - (x0 + 0.5));
      const d = Math.hypot(pit.x - (x0 + 0.5), pit.y - (y0 + 0.5));
      const s = clamp(d - pit.r * 0.035 - 0.05, 0, 0.42);
      tx = x0 + 0.5 + Math.cos(a) * s; ty = y0 + 0.5 + Math.sin(a) * s; ang = a - Math.PI / 2;
    }
  }
  tx = clamp(tx, x0 + 0.02, x0 + 0.98); ty = clamp(ty, y0 + 0.02, y0 + 0.98);
  if (!landAt(tx, ty)) { tx = x0 + 0.5; ty = y0 + 0.5; }
  return { x: tx, y: ty, cx: Math.floor(tx / G), cy: Math.floor(ty / G), ang };
}
/* Every place to draw (named villages and hamlets), worked out again when the world changes. */
function villageDrawList() {
  if (!game || !world) return [];
  const key = `${world.seed}|${game.turn}|${(game.villages || []).length}|${game.cities.length}|${game.roads.size}|${(game.sites || []).length}|${mapVersion}`;
  if (VDRAW.key === key) return VDRAW.list;
  const list = [], taken = new Set();
  const sq = (cx, cy) => cy * 100000 + cx;
  for (const v of game.villages || []) {
    const s = villageSpot(v);
    const ruin = v.status === "ruin";
    const plan = v.plan || "cluster";
    const pop = ruin ? (v.peak || 0.001) * 0.7 : v.pop;
    const d = { named: true, v, x: s.x, y: s.y, cx: s.cx, cy: s.cy, ang: s.ang, plan, ruin, pop, r: villageRadius(pop, plan), cell: v.cell, seed: hash2(v.id || v.cell, 5, world.seed + 7303) };
    list.push(d);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) taken.add(sq(s.cx + dx, s.cy + dy));
  }
  for (let i = 0; i < N_CELLS; i++) {
    if (world.terrain[i] === T.SEA) continue;
    for (const hm of hamletsOf(world, game, i)) {
      if (taken.has(sq(hm.cx, hm.cy))) continue;
      list.push({ named: false, x: hm.x, y: hm.y, cx: hm.cx, cy: hm.cy, ang: hash2(hm.cx, hm.cy, world.seed + 7304) * Math.PI, plan: hm.plan, ruin: false, pop: hm.pop, r: villageRadius(hm.pop, hm.plan), cell: i, seed: hash2(hm.cx, hm.cy, world.seed + 7303) });
    }
  }
  VDRAW.byCell = new Map();
  for (const d of list) { if (!VDRAW.byCell.has(d.cell)) VDRAW.byCell.set(d.cell, []); VDRAW.byCell.get(d.cell).push(d); }
  VDRAW.key = key; VDRAW.list = list;
  return list;
}
/* The two village textures for the graphics card. Returns [VX, VY]. */
function glUploadVillages() {
  const gl = GLMAP.gl, G = VIL.grid;
  const VX = Math.ceil(GRID_W / G), VY = Math.ceil(GRID_H / G);
  const V = new Float32Array(VX * VY * 4), I = new Float32Array(VX * VY * 4);
  for (const d of villageDrawList()) {
    if (d.cx < 0 || d.cy < 0 || d.cx >= VX || d.cy >= VY) continue;
    const o = (d.cy * VX + d.cx) * 4;
    if (V[o + 3] > 0.5 && !d.named) continue;
    V[o] = d.x / G - d.cx; V[o + 1] = d.y / G - d.cy; V[o + 2] = d.r; V[o + 3] = 1;
    I[o] = VILLAGE_PLAN_ORDER.indexOf(d.plan) + (d.named ? 16 : 0) + (d.ruin ? 32 : 0);
    I[o + 1] = d.ang; I[o + 2] = Math.min(9.99, d.pop * 1000); I[o + 3] = d.seed;
  }
  glTex(3, GLMAP.tex.vill, VX, VY, gl.RGBA32F, gl.RGBA, gl.FLOAT, V);
  if (GLMAP.tex.vinfo) glTex(10, GLMAP.tex.vinfo, VX, VY, gl.RGBA32F, gl.RGBA, gl.FLOAT, I);
  return [VX, VY];
}

/* The village painter (GLSL), part of the land pass. Positions in metres in the village's own frame: x along its
   street, river or shore, y across (towards the sea for a fishing village, towards the pit for a mining camp). */
function villageGlsl() {
  return `
// ---------- villages: each drawn from its own look, size and direction ----------
vec2 gVSun = vec2(-0.62, -0.72);   // the sun's direction in the village being drawn
// a box from lo to hi (metres): 1 roof, -1 its shadow, 0 outside
float vBox(vec2 q, vec2 lo, vec2 hi, float h) {
  if (all(greaterThan(q, lo)) && all(lessThan(q, hi))) return 1.0;
  vec2 s = q + gVSun * h * 0.6;
  if (all(greaterThan(s, lo)) && all(lessThan(s, hi))) return -1.0;
  return 0.0;
}
float vRound(vec2 q, float r, float h) {
  if (length(q) < r) return 1.0;
  if (length(q + gVSun * h * 0.6) < r) return -1.0;
  return 0.0;
}
// one house in a plot of size s (metres): f is the position in the plot (0..1); w the share of the plot it fills
float vHouse(vec2 f, vec2 s, vec2 id, int sd, vec2 w, float h) {
  float j1 = hash2(int(id.x), int(id.y), sd), j2 = hash2(int(id.x), int(id.y), sd + 1);
  vec2 size = w * (0.78 + 0.3 * vec2(j1, j2));
  vec2 c0 = vec2(0.5) + (vec2(j2, j1) - 0.5) * (vec2(1.0) - size) * 0.8;
  return vBox(f * s, (c0 - size * 0.5) * s, (c0 + size * 0.5) * s, h);
}
// a tree crown (r metres) at the middle of a plot, with its shadow; 1 crown, -1 shadow
float vTree(vec2 f, vec2 s, vec2 id, int sd, float r) {
  vec2 c = vec2(0.3 + 0.4 * hash2(int(id.x), int(id.y), sd + 5), 0.3 + 0.4 * hash2(int(id.x), int(id.y), sd + 6)) * s;
  float rr = r * (0.7 + 0.6 * hash2(int(id.x), int(id.y), sd + 7));
  return vRound(f * s - c, rr, rr * 1.4);
}
vec3 vCrown(vec2 q, int sd) { return mix(vec3(0.10, 0.19, 0.09), vec3(0.20, 0.31, 0.14), vnoise(q / 3.0, sd + 9)) ; }
// the ragged edge of a village: 1 inside, 0 outside (d is the distance from the middle as a share of the radius)
float vEdge(float d, vec2 q, float R, int sd) {
  float n = 0.28 * (vnoise(q / (R * 0.45) + 3.0, sd + 11) - 0.5) + 0.12 * (vnoise(q / (R * 0.15), sd + 12) - 0.5);
  return 1.0 - sstep(0.82, 1.0, d + n);
}
// how much detail fits: 0 when a plot is under a pixel or two (the village is then its average colour), 1 when clear
float vDet(float plot, float mpp) { return sstep(1.2, 3.0, plot / mpp); }
vec3 vRoofWarm(float h) { return h < 0.4 ? vec3(0.71, 0.39, 0.27) : h < 0.7 ? vec3(0.63, 0.33, 0.24) : h < 0.88 ? vec3(0.76, 0.48, 0.33) : vec3(0.55, 0.53, 0.50); }
vec3 vRoofGrey(float h) { return h < 0.35 ? vec3(0.60, 0.60, 0.60) : h < 0.6 ? vec3(0.48, 0.47, 0.45) : h < 0.82 ? vec3(0.45, 0.36, 0.30) : vec3(0.66, 0.40, 0.30); }

// clustered village (a village packed by a great river): winding lanes, houses wall to wall near the middle, trees, a green and its church
vec4 vCluster(vec2 q, float R, int sd, float mpp, bool hill, bool ruin) {
  float d = length(q) / R;
  float edge = vEdge(d, q, R, sd);
  if (edge <= 0.0) return vec4(0.0);
  float P = hill ? 11.0 : 13.0;
  vec2 w = q + 22.0 * vec2(vnoise(q / 70.0, sd + 3) - 0.5, vnoise(q / 70.0 + 5.0, sd + 4) - 0.5);
  // a few lanes winding through, not a grid: each runs a crooked line across the village
  float laneD = min(abs(gnoise(w / 260.0, sd + 5)) * 260.0, abs(gnoise(w / 210.0 + 3.0, sd + 6)) * 210.0);
  float main = abs(q.y + 9.0 * sin(q.x / 85.0 + float(sd & 7)));
  vec3 ground = ruin ? vec3(0.42, 0.47, 0.30) : vec3(0.46, 0.45, 0.38);
  vec3 col = ground;
  float dens = (hill ? 0.97 : 0.88) * (1.0 - sstep(0.35, 1.0, d)) + 0.12;
  vec2 u = w / P, id = floor(u), f = u - id;
  float hh = hash2(int(id.x), int(id.y), sd + 20);
  float b = vHouse(f, vec2(P), id, sd + 21, vec2(0.8, 0.72), 6.0);
  if (hh < dens) {
    vec3 roof = hill ? mix(vRoofGrey(hash2(int(id.x), int(id.y), sd + 22)), vec3(0.62, 0.58, 0.52), 0.5) : vRoofGrey(hash2(int(id.x), int(id.y), sd + 22));
    if (ruin) { vec2 fp = f * P; float wall = b > 0.5 ? 1.0 - sstep(0.8, 1.6, min(min(fp.x, P - fp.x), min(fp.y, P - fp.y)) - P * 0.16) : 0.0; col = mix(col, vec3(0.36, 0.34, 0.31), wall * 0.9); }
    else col = b > 0.5 ? roof : b < -0.5 ? col * 0.62 : col;
  } else {
    float t = vTree(f, vec2(P), id, sd + 23, P * 0.38);
    if (hh < dens + (ruin ? 0.5 : 0.3)) col = t > 0.5 ? vCrown(q, sd) : t < -0.5 ? col * 0.6 : col;
  }
  if (!ruin) {
    col = mix(col, vec3(0.56, 0.54, 0.50), 1.0 - sstep(1.6, 2.8, laneD));
    col = mix(col, vec3(0.60, 0.58, 0.54), (1.0 - sstep(3.0, 4.4, main)) * (1.0 - sstep(0.85, 1.0, d)));
    // the green and the church in the middle (a tower and a keep on a hilltop, with a wall round it)
    float green = 1.0 - sstep(20.0, 23.0, length(q - vec2(-6.0, 4.0)));
    col = mix(col, vec3(0.38, 0.49, 0.27), green * (1.0 - sstep(3.0, 4.4, main)));
    float ch = vBox(q, vec2(8.0, -16.0), vec2(30.0, -6.0), 12.0);
    col = ch > 0.5 ? vec3(0.66, 0.63, 0.58) : ch < -0.5 ? col * 0.6 : col;
    if (hill) col = mix(col, vec3(0.50, 0.47, 0.42), (1.0 - sstep(1.5, 3.0, abs(d - 0.93) * R)) * 0.9);
  }
  vec3 avg = ruin ? vec3(0.44, 0.46, 0.34) : mix(vec3(0.50, 0.48, 0.44), vec3(0.24, 0.30, 0.18), 0.25);
  return vec4(mix(avg, col, vDet(P, mpp)), edge);
}
// a village among trees (Bengal): little groups of red-roofed houses under a thick canopy, gardens and fields between, paths
vec4 vGrove(vec2 q, float R, int sd, float mpp) {
  float d = length(q) / R;
  float edge = vEdge(d, q, R, sd);
  if (edge <= 0.0) return vec4(0.0);
  float blob = fbm(q / (R * 0.32) + float(sd & 15), sd + 30, 2);
  float open = vnoise(q / 140.0, sd + 31);
  vec3 canopy = mix(vec3(0.09, 0.18, 0.08), vec3(0.21, 0.33, 0.13), vnoise(q / 5.0, sd + 32) * 0.7 + 0.3 * vnoise(q / 1.6, sd + 33));
  vec3 col = canopy;
  if (open > 0.66) col = mix(vec3(0.36, 0.47, 0.25), vec3(0.45, 0.55, 0.30), vnoise(q / 30.0, sd + 34));
  float P = 17.0;
  vec2 wq = q + 7.0 * vec2(vnoise(q / 25.0, sd + 39) - 0.5, vnoise(q / 25.0 + 4.0, sd + 40) - 0.5);   // plots not in rows
  vec2 u = wq / P, id = floor(u), f = u - id;
  if (blob > 0.5) {
    float hh = hash2(int(id.x), int(id.y), sd + 35);
    float b = vHouse(f, vec2(P), id, sd + 36, vec2(0.5, 0.42), 5.0);
    vec3 yard = mix(vec3(0.50, 0.50, 0.36), vec3(0.58, 0.54, 0.42), vnoise(q / 8.0, sd + 41));
    float t = vTree(f, vec2(P), id, sd + 42, P * 0.34);
    vec3 c2 = hh < 0.6 ? (b > 0.5 ? vRoofWarm(hash2(int(id.x), int(id.y), sd + 37)) : b < -0.5 ? yard * 0.6 : t > 0.5 ? canopy : yard) : (t < -0.5 ? yard * 0.6 : t > 0.5 ? canopy : mix(yard, canopy, 0.5));
    col = mix(col, c2, sstep(0.5, 0.56, blob));
  }
  // footpaths wandering between the groups
  float path = abs(gnoise(q / 160.0, sd + 38));
  col = mix(col, vec3(0.72, 0.68, 0.56), (1.0 - sstep(0.010, 0.022, path)) * 0.85);
  // a pond here and there
  float pond = length(q - R * 0.4 * vec2(hash2(sd, 1, 40) - 0.5, hash2(sd, 2, 40) - 0.5)) - R * 0.09;
  col = mix(col, vec3(0.20, 0.30, 0.25), 1.0 - sstep(0.0, 3.0, pond));
  return vec4(mix(vec3(0.20, 0.27, 0.14), col, vDet(P, mpp)), edge);
}
// a street village (a winding stream with houses along both banks, branching out into rice fields)
vec4 vLine(vec2 q, float R, int sd, float mpp) {
  float L = R * 1.9, W = R * 0.36;
  float yc = 0.12 * R * sin(q.x / (R * 0.35) + float(sd & 7)) + 0.05 * R * sin(q.x / (R * 0.11));
  float ry = q.y - yc;
  float along = 1.0 - sstep(0.85, 1.0, abs(q.x) / L + 0.15 * (vnoise(vec2(q.x / 60.0, 0.0), sd + 50) - 0.5));
  // groups of houses bulge out from the line here and there, into the fields
  float blob = fbm(vec2(q.x, ry) / (W * 1.1) + float(sd & 15), sd + 51, 2);
  float inLane = blob > 0.56 && abs(ry) < W * 2.2 ? 1.0 : 0.0;
  float k = 0.0, lx = 0.0;
  float wid = W * (0.75 + 0.5 * vnoise(vec2(q.x / 90.0, 3.0), sd + 53));
  float inside = max(1.0 - sstep(wid * 0.85, wid, abs(ry)), inLane * (1.0 - sstep(0.56, 0.6, 1.12 - blob))) * along;
  if (inside <= 0.0) return vec4(0.0);
  vec3 col = vec3(0.42, 0.46, 0.33);
  float P = 15.0;
  // plots in rows along the street; behind them trees and gardens
  vec2 u = vec2(q.x, ry) / P, id = floor(u), f = u - id;
  float hh = hash2(int(id.x), int(id.y), sd + 54);
  float near = abs(ry) < wid * 0.55 || inLane > 0.5 ? 1.0 : 0.0;
  float b = vHouse(f, vec2(P), id, sd + 55, vec2(0.66, 0.6), 5.0);
  if (near > 0.5 && hh < 0.82) col = b > 0.5 ? (hash2(int(id.x), int(id.y), sd + 56) < 0.6 ? vRoofWarm(hash2(int(id.x), int(id.y), sd + 57)) : vRoofGrey(hash2(int(id.x), int(id.y), sd + 57))) : b < -0.5 ? col * 0.6 : col;
  else { float t = vTree(f, vec2(P), id, sd + 58, P * 0.42); col = t > 0.5 ? vCrown(q, sd) : t < -0.5 ? col * 0.6 : col; }
  // the street (or the stream path) itself
  col = mix(col, vec3(0.66, 0.63, 0.55), 1.0 - sstep(2.2, 3.4, abs(ry)));
  return vec4(mix(vec3(0.38, 0.38, 0.30), col, vDet(P, mpp)), inside);
}
// a village of walled yards (the Sahel): mud walls round each family's yard, round huts inside, bare sand with footpaths crossing
vec4 vCompound(vec2 q, float R, int sd, float mpp) {
  float d = length(q) / R;
  float edge = vEdge(d, q, R, sd);
  if (edge <= 0.0) return vec4(0.0);
  vec3 sand = mix(vec3(0.66, 0.62, 0.56), vec3(0.73, 0.69, 0.63), vnoise(q / 40.0, sd + 60)) * (0.96 + 0.08 * vnoise(q / 4.0, sd + 61));
  vec3 col = sand;
  // footpaths: worn lines running every way
  float p1 = abs(gnoise(q / 90.0, sd + 62)), p2 = abs(gnoise(q / 55.0 + 9.0, sd + 63));
  col = mix(col, vec3(0.78, 0.75, 0.70), (1.0 - sstep(0.008, 0.02, min(p1, p2))) * 0.6);
  float C = 52.0;
  vec2 u = q / C, id = floor(u), f = u - id;
  float hh = hash2(int(id.x), int(id.y), sd + 64);
  float fill = 0.9 * (1.0 - sstep(0.5, 1.0, d)) + 0.25;
  if (hh < fill) {
    vec2 sz = vec2(0.55 + 0.35 * hash2(int(id.x), int(id.y), sd + 65), 0.5 + 0.35 * hash2(int(id.x), int(id.y), sd + 66));
    vec2 lo = (vec2(0.5) - sz * 0.5), hi = (vec2(0.5) + sz * 0.5);
    vec2 fp = f * C;
    vec2 a = lo * C, b2 = hi * C;
    bool inY = all(greaterThan(fp, a)) && all(lessThan(fp, b2));
    float wallD = min(min(fp.x - a.x, b2.x - fp.x), min(fp.y - a.y, b2.y - fp.y));
    if (inY) {
      col = mix(vec3(0.60, 0.56, 0.50), vec3(0.67, 0.63, 0.57), vnoise(q / 6.0, sd + 67));
      if (wallD < 1.4) col = vec3(0.24, 0.21, 0.18);
      // two to four round huts and sometimes a square house, a tree in some yards
      for (int k = 0; k < 4; k++) {
        if (float(k) > 1.0 + 3.0 * hash2(int(id.x), int(id.y), sd + 68)) break;
        vec2 hp = a + (b2 - a) * vec2(0.2 + 0.6 * hash2(int(id.x) * 5 + k, int(id.y), sd + 69), 0.2 + 0.6 * hash2(int(id.x), int(id.y) * 5 + k, sd + 70));
        float hut = vRound(fp - hp, 2.8 + 1.4 * hash2(int(id.x) + k, int(id.y), sd + 71), 3.0);
        if (hut > 0.5) col = hash2(int(id.x) + k, int(id.y), sd + 72) < 0.6 ? vec3(0.86, 0.84, 0.80) : vec3(0.58, 0.52, 0.42);
        else if (hut < -0.5) col *= 0.7;
      }
      float sq = vBox(fp, a + vec2(2.0), a + vec2(10.0, 7.0), 3.5);
      if (hash2(int(id.x), int(id.y), sd + 73) < 0.4) col = sq > 0.5 ? vec3(0.80, 0.78, 0.74) : sq < -0.5 ? col * 0.7 : col;
      float tr = vRound(fp - (b2 - vec2(6.0)), 4.5, 6.0);
      if (hash2(int(id.x), int(id.y), sd + 74) < 0.35) col = tr > 0.5 ? vec3(0.17, 0.23, 0.13) : tr < -0.5 ? col * 0.65 : col;
    } else {
      // a tree's shadow falls over the wall from outside, now and then
      float w2 = vRound(fp - vec2(C * 0.1, C * 0.9), 4.0, 6.0);
      if (hash2(int(id.x), int(id.y), sd + 75) < 0.2) col = w2 > 0.5 ? vec3(0.17, 0.23, 0.13) : w2 < -0.5 ? col * 0.7 : col;
    }
  }
  return vec4(mix(vec3(0.58, 0.54, 0.48), col, vDet(C * 0.3, mpp)), edge);
}
// a fishing village: houses along the shore (x), the sea towards +y; boats on the beach, nets, a stone quay
vec4 vHarbor(vec2 q, float R, int sd, float mpp) {
  float L = R * 1.5, W = R * 0.7;
  float along = 1.0 - sstep(0.8, 1.0, abs(q.x) / L + 0.25 * (vnoise(vec2(q.x / 50.0, 1.0), sd + 80) - 0.5));
  // the back of the village is ragged; the shore curves gently
  float back = W * (0.65 + 0.5 * vnoise(vec2(q.x / 70.0, 2.0), sd + 87)) * (1.0 - 0.6 * (abs(q.x) / L) * (abs(q.x) / L));
  q.y -= 0.12 * W * sin(q.x / (L * 0.6));
  float inside = along * (1.0 - sstep(back * 0.85, back, -q.y)) * (1.0 - sstep(W * 0.5, W * 0.62, q.y));
  if (inside <= 0.0) return vec4(0.0);
  vec3 col = vec3(0.50, 0.49, 0.42);
  float P = 14.0;
  vec2 u = q / P, id = floor(u), f = u - id;
  float hh = hash2(int(id.x), int(id.y), sd + 81);
  float b = vHouse(f, vec2(P), id, sd + 82, vec2(0.7, 0.62), 5.0);
  if (q.y < W * 0.25 && hh < 0.85 * (1.0 - sstep(0.4, 1.0, -q.y / W))) col = b > 0.5 ? (hash2(int(id.x), int(id.y), sd + 83) < 0.55 ? vRoofWarm(hash2(int(id.x), int(id.y), sd + 84)) : vec3(0.84, 0.83, 0.80)) : b < -0.5 ? col * 0.62 : col;
  // the shore: sand, boats pulled up in a row, nets drying
  if (q.y > W * 0.25) {
    col = mix(vec3(0.74, 0.69, 0.55), vec3(0.62, 0.58, 0.47), sstep(W * 0.35, W * 0.6, q.y));
    vec2 bq = vec2(mod(q.x, 13.0) - 6.5, q.y - W * 0.42);
    float boat = length(bq / vec2(1.8, 4.6));
    if (boat < 1.0 && hash2(int(floor(q.x / 13.0)), sd, 85) < 0.6) col = hash2(int(floor(q.x / 13.0)), sd, 86) < 0.5 ? vec3(0.82, 0.82, 0.80) : vec3(0.28, 0.40, 0.55);
  }
  // the quay out into the water
  if (abs(q.x - R * 0.2) < 5.0 && q.y > W * 0.2) col = vec3(0.60, 0.58, 0.54);
  col = mix(col, vec3(0.62, 0.60, 0.55), 1.0 - sstep(2.0, 3.2, abs(q.y - W * 0.2)));
  return vec4(mix(vec3(0.55, 0.52, 0.44), col, vDet(P, mpp)), inside);
}
// a mining camp: rows of miners' cottages and barracks on bare ground, the spoil heaps and the railway siding towards +y
vec4 vCamp(vec2 q, float R, int sd, float mpp) {
  float d = length(q / vec2(1.25, 0.95)) / R;
  float edge = vEdge(d, q, R, sd);
  if (edge <= 0.0) return vec4(0.0);
  vec3 col = mix(vec3(0.47, 0.42, 0.35), vec3(0.55, 0.50, 0.42), vnoise(q / 30.0, sd + 90));
  vec2 S = vec2(46.0, 19.0);
  vec2 u = q / S, id = floor(u), f = u - id;
  if (q.y < R * 0.35) {
    float b = vBox(f * S, vec2(4.0, 4.0), vec2(40.0, 12.5), 4.5);
    vec3 roof = hash2(int(id.x), int(id.y), sd + 91) < 0.6 ? vec3(0.46, 0.50, 0.55) : vec3(0.40, 0.38, 0.36);
    if (hash2(int(id.x), int(id.y), sd + 92) < 0.88) col = b > 0.5 ? roof : b < -0.5 ? col * 0.62 : col;
    col = mix(col, vec3(0.40, 0.37, 0.33), 1.0 - sstep(1.5, 2.6, abs(f.y * S.y - 16.0)));
  } else {
    // spoil heaps: dark cones with paler rims
    vec2 hp = q - vec2(R * (0.5 * hash2(sd, 3, 93) - 0.25), R * 0.75);
    float heap = length(hp) / (R * 0.28);
    col = mix(col, mix(vec3(0.18, 0.17, 0.16), vec3(0.34, 0.32, 0.30), sstep(0.3, 1.0, heap) + 0.15 * vnoise(q / 4.0, sd + 94)), 1.0 - sstep(0.85, 1.0, heap));
    vec2 hp2 = q - vec2(R * (0.55 + 0.3 * hash2(sd, 4, 93)), R * 0.62);
    float heap2 = length(hp2) / (R * 0.18);
    col = mix(col, vec3(0.24, 0.23, 0.21), 1.0 - sstep(0.8, 1.0, heap2));
  }
  // the siding: rails on their ties
  float rl = abs(q.y - R * 0.42);
  col = mix(col, vec3(0.30, 0.27, 0.24), (1.0 - sstep(1.6, 2.4, rl)));
  return vec4(mix(vec3(0.44, 0.42, 0.38), col, vDet(10.0, mpp)), edge);
}
// a market village: two roads cross at a square with stalls; inns at its corners; houses line the roads
vec4 vMarket(vec2 q, float R, int sd, float mpp) {
  float rd = min(abs(q.x), abs(q.y));
  float d = length(q) / R;
  float cross = 1.0 - sstep(0.9, 1.0, max(d * 0.75, rd / (R * 0.32)));
  float edge = max(vEdge(d * 1.3, q, R, sd), cross);
  if (edge <= 0.0) return vec4(0.0);
  vec3 col = vec3(0.45, 0.46, 0.36);
  float P = 14.0;
  vec2 u = q / P, id = floor(u), f = u - id;
  float hh = hash2(int(id.x), int(id.y), sd + 100);
  float b = vHouse(f, vec2(P), id, sd + 101, vec2(0.75, 0.65), 7.0);
  float dens = 0.95 * (1.0 - sstep(R * 0.1, R * 0.35, rd)) * (1.0 - sstep(0.6, 1.0, d)) + 0.25 * (1.0 - sstep(0.4, 0.9, d));
  if (hh < dens) col = b > 0.5 ? vRoofGrey(hash2(int(id.x), int(id.y), sd + 102)) : b < -0.5 ? col * 0.6 : col;
  else { float t = vTree(f, vec2(P), id, sd + 103, P * 0.35); if (hh < dens + 0.25) col = t > 0.5 ? vCrown(q, sd) : t < -0.5 ? col * 0.6 : col; }
  col = mix(col, vec3(0.62, 0.60, 0.56), 1.0 - sstep(3.5, 4.8, rd));
  // the square, its stalls, and the inns at its corners
  float sq = max(abs(q.x), abs(q.y));
  if (sq < 24.0) {
    col = vec3(0.66, 0.63, 0.58);
    vec2 st = floor(q / 5.0);
    float sh = hash2(int(st.x), int(st.y), sd + 104);
    if (sq < 19.0 && sq > 5.0 && sh < 0.35 && length(fract(q / 5.0) - 0.5) < 0.32) col = sh < 0.12 ? vec3(0.72, 0.30, 0.25) : sh < 0.24 ? vec3(0.30, 0.42, 0.62) : vec3(0.88, 0.86, 0.82);
  }
  vec2 cq = abs(q) - vec2(36.0, 36.0);
  float inn = vBox(cq, vec2(-10.0, -8.0), vec2(10.0, 8.0), 9.0);
  col = inn > 0.5 ? vec3(0.58, 0.40, 0.32) : inn < -0.5 ? col * 0.6 : col;
  return vec4(mix(vec3(0.50, 0.49, 0.44), col, vDet(P, mpp)), edge);
}
// scattered farms: farmhouses, barns and yards spread far apart, each with its trees; the fields between are left alone
vec4 vScatter(vec2 q, float R, int sd, float mpp) {
  float d = length(q) / R;
  if (d > 1.05) return vec4(0.0);
  float S = 330.0;
  vec2 u = q / S, id = floor(u), f = u - id;
  if (hash2(int(id.x), int(id.y), sd + 110) > 0.72) return vec4(0.0);
  vec2 c = (vec2(0.25) + 0.5 * vec2(hash2(int(id.x), int(id.y), sd + 111), hash2(int(id.x), int(id.y), sd + 112))) * S;
  vec2 fp = f * S - c;
  float a = hash2(int(id.x), int(id.y), sd + 113) * 3.14159;
  vec2 r = mat2(cos(a), -sin(a), sin(a), cos(a)) * fp;
  float yard = max(abs(r.x) / 32.0, abs(r.y) / 24.0);
  if (yard > 1.6) return vec4(0.0);
  vec3 col = vec3(0.56, 0.52, 0.42);
  float alpha = 1.0 - sstep(1.0, 1.15, yard);
  float h1 = vBox(r, vec2(-22.0, -14.0), vec2(-6.0, -4.0), 6.0);
  float h2 = vBox(r, vec2(2.0, -16.0), vec2(28.0, -3.0), 7.0);
  col = h1 > 0.5 ? vRoofWarm(hash2(int(id.x), int(id.y), sd + 114)) : h2 > 0.5 ? vec3(0.50, 0.48, 0.46) : (h1 < -0.5 || h2 < -0.5) ? col * 0.62 : col;
  float tr = vRound(r - vec2(-18.0, 16.0), 11.0, 14.0);
  if (tr > 0.5) { col = vCrown(q, sd); alpha = 1.0; } else if (tr < -0.5) col *= 0.7;
  if (tr != 0.0) alpha = max(alpha, 1.0 - sstep(1.2, 1.5, yard));
  return vec4(mix(vec3(0.42, 0.42, 0.33), col, vDet(12.0, mpp)), alpha);
}
// a modern village: a main road with shops, a roundabout, curving streets ending in closes, houses on lawns, a terrace and some flats
vec4 vModern(vec2 q, float R, int sd, float mpp) {
  float d = length(q) / R;
  float edge = vEdge(d, q, R, sd);
  float mainRd = abs(q.y);
  if (edge <= 0.0 && !(mainRd < 6.0 && abs(q.x) < R * 1.3)) return vec4(0.0);
  vec3 lawn = mix(vec3(0.40, 0.52, 0.28), vec3(0.47, 0.58, 0.32), vnoise(q / 9.0, sd + 120));
  vec3 asph = vec3(0.50, 0.50, 0.50);
  vec3 col = lawn;
  // curving streets round a point off the main road, with lanes running out to closes
  vec2 c1 = vec2(-R * 0.15, (hash2(sd, 5, 121) < 0.5 ? 1.0 : -1.0) * R * 0.42);
  vec2 rq = q - c1;
  float th = atan(rq.y, rq.x);
  float rr = length(rq) + 26.0 * (vnoise(vec2(th * 1.3, 0.0), sd + 127) - 0.5) + 0.12 * rq.x;   // streets bend, not perfect rings
  float ring = floor(rr / 62.0 + 0.5);
  float ringD = abs(rr - 62.0 * ring);
  // each street only runs part of the way round, ending where it meets a lane
  if (vnoise(vec2(th * 2.0, ring * 3.1), sd + 128) < 0.3) ringD = 1e9;
  float sect = 0.9;   // radians between the lanes
  float ka = floor(th / sect + 0.5), aD = abs(th - ka * sect) * rr;
  bool spoke = hash2(int(ka) + 50, sd, 122) < 0.7;
  float street = min(ringD, spoke ? aD : 1e9);
  // houses: plots along the curves
  float P = 17.0;
  vec2 u = vec2(th * rr, rr) / P, id = floor(u), f = u - id;
  float b = vHouse(f, vec2(P), id, sd + 123, vec2(0.55, 0.5), 6.0);
  float hh = hash2(int(id.x), int(id.y), sd + 124);
  if ((ringD > 7.0 || ringD > 1e8) && hh < 0.9 && min(ringD, spoke ? aD : 1e9) < 40.0) {
    if (b > 0.5) {
      vec2 fp = f - 0.5;
      float rim = sstep(0.18, 0.24, max(abs(fp.x), abs(fp.y)));
      col = mix(hash2(int(id.x), int(id.y), sd + 125) < 0.5 ? vec3(0.50, 0.31, 0.25) : vec3(0.42, 0.40, 0.40), vec3(0.88, 0.87, 0.84), rim * 0.6);
    } else if (b < -0.5) col *= 0.65;
    else if (f.y < 0.18) col = vec3(0.62, 0.61, 0.58);   // drives
  }
  // closes: turning circles at the ends of some lanes
  vec2 endP = c1 + vec2(cos(ka * sect), sin(ka * sect)) * (62.0 * (1.0 + floor(2.0 * hash2(int(ka), sd, 126))) + 31.0);
  float close = length(q - endP);
  col = mix(col, asph, max(1.0 - sstep(3.0, 4.2, street), 1.0 - sstep(9.0, 10.2, close)) * (spoke || ringD < 4.0 ? 1.0 : 0.0));
  col = mix(col, lawn, 1.0 - sstep(3.5, 4.5, close));
  // the main road, its shops and car parks on one side, a terrace row on the other, and a block of flats
  float shopS = 0.0;
  if (q.y > 6.0 && q.y < 40.0 && abs(q.x) < R * 0.75) {
    vec2 su = vec2(q.x / 30.0, 0.0); float sx = fract(su.x) * 30.0;
    float shop = vBox(vec2(sx, q.y), vec2(3.0, 18.0), vec2(26.0, 34.0), 7.0);
    col = shop > 0.5 ? vec3(0.62, 0.60, 0.58) : shop < -0.5 ? col * 0.62 : (q.y < 18.0 ? mix(vec3(0.46, 0.46, 0.47), vec3(0.9), (1.0 - sstep(0.3, 0.5, abs(fract(sx / 3.0) - 0.5) * 3.0)) * 0.6 * (1.0 - sstep(15.0, 16.0, q.y))) : col);
    shopS = 1.0;
  }
  float terr = vBox(q, vec2(-R * 0.7, -24.0), vec2(-R * 0.15, -14.0), 8.0);
  if (shopS < 0.5) col = terr > 0.5 ? (fract(q.x / 6.0) < 0.08 ? vec3(0.35, 0.25, 0.22) : vec3(0.52, 0.33, 0.27)) : terr < -0.5 ? col * 0.62 : col;
  float flats = vBox(q, vec2(R * 0.2, -46.0), vec2(R * 0.2 + 34.0, -22.0), 18.0);
  col = flats > 0.5 ? vec3(0.70, 0.70, 0.69) : flats < -0.5 ? col * 0.6 : col;
  col = mix(col, vec3(0.38, 0.38, 0.39), 1.0 - sstep(5.0, 6.2, mainRd));
  col = mix(col, vec3(0.92), (1.0 - sstep(0.25, 0.5, mainRd)) * step(0.5, fract(q.x / 8.0)));
  // the roundabout where the village meets the main road
  float rb = length(q - vec2(R * 0.55, 0.0));
  col = mix(col, vec3(0.38, 0.38, 0.39), (1.0 - sstep(15.0, 16.0, rb)) * sstep(8.0, 9.0, rb));
  col = mix(col, lawn, 1.0 - sstep(8.0, 9.0, rb));
  float a = max(edge, (1.0 - sstep(5.0, 6.2, mainRd)) * (1.0 - sstep(R * 1.1, R * 1.3, abs(q.x))));
  return vec4(mix(vec3(0.50, 0.52, 0.45), col, vDet(P, mpp)), a);
}
vec4 villagePlan(int plan, bool ruin, vec2 q, float R, int sd, float mpp) {
  if (ruin) return vCluster(q, R, sd, mpp, false, true);
  if (plan == 1) return vGrove(q, R, sd, mpp);
  if (plan == 2) return vLine(q, R, sd, mpp);
  if (plan == 3) return vCompound(q, R, sd, mpp);
  if (plan == 4) return vCluster(q, R, sd, mpp, true, false);
  if (plan == 5) return vHarbor(q, R, sd, mpp);
  if (plan == 6) return vCamp(q, R, sd, mpp);
  if (plan == 7) return vMarket(q, R, sd, mpp);
  if (plan == 8) return vScatter(q, R, sd, mpp);
  if (plan == 9) return vModern(q, R, sd, mpp);
  return vCluster(q, R, sd, mpp, false, false);
}
// the village (if any) at this point, and the tracks between neighbouring villages
vec4 villageLayer(vec2 p, float pxm, float farm) {
  if (pxm > 0.012) return vec4(0.0);
  float mpp = pxm * 50000.0;
  ivec2 vc = ivec2(floor(p / VG));
  float road = 1e9;
  vec4 hit = vec4(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 c = vc + ivec2(i, j);
    if (c.x < 0 || c.y < 0 || c.x >= uVGrid.x || c.y >= uVGrid.y) continue;
    vec4 v = texelFetch(uVillages, c, 0);
    if (v.w < 0.5) continue;
    vec2 pos = (vec2(c) + v.xy) * VG;
    // tracks to the next villages east and south
    if (farm > 0.02 && mpp < 40.0) for (int k = 0; k < 2; k++) {
      ivec2 c2 = c + (k == 0 ? ivec2(1, 0) : ivec2(0, 1));
      if (c2.x >= uVGrid.x || c2.y >= uVGrid.y) continue;
      vec4 v2 = texelFetch(uVillages, c2, 0);
      if (v2.w < 0.5) continue;
      vec2 wob = 0.004 * vec2(vnoise(p * 40.0, uSeed + 7400) - 0.5, vnoise(p * 40.0, uSeed + 7401) - 0.5);
      road = min(road, segDist(p + wob, pos, (vec2(c2) + v2.xy) * VG));
    }
    if (hit.a > 0.0) continue;
    float R = v.z * 50000.0;
    vec2 rel = (p - pos) * 50000.0;
    if (dot(rel, rel) > 4.4 * R * R + 900.0) continue;
    vec4 inf = texelFetch(uVillInfo, c, 0);
    float a = inf.y;
    mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec2 q = rot * rel;
    gVSun = normalize(rot * vec2(-0.62, -0.72));
    int fl = int(inf.x + 0.5);
    vec4 r = villagePlan(fl & 15, (fl & 32) != 0, q, R, int(inf.w * 65535.0), mpp);
    if (r.a > 0.01) hit = r;
  }
  float rw = 0.00016;   // about 8 m wide
  float rv = (1.0 - sstep(rw * 0.5, rw * 0.5 + pxm, road)) * sstep(0.2, 1.2, rw / pxm + 0.4) * farm * 0.85;
  vec3 track = vec3(0.70, 0.67, 0.60);
  if (hit.a <= 0.01) return vec4(track, rv);
  return vec4(mix(track, hit.rgb, hit.a), max(hit.a, rv));
}
`;
}
