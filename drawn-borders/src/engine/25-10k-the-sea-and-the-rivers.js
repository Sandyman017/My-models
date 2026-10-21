/* =====================================================================
   10k. The sea and the rivers
   Ports you build in three steps, ships you build or buy, fleets that hold sea zones, convoys that carry
   soldiers, settlers, supplies and trade, blockades, landings, and rivers that carry barges and slow armies.
   The geography is worked out from the world itself, so worlds saved before version 19 keep their seas.
   Real figures behind the numbers: a Liberty ship carried about 10,000 tons at 11 knots; armies of the 1940s
   needed about 5 tons of shipping per soldier sent to a port and 9 per soldier landed on a beach; one berth with
   cranes loaded about 1,500 tons a day; a Fletcher-class destroyer displaced 2,050 tons, a Cleveland-class
   cruiser 11,800.
   ===================================================================== */

/* ---------- Geography of the sea: the open ocean, its zones and their names ---------- */
const SEA_GEO_V = 1;
const SEA_NAME_TAILS = ["a", "ia", "is", "or", "en", "ar", "ane", "ova", "ica", "esh", "um", "eth", "wyn", "mere", "ven", "ara", "ine"];
function seaNameAt(w, cell, salt) {
  const h1 = hash2(cell, 911 + salt, w.seed + 71), h2 = hash2(911 + salt, cell, w.seed + 73);
  return NAME_HEADS[Math.floor(h1 * NAME_HEADS.length)] + SEA_NAME_TAILS[Math.floor(h2 * SEA_NAME_TAILS.length)];
}
/* Ships move between sea cells like this: 8 directions, but never across a corner of land. */
function seaSteps(w, ocean, c, fn) {
  const x = cellX(c), y = cellY(c);
  for (const [dx, dy] of DIRS8) {
    const X = x + dx, Y = y + dy;
    if (!inBounds(X, Y)) continue;
    const k = idx(X, Y);
    if (!ocean[k]) continue;
    if (dx && dy && (!ocean[idx(x + dx, y)] || !ocean[idx(x, y + dy)])) continue;
    fn(k, dx && dy ? 1.414 : 1);
  }
}
function seaGeo(w) {
  if (w._sea && w._sea.seed === w.seed && w._sea.v === SEA_GEO_V) return w._sea;
  // 1. the open ocean: the water that reaches the edge of the map; lakes are not navigable
  const body = new Int32Array(N_CELLS).fill(-1);
  const ocean = new Uint8Array(N_CELLS);
  let nb = 0;
  for (let i = 0; i < N_CELLS; i++) {
    if (w.terrain[i] !== T.SEA || body[i] >= 0) continue;
    const id = nb++, q = [i], cells = [];
    body[i] = id;
    let edge = false;
    while (q.length) {
      const c = q.pop(); cells.push(c);
      const x = cellX(c), y = cellY(c);
      if (x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1) edge = true;
      for (const [dx, dy] of DIRS4) { const X = x + dx, Y = y + dy; if (!inBounds(X, Y)) continue; const k = idx(X, Y); if (w.terrain[k] === T.SEA && body[k] < 0) { body[k] = id; q.push(k); } }
    }
    if (edge) for (const c of cells) ocean[c] = 1;
  }
  // 2. distance from land, for every ocean cell
  const shore = new Float32Array(N_CELLS).fill(Infinity);
  const sq = [];
  for (let i = 0; i < N_CELLS; i++) if (ocean[i] && DIRS8.some(([dx, dy]) => { const X = cellX(i) + dx, Y = cellY(i) + dy; return inBounds(X, Y) && w.terrain[idx(X, Y)] !== T.SEA; })) { shore[i] = 1; sq.push(i); }
  for (let qi = 0; qi < sq.length; qi++) { const c = sq[qi]; seaSteps(w, ocean, c, k => { if (shore[k] === Infinity) { shore[k] = shore[c] + 1; sq.push(k); } }); }
  const coast = [];
  for (let i = 0; i < N_CELLS; i++) if (ocean[i] && DIRS4.some(([dx, dy]) => { const X = cellX(i) + dx, Y = cellY(i) + dy; return inBounds(X, Y) && w.terrain[idx(X, Y)] !== T.SEA; })) coast.push(i);
  // 3. zone seeds spread along the coast, then every ocean cell joins the nearest seed by water
  const bfs = (sources, out) => {
    const d = out || new Float32Array(N_CELLS).fill(Infinity);
    const q = [];
    for (const s of sources) { d[s] = 0; q.push(s); }
    for (let qi = 0; qi < q.length; qi++) { const c = q[qi]; seaSteps(w, ocean, c, k => { if (d[k] > d[c] + 1) { d[k] = d[c] + 1; q.push(k); } }); }
    return d;
  };
  const seeds = [];
  if (coast.length) {
    seeds.push(coast.reduce((b, c) => (cellY(c) * 1000 + cellX(c) < cellY(b) * 1000 + cellX(b) ? c : b), coast[0]));
    let d = bfs(seeds);
    for (let k = 0; k < 40; k++) {
      let best = -1, bd = -1;
      for (const c of coast) if (d[c] !== Infinity && d[c] > bd) { bd = d[c]; best = c; }
      if (best < 0 || bd < 11) break;
      seeds.push(best);
      const d2 = bfs([best]);
      for (let i = 0; i < N_CELLS; i++) if (d2[i] < d[i]) d[i] = d2[i];
    }
  }
  const zone = new Int16Array(N_CELLS).fill(-1);
  {
    const q = [];
    seeds.forEach((s, k) => { zone[s] = k; q.push(s); });
    for (let qi = 0; qi < q.length; qi++) { const c = q[qi]; seaSteps(w, ocean, c, k => { if (zone[k] < 0) { zone[k] = zone[c]; q.push(k); } }); }
  }
  // 4. tiny zones (in narrow inlets) join the neighbour they touch most
  let count = seeds.length;
  for (let pass = 0; pass < 3; pass++) {
    const size = new Array(count).fill(0);
    for (let i = 0; i < N_CELLS; i++) if (zone[i] >= 0) size[zone[i]]++;
    let changed = false;
    for (let z = 0; z < count; z++) {
      if (size[z] === 0 || size[z] >= 30) continue;
      const touch = new Map();
      for (let i = 0; i < N_CELLS; i++) if (zone[i] === z) for (const [dx, dy] of DIRS4) { const X = cellX(i) + dx, Y = cellY(i) + dy; if (!inBounds(X, Y)) continue; const o = zone[idx(X, Y)]; if (o >= 0 && o !== z) touch.set(o, (touch.get(o) || 0) + 1); }
      const to = [...touch.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!to) continue;
      for (let i = 0; i < N_CELLS; i++) if (zone[i] === z) zone[i] = to[0];
      size[to[0]] += size[z]; size[z] = 0; changed = true;
    }
    if (!changed) break;
  }
  // renumber, so zone ids run 0..n-1 in seed order
  const remap = new Map();
  for (let k = 0; k < seeds.length; k++) {
    const z = zone[seeds[k]];
    if (z >= 0 && !remap.has(z)) remap.set(z, remap.size);
  }
  for (let i = 0; i < N_CELLS; i++) if (zone[i] >= 0) zone[i] = remap.has(zone[i]) ? remap.get(zone[i]) : zone[i];
  count = remap.size;
  // 5. each zone: its size, where its name sits, how enclosed it is, who its neighbours are
  const zones = Array.from({ length: count }, (_, id) => ({ id, cells: 0, coastCells: 0, sx: 0, sy: 0, sn: 0, enclosed: 0, en: 0, adj: new Set(), label: -1, anchor: -1, name: "", kind: "Sea", seed: -1 }));
  for (const [z, k] of remap) zones[k].seed = seeds[z];
  for (let i = 0; i < N_CELLS; i++) {
    const z = zone[i];
    if (z < 0) continue;
    const Z = zones[z];
    Z.cells++;
    if (shore[i] <= 6) { Z.sx += cellX(i) + 0.5; Z.sy += cellY(i) + 0.5; Z.sn++; }
    if (shore[i] <= 3) {
      let land = 0, all = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const X = cellX(i) + dx, Y = cellY(i) + dy; all++; if (inBounds(X, Y) && w.terrain[idx(X, Y)] !== T.SEA) land++; }
      Z.enclosed += land / all; Z.en++;
    }
    if (shore[i] === 1) Z.coastCells++;
    for (const [dx, dy] of DIRS4) { const X = cellX(i) + dx, Y = cellY(i) + dy; if (!inBounds(X, Y)) continue; const o = zone[idx(X, Y)]; if (o >= 0 && o !== z) Z.adj.add(o); }
  }
  const used = new Set();
  for (const Z of zones) {
    Z.enclosed = Z.en ? Z.enclosed / Z.en : 0;
    const cx = Z.sn ? Z.sx / Z.sn : 0, cy = Z.sn ? Z.sy / Z.sn : 0;
    let best = -1, bd = Infinity, abest = -1, ad = Infinity;
    for (let i = 0; i < N_CELLS; i++) {
      if (zone[i] !== Z.id) continue;
      const dd = (cellX(i) + 0.5 - cx) ** 2 + (cellY(i) + 0.5 - cy) ** 2;
      if (shore[i] >= 2 && shore[i] <= 6 && dd < bd) { bd = dd; best = i; }
      if (shore[i] >= 2 && shore[i] <= 3 && dd < ad) { ad = dd; abest = i; }
    }
    if (best < 0) for (let i = 0; i < N_CELLS; i++) if (zone[i] === Z.id) { best = i; break; }
    Z.label = best;
    Z.anchor = abest >= 0 ? abest : best;
    Z.kind = Z.enclosed > 0.37 ? "Gulf" : Z.enclosed > 0.3 ? "Bay" : "Sea";
    let nm = "";
    for (let salt = 0; salt < 30; salt++) { nm = seaNameAt(w, Z.seed >= 0 ? Z.seed : Z.label, salt); if (!used.has(nm)) break; }
    used.add(nm);
    Z.base = nm;
    Z.name = Z.kind === "Sea" ? `${nm} Sea` : `${Z.kind} of ${nm}`;
    Z.adj = [...Z.adj].sort((a, b) => a - b);
  }
  // 6. hops between zones
  const hops = zones.map(Z => {
    const d = new Array(count).fill(Infinity);
    d[Z.id] = 0;
    const q = [Z.id];
    for (let qi = 0; qi < q.length; qi++) for (const o of zones[q[qi]].adj) if (d[o] === Infinity) { d[o] = d[q[qi]] + 1; q.push(o); }
    return d;
  });
  // 7. how far each piece of land lies from the open sea, in cells
  const coastDist = new Float32Array(N_CELLS).fill(Infinity);
  const lq = [];
  for (let i = 0; i < N_CELLS; i++) {
    if (w.terrain[i] === T.SEA) continue;
    if (DIRS4.some(([dx, dy]) => { const X = cellX(i) + dx, Y = cellY(i) + dy; return inBounds(X, Y) && ocean[idx(X, Y)]; })) { coastDist[i] = 0; lq.push(i); }
  }
  for (let qi = 0; qi < lq.length; qi++) {
    const c = lq[qi];
    for (const [dx, dy] of DIRS4) { const X = cellX(c) + dx, Y = cellY(c) + dy; if (!inBounds(X, Y)) continue; const k = idx(X, Y); if (w.terrain[k] !== T.SEA && coastDist[k] === Infinity) { coastDist[k] = coastDist[c] + 1; lq.push(k); } }
  }
  w._sea = { seed: w.seed, v: SEA_GEO_V, ocean, zone, zones, shore, hops, coastDist, paths: new Map() };
  return w._sea;
}
function isOcean(w, i) { return i >= 0 && seaGeo(w).ocean[i] === 1; }
function zoneOf(w, i) { return i >= 0 ? seaGeo(w).zone[i] : -1; }
function zoneName(w, z) { const Z = seaGeo(w).zones[z]; return Z ? Z.name : "the open sea"; }

/* The cheapest route by sea between two ocean cells, as a list of cells (cached). */
function seaPath(w, from, to) {
  const G = seaGeo(w);
  if (!G.ocean[from] || !G.ocean[to]) return null;
  if (from === to) return { cells: [from], km: 0 };
  const key = `${from}>${to}`;
  if (G.paths.has(key)) return G.paths.get(key);
  const cost = new Float32Array(N_CELLS).fill(Infinity), prev = new Int32Array(N_CELLS).fill(-1), done = new Uint8Array(N_CELLS);
  cost[from] = 0;
  const open = [];
  heapPush(open, from, 0);
  while (open.length) {
    const c = heapPop(open);
    if (done[c]) continue;
    done[c] = 1;
    if (c === to) break;
    seaSteps(w, G.ocean, c, (k, step) => {
      // ships keep a little off the coast where they can
      const nc = cost[c] + step * (G.shore[k] <= 1 ? 1.15 : 1);
      if (nc < cost[k]) { cost[k] = nc; prev[k] = c; heapPush(open, k, nc); }
    });
  }
  let res = null;
  if (cost[to] !== Infinity) {
    const cells = [];
    for (let c = to; c !== -1; c = prev[c]) cells.push(c);
    cells.reverse();
    let km = 0;
    for (let k = 1; k < cells.length; k++) km += (cellX(cells[k]) !== cellX(cells[k - 1]) && cellY(cells[k]) !== cellY(cells[k - 1]) ? 70.7 : 50);
    res = { cells, km };
  }
  if (G.paths.size > 400) G.paths.clear();
  G.paths.set(key, res);
  return res;
}
/* The zones a route passes through, in order. */
function routeZones(w, cells) {
  const out = [];
  for (const c of cells) { const z = zoneOf(w, c); if (z >= 0 && out[out.length - 1] !== z) out.push(z); }
  return out;
}

