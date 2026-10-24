/* =====================================================================
   14f. Roads on the map
   Roads are painted into the land by the graphics card, as wide as they really are, the way the rivers are.
   Each road is a smooth curve through the cells it joins (it still passes every cell's centre, so villages,
   markets and traffic stay on it); close up it bends gently with the ground, and winds in hairpins up mountains.
   What a road is built as follows its nation's era and how much it carries (the people of the towns it joins):
     0 dirt track      a pale earth track with two wheel ruts (the steam age, little traffic, wild land)
     1 gravel road     a grey-beige road with no markings
     2 asphalt road    two lanes, white edge lines; a dashed white centre line, or a double yellow one in
                       nations that build grid towns (as in America)
     3 motorway        two carriageways of three lanes, a grass median with a barrier, yellow inner lines, white
                       dashed lane lines, hard shoulders (from the Electronic Age, between big towns)
   Where a road crosses a river it is on a bridge; a dirt track fords it.
   Far out, where a road is narrower than a pixel, it is drawn as a thin map line so it can still be seen.
   ===================================================================== */
const ROAD_GRADES = [   // half: half the width in metres, verges included (the painter below uses the same numbers)
  { name: "Dirt track", half: 2.6 }, { name: "Gravel road", half: 3.6 }, { name: "Asphalt road", half: 5.0 }, { name: "Motorway", half: 19.0 },
];
const ROAD_TRAFFIC = { paved: 0.12, motorway: 0.5, reach: 30 };   // town-pair traffic (people × people / distance) for a better road
const ROADNET = { key: null, chains: [], edgePts: new Map(), grade: new Map(), glKey: null, glEdges: null };

/* A nation's own era: the latest age whose invention it has made. */
function roadNationEra(g, nid) {
  const n = nid >= 0 ? g.nations[nid] : null;
  if (!n) return 0;
  let k = 0;
  ERAS.forEach((e, i) => { if (e.tech && hasTech(n, e.tech)) k = Math.max(k, i); });
  return k;
}
/* About how many people (millions) live in and around a town: its cell and the cells beside it. */
function roadTownPop(g, c) {
  if (!g.pop) return 0.5;
  let s = g.pop[c.cell] || 0;
  for (const [dx, dy] of DIRS8) {
    const x = cellX(c.cell) + dx, y = cellY(c.cell) + dy;
    if (inBounds(x, y) && g.owner[idx(x, y)] === c.owner) s += 0.35 * (g.pop[idx(x, y)] || 0);
  }
  return s;
}
/* How much each stretch of road carries: every pair of towns joined by road sends traffic along the shortest way
   between them, more for bigger towns, less the further apart they are. */
function roadTraffic(g) {
  const adj = new Map();
  for (const k of g.roads) {
    const [a, b] = edgeEnds(k);
    const len = cellX(a) !== cellX(b) && cellY(a) !== cellY(b) ? 1.414 : 1;
    if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push([b, k, len]); adj.get(b).push([a, k, len]);
  }
  const towns = g.cities.filter(c => adj.has(c.cell)).map(c => ({ cell: c.cell, pop: roadTownPop(g, c) }));
  const traffic = new Map();
  const townAt = new Map(towns.map((t, i) => [t.cell, i]));
  towns.forEach((A, ia) => {
    const cost = new Map([[A.cell, 0]]), prev = new Map(), done = new Set(), open = [A.cell];
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (cost.get(open[k]) < cost.get(open[bi])) bi = k;
      const c = open.splice(bi, 1)[0];
      if (done.has(c)) continue;
      done.add(c);
      const cc = cost.get(c);
      if (cc > ROAD_TRAFFIC.reach) break;
      for (const [n, k, len] of adj.get(c)) {
        if (done.has(n)) continue;
        const nc = cc + len;
        if (!cost.has(n) || nc < cost.get(n)) { cost.set(n, nc); prev.set(n, [c, k]); open.push(n); }
      }
    }
    for (const c of done) {
      const ib = townAt.get(c);
      if (ib === undefined || ib <= ia) continue;
      const v = A.pop * towns[ib].pop / Math.max(2, cost.get(c));
      for (let x = c; x !== A.cell; x = prev.get(x)[0]) { const k = prev.get(x)[1]; traffic.set(k, (traffic.get(k) || 0) + v); }
    }
  });
  return traffic;
}
/* What each stretch is built as (0 track … 3 motorway), from its nations' era and its traffic. */
function roadGrades(g) {
  const traffic = roadTraffic(g), out = new Map();
  for (const k of g.roads) {
    const [a, b] = edgeEnds(k);
    const oa = g.owner[a], ob = g.owner[b];
    const era = Math.max(roadNationEra(g, oa), roadNationEra(g, ob));
    const t = traffic.get(k) || 0;
    let grade;
    if (oa < 0 || ob < 0) grade = era >= 3 ? 1 : 0;   // across wild land: a track the carts keep open
    else if (era >= 3 && t >= ROAD_TRAFFIC.motorway) grade = 3;
    else if (t >= ROAD_TRAFFIC.paved) grade = era >= 1 ? 2 : 1;
    else grade = era >= 3 ? 2 : era >= 1 ? 1 : 0;
    out.set(k, grade);
  }
  return out;
}

