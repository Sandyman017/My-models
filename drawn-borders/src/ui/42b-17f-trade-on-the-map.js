/* =====================================================================
   17f. Trade on the map: freighters on the sea lanes between harbors, caravans across wild land, carts across
        borders, and ships that sail off the edge of the map to the world beyond. All read from the merchants'
        book (10s); the shapes of the routes are worked out once and kept (never saved).
   ===================================================================== */
const TRADE_MAP = { key: "", lanes: [], geo: new Map(), seed: null };
const TRADE_SHIP = "delapouite/cargo-ship";

// a polyline in cell units, smoothed so 8-way steps read as a curve
function tradeSmooth(pts, passes = 2) {
  let p = pts;
  for (let k = 0; k < passes && p.length > 2; k++) {
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i], [bx, by] = p[i + 1];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}
function cellPt(i) { return [cellX(i) + 0.5, cellY(i) + 0.5]; }
// lengths along a polyline, for placing a ship at a share of the way
function tradeMeasure(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { pts, cum, len: cum[cum.length - 1], box: [x0, y0, x1, y1] };
}
function tradeAt(L, t) {
  const d = clamp(t, 0, 1) * L.len, { pts, cum } = L;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo] || 1, f = (d - cum[lo]) / seg;
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f];
}

/* ---------- The shapes of the routes ---------- */
// harbor to harbor along the sea lane the engine sails
function tradeSeaGeo(pa, pb) {
  const key = `sea|${pa.id}|${pb.id}`;
  if (TRADE_MAP.geo.has(key)) return TRADE_MAP.geo.get(key);
  const ca = portSeaCell(world, pa.cell), cb = portSeaCell(world, pb.cell);
  const p = ca >= 0 && cb >= 0 ? seaPath(world, ca, cb) : null;
  const geo = p ? tradeMeasure([cellPt(pa.cell)].concat(tradeSmooth(p.cells.map(cellPt)), [cellPt(pb.cell)])) : null;
  if (geo) geo.km = p.km;
  TRADE_MAP.geo.set(key, geo);
  return geo;
}
// from a harbor to the nearest open sea at the edge of the map, and on beyond it
function tradeWorldGeo(port) {
  const key = `world|${port.id}`;
  if (TRADE_MAP.geo.has(key)) return TRADE_MAP.geo.get(key);
  const G = seaGeo(world), from = portSeaCell(world, port.cell);
  let best = -1, bd = Infinity;
  if (from >= 0) for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) {
    if (x > 0 && y > 0 && x < GRID_W - 1 && y < GRID_H - 1) { y = GRID_H - 2; continue; }   // edge cells only
    const i = idx(x, y);
    if (!G.ocean[i]) continue;
    const d = Math.hypot(x - cellX(from), y - cellY(from));
    if (d < bd) { bd = d; best = i; }
  }
  const p = best >= 0 ? seaPath(world, from, best) : null;
  let geo = null;
  if (p) {
    const ex = cellX(best), ey = cellY(best);
    const out = [ex <= 0 ? -3 : ex >= GRID_W - 1 ? GRID_W + 3 : ex + 0.5, ey <= 0 ? -3 : ey >= GRID_H - 1 ? GRID_H + 3 : ey + 0.5];
    geo = tradeMeasure([cellPt(port.cell)].concat(tradeSmooth(p.cells.map(cellPt)), [out]));
  }
  TRADE_MAP.geo.set(key, geo);
  return geo;
}
// caravans: the nearest two towns, along a gentle curve across the wild land between them
function tradeOverGeo(a, b) {
  const mine = game.cities.filter(c => c.owner === a), theirs = game.cities.filter(c => c.owner === b);
  let best = null;
  for (const x of mine) for (const y of theirs) { const d = dist(x.cell, y.cell); if (!best || d < best.d) best = { x, y, d }; }
  if (!best) return null;
  const [x0, y0] = cellPt(best.x.cell), [x1, y1] = cellPt(best.y.cell);
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, nx = -(y1 - y0) * 0.18, ny = (x1 - x0) * 0.18;
  const pts = [];
  for (let k = 0; k <= 14; k++) { const t = k / 14, u = 1 - t; pts.push([u * u * x0 + 2 * u * t * (mx + nx) + t * t * x1, u * u * y0 + 2 * u * t * (my + ny) + t * t * y1]); }
  return tradeMeasure(pts);
}
// carts across a border with no road: where the border runs closest to the line between the two capitals
function tradeBorderGeo(a, b) {
  const capOf = id => game.cities.find(c => c.owner === id && c.capital) || game.cities.find(c => c.owner === id);
  const A = capOf(a), B = capOf(b);
  if (!A || !B) return null;
  const mx = (cellX(A.cell) + cellX(B.cell)) / 2, my = (cellY(A.cell) + cellY(B.cell)) / 2;
  let best = null;
  for (let i = 0; i < N_CELLS; i++) {
    if (game.owner[i] !== a) continue;
    const x = cellX(i), y = cellY(i);
    for (const [dx, dy] of DIRS8) {
      if (!inBounds(x + dx, y + dy)) continue;
      const j = idx(x + dx, y + dy);
      if (game.owner[j] !== b) continue;
      const d = Math.hypot(x - mx, y - my);
      if (!best || d < best.d) best = { i, j, d };
    }
  }
  if (!best) return null;
  const [ax, ay] = cellPt(best.i), [bx, by] = cellPt(best.j), l = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / l, uy = (by - ay) / l;
  return tradeMeasure([[ax - ux * 1.6, ay - uy * 1.6], [bx + ux * 1.6, by + uy * 1.6]]);
}