/* Where a town meets the open sea: the ocean cell beside it (the most open one), or -1 for inland and lake towns. */
function portSeaCell(w, cell) {
  const G = seaGeo(w);
  let best = -1, bs = -1;
  for (const [dx, dy] of DIRS8) {
    const X = cellX(cell) + dx, Y = cellY(cell) + dy;
    if (!inBounds(X, Y)) continue;
    const k = idx(X, Y);
    if (!G.ocean[k]) continue;
    const s = G.shore[k] + (dx && dy ? 0 : 0.5);
    if (s > bs) { bs = s; best = k; }
  }
  return best;
}
/* A coast where troops can land: land beside the open sea (4 directions), not a mountain cliff. */
function beachSeaCell(w, cell) {
  if (!isLand(w, cell)) return -1;
  const G = seaGeo(w);
  for (const [dx, dy] of DIRS4) {
    const X = cellX(cell) + dx, Y = cellY(cell) + dy;
    if (inBounds(X, Y) && G.ocean[idx(X, Y)]) return portSeaCell(w, cell);
  }
  return -1;
}

/* ---------- Rivers: barges on the big ones, and every river a line to defend ---------- */
const RIVER_GEO_V = 1;
function riverGeo(w) {
  if (w._riv && w._riv.seed === w.seed && w._riv.v === RIVER_GEO_V) return w._riv;
  const F = riverField(w);
  const { R, GW, N, land, down, acc } = F;
  const cls = a => (a < 190 ? 1 : a < 520 ? 2 : a < 1400 ? 3 : 4);
  // the mouth each river pixel drains to, and the biggest flow in each basin
  const mouth = new Int32Array(N).fill(-2);
  const findMouth = p => {
    const stack = [];
    let c = p;
    while (c >= 0 && land[c] && mouth[c] === -2) { stack.push(c); c = down[c]; }
    const m = c < 0 ? -1 : land[c] ? mouth[c] : c;
    for (const s of stack) mouth[s] = m;
    return m;
  };
  const basinMax = new Map();
  for (let p = 0; p < N; p++) {
    if (!land[p] || acc[p] < 190) continue;
    const m = findMouth(p);
    basinMax.set(m, Math.max(basinMax.get(m) || 0, acc[p]));
  }
  const names = new Map(), usedNames = new Set();
  for (const [m, a] of [...basinMax.entries()].sort((x, y) => y[1] - x[1])) {
    if (a < 520) continue;
    let nm = "";
    for (let salt = 0; salt < 30; salt++) { nm = seaNameAt(w, m + 7, 50 + salt); if (!usedNames.has(nm)) break; }
    usedNames.add(nm);
    names.set(m, nm);
  }
  // crossings: a river (class 2 or more) running between the centres of two neighbouring cells
  const cross = new Map();
  const segHit = (ax, ay, bx, by, cx, cy, dx, dy) => {
    const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
    const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  for (let p = 0; p < N; p++) {
    if (!land[p] || acc[p] < 190) continue;
    const q = down[p];
    if (q < 0) continue;
    const ax = ((p % GW) + 0.5) / R, ay = (((p / GW) | 0) + 0.5) / R, bx = ((q % GW) + 0.5) / R, by = (((q / GW) | 0) + 0.5) / R;
    const c = cls(acc[p]);
    const x0 = Math.floor(Math.min(ax, bx) - 1), x1 = Math.floor(Math.max(ax, bx)), y0 = Math.floor(Math.min(ay, by) - 1), y1 = Math.floor(Math.max(ay, by));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (!inBounds(cx, cy)) continue;
      const a = idx(cx, cy);
      // to the east neighbour, and to the south neighbour
      if (inBounds(cx + 1, cy) && segHit(ax, ay, bx, by, cx + 0.5, cy + 0.5, cx + 1.5, cy + 0.5)) {
        const k = edgeKey(a, idx(cx + 1, cy)), old = cross.get(k);
        if (!old || old.cls < c) cross.set(k, { cls: c, basin: mouth[p] });
      }
      if (inBounds(cx, cy + 1) && segHit(ax, ay, bx, by, cx + 0.5, cy + 0.5, cx + 0.5, cy + 1.5)) {
        const k = edgeKey(a, idx(cx, cy + 1)), old = cross.get(k);
        if (!old || old.cls < c) cross.set(k, { cls: c, basin: mouth[p] });
      }
    }
  }
  // navigable water: cells crossed by a river of class 3 or more, joined into systems
  const cellsCls = riverCells(w);
  const nav = new Int16Array(N_CELLS).fill(-1);
  let systems = 0;
  for (let i = 0; i < N_CELLS; i++) {
    if (cellsCls[i] < 3 || nav[i] >= 0 || !isLand(w, i)) continue;
    const id = systems++, q = [i];
    nav[i] = id;
    while (q.length) {
      const c = q.pop();
      for (const [dx, dy] of DIRS8) { const X = cellX(c) + dx, Y = cellY(c) + dy; if (!inBounds(X, Y)) continue; const k = idx(X, Y); if (nav[k] < 0 && cellsCls[k] >= 3 && isLand(w, k)) { nav[k] = id; q.push(k); } }
    }
  }
  // the name of each navigable system: the basin of its biggest river
  const sysName = new Array(systems).fill(null);
  const sysBest = new Array(systems).fill(0);
  for (let p = 0; p < N; p++) {
    if (!land[p] || acc[p] < 520) continue;
    const i = idx(Math.floor((p % GW) / R), Math.floor(((p / GW) | 0) / R));
    const s = nav[i];
    if (s < 0 || acc[p] <= sysBest[s]) continue;
    sysBest[s] = acc[p];
    sysName[s] = names.get(mouth[p]) || null;
  }
  w._riv = { seed: w.seed, v: RIVER_GEO_V, cross, names, mouth, nav, systems, sysName };
  return w._riv;
}
/* The river between two neighbouring cells, if any: { cls, name } (cls 2 river, 3 big river, 4 great river). */
function riverBetween(w, a, b) {
  const r = riverGeo(w).cross.get(edgeKey(a, b));
  if (!r) return null;
  return { cls: r.cls, name: riverGeo(w).names.get(r.basin) || null };
}
function riverLabel(r) { return r && r.name ? `the ${r.name}` : "the river"; }
/* The navigable river cell a town can load barges from: its own cell or one beside it. */
function wharfCell(w, cell) {
  const RG = riverGeo(w);
  if (RG.nav[cell] >= 0) return cell;
  for (const [dx, dy] of DIRS4) { const X = cellX(cell) + dx, Y = cellY(cell) + dy; if (inBounds(X, Y) && RG.nav[idx(X, Y)] >= 0) return idx(X, Y); }
  return -1;
}
function riverSystemName(w, cell) {
  const RG = riverGeo(w), s = RG.nav[cell];
  return s >= 0 && RG.sysName[s] ? `the ${RG.sysName[s]}` : "the river";
}

/* ---------- Ports, ships and the numbers behind them ---------- */
const PORT_LEVELS = [
  null,
  { key: "harbor", label: "Harbor", costB: 12, seasons: 1, upkeepB: 0.25, berths: 2, tradeMt: 20, slips: 0,
    does: "Quays for merchant ships: sea trade and the world market for every town on its road network, a base for fishing fleets, and a place where soldiers can board ships." },
  { key: "port", label: "Port and shipyard", costB: 10, seasons: 2, upkeepB: 0.4, berths: 5, tradeMt: 50, slips: 4,
    does: "Five berths with cranes load ships two and a half times as fast, more trade can pass, and four slipways build freighters and destroyers." },
  { key: "naval", label: "Naval base", costB: 16, seasons: 3, upkeepB: 0.7, berths: 8, tradeMt: 80, slips: 8,
    does: "Dry docks, arsenals and shore batteries: eight slipways that can also build cruisers, quick repairs for damaged warships, and coastal guns that make the town hard to take from the sea." },
];
const SHIP_TYPES = {
  freighter: { label: "Freighter", plural: "Freighters", like: "a Liberty ship of the 1940s", tons: 10000, disp: 14000, knots: 11, crew: 44, costB: 0.04, seasons: 1, upkeepB: 0.0008, yard: 2,
    attack: 0, hull: 1, escort: 0, raid: 0, oil: 0.004,
    does: "Carries 10,000 tons: about 2,000 soldiers with their weapons, a town's food and goods, or trade. Unarmed." },
  destroyer: { label: "Destroyer", plural: "Destroyers", like: "a Fletcher-class destroyer", tons: 2050, disp: 2050, knots: 36, crew: 330, costB: 0.6, seasons: 3, upkeepB: 0.012, yard: 2,
    attack: 3, hull: 3, escort: 2, raid: 1, oil: 0.008,
    does: "Fast and cheap. Guards convoys against raiders and hunts enemy merchant ships." },
  cruiser: { label: "Cruiser", plural: "Cruisers", like: "a Cleveland-class cruiser", tons: 11800, disp: 11800, knots: 32, crew: 1250, costB: 1.6, seasons: 6, upkeepB: 0.035, yard: 3,
    attack: 10, hull: 10, escort: 0.5, raid: 2, oil: 0.016,
    does: "Heavy guns that win sea battles and hold the sea lanes, and shell the coast to cover a landing." },
};
const SHIP_ORDER = ["freighter", "destroyer", "cruiser"];
const WARSHIPS = ["destroyer", "cruiser"];
const SEA = {
  berthTonsDay: 1500,     // tons a day one berth with cranes loads (with lighters only about 800)
  kmPerDay: 489,          // 11 knots, the speed of a loaded freighter
  tonsPerMan: { inf: 5, art: 7, arm: 12 },   // shipping per soldier with his weapons, vehicles and first supplies, into a port
  beachFactor: 1.8,       // loaded for a landing on a beach: about 9 tons per infantryman
  beachDays: 4,           // the assault waves get ashore in the first days
  beachTonsDay: 8000,     // then landing craft, lighters and amphibious trucks bring in about 8,000 tons a day
  seasonDays: 90,
  supplyPerDiv: { inf: 1, art: 1, arm: 2 },  // freighters that keep a division supplied across the sea
  linkPerM: 4,            // freighters that join a cut-off town of 1M people to the national market
  tradeMtPerFreighter: 0.12,   // million tons a year one freighter carries on trade routes: 12 voyages of 10,000 tons
  freightRate: 25, warFreightRate: 75,   // $ a ton charged by foreign shipowners, in peace and when war is at sea
  neutralShareWar: 0.4,   // the share of foreign ships still willing to come when an enemy with warships is at war with you
  settlerFreighters: 2,
  buyFreighterB: 0.06, buyPerSeason: 6, buyWarshipMult: 1.3,
  wharfB: 3, wharfUpkeepB: 0.05,
  tonsPerUnit: { food: 1, timber: 2, metals: 2, coal: 4, oil: 2.5, gold: 0, power: 0, goods: 0.4, machinery: 0.3, chemicals: 1, electronics: 0.05 },
  raidRate: 0.15,
};

function portLevel(c) { return c && c.port ? clamp(c.portLvl || 1, 1, 3) : 0; }
function portSpec(c) { return PORT_LEVELS[portLevel(c)] || null; }
function oceanPort(w, c) { return portLevel(c) > 0 && portSeaCell(w, c.cell) >= 0; }
function portZoneOf(w, c) { const s = portSeaCell(w, c.cell); return s >= 0 ? zoneOf(w, s) : -1; }

function seaState(g) {
  if (!g.sea) g.sea = { fleets: [], presence: {}, ctl: {}, trade: {}, supplyNeed: {}, supplyOk: {}, busy: {}, reports: [], news: [], names: {}, fleetCount: {}, blockaded: [], losses: {}, links: {} };
  const S = g.sea;
  for (const k of ["presence", "ctl", "trade", "supplyNeed", "supplyOk", "busy", "names", "fleetCount", "losses", "links"]) if (!S[k]) S[k] = {};
  for (const k of ["fleets", "reports", "news", "blockaded"]) if (!S[k]) S[k] = [];
  return S;
}

/* Who is at sea in a zone, after last season's battles: our side, the enemy, and what each can do. */
function zonePowers(g, z, nid) {
  const S = g.sea;
  let own = 0, foe = 0, raid = 0, escort = 0, foeNids = [];
  if (!S || !S.presence) return { own, foe, raid, escort, foeNids };
  const allies = alliesOf(g, nid);
  for (const p of S.presence[z] || []) {
    if (p.nid === nid || allies.includes(p.nid)) { own += p.power; escort += p.escort; }
    else if (atWar(g, p.nid, nid)) { foe += p.power; raid += p.raid; foeNids.push(p.nid); }
  }
  return { own, foe, raid, escort, foeNids };
}
function zoneHostile(g, z, nid) { const p = zonePowers(g, z, nid); return p.foe > 0 && p.own <= 0; }
function zoneThreat(g, z, nid) { return zonePowers(g, z, nid).foe > 0; }
function portBlockadedFor(w, g, c, nid) { const z = portZoneOf(w, c); return z >= 0 && zoneHostile(g, z, nid === undefined ? c.owner : nid); }
/* A port a nation can use right now: on the open sea, held by it or an ally, and not blockaded. */
function portUsableBy(w, g, c, nid) {
  if (!oceanPort(w, c)) return false;
  const ctl = controller(g, c.cell);
  if (ctl !== nid && !alliesOf(g, nid).includes(ctl)) return false;
  return !portBlockadedFor(w, g, c, nid);
}
/* A route by sea is safe for a nation when no zone on it is held by an enemy. Returns the zones, or null. */
function safeZoneRoute(w, g, nid, fromZone, toZone) {
  const G = seaGeo(w);
  if (fromZone < 0 || toZone < 0) return null;
  const bad = z => zoneHostile(g, z, nid);
  if (bad(fromZone) || bad(toZone)) return null;
  const prev = new Array(G.zones.length).fill(-2);
  prev[fromZone] = -1;
  const q = [fromZone];
  for (let qi = 0; qi < q.length; qi++) {
    const z = q[qi];
    if (z === toZone) break;
    for (const o of G.zones[z].adj) if (prev[o] === -2 && !bad(o)) { prev[o] = z; q.push(o); }
  }
  if (prev[toZone] === -2) return null;
  const out = [];
  for (let z = toZone; z !== -1; z = prev[z]) out.push(z);
  return out.reverse();
}