/* Roads as smooth curves. Chains run from one node (a town, a junction, a dead end, or where the road changes
   grade) to the next; each is a curve through the centres of its cells (Catmull-Rom), with points every ~8 km. */
function buildRoadNet(w, g) {
  const grade = roadGrades(g);
  const nbrs = new Map();
  for (const k of g.roads) {
    const [a, b] = edgeEnds(k);
    if (!nbrs.has(a)) nbrs.set(a, []); if (!nbrs.has(b)) nbrs.set(b, []);
    nbrs.get(a).push(b); nbrs.get(b).push(a);
  }
  const towns = new Set(g.cities.map(c => c.cell));
  const isNode = c => {
    const l = nbrs.get(c);
    if (l.length !== 2 || towns.has(c)) return true;
    return grade.get(edgeKey(c, l[0])) !== grade.get(edgeKey(c, l[1]));
  };
  const used = new Set(), chains = [];
  const walk = (start, next) => {
    const cells = [start];
    let prev = start, c = next;
    used.add(edgeKey(start, next));
    while (true) {
      cells.push(c);
      if (c === start || isNode(c)) break;
      const n = nbrs.get(c).find(x => x !== prev && !used.has(edgeKey(c, x)));
      if (n === undefined) break;
      used.add(edgeKey(c, n));
      prev = c; c = n;
    }
    chains.push({ cells, grade: grade.get(edgeKey(cells[0], cells[1])) });
  };
  for (const c of [...nbrs.keys()].sort((a, b) => a - b)) if (isNode(c)) for (const n of nbrs.get(c)) if (!used.has(edgeKey(c, n))) walk(c, n);
  // loops with no node on them
  for (const c of [...nbrs.keys()].sort((a, b) => a - b)) for (const n of nbrs.get(c)) if (!used.has(edgeKey(c, n))) walk(c, n);

  const ctr = c => [cellX(c) + 0.5, cellY(c) + 0.5];
  const edgePts = new Map();
  const style = nid => nid >= 0 && typeof townStyle === "function" && townStyle({ owner: nid }) === 0 ? 1 : 0;
  for (const ch of chains) {
    const P = ch.cells.map(ctr);
    const closed = ch.cells.length > 2 && ch.cells[0] === ch.cells[ch.cells.length - 1];
    const at = i => {
      if (i >= 0 && i < P.length) return P[i];
      if (closed) return P[(i + P.length - 1) % (P.length - 1)];
      const [a, b] = i < 0 ? [P[0], P[1]] : [P[P.length - 1], P[P.length - 2]];
      return [2 * a[0] - b[0], 2 * a[1] - b[1]];
    };
    const pts = [P[0].slice()];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = at(i - 1), p1 = P[i], p2 = P[i + 1], p3 = at(i + 2);
      const n = 6, seg = [p1.slice()];
      for (let s = 1; s <= n; s++) {
        const t = s / n, t2 = t * t, t3 = t2 * t;
        // Catmull-Rom with a gentler pull (tension 0.4), so the curve does not swing wide of the straight line
        const T = 0.4, f = (a, b, c, d) => b + T * (c - a) * t + (2 * T * a + (T - 3) * b + (3 - 2 * T) * c - T * d) * t2 + (-T * a + (2 - T) * b + (T - 2) * c + T * d) * t3;
        let x = s === n ? p2[0] : f(p0[0], p1[0], p2[0], p3[0]), y = s === n ? p2[1] : f(p0[1], p1[1], p2[1], p3[1]);
        // never out over the sea or a lake: fall back to the straight line there
        if (s < n && typeof landAt === "function" && !landAt(x, y)) { x = p1[0] + (p2[0] - p1[0]) * t; y = p1[1] + (p2[1] - p1[1]) * t; }
        seg.push([x, y]);
        pts.push([x, y]);
      }
      edgePts.set(edgeKey(ch.cells[i], ch.cells[i + 1]), ch.cells[i] < ch.cells[i + 1] ? seg : seg.slice().reverse());
    }
    ch.pts = pts;
    const owner = g.owner[ch.cells[Math.floor(ch.cells.length / 2)]];
    ch.yellow = style(owner);
    ch.seed = hash2(ch.cells[0], ch.cells[ch.cells.length - 1], 77) * 1000;
    // how hilly the ground is under each point (0 plains, 0.5 hills, 1 mountains), smoothed along the road
    const hill = pts.map(([x, y]) => {
      const e = elevationAt(w.seed, x, y);
      return e >= w.mountainLevel ? 1 : e >= w.hillLevel ? 0.5 + 0.5 * clamp((e - w.hillLevel) / Math.max(0.01, w.mountainLevel - w.hillLevel), 0, 1) : 0.5 * clamp((e - w.hillLevel + 0.03) / 0.03, 0, 1);
    });
    ch.hill = hill.map((h, i) => (hill[Math.max(0, i - 1)] + 2 * h + hill[Math.min(hill.length - 1, i + 1)]) / 4);
  }
  return { chains, edgePts, grade };
}
/* The road network for the map, rebuilt when the roads, the towns, the owners or the season change. */
function roadNet() {
  if (!game || !world) return ROADNET;
  const key = `${world.seed}|${game.turn}|${game.roads.size}|${game.cities.length}|${game.era || 0}|${typeof mapVersion !== "undefined" ? mapVersion : 0}`;
  if (ROADNET.key === key) return ROADNET;
  const R = buildRoadNet(world, game);
  Object.assign(ROADNET, R, { key });
  return ROADNET;
}
/* The point a fraction p of the way along road edge a→b, on its curve (for carts and cars on the overlay). */
function roadPointAt(a, b, p) {
  const pts = roadNet().edgePts.get(edgeKey(a, b));
  if (!pts) return [cellX(a) + 0.5 + (cellX(b) - cellX(a)) * p, cellY(a) + 0.5 + (cellY(b) - cellY(a)) * p];
  const q = a < b ? p : 1 - p;
  const f = q * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
}