/* ---------- The lanes in use this season: one per pair and route, with what goes each way ---------- */
function tradeLanes() {
  const g = game;
  const key = `${g.trade.turn}|${g.ver || 0}|${mapVersion}|${g.trade.flows.length}`;
  if (TRADE_MAP.seed !== world.seed) { TRADE_MAP.geo.clear(); TRADE_MAP.seed = world.seed; }
  if (TRADE_MAP.key === key && TRADE_MAP.flows === g.trade.flows) return TRADE_MAP.lanes;
  for (const k of [...TRADE_MAP.geo.keys()]) if (!k.startsWith("sea|") && !k.startsWith("world|")) TRADE_MAP.geo.delete(k);   // borders and towns move
  const lanes = new Map();
  const lane = (k, mk) => { if (!lanes.has(k)) lanes.set(k, mk()); return lanes.get(k); };
  for (const f of g.trade.flows) {
    const v = goodWorth(g, f.k, f.q);
    if (v < 0.002) continue;
    if (f.s >= 0 && f.b >= 0) {
      if (tradeBlocked(g, f.s, f.b, f.k)) continue;
      const a = Math.min(f.s, f.b), b = Math.max(f.s, f.b);
      const L = lane(`${f.m}|${a}|${b}`, () => ({ kind: f.m, a, b, ab: {}, ba: {}, vAB: 0, vBA: 0, r: {}, d: f.d }));
      const side = f.s === a ? "ab" : "ba";
      L[side][f.k] = (L[side][f.k] || 0) + f.q;
      if (side === "ab") L.vAB += v; else L.vBA += v;
      L.r[f.k] = f.r;
    } else {
      const nid = f.s >= 0 ? f.s : f.b;
      if (!f.via || f.via.city === undefined || f.via.city === null) continue;   // through a partner's harbors: shown on their lanes
      const L = lane(`world|${nid}`, () => ({ kind: "world", a: nid, b: -1, port: f.via.city, ab: {}, ba: {}, vAB: 0, vBA: 0, r: {} }));
      if (f.s >= 0) { L.ab[f.k] = (L.ab[f.k] || 0) + f.q; L.vAB += v; } else { L.ba[f.k] = (L.ba[f.k] || 0) + f.q; L.vBA += v; }
    }
  }
  const out = [];
  for (const L of lanes.values()) {
    let geo = null;
    if (L.kind === "sea") {
      const link = tradeLink(g, L.a, L.b);
      const pa = link && link.pa !== undefined ? cityById(link.pa) : mainOceanPort(world, g, L.a), pb = link && link.pb !== undefined ? cityById(link.pb) : mainOceanPort(world, g, L.b);
      if (!pa || !pb || !portUsableBy(world, g, pa, L.a) || !portUsableBy(world, g, pb, L.b)) continue;   // a lost or blockaded harbor
      geo = tradeSeaGeo(pa, pb);
    } else if (L.kind === "world") {
      const port = cityById(L.port);
      if (!port || port.owner !== L.a || !portUsableBy(world, g, port, L.a)) continue;
      geo = tradeWorldGeo(port);
    } else if (L.kind === "over") {
      const k = `over|${L.a}|${L.b}`;
      if (!TRADE_MAP.geo.has(k)) TRADE_MAP.geo.set(k, tradeOverGeo(L.a, L.b));
      geo = TRADE_MAP.geo.get(k);
    } else if (L.kind === "land") {
      // a road across the border carries the trade already (the gold carts in the road traffic)
      if (tradeRoadCrosses(L.a, L.b)) continue;
      const k = `land|${L.a}|${L.b}`;
      if (!TRADE_MAP.geo.has(k)) TRADE_MAP.geo.set(k, tradeBorderGeo(L.a, L.b));
      geo = TRADE_MAP.geo.get(k);
    }
    if (!geo || geo.len < 0.5) continue;
    L.geo = geo; L.v = L.vAB + L.vBA;
    L.phase = hash2(L.a + 3, L.b + 7, 11);
    out.push(L);
  }
  out.sort((x, y) => x.v - y.v);   // the biggest drawn last, on top
  TRADE_MAP.key = key; TRADE_MAP.flows = g.trade.flows; TRADE_MAP.lanes = out;
  return out;
}
function tradeRoadCrosses(a, b) {
  for (const k of game.roads) { const [x, y] = edgeEnds(k); const ox = game.owner[x], oy = game.owner[y]; if ((ox === a && oy === b) || (ox === b && oy === a)) return true; }
  return false;
}
// do these two nations trade at all this season (for the carts on a road across their border)
function tradePairTrades(a, b) {
  if (!game.trade || !game.trade.v || a < 0 || b < 0 || tradeBlocked(game, a, b, "goods")) return false;
  const ix = tradeIndex(game);
  return (ix.pairV[`${a}>${b}`] || 0) + (ix.pairV[`${b}>${a}`] || 0) > 0.002;
}