/* ---------- Warships and fleets ---------- */
function shipStrength(s) { return SHIP_TYPES[s.type].attack * Math.sqrt(Math.max(0, s.hp)); }
function fleetPower(f) { return f.ships.reduce((a, s) => a + shipStrength(s), 0) * (0.5 + 0.5 * f.org); }
function fleetRaid(f) { return f.ships.reduce((a, s) => a + SHIP_TYPES[s.type].raid * s.hp, 0) * (0.5 + 0.5 * f.org); }
function fleetEscort(f) { return f.ships.reduce((a, s) => a + SHIP_TYPES[s.type].escort * s.hp, 0) * (0.5 + 0.5 * f.org); }
function fleetCounts(f) { const c = { destroyer: 0, cruiser: 0 }; for (const s of f.ships) c[s.type]++; return c; }
function fleetsOf(g, nid) { return g.sea ? g.sea.fleets.filter(f => f.owner === nid && f.ships.length) : []; }
function navyCounts(g, nid) {
  const c = { freighter: (g.nations[nid] && g.nations[nid].freighters) || 0, destroyer: 0, cruiser: 0 };
  for (const f of fleetsOf(g, nid)) for (const s of f.ships) c[s.type]++;
  return c;
}
/* Naval weight for diplomacy and the admirals: every warship, damaged ones counting less. */
function navyPower(g, nid) { return fleetsOf(g, nid).reduce((a, f) => a + f.ships.reduce((b, s) => b + shipStrength(s), 0), 0); }
function navyUpkeep(g, nid) {
  let b = ((g.nations[nid] && g.nations[nid].freighters) || 0) * SHIP_TYPES.freighter.upkeepB;
  for (const f of fleetsOf(g, nid)) for (const s of f.ships) b += SHIP_TYPES[s.type].upkeepB;
  return b;
}
function navyOil(g, nid) {
  let o = ((g.nations[nid] && g.nations[nid].freighters) || 0) * SHIP_TYPES.freighter.oil;
  for (const f of fleetsOf(g, nid)) for (const s of f.ships) o += SHIP_TYPES[s.type].oil;
  return o;
}
function portsUpkeep(cities) { return cities.reduce((s, c) => s + (c.port ? PORT_LEVELS[portLevel(c)].upkeepB : 0) + (c.wharf ? SEA.wharfUpkeepB : 0), 0); }

function newShipName(g, nid, type) {
  const S = seaState(g);
  const used = S.names[nid] || (S.names[nid] = []);
  let name = null;
  if (type === "cruiser") name = g.cities.filter(c => c.owner === nid).map(c => c.name).find(nm => !used.includes(nm)) || null;
  for (let k = 0; !name && k < 80; k++) {
    const h1 = hash2(g.nextId + k * 13, nid * 31 + 5, 4099), h2 = hash2(nid * 31 + 5, g.nextId + k * 17, 4111);
    const nm = NAME_HEADS[Math.floor(h1 * NAME_HEADS.length)] + NAME_TAILS[Math.floor(h2 * NAME_TAILS.length)];
    if (!used.includes(nm) && !g.cities.some(c => c.name === nm && c.owner !== nid)) name = nm;
  }
  name = name || `${SHIP_TYPES[type].label} ${used.length + 1}`;
  used.push(name);
  if (used.length > 300) used.splice(0, used.length - 300);
  return name;
}
function newFleet(w, g, nid, city, auto = true) {
  const S = seaState(g);
  S.fleetCount[nid] = (S.fleetCount[nid] || 0) + 1;
  const cell = city ? portSeaCell(w, city.cell) : -1;
  return { id: g.nextId++, owner: nid, name: `${ordinal(S.fleetCount[nid])} Fleet`, ships: [], cell, zone: cell >= 0 ? zoneOf(w, cell) : -1, port: city ? city.id : null, mission: "port", dest: null, destPort: null, auto, org: 1 };
}
/* A new ship joins the nation: freighters go to the merchant fleet, warships to a fleet in the port that launched them. */
function launchShip(w, g, nid, type, city) {
  const n = g.nations[nid];
  if (type === "freighter") { n.freighters = (n.freighters || 0) + 1; return null; }
  const S = seaState(g);
  let f = S.fleets.find(x => x.owner === nid && x.port === city.id && x.mission === "port" && x.dest === null && !x.destPort);
  if (!f) { f = newFleet(w, g, nid, city, true); S.fleets.push(f); }
  const s = { id: g.nextId++, type, name: newShipName(g, nid, type), hp: 1, built: g.turn };
  f.ships.push(s);
  return { ship: s, fleet: f };
}

/* ---------- Building and buying ships; enlarging ports; river wharves ---------- */
function yardSlips(c) { return portSpec(c) ? portSpec(c).slips : 0; }
// slipways busy at a yard: its own nation's ships, and ships it builds for buyers abroad
function slipsInUse(g, c) { return g.projects.filter(p => p.kind === "ships" && ((p.cityId === c.id && p.seller === undefined) || p.yardId === c.id)).reduce((s, p) => s + (p.yardId === c.id ? p.count : p.slips || 0), 0); }
function shipsOnOrder(g, nid) {
  const c = { freighter: 0, destroyer: 0, cruiser: 0 };
  for (const p of g.projects) if (p.kind === "ships" && p.nid === nid) c[p.ship] += p.count;
  return c;
}
function quoteShips(w, g, nid, city, type, count = 1) {
  const t = SHIP_TYPES[type];
  const fail = reason => ({ ok: false, kind: "ships", ship: type, cityId: city && city.id, reason });
  if (!t) return fail("Unknown ship.");
  if (!city || city.owner !== nid) return fail("Not your town.");
  if (g.occ[city.cell] >= 0) return fail(`${city.name} is occupied.`);
  if (!oceanPort(w, city)) return fail(city.port ? `${city.name}'s harbor is on a lake.` : `${city.name} has no harbor.`);
  if (portLevel(city) < t.yard) return fail(t.yard === 3 ? `${t.plural} are built only at a naval base.` : `Needs a shipyard: enlarge the harbor at ${city.name} to a port and shipyard.`);
  count = Math.max(1, Math.round(count));
  const free = yardSlips(city) - slipsInUse(g, city);
  if (free < count) return fail(free <= 0 ? `All ${yardSlips(city)} slipways at ${city.name} are busy.` : `Only ${free} slipway${free > 1 ? "s are" : " is"} free at ${city.name}.`);
  const cost = t.costB * count;
  return { ok: true, kind: "ships", nid, cityId: city.id, ship: type, count, slips: count, cost, seasons: t.seasons, dGdp: 0, dFood: 0, famineRelief: 0, value: 0,
    label: `${count > 1 ? `${count} ${t.plural.toLowerCase()}` : `${/^[aeiou]/i.test(t.label) ? "An" : "A"} ${t.label.toLowerCase()}`} from the yard at ${city.name}` };
}
/* Ships bought abroad: freighters from the world's shipowners, warships from a friendly nation's yards. */
function boughtThisSeason(g, nid) { return g.projects.filter(p => p.kind === "ships" && p.nid === nid && p.seller === -1 && p.ordered === g.turn).reduce((s, p) => s + p.count, 0); }
function receivingPort(w, g, nid) {
  const ports = g.cities.filter(c => c.owner === nid && portUsableBy(w, g, c, nid));
  return ports.sort((a, b) => portLevel(b) - portLevel(a) || (b.capital ? 1 : 0) - (a.capital ? 1 : 0))[0] || null;
}
function quoteBuyShips(w, g, nid, type, count = 1, seller = -1) {
  const t = SHIP_TYPES[type];
  const fail = reason => ({ ok: false, kind: "ships", ship: type, seller, reason });
  const port = receivingPort(w, g, nid);
  if (!port) return fail("You need a harbor on the open sea, not blockaded, to take delivery.");
  count = Math.max(1, Math.round(count));
  if (type === "freighter") {
    const left = SEA.buyPerSeason - boughtThisSeason(g, nid);
    if (left <= 0) return fail(`Shipowners abroad can sell you at most ${SEA.buyPerSeason} freighters a season.`);
    count = Math.min(count, left);
    return { ok: true, kind: "ships", nid, cityId: port.id, ship: type, count, slips: 0, seller: -1, cost: SEA.buyFreighterB * count, seasons: 1, dGdp: 0, dFood: 0, famineRelief: 0, value: 0,
      label: `${count} second-hand freighter${count > 1 ? "s" : ""} bought abroad` };
  }
  const s = g.nations[seller];
  if (!s || !s.alive || seller === nid) return fail("Choose a nation to buy from.");
  if (atWar(g, nid, seller)) return fail(`You are at war with the ${s.name}.`);
  if (!hasTreaty(g, nid, seller, "trade") && !hasTreaty(g, nid, seller, "alliance")) return fail(`The ${s.name} sells warships only to trade partners and allies.`);
  if (opinionDetail(g, seller, nid).value < -20) return fail(`The ${s.name} won't arm a nation it distrusts.`);
  const yards = g.cities.filter(c => c.owner === seller && oceanPort(w, c) && portLevel(c) >= t.yard && g.occ[c.cell] < 0);
  if (!yards.length) return fail(`The ${s.name} has no yard that can build ${t.plural.toLowerCase()}.`);
  const yard = yards.map(y => ({ y, free: yardSlips(y) - slipsInUse(g, y) })).sort((a, b) => b.free - a.free)[0];
  if (yard.free < count) return fail(yard.free <= 0 ? `The ${s.name}'s yards are full.` : `The ${s.name}'s yards can take only ${yard.free} more.`);
  return { ok: true, kind: "ships", nid, cityId: port.id, yardId: yard.y.id, ship: type, count, slips: 0, seller, cost: t.costB * count * SEA.buyWarshipMult, seasons: t.seasons, dGdp: 0, dFood: 0, famineRelief: 0, value: 0,
    label: `${count > 1 ? `${count} ${t.plural.toLowerCase()}` : `A ${t.label.toLowerCase()}`} bought from the ${s.name}` };
}
function quotePortUp(w, g, nid, city) {
  const fail = reason => ({ ok: false, kind: "portup", cityId: city && city.id, reason });
  if (!city || city.owner !== nid) return fail("Not your town.");
  const lvl = portLevel(city);
  if (!lvl) return fail(`${city.name} has no harbor yet.`);
  if (lvl >= 3) return fail(`${city.name} is already a naval base.`);
  if (!oceanPort(w, city)) return fail(`${city.name}'s harbor is on a lake; only sea ports can grow.`);
  if (g.occ[city.cell] >= 0) return fail(`${city.name} is occupied.`);
  if (busyCity(g, city.id, "portup")) return fail("The harbor is already being enlarged.");
  const next = PORT_LEVELS[lvl + 1];
  const econ = computeEconomy(w, g, nid);
  const r = econ.regions.find(x => x.city.id === city.id);
  if (lvl === 1 && (!r || r.pop < 0.3)) return fail(`A shipyard needs at least 300,000 people nearby to work it (${city.name} has ${r ? fmtCount(r.pop * 1e6) : "none"}).`);
  const value = projectValue(w, g, nid, { portUp: { cityId: city.id, level: lvl + 1 } }, econ);
  const room = portRoomValue(w, g, nid, next.tradeMt - PORT_LEVELS[lvl].tradeMt, econ);
  value.dGdp += room; value.value += room; value.room = room;
  return { ok: true, kind: "portup", nid, cityId: city.id, level: lvl + 1, cost: next.costB, seasons: next.seasons, ...value, label: `${next.label} at ${city.name}` };
}
/* What more room in the ports is worth: trade that full ports held back last season, let through. */
function portRoomValue(w, g, nid, addMt, econ) {
  const T = g.sea && g.sea.trade ? g.sea.trade[nid] : null;
  if (!T || !(T.mt > 0.05) || T.limit !== "ports") return 0;
  const foreign = T.mt * (T.war ? SEA.neutralShareWar : 1);
  const carry = Math.min(T.mt, T.cap + addMt, T.own + foreign);
  const share = clamp(carry / T.mt, 0, 1);
  if (share <= T.share + 0.005) return 0;
  const h = { ...g, sea: { ...g.sea, trade: { ...g.sea.trade, [nid]: { ...T, share } } } };
  return Math.max(0, computeEconomy(w, h, nid).gdp - (econ || computeEconomy(w, g, nid)).gdp);
}
function quoteWharf(w, g, nid, city) {
  const fail = reason => ({ ok: false, kind: "wharf", cityId: city && city.id, reason });
  if (!city || city.owner !== nid) return fail("Not your town.");
  if (city.wharf) return fail(`${city.name} already has a river wharf.`);
  if (wharfCell(w, city.cell) < 0) return fail(`${city.name} is not on a river big enough for barges.`);
  if (g.occ[city.cell] >= 0) return fail(`${city.name} is occupied.`);
  if (busyCity(g, city.id, "wharf")) return fail("A wharf is already being built here.");
  const value = projectValue(w, g, nid, { wharfCity: city.id });
  return { ok: true, kind: "wharf", nid, cityId: city.id, cost: SEA.wharfB, seasons: 1, ...value, label: `River wharf at ${city.name} on ${riverSystemName(w, wharfCell(w, city.cell))}` };
}
/* What finished projects of the sea do. Called from advanceProjects. */
function finishSeaProject(w, g, p) {
  const city = g.cities.find(c => c.id === p.cityId);
  if (p.kind === "portup") { if (city && city.owner === p.nid && city.port) city.portLvl = Math.max(portLevel(city), p.level); else p.failed = true; return; }
  if (p.kind === "wharf") { if (city && city.owner === p.nid) city.wharf = true; else p.failed = true; return; }
  if (p.kind === "ships") {
    let at = city && city.owner === p.nid && oceanPort(w, city) && g.occ[city.cell] < 0 ? city : receivingPort(w, g, p.nid);
    if (!at) at = g.cities.find(c => c.owner === p.nid && oceanPort(w, c));
    if (!at) { p.failed = true; g.nations[p.nid].treasury += p.cost * 0.5; return; }
    p.launched = [];
    for (let k = 0; k < p.count; k++) { const r = launchShip(w, g, p.nid, p.ship, at); if (r) p.launched.push(r.ship.name); }
    p.at = at.name;
  }
}

