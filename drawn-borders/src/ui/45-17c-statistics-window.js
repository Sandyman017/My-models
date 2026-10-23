/* =====================================================================
   17c. Statistics window: everything about you, your rivals and the world
   ===================================================================== */
const STAT_VIEWS = [
  ["world", "World", "Rankings, shares, totals"],
  ["legacy", "Legacy", "Prestige, great works, world firsts"],
  ["nation", "Nations", "Every number for one country"],
  ["compare", "Compare", "Any measure, every nation, over time"],
  ["economy", "Economy", "Sectors, trade, goods, technology"],
  ["trade", "Trade", "Who sells what to whom, embargoes"],
  ["military", "Military", "Armies, wars, battles"],
  ["diplomacy", "Diplomacy", "Who likes whom, and every treaty"],
  ["chronicle", "History", "Records and the world's events"],
];
const STAT_METRICS = {
  gdp:       { label: "Output", get: h => h.gdp, fmt: v => fmtMoney(v), axis: v => fmtMoneyShort(v), sum: true },
  pop:       { label: "Population", get: h => h.pop, fmt: v => fmtPop(v), axis: v => `${fmtNum(v)}M`, sum: true },
  gdppc:     { label: "Output per person", get: h => (h.pop > 0.01 ? h.gdp / h.pop : null), fmt: v => `$${fmtNum(v)}k`, axis: v => `$${fmtNum(v)}k` },
  area:      { label: "Land", get: h => h.area, fmt: v => fmtKm(v), axis: v => fmtKm(v), sum: true },
  towns:     { label: "Towns", get: h => h.towns, fmt: v => `${Math.round(v)}`, axis: v => `${Math.round(v)}`, sum: true },
  soldiers:  { label: "Soldiers", get: h => h.soldiers, fmt: v => fmtCompact(v), axis: v => fmtCompact(v), sum: true },
  power:     { label: "Military strength", get: h => h.power, fmt: v => fmtCompact(v), axis: v => fmtCompact(v), sum: true },
  tanks:     { label: "Tanks", get: h => h.tanks, fmt: v => fmtCompact(v), axis: v => fmtCompact(v), sum: true },
  planes:    { label: "Aircraft", get: h => h.planes, fmt: v => fmtCompact(v), axis: v => fmtCompact(v), sum: true },
  stability: { label: "Stability", get: h => h.stability, fmt: v => `${Math.round(v)}`, axis: v => `${Math.round(v)}`, minSpan: 20 },
  treasury:  { label: "Treasury", get: h => h.treasury, fmt: v => fmtMoney(v), axis: v => fmtMoneyShort(v), zero: true },
  techs:     { label: "Technologies", get: h => h.techs, fmt: v => `${Math.round(v)}`, axis: v => `${Math.round(v)}` },
  exp:       { label: "Exports (a year)", get: h => h.exp, fmt: v => fmtMoney(v), axis: v => fmtMoneyShort(v), sum: true },
  imp:       { label: "Imports (a year)", get: h => (h.imp === undefined ? null : h.imp), fmt: v => fmtMoney(v), axis: v => fmtMoneyShort(v), sum: true },
  bal:       { label: "Trade balance", get: h => (h.imp === undefined || h.exp === undefined ? null : h.exp - h.imp), fmt: v => fmtSignedMoney(v), axis: v => fmtMoneyShort(v), zero: true },
  fin:       { label: "Food bought abroad (people fed)", get: h => (h.fin === undefined ? null : h.fin), fmt: v => fmtPeople(v), axis: v => `${fmtNum(v)}M`, sum: true, zero: true },
  skill:     { label: "Workforce skill", get: h => h.skill, fmt: v => pct(v), axis: v => pct(v) },
  ls:        { label: "Living standard", get: h => (h.ls === undefined ? null : h.ls), fmt: v => fmtK(v), axis: v => fmtK(v) },
  tfr:       { label: "Children per woman", get: h => (h.tfr === undefined ? null : h.tfr), fmt: v => v.toFixed(1), axis: v => v.toFixed(1) },
  old:       { label: "Over 65", get: h => (h.old === undefined ? null : h.old), fmt: v => pct(v), axis: v => pct(v) },
  food:      { label: "Food (share of need)", get: h => h.food, fmt: v => pct(v), axis: v => pct(v) },
  unemp:     { label: "Unemployment", get: h => (h.unemp === undefined ? null : h.unemp), fmt: v => pct1(v), axis: v => pct1(v), zero: true },
  resM:      { label: "Food reserve (months)", get: h => (h.resM === undefined ? null : h.resM), fmt: v => `${fmtNum(v)} months`, axis: v => fmtNum(v), zero: true },
  opP:       { label: "Their view of you", get: h => h.opP, fmt: v => signed(v), axis: v => signed(v), zero: true, rivalsOnly: true, minSpan: 40 },
  ships:     { label: "Warships", get: h => (h.ships === undefined ? null : h.ships), fmt: v => `${Math.round(v)}`, axis: v => `${Math.round(v)}`, sum: true },
  fr:        { label: "Freighters", get: h => (h.fr === undefined ? null : h.fr), fmt: v => `${Math.round(v)}`, axis: v => `${Math.round(v)}`, sum: true },
  seaMt:     { label: "Sea trade (Mt a year)", get: h => (h.seaMt === undefined ? null : h.seaMt), fmt: v => `${fmtNum(v)} Mt`, axis: v => `${fmtNum(v)}`, sum: true },
  prestige:  { label: "Prestige", get: h => (h.prestige === undefined ? null : h.prestige), fmt: v => `${Math.round(v)}`, axis: v => `${Math.round(v)}`, zero: true },
};
const COMPARE_METRICS = ["gdp", "gdppc", "pop", "area", "towns", "soldiers", "power", "tanks", "planes", "ships", "fr", "stability", "treasury", "techs", "exp", "imp", "bal", "fin", "skill", "food", "unemp", "resM", "prestige", "opP"];
const STAT_CHARTS = new Map();
let statChartSeq = 0;

function fmtCompact(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${Math.round(v / 1e3)}k`;
  return `${Math.round(v)}`;
}
function fmtMoneyShort(v) { const a = Math.abs(v); const s = a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}T` : a >= 10 ? `${Math.round(a)}B` : `${a.toFixed(1)}B`; return `${v < 0 ? "−" : ""}$${s}`; }
function fmtKm(cells) { const k = cells * KM2_PER_CELL; return k >= 1e6 ? `${(k / 1e6).toFixed(2)}M km²` : `${Math.round(k / 1000)}k km²`; }
function yearOf(turn) { return Math.floor(turn / 4) + 1; }

function newStatsState() { return { view: "world", nid: PLAYER, metric: "gdp", mode: "value", range: "all", hidden: [], sort: { key: "gdp", dir: -1 }, matrix: "opinion", chronNid: null, majorOnly: true }; }
function openStats(view) {
  if (!game || ui.phase === "draw" || ui.play) return;
  ui.asm = null;
  ui.stats = ui.stats || newStatsState();
  if (view) ui.stats.view = view;
}

/* ---------- Data ---------- */
function statNations(g, includeFallen = true) { return g.nations.filter(n => includeFallen ? n.history && n.history.length : n.alive); }
function rangeStart(g) { const r = ui.stats.range; return r === "all" ? -Infinity : g.turn - Number(r) * 4; }
function seriesFor(g, metric, opts = {}) {
  const M = STAT_METRICS[metric];
  const t0 = rangeStart(g);
  return statNations(g).filter(n => !(M.rivalsOnly && n.isPlayer)).map(n => ({
    key: n.id, name: n.name, color: n.color, bold: n.isPlayer, faded: !n.alive,
    pts: n.history.filter(h => h.turn >= t0).map(h => [h.turn, M.get(h)]).filter(p => p[1] !== null && p[1] !== undefined),
  })).filter(s => s.pts.length && !(opts.hide || []).includes(s.key));
}
/* For each turn, the total over every nation that had a record that season. */
function worldTotals(g, getter) {
  const t0 = rangeStart(g);
  const by = new Map();
  for (const n of g.nations) for (const h of n.history || []) {
    if (h.turn < t0) continue;
    const v = getter(h);
    if (v === null || v === undefined) continue;
    by.set(h.turn, (by.get(h.turn) || 0) + v);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]);
}
function rankSeries(series) {
  const turns = [...new Set(series.flatMap(s => s.pts.map(p => p[0])))].sort((a, b) => a - b);
  const maps = series.map(s => new Map(s.pts));
  const out = series.map(s => ({ ...s, pts: [] }));
  for (const t of turns) {
    const vals = series.map((s, i) => ({ i, v: maps[i].get(t) })).filter(x => x.v !== undefined).sort((a, b) => b.v - a.v);
    vals.forEach((x, r) => out[x.i].pts.push([t, r + 1]));
  }
  return out;
}
function hAgo(n, seasons) { const h = n.history; return h.length > seasons ? h[h.length - 1 - seasons] : h[0]; }
function nationRow(g, n) {
  const econ = economies()[n.id] || emptyEconomy();
  const last = n.history[n.history.length - 1] || {};
  const yearAgo = hAgo(n, 4) || last;
  let divs = { inf: 0, art: 0, arm: 0 }, tanks = 0;
  for (const d of g.divisions) if (d.owner === n.id) { divs[d.type]++; tanks += d.tanks || 0; }
  const planes = g.airwings.filter(a => a.owner === n.id).reduce((s, a) => s + a.planes, 0);
  return {
    n, econ, gdp: econ.gdp, growth: yearAgo.gdp ? econ.gdp / yearAgo.gdp - 1 : 0, gdppc: econ.pop > 0.01 ? econ.gdp / econ.pop : 0, pop: econ.pop,
    area: econ.area || 0, towns: econ.cities.length, soldiers: n.soldiers || 0, divs, divCount: divs.inf + divs.art + divs.arm, tanks: tanks + ((n.stock && n.stock.tanks) || 0), planes,
    power: armyPower(g, n.id), stability: n.stability, treasury: n.treasury, techs: Object.keys(n.techs || {}).length,
    opP: n.isPlayer ? null : opinionDetail(g, n.id, PLAYER).value, exp: econ.exportValue || 0, imp: econ.importBill || 0,   // already a year
  };
}
function rankOf(rows, key, nid) { const s = rows.slice().sort((a, b) => b[key] - a[key]); return s.findIndex(r => r.n.id === nid) + 1; }

/* ---------- Chart primitives (SVG strings with a hover layer) ---------- */
function niceTicks(lo, hi, count = 4) {
  if (!(hi > lo)) { hi = lo + 1; }
  const span = hi - lo, raw = span / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count + 0.5) || 10 * mag;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const out = [];
  for (let v = a; v <= b + step * 0.01; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}
function yearTicks(t0, t1, maxTicks) {
  const years = Math.max(1, (t1 - t0) / 4);
  const stepY = [1, 2, 5, 10, 20, 25, 50].find(s => years / s <= maxTicks) || 50;
  const out = [];
  for (let y = Math.ceil(yearOf(t0) / stepY) * stepY; (y - 1) * 4 <= t1; y += stepY) if ((y - 1) * 4 >= t0) out.push((y - 1) * 4);
  if (!out.length) out.push(t0);
  return out;
}
function emptyChart(width, height, text) {
  return `<div class="st-empty" style="width:${width}px;height:${height}px">${text}</div>`;
}