/* The turn of a town's main avenues (the angle the painter starts them from, 14d) so that they meet the roads that
   come into the town: every half degree is tried, and the one where the roads (bigger ones count more) lie closest
   to an avenue wins. A town without roads keeps its own random turn. */
function townRoadTurn(t) {
  const hh = townHash(t.id), base = hh * 43.98;
  const city = game && game.cities.find(c => c.id === t.id);
  if (!city || !world) return base;
  const cx = t.gx ?? t.x, cy = t.gy ?? t.y, dirs = [];
  for (const ch of roadNet().chains) {
    const ends = [];
    if (ch.cells[0] === city.cell) ends.push(ch.pts);
    if (ch.cells[ch.cells.length - 1] === city.cell) ends.push(ch.pts.slice().reverse());
    for (const pts of ends) {
      // where the road reaches the edge of the town
      const q = pts.find(p => Math.hypot(p[0] - cx, p[1] - cy) >= t.r) || pts[pts.length - 1];
      dirs.push({ ang: Math.atan2(q[1] - cy, q[0] - cx), w: 1 + ch.grade });
    }
  }
  if (!dirs.length) return base;
  const N = 5 + Math.floor(hh * 4);
  // the avenues' directions at the town's edge, as the painter draws them (artAng at d = R)
  const art = (a0, k) => a0 + k * 2 * Math.PI / N + 0.15 * Math.sin(k * 1.7 + a0) + 0.12 * Math.sin(5 + k * 2.1);
  const off = a => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  let best = base, bestCost = Infinity;
  for (let i = 0; i < 720; i++) {
    const a0 = base + i * Math.PI / 360;
    let cost = 0;
    for (const d of dirs) { let m = Infinity; for (let k = 0; k < N; k++) m = Math.min(m, off(d.ang - art(a0, k))); cost += d.w * m * m; }
    if (cost < bestCost - 1e-9) { bestCost = cost; best = a0; }
  }
  return best;
}