/* ---------- Troops by sea: shipping, days and the route ---------- */
function divTons(d, beach) { return Math.max(d.men, DIV_TYPES[d.type].men * 0.3) * (SEA.tonsPerMan[d.type] || 5) * (beach ? SEA.beachFactor : 1); }
function berthsAt(c) { return portSpec(c) ? portSpec(c).berths : 1; }
/* Freighters that can be called on this season: the whole merchant fleet less what supply runs and settlers need. */
function freightersReserved(g, nid) {
  const S = g.sea;
  let r = S && S.supplyNeed ? S.supplyNeed[nid] || 0 : 0;
  r += g.projects.filter(p => p.kind === "town" && p.nid === nid && p.overseas).length * SEA.settlerFreighters;
  return r;
}
function voyageFreighters(g, nid) {
  // convoys about to sail this season from ports the divisions already stand in
  let n = 0;
  const groups = new Map();
  for (const d of g.divisions) {
    if (d.owner !== nid || !d.voyage) continue;
    const port = g.cities.find(c => c.id === d.voyage.embark);
    if (!port || dist(d.cell, port.cell) > 1.5) continue;
    const key = `${d.voyage.embark}>${d.voyage.to}>${d.voyage.kind}`;
    groups.set(key, (groups.get(key) || 0) + divTons(d, d.voyage.kind === "beach"));
  }
  for (const t of groups.values()) n += Math.ceil(t / SHIP_TYPES.freighter.tons);
  return n;
}
function freeFreighters(g, nid) { return Math.max(0, ((g.nations[nid] && g.nations[nid].freighters) || 0) - freightersReserved(g, nid) - voyageFreighters(g, nid)); }

/* The whole plan for sending divisions to a target across the sea: where they board, the voyage, the shipping,
   the days, and the dangers on the way. Used for your orders, the generals' and the tooltip. */
function seaMovePlan(w, g, divs, target, forceEmbark) {
  const nid = divs[0].owner;
  const fail = reason => ({ ok: false, reason });
  if (target < 0 || !isLand(w, target)) return fail("Choose a coast to land on, or one of your ports.");
  const destCity = g.cities.find(c => c.cell === target);
  let kind = "beach", destSea = -1;
  if (destCity && portUsableBy(w, g, destCity, nid)) { kind = "port"; destSea = portSeaCell(w, destCity.cell); }
  else {
    destSea = beachSeaCell(w, target);
    if (destSea < 0) return fail(destCity && destCity.port && controller(g, destCity.cell) === nid ? `${destCity.name}'s harbor is blockaded.` : "That land doesn't touch the open sea.");
    if (w.terrain[target] === T.MOUNTAIN) return fail("Mountain cliffs: there is no beach to land on there.");
    const ctl = controller(g, target);
    if (ctl >= 0 && ctl !== nid && !alliesOf(g, nid).includes(ctl) && !atWar(g, nid, ctl)) return fail(`That coast is held by the ${nameOf(g, ctl)}, and you are not at war with them.`);
  }
  const ports = forceEmbark ? (portUsableBy(w, g, forceEmbark, nid) && controller(g, forceEmbark.cell) === nid ? [forceEmbark] : [])
    : g.cities.filter(c => controller(g, c.cell) === nid && portUsableBy(w, g, c, nid) && (destCity ? c.id !== destCity.id : true));
  if (!ports.length) return fail(forceEmbark ? `${forceEmbark.name} can't send ships out: it is blockaded or lost.` : "You need a harbor on the open sea, not blockaded, for troops to board.");
  const lead = divs.find(d => !d.training) || divs[0];
  let best = null;
  for (const p of ports) {
    const near = dist(lead.cell, p.cell) <= 1.5;
    const land = near ? { path: [], seasons: 0, cost: 0 } : findDivPath(w, g, lead, p.cell);
    if (!land) continue;
    const ps = portSeaCell(w, p.cell);
    const sea = seaPath(w, ps, destSea);
    if (!sea) continue;
    const score = land.seasons * 90 + sea.km / SEA.kmPerDay + (near ? 0 : 5);
    if (!best || score < best.score) best = { port: p, land, sea, score };
  }
  if (!best) return fail("None of your ports can be reached by land from here.");
  const tons = divs.reduce((s, d) => s + divTons(d, kind === "beach"), 0);
  const freighters = Math.ceil(tons / SHIP_TYPES.freighter.tons);
  const load = tons / (berthsAt(best.port) * SEA.berthTonsDay);
  const sail = best.sea.km / SEA.kmPerDay * (seasonWar(g).sail || 1);
  const unload = kind === "port" ? tons / (berthsAt(destCity) * SEA.berthTonsDay) : SEA.beachDays + tons / SEA.beachTonsDay;
  const days = load + sail + unload;
  const zones = routeZones(w, best.sea.cells);
  const threats = zones.filter(z => zoneThreat(g, z, nid)).map(z => ({ z, hostile: zoneHostile(g, z, nid), name: zoneName(w, z) }));
  const have = Math.max(0, ((g.nations[nid] && g.nations[nid].freighters) || 0) - freightersReserved(g, nid));
  const landSeasons = best.land.seasons + Math.max(0, ...divs.map(d => d.training || 0));
  return {
    ok: true, nid, kind, target, destCity: destCity || null, embark: best.port, landPath: best.land.path, landSeasons, sea: best.sea.cells, km: best.sea.km, zones, threats,
    tons, freighters, have, enough: have >= freighters, load, sail, unload, days, seasons: landSeasons + (days > SEA.seasonDays ? 2 : 1), count: divs.length,
    defenders: g.divisions.filter(e => e.cell === target && atWar(g, nid, e.owner)).length,
  };
}
function fmtDays(d) { const r = Math.max(1, Math.round(d)); return `${r} day${r > 1 ? "s" : ""}`; }
function seaPlanText(w, g, plan, short) {
  const t = plan.kind === "port" ? plan.destCity.name : placeNameW(w, g, plan.target);
  const legs = `${fmtCount(plan.tons)} t on ${plan.freighters} freighter${plan.freighters > 1 ? "s" : ""}: loading ${fmtDays(plan.load)} at ${plan.embark.name}, ${fmtDays(plan.sail)} at sea, ${plan.kind === "port" ? `unloading ${fmtDays(plan.unload)}` : `${fmtDays(plan.unload)} getting ashore`}`;
  if (short) return `${plan.kind === "port" ? "Ship" : "Land"} at ${t} from ${plan.embark.name} · ${plan.seasons} season${plan.seasons > 1 ? "s" : ""} · ${plan.freighters} freighters`;
  return `${plan.kind === "port" ? `By sea to ${t}` : `Landing at ${t}`} · ${legs}`;
}
function placeNameW(w, g, cell) {
  const town = g.cities.find(c => c.cell === cell);
  if (town) return town.name;
  let best = null, bd = 5;
  for (const c of g.cities) { const d = dist(c.cell, cell); if (d < bd) { bd = d; best = c; } }
  const t = TERRAIN[w.terrain[cell]] ? TERRAIN[w.terrain[cell]].name.toLowerCase() : "coast";
  return best ? `the ${t} near ${best.name}` : `the open ${t}`;
}
/* Give divisions a sea order: they march to the port (if they aren't there), board, sail and land. */
function setVoyage(w, g, divs, plan) {
  const ok = [];
  for (const d of divs) {
    const near = dist(d.cell, plan.embark.cell) <= 1.5;
    const p = near ? null : findDivPath(w, g, d, plan.embark.cell);
    if (!near && !p) continue;
    d.voyage = { embark: plan.embark.id, to: plan.target, kind: plan.kind, ordered: g.turn };
    d.path = near ? [] : p.path;
    ok.push(d);
  }
  return ok;
}
/* Names for forces and ships in the news, from the point of view of whoever reads it. */
function forceLabel(g, divs) {
  const nid = divs[0].owner;
  if (divs.length === 1) return nid === PLAYER ? `the ${divs[0].name}` : `the ${nameOf(g, nid)}'s ${divs[0].name}`;
  return nid === PLAYER ? `${divs.length} divisions` : `${divs.length} divisions of the ${nameOf(g, nid)}`;
}
function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function whoseShips(g, nid) { return nid === PLAYER ? "Your warships" : `Warships of the ${nameOf(g, nid)}`; }

/* ---------- The national market across water: barges on rivers, freighters between ports ---------- */
/* Road networks joined by river wharves (same navigable river, through our own or wild land) and by sea (a cut-off
   network with a usable port, joined to the capital's network when a safe route and enough freighters exist). */
function joinNetworks(w, g, nid, cities, regions, base) {
  const { netOf, count } = base;
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b; } };
  const byRiver = new Set(), bySea = new Set(), links = [];
  // 1. barges
  const wh = [];
  cities.forEach((c, k) => { if (c.wharf) { const cell = wharfCell(w, c.cell); if (cell >= 0) wh.push({ k, cell }); } });
  if (wh.length > 1) {
    const RG = riverGeo(w);
    const ok = i => RG.nav[i] >= 0 && (g.owner[i] === nid || g.owner[i] === -1) && !(g.occ && g.occ[i] >= 0);
    const label = new Int32Array(N_CELLS).fill(-1);
    for (const a of wh) {
      if (!ok(a.cell) || label[a.cell] >= 0) continue;
      label[a.cell] = a.k;
      const q = [a.cell];
      while (q.length) {
        const c = q.pop();
        for (const [dx, dy] of DIRS8) { const X = cellX(c) + dx, Y = cellY(c) + dy; if (!inBounds(X, Y)) continue; const k = idx(X, Y); if (label[k] < 0 && ok(k)) { label[k] = a.k; q.push(k); } }
      }
    }
    const groups = new Map();
    for (const a of wh) { if (!ok(a.cell)) continue; const L = label[a.cell]; if (!groups.has(L)) groups.set(L, []); groups.get(L).push(a.k); }
    for (const list of groups.values()) for (let i = 1; i < list.length; i++) {
      if (find(netOf[list[0]]) !== find(netOf[list[i]])) { byRiver.add(cities[list[0]].id); byRiver.add(cities[list[i]].id); }
      union(netOf[list[0]], netOf[list[i]]);
    }
  }
  // 2. ships
  const n = g.nations[nid];
  const capK = cities.findIndex(c => c.capital);
  let free = n && g.sea ? Math.max(0, (n.freighters || 0) - freightersReserved(g, nid) - voyageFreighters(g, nid)) : 0;
  if (capK >= 0 && free > 0) {
    const portsOf = root => cities.filter((c, k) => find(netOf[k]) === root && portUsableBy(w, g, c, nid));
    const home = portsOf(find(netOf[capK]));
    if (home.length) {
      const roots = [...new Set(netOf.map(k => find(k)))].filter(r => r !== find(netOf[capK]));
      const cand = roots.map(r => ({
        r, pop: regions.reduce((s, x, k) => s + (find(netOf[k]) === r ? x.pop : 0), 0), ports: portsOf(r),
        towns: cities.filter((c, k) => find(netOf[k]) === r),
      })).filter(x => x.ports.length).sort((a, b) => b.pop - a.pop);
      for (const x of cand) {
        const need = Math.max(1, Math.ceil(x.pop * SEA.linkPerM));
        if (need > free) continue;
        let route = null, pair = null;
        for (const h of home) for (const p of x.ports) {
          const r = safeZoneRoute(w, g, nid, portZoneOf(w, h), portZoneOf(w, p));
          if (r && (!route || r.length < route.length)) { route = r; pair = [h, p]; }
        }
        if (!route) continue;
        union(netOf[capK], x.r);
        free -= need;
        x.towns.forEach(c => bySea.add(c.id));
        links.push({ from: pair[0].id, to: pair[1].id, freighters: need, zones: route, pop: x.pop, towns: x.towns.map(c => c.id) });
      }
    }
  }
  // dense ids again
  const dense = new Map();
  const out = netOf.map(k => { const r = find(k); if (!dense.has(r)) dense.set(r, dense.size); return dense.get(r); });
  return { netOf: out, count: dense.size, byRiver, bySea, links, tradeFreighters: free };
}

/* Supply that comes by sea: ports we hold beyond the road network, and beachheads, when the sea behind them is open. */
function seaSupplySources(w, g, nid, econ) {
  const S = g.sea, n = g.nations[nid];
  if (!S || !n || !((n.freighters || 0) > 0) || S.supplyOk[nid] === false) return [];
  // any harbor of ours that ships can leave can send supplies
  const home = [...new Set(g.cities.filter(c => controller(g, c.cell) === nid && portUsableBy(w, g, c, nid)).map(c => portZoneOf(w, c)))];
  if (!home.length) return [];
  const memo = new Map();
  const reach = z => { if (!memo.has(z)) memo.set(z, home.some(h => !!safeZoneRoute(w, g, nid, h, z))); return memo.get(z); };
  const out = [];
  for (const c of g.cities) {
    if (controller(g, c.cell) !== nid || !oceanPort(w, c)) continue;
    const z = portZoneOf(w, c);
    if (reach(z)) out.push({ cell: c.cell, range: MIL.isolatedRange + 1 });
  }
  for (const d of g.divisions) {
    if (d.owner !== nid) continue;
    const s = beachSeaCell(w, d.cell);
    if (s < 0) continue;
    const ctl = controller(g, d.cell);
    if (ctl !== nid && ctl !== -1) continue;
    if (reach(zoneOf(w, s))) out.push({ cell: d.cell, range: 1 });
  }
  return out;
}