/* Lines. series: [{key, name, color, pts: [[turn, value]], bold}] */
function lineChart(series, { width, height = 200, axis = v => fmtNum(v), fmt = axis, zero = false, fromZero = true, invert = false, labels = true, intY = false, minSpan = 0 } = {}) {
  const pts = series.flatMap(s => s.pts);
  if (!pts.length) return emptyChart(width, height, "Not enough history yet. Play a few seasons.");
  const id = `c${++statChartSeq}`;
  const tMin = Math.min(...pts.map(p => p[0])), tMax = Math.max(tMin + 1, ...pts.map(p => p[0]));
  let lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
  if (fromZero && lo > 0) lo = 0;
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  const ticks = intY ? (() => { const o = []; const st = hi - lo <= 12 ? 1 : Math.max(1, Math.ceil((hi - lo) / 6)); for (let v = Math.floor(lo); v <= Math.ceil(hi); v += st) o.push(v); return o; })() : niceTicks(lo, hi);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1] === y0 ? y0 + 1 : ticks[ticks.length - 1];
  const showLabels = labels && series.length <= 9 && width > 420;
  const padL = 54, padR = showLabels ? 128 : 14, padT = 10, padB = 24;
  const pw = width - padL - padR, ph = height - padT - padB;
  const X = t => padL + ((t - tMin) / (tMax - tMin)) * pw;
  const Y = v => invert ? padT + ((v - y0) / (y1 - y0)) * ph : padT + ph - ((v - y0) / (y1 - y0)) * ph;
  let s = `<svg class="st-chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`;
  for (const v of ticks) s += `<line class="grid${v === 0 && zero ? " zero" : ""}" x1="${padL}" x2="${padL + pw}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${padL - 8}" y="${Y(v) + 4}" text-anchor="end">${escapeHtml(axis(v))}</text>`;
  for (const t of yearTicks(tMin, tMax, Math.max(2, Math.floor(pw / 70)))) s += `<text class="ax" x="${X(t)}" y="${height - 6}" text-anchor="middle">Y${yearOf(t)}</text>`;
  const order = series.slice().sort((a, b) => (a.bold ? 1 : 0) - (b.bold ? 1 : 0));
  for (const se of order) {
    if (se.pts.length === 1) { s += `<circle data-s="${se.key}" cx="${X(se.pts[0][0])}" cy="${Y(se.pts[0][1])}" r="3.5" fill="${se.color}"/>`; continue; }
    const d = se.pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join("");
    s += `<path data-s="${se.key}" d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.bold ? 2.75 : 2}" stroke-linejoin="round" stroke-linecap="round"${se.faded ? ' stroke-dasharray="5 4" opacity="0.7"' : ""}/>`;
  }
  if (showLabels) {
    const ends = series.map(se => { const p = se.pts[se.pts.length - 1]; return { se, x: X(p[0]), y: Y(p[1]) }; }).sort((a, b) => a.y - b.y);
    const gap = 13;
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < gap) ends[i].y = ends[i - 1].y + gap;
    const over = ends.length ? ends[ends.length - 1].y - (padT + ph + 4) : 0;
    if (over > 0) for (const e of ends) e.y -= over;
    for (const e of ends) {
      const name = e.se.name.length > 17 ? `${e.se.name.slice(0, 16)}…` : e.se.name;
      s += `<text data-s="${e.se.key}" class="end${e.se.bold ? " me" : ""}" x="${padL + pw + 8}" y="${e.y + 4}">${escapeHtml(name)}</text>`;
    }
  }
  s += `<line class="xh" id="${id}-xh" x1="0" x2="0" y1="${padT}" y2="${padT + ph}" visibility="hidden"/><g id="${id}-dots"></g>`;
  s += `<rect class="hit" data-chart="${id}" x="${padL}" y="${padT}" width="${pw}" height="${ph}"/></svg>`;
  STAT_CHARTS.set(id, { kind: "line", padL, pw, tMin, tMax, series, fmt, X, Y });
  return s;
}