/* The roads packed for the graphics card: two texels a point (x, y, distance along, -; grade, hilliness, yellow
   centre line, random number), and a list of stretches for every map cell (with a margin for bends and far-out lines). */
function roadTextures(chains) {
  const verts = [], segs = [];
  for (const ch of chains) {
    let s = 0;
    ch.pts.forEach(([x, y], i) => {
      if (i > 0) { s += Math.hypot(x - ch.pts[i - 1][0], y - ch.pts[i - 1][1]); segs.push(verts.length - 1); }
      verts.push([x, y, s, 0, ch.grade, ch.hill[i], ch.yellow, ch.seed]);
    });
  }
  const vtW = 1024, vtH = Math.max(1, Math.ceil(Math.max(1, verts.length) * 2 / vtW));
  const V = new Float32Array(vtW * vtH * 4);
  verts.forEach((v, i) => V.set(v, i * 8));
  const MARGIN = 0.12;
  const byCell = Array.from({ length: N_CELLS }, () => []);
  for (const v of segs) {
    const a = verts[v], b = verts[v + 1];
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - MARGIN)), x1 = Math.min(GRID_W - 1, Math.floor(Math.max(a[0], b[0]) + MARGIN));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - MARGIN)), y1 = Math.min(GRID_H - 1, Math.floor(Math.max(a[1], b[1]) + MARGIN));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) byCell[y * GRID_W + x].push(v);
  }
  const cells = new Float32Array(N_CELLS * 4), list = [];
  byCell.forEach((l, i) => { cells[i * 4] = list.length; cells[i * 4 + 1] = Math.min(l.length, 160); for (const v of l.slice(0, 160)) list.push(v); });
  const lW = 2048, lH = Math.max(1, Math.ceil(Math.max(1, list.length) / lW));
  const L = new Float32Array(lW * lH);
  L.set(list);
  return { V, vtW, vtH, cells, L, lW, lH, nSegs: segs.length };
}
/* Send the roads to the graphics card when they change. */
function glUploadRoads() {
  if (!GLMAP.ok || GLMAP.simple || GLMAP.noRoads || !game) return;
  const R = roadNet();
  if (GLMAP.roadKey === R.key) return;
  GLMAP.roadKey = R.key;
  const gl = GLMAP.gl, X = roadTextures(R.chains);
  glTex(11, GLMAP.tex.roadV, X.vtW, X.vtH, gl.RGBA32F, gl.RGBA, gl.FLOAT, X.V);
  glTex(12, GLMAP.tex.roadCell, GRID_W, GRID_H, gl.RGBA32F, gl.RGBA, gl.FLOAT, X.cells);
  glTex(13, GLMAP.tex.roadList, X.lW, X.lH, gl.R32F, gl.RED, gl.FLOAT, X.L);
  GLMAP.roadOn = X.nSegs ? 1 : 0;
  GLMAP.roadEdges = new Set(game.roads);
}

/* The roads' own small program for the graphics card. It runs after the land (and before the towns): it reads the
   land picture and the river picture the land pass left, and paints the roads over the land, on bridges where they
   cross rivers. It is kept apart from the land program on purpose: Windows turns every shader into DirectX, and a
   program as big as the land one with the roads inside it was too much for some graphics cards (v39.1). */