/* ---------- Fleets at sea: moving, fighting, holding zones ---------- */
function fleetCanDock(w, g, f, c) {
  if (!oceanPort(w, c)) return false;
  const ctl = controller(g, c.cell);
  return ctl === f.owner || alliesOf(g, f.owner).includes(ctl);
}
function nearestFleetPort(w, g, f, needYard) {
  let best = null, bk = Infinity;
  for (const c of g.cities) {
    if (!fleetCanDock(w, g, f, c) || (needYard && portLevel(c) < 2)) continue;
    const sc = portSeaCell(w, c.cell);
    const p = f.cell >= 0 ? seaPath(w, f.cell, sc) : { km: 0 };
    if (!p) continue;
    const k = p.km - portLevel(c) * 150 - (portBlockadedFor(w, g, c, f.owner) ? -2000 : 0);
    if (k < bk) { bk = k; best = c; }
  }
  return best;
}
function placeFleetAt(w, f, c) { f.port = c.id; f.cell = portSeaCell(w, c.cell); f.zone = zoneOf(w, f.cell); f.mission = "port"; }

/* A sea battle: like a land battle, every factor is listed. Side a is the one that sailed in, or the stronger. */
function seaBattle(w, g, z, A, B, rng) {
  const G = seaGeo(w);
  const a = A[0].owner, b = B[0].owner;
  const lines = [];
  const before = list => { const c = { destroyer: 0, cruiser: 0 }; list.forEach(f => f.ships.forEach(s => { c[s.type]++; })); return c; };
  const aShips = before(A), bShips = before(B);
  let pa = A.reduce((s, f) => s + fleetPower(f), 0), pb = B.reduce((s, f) => s + fleetPower(f), 0);
  const factor = (side, label, mult) => { if (Math.abs(mult - 1) < 0.005) return 1; lines.push({ label, mult, side }); return mult; };
  for (const [side, nid] of [["a", a], ["b", b]]) {
    let m = 1;
    const base = g.cities.find(c => c.owner === nid && portLevel(c) >= 3 && portZoneOf(w, c) === z && g.occ[c.cell] < 0);
    if (base) m *= factor(side, `Close to the naval base at ${base.name}: shore batteries and dockyards`, 1.15);
    const near = g.cities.some(c => controller(g, c.cell) === nid && oceanPort(w, c) && (portZoneOf(w, c) === z || G.zones[z].adj.includes(portZoneOf(w, c))));
    if (!near) m *= factor(side, `The ${nameOf(g, nid)} fights far from any friendly port`, 0.85);
    const fuel = (g.nations[nid] && g.nations[nid].fuelSat) ?? 1;
    if (fuel < 0.95) m *= factor(side, `The ${nameOf(g, nid)} is short of fuel oil`, 0.6 + 0.4 * fuel);
    if (hasTech(g.nations[nid], "electronics")) m *= factor(side, `Radar-directed guns (the ${nameOf(g, nid)})`, 1.1);
    if (side === "a") pa *= m; else pb *= m;
  }
  // planes from the shore: the side holding the sky, if the zone washes its coast
  const air = airBalance(g, a, b);
  if (Math.abs(air) > 0.1) {
    const who = air > 0 ? a : b;
    const shore = g.cities.some(c => c.owner === who && portSeaCell(w, c.cell) >= 0 && zoneOf(w, portSeaCell(w, c.cell)) === z) || zoneTouchesNation(w, g, z, who);
    if (shore) { const m = factor(air > 0 ? "a" : "b", `Planes from the ${nameOf(g, who)}'s airfields`, 1 + 0.25 * Math.abs(air)); if (air > 0) pa *= m; else pb *= m; }
  }
  const luck = 0.85 + 0.3 * rng();
  const R = (pa * luck) / Math.max(0.01, pb);
  const won = R >= 1;
  const sunk = { [a]: [], [b]: [] }, damaged = { [a]: [], [b]: [] };
  const hit = (fleets, frac, nid) => {
    const ships = fleets.flatMap(f => f.ships.map(s => ({ s, f })));
    const total = ships.reduce((t, x) => t + SHIP_TYPES[x.s.type].hull, 0);
    let dmg = frac * total, guard = 0;
    while (dmg > 0.05 && guard++ < 80) {
      const live = ships.filter(x => x.s.hp > 0.05);
      if (!live.length) break;
      let r = rng() * live.reduce((t, x) => t + SHIP_TYPES[x.s.type].hull, 0);
      let pick = live[live.length - 1];
      for (const x of live) { r -= SHIP_TYPES[x.s.type].hull; if (r <= 0) { pick = x; break; } }
      const hull = SHIP_TYPES[pick.s.type].hull;
      const blow = Math.min(dmg, hull * (0.45 + 0.7 * rng()));
      pick.s.hp -= blow / hull;
      dmg -= blow;
    }
    for (const x of ships) {
      if (x.s.hp <= 0.05) { sunk[nid].push({ name: x.s.name, type: x.s.type }); x.f.ships = x.f.ships.filter(y => y !== x.s); }
      else if (x.s.hp < 0.999) damaged[nid].push({ name: x.s.name, type: x.s.type, hp: x.s.hp });
    }
  };
  hit(B, clamp(0.32 * Math.sqrt(R), 0.06, 0.75), b);
  hit(A, clamp(0.32 / Math.sqrt(R), 0.06, 0.75), a);
  for (const f of A) { f.org = clamp(f.org - (won ? 0.2 : 0.45), 0, 1); f.fought = g.turn; }
  for (const f of B) { f.org = clamp(f.org - (won ? 0.45 : 0.2), 0, 1); f.fought = g.turn; }
  const losers = (won ? B : A).filter(f => f.ships.length);
  const retreated = [];
  for (const f of losers) {
    const to = nearestFleetPort(w, g, f);
    const from = f.cell;
    if (to) { placeFleetAt(w, f, to); retreated.push(`${f.name} to ${to.name}`); if (REC) REC.events.push({ t: "fleet", id: f.id, owner: f.owner, cells: (seaPath(w, from, f.cell) || { cells: [from, f.cell] }).cells, phase: "sea", step: 2 }); }
  }
  const cell = (B.find(f => f.cell >= 0) || A[0]).cell;
  return {
    sea: true, zone: z, zoneName: zoneName(w, z), cell, turn: g.turn, attacker: a, defender: b, won,
    attFleets: A.map(f => f.name), defFleets: B.map(f => f.name), aShips, bShips,
    attPower: Math.round(pa * 10), defPower: Math.round(pb * 10), ratio: Math.round(R * 100) / 100, lines, sunk, damaged, retreated,
  };
}
function zoneTouchesNation(w, g, z, nid) {
  const G = seaGeo(w);
  const key = `${z}|${nid}|${g.ver || 0}`;
  G.touch = G.touch || new Map();
  if (G.touch.has(key)) return G.touch.get(key);
  let yes = false;
  for (let i = 0; i < N_CELLS && !yes; i++) {
    if (G.zone[i] !== z) continue;
    for (const [dx, dy] of DIRS4) { const X = cellX(i) + dx, Y = cellY(i) + dy; if (inBounds(X, Y) && controller(g, idx(X, Y)) === nid) { yes = true; break; } }
  }
  if (G.touch.size > 500) G.touch.clear();
  G.touch.set(key, yes);
  return yes;
}

/* One season at sea, before the armies march: fleets sail and fight, zones change hands, ports are blockaded,
   and convoys carry divisions to ports and beaches. */
function resolveSea(w, g, rng) {
  const S = seaState(g);
  const G = seaGeo(w);
  const news = [], reports = [], landReports = [];
  S.used = {};
  S.fleets = S.fleets.filter(f => f.ships.length && g.nations[f.owner] && g.nations[f.owner].alive);
  // fleets whose harbor was lost look for another
  for (const f of S.fleets) {
    if (f.port === null) continue;
    const c = g.cities.find(x => x.id === f.port);
    if (c && fleetCanDock(w, g, f, c)) continue;
    const to = nearestFleetPort(w, g, f);
    const from = f.cell;
    if (to) {
      placeFleetAt(w, f, to);
      if (REC && from >= 0 && from !== f.cell) REC.events.push({ t: "fleet", id: f.id, owner: f.owner, cells: (seaPath(w, from, f.cell) || { cells: [from, f.cell] }).cells, phase: "sea", step: 0 });
      news.push({ nid: f.owner, text: `The ${f.name} left ${c ? c.name : "its harbor"} for ${to.name}.`, tone: "warn" });
    }
    else { f.port = null; f.mission = "patrol"; }
  }
  // 1. fleets sail
  if (REC) REC.phase = "sea";
  for (const f of S.fleets) {
    f.moved = false;
    let target = null, port = null;
    if (f.destPort) { const c = g.cities.find(x => x.id === f.destPort); if (c && fleetCanDock(w, g, f, c)) { port = c; target = portSeaCell(w, c.cell); } }
    else if (f.dest !== null && f.dest !== undefined && isOcean(w, f.dest)) target = f.dest;
    const mission = f.nextMission;
    f.dest = null; f.destPort = null;
    // a mission chosen in port waits for the fleet to sail
    if (target === null) { if (mission && f.port === null) { f.mission = mission; f.nextMission = null; } continue; }
    f.nextMission = null;
    const from = f.cell >= 0 ? f.cell : target;
    const path = seaPath(w, from, target);
    if (!path) continue;
    if (REC && path.cells.length > 1) REC.events.push({ t: "fleet", id: f.id, owner: f.owner, cells: path.cells, phase: "sea", step: 0 });
    f.cell = target; f.zone = zoneOf(w, target); f.moved = path.cells.length > 1;
    if (port) { f.port = port.id; f.mission = "port"; }
    else { f.port = null; f.mission = mission || (f.mission === "port" ? "patrol" : f.mission); }
  }
  // 2. enemies who meet at sea fight
  for (let z = 0; z < G.zones.length; z++) {
    const here = S.fleets.filter(f => f.zone === z && f.port === null && f.ships.length);
    const owners = [...new Set(here.map(f => f.owner))];
    if (owners.length < 2) continue;
    const pairs = [];
    for (let i = 0; i < owners.length; i++) for (let j = i + 1; j < owners.length; j++) if (atWar(g, owners[i], owners[j])) pairs.push([owners[i], owners[j]]);
    const pw = nid => here.filter(f => f.owner === nid).reduce((s, f) => s + fleetPower(f), 0);
    pairs.sort((x, y) => pw(y[0]) + pw(y[1]) - pw(x[0]) - pw(x[1]));
    for (let [a, b] of pairs) {
      let A = here.filter(f => f.owner === a && f.port === null && f.ships.length), B = here.filter(f => f.owner === b && f.port === null && f.ships.length);
      if (!A.length || !B.length) continue;
      // the side that sailed in attacks; otherwise the stronger
      const movedA = A.some(f => f.moved), movedB = B.some(f => f.moved);
      if ((movedB && !movedA) || (movedA === movedB && pw(b) > pw(a))) { [a, b] = [b, a]; [A, B] = [B, A]; }
      const pa = pw(a), pb = pw(b);
      // raiders slip away from a stronger enemy more often than not
      if ((A.every(f => f.mission === "raid") && pa < pb || B.every(f => f.mission === "raid") && pb < pa) && rng() < 0.6) continue;
      const r = seaBattle(w, g, z, A, B, rng);
      reports.push(r);
      // the record books
      const sa = natStats(g, r.attacker), sb = natStats(g, r.defender);
      const la = r.sunk[r.attacker].length, lb = r.sunk[r.defender].length;
      sa.seaBattles = (sa.seaBattles || 0) + 1; sb.seaBattles = (sb.seaBattles || 0) + 1;
      sa.shipsLost = (sa.shipsLost || 0) + la; sb.shipsLost = (sb.shipsLost || 0) + lb;
      sa.shipsSunk = (sa.shipsSunk || 0) + lb; sb.shipsSunk = (sb.shipsSunk || 0) + la;
      g.stats.seaLog = g.stats.seaLog || [];
      g.stats.seaLog.push({ turn: g.turn, place: r.zoneName, a: r.attacker, d: r.defender, won: r.won, ratio: r.ratio, sa: la, sd: lb });
      if (g.stats.seaLog.length > 60) g.stats.seaLog.shift();
      if (REC) REC.events.push({ t: "seabattle", cell: r.cell, attacker: r.attacker, defender: r.defender, won: r.won, phase: "sea", step: 1 });
    }
  }
  S.fleets = S.fleets.filter(f => f.ships.length);
  // 3. who holds each zone
  S.presence = {}; S.ctl = {};
  for (const f of S.fleets) {
    if (f.port !== null || f.zone < 0) continue;
    const list = S.presence[f.zone] || (S.presence[f.zone] = []);
    let p = list.find(x => x.nid === f.owner);
    if (!p) { p = { nid: f.owner, power: 0, raid: 0, escort: 0 }; list.push(p); }
    p.power += fleetPower(f);
    p.raid += fleetRaid(f) * (f.mission === "raid" ? 1 : 0.35);
    p.escort += fleetEscort(f) * (f.mission === "raid" ? 0.3 : 1);
  }
  for (const z in S.presence) { const top = S.presence[z].slice().sort((x, y) => y.power - x.power)[0]; if (top) S.ctl[z] = top.nid; }
  // 4. blockades
  const was = new Set(S.blockaded || []);
  S.blockaded = g.cities.filter(c => oceanPort(w, c) && g.occ[c.cell] < 0 && portBlockadedFor(w, g, c, c.owner)).map(c => c.id);
  S.blockadedBy = {};
  for (const id of S.blockaded) { const c = g.cities.find(x => x.id === id); S.blockadedBy[id] = zonePowers(g, portZoneOf(w, c), c.owner).foeNids[0]; }
  for (const c of g.cities) {
    const now = S.blockaded.includes(c.id);
    if (now && !was.has(c.id)) { const by = zonePowers(g, portZoneOf(w, c), c.owner).foeNids; news.push({ nid: c.owner, other: by[0], shared: true, text: `Warships of the ${nameOf(g, by[0])} blockade ${c.name}${c.owner === PLAYER ? "" : `, a harbor of the ${nameOf(g, c.owner)}`}: no ship gets in or out.`, tone: c.owner === PLAYER ? "bad" : by[0] === PLAYER ? "good" : "neutral", blockade: true }); }
    if (!now && was.has(c.id)) news.push({ nid: c.owner, text: `The blockade of ${c.name} is over.`, tone: "good" });
  }
  // 5. convoys of troops
  if (REC) REC.step = 2;
  runVoyages(w, g, rng, news, landReports);
  // 6. readiness and repairs
  for (const f of S.fleets) {
    if (f.port !== null) {
      const c = g.cities.find(x => x.id === f.port);
      const lvl = portLevel(c);
      const rep = lvl >= 3 ? 0.5 : lvl === 2 ? 0.25 : 0.08;
      f.ships.forEach(s => { s.hp = Math.min(1, s.hp + rep); });
      f.org = Math.min(1, f.org + 0.4);
    } else if (f.fought !== g.turn) f.org = Math.min(1, f.org + 0.2);
    const fuel = (g.nations[f.owner] && g.nations[f.owner].fuelSat) ?? 1;
    if (f.port === null && fuel < 0.7) f.org = Math.max(0.2, f.org - 0.15);
  }
  S.reports = reports.slice(-16);
  return { news, reports, landReports };
}