/* Shares stacked to 100%. series as above; each turn's values are divided by that turn's total. */
function shareChart(series, { width, height = 200, fmt = v => fmtNum(v) } = {}) {
  const turns = [...new Set(series.flatMap(s => s.pts.map(p => p[0])))].sort((a, b) => a - b);
  if (turns.length < 2) return emptyChart(width, height, "Not enough history yet. Play a few seasons.");
  const id = `c${++statChartSeq}`;
  const padL = 44, padR = 128, padT = 10, padB = 24;
  const pw = width - padL - padR, ph = height - padT - padB;
  const tMin = turns[0], tMax = turns[turns.length - 1];
  const X = t => padL + ((t - tMin) / (tMax - tMin)) * pw;
  const Y = v => padT + ph - v * ph;
  const maps = series.map(s => new Map(s.pts));
  const totals = turns.map(t => maps.reduce((sum, m) => sum + Math.max(0, m.get(t) || 0), 0) || 1);
  let s = `<svg class="st-chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`;
  const base = turns.map(() => 0);
  const bands = [];
  series.forEach((se, i) => {
    const top = turns.map((t, k) => base[k] + Math.max(0, maps[i].get(t) || 0) / totals[k]);
    const up = turns.map((t, k) => `${X(t).toFixed(1)} ${Y(top[k]).toFixed(1)}`);
    const down = turns.map((t, k) => `${X(t).toFixed(1)} ${Y(base[k]).toFixed(1)}`).reverse();
    s += `<path data-s="${se.key}" d="M${up.join("L")}L${down.join("L")}Z" fill="${se.color}" stroke="var(--panel)" stroke-width="1.5" stroke-linejoin="round"/>`;
    const lastK = turns.length - 1;
    bands.push({ se, mid: (base[lastK] + top[lastK]) / 2, h: top[lastK] - base[lastK] });
    top.forEach((v, k) => { base[k] = v; });
  });
  for (const v of [0, 0.25, 0.5, 0.75, 1]) s += `<text class="ax" x="${padL - 8}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`;
  for (const t of yearTicks(tMin, tMax, Math.max(2, Math.floor(pw / 70)))) s += `<text class="ax" x="${X(t)}" y="${height - 6}" text-anchor="middle">Y${yearOf(t)}</text>`;
  const labels = bands.filter(b => b.h > 0.035).map(b => ({ ...b, y: Y(b.mid) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 13) labels[i].y = labels[i - 1].y + 13;
  for (const l of labels) { const name = l.se.name.length > 17 ? `${l.se.name.slice(0, 16)}…` : l.se.name; s += `<text data-s="${l.se.key}" class="end" x="${padL + pw + 8}" y="${l.y + 4}">${escapeHtml(name)}</text>`; }
  s += `<line class="xh" id="${id}-xh" x1="0" x2="0" y1="${padT}" y2="${padT + ph}" visibility="hidden"/><g id="${id}-dots"></g>`;
  s += `<rect class="hit" data-chart="${id}" x="${padL}" y="${padT}" width="${pw}" height="${ph}"/></svg>`;
  STAT_CHARTS.set(id, { kind: "share", padL, pw, tMin, tMax, series, fmt, X, Y, maps, turns, totals });
  return s;
}

/* Columns, one per year. data: [[year, value]] */
function columnChart(data, { width, height = 160, color = "var(--gold)", fmt = v => fmtNum(v), label = "" } = {}) {
  if (!data.length) return emptyChart(width, height, "Nothing yet.");
  const id = `c${++statChartSeq}`;
  const padL = 44, padR = 10, padT = 10, padB = 24;
  const pw = width - padL - padR, ph = height - padT - padB;
  const hi = Math.max(1, ...data.map(d => d[1]));
  const ticks = niceTicks(0, hi, 3);
  const top = ticks[ticks.length - 1];
  const bw = pw / data.length;
  const Y = v => padT + ph - (v / top) * ph;
  let s = `<svg class="st-chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`;
  for (const v of ticks) s += `<line class="grid" x1="${padL}" x2="${padL + pw}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${padL - 8}" y="${Y(v) + 4}" text-anchor="end">${escapeHtml(fmt(v))}</text>`;
  const every = Math.max(1, Math.ceil(data.length / Math.floor(pw / 46)));
  data.forEach(([yr, v], i) => {
    const x = padL + i * bw + Math.min(2, bw * 0.1), w = Math.max(1, bw - Math.min(4, bw * 0.2));
    const h = Math.max(v > 0 ? 1 : 0, (v / top) * ph);
    if (h > 0) s += `<path d="M${x} ${padT + ph}V${padT + ph - h + Math.min(4, h)}q0 -${Math.min(4, h)} ${Math.min(4, w / 2)} -${Math.min(4, h)}H${x + w - Math.min(4, w / 2)}q${Math.min(4, w / 2)} 0 ${Math.min(4, w / 2)} ${Math.min(4, h)}V${padT + ph}Z" fill="${color}"/>`;
    s += `<rect class="hit bar" data-tip="${escapeHtml(`Year ${yr}: ${fmt(v)}${label ? ` ${label}` : ""}`)}" x="${padL + i * bw}" y="${padT}" width="${bw}" height="${ph}"/>`;
    if (i % every === 0) s += `<text class="ax" x="${padL + i * bw + bw / 2}" y="${height - 6}" text-anchor="middle">Y${yr}</text>`;
  });
  s += `</svg>`;
  return s;
}

function sparkline(vals, color, w = 96, h = 26) {
  const v = vals.filter(x => x !== null && x !== undefined);
  if (v.length < 2) return "";
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const d = v.map((x, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * (w - 4) + 2).toFixed(1)} ${(h - 3 - ((x - lo) / span) * (h - 6)).toFixed(1)}`).join("");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function legendHtml(series, toggle = true) {
  if (series.length < 2) return "";
  const hidden = ui.stats.hidden;
  return `<div class="st-legend">${series.map(s => `<button type="button" class="lg ${hidden.includes(s.key) ? "off" : ""}" ${toggle ? `data-action="st-toggle" data-key="${s.key}"` : ""} data-s="${s.key}"><i style="background:${s.color}"></i>${escapeHtml(s.name)}</button>`).join("")}</div>`;
}
function card(title, body, opts = {}) {
  return `<section class="st-card${opts.wide ? " wide" : ""}"><div class="st-card-head"><h3>${title}</h3>${opts.note ? `<span class="muted small">${opts.note}</span>` : ""}</div>${body}</section>`;
}
function tile(label, value, delta, tone, spark) {
  return `<div class="st-tile"><span class="k">${label}</span><span class="v">${value}</span>${delta ? `<span class="d tone-${tone || "neutral"}">${delta}</span>` : ""}${spark || ""}</div>`;
}
function swatch(n) { return `<i class="sw" style="background:${n.color}"></i>`; }
function divBar(v, max = 100) {
  const w = Math.min(50, (Math.abs(v) / max) * 50);
  return `<span class="divbar"><span style="${v >= 0 ? `left:50%` : `left:${50 - w}%`};width:${w}%;background:${v >= 0 ? "var(--div-pos)" : "var(--div-neg)"}"></span><i></i></span>`;
}

/* ---------- Layout ---------- */
/* Charts are drawn at their real pixel size, so text never stretches. Card padding and borders take 34px. */
function statsWidth() {
  const W = Math.min(window.innerWidth - 32, 1560);
  const main = W - 200 - 48 - 14;
  const narrow = window.innerWidth <= 1100;
  const full = Math.floor(main - 34);
  return { main: full, full, half: narrow ? full : Math.floor((main - 16) / 2 - 34), third: narrow ? full : Math.floor((main - 32) / 3 - 34) };
}

function statsHtml() {
  STAT_CHARTS.clear();
  const g = game, S = ui.stats;
  const body = { world: statsWorldHtml, legacy: statsLegacyHtml, nation: statsNationHtml, compare: statsCompareHtml, economy: statsEconomyHtml, trade: statsTradeHtml, military: statsMilitaryHtml, diplomacy: statsDiplomacyHtml, chronicle: statsChronicleHtml }[S.view]();
  return `<div class="st-win" role="dialog" aria-modal="true" aria-labelledby="st-title">
    <header class="st-head">
      <div class="block" style="gap:2px"><span class="eyebrow">Statistics · ${seasonLabel(g.turn)}</span><h2 id="st-title">${STAT_VIEWS.find(v => v[0] === S.view)[1]}</h2></div>
      <button class="btn" type="button" data-action="stats-close">Close <kbd>Esc</kbd></button>
    </header>
    <div class="st-body">
      <nav class="st-nav" aria-label="Statistics sections">${STAT_VIEWS.map(([k, label, blurb]) => `<button type="button" class="${S.view === k ? "on" : ""}" data-action="st-view" data-view="${k}" aria-pressed="${S.view === k}"><strong>${label}</strong><span>${blurb}</span></button>`).join("")}
        <p class="muted small st-navnote">Hover any chart to read exact values. Click names in a legend to hide or show them. Press <kbd>I</kbd> to open or close.</p></nav>
      <div class="st-main" id="st-main">${body}</div>
    </div>
  </div>
  <div class="st-tip" id="st-tip" hidden></div>`;
}

function chipsHtml(action, current, items) {
  return `<div class="st-chips">${items.map(([v, l]) => `<button type="button" class="${String(current) === String(v) ? "on" : ""}" data-action="${action}" data-v="${v}" aria-pressed="${String(current) === String(v)}">${l}</button>`).join("")}</div>`;
}
const rangeChips = () => chipsHtml("st-range", ui.stats.range, [["5", "5 years"], ["10", "10 years"], ["all", "All"]]);

/* ---------- World ---------- */
function statsWorldHtml() {
  const g = game, w = world, W = statsWidth();
  const rows = liveNations(g).map(n => nationRow(g, n));
  const land = w.terrain.reduce((s, t, i) => s + (isLand(w, i) ? 1 : 0), 0);
  const owned = rows.reduce((s, r) => s + r.area, 0);
  const gdp = rows.reduce((s, r) => s + r.gdp, 0), pop = rows.reduce((s, r) => s + r.pop, 0);
  const totGdp = worldTotals(g, h => h.gdp);
  const lastYearGdp = totGdp.length > 4 ? totGdp[totGdp.length - 5][1] : null;
  const W2 = (g.stats.world || []);
  const lastYear = W2.slice(-4);
  const battlesYear = lastYear.reduce((s, x) => s + x.battles, 0);
  const deadAll = W2.reduce((s, x) => s + x.deaths, 0);
  const soldiers = rows.reduce((s, r) => s + r.soldiers, 0);
  const tiles = [
    tile("World output", fmtMoney(gdp), lastYearGdp ? `${signedPct(gdp / lastYearGdp - 1, 1)} in a year` : "", toneOf(lastYearGdp ? gdp - lastYearGdp : 0), sparkline(totGdp.map(p => p[1]), "var(--gold)")),
    tile("World population", fmtPop(pop), "", "", sparkline(worldTotals(g, h => h.pop).map(p => p[1]), "var(--gold)")),
    tile("Nations", `${rows.length}`, `${g.nations.length - rows.length} fallen`, "neutral"),
    tile("Land settled", pct(owned / land), `${fmtKm(land - owned)} still wild`, "neutral"),
    tile("Wars now", `${g.wars.length}`, `${battlesYear} battle${battlesYear === 1 ? "" : "s"} this year`, g.wars.length ? "bad" : "neutral"),
    tile("Under arms", fmtCompact(soldiers), deadAll ? `${fmtCompact(deadAll)} killed in all wars` : "no war dead yet", deadAll ? "bad" : "neutral"),
  ].join("");
  const sharesGdp = shareChart(seriesFor(g, "gdp").filter(s => !s.faded || s.pts.length), { width: W.half, height: 230, fmt: v => fmtMoney(v) });
  const sharesLand = shareChart(seriesFor(g, "area"), { width: W.half, height: 230, fmt: v => fmtKm(v) });
  const byYear = new Map();
  for (const x of W2) { const y = yearOf(x.turn); const e = byYear.get(y) || { battles: 0, deaths: 0 }; e.battles += x.battles; e.deaths += x.deaths; byYear.set(y, e); }
  const yrs = [...byYear.entries()].sort((a, b) => a[0] - b[0]).slice(-30);
  return `<div class="st-tiles">${tiles}</div>
    <div class="st-grid">
      ${card("Share of world output", sharesGdp, { note: "who makes the world's wealth" })}
      ${card("Share of settled land", sharesLand, { note: "wild land not counted" })}
      ${card("Rankings", rankingTableHtml(rows), { wide: true, note: "click a column to sort · click a nation for its page" })}
      ${card("World output", lineChart([{ key: "w", name: "World", color: "var(--gold)", pts: totGdp }], { width: W.half, height: 180, axis: fmtMoneyShort, fmt: v => fmtMoney(v), labels: false }))}
      ${card("World population", lineChart([{ key: "w", name: "World", color: "var(--gold)", pts: worldTotals(g, h => h.pop) }], { width: W.half, height: 180, axis: v => `${fmtNum(v)}M`, fmt: fmtPop, labels: false }))}
      ${card("Battles per year", columnChart(yrs.map(([y, e]) => [y, e.battles]), { width: W.half, fmt: v => `${Math.round(v)}`, label: "battles", color: "var(--div-neg)" }))}
      ${card("Soldiers killed per year", columnChart(yrs.map(([y, e]) => [y, e.deaths]), { width: W.half, fmt: fmtCompact, label: "killed", color: "var(--div-neg)" }))}
    </div>`;
}

function rankingTableHtml(rows) {
  const S = ui.stats, sort = S.sort;
  const cols = [
    ["gdp", "Output", r => fmtMoney(r.gdp)], ["growth", "1-yr growth", r => `<span class="tone-${toneOf(r.growth, 0.001)}">${signedPct(r.growth, 1)}</span>`],
    ["gdppc", "Per person", r => `$${fmtNum(r.gdppc)}k`], ["pop", "Population", r => fmtPop(r.pop)], ["area", "Land", r => fmtKm(r.area)], ["towns", "Towns", r => r.towns],
    ["soldiers", "Soldiers", r => fmtCompact(r.soldiers)], ["power", "Mil. strength", r => fmtCompact(r.power)],
    ["stability", "Stability", r => Math.round(r.stability)], ["treasury", "Treasury", r => fmtMoney(r.treasury)], ["techs", "Techs", r => r.techs],
    ["opP", "View of you", r => r.opP === null ? `<span class="muted">you</span>` : `<span class="tone-${toneOf(r.opP, 4)}">${signed(r.opP)}</span>`],
  ];
  const val = (r, k) => (r[k] === null ? -1e9 : r[k]);
  const sorted = rows.slice().sort((a, b) => (val(b, sort.key) - val(a, sort.key)) * -sort.dir);
  return `<div class="st-tablewrap"><table class="st-table">
    <thead><tr><th>#</th><th class="l">Nation</th>${cols.map(([k, l]) => `<th><button type="button" data-action="st-sort" data-key="${k}" class="${sort.key === k ? "on" : ""}">${l}${sort.key === k ? (sort.dir < 0 ? " ▾" : " ▴") : ""}</button></th>`).join("")}</tr></thead>
    <tbody>${sorted.map((r, i) => `<tr class="${r.n.isPlayer ? "me" : ""}"><td class="muted">${i + 1}</td><td class="l"><button type="button" class="st-nlink" data-action="st-nation" data-nid="${r.n.id}">${swatch(r.n)}${escapeHtml(r.n.name)}</button></td>${cols.map(([k, , f]) => `<td>${f(r)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

/* ---------- One nation ---------- */
function statsNationHtml() {
  const g = game, W = statsWidth(), S = ui.stats;
  const all = statNations(g);
  if (!all.some(n => n.id === S.nid)) S.nid = PLAYER;
  const n = g.nations[S.nid];
  const picker = `<div class="st-chips nations">${all.map(z => `<button type="button" class="${z.id === n.id ? "on" : ""}" data-action="st-nation" data-nid="${z.id}">${swatch(z)}${escapeHtml(z.name)}${z.alive ? "" : " (fallen)"}</button>`).join("")}</div>`;
  if (!n.alive) {
    const last = n.history[n.history.length - 1];
    return `${picker}<div class="st-hero" style="--c:${n.color}"><h3>${escapeHtml(n.name)}</h3><p class="muted">This nation no longer exists. It was last recorded in ${seasonLabel(last.turn)}.</p></div>
      <div class="st-grid">${["gdp", "pop", "area", "soldiers"].map(k => card(STAT_METRICS[k].label, lineChart([{ key: n.id, name: n.name, color: n.color, pts: n.history.map(h => [h.turn, STAT_METRICS[k].get(h)]) }], { width: W.half, height: 170, axis: STAT_METRICS[k].axis, fmt: STAT_METRICS[k].fmt, labels: false }))).join("")}</div>`;
  }
  const rows = liveNations(g).map(z => nationRow(g, z));
  const r = rows.find(x => x.n.id === n.id), econ = r.econ;
  const h = n.history;
  const series = k => h.map(x => STAT_METRICS[k].get(x));
  const delta = (k, fmtD) => { const a = hAgo(n, 4); if (!a || a === h[h.length - 1]) return ["", "neutral"]; const now = STAT_METRICS[k].get(h[h.length - 1]), then = STAT_METRICS[k].get(a); if (now == null || then == null) return ["", "neutral"]; return [fmtD(now, then), toneOf(now - then, 1e-6)]; };
  const relD = (a, b) => (b ? `${signedPct(a / b - 1, 1)} in a year` : "");
  const absD = f => (a, b) => `${a - b >= 0 ? "+" : "−"}${f(Math.abs(a - b))} in a year`;
  const T = (label, k, value, fmtD) => { const [d, tone] = delta(k, fmtD); return tile(label, value, d, k === "treasury" ? toneOf(n.treasury) : tone, sparkline(series(k), n.color)); };
  const nRank = rows.length;
  const ranks = [["gdp", "output"], ["gdppc", "wealth per person"], ["pop", "population"], ["area", "land"], ["power", "military strength"], ["techs", "technology"]]
    .map(([k, l]) => `<span class="rank"><b>#${rankOf(rows, k, n.id)}</b> in ${l}</span>`).join("");
  const kind = n.isPlayer ? "Your nation" : `${n.minor ? "City-state · " : ""}${ARCHETYPES[n.archetype].label}`;
  const leader = n.leader ? ` · ${escapeHtml(leaderName(n))}, age ${Math.floor(n.leader.age)} (${n.leader.traits.map(t => LEADER_TRAITS[t].label.toLowerCase()).join(", ")})` : "";
  const ns = natStats(g, n.id);
  const one = (k, title, opts = {}) => card(title || STAT_METRICS[k].label, lineChart([{ key: n.id, name: n.name, color: n.color, pts: h.filter(x => x.turn >= rangeStart(g)).map(x => [x.turn, STAT_METRICS[k].get(x)]).filter(p => p[1] != null) }],
    { width: W.third, height: 160, axis: STAT_METRICS[k].axis, fmt: STAT_METRICS[k].fmt, labels: false, zero: STAT_METRICS[k].zero, fromZero: !opts.tight, minSpan: STAT_METRICS[k].minSpan || 0, intY: k === "techs" }));
  const secSeries = ["primary", "secondary", "tertiary", "quaternary"].map((k, i) => ({ key: k, name: SECTORS[k].label, color: SECTORS[k].color, pts: h.filter(x => x.sec && x.turn >= rangeStart(g)).map(x => [x.turn, x.sec[i]]) }));
  const subs = (econ.subs || []).slice().sort((a, b) => b.va - a.va).filter(s => s.va > 0.05);
  const maxSub = subs.length ? subs[0].va : 1;
  const subsHtml = subs.length ? `<ul class="st-bars">${subs.slice(0, 14).map(s => `<li><span class="lbl"><i class="sw" style="background:${SECTORS[s.sector].color}"></i>${escapeHtml(s.sub)}</span><span class="bar"><span style="width:${(s.va / maxSub) * 100}%;background:${SECTORS[s.sector].color}"></span></span><span class="num">${fmtMoney(s.va)}</span><span class="num muted">${fmtWorkers(s.workers)}</span></li>`).join("")}</ul>` : `<p class="muted small">No economy.</p>`;
  return `${picker}
    <div class="st-hero" style="--c:${n.color}">
      <div><span class="eyebrow">${kind}${leader}</span><h3>${escapeHtml(n.name)}</h3></div>
      <div class="ranks">${ranks}<span class="muted small">of ${nRank} nations</span></div>
    </div>
    <div class="st-tiles">
      ${T("Output", "gdp", `${fmtMoney(r.gdp)}/yr`, relD)}
      ${T("Per person", "gdppc", `$${fmtNum(r.gdppc)}k`, relD)}
      ${T("Population", "pop", fmtPop(r.pop), relD)}
      ${T("Land", "area", fmtKm(r.area), absD(fmtKm))}
      ${T("Stability", "stability", `${Math.round(n.stability)}`, absD(v => fmtNum(v)))}
      ${T("Treasury", "treasury", n.treasury >= 0 ? fmtMoney(n.treasury) : `Debt ${fmtMoney(-n.treasury)}`, absD(fmtMoney))}
      ${T("Soldiers", "soldiers", fmtCompact(r.soldiers), absD(fmtCompact))}
      ${T("Military strength", "power", fmtCompact(r.power), relD)}
    </div>
    <div class="st-grid three">
      ${one("gdp")}${one("pop")}${one("gdppc", null, { tight: true })}
      ${one("treasury")}${one("stability")}${n.isPlayer ? one("exp") : one("opP", `Their view of you`)}
      ${one("soldiers")}${one("power")}${one("techs")}
    </div>
    <div class="st-grid">
      ${card("Economy by sector", shareChart(secSeries, { width: W.half, height: 220, fmt: v => `${fmtMoney(v)}/yr` }) + legendHtml(secSeries, false), { note: "share of output over time" })}
      ${card("What the economy makes", subsHtml, { note: "output a year · workers" })}
      ${card("Goods market", goodsTableHtml(econ), { note: "a year" })}
      ${card("Budget this season", budgetHtml(n, econ))}
      ${card("Towns", townsTableHtml(econ), { wide: true })}
      ${card("Industry", industryListHtml(econ))}
      ${card("Technology", techListHtml(n))}
      ${card("Armed forces", armedForcesHtml(g, n, r, ns))}
      ${card("Relations", relationsListHtml(g, n), { note: "their opinion of each nation" })}
    </div>`;
}

function goodsTableHtml(econ) {
  const G = econ.goods;
  if (!G || !G.supply || !Object.keys(G.supply).length) return `<p class="muted small">No market.</p>`;
  const row = k => {
    const s = G.supply[k] || 0, d = G.demand[k] || 0, im = G.imports[k] || 0, ex = G.exports[k] || 0, sat = econ.sat[k] ?? 1;
    if (s < 0.01 && d < 0.01) return "";
    const status = sat < 0.85 ? `<span class="tone-bad">short</span>` : ex > 0.05 ? `<span class="tone-good">exporting</span>` : im > 0.05 ? `<span class="muted">importing</span>` : `<span class="muted">balanced</span>`;
    return `<tr><td class="l">${GOODS[k].label}</td><td>${fmtNum(s)}</td><td>${fmtNum(d)}</td><td>${im > 0.005 ? fmtNum(im) : "–"}</td><td>${ex > 0.005 ? fmtNum(ex) : "–"}</td><td>${pct(Math.min(9.99, sat))}</td><td>${status}</td></tr>`;
  };
  return `<div class="st-tablewrap"><table class="st-table compact"><thead><tr><th class="l">Good</th><th>Made</th><th>Wanted</th><th>Imports</th><th>Exports</th><th>Met</th><th></th></tr></thead><tbody>${GOOD_ORDER.map(row).join("")}</tbody></table></div>`;
}
function budgetHtml(n, econ) {
  if (!econ.cities.length) return `<p class="muted small">No budget.</p>`;
  const b = computeBudget(n, econ, n.laws);
  const line = (l, v, tone) => `<li><span>${l}</span><span class="num ${tone || ""}">${fmtSignedMoney(v)}</span></li>`;
  return `<ul class="st-lines">
    ${line("Taxes", b.revenue, "tone-good")}${b.tariffs > 0.05 ? line("Tariffs", b.tariffs, "tone-good") : ""}
    ${line("Healthcare", -b.services)}${line("Education", -b.education)}${b.research > 0.05 ? line("Research", -b.research) : ""}
    ${line("Army and arms", -b.army)}${line("Roads and ports", -b.upkeep)}${b.interest > 0.05 ? line(`Interest (${pct(b.interestRate)} a year)`, -b.interest, "tone-bad") : ""}
    <li class="total"><span>Balance</span><span class="num tone-${toneOf(b.balance, 0.05)}">${fmtSignedMoney(b.balance)}</span></li>
    ${b.debt > 0 ? `<li><span class="muted">Debt</span><span class="num">${fmtMoney(b.debt)} (${pct(b.debtRatio)} of output)</span></li>` : ""}
  </ul>`;
}
function townsTableHtml(econ) {
  if (!econ.regions.length) return `<p class="muted small">No towns.</p>`;
  const rows = econ.regions.slice().sort((a, b) => b.pop - a.pop);
  return `<div class="st-tablewrap"><table class="st-table compact"><thead><tr><th class="l">Town</th><th>People</th><th>Importance</th><th>Mood</th><th>Output</th><th>Per person</th><th>Food</th><th>Farm workers</th><th>Industry levels</th><th class="l">Notes</th></tr></thead>
    <tbody>${rows.map(r => {
      const lv = Object.values(cityLevels(r.city)).reduce((s, v) => s + v, 0);
      const notes = [...(r.city.roles || []).filter(k => CITY_ROLES[k]).slice(0, 3).map(k => CITY_ROLES[k].label.toLowerCase()), r.city.focus && FOCI[r.city.focus] ? `program: ${FOCI[r.city.focus].label.toLowerCase()}` : "", econ.isolated.includes(r.city) ? "cut off from the capital" : ""].filter(Boolean).join(", ");
      return `<tr><td class="l">${escapeHtml(r.city.name)}</td><td>${fmtPop(r.pop)}</td><td>${r.city.imp || "—"}</td><td class="${(r.city.mood ?? 55) < 40 ? "tone-bad" : ""}">${Math.round(r.city.mood ?? 55)}</td><td>${fmtMoney(r.gdp || 0)}</td><td>$${fmtNum(r.outputK || 0)}k</td><td class="${r.foodRatio < 1 ? "tone-bad" : ""}">${pct(r.foodRatio || 0)}</td><td>${fmtWorkers(r.farmWorkers || 0)}</td><td>${fmtNum(lv)}</td><td class="l muted">${notes}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}
function industryListHtml(econ) {
  const lv = econ.levels || {};
  const items = INDUSTRY_ORDER.filter(k => (lv[k] || 0) > 0.01).map(k => ({ k, v: lv[k] }));
  if (!items.length) return `<p class="muted small">No industry yet.</p>`;
  return `<ul class="st-pills">${items.map(x => `<li><i class="sw" style="background:${SECTORS[INDUSTRIES[x.k].sector].color}"></i>${escapeHtml(INDUSTRIES[x.k].label)}<b class="num">${fmtNum(x.v)}</b></li>`).join("")}</ul>`;
}
function techListHtml(n) {
  const R = n.research || {};
  return `<ul class="st-techs">${TECH_ORDER.map(t => {
    const done = n.techs && n.techs[t] !== undefined;
    const now = R.target === t;
    return `<li class="${done ? "done" : now ? "now" : ""}"><span>${escapeHtml(TECHS[t].label)}</span><span class="muted small">${done ? seasonLabel(n.techs[t]) : now ? `researching · ${pct(Math.min(1, (R.progress || 0) / TECHS[t].cost))}` : "—"}</span></li>`;
  }).join("")}</ul>`;
}
function armedForcesHtml(g, n, r, ns) {
  const st = n.stock || {};
  const war = enemiesOf(g, n.id).map(id => nameOf(g, id));
  const kv = (k, v) => `<li><span>${k}</span><span class="num">${v}</span></li>`;
  return `<ul class="st-lines">
    ${kv("Divisions", `${r.divCount} (${r.divs.inf} infantry, ${r.divs.art} artillery, ${r.divs.arm} armored)`)}
    ${kv("Soldiers", fmtCount(r.soldiers))}${kv("Tanks (in service and stored)", fmtCount(r.tanks))}${kv("Aircraft", fmtCount(r.planes))}
    ${kv("Stored: kits · guns · tanks · planes", `${fmtCompact(st.kits || 0)} · ${fmtCompact(st.guns || 0)} · ${fmtCompact(st.tanks || 0)} · ${fmtCompact(st.planes || 0)}`)}
    ${kv("Conscription · arms production", `${n.laws.army} · ${n.laws.arms}`)}
    ${kv("Navy", escapeHtml(shipsText(navyCounts(g, n.id))))}
    ${kv("Harbors", escapeHtml(g.cities.filter(c => c.owner === n.id && c.port).map(c => `${c.name} (${PORT_LEVELS[portLevel(c)].label.toLowerCase()})`).join(", ") || "none"))}
    ${kv("Sea battles · ships sunk · ships lost", `${ns.seaBattles || 0} · ${ns.shipsSunk || 0} · ${ns.shipsLost || 0}`)}
    ${kv("Enemy freighters sunk · own freighters lost", `${ns.freightersSunk || 0} · ${ns.freightersLost || 0}`)}
    ${kv("Battles won · lost", `${ns.won} · ${ns.lost}`)}${kv("Soldiers lost · enemy killed", `${fmtCompact(ns.menLost)} · ${fmtCompact(ns.menKilled)}`)}
    ${kv("Towns taken · lost", `${ns.townsGained} · ${ns.townsLost}`)}${kv("Wars started", g.stats.warsStarted[n.id] || 0)}
    ${kv("At war with", war.length ? escapeHtml(war.join(", ")) : "nobody")}
  </ul>`;
}
function relationsListHtml(g, n) {
  const others = liveNations(g).filter(z => z.id !== n.id);
  if (!others.length) return `<p class="muted small">Nobody else is left.</p>`;
  return `<ul class="st-rel">${others.map(z => {
    const op = opinionDetail(g, n.id, z.id).value;
    const tr = treatiesBetween(g, n.id, z.id).map(t => TREATY_INFO[t.type].label.toLowerCase());
    const status = atWar(g, n.id, z.id) ? `<span class="tone-bad">at war</span>` : tr.length ? escapeHtml(tr.join(", ")) : "";
    return `<li><span class="lbl">${swatch(z)}${escapeHtml(z.name)}</span>${divBar(op)}<span class="num">${signed(op)}</span><span class="muted small">trust ${Math.round(rel(g, n.id, z.id).trust)} ${status ? "· " + status : ""}</span></li>`;
  }).join("")}</ul>`;
}

/* ---------- Compare ---------- */
function statsCompareHtml() {
  const g = game, W = statsWidth(), S = ui.stats;
  const M = STAT_METRICS[S.metric];
  let series = seriesFor(g, S.metric);
  const all = series;
  series = series.filter(s => !S.hidden.includes(s.key));
  const mode = S.mode === "share" && !M.sum ? "value" : S.mode;
  let chart;
  if (mode === "rank") chart = lineChart(rankSeries(series), { width: W.main, height: 380, axis: v => `#${v}`, fmt: v => `#${v}`, invert: true, fromZero: false, intY: true });
  else if (mode === "share") chart = shareChart(series, { width: W.main, height: 380, fmt: M.fmt });
  else chart = lineChart(series, { width: W.main, height: 380, axis: M.axis, fmt: M.fmt, zero: M.zero, fromZero: !["stability", "gdppc", "skill", "food", "opP"].includes(S.metric), minSpan: M.minSpan || 0, intY: ["techs", "towns"].includes(S.metric) });
  const rows = statNations(g, false).filter(n => !(M.rivalsOnly && n.isPlayer)).map(n => {
    const last = n.history[n.history.length - 1], a1 = hAgo(n, 4), a5 = hAgo(n, 20);
    const v = M.get(last), v1 = a1 ? M.get(a1) : null, v5 = a5 ? M.get(a5) : null;
    return { n, v, v1, v5 };
  }).filter(x => x.v != null).sort((a, b) => b.v - a.v);
  const ch = (v, base) => (base == null || base === 0 || v == null ? "–" : M.zero || S.metric === "stability" || S.metric === "opP" ? `<span class="tone-${toneOf(v - base, 1e-6)}">${(v - base >= 0 ? "+" : "−") + M.fmt(Math.abs(v - base)).replace(/^[−+]/, "")}</span>` : `<span class="tone-${toneOf(v / base - 1, 0.0005)}">${signedPct(v / base - 1, 1)}</span>`);
  const table = `<div class="st-tablewrap"><table class="st-table"><thead><tr><th>#</th><th class="l">Nation</th><th>${M.label} now</th><th>Change, 1 year</th><th>Change, 5 years</th></tr></thead>
    <tbody>${rows.map((x, i) => `<tr class="${x.n.isPlayer ? "me" : ""}"><td class="muted">${i + 1}</td><td class="l"><button type="button" class="st-nlink" data-action="st-nation" data-nid="${x.n.id}">${swatch(x.n)}${escapeHtml(x.n.name)}</button></td><td>${M.fmt(x.v)}</td><td>${ch(x.v, x.v1)}</td><td>${ch(x.v, x.v5)}</td></tr>`).join("")}</tbody></table></div>`;
  return `<div class="st-filters">
      ${chipsHtml("st-metric", S.metric, COMPARE_METRICS.map(k => [k, STAT_METRICS[k].label]))}
      <div class="st-filterrow">${chipsHtml("st-mode", mode, [["value", "Values"], ["rank", "Rank"], ...(M.sum ? [["share", "Share of world"]] : [])])}${rangeChips()}</div>
    </div>
    ${card(`${M.label}${mode === "rank" ? " · rank" : mode === "share" ? " · share of world" : ""}`, chart + legendHtml(all), { wide: true, note: "dashed lines are fallen nations" })}
    ${card("Standings", table, { wide: true })}`;
}

/* ---------- Economy (world) ---------- */
function statsEconomyHtml() {
  const g = game, W = statsWidth();
  const rows = liveNations(g).map(n => nationRow(g, n));
  const secTotals = ["primary", "secondary", "tertiary", "quaternary"].map((k, i) => ({ key: k, name: SECTORS[k].label, color: SECTORS[k].color, pts: worldTotals(g, h => (h.sec ? h.sec[i] : null)) }));
  const maxTrade = Math.max(1, ...rows.map(r => Math.max(r.exp, r.imp)));
  const trade = `<ul class="st-trade">${rows.slice().sort((a, b) => b.exp + b.imp - a.exp - a.imp).map(r => `<li><span class="lbl">${swatch(r.n)}${escapeHtml(r.n.name)}</span>
      <span class="bar two"><span class="ex" style="width:${(r.exp / maxTrade) * 100}%"></span></span><span class="num">${fmtMoney(r.exp)}</span>
      <span class="bar two"><span class="im" style="width:${(r.imp / maxTrade) * 100}%"></span></span><span class="num">${fmtMoney(r.imp)}</span></li>`).join("")}</ul>
    <p class="muted small st-key"><i class="sw" style="background:var(--div-pos)"></i>Exports a year <i class="sw" style="background:var(--div-neg)"></i>Imports a year</p>`;
  const techGrid = `<div class="st-tablewrap"><table class="st-table compact tech"><thead><tr><th class="l">Nation</th>${TECH_ORDER.map(t => `<th title="${escapeHtml(TECHS[t].does)}"><span class="vert">${escapeHtml(TECHS[t].label)}</span></th>`).join("")}<th>Total</th></tr></thead>
    <tbody>${rows.slice().sort((a, b) => b.techs - a.techs).map(r => `<tr class="${r.n.isPlayer ? "me" : ""}"><td class="l">${swatch(r.n)}${escapeHtml(r.n.name)}</td>${TECH_ORDER.map(t => {
      const done = r.n.techs && r.n.techs[t] !== undefined, now = r.n.research && r.n.research.target === t;
      return `<td title="${escapeHtml(TECHS[t].label)}${done ? `: ${seasonLabel(r.n.techs[t])}` : now ? ": researching" : ""}">${done ? `<span class="dot on"></span>` : now ? `<span class="dot now"></span>` : `<span class="dot"></span>`}</td>`;
    }).join("")}<td class="num">${r.techs}</td></tr>`).join("")}</tbody></table></div>
    <p class="muted small st-key"><span class="dot on"></span> known <span class="dot now"></span> being researched <span class="dot"></span> not yet</p>`;
  const secLevels = rows.map(r => {
    const lv = r.econ.levels || {}, out = { primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };
    for (const k in lv) if (INDUSTRIES[k]) out[INDUSTRIES[k].sector] += lv[k];
    const sec = r.econ.sectors || {};
    const tot = Object.values(sec).reduce((s, x) => s + x.va, 0) || 1;
    return { r, out, shares: ["primary", "secondary", "tertiary", "quaternary"].map(k => (sec[k] ? sec[k].va : 0) / tot) };
  });
  const structure = `<ul class="st-stackbars">${secLevels.sort((a, b) => b.r.gdp - a.r.gdp).map(x => `<li><span class="lbl">${swatch(x.r.n)}${escapeHtml(x.r.n.name)}</span><span class="stack">${x.shares.map((v, i) => `<span style="width:${v * 100}%;background:${SECTORS[["primary", "secondary", "tertiary", "quaternary"][i]].color}" title="${SECTORS[["primary", "secondary", "tertiary", "quaternary"][i]].label} ${pct(v)}"></span>`).join("")}</span><span class="num muted">${x.shares.map(v => Math.round(v * 100)).join(" / ")}</span></li>`).join("")}</ul>
    ${legendHtml(secTotals, false)}`;
  const goods = {};
  for (const r of rows) { const G = r.econ.goods; if (!G || !G.supply) continue; for (const k of GOOD_ORDER) { const e = goods[k] || (goods[k] = { s: 0, d: 0, ex: 0, im: 0, best: null }); e.s += G.supply[k] || 0; e.d += G.demand[k] || 0; e.ex += G.exports[k] || 0; e.im += G.imports[k] || 0; if (!e.best || (G.supply[k] || 0) > e.best.v) e.best = { n: r.n, v: G.supply[k] || 0 }; } }
  const goodsTable = `<div class="st-tablewrap"><table class="st-table compact"><thead><tr><th class="l">Good</th><th>Made</th><th>Wanted</th><th>Traded</th><th class="l">Biggest maker</th></tr></thead><tbody>${GOOD_ORDER.map(k => { const e = goods[k]; if (!e) return ""; return `<tr><td class="l">${GOODS[k].label}</td><td>${fmtNum(e.s)}</td><td class="${e.s < e.d * 0.9 ? "tone-bad" : ""}">${fmtNum(e.d)}</td><td>${fmtNum(e.ex)}</td><td class="l">${e.best && e.best.v > 0.01 ? `${swatch(e.best.n)}${escapeHtml(e.best.n.name)}` : "–"}</td></tr>`; }).join("")}</tbody></table></div>`;
  return `<div class="st-grid">
    ${card("World output by sector", shareChart(secTotals, { width: W.half, height: 230, fmt: v => `${fmtMoney(v)}/yr` }) + legendHtml(secTotals, false))}
    ${card("Shape of each economy", structure, { note: "share of output: primary / secondary / tertiary / quaternary" })}
    ${card("Trade", trade, { note: "value of goods crossing borders" })}
    ${card("World goods market", goodsTable, { note: "a year, all nations" })}
    ${card("World prices of raw materials", priceChartHtml(W.half), { note: "1.00 is the normal price" })}
    ${card("Natural resources by nation", resourceTableHtml(rows), { note: "mines, fields, camps and harbors" })}
    ${card("Technology", techGrid, { wide: true })}
    ${card("Output per person", lineChart(seriesFor(g, "gdppc", { hide: ui.stats.hidden }), { width: W.half, height: 220, axis: STAT_METRICS.gdppc.axis, fmt: STAT_METRICS.gdppc.fmt, fromZero: false }))}
    ${card("Workforce skill", lineChart(seriesFor(g, "skill", { hide: ui.stats.hidden }), { width: W.half, height: 220, axis: STAT_METRICS.skill.axis, fmt: STAT_METRICS.skill.fmt, fromZero: false }))}
    ${card("Living standard", lineChart(seriesFor(g, "ls", { hide: ui.stats.hidden }), { width: W.half, height: 220, axis: STAT_METRICS.ls.axis, fmt: STAT_METRICS.ls.fmt, fromZero: false }), { note: "wages, pensions and benefits a person, a year" })}
    ${card("Children per woman", lineChart(seriesFor(g, "tfr", { hide: ui.stats.hidden }), { width: W.half, height: 220, axis: STAT_METRICS.tfr.axis, fmt: STAT_METRICS.tfr.fmt, fromZero: false }), { note: "below 2.1 a nation shrinks in time" })}
  </div>`;
}

function priceChartHtml(width) {
  const hist = game.priceHist || [];
  const t0 = rangeStart(game);
  const series = TRADED.map(k => ({ key: `p-${k}`, name: PRICE_LABELS[k], color: PRICE_COLORS[k], pts: hist.filter(h => h.turn >= t0).map(h => [h.turn, h[k]]) })).filter(s => s.pts.length);
  return lineChart(series, { width, height: 220, axis: v => `${v.toFixed(2)}×`, fromZero: false, minSpan: 0.4 }) + legendHtml(series, false);
}
function resourceTableHtml(rows) {
  const kinds = ["mine", "coalmine", "goldmine", "oilfield", "logging", "fishing"];
  const body = rows.slice().sort((a, b) => b.gdp - a.gdp).map(r => {
    const sites = (r.econ.sites || []);
    const cnt = k => { const xs = sites.filter(x => x.kind === k && !x.site.exhausted); return xs.length ? `${xs.length}${xs.some(x => x.lvl > 1) ? `<span class="muted small"> (${xs.reduce((s, x) => s + x.lvl, 0)})</span>` : ""}` : `<span class="muted">–</span>`; };
    const va = sites.reduce((s, x) => s + (x.va || 0), 0);
    return `<tr class="${r.n.isPlayer ? "me" : ""}"><td class="l">${swatch(r.n)}${escapeHtml(r.n.name)}</td>${kinds.map(k => `<td>${cnt(k)}</td>`).join("")}<td>${fmtMoney(va)}</td><td>${pct(va / Math.max(0.01, r.gdp))}</td></tr>`;
  }).join("");
  return `<div class="st-tablewrap"><table class="st-table compact"><thead><tr><th class="l">Nation</th><th title="Metal mines">Metal</th><th title="Coal mines">Coal</th><th title="Gold mines">Gold</th><th title="Oil and gas fields">Oil</th><th title="Logging camps">Timber</th><th title="Fishing harbors">Fish</th><th title="Value of their output a year">Worth/yr</th><th title="Share of the nation's output">Share</th></tr></thead><tbody>${body}</tbody></table></div>
    <p class="muted small st-key">Number of working sites; total levels in brackets.</p>`;
}

/* ---------- Military ---------- */
function statsMilitaryHtml() {
  const g = game, W = statsWidth();
  const rows = liveNations(g).map(n => nationRow(g, n)).sort((a, b) => b.power - a.power);
  const tot = k => rows.reduce((s, r) => s + r[k], 0);
  const allBattles = (g.stats.world || []).reduce((s, x) => s + x.battles, 0), allDead = (g.stats.world || []).reduce((s, x) => s + x.deaths, 0);
  const table = `<div class="st-tablewrap"><table class="st-table"><thead><tr><th>#</th><th class="l">Nation</th><th>Strength</th><th>Soldiers</th><th>Infantry</th><th>Artillery</th><th>Armored</th><th>Tanks</th><th>Aircraft</th><th>Warships</th><th>Freighters</th><th>Battles won</th><th>Battles lost</th><th>Soldiers lost</th><th>Enemy killed</th><th>Towns taken</th><th>Towns lost</th></tr></thead>
    <tbody>${rows.map((r, i) => { const s = natStats(g, r.n.id); return `<tr class="${r.n.isPlayer ? "me" : ""}"><td class="muted">${i + 1}</td><td class="l"><button type="button" class="st-nlink" data-action="st-nation" data-nid="${r.n.id}">${swatch(r.n)}${escapeHtml(r.n.name)}</button></td><td>${fmtCompact(r.power)}</td><td>${fmtCompact(r.soldiers)}</td><td>${r.divs.inf}</td><td>${r.divs.art}</td><td>${r.divs.arm}</td><td>${fmtCompact(r.tanks)}</td><td>${fmtCompact(r.planes)}</td><td>${(() => { const c = navyCounts(g, r.n.id); return c.cruiser + c.destroyer; })()}</td><td>${navyCounts(g, r.n.id).freighter}</td><td>${s.won}</td><td>${s.lost}</td><td>${fmtCompact(s.menLost)}</td><td>${fmtCompact(s.menKilled)}</td><td>${s.townsGained}</td><td>${s.townsLost}</td></tr>`; }).join("")}</tbody></table></div>`;
  const wars = (g.stats.wars || []).slice().sort((a, b) => (a.ended === null ? -1 : 0) - (b.ended === null ? -1 : 0) || b.since - a.since);
  const side = ids => ids.map(id => `${swatch(g.nations[id])}${escapeHtml(nameOf(g, id))}`).join(", ");
  const warList = wars.length ? `<ul class="st-wars">${wars.map(e => {
    const len = (e.ended ?? g.turn) - e.since;
    const lossA = e.a.reduce((s, id) => s + (e.losses[id] || 0), 0), lossB = e.b.reduce((s, id) => s + (e.losses[id] || 0), 0);
    const sc = clamp(e.score, -100, 100);
    const verdict = e.ended === null ? `<span class="tone-bad">ongoing</span>` : Math.abs(e.score) < 20 ? "ended in stalemate" : `${escapeHtml(nameOf(g, e.score > 0 ? e.a[0] : e.b[0]))} had the upper hand`;
    return `<li><div class="wl-head"><strong>${side(e.a)} <span class="muted">vs</span> ${side(e.b)}</strong><span class="muted small">${seasonLabel(e.since)}${e.ended !== null ? ` – ${seasonLabel(e.ended)}` : ""} · ${len} season${len === 1 ? "" : "s"} · ${verdict}</span></div>
      <div class="meter dual"><span style="left:${sc >= 0 ? 50 : 50 + sc / 2}%;width:${Math.abs(sc) / 2}%;background:var(--gold)"></span></div>
      <span class="muted small">Cause: ${escapeHtml(e.cb || "—")} · ${e.battles} battle${e.battles === 1 ? "" : "s"} · losses ${fmtCompact(lossA)} vs ${fmtCompact(lossB)} · score ${signed(e.score)} (positive favors the first side)</span></li>`;
  }).join("")}</ul>` : `<p class="muted small">No wars yet. Peace has held since the founding.</p>`;
  const battles = (g.stats.battleLog || []).slice().reverse().slice(0, 30);
  const battleList = battles.length ? `<div class="st-tablewrap"><table class="st-table compact"><thead><tr><th class="l">Season</th><th class="l">Where</th><th class="l">Attacker</th><th class="l">Defender</th><th class="l">Result</th><th>Strength ratio</th><th>Attacker lost</th><th>Defender lost</th></tr></thead><tbody>${battles.map(r => `<tr><td class="l">${seasonLabel(r.turn)}</td><td class="l">${escapeHtml(r.place)}</td><td class="l">${swatch(g.nations[r.a])}${escapeHtml(nameOf(g, r.a))}</td><td class="l">${swatch(g.nations[r.d])}${escapeHtml(nameOf(g, r.d))}</td><td class="l ${r.won ? "" : "muted"}">${r.won ? "attacker won" : "defender held"}</td><td>${r.ratio}×</td><td>${fmtCount(r.la)}</td><td>${fmtCount(r.ld)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">No battles yet.</p>`;
  return `<div class="st-tiles">
      ${tile("Soldiers worldwide", fmtCompact(tot("soldiers")))}${tile("Divisions", `${tot("divCount")}`)}${tile("Aircraft", fmtCompact(tot("planes")))}
      ${tile("Wars now", `${g.wars.length}`, `${(g.stats.wars || []).length} in history`, g.wars.length ? "bad" : "neutral")}${tile("Battles fought", `${allBattles}`)}${tile("Killed in war", fmtCompact(allDead), "", allDead ? "bad" : "neutral")}
    </div>
    <div class="st-filters"><div class="st-filterrow">${rangeChips()}</div></div>
    <div class="st-grid">
      ${card("Military strength", lineChart(seriesFor(g, "power", { hide: ui.stats.hidden }), { width: W.half, height: 230, axis: fmtCompact, fmt: fmtCompact }))}
      ${card("Soldiers", lineChart(seriesFor(g, "soldiers", { hide: ui.stats.hidden }), { width: W.half, height: 230, axis: fmtCompact, fmt: fmtCompact }))}
      ${card("Warships", lineChart(seriesFor(g, "ships", { hide: ui.stats.hidden }).filter(x => x.pts.some(p => p[1] > 0)), { width: W.half, height: 200, axis: v => `${Math.round(v)}`, fmt: v => `${Math.round(v)}` }), { note: "nations with a navy" })}
      ${card("Freighters", lineChart(seriesFor(g, "fr", { hide: ui.stats.hidden }).filter(x => x.pts.some(p => p[1] > 0)), { width: W.half, height: 200, axis: v => `${Math.round(v)}`, fmt: v => `${Math.round(v)}` }), { note: "nations with a merchant fleet" })}
      ${card("Armies and navies", table, { wide: true })}
      ${seaWarStatsHtml(g)}
      ${card("Wars", warList, { wide: true })}
      ${card("Recent battles", battleList, { wide: true, note: "newest first · soldiers lost" })}
    </div>`;
}

/* ---------- Diplomacy ---------- */
function statsDiplomacyHtml() {
  const g = game, W = statsWidth(), S = ui.stats;
  const ns = liveNations(g);
  const trust = S.matrix === "trust";
  const cell = (a, b) => {
    if (a.id === b.id) return `<td class="self"></td>`;
    if (a.isPlayer) return `<td class="you" title="Your own feelings are yours to decide">·</td>`;
    const v = trust ? rel(g, a.id, b.id).trust - 50 : opinionDetail(g, a.id, b.id).value;
    const shown = trust ? Math.round(rel(g, a.id, b.id).trust) : signed(v);
    const t = clamp(v / (trust ? 50 : 60), -1, 1);
    const bg = t >= 0 ? `color-mix(in srgb, var(--div-pos) ${Math.round(Math.abs(t) * 85)}%, var(--div-mid))` : `color-mix(in srgb, var(--div-neg) ${Math.round(Math.abs(t) * 85)}%, var(--div-mid))`;
    return `<td style="background:${bg}" title="${escapeHtml(`${a.name} → ${b.name}: ${trust ? `trust ${shown}/100` : `opinion ${shown} (${opinionLabel(v)})`}`)}">${shown}</td>`;
  };
  const head = `<tr><th class="l">${trust ? "Trust of ↓ in →" : "Opinion of ↓ about →"}</th>${ns.map(z => `<th title="${escapeHtml(z.name)}">${swatch(z)}<span class="vert">${escapeHtml(z.name.replace(/^(Free City of|Principality of|Republic of|Kingdom of) /, ""))}</span></th>`).join("")}</tr>`;
  const matrix = `<div class="st-tablewrap"><table class="st-matrix"><thead>${head}</thead><tbody>${ns.map(a => `<tr><th class="l">${swatch(a)}${escapeHtml(a.name)}</th>${ns.map(b => cell(a, b)).join("")}</tr>`).join("")}</tbody></table></div>
    <p class="muted small st-key"><i class="sw" style="background:var(--div-neg)"></i>${trust ? "distrust" : "hostile"} <i class="sw" style="background:var(--div-mid)"></i>neutral <i class="sw" style="background:var(--div-pos)"></i>${trust ? "trust" : "friendly"}</p>`;
  const ABBR = { trade: "T", nap: "N", alliance: "A", border: "B", tribute: "$", truce: "Tr" };
  const tcell = (a, b) => {
    if (a.id === b.id) return `<td class="self"></td>`;
    if (atWar(g, a.id, b.id)) return `<td class="war" title="At war">War</td>`;
    const tr = treatiesBetween(g, a.id, b.id);
    return `<td title="${escapeHtml(tr.map(t => TREATY_INFO[t.type].label).join(", ") || "No treaties")}">${tr.map(t => `<span class="tt tt-${t.type}">${ABBR[t.type]}</span>`).join("")}</td>`;
  };
  const tmatrix = `<div class="st-tablewrap"><table class="st-matrix treaties"><thead><tr><th class="l"></th>${ns.map(z => `<th title="${escapeHtml(z.name)}">${swatch(z)}<span class="vert">${escapeHtml(z.name.replace(/^(Free City of|Principality of|Republic of|Kingdom of) /, ""))}</span></th>`).join("")}</tr></thead><tbody>${ns.map(a => `<tr><th class="l">${swatch(a)}${escapeHtml(a.name)}</th>${ns.map(b => tcell(a, b)).join("")}</tr>`).join("")}</tbody></table></div>
    <p class="muted small st-key">${Object.entries(ABBR).map(([k, v]) => `<span class="tt tt-${k}">${v}</span> ${TREATY_INFO[k].label.toLowerCase()}`).join(" · ")}</p>`;
  const list = g.treaties.length ? `<div class="st-tablewrap"><table class="st-table compact"><thead><tr><th class="l">Treaty</th><th class="l">Between</th><th class="l">Since</th><th class="l">Until</th></tr></thead><tbody>${g.treaties.slice().sort((a, b) => b.since - a.since).map(t => `<tr><td class="l">${TREATY_INFO[t.type].label}${t.type === "tribute" ? ` (${fmtMoney(t.amount)} a season, ${escapeHtml(nameOf(g, t.a))} pays)` : ""}</td><td class="l">${swatch(g.nations[t.a])}${escapeHtml(nameOf(g, t.a))} · ${swatch(g.nations[t.b])}${escapeHtml(nameOf(g, t.b))}</td><td class="l">${seasonLabel(t.since)}</td><td class="l">${t.until ? seasonLabel(t.until) : "open-ended"}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">No treaties in force.</p>`;
  return `<div class="st-filters"><div class="st-filterrow">${chipsHtml("st-matrix", S.matrix, [["opinion", "Opinion"], ["trust", "Trust"]])}${rangeChips()}</div></div>
    <div class="st-grid">
      ${card(trust ? "Trust between nations" : "Opinions between nations", matrix, { wide: true, note: "read across: how the row nation feels about each column nation" })}
      ${card("Treaties and wars", tmatrix, { wide: true })}
      ${card("Their view of you", lineChart(seriesFor(g, "opP", { hide: S.hidden }), { width: W.full, height: 260, axis: v => signed(v), fmt: v => signed(v), zero: true, fromZero: false, minSpan: 40 }) + legendHtml(seriesFor(g, "opP")), { wide: true, note: "how each rival's opinion of you has moved" })}
      ${card("Treaties in force", list, { wide: true })}
    </div>`;
}

/* ---------- Trade between nations: the merchants' book (10s) ---------- */
// why a nation declared an embargo, in a neutral voice for the table
const STAT_EMBARGO_WHY = { retaliation: "answering an embargo", pressure: "to press a claim", threat: "fear of their army", hostility: "old grudges", grudge: "old grudges", ally_war: "war on an ally", war_goods: "selling war goods to an enemy", choice: "its own choice" };
function statsTradeHtml() {
  const g = game, W = statsWidth(), S = ui.stats;
  if (!g.trade || !g.trade.v) return `<p class="muted">The merchants sign their first contracts when the first season ends.</p>`;
  const K = S.tradeK && S.tradeK !== "all" && GOODS[S.tradeK] ? S.tradeK : null;
  const ns = liveNations(g);
  const short = n => n.name.replace(/^(Free City of|Principality of|Republic of|Kingdom of) /, "");
  const WORLD = { id: -1, name: "The world beyond the map", color: "#8f9a93" };
  const who = id => (id < 0 ? WORLD : g.nations[id]);
  const M = tradeMatrix(g, K);
  let max = 0;
  for (const s in M) for (const b in M[s]) max = Math.max(max, M[s][b].v);
  // a pair that cannot trade in this good (or in anything, with no filter): hatched
  const partial = (s, b) => (g.trade.embargoes || []).some(e => (e.by === s && e.on === b && e.dir !== "buy") || (e.by === b && e.on === s && e.dir !== "sell"));
  const cell = (s, b) => {
    if (s === b) return `<td class="self"></td>`;
    const c = M[s] && M[s][b], v = c ? c.v : 0;
    const code = s >= 0 && b >= 0 ? tradeBlocked(g, s, b, K || "goods") : null;
    const part = !code && s >= 0 && b >= 0 && !K && partial(s, b);
    const t = max > 0 ? v / max : 0;
    const bg = v > 0.0005 ? ` style="background:color-mix(in srgb, var(--div-pos) ${Math.round(15 + 70 * Math.sqrt(t))}%, var(--div-mid))"` : "";
    const goods = c ? Object.entries(c.goods).sort((x, y) => y[1] - x[1]).map(([k, x]) => `${GOODS[k].label}: ${fmtMoneyFine(x)}`) : [];
    const tip = `<strong>${escapeHtml(who(s).name)} → ${escapeHtml(who(b).name)}</strong>${goods.length ? goods.join("<br>") : "nothing this season"}${code ? `<br><em>cut: ${escapeHtml(tradeBlockedText(g, code, s, b, K || "goods"))}</em>` : part ? "<br><em>an embargo stops some goods</em>" : ""}`;
    return `<td class="${code ? "emb" : part ? "emb part" : ""}"${bg} data-tip="${escapeHtml(tip)}">${v >= 0.05 ? fmtMoneyShort(v) : v > 0.0005 ? "·" : ""}</td>`;
  };
  const sold = id => Object.values(M[id] || {}).reduce((x, c) => x + c.v, 0);
  const cols = ns.concat([WORLD]);
  const head = `<tr><th class="l">Seller ↓ · buyer →</th>${cols.map(z => `<th title="${escapeHtml(z.name)}">${swatch(z)}<span class="vert">${escapeHtml(z.id < 0 ? "World" : short(z))}</span></th>`).join("")}<th>Sold</th></tr>`;
  const matrix = `<div class="st-tablewrap"><table class="st-matrix trade"><thead>${head}</thead><tbody>${cols.map(a => `<tr><th class="l">${swatch(a)}${escapeHtml(a.id < 0 ? "World" : a.name)}</th>${cols.map(b => cell(a.id, b.id)).join("")}<td class="tot">${fmtMoneyShort(sold(a.id))}</td></tr>`).join("")}</tbody></table></div>
    <p class="muted small st-key"><i class="sw" style="background:var(--div-pos)"></i>value a year at world prices <i class="sw hatch"></i>cut by war, sanctions or an embargo</p>`;
  const goodsChips = chipsHtml("st-tradek", K || "all", [["all", "All goods"], ...TRADE_GOODS.map(k => [k, GOODS[k].label])]);
  // who hangs on whom
  const depRows = ns.map(n => {
    const rs = tradeRisks(world, g, n.id, economies()[n.id], { cheap: true }).slice(0, 2);
    return `<tr class="${n.isPlayer ? "me" : ""}"><td class="l">${swatch(n)}${escapeHtml(n.name)}</td><td class="l">${rs.length ? rs.map(r => `<span class="${r.level >= 2 ? "tone-bad" : r.level ? "tone-warn" : ""}">${escapeHtml(GOODS[r.k].label)}: ${pct(r.share)} from the ${escapeHtml(nameOf(g, r.from))}</span>`).join("<br>") : `<span class="muted">no single seller matters much</span>`}</td></tr>`;
  }).join("");
  const deps = `<div class="st-tablewrap"><table class="st-table compact"><thead><tr><th class="l">Nation</th><th class="l">Where it depends on one seller</th></tr></thead><tbody>${depRows}</tbody></table></div>`;
  // embargoes in force, and the latest lifted
  const E = g.trade.embargoes || [];
  const what = e => `${e.k === "all" ? "All trade" : GOODS[e.k].label}${e.k === "all" && e.food ? " (food too)" : ""} · ${e.dir === "sell" ? "no sales to them" : e.dir === "buy" ? "no purchases from them" : "both ways"}`;
  const embTable = E.length ? `<div class="st-tablewrap"><table class="st-table compact"><thead><tr><th class="l">By</th><th class="l">On</th><th class="l">What</th><th class="l">Since</th><th class="l">Why</th></tr></thead><tbody>${E.slice().sort((a, b) => b.since - a.since).map(e => `<tr><td class="l">${swatch(g.nations[e.by])}${escapeHtml(nameOf(g, e.by))}</td><td class="l">${swatch(g.nations[e.on])}${escapeHtml(nameOf(g, e.on))}</td><td class="l">${what(e)}</td><td class="l">${seasonLabel(e.since)}</td><td class="l muted">${escapeHtml(STAT_EMBARGO_WHY[e.why] || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">No embargoes in force.</p>`;
  const ended = (g.trade.ended || []).slice(-5).reverse().filter(x => g.nations[x.by] && g.nations[x.on]);
  const endedHtml = ended.length ? `<p class="muted small" style="margin-top:8px">Lately lifted: ${ended.map(x => `${escapeHtml(nameOf(g, x.by))} on ${escapeHtml(nameOf(g, x.on))} (${x.k === "all" ? "all trade" : GOODS[x.k].label.toLowerCase()}, ${seasonLabel(x.turn)})`).join("; ")}.</p>` : "";
  // the biggest trading pairs over the last ten years
  const t0 = rangeStart(g);
  const hist = (g.trade.hist || []).filter(h => h.turn >= t0);
  const total = {};
  for (const h of hist) for (const [s, b, v] of h.v) if (s >= 0 && b >= 0 && g.nations[s] && g.nations[b]) total[`${s}>${b}`] = (total[`${s}>${b}`] || 0) + v;
  const top = Object.entries(total).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
  const pairSeries = top.map(k => { const [s, b] = k.split(">").map(Number); return { key: `pair-${k}`, name: `${short(g.nations[s])} → ${short(g.nations[b])}`, color: g.nations[s].color, pts: hist.map(h => { const x = h.v.find(r => r[0] === s && r[1] === b); return [h.turn, x ? x[2] : 0]; }) }; });
  const worldSeries = [
    { key: "w-exp", name: "Sold by every nation", color: "#4b9bd1", pts: worldTotals(g, h => h.exp) },
    { key: "w-imp", name: "Bought by every nation", color: "#d9694e", pts: worldTotals(g, h => (h.imp === undefined ? null : h.imp)) },
  ];
  // grain between nations, and aid
  const grain = g.trade.flows.filter(f => f.k === "food" && f.s >= 0 && f.b >= 0).sort((a, b) => b.q - a.q).slice(0, 8);
  const aid = (g.trade.aid || []).slice(-6).reverse().filter(a => g.nations[a.from] && g.nations[a.to]);
  const grainHtml = (grain.length ? `<ul class="st-lines">${grain.map(f => `<li><span>${swatch(g.nations[f.s])}${escapeHtml(nameOf(g, f.s))} → ${swatch(g.nations[f.b])}${escapeHtml(nameOf(g, f.b))}${f.r === "relief" ? ` <span class="muted small">famine relief</span>` : ""}${tradeBlocked(g, f.s, f.b, "food") ? ` <span class="tone-bad small">cut</span>` : ""}</span><b class="num">${fmtPeople(f.q)} fed</b></li>`).join("")}</ul>` : `<p class="muted small">No grain crosses borders between nations this season.</p>`)
    + (aid.length ? `<p class="muted small" style="margin-top:8px">Food aid: ${aid.map(a => `${escapeHtml(nameOf(g, a.from))} to ${escapeHtml(nameOf(g, a.to))} (${seasonLabel(a.turn)})`).join("; ")}.</p>` : "");
  return `<div class="st-filters"><div class="st-filterrow">${goodsChips}</div><div class="st-filterrow">${rangeChips()}</div></div>
    <div class="st-grid">
      ${card(K ? `Who sells ${GOODS[K].label.toLowerCase()} to whom` : "Who sells to whom", matrix, { wide: true, note: "read across: what the row nation sells to each column nation, a year · hover a cell for the goods" })}
      ${card("Trade between nations over time", pairSeries.length ? lineChart(pairSeries, { width: W.half, height: 230, axis: v => fmtMoneyShort(v), fmt: v => `${fmtMoney(v)} a year` }) + legendHtml(pairSeries, false) : emptyChart(W.half, 230, "No trade between nations yet"), { note: "the six biggest seller → buyer pairs" })}
      ${card("World trade", lineChart(worldSeries, { width: W.half, height: 230, axis: v => fmtMoneyShort(v), fmt: v => `${fmtMoney(v)} a year` }) + legendHtml(worldSeries, false), { note: "every nation's exports and imports, a year" })}
      ${card("Who depends on whom", deps, { note: "a key good or a real share of output bought mostly from one nation" })}
      ${card("Embargoes", embTable + endedHtml)}
      ${card("Grain between nations", grainHtml, { note: "people fed a year" })}
      ${card("Imports by nation", lineChart(seriesFor(g, "imp", { hide: S.hidden }), { width: W.half, height: 220, axis: STAT_METRICS.imp.axis, fmt: STAT_METRICS.imp.fmt }) + legendHtml(seriesFor(g, "imp")), { note: "a year, at world prices" })}
    </div>`;
}

/* ---------- History ---------- */
function statsChronicleHtml() {
  const g = game, S = ui.stats;
  const R = g.stats.records || {};
  const rec = (label, x, f) => x ? `<li><span>${label}</span><span>${x.nid !== undefined ? `${swatch(g.nations[x.nid])}${escapeHtml(nameOf(g, x.nid))} · ` : ""}<b class="num">${f(x.v)}</b> <span class="muted small">${seasonLabel(x.turn)}</span></span></li>` : "";
  const longest = (g.stats.wars || []).map(e => ({ e, len: (e.ended ?? g.turn) - e.since })).sort((a, b) => b.len - a.len)[0];
  const b = R.bloodiest;
  const records = `<ul class="st-lines records">
    ${rec("Largest economy ever", R.richest, v => `${fmtMoney(v)}/yr`)}
    ${rec("Richest per person", R.bestPerPerson, v => `$${fmtNum(v)}k`)}
    ${rec("Most people", R.mostPeople, fmtPop)}
    ${rec("Largest army", R.largestArmy, v => fmtCount(v))}
    ${rec("Largest country", R.largestLand, fmtKm)}
    ${b ? `<li><span>Bloodiest battle</span><span>${escapeHtml(b.place)}: ${escapeHtml(nameOf(g, b.a))} vs ${escapeHtml(nameOf(g, b.d))} · <b class="num">${fmtCount(b.men)}</b> killed <span class="muted small">${seasonLabel(b.turn)}</span></span></li>` : ""}
    ${longest && longest.len > 0 ? `<li><span>Longest war</span><span>${escapeHtml(nameOf(g, longest.e.a[0]))} vs ${escapeHtml(nameOf(g, longest.e.b[0]))} · <b class="num">${longest.len}</b> seasons <span class="muted small">from ${seasonLabel(longest.e.since)}</span></span></li>` : ""}
  </ul>`;
  const nf = S.chronNid;
  const minor = c => c.tone === "neutral" && /is complete\.$/.test(c.text);
  const items = g.chronicle.filter(c => (nf === null || c.nid === nf) && (!S.majorOnly || !minor(c)));
  const picker = chipsHtml("st-chron", nf === null ? "all" : nf, [["all", "Everyone"], ...g.nations.filter(n => n.history && n.history.length).map(n => [n.id, `${swatch(n)}${escapeHtml(n.name)}`])]);
  const list = items.length ? `<ol class="st-chron">${items.map(c => `<li class="tone-${c.tone}"><span class="when">${seasonLabel(c.turn)}</span>${c.nid !== null && c.nid !== undefined && g.nations[c.nid] ? swatch(g.nations[c.nid]) : `<i class="sw"></i>`}<span>${escapeHtml(c.text)}</span></li>`).join("")}</ol>` : `<p class="muted small">Nothing recorded yet.</p>`;
  const lead = g.nations.filter(n => n.leader).map(n => `<li><span>${swatch(n)}${escapeHtml(n.name)}</span><span>${escapeHtml(leaderName(n))} <span class="muted small">age ${Math.floor(n.leader.age)} · since ${seasonLabel(n.leader.since)}</span></span></li>`).join("");
  return `<div class="st-grid">
    ${card("World records", records)}
    ${card("Rulers", `<ul class="st-lines">${lead || `<li class="muted">No rulers recorded.</li>`}</ul>`)}
    ${card("Chronicle", `<div class="st-filterrow">${chipsHtml("st-major", S.majorOnly ? "major" : "all", [["all", "All events"], ["major", "Major events only"]])}</div>` + picker + list, { wide: true, note: `${items.length} of ${g.chronicle.length} events kept` })}
  </div>`;
}

/* ---------- Rendering and input ---------- */
function renderStats() {
  const el = document.getElementById("stats");
  if (!el) return;
  const open = !!(ui.stats && game);
  el.hidden = !open;
  if (!open) { el.innerHTML = ""; return; }
  const prev = document.getElementById("st-main");
  const scroll = prev ? prev.scrollTop : 0;
  const sameView = el.dataset.view === ui.stats.view;
  el.innerHTML = statsHtml();
  el.dataset.view = ui.stats.view;
  const main = document.getElementById("st-main");
  if (main && sameView) main.scrollTop = scroll;
}

const STAT_ACTIONS = {
  "stats-open": () => openStats(),
  "stats-close": () => { ui.stats = null; },
  "st-view": el => { ui.stats.view = el.dataset.view; },
  "st-nation": el => { ui.stats.nid = Number(el.dataset.nid); ui.stats.view = "nation"; },
  "st-metric": el => { ui.stats.metric = el.dataset.v; },
  "st-mode": el => { ui.stats.mode = el.dataset.v; },
  "st-range": el => { ui.stats.range = el.dataset.v; },
  "st-matrix": el => { ui.stats.matrix = el.dataset.v; },
  "st-tradek": el => { ui.stats.tradeK = el.dataset.v; },
  "st-major": el => { ui.stats.majorOnly = el.dataset.v === "major"; },
  "st-chron": el => { ui.stats.chronNid = el.dataset.v === "all" ? null : Number(el.dataset.v); },
  "st-sort": el => { const s = ui.stats.sort; if (s.key === el.dataset.key) s.dir = -s.dir; else { s.key = el.dataset.key; s.dir = -1; } },
  "st-toggle": el => { const k = Number.isNaN(Number(el.dataset.key)) ? el.dataset.key : Number(el.dataset.key); const h = ui.stats.hidden; ui.stats.hidden = h.includes(k) ? h.filter(x => x !== k) : h.concat([k]); },
};
Object.assign(ACTIONS, STAT_ACTIONS);

function onStatsClick(e) {
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled || !STAT_ACTIONS[el.dataset.action]) return;
  STAT_ACTIONS[el.dataset.action](el);
  if (!ui.stats) { renderAll(); return; }
  renderStats();
}

function onStatsMove(e) {
  const tip = document.getElementById("st-tip");
  if (!tip) return;
  const svg = e.target.closest && e.target.closest("svg.st-chart");
  // legend hover: light up one series
  const lg = e.target.closest && e.target.closest(".st-legend [data-s]");
  document.querySelectorAll("#stats svg.st-chart.hl").forEach(s => { if (!lg || !s.closest(".st-card").contains(lg)) s.classList.remove("hl"); });
  if (lg) {
    const chartEl = lg.closest(".st-card").querySelector("svg.st-chart");
    if (chartEl) { chartEl.classList.add("hl"); chartEl.querySelectorAll("[data-s]").forEach(p => p.classList.toggle("lit", p.dataset.s === lg.dataset.s)); }
  }
  const bar = e.target.closest && e.target.closest("[data-tip]");
  if (bar) { tip.hidden = false; tip.innerHTML = `<span>${bar.dataset.tip}</span>`; placeTip(tip, e); return; }
  const hit = e.target.closest && e.target.closest("rect[data-chart]");
  document.querySelectorAll("#stats .xh").forEach(l => { if (!hit || l.id !== `${hit.dataset.chart}-xh`) l.setAttribute("visibility", "hidden"); });
  if (!hit || !svg) { tip.hidden = true; document.querySelectorAll("#stats g[id$='-dots']").forEach(gd => { gd.innerHTML = ""; }); return; }
  const C = STAT_CHARTS.get(hit.dataset.chart);
  if (!C) return;
  const rect = svg.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const raw = C.tMin + ((x - C.padL) / C.pw) * (C.tMax - C.tMin);
  let turn, rows;
  if (C.kind === "share") {
    turn = C.turns.reduce((best, t) => (Math.abs(t - raw) < Math.abs(best - raw) ? t : best), C.turns[0]);
    const k = C.turns.indexOf(turn);
    rows = C.series.map((s, i) => ({ s, v: C.maps[i].get(turn) })).filter(r => r.v !== undefined && r.v > 0).sort((a, b) => b.v - a.v)
      .map(r => `<li><i class="sw" style="background:${r.s.color}"></i><span>${escapeHtml(r.s.name)}</span><b>${pct(r.v / C.totals[k])}</b><span class="muted">${escapeHtml(C.fmt(r.v))}</span></li>`);
    document.getElementById(`${hit.dataset.chart}-dots`).innerHTML = "";
  } else {
    const turns = [...new Set(C.series.flatMap(s => s.pts.map(p => p[0])))];
    turn = turns.reduce((best, t) => (Math.abs(t - raw) < Math.abs(best - raw) ? t : best), turns[0]);
    const vals = C.series.map(s => ({ s, p: s.pts.find(p => p[0] === turn) })).filter(r => r.p);
    const inverted = C.Y(1) < C.Y(2);
    vals.sort((a, b) => (inverted ? a.p[1] - b.p[1] : b.p[1] - a.p[1]));
    rows = vals.map(r => `<li class="${r.s.bold ? "me" : ""}"><i class="sw" style="background:${r.s.color}"></i><span>${escapeHtml(r.s.name)}</span><b>${escapeHtml(C.fmt(r.p[1]))}</b></li>`);
    document.getElementById(`${hit.dataset.chart}-dots`).innerHTML = vals.map(r => `<circle cx="${C.X(turn)}" cy="${C.Y(r.p[1])}" r="4" fill="${r.s.color}" stroke="var(--panel)" stroke-width="2"/>`).join("");
  }
  const xh = document.getElementById(`${hit.dataset.chart}-xh`);
  xh.setAttribute("x1", C.X(turn)); xh.setAttribute("x2", C.X(turn)); xh.setAttribute("visibility", "visible");
  tip.hidden = false;
  tip.innerHTML = `<strong>${seasonLabel(turn)}</strong><ul>${rows.join("")}</ul>`;
  placeTip(tip, e);
}
function placeTip(tip, e) {
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = e.clientX + 16, y = e.clientY + 14;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - 16;
  if (y + h > window.innerHeight - 8) y = window.innerHeight - h - 8;
  tip.style.left = `${x}px`; tip.style.top = `${y}px`;
}
function bindStats() {
  const el = document.getElementById("stats");
  el.addEventListener("mousemove", onStatsMove);
  el.addEventListener("mouseleave", () => { const t = document.getElementById("st-tip"); if (t) t.hidden = true; });
  window.addEventListener("resize", () => { if (ui.stats) renderStats(); });
}