function roadShaderSource() {
  const full = glShaderSource();
  const cut = (from, to) => {
    const a = full.indexOf(from), b = full.indexOf(to, a);
    if (a < 0 || b < 0) throw new Error("road painter: a piece of the map painter was not found (" + from + ")");
    return full.slice(a, b);
  };
  return `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uOrigin;     // the map point (in cells) at the top-left pixel
uniform float uScale;     // cells per pixel
uniform float uH;         // canvas height in pixels
uniform int uOne;         // always 1 (keeps loops loops on Windows)
uniform sampler2D uFrame; // the land as the land pass drew it
uniform sampler2D uRiv;   // river water (x) and land (z) from the land pass
layout(location = 0) out vec4 outColor;
${cut("float hash2(int ix", "// the game's continent")}
${cut("// what a satellite camera does", "const vec3 ROCK")}
const float M = 1.0 / 50000.0;          // one metre, in map cells
${roadGlsl()}
void main() {
  ivec2 fc = ivec2(gl_FragCoord.xy);
  vec4 base = texelFetch(uFrame, fc, 0);
  outColor = base;
  vec2 p = uOrigin + vec2(gl_FragCoord.x, uH - gl_FragCoord.y) * uScale;
  if (p.x < 1.0 || p.y < 1.0 || p.x >= 95.0 || p.y >= 63.0) return;
  vec4 rv = texelFetch(uRiv, fc, 0);
  if (rv.z < 0.5) return;   // the sea
  vec4 road = roadAt(p, uScale, rv.x);
  if (road.a > 0.0) outColor = vec4(mix(base.rgb, clamp(satLook(road.rgb), 0.0, 1.0), road.a), 1.0);
}
`;
}