/* ---------- Drawing ---------- */
function tradeLanesShown() { return !!game && ui.phase === "play" && (!!ui.tradeMap || ui.tab === "trade"); }
function drawTradeFlows(c, cs, now) {
  if (!game || !game.trade || !game.trade.v || ui.phase === "draw") return;
  const shown = tradeLanesShown();
  if (!motion.on && !shown && !ui.play) return;
  const lanes = tradeLanes();
  if (!lanes.length) return;
  const calm = view.zoom < 1.6 && !shown;   // zoomed out: only our own trade, unless the lanes are asked for
  const x0 = -view.ox / cs - 2, y0 = -view.oy / cs - 2, x1 = (view.vw - view.ox) / cs + 2, y1 = (view.vh - view.oy) / cs + 2;
  const hov = ui.tradeHover;
  const colorOf = id => (id >= 0 ? NATION_COLORS[id] : "#9fb3c0");
  for (const L of lanes) {
    if (calm && L.a !== PLAYER && L.b !== PLAYER) continue;
    const [bx0, by0, bx1, by1] = L.geo.box;
    if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1) continue;
    const lit = hov && hov.lane === L;
    if (shown || lit) {
      // the lane itself: dashed, as wide as the trade is large, in the main seller's color
      const main = L.vAB >= L.vBA ? L.a : L.b;
      c.save();
      c.strokeStyle = rgba(colorOf(main), lit ? 0.95 : 0.6);
      c.lineWidth = clamp(1 + 1.6 * Math.sqrt(L.v), 1.2, 5) + (lit ? 1.5 : 0);
      c.setLineDash(L.kind === "sea" || L.kind === "world" ? [6, 5] : [3, 4]);
      c.lineCap = "round";
      c.beginPath();
      L.geo.pts.forEach(([x, y], k) => (k ? c.lineTo(x * cs, y * cs) : c.moveTo(x * cs, y * cs)));
      c.stroke();
      c.restore();
    }
    if (!motion.on && !ui.play) continue;
    // what moves along it: a few freighters, caravans or carts each way, more for more trade
    const speed = L.kind === "sea" || L.kind === "world" ? 1.3 : 0.45;   // cells a second
    const period = Math.max(4, L.geo.len / speed);
    for (const [v, from, back] of [[L.vAB, L.a, false], [L.vBA, L.b, true]]) {
      if (v < 0.002) continue;
      const n = clamp(Math.round(1 + Math.sqrt(v) * 1.3), 1, 4);
      for (let k = 0; k < n; k++) {
        let t = ((now / 1000) / period + L.phase + k / n + (back ? 0.5 / n : 0)) % 1;
        if (back) t = 1 - t;
        const [x, y] = tradeAt(L.geo, t);
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        if (L.kind === "sea" || L.kind === "world") {
          const s = clamp(cs * 0.42, 10, 22);
          giDraw(c, TRADE_SHIP, x * cs, y * cs, s, cssRgb(mix(hexToRgb(colorOf(from)), [245, 240, 228], 0.35)), "rgba(4,10,16,0.85)", 1.6);
        } else {
          const r = clamp(cs * 0.09, 1.3, 2.8);
          const [tx, ty] = tradeAt(L.geo, clamp(t + (back ? 0.02 : -0.02), 0, 1));
          for (const [px, py] of [[x, y], [tx, ty]]) {
            c.fillStyle = "rgba(10,8,4,0.8)"; c.beginPath(); c.arc(px * cs, py * cs, r + 1, 0, Math.PI * 2); c.fill();
            c.fillStyle = colorOf(from); c.beginPath(); c.arc(px * cs, py * cs, r, 0, Math.PI * 2); c.fill();
          }
        }
      }
    }
  }
}