/* Each season, before the generals plan: a division bound for a harbor that lost its way finds it again, or its
   voyage is called off (harbor lost, no way there, or too long on the road). */
function maintainVoyages(w, g) {
  const news = [];
  for (const d of g.divisions) {
    const v = d.voyage;
    if (!v) continue;
    const port = g.cities.find(c => c.id === v.embark);
    const drop = why => { d.voyage = null; d.path = []; if (d.owner === PLAYER) news.push({ nid: d.owner, text: `The ${d.name}'s voyage was called off: ${why}`, tone: "warn" }); };
    if (!port || controller(g, port.cell) !== d.owner) { drop(`${port ? port.name : "its harbor"} is no longer ours.`); continue; }
    if (dist(d.cell, port.cell) <= 1.5 || v.loading) continue;
    if (g.turn - (v.ordered ?? g.turn) >= 4) { drop(`it could not reach ${port.name} to board the ships.`); continue; }
    if (!d.path || !d.path.length) {
      const p = findDivPath(w, g, d, port.cell);
      if (p) d.path = p.path; else drop(`there is no way to ${port.name}.`);
    }
  }
  return news;
}

/* Divisions waiting in port sail together; enemy warships on the way can sink them or turn them back. */
function runVoyages(w, g, rng, news, landReports) {
  const S = g.sea;
  const groups = new Map();
  for (const d of g.divisions) {
    if (!d.voyage) continue;
    const port = g.cities.find(c => c.id === d.voyage.embark);
    if (!port || controller(g, port.cell) !== d.owner) { if (d.owner === PLAYER) news.push({ nid: d.owner, text: `The ${d.name}'s voyage was called off: its port is lost.`, tone: "bad" }); d.voyage = null; continue; }
    if (dist(d.cell, port.cell) > 1.5 || d.training) continue;
    const key = `${d.owner}|${d.voyage.embark}|${d.voyage.to}|${d.voyage.kind}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  const names = list => list.length === 1 ? `the ${list[0].name}` : `${list.length} divisions`;
  for (const list of groups.values()) {
    const nid = list[0].owner, n = g.nations[nid];
    const port = g.cities.find(c => c.id === list[0].voyage.embark);
    let plan = seaMovePlan(w, g, list, list[0].voyage.to, port);
    if (!plan.ok) { news.push({ nid, text: `The voyage of ${names(list)} was called off: ${plan.reason}`, tone: "bad" }); list.forEach(d => { d.voyage = null; }); continue; }
    const avail = Math.max(0, (n.freighters || 0) - (S.used[nid] || 0));
    // at most three divisions land on one beach in a season; the rest take the next convoy
    const group = plan.kind === "beach" ? list.slice(0, MIL.maxStack) : list;
    if (group.length < list.length && nid === PLAYER) news.push({ nid, text: `Only ${MIL.maxStack} divisions can land on one beach in a season; ${list.length - group.length} more wait at ${port.name} for the next convoy.`, tone: "neutral" });
    let sail = group.slice();
    const need = l => Math.ceil(l.reduce((s, d) => s + divTons(d, plan.kind === "beach"), 0) / SHIP_TYPES.freighter.tons);
    while (sail.length && need(sail) > avail) sail.pop();
    if (!sail.length) { news.push({ nid, text: `Not enough freighters to carry ${names(group)} from ${port.name}: ${need(group)} needed, ${avail} free. ${group.length > 1 ? "They wait" : "It waits"} in port.`, tone: "warn" }); continue; }
    if (sail.length < group.length) news.push({ nid, text: `Only ${sail.length} of ${group.length} divisions could sail from ${port.name}: not enough freighters for the rest.`, tone: "warn" });
    if (sail.length < list.length) { plan = seaMovePlan(w, g, sail, sail[0].voyage.to, port); if (!plan.ok) continue; }
    // a slow loading spills over into the next season
    if (plan.days > SEA.seasonDays && !sail[0].voyage.loading) {
      sail.forEach(d => { d.voyage.loading = true; d.sailed = g.turn; d.path = []; });
      S.used[nid] = (S.used[nid] || 0) + plan.freighters;
      news.push({ nid, text: `The convoy with ${names(sail)} needs ${fmtDays(plan.days)}: loading ${fmtDays(plan.load)} at ${port.name}, ${fmtDays(plan.sail)} at sea, ${plan.kind === "port" ? `${fmtDays(plan.unload)} unloading at ${plan.destCity.name}` : `${fmtDays(plan.unload)} getting ashore`}. It arrives next season.`, tone: "neutral" });
      continue;
    }
    S.used[nid] = (S.used[nid] || 0) + plan.freighters;
    // dangers on the way
    let lossFrac = 0, turnedAt = null, attacker = -1;
    for (const z of plan.zones) {
      const zp = zonePowers(g, z, nid);
      if (zp.foe <= 0) continue;
      if (attacker < 0) attacker = zp.foeNids[0];
      const f = clamp(0.35 * zp.foe / (zp.foe + 2 * zp.own + 1), 0.04, 0.6);
      lossFrac = 1 - (1 - lossFrac) * (1 - f);
      if (zp.own <= 0) { turnedAt = z; break; }
    }
    let path = plan.sea;
    if (turnedAt !== null) {
      const k = path.findIndex(c => zoneOf(w, c) === turnedAt);
      const out = path.slice(0, Math.max(1, k + 1));
      path = out.concat(out.slice(0, -1).reverse());
    }
    if (lossFrac > 0) {
      const sunkF = Math.min(n.freighters || 0, Math.max(1, Math.round(plan.freighters * lossFrac)));
      n.freighters = Math.max(0, (n.freighters || 0) - sunkF);
      let men = 0;
      for (const d of sail) {
        const m = Math.round(d.men * lossFrac);
        d.men -= m; men += m;
        d.kits = Math.max(0, d.kits * (1 - lossFrac)); d.guns = Math.round(d.guns * (1 - lossFrac)); d.tanks = Math.round(d.tanks * (1 - lossFrac));
      }
      n.lastLosses = (n.lastLosses || 0) + men;
      removePopulationLoss(g, nid, men * 0.7);
      const where = zoneName(w, turnedAt !== null ? turnedAt : plan.zones.find(z => zoneThreat(g, z, nid)));
      news.push({ nid, text: `${whoseShips(g, attacker)} in the ${where} attacked the convoy carrying ${forceLabel(g, sail)}: ${sunkF} freighter${sunkF > 1 ? "s" : ""} and ${fmtCount(men)} soldiers lost${turnedAt !== null ? "; the convoy turned back" : ""}.`, tone: "bad", sea: true });
      if (attacker >= 0) news.push({ nid: attacker, text: `${whoseShips(g, attacker)} in the ${where} attacked a convoy of the ${nameOf(g, nid)}: ${sunkF} freighter${sunkF > 1 ? "s" : ""} sunk and about ${fmtCount(men)} soldiers lost${turnedAt !== null ? "; it turned back" : ""}.`, tone: "good", sea: true });
      const S2 = natStats(g, nid); S2.freightersLost = (S2.freightersLost || 0) + sunkF;
      if (attacker >= 0) { const S3 = natStats(g, attacker); S3.freightersSunk = (S3.freightersSunk || 0) + sunkF; }
    }
    const recVoyage = () => { if (REC) REC.events.push({ t: "voyage", ids: sail.map(d => d.id), ends: Object.fromEntries(sail.map(d => [d.id, d.cell])), owner: nid, cells: path, back: turnedAt !== null, phase: "sea", step: 1 }); };
    if (turnedAt !== null) { sail.forEach(d => { d.voyage = null; d.path = []; d.org = Math.max(0.1, d.org - 0.3); d.sailed = g.turn; }); recVoyage(); continue; }
    // arrival
    if (plan.kind === "port") {
      for (const d of sail) { moveAshore(w, g, d, plan.target); d.org = Math.max(0.1, d.org - 0.15); }
      news.push({ nid, text: `${names(sail).replace(/^t/, "T")} sailed from ${port.name} to ${plan.destCity.name} (${plan.freighters} freighters, ${fmtDays(plan.days)}).`, tone: "good", sea: true });
    } else landTroops(w, g, rng, sail, plan, news, landReports);
    for (const d of sail) { d.voyage = null; d.path = []; d.sailed = g.turn; d.entrench = 0; }
    recVoyage();
  }
}
/* Put a division ashore at a cell, or the nearest free cell of ours beside it. */
function moveAshore(w, g, d, cell) {
  const full = c => g.divisions.filter(x => x.cell === c && x.owner === d.owner && x !== d).length >= MIL.maxStack;
  let to = cell;
  if (full(cell)) {
    to = -1;
    for (const k of stepNeighbors(g, cell)) if (isLand(w, k) && !full(k) && (controller(g, k) === d.owner || controller(g, k) === -1) && !g.divisions.some(x => x.cell === k && atWar(g, x.owner, d.owner))) { to = k; break; }
    if (to < 0) to = cell;
  }
  d.cell = to;
}
function landTroops(w, g, rng, divs, plan, news, landReports) {
  const nid = divs[0].owner, target = plan.target;
  const foes = g.divisions.filter(e => e.cell === target && atWar(g, e.owner, nid));
  const where = placeNameW(w, g, target);
  if (!foes.length) {
    for (const d of divs) { moveAshore(w, g, d, target); d.org = Math.max(0.1, d.org - 0.3); }
    const ctl = controller(g, target);
    const warNews = [];
    if (ctl >= 0 && ctl !== nid && atWar(g, ctl, nid)) occupyCell(g, target, nid, warNews);
    news.push({ nid, text: `${capFirst(forceLabel(g, divs))} landed at ${where}${ctl >= 0 && ctl !== nid ? " without a fight" : ""}.`, tone: "good", sea: true });
    if (ctl >= 0 && ctl !== nid) news.push({ nid: ctl, text: `${capFirst(forceLabel(g, divs))} landed on ${ctl === PLAYER ? "your" : `the ${nameOf(g, ctl)}'s`} coast at ${where}: nobody was there to stop ${divs.length > 1 ? "them" : "it"}.`, tone: "bad", sea: true });
    warNews.forEach(t => news.push({ nid, text: t, tone: "good", war: true }));
    return;
  }
  const D = foes[0].owner;
  const sup = {};
  for (const o of new Set([nid, ...foes.map(e => e.owner)])) sup[o] = supplyMap(w, g, o);
  const zone = zoneOf(w, beachSeaCell(w, target) >= 0 ? beachSeaCell(w, target) : plan.sea[plan.sea.length - 1]);
  let cruisers = 0;
  for (const f of g.sea.fleets) if (f.owner === nid && f.port === null && f.zone === zone) cruisers += f.ships.filter(s => s.type === "cruiser").length;
  const att = divs.slice(0, MIL.maxAttackers);
  const r = resolveBattle(w, g, target, att, foes, rng, sup, { landing: { cruisers } });
  r.landing = true;
  if (REC) REC.events.push({ t: "battle", cell: target, attacker: r.attacker, defender: r.defender, won: r.won, phase: "sea", step: 2 });
  for (const id of [r.attacker, r.defender]) {
    const l = r.losses[id];
    g.nations[id].lastLosses = (g.nations[id].lastLosses || 0) + l.men;
    removePopulationLoss(g, id, l.men * MIL.deathShare);
  }
  if (r.won) {
    const index = divIndex(g);
    for (const e of foes) {
      const to = retreatCell(w, g, index, e, target, nid);
      if (to < 0) { r.destroyed.push(e.name); e.men = 0; }
      else { e.cell = to; e.path = []; e.entrench = 0; r.retreated.push(e.name); }
    }
    g.divisions = g.divisions.filter(x => x.men > 300 || x.owner === nid);
    for (const d of att) { moveAshore(w, g, d, target); d.org = Math.max(0.05, d.org - 0.2); }
    const warNews = [];
    occupyCell(g, target, nid, warNews);
    news.push({ nid, text: `${capFirst(forceLabel(g, att))} stormed ashore at ${where} and drove off the ${nameOf(g, D)}.`, tone: "good", sea: true });
    news.push({ nid: D, text: `${capFirst(forceLabel(g, att))} stormed ashore at ${where} and drove off ${D === PLAYER ? "your troops" : `the ${nameOf(g, D)}`}.`, tone: "bad", sea: true });
    warNews.forEach(t => news.push({ nid, text: t, tone: "good", war: true }));
  } else {
    for (const d of att) { const m = Math.round(d.men * 0.15); d.men -= m; r.losses[nid].men += m; d.org = 0.1; }
    news.push({ nid, text: `The landing at ${where} failed: the ${nameOf(g, D)} threw ${forceLabel(g, att)} back into the sea.`, tone: "bad", sea: true });
    news.push({ nid: D, text: `${D === PLAYER ? "Your troops" : `The ${nameOf(g, D)}`} threw ${forceLabel(g, att)} back into the sea at ${where}.`, tone: "good", sea: true });
  }
  landReports.push(r);
}

/* After the armies have marched: the merchant fleet's work, raiders sinking what they find, sea supply, and next season's trade. */
function seaAftermath(w, g, rng) {
  const S = seaState(g);
  const news = [];
  for (const n of liveNations(g)) {
    const nid = n.id;
    const econ = computeEconomy(w, g, nid);
    let need = 0;
    if ((n.freighters || 0) > 0 && g.divisions.some(d => d.owner === nid)) {
      const land = supplyMap(w, g, nid, true);
      if (g.divisions.some(d => d.owner === nid && !land[d.cell])) {
        const full = supplyMap(w, g, nid);
        for (const d of g.divisions) if (d.owner === nid && !land[d.cell] && full[d.cell]) need += SEA.supplyPerDiv[d.type] || 1;
      }
    }
    const avail = Math.max(0, (n.freighters || 0) - (S.used[nid] || 0));
    S.supplyNeed[nid] = need;
    S.supplyOk[nid] = need === 0 || avail >= Math.ceil(need * 0.75);
    if (need > 0 && !S.supplyOk[nid] && nid === PLAYER) news.push({ nid, text: `Your divisions overseas need ${need} freighters to stay supplied, but only ${avail} are free.`, tone: "bad" });
    const links = econ.seaLinks || [];
    S.links[nid] = links;
    const linkF = links.reduce((s, l) => s + l.freighters, 0);
    const tradeF = g.cities.some(c => c.owner === nid && portUsableBy(w, g, c, nid)) ? Math.max(0, avail - Math.min(avail, need) - linkF) : 0;
    // where the merchant ships sailed this season
    const exposure = new Map();
    const add = (z, k) => { if (z >= 0 && k > 0) exposure.set(z, (exposure.get(z) || 0) + k); };
    for (const l of links) for (const z of l.zones) add(z, l.freighters / Math.max(1, l.zones.length) * 1.5);
    const ports = g.cities.filter(c => c.owner === nid && portUsableBy(w, g, c, nid));
    const wsum = ports.reduce((s, c) => s + portLevel(c), 0);
    for (const c of ports) add(portZoneOf(w, c), tradeF * portLevel(c) / Math.max(1, wsum));
    if (need > 0) for (const src of seaSupplySources(w, g, nid, econ)) { const s = beachSeaCell(w, src.cell) >= 0 ? beachSeaCell(w, src.cell) : portSeaCell(w, src.cell); if (s >= 0) add(zoneOf(w, s), need / 4); }
    let sunk = 0;
    const where = [];
    for (const [z, k] of exposure) {
      const zp = zonePowers(g, z, nid);
      if (zp.raid <= 0) continue;
      const p = 1 - Math.exp(-SEA.raidRate * zp.raid / (1 + zp.escort));
      const lost = Math.min((n.freighters || 0) - sunk, Math.floor(k * p + rng()));
      if (lost <= 0) continue;
      sunk += lost;
      where.push({ z, lost, by: zp.foeNids[0] });
      for (const by of zp.foeNids.slice(0, 1)) { const st = natStats(g, by); st.freightersSunk = (st.freightersSunk || 0) + lost; }
    }
    S.losses[nid] = sunk ? { freighters: sunk, where } : null;
    if (sunk) {
      n.freighters = Math.max(0, (n.freighters || 0) - sunk);
      const st = natStats(g, nid); st.freightersLost = (st.freightersLost || 0) + sunk;
      news.push({ nid, text: `Raiders sank ${sunk} of ${nid === PLAYER ? "your" : `the ${nameOf(g, nid)}'s`} freighters: ${where.map(x => `${x.lost} in the ${zoneName(w, x.z)} (the ${nameOf(g, x.by)})`).join(", ")}.`, tone: "bad", sea: true });
      const byRaider = new Map();
      for (const x of where) byRaider.set(x.by, (byRaider.get(x.by) || 0) + x.lost);
      for (const [by, k] of byRaider) news.push({ nid: by, text: `${by === PLAYER ? "Your raiders" : `Raiders of the ${nameOf(g, by)}`} sank ${k} freighter${k > 1 ? "s" : ""} of the ${nameOf(g, nid)}.`, tone: "good", sea: true });
    }
    S.trade[nid] = seaTradeFor(w, g, n, econ, Math.max(0, tradeF - sunk));
  }
  S.used = {};
  return news;
}
function seaTradeFor(w, g, n, econ, tradeF) {
  const S = g.sea, prev = S.trade[n.id];
  let mt = 0;
  for (const k in SEA.tonsPerUnit) mt += ((econ.goods.imports[k] || 0) + (econ.goods.exports[k] || 0)) * SEA.tonsPerUnit[k];
  const seaFrac = econ.access > 0 ? clamp((econ.seaAccess || 0) / econ.access, 0, 1) : 0;
  const prevShare = prev ? prev.share : 1;
  // with the trade book the wanted tonnage is known before any port or ship limit (10s); otherwise undo last season's limit
  const booked = econ.trade && econ.trade.seaMtWanted !== undefined && g.trade && g.trade.v;
  const mtSea = booked ? econ.trade.seaMtWanted : mt * seaFrac / Math.max(0.15, prevShare);
  const inShare = booked && mtSea > 0 ? clamp(econ.trade.seaMtIn / mtSea, 0, 1) : 1;   // foreign shipowners charge the buyer
  const ports = g.cities.filter(c => c.owner === n.id && portUsableBy(w, g, c, n.id));
  const lakes = g.cities.filter(c => c.owner === n.id && c.port && !oceanPort(w, c) && !(g.occ && g.occ[c.cell] >= 0));
  const cap = ports.reduce((s, c) => s + PORT_LEVELS[portLevel(c)].tradeMt * (cityFocusOn(g, c, "port") ? 1.5 : 1), 0) + lakes.length * PORT_LEVELS[1].tradeMt;
  const war = enemiesOf(g, n.id).some(e => navyPower(g, e) > 0);
  const own = ports.length ? tradeF * SEA.tradeMtPerFreighter : 0;
  const foreign = mtSea * (war ? SEA.neutralShareWar : 1);
  const carry = Math.min(mtSea, cap, own + foreign);
  const share = mtSea > 0.05 ? clamp(carry / mtSea, 0, 1) : 1;
  const ownCarry = Math.min(carry, own), foreignCarry = Math.max(0, carry - ownCarry);
  return { mt: sr(mtSea), cap, own: sr(own), carry: sr(carry), share: sr(share, 3), fees: sr(foreignCarry * inShare * (war ? SEA.warFreightRate : SEA.freightRate) / 1000, 3), income: sr(ownCarry * SEA.freightRate / 1000, 3), war, tradeF, limit: carry >= mtSea - 0.01 ? null : cap <= own + foreign ? "ports" : "ships" };
}

/* Saves from before the sea: harbors that already handled more trade than a small harbor can are counted as
   ports, so nobody's trade shrinks the moment they load the game. */
function seaMigrate(w, g) {
  seaState(g);
  for (const n of liveNations(g)) {
    const econ = computeEconomy(w, g, n.id);
    let mt = 0;
    for (const k in SEA.tonsPerUnit) mt += ((econ.goods.imports[k] || 0) + (econ.goods.exports[k] || 0)) * SEA.tonsPerUnit[k];
    mt *= econ.access > 0 ? clamp((econ.seaAccess || 0) / econ.access, 0, 1) : 0;
    const ports = g.cities.filter(c => c.owner === n.id && oceanPort(w, c)).sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0));
    const cap = () => ports.reduce((s, c) => s + PORT_LEVELS[portLevel(c)].tradeMt, 0);
    for (const c of ports) { if (cap() >= mt * 1.1) break; c.portLvl = 2; }
    for (const c of ports) { if (cap() >= mt * 1.1) break; c.portLvl = 3; }
  }
}

/* ---------- Fleets: merging, splitting, orders ---------- */
function mergeFleets(g, into, others) {
  for (const f of others) { if (f === into) continue; into.ships.push(...f.ships); f.ships = []; into.org = Math.min(into.org, f.org); }
  g.sea.fleets = g.sea.fleets.filter(f => f.ships.length);
}
function splitFleet(w, g, f, type, count) {
  const take = f.ships.filter(s => s.type === type).slice(0, count);
  if (!take.length || take.length === f.ships.length) return null;
  const nf = newFleet(w, g, f.owner, null, f.auto);
  nf.cell = f.cell; nf.zone = f.zone; nf.port = f.port; nf.mission = f.mission; nf.org = f.org;
  nf.ships = take;
  f.ships = f.ships.filter(s => !take.includes(s));
  g.sea.fleets.push(nf);
  return nf;
}

/* ---------- Rivals at sea: what navy each government wants, its shipyards, its admirals ---------- */
const NAVY_TASTE = {
  mercantile:   { destroyer: 3, cruiser: 1, freighters: 12, trade: 0.3 },
  militarist:   { destroyer: 3, cruiser: 1.5, freighters: 16, trade: 0.1 },
  expansionist: { destroyer: 2, cruiser: 1, freighters: 16, trade: 0.1 },
  agrarian:     { destroyer: 1, cruiser: 0, freighters: 6, trade: 0.1 },
};
/* The navy a government wants: some by character and wealth, more against navies that threaten it, freighters
   for cut-off towns, armies overseas, a share of its sea trade and troop transport. */
function navalWants(w, g, n, econ) {
  if (!g.cities.some(c => c.owner === n.id && oceanPort(w, c))) return null;
  const taste = NAVY_TASTE[n.archetype] || NAVY_TASTE.agrarian;
  const size = clamp(econ.gdp / 220, 0.4, 3);
  const S = seaState(g);
  let destroyers = taste.destroyer * size, cruisers = taste.cruiser * size, threat = 0, threatBy = null;
  for (const z of liveNations(g)) {
    if (z.id === n.id) continue;
    const t = atWar(g, n.id, z.id) ? 1 : threatFrom(w, g, n.id, z.id);
    const p = navyPower(g, z.id) * Math.min(1, t * 1.5);
    if (t > 0.2 && p > threat) { threat = p; threatBy = z.id; }
  }
  if (threat > 0) { cruisers += (threat * 0.45) / SHIP_TYPES.cruiser.attack; destroyers += (threat * 0.4) / SHIP_TYPES.destroyer.attack; }
  if (n.minor) { destroyers = Math.min(destroyers, 2); cruisers = 0; }
  let links = 0;
  const capNet = econ.networks.findIndex(x => x.capital);
  econ.networks.forEach((net, k) => { if (k !== capNet && net.regions.some(i => oceanPort(w, econ.regions[i].city))) links += Math.ceil(net.pop * SEA.linkPerM); });
  const T = S.trade[n.id];
  const freighters = taste.freighters * (n.minor ? 0.3 : 1) * Math.min(size, 1.5) + links + (S.supplyNeed[n.id] || 0) * 1.2 + (T ? taste.trade * T.mt / SEA.tradeMtPerFreighter * 0.3 : 0);
  return { freighters: Math.round(freighters), destroyers: Math.round(destroyers), cruisers: Math.round(cruisers), links, threat, threatBy };
}
/* Rival shipyards: lay down what the navy plan lacks, as money allows; with no yard, buy freighters abroad. */
function aiBuildShips(w, g, n) {
  if (n.isPlayer) return [];
  const econ = computeEconomy(w, g, n.id);
  const want = navalWants(w, g, n, econ);
  if (!want) return [];
  const have = navyCounts(g, n.id), order = shipsOnOrder(g, n.id);
  const reserve = 0.04 * econ.gdp;
  const atWarNow = enemiesOf(g, n.id).length > 0;
  let budget = (econ.gdp / 4) * (atWarNow ? 0.03 : 0.012);
  const news = [];
  const yards = g.cities.filter(c => c.owner === n.id && oceanPort(w, c) && portLevel(c) >= 2 && g.occ[c.cell] < 0).sort((a, b) => portLevel(b) - portLevel(a));
  const gap = t => want[t === "freighter" ? "freighters" : t + "s"] - have[t] - order[t];
  const tryOrder = (type, count) => {
    for (const y of yards) {
      const free = yardSlips(y) - slipsInUse(g, y);
      if (free <= 0) continue;
      const q = quoteShips(w, g, n.id, y, type, Math.min(count, free));
      if (!q.ok || q.cost > budget || n.treasury - q.cost < reserve) continue;
      orderProject(g, q, `to build up the ${type === "freighter" ? "merchant fleet" : "navy"}`);
      budget -= q.cost;
      news.push(`Laid down ${q.label.charAt(0).toLowerCase()}${q.label.slice(1)}.`);
      return true;
    }
    return false;
  };
  if (gap("freighter") >= 1) tryOrder("freighter", Math.min(4, gap("freighter")));
  if (gap("destroyer") >= 1) tryOrder("destroyer", 1);
  if (gap("cruiser") >= 1) tryOrder("cruiser", 1);
  if (!yards.length && gap("freighter") >= 2) {
    const q = quoteBuyShips(w, g, n.id, "freighter", Math.min(SEA.buyPerSeason, gap("freighter")));
    if (q.ok && q.cost <= budget && n.treasury - q.cost > reserve) { orderProject(g, q, "to have ships of our own"); news.push(`Bought ${q.count} freighters abroad.`); }
  }
  return news;
}
/* Port projects worth offering a rival government, given its navy plan. */
function aiSeaCandidates(w, g, n, econ) {
  const out = [];
  const want = navalWants(w, g, n, econ);
  if (want) {
    const have = navyCounts(g, n.id), order = shipsOnOrder(g, n.id);
    const warGap = Math.max(0, want.destroyers - have.destroyer - order.destroyer) + Math.max(0, want.cruisers - have.cruiser - order.cruiser) * 2;
    const frGap = Math.max(0, want.freighters - have.freighter - order.freighter);
    const ports = g.cities.filter(c => c.owner === n.id && oceanPort(w, c) && g.occ[c.cell] < 0);
    const top = Math.max(0, ...ports.map(portLevel));
    const pop = c => (econ.regions.find(r => r.city.id === c.id) || { pop: 0 }).pop;
    const best = ports.slice().sort((a, b) => portLevel(b) - portLevel(a) || pop(b) - pop(a))[0];
    if (best && top === 1 && warGap + frGap / 4 >= 1) {
      const q = quotePortUp(w, g, n.id, best);
      if (q.ok) { q.value += 0.004 * econ.gdp * Math.min(4, warGap + frGap / 4); out.push(q); }
    }
    if (best && top === 2 && Math.max(0, want.cruisers - have.cruiser - order.cruiser) >= 1 && !n.minor) {
      const q = quotePortUp(w, g, n.id, best);
      if (q.ok) { q.value += 0.005 * econ.gdp * Math.min(3, want.cruisers - have.cruiser); out.push(q); }
    }
  }
  for (const c of econ.cities) { const q = quoteWharf(w, g, n.id, c); if (q.ok && q.value > 0.05) out.push(q); }
  // settlers across the sea, for governments with ships and land hunger
  if ((n.archetype === "expansionist" || n.archetype === "mercantile") && !n.minor && freeFreighters(g, n.id) >= SEA.settlerFreighters + 4 && !econ.isolated.length
    && !g.projects.some(p => p.nid === n.id && p.overseas) && g.turn - (n.lastOverseas ?? -99) >= 12) {
    const sites = overseasSites(w, g, n.id).slice(0, 2);
    for (const s of sites) { const q = quoteTown(w, g, n.id, s); if (q.ok) out.push(q); }
  }
  return out;
}
/* Wild coast across the sea worth settling: good farmland, far enough from everyone's towns. */
function overseasTownCheck(w, g, nid, site) {
  const s = beachSeaCell(w, site);
  if (s < 0) return { ok: false, reason: "Wild land must be within 2 cells of your border, or on a coast your ships can reach." };
  const ports = g.cities.filter(c => c.owner === nid && portUsableBy(w, g, c, nid));
  if (!ports.length) return { ok: false, reason: "Wild land must be within 2 cells of your border. With a harbor on the open sea and freighters, you could settle a far coast too." };
  const free = freeFreighters(g, nid);
  if (free < SEA.settlerFreighters) return { ok: false, reason: `Settlers across the sea sail on ${SEA.settlerFreighters} freighters, with their tools and seed for the first year; you have ${free} free. Build or buy freighters first.` };
  let best = null;
  for (const p of ports) { const r = safeZoneRoute(w, g, nid, portZoneOf(w, p), zoneOf(w, s)); if (r && (!best || r.length < best.r.length)) best = { p, r }; }
  if (!best) return { ok: false, reason: "Enemy warships hold the waters on the way." };
  return { ok: true, port: best.p };
}
function shipsDoneText(p) {
  const t = SHIP_TYPES[p.ship];
  if (p.ship === "freighter") return `${p.count} new freighter${p.count > 1 ? "s" : ""} joined the merchant fleet at ${p.at}.`;
  const names = (p.launched || []).join(" and ");
  return `The ${t.label.toLowerCase()}${(p.launched || []).length > 1 ? "s" : ""} ${names} ${(p.launched || []).length > 1 ? "were" : "was"} commissioned at ${p.at}.`;
}
function seaContact(w, g, a, b) {
  if (!g.cities.some(c => controller(g, c.cell) === a && portUsableBy(w, g, c, a))) return false;
  return g.cities.some(c => controller(g, c.cell) === b && portSeaCell(w, c.cell) >= 0);
}
function overseasSites(w, g, nid) {
  const out = [];
  const wild = new Set([-1]);
  for (let i = 0; i < N_CELLS; i++) {
    if (g.owner[i] !== -1 || beachSeaCell(w, i) < 0 || w.terrain[i] === T.MOUNTAIN) continue;
    if (nearOwnLand(g, nid, i, BUILD.townReach)) continue;
    if (g.cities.some(c => dist(c.cell, i) < BUILD.townMinSpacing + 2)) continue;
    if (distanceToAnyOwner(g, i) < 3) continue;
    out.push({ i, food: foodWithin(w, g, i, BUILD.townClaimRadius, wild) });
  }
  return out.sort((a, b) => b.food - a.food).map(x => x.i);
}

/* ---------- The admirals: yours if you hand them a fleet, and every rival's ---------- */
function planNaval(w, g, n) {
  const S = seaState(g);
  let mine = S.fleets.filter(f => f.owner === n.id && f.ships.length && (!n.isPlayer || f.auto));
  if (!mine.length) return;
  const G = seaGeo(w);
  const enemies = enemiesOf(g, n.id);
  const stance = n.navyStance || (n.archetype === "militarist" || n.archetype === "expansionist" ? "offensive" : "defensive");
  const ports = g.cities.filter(c => c.owner === n.id && portUsableBy(w, g, c, n.id)).sort((a, b) => portLevel(b) - portLevel(a) || (b.capital ? 1 : 0) - (a.capital ? 1 : 0));
  const home = ports[0] || null;
  // the admirals keep their ships together: fleets in the same port or zone join up
  const byPlace = new Map();
  for (const f of mine) { const k = f.port !== null ? `p${f.port}` : `z${f.zone}`; if (!byPlace.has(k)) byPlace.set(k, []); byPlace.get(k).push(f); }
  for (const list of byPlace.values()) if (list.length > 1) { list.sort((a, b) => b.ships.length - a.ships.length); mergeFleets(g, list[0], list.slice(1)); }
  mine = S.fleets.filter(f => f.owner === n.id && f.ships.length && (!n.isPlayer || f.auto));
  // damaged ships go home for repairs
  const healthy = [];
  for (const f of mine) {
    const hp = f.ships.reduce((s, x) => s + x.hp, 0) / f.ships.length;
    if (hp < 0.6) { const yard = nearestFleetPort(w, g, f, true) || nearestFleetPort(w, g, f); if (yard && f.port !== yard.id) f.destPort = yard.id; continue; }
    healthy.push(f);
  }
  if (!home) return;
  if (!enemies.length) { for (const f of healthy) if (f.port === null) f.destPort = home.id; return; }
  const ours = healthy.reduce((s, f) => s + fleetPower(f), 0);
  const theirs = enemies.reduce((s, e) => s + navyPower(g, e), 0);
  if (!healthy.length) return;
  healthy.sort((a, b) => fleetPower(b) - fleetPower(a));
  const main = healthy[0];
  // much weaker: keep the fleet in harbor, a threat that ties the enemy down
  if (theirs > 0 && (ours < theirs * 0.4 || (ours < theirs * 0.7 && stance !== "offensive"))) {
    for (const f of healthy) if (f.port === null) f.destPort = (nearestFleetPort(w, g, f, true) || home).id;
    return;
  }
  const anchorOf = z => G.zones[z].anchor;
  let target = -1, why = "";
  // first duty: convoys about to sail through dangerous water
  const routes = [];
  for (const d of g.divisions) {
    if (d.owner !== n.id || !d.voyage) continue;
    const port = g.cities.find(c => c.id === d.voyage.embark);
    if (!port || dist(d.cell, port.cell) > 1.5) continue;
    const plan = seaMovePlan(w, g, [d], d.voyage.to, port);
    if (plan.ok) routes.push(...plan.zones);
  }
  const worst = routes.map(z => ({ z, foe: zonePowers(g, z, n.id).foe })).filter(x => x.foe > 0).sort((a, b) => b.foe - a.foe)[0];
  if (worst && worst.foe < ours * 1.3) { target = worst.z; why = "escort"; }
  else if (routes.length && !worst) { target = routes[Math.floor(routes.length / 2)]; why = "escort"; }
  // then: command the sea (blockade the enemy's main port) or guard our own waters
  if (target < 0 && stance === "offensive" && ours >= theirs * 1.1) {
    const ep = g.cities.filter(c => enemies.includes(c.owner) && oceanPort(w, c) && g.occ[c.cell] < 0)
      .sort((a, b) => portLevel(b) - portLevel(a) || (b.capital ? 1 : 0) - (a.capital ? 1 : 0))[0];
    if (ep) { target = portZoneOf(w, ep); why = "blockade"; }
  }
  if (target < 0) {
    const mineZones = [...new Set(ports.map(c => portZoneOf(w, c)))];
    const threatened = mineZones.map(z => ({ z, foe: zonePowers(g, z, n.id).foe })).filter(x => x.foe > 0 && x.foe < ours * 1.3).sort((a, b) => b.foe - a.foe)[0];
    target = threatened ? threatened.z : portZoneOf(w, home);
    why = "guard";
  }
  if (target >= 0 && (main.zone !== target || main.port !== null)) { main.dest = anchorOf(target); main.nextMission = "patrol"; }
  else if (target >= 0) main.mission = "patrol";
  // a raiding squadron of destroyers against the enemy's trade
  const dcount = main.ships.filter(s => s.type === "destroyer").length;
  if (stance === "offensive" && dcount >= 4 && healthy.length === 1) {
    const ep = g.cities.filter(c => enemies.includes(c.owner) && oceanPort(w, c) && g.occ[c.cell] < 0 && portZoneOf(w, c) !== target)
      .sort((a, b) => portLevel(b) - portLevel(a))[0];
    if (ep) { const r = splitFleet(w, g, main, "destroyer", 2); if (r) { r.dest = anchorOf(portZoneOf(w, ep)); r.nextMission = "raid"; } }
  }
  for (const f of healthy.slice(1)) {
    if (f.ships.every(s => s.type === "destroyer") && stance === "offensive") {
      const ep = g.cities.filter(c => enemies.includes(c.owner) && oceanPort(w, c) && g.occ[c.cell] < 0).sort((a, b) => portLevel(b) - portLevel(a))[0];
      if (ep) { f.dest = anchorOf(portZoneOf(w, ep)); f.nextMission = "raid"; continue; }
    }
    if (target >= 0 && f.zone !== target) { f.dest = anchorOf(target); f.nextMission = "patrol"; }
  }
  void why;
}

/* ---------- Generals at sea: shipping troops where the road is long, and landings in war ---------- */
function aiSeaMove(w, g, d, target, landPath) {
  const n = g.nations[d.owner];
  if (!g.sea || !((n.freighters || 0) > 0) || !isLand(w, target)) return false;
  if (landPath && landPath.seasons <= 2) return false;
  const plan = seaMovePlan(w, g, [d], target);
  if (!plan.ok || !plan.enough || plan.threats.some(t => t.hostile) || plan.seasons > 3) return false;
  if (landPath && plan.seasons + 1 >= landPath.seasons) return false;
  return setVoyage(w, g, [d], plan).length > 0;
}
function aiLandings(w, g, n) {
  const enemies = enemiesOf(g, n.id);
  if (!enemies.length || !((n.freighters || 0) >= 4)) return [];
  if (g.divisions.some(d => d.owner === n.id && d.voyage && d.voyage.kind === "beach")) return [];
  const stance = (n.warPlan && n.warPlan.stance) || "defensive";
  const out = [];
  for (const e of enemies) {
    const landContact = sharesBorder(g, n.id, e);
    if (landContact && stance !== "offensive") continue;
    const targets = g.cities.filter(c => controller(g, c.cell) === e && (portSeaCell(w, c.cell) >= 0) && beachSeaCell(w, c.cell) >= 0 && w.terrain[c.cell] !== T.MOUNTAIN)
      .map(c => ({ c, def: g.divisions.filter(x => x.cell === c.cell && atWar(g, x.owner, n.id)).length, zone: zoneOf(w, beachSeaCell(w, c.cell)) }))
      .filter(x => x.def <= 1 && !zoneHostile(g, x.zone, n.id))
      .sort((a, b) => a.def - b.def || (b.c.capital ? 1 : 0) - (a.c.capital ? 1 : 0));
    if (!targets.length) continue;
    const index = divIndex(g);
    const idle = g.divisions.filter(d => d.owner === n.id && !d.training && !d.voyage && d.org >= 0.6 && (!d.path || !d.path.length) && !enemyDivAdjacent(g, index, d.cell, n.id))
      .sort((a, b) => divCombatValue(b) - divCombatValue(a));
    if (idle.length < 2) continue;
    for (const t of targets.slice(0, 3)) {
      const force = idle.slice(0, Math.min(3, t.def + 2));
      const plan = seaMovePlan(w, g, force, t.c.cell);
      if (!plan.ok || !plan.enough || plan.threats.some(x => x.hostile) || plan.seasons > 3) continue;
      const sent = setVoyage(w, g, force, plan);
      if (!sent.length) continue;
      sent.forEach(d => { d.auto = true; });
      out.push(`Sent ${sent.length} division${sent.length > 1 ? "s" : ""} by sea to land at ${t.c.name}.`);
      return out;
    }
  }
  return out;
}

/* Choices about the navy offered to rival minds, and the words for their briefings. */
function navalCandidates(g, n) {
  const out = [];
  if (!fleetsOf(g, n.id).length || !enemiesOf(g, n.id).length) return out;
  const stance = n.navyStance || (n.archetype === "militarist" || n.archetype === "expansionist" ? "offensive" : "defensive");
  if (stance !== "offensive") out.push({ kind: "navy", value: "offensive", label: "Order the admirals to seek battle and blockade the enemy's ports", why: "command of the sea strangles their trade" });
  if (stance !== "defensive") out.push({ kind: "navy", value: "defensive", label: "Order the admirals to guard our own waters and convoys", why: "keep our ships and our trade safe" });
  return out;
}
function navalBrief(w, g, n) {
  const c = navyCounts(g, n.id);
  const ports = g.cities.filter(x => x.owner === n.id && x.port).map(x => `${x.name} (${PORT_LEVELS[portLevel(x)].label.toLowerCase()}${portBlockadedFor(w, g, x, n.id) ? ", blockaded" : ""})`);
  if (!ports.length && !c.freighter && !c.destroyer && !c.cruiser) return "Navy: none; no harbor.";
  const T = g.sea && g.sea.trade[n.id];
  return `Navy: ${c.cruiser} cruisers, ${c.destroyer} destroyers, ${c.freighter} freighters; ports: ${ports.join(", ") || "none"}${T && T.share < 0.95 ? `; only ${pct(T.share)} of its sea trade gets through` : ""}.`;
}