/* The road painter (inside roadShaderSource). */
function roadGlsl() {
  return `
// ---------- roads ----------
uniform highp sampler2D uRoadV;
uniform highp sampler2D uRoadCell;
uniform highp sampler2D uRoadList;
uniform int uRoadOn;
vec4 rdT(int v, int k) { int i = v * 2 + k; return texelFetch(uRoadV, ivec2(i & 1023, i >> 10), 0); }
// how much of a pixel (pxm wide) the band [lo, hi] covers, at a
float rdBand(float a, float lo, float hi, float pxm) { return clamp((min(hi, a + 0.5 * pxm) - max(lo, a - 0.5 * pxm)) / pxm, 0.0, 1.0); }
// a painted line, centred at c, w wide: a little bolder than real when it is far below a pixel, so it still shows
float rdLine(float a, float c, float w, float pxm) { float ww = min(max(w, 0.35 * pxm), 2.5 * w); return rdBand(a, c - 0.5 * ww, c + 0.5 * ww, pxm); }
// dashes along the road: on for the first part of each period; an even grey where they are smaller than pixels
float rdDash(float sm, float period, float on, float pxm) { float f = fract(sm / period); return mix(step(f, on), on, sstep(0.08, 0.3, pxm / period)); }
// how far the road's centre swings from its curve here (metres): gentle bends in the plains, more in the hills,
// and in stretches of mountain road the hairpins of a climb
float rdWob(float sm, float hill, float seed) {
  float w = 34.0 * (vnoise(vec2(sm / 900.0, seed), 7101) - 0.5) + 16.0 * (vnoise(vec2(sm / 330.0, seed + 3.1), 7102) - 0.5);
  w *= 1.0 + 3.0 * hill;
  // a climb up a steep slope: straight legs across it, about 70 m apart, some long and some short, joined by
  // tight hairpin turns (a rounded triangle wave); a few such climbs on a mountain road, winding stretches between
  float climb = sstep(0.6, 0.85, hill) * sstep(0.55, 0.68, vnoise(vec2(sm / 2200.0, seed + 7.7), 7103));
  float leg = 110.0 + 190.0 * vnoise(vec2(sm / 260.0, seed + 2.3), 7104);
  float ph = sm / 140.0 + 0.6 * vnoise(vec2(sm / 500.0, seed + 5.9), 7105);
  return w + climb * leg * 0.6366 * asin(0.97 * sin(ph * 6.2831853));
}
// the road at p: its colour and how much it covers (a); bridge > 0 where it is on a bridge over water
vec4 roadAt(vec2 p, float pxm, float water) {
  if (uRoadOn == 0) return vec4(0.0);
  vec4 cl = texelFetch(uRoadCell, ivec2(clamp(floor(p), vec2(0.0), vec2(95.0, 63.0))), 0);
  int off = int(cl.x), cnt = int(cl.y);
  if (cnt == 0) return vec4(0.0);
  float pxmM = pxm / M;
  float wobOn = 1.0 - sstep(60.0, 200.0, pxmM);   // the bends are only worth working out close up
  // find the nearest stretch: cheap work only in the loop (Windows turns a shader into DirectX and copies a loop out
  // once for every turn unless its count comes from a uniform, so uOne keeps it a loop); the bends are worked out
  // once, for the stretch found
  float best = 1e9; int bv = -1; float bt = 0.0, btr = 0.0;
  for (int i = 0; i < 160 * uOne; i++) {
    if (i >= cnt) break;
    int li = off + i;
    int v = int(texelFetch(uRoadList, ivec2(li & 2047, li >> 11), 0).r + 0.5);
    vec4 A = rdT(v, 0), B = rdT(v + 1, 0);
    vec2 ab = B.xy - A.xy;
    float tr = dot(p - A.xy, ab) / max(dot(ab, ab), 1e-12), t = clamp(tr, 0.0, 1.0);
    float d0 = length(p - A.xy - ab * t);
    if (d0 > 0.012 + 3.0 * pxm) continue;
    float grade = rdT(v, 1).x;
    float score = d0 - (grade > 2.5 ? 19.0 : grade > 1.5 ? 5.0 : grade > 0.5 ? 3.6 : 2.6) * M - grade * 0.5 * M;   // where roads meet, the bigger road is on top
    if (score < best) { best = score; bv = v; bt = t; btr = tr; }
  }
  if (bv < 0) return vec4(0.0);
  vec4 A = rdT(bv, 0), B = rdT(bv + 1, 0), I = rdT(bv, 1), J = rdT(bv + 1, 1);
  vec2 ab = B.xy - A.xy;
  vec2 dir = normalize(ab), nrm = vec2(-dir.y, dir.x);
  vec2 q = A.xy + ab * bt;
  float bS = mix(A.z, B.z, bt) / M, bGrade = I.x, bYellow = I.z;
  float n = dot(p - q, nrm), along = dot(p - q, dir);
  float w0 = 0.0, dw = 0.0;
  if (wobOn > 0.0) {
    // no bends at a cell's centre, where the road meets towns, villages and other roads
    float env = wobOn * sstep(0.004, 0.03, length(fract(q) - 0.5));
    float hill = mix(I.y, J.y, bt);
    w0 = rdWob(bS, hill, I.w) * env;
    dw = (rdWob(bS + 4.0, hill, I.w) - rdWob(bS - 4.0, hill, I.w)) * env / 8.0;
    w0 *= M;
  }
  float bAcross = (n - w0) / sqrt(1.0 + dw * dw);
  if (btr < 0.0 || btr > 1.0) bAcross = sign(n - w0 + 1e-9) * length(vec2(along, n - w0));
  best = abs(bAcross) - max((bGrade > 2.5 ? 19.0 : bGrade > 1.5 ? 5.0 : bGrade > 0.5 ? 3.6 : 2.6) * M, 0.6 * pxm);
  if (best > 2.0 * pxm) return vec4(0.0);
  int G = int(bGrade + 0.5);
  float a = abs(bAcross) / M;         // metres from the centre line
  float halfM = G == 3 ? 19.0 : G == 2 ? 5.0 : G == 1 ? 3.6 : 2.6;
  // far out: a thin line, pale like a road on a map, fading in as the real road gets wider than a pixel
  float minPx = G == 3 ? 1.6 : G == 2 ? 1.25 : 1.0;
  float shown = max(halfM, 0.5 * minPx * pxmM);
  float cover = rdBand(a, -shown, shown, pxmM);
  float farA = G == 3 ? 0.95 : G == 2 ? 0.8 : G == 1 ? 0.6 : 0.45;
  vec3 farCol = G == 3 ? vec3(0.95, 0.90, 0.74) : G == 2 ? vec3(0.86, 0.84, 0.78) : G == 1 ? vec3(0.76, 0.73, 0.66) : vec3(0.70, 0.62, 0.48);
  float real = sstep(0.9, 2.6, 2.0 * halfM / pxmM);
  // close up: the road as it is built
  float grain = vnoise(p / (1.2 * M), 7120) - 0.5;
  vec3 c = vec3(0.0);
  float ca = 0.0;
  bool bridge = water > 0.3 && G >= 1;
  if (G == 0) {
    // a dirt track: worn earth, two wheel ruts, grass down the middle
    c = vec3(0.60, 0.53, 0.40) * (1.0 + 0.12 * grain);
    float rut = rdLine(a, 0.85, 0.5, pxmM);
    c = mix(c, vec3(0.47, 0.41, 0.31), 0.55 * rut);
    c = mix(c, vec3(0.42, 0.46, 0.30), 0.35 * rdBand(a, 0.0, 0.35, pxmM));
    ca = rdBand(a, -2.6, 2.6, pxmM) * (1.0 - 0.65 * water);   // a ford: the water runs over it
  } else if (G == 1) {
    // a gravel road: pale stones, darker where the wheels run
    c = vec3(0.64, 0.61, 0.55) * (1.0 + 0.08 * grain);
    c = mix(c, vec3(0.55, 0.53, 0.48), 0.4 * rdLine(a, 1.6, 1.0, pxmM));
    ca = rdBand(a, -3.6, 3.6, pxmM);
  } else if (G == 2) {
    // two lanes of asphalt with gravel shoulders
    vec3 asph = vec3(0.21, 0.21, 0.22) * (1.0 + 0.10 * grain);
    c = mix(vec3(0.56, 0.53, 0.46), asph, rdBand(a, 0.0, 3.75, pxmM));
    c = mix(c, vec3(0.25, 0.25, 0.26), 0.5 * rdLine(a, 1.9, 0.8, pxmM));   // worn lighter where the wheels run
    c = mix(c, vec3(0.92, 0.92, 0.88), 0.9 * rdLine(a, 3.55, 0.15, pxmM));   // white edge lines
    if (bYellow > 0.5) c = mix(c, vec3(0.93, 0.74, 0.20), 0.95 * rdLine(a, 0.12, 0.12, pxmM));   // double yellow centre
    else c = mix(c, vec3(0.94, 0.94, 0.90), 0.9 * rdLine(a, 0.0, 0.15, pxmM) * rdDash(bS, 12.0, 0.25, pxmM));   // dashed white centre
    ca = rdBand(a, -5.0, 5.0, pxmM);
  } else {
    // a motorway: grass median with a barrier, two carriageways of three lanes, hard shoulders, grass verges
    vec3 asph = vec3(0.23, 0.23, 0.24) * (1.0 + 0.10 * grain);
    c = mix(vec3(0.36, 0.42, 0.26) * (1.0 + 0.1 * grain), vec3(0.62, 0.61, 0.58), rdLine(a, 0.0, 0.7, pxmM));   // median and barrier
    c = mix(c, asph, rdBand(a, 2.0, 16.0, pxmM));
    c = mix(c, vec3(0.20, 0.20, 0.21), 0.5 * (rdLine(a, 4.75, 1.4, pxmM) + rdLine(a, 8.25, 1.4, pxmM) + rdLine(a, 11.75, 1.4, pxmM)));   // oil down each lane
    c = mix(c, vec3(0.93, 0.76, 0.22), 0.95 * rdLine(a, 3.0, 0.2, pxmM));   // yellow inner edge
    float dash = rdDash(bS, 18.0, 0.33, pxmM);
    c = mix(c, vec3(0.94, 0.94, 0.90), 0.9 * dash * (rdLine(a, 6.5, 0.15, pxmM) + rdLine(a, 10.0, 0.15, pxmM)));   // lane lines
    c = mix(c, vec3(0.94, 0.94, 0.90), 0.95 * rdLine(a, 13.5, 0.25, pxmM));   // white outer edge
    c = mix(c, vec3(0.47, 0.50, 0.36), rdBand(a, 16.0, 19.0, pxmM));   // mown verge
    ca = rdBand(a, -19.0, 19.0, pxmM);
  }
  if (bridge) {
    // on a bridge: a concrete deck with dark parapets, and its shadow on the water beside it
    float deck = halfM + 1.2;
    vec3 inner = G == 3 ? c : mix(vec3(0.60, 0.59, 0.56), c, rdBand(a, 0.0, halfM - 1.0, pxmM));
    c = mix(inner, vec3(0.30, 0.30, 0.30), rdLine(a, deck - 0.4, 0.5, pxmM));
    c = mix(c, vec3(0.60, 0.59, 0.56), rdBand(a, deck - 0.2, deck, pxmM));
    ca = rdBand(a, -deck, deck, pxmM);
    float shadow = (bAcross > 0.0 ? 1.0 : 0.0) * rdBand(a, deck, deck + 8.0, pxmM);
    if (ca < 0.01 && shadow > 0.0) return vec4(vec3(0.0), 0.35 * shadow);
  }
  vec3 col = mix(farCol, c, real);
  float al = mix(cover * farA, ca, real);
  return vec4(col, clamp(al, 0.0, 1.0));
}
`;
}