/* ---------- Hovering a lane ---------- */
function tradeLaneAt(px, py) {
  if (!tradeLanesShown() || !game.trade || !game.trade.v) return null;
  const cs = view.cs, x = px / cs, y = py / cs, tol = 7 / cs;
  let best = null;
  for (const L of tradeLanes()) {
    const [bx0, by0, bx1, by1] = L.geo.box;
    if (x < bx0 - tol || x > bx1 + tol || y < by0 - tol || y > by1 + tol) continue;
    const P = L.geo.pts;
    for (let i = 1; i < P.length; i++) {
      const [ax, ay] = P[i - 1], [bx, by] = P[i], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1), d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
      if (d < tol && (!best || d < best.d)) best = { lane: L, d };
    }
  }
  return best;
}
function tradeLaneTooltipHtml(h) {
  const L = h.lane, g = game;
  const who = id => (id < 0 ? "the world beyond the map" : theNation(g, id));
  const side = (o, v, s, b) => {
    const ks = Object.keys(o).sort((x, y) => goodWorth(g, y, o[y]) - goodWorth(g, x, o[x]));
    if (!ks.length) return "";
    const why = L.r && L.r[ks[0]] && TRADE_REASON[L.r[ks[0]]] ? ` · ${TRADE_REASON[L.r[ks[0]]].toLowerCase()}` : "";
    return `<span class="tt-line">${escapeHtml(capFirst(who(s)))} sells ${escapeHtml(bJoin(ks.slice(0, 3).map(goodWord)))}${ks.length > 3 ? " and more" : ""} (${fmtMoneyFine(v)} a year) to ${escapeHtml(who(b))}${why}</span>`;
  };
  const route = L.kind === "sea" ? `By sea, ${Math.round(L.geo.km || L.d || 0).toLocaleString("en-US")} km: about ${Math.max(1, Math.round((L.geo.km || L.d || 0) / 600))} days` : L.kind === "world" ? "By sea to the world market, through middlemen" : L.kind === "over" ? "Caravans across wild land" : "Carts across the border";
  return `<strong>${escapeHtml(route)}</strong>${side(L.ab, L.vAB, L.a, L.b)}${side(L.ba, L.vBA, L.b, L.a)}`;
}

/* The sea lanes our merchants use, for the Sea trade block of the Economy panel. */
function seaLanesLineHtml() {
  if (!game.trade || !game.trade.v) return "";
  const rows = tradeLanes().filter(L => (L.kind === "sea" || L.kind === "world") && (L.a === PLAYER || L.b === PLAYER)).sort((x, y) => y.v - x.v)
    .map(L => { const o = L.a === PLAYER ? L.b : L.a; return o < 0 ? `the world market (${fmtMoneyFine(L.v)} a year)` : `the ${escapeHtml(nameOf(game, o))} (${Math.round(L.geo.km || L.d || 0).toLocaleString("en-US")} km, ${fmtMoneyFine(L.v)} a year)`; });
  return rows.length ? `<p class="small">Sea lanes in use: ${bJoin(rows)}. <button class="linkbtn" type="button" data-action="trade-lanes-show">Show them on the map</button></p>` : "";
}
