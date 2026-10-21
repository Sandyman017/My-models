/* =====================================================================
   7c. The land's riches: deposits with real reserves, forests and fishing grounds that can be
       used up, and the sites that work them. Each site sits on the map, needs a road to haul its
       output to a town, employs workers from the nearest town, and wears its resource down.
   ===================================================================== */
const RES = {
  1: { key: "metals", label: "Metal ore", site: "mine", unit: "Mt of ore", perUnit: 4, base: 28, perLevel: 17,
       gradeText: q => `${Math.round(30 + 25 * clamp((q - 0.6) / 0.9, 0, 1))}% iron` },
  2: { key: "coal", label: "Coal", site: "coalmine", unit: "Mt", perUnit: 5, base: 34, perLevel: 19,
       gradeText: q => (q > 1.2 ? "anthracite, the best coal" : q > 0.9 ? "bituminous coal" : "lignite (soft brown coal)") },
  3: { key: "oil", label: "Oil and gas", site: "oilfield", unit: "million barrels", perUnit: 30, base: 32, perLevel: 18,
       gradeText: q => (q > 1.2 ? "light sweet crude" : q > 0.9 ? "medium crude" : "heavy sour crude") },
  4: { key: "gold", label: "Gold", site: "goldmine", unit: "t", perUnit: 20, base: 12, perLevel: 7.5,
       gradeText: q => `${(1.5 + 7.5 * clamp((q - 0.6) / 0.9, 0, 1)).toFixed(1)} grams per tonne of rock` },
};
const SITE_KINDS = {
  mine:     { label: "Metal mine",        short: "iron mine",   res: 1, good: "metals", unitVA: 1.9,  haul: 0.035, maxLevel: 5, paces: ["Careful", "Normal", "Intensive"] },
  coalmine: { label: "Coal mine",         short: "coal mine",   res: 2, good: "coal",   unitVA: 1.33, haul: 0.03,  maxLevel: 5, paces: ["Careful", "Normal", "Intensive"] },
  goldmine: { label: "Gold mine",         short: "gold mine",   res: 4, good: "gold",   unitVA: 4.0,  haul: 0.002, maxLevel: 4, paces: ["Careful", "Normal", "Intensive"] },
  oilfield: { label: "Oil and gas field", short: "oil field",   res: 3, good: "oil",    unitVA: 1.57, haul: 0.02,  maxLevel: 5, paces: ["Careful", "Normal", "Intensive"] },
  logging:  { label: "Logging camp",      short: "logging camp", renew: "forest", good: "timber", unitVA: 0.88, haul: 0.03, maxLevel: 3, paces: ["Sustainable", "Normal", "Clear-cut"] },
  fishing:  { label: "Fishing harbor",    short: "fishing harbor", renew: "fish", good: "food", unitVA: 2.74, haul: 0.02, maxLevel: 3, paces: ["Quotas", "Normal", "Overfish"] },
};
const SITE_ORDER = ["mine", "coalmine", "goldmine", "oilfield", "logging", "fishing"];
const PACES = { slow: { out: 0.7, workers: 0.75 }, normal: { out: 1, workers: 1 }, fast: { out: 1.35, workers: 1.25 } };
const PACE_KEYS = ["slow", "normal", "fast"];
const NATURE = {
  forestK: 6,          // timber units a full forest cell holds
  forestGrow: 0.03,    // logistic regrowth a season
  forestClear: 0.06,   // below this the forest is gone and the land is open ground
  fishGrow: 0.1,
  fishK: 0.23,         // food units a season a full fishing ground cell can give at most
  survey: 2.5,         // cells a survey reaches
};
const DIFFICULTY = { [T.PLAINS]: 1, [T.FOREST]: 1.1, [T.HILLS]: 1.25, [T.MOUNTAIN]: 1.5 };
const TRADED = ["timber", "metals", "coal", "oil", "gold"];

/* ---------- Natural resources, placed once per world: visible outcrops and deeper hidden finds ---------- */
function placeDeposits(w) {
  w.dep = new Uint8Array(N_CELLS);
  w.hid = new Uint8Array(N_CELLS);
  w.depTotal = new Float32Array(N_CELLS);
  w.depGrade = new Float32Array(N_CELLS);
  const pick = (cands, share, min, hiddenShare, type) => {
    cands.sort((a, b) => b.v - a.v);
    const n = Math.max(min, Math.round(cands.length * share));
    let k = 0, placed = 0;
    for (; k < cands.length && placed < n; k++) if (!w.dep[cands[k].i]) { w.dep[cands[k].i] = type; placed++; }
    const nh = Math.round(n * hiddenShare);
    let hidden = 0;
    for (; k < cands.length && hidden < nh; k++) {
      const i = cands[k].i;
      if (w.dep[i] || w.hid[i] || hash2(i, type, w.seed + 77) < 0.35) continue;
      w.hid[i] = type; hidden++;
    }
  };
  const metals = [], coal = [], oil = [], gold = [];
  for (let i = 0; i < N_CELLS; i++) {
    const t = w.terrain[i];
    if (t === T.SEA) continue;
    const x = cellX(i) + 0.5, y = cellY(i) + 0.5;
    if (t === T.HILLS || t === T.MOUNTAIN || t === T.FOREST) metals.push({ i, v: fbm(x / 3.5, y / 3.5, w.seed + 501, 2) + (t === T.MOUNTAIN ? 0.08 : t === T.HILLS ? 0.05 : 0) });
    if (t === T.HILLS || t === T.FOREST) coal.push({ i, v: fbm(x / 4, y / 4, w.seed + 502, 2) + (t === T.HILLS ? 0.08 : 0) });
    if (t === T.PLAINS || (t === T.FOREST && w.coastal[i])) oil.push({ i, v: fbm(x / 5, y / 5, w.seed + 503, 2) + (w.coastal[i] ? 0.04 : 0) });
    if (t === T.MOUNTAIN || t === T.HILLS) gold.push({ i, v: fbm(x / 2.5, y / 2.5, w.seed + 504, 2) + (t === T.MOUNTAIN ? 0.1 : 0) });
  }
  pick(metals, 0.07, 6, 0.7, 1);
  pick(coal, 0.08, 6, 0.6, 2);
  pick(oil, 0.035, 4, 0.8, 3);
  pick(gold, 0.05, 2, 0.9, 4);
  for (let i = 0; i < N_CELLS; i++) {
    const type = w.dep[i] || w.hid[i];
    if (type) setDepositSize(w, i, type, !!w.hid[i]);
  }
  // fishing grounds: shallow water near the coast holds the most fish
  w.fishK = new Float32Array(N_CELLS);
  for (let i = 0; i < N_CELLS; i++) {
    if (w.terrain[i] !== T.SEA) continue;
    let near = 9;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = cellX(i) + dx, y = cellY(i) + dy;
      if (inBounds(x, y) && w.terrain[idx(x, y)] !== T.SEA) near = Math.min(near, Math.hypot(dx, dy));
    }
    w.fishK[i] = near <= 1.5 ? 1 : near <= 2.5 ? 0.75 : near <= 3.5 ? 0.4 : 0;
  }
}
function setDepositSize(w, i, type, hidden) {
  const r1 = hash2(i, type, w.seed + 611), r2 = hash2(i, type, w.seed + 612);
  w.depTotal[i] = RES[type].base * (0.45 + 1.6 * r1 * r1) * (hidden ? 1.15 : 1);
  w.depGrade[i] = 0.65 + 0.8 * Math.pow(r2, 1.5);
}
function depositType(w, i) { return w.dep[i] || w.hid[i] || 0; }

/* ---------- What a nation knows: outcrops everyone can see; deeper finds and exact sizes take surveys ---------- */
function bit(nid) { return 1 << nid; }
function knowsDeposit(w, g, nid, i) { return !!w.dep[i] || (!!w.hid[i] && !!(g.known && g.known[i] & bit(nid))); }
function knowsSize(w, g, nid, i) { return !!(g.surveyed && g.surveyed[i] & bit(nid)) || (g.sites || []).some(s => s.cell === i && g.owner[i] === nid); }
function depositEstimate(w, g, i) {
  // a geologist's guess from the surface: within half to one and a half times the truth, stable per deposit
  const t = w.depTotal[i], f = 0.55 + 0.9 * hash2(i, 9, w.seed + 913);
  return { low: t * f * 0.6, high: t * f * 1.45 };
}

function initNature(w, g) {
  g.depLeft = new Float32Array(N_CELLS);
  for (let i = 0; i < N_CELLS; i++) g.depLeft[i] = w.depTotal[i];
  g.known = new Uint16Array(N_CELLS);
  g.surveyed = new Uint16Array(N_CELLS);
  g.forest = new Float32Array(N_CELLS);
  for (let i = 0; i < N_CELLS; i++) if (w.terrain[i] === T.FOREST) g.forest[i] = 1;
  g.fish = new Float32Array(N_CELLS);
  for (let i = 0; i < N_CELLS; i++) if (w.fishK[i] > 0) g.fish[i] = 1;
  g.sites = [];
  g.cleared = [];
  g.prices = { timber: 1, metals: 1, coal: 1, oil: 1, gold: 1 };
  g.priceShock = {};
  g.priceHist = [];
}
function priceOf(g, k) {
  if (!g.prices || g.prices[k] === undefined) return 1;
  const sh = g.priceShock && g.priceShock[k];
  return g.prices[k] * (sh && sh.until > g.turn ? sh.mult : 1);
}

/* ---------- Where a site works: a deposit cell, a forest, or the fishing grounds off a harbor ---------- */
function forestArea(w, cell) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = cellX(cell) + dx, y = cellY(cell) + dy;
    if (inBounds(x, y)) out.push(idx(x, y));
  }
  return out;
}
function fishArea(w, cell) {
  const out = [];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (dx * dx + dy * dy > 6.5) continue;
    const x = cellX(cell) + dx, y = cellY(cell) + dy;
    if (inBounds(x, y) && w.fishK[idx(x, y)] > 0) out.push(idx(x, y));
  }
  return out;
}
function forestStock(w, g, cell) {
  let held = 0, cap = 0;
  for (const c of forestArea(w, cell)) if (w.terrain[c] === T.FOREST || g.forest[c] > 0) { held += g.forest[c] * NATURE.forestK; cap += NATURE.forestK; }
  return { held, cap, share: cap ? held / cap : 0 };
}
function fishStock(w, g, cell) {
  let held = 0, cap = 0;
  for (const c of fishArea(w, cell)) { held += g.fish[c] * w.fishK[c]; cap += w.fishK[c]; }
  return { held, cap, share: cap ? held / cap : 0 };
}
/* What nature puts back in a season, so a sustainable pace can live within it. */
function regrowthOf(w, g, s) {
  if (s.kind === "logging") {
    let r = 0;
    for (const c of forestArea(w, s.cell)) if (w.terrain[c] === T.FOREST) { const f = g.forest[c]; r += (NATURE.forestGrow * f * (1 - f) + 0.002 * (1 - f)) * NATURE.forestK; }
    return r;
  }
  if (s.kind === "fishing") {
    let r = 0;
    for (const c of fishArea(w, s.cell)) { const f = g.fish[c]; r += (NATURE.fishGrow * f * (1 - f) + 0.003 * (1 - f)) * w.fishK[c] * NATURE.fishK * 4; }
    return r;
  }
  return 0;
}
function siteMaxLevel(w, s) {
  const def = SITE_KINDS[s.kind];
  if (def.res) return clamp(1 + Math.floor(w.depTotal[s.cell] / RES[def.res].perLevel), 1, def.maxLevel);
  return def.maxLevel;
}
function nearestCity(g, cell, nid) {
  let best = null, bd = Infinity;
  for (const c of g.cities) { if (nid !== undefined && c.owner !== nid) continue; const d = dist(c.cell, cell); if (d < bd) { bd = d; best = c; } }
  return best;
}
function siteName(g, cell, kind) {
  const c = nearestCity(g, cell);
  const base = c ? c.name : "Wilds";
  const taken = (g.sites || []).filter(s => s.kind === kind && s.name.startsWith(base)).length;
  return `${base} ${SITE_KINDS[kind].short}${taken ? ` ${["", "II", "III", "IV", "V", "VI"][taken] || taken + 1}` : ""}`;
}

/* Which cells each road network reaches, and how far it is to haul from there to a town. */
function roadAccess(g, nid, cities, netOf) {
  const adj = new Map();
  for (const k of g.roads) {
    const [a, b] = edgeEnds(k);
    if (g.owner[a] !== nid || g.owner[b] !== nid || (g.occ && (g.occ[a] >= 0 || g.occ[b] >= 0))) continue;
    if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  }
  const out = new Map();
  const queue = [];
  cities.forEach((c, k) => { out.set(c.cell, { net: netOf[k], dist: 0, city: k }); queue.push(c.cell); });
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h], cur = out.get(c);
    for (const n of adj.get(c) || []) {
      if (out.has(n)) continue;
      out.set(n, { net: cur.net, dist: cur.dist + 1, city: cur.city });
      queue.push(n);
    }
  }
  return out;
}

/* A site's state this season, before workers are counted: what holds it back and what it could make. */
function siteEntry(w, g, s, nation, last, access, networks) {
  const def = SITE_KINDS[s.kind], ind = INDUSTRIES[s.kind];
  const pace = PACES[s.pace === "fast" && def.res && modFlag(nation, "noFast") ? "normal" : s.pace || "normal"];
  const diff = DIFFICULTY[w.terrain[s.cell]] || 1;
  const acc = access.get(s.cell);
  const x = { kind: s.kind, lvl: s.level, site: s, def, status: "working", wmult: pace.workers * (0.85 + 0.15 * diff), mult: 1, capYear: Infinity, dist: acc ? acc.dist : null, net: acc ? acc.net : null };
  if (s.exhausted) { x.status = "exhausted"; return x; }
  if (s.paused) { x.status = "paused"; return x; }
  if (!acc) { x.status = "no road"; return x; }
  x.isoFixed = networks[acc.net] && networks[acc.net].capital ? 1 : ECON7.isolatedRate;
  let m = pace.out;
  if (def.res) {
    const total = w.depTotal[s.cell], left = g.depLeft[s.cell];
    const frac = total > 0 ? left / total : 0;
    x.depletion = frac > 0.3 ? 1 : 0.45 + 0.55 * (frac / 0.3);
    m *= w.depGrade[s.cell] * x.depletion;
    x.capYear = Math.max(0, left) * 4;
    m *= 0.85 + 0.2 * Math.min(1, last.machinery ?? 0.5);          // drills, pumps and trucks
  } else if (def.renew === "forest") {
    const st = forestStock(w, g, s.cell);
    x.stock = st.share;
    m *= Math.pow(st.share, 0.5) * Math.min(1, st.cap / (NATURE.forestK * 6));
    x.capYear = st.held * 4 * 0.5;
    if ((s.pace || "normal") === "slow") x.capYear = Math.min(x.capYear, regrowthOf(w, g, s) * 4);
  } else if (def.renew === "fish") {
    const st = fishStock(w, g, s.cell);
    x.stock = st.share;
    m *= Math.pow(st.share, 0.7) * Math.min(1, st.cap / 8);
    x.capYear = st.held * NATURE.fishK * 4 * 0.5;
    if ((s.pace || "normal") === "slow") x.capYear = Math.min(x.capYear, regrowthOf(w, g, s));
  }
  x.mult = m;
  return x;
}

/* ---------- Quotes: open a site, expand it, survey for deposits, build a road to a deposit ---------- */
function siteBlock(w, g, nid, cell, kind) {
  const def = SITE_KINDS[kind];
  if (!def) return "Unknown kind of site.";
  if (!isLand(w, cell)) return "Sites are built on land.";
  if (g.owner[cell] !== nid) return "That land is not yours.";
  if (g.occ && g.occ[cell] >= 0) return "That land is occupied by an enemy army.";
  if (g.sites.some(s => s.cell === cell)) return "Something is already being worked here.";
  if (g.projects.some(p => p.kind === "site" && p.cell === cell)) return "A site is already being built here.";
  if (def.res) {
    if (depositType(w, cell) !== def.res || !knowsDeposit(w, g, nid, cell)) return `There is no known ${RES[def.res].label.toLowerCase()} deposit here.`;
    if (g.depLeft[cell] <= 0.01) return "This deposit has been worked out.";
  }
  if (def.renew === "forest") {
    const st = forestStock(w, g, cell);
    if (w.terrain[cell] !== T.FOREST || st.cap < NATURE.forestK * 3) return "A logging camp needs a forest around it.";
    if (g.sites.some(s => s.kind === "logging" && dist(s.cell, cell) < 2.5)) return "Another logging camp already works this forest.";
  }
  if (def.renew === "fish") {
    if (!w.coastal[cell]) return "A fishing harbor must be on the coast.";
    if (fishStock(w, g, cell).cap < 3) return "The water here is too deep for good fishing.";
    if (g.sites.some(s => s.kind === "fishing" && dist(s.cell, cell) < 3)) return "Another harbor already fishes these waters.";
  }
  return null;
}
function siteCost(w, g, nid, kind, cell, level, econ) {
  const diff = DIFFICULTY[w.terrain[cell]] || 1;
  return INDUSTRIES[kind].costB * diff * (1 + 0.35 * (level - 1)) * (econ ? econ.constructionIndex : 1);
}
function quoteSite(w, g, nid, cell, kind, base) {
  const fail = reason => ({ ok: false, kind: "site", siteKind: kind, cell, reason });
  const block = siteBlock(w, g, nid, cell, kind);
  if (block) return fail(block);
  const econ = base || computeEconomy(w, g, nid);
  const reach = econ.reach && econ.reach.get(cell);
  if (!reach) return fail(`No road reaches this spot. Build a road to it first: choose Build road, click a town, then click here.`);
  const name = siteName(g, cell, kind);
  const value = projectValue(w, g, nid, { site: { cell, kind, level: 1, name } }, econ);
  const cost = siteCost(w, g, nid, kind, cell, 1, econ);
  const seasons = INDUSTRIES[kind].seasons + (w.terrain[cell] === T.MOUNTAIN ? 1 : 0);
  return { ok: true, kind: "site", nid, cell, siteKind: kind, level: 1, name, cost, seasons, ...value, label: `${SITE_KINDS[kind].label}: ${name}` };
}
function quoteSiteExpand(w, g, nid, s, base) {
  const fail = reason => ({ ok: false, kind: "site", siteKind: s.kind, cell: s.cell, siteId: s.id, reason });
  if (g.owner[s.cell] !== nid) return fail("Not yours.");
  if (s.exhausted) return fail("Nothing is left to work here.");
  if (g.projects.some(p => p.kind === "site" && p.siteId === s.id)) return fail("It is already being expanded.");
  if (s.level >= siteMaxLevel(w, s)) return fail(SITE_KINDS[s.kind].res ? "The deposit is too small for a bigger operation." : "This is as big as it can get.");
  const econ = base || computeEconomy(w, g, nid);
  const value = projectValue(w, g, nid, { site: { id: s.id, level: s.level + 1 } }, econ);
  const cost = siteCost(w, g, nid, s.kind, s.cell, s.level + 1, econ);
  return { ok: true, kind: "site", nid, cell: s.cell, siteKind: s.kind, siteId: s.id, level: s.level + 1, name: s.name, cost, seasons: INDUSTRIES[s.kind].seasons, ...value, label: `Expand ${s.name} to level ${s.level + 1}` };
}
function quoteSurvey(w, g, nid, cell) {
  const fail = reason => ({ ok: false, kind: "survey", cell, reason });
  if (!isLand(w, cell) || g.owner[cell] !== nid) return fail("Surveys are made in your own land.");
  if (g.projects.some(p => p.kind === "survey" && p.nid === nid && dist(p.cell, cell) < 3)) return fail("Geologists are already working nearby.");
  let fresh = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = cellX(cell) + dx, y = cellY(cell) + dy;
    if (!inBounds(x, y) || dx * dx + dy * dy > NATURE.survey ** 2) continue;
    if (!(g.surveyed[idx(x, y)] & bit(nid))) fresh++;
  }
  if (!fresh) return fail("This area has already been surveyed.");
  const cost = 0.6 + 0.04 * fresh;
  const near = nearestCity(g, cell, nid);
  return { ok: true, kind: "survey", nid, cell, cost, seasons: 1, dGdp: 0, dFood: 0, value: 0, label: `Geological survey near ${near ? near.name : "the frontier"}` };
}
function quoteAccessRoad(w, g, nid, fromCity, cell) {
  const fail = reason => ({ ok: false, kind: "road", reason });
  if (!fromCity || fromCity.owner !== nid) return fail("Start the road at one of your own towns.");
  if (!isLand(w, cell) || g.owner[cell] !== nid) return fail("A road to a site must stay inside your own land.");
  const path = findRoadPath(w, g, nid, fromCity.cell, cell);
  if (!path) return fail("No route through your own land reaches this spot.");
  const q = roadQuote(w, g, path);
  if (!q.newEdges.length) return fail("A road already reaches this spot.");
  if (path.length > BUILD.roadMaxReach * 1.6) return fail("Too far for one road. Start from a closer town.");
  const what = siteOrDepositName(w, g, nid, cell);
  const value = projectValue(w, g, nid, { edges: q.newEdges });
  return { ok: true, kind: "road", nid, path, from: fromCity, toCell: cell, ...q, ...value, access: true, label: `Road from ${fromCity.name} to ${what}` };
}
/* The cheapest access road from any town on the capital's network (or any town) to a spot. */
function bestAccessRoad(w, g, nid, cell, econ) {
  const cities = (econ ? econ.cities : g.cities.filter(c => c.owner === nid)).slice().sort((a, b) => dist(a.cell, cell) - dist(b.cell, cell)).slice(0, 3);
  let best = null;
  for (const c of cities) {
    const q = quoteAccessRoad(w, g, nid, c, cell);
    if (q.ok && (!best || q.cost < best.cost)) best = q;
  }
  return best || (cities[0] ? quoteAccessRoad(w, g, nid, cities[0], cell) : { ok: false, kind: "road", reason: "You have no town to start a road from." });
}
function siteOrDepositName(w, g, nid, cell) {
  const s = g.sites.find(x => x.cell === cell);
  if (s) return s.name;
  const t = depositType(w, cell);
  const near = nearestCity(g, cell, nid);
  if (t && knowsDeposit(w, g, nid, cell)) return `the ${RES[t].label.toLowerCase()} deposit${near ? ` near ${near.name}` : ""}`;
  return near ? `a spot near ${near.name}` : "the site";
}
function siteKindFor(w, g, nid, cell) {
  const t = depositType(w, cell);
  if (t && knowsDeposit(w, g, nid, cell)) return RES[t].site;
  if (w.terrain[cell] === T.FOREST) return "logging";
  if (w.coastal[cell]) return "fishing";
  return null;
}

/* ---------- Each season: sites wear down what they work; nature grows back; prospectors find things ---------- */
function workSites(w, g, n, econ) {
  const news = [];
  for (const x of econ.sites || []) {
    const s = x.site;
    s.lastOut = x.outUnits || 0;
    s.lastWorkers = x.workers || 0;
    s.lastVA = x.va || 0;
    s.hist = (s.hist || []).concat([Math.round((x.outUnits || 0) * 1000) / 1000]).slice(-40);
    const units = (x.outUnits || 0) / 4;
    if (units <= 0) continue;
    const def = SITE_KINDS[s.kind];
    s.extracted = (s.extracted || 0) + units;
    if (def.res) {
      const before = g.depLeft[s.cell], total = w.depTotal[s.cell];
      g.depLeft[s.cell] = Math.max(0, before - units);
      const after = g.depLeft[s.cell];
      if (before / total > 0.25 && after / total <= 0.25) news.push({ tone: "warn", text: `${s.name} has a quarter of its ${RES[def.res].label.toLowerCase()} left. Output will fall as the miners dig deeper.` });
      if (after <= 0.01) {
        s.exhausted = true; s.exhaustedAt = g.turn;
        news.push({ tone: "bad", text: `${s.name} is worked out after ${Math.max(1, Math.round((g.turn - s.opened) / 4))} years. It produced ${fmtAmount(def.res, s.extracted)} in all.` });
      }
    } else if (def.renew === "forest") {
      const area = forestArea(w, s.cell).filter(c => g.forest[c] > 0);
      const held = area.reduce((sum, c) => sum + g.forest[c], 0);
      let cleared = 0;
      for (const c of area) {
        g.forest[c] = Math.max(0, g.forest[c] - (units / NATURE.forestK) * (g.forest[c] / Math.max(0.001, held)));
        if (g.forest[c] < NATURE.forestClear && w.terrain[c] === T.FOREST) { clearForestCell(w, g, c); cleared++; }
      }
      if (cleared) news.push({ tone: "warn", text: `Loggers from ${s.name} have cleared ${cleared === 1 ? "a stretch" : `${cleared} stretches`} of forest. The open land can now be farmed.` });
      if (forestStock(w, g, s.cell).cap < NATURE.forestK * 0.5) { s.exhausted = true; s.exhaustedAt = g.turn; news.push({ tone: "bad", text: `The forest around ${s.name} is gone. The camp has closed.` }); }
    } else if (def.renew === "fish") {
      const area = fishArea(w, s.cell);
      const held = area.reduce((sum, c) => sum + g.fish[c] * w.fishK[c], 0);
      for (const c of area) g.fish[c] = Math.max(0, g.fish[c] - (units / NATURE.fishK) * (g.fish[c] / Math.max(0.001, held)));
      const share = fishStock(w, g, s.cell).share;
      if (share < 0.25 && !s.warnedFish) { s.warnedFish = true; news.push({ tone: "warn", text: `Fish are getting scarce off ${s.name}. Set quotas to let the stocks recover.` }); }
      if (share > 0.5) s.warnedFish = false;
    }
  }
  return news;
}
function clearForestCell(w, g, c) {
  w.terrain[c] = T.PLAINS;
  g.forest[c] = 0;
  if (!g.cleared.includes(c)) g.cleared.push(c);
}
function regrowNature(w, g) {
  for (let i = 0; i < N_CELLS; i++) {
    if (w.terrain[i] === T.FOREST) { const f = g.forest[i]; g.forest[i] = Math.min(1, f + NATURE.forestGrow * f * (1 - f) + 0.002 * (1 - f)); }
    if (w.fishK[i] > 0) { const f = g.fish[i]; g.fish[i] = Math.min(1, f + NATURE.fishGrow * f * (1 - f) + 0.003 * (1 - f)); }
  }
}
/* Prospectors stumble on deeper deposits now and then, more often near working mines. */
function prospect(w, g, rng) {
  const news = [];
  for (let i = 0; i < N_CELLS; i++) {
    const t = w.hid[i];
    if (!t) continue;
    const o = g.owner[i];
    if (o < 0 || (g.known[i] & bit(o))) continue;
    const nearMine = g.sites.some(s => SITE_KINDS[s.kind].res && !s.exhausted && dist(s.cell, i) <= 2.5);
    if (rng() < (nearMine ? 0.05 : 0.012)) {
      g.known[i] |= bit(o);
      const near = nearestCity(g, i, o);
      news.push({ nid: o, cell: i, text: `Prospectors found ${RES[t].label.toLowerCase()} near ${near ? near.name : "the frontier"}.` });
    }
  }
  return news;
}
function finishSurvey(w, g, p) {
  const found = [];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = cellX(p.cell) + dx, y = cellY(p.cell) + dy;
    if (!inBounds(x, y) || dx * dx + dy * dy > NATURE.survey ** 2) continue;
    const i = idx(x, y);
    g.surveyed[i] |= bit(p.nid);
    const t = depositType(w, i);
    if (!t) continue;
    if (w.hid[i] && !(g.known[i] & bit(p.nid))) { g.known[i] |= bit(p.nid); found.push({ i, t, fresh: true }); }
    else found.push({ i, t, fresh: false });
  }
  return found;
}

/* ---------- World prices for raw materials: scarcity pushes them up, gluts pull them down ---------- */
const PRICE_SHOCKS = [
  { k: "oil", mult: 1.6, text: "War in a distant oil region: oil prices jump." },
  { k: "oil", mult: 0.65, text: "A flood of new oil abroad: oil prices fall." },
  { k: "gold", mult: 1.4, text: "Banks abroad buy gold in a panic: the gold price soars." },
  { k: "gold", mult: 0.7, text: "A gold rush overseas floods the market: gold prices slump." },
  { k: "metals", mult: 1.35, text: "Shipyards and railways abroad want steel: metal prices rise." },
  { k: "coal", mult: 0.7, text: "A mild winter across the world: coal prices fall." },
  { k: "timber", mult: 1.3, text: "Building boom abroad: timber prices rise." },
];
function updateWorldPrices(w, g, rng, econs) {
  const news = [];
  const S = {}, D = {};
  TRADED.forEach(k => { S[k] = 0; D[k] = 0; });
  let gdp = 0;
  for (const n of liveNations(g)) {
    const e = (econs && econs[n.id]) || computeEconomy(w, g, n.id);
    gdp += e.gdp;
    for (const k of TRADED) { S[k] += e.goods.supply[k] || 0; D[k] += e.goods.demand[k] || 0; }
  }
  // the world beyond the map buys and sells too: gold for its banks and jewellers, and a large outside market
  // for everything else, which keeps prices from running away when the nations here are short or flooded
  D.gold += gdp * 0.0005;
  for (const k of TRADED) {
    const outside = 0.45 * (D[k] + S[k]) + { timber: 1.5, metals: 1.5, coal: 1.5, oil: 1.5, gold: 0.6 }[k];
    const ratio = (D[k] + outside) / (S[k] + outside);
    const target = clamp(Math.pow(ratio, 0.55), 0.5, 2.2);
    const p = g.prices[k];
    g.prices[k] = clamp(p + (target - p) * 0.12 + (rng() - 0.5) * 0.04 * p, 0.4, 2.5);
  }
  if (rng() < 0.025) {
    const sh = PRICE_SHOCKS[Math.floor(rng() * PRICE_SHOCKS.length)];
    if (!(g.priceShock[sh.k] && g.priceShock[sh.k].until > g.turn)) {
      g.priceShock[sh.k] = { mult: sh.mult, until: g.turn + 4 + Math.floor(rng() * 5) };
      news.push({ tone: sh.mult > 1 ? "good" : "bad", text: sh.text, k: sh.k });
    }
  }
  const row = { turn: g.turn };
  for (const k of TRADED) row[k] = Math.round(priceOf(g, k) * 1000) / 1000;
  g.priceHist.push(row);
  if (g.priceHist.length > 240) g.priceHist.shift();
  return news;
}

/* ---------- Every nation starts with a few sites already working, joined to its towns by road ---------- */
function seedSites(w, g, n, rng) {
  const nid = n.id;
  const cities = g.cities.filter(c => c.owner === nid);
  if (!cities.length) return;
  const own = [];
  for (let i = 0; i < N_CELLS; i++) if (g.owner[i] === nid) own.push(i);
  const open = (cell, kind) => {
    const from = cities.slice().sort((a, b) => dist(a.cell, cell) - dist(b.cell, cell))[0];
    if (from.cell !== cell) {
      const path = findRoadPath(w, g, nid, from.cell, cell);
      if (!path || path.length > 7) return false;
      pathEdges(path).forEach(e => g.roads.add(e));
    }
    g.sites.push({ id: g.nextId++, cell, kind, level: 1, pace: "normal", paused: false, opened: 0, extracted: 0, name: siteName(g, cell, kind) });
    return true;
  };
  // the best known deposit of each kind, closest to a town
  const byType = {};
  for (const i of own) {
    const t = w.dep[i];
    if (!t) continue;
    const d = Math.min(...cities.map(c => dist(c.cell, i)));
    const score = w.depTotal[i] * w.depGrade[i] / (1 + d);
    if (!byType[t] || score > byType[t].score) byType[t] = { i, score };
  }
  const order = n.minor ? [2, 1] : [2, 1, 3, 4];
  let opened = 0;
  for (const t of order) if (byType[t] && opened < (n.minor ? 1 : 3) && open(byType[t].i, RES[t].site)) opened++;
  // a logging camp in the nearest forest, and a fishing harbor at a coastal town
  const forest = own.filter(i => w.terrain[i] === T.FOREST && !g.sites.some(s => s.cell === i) && forestStock(w, g, i).cap >= NATURE.forestK * 4)
    .sort((a, b) => Math.min(...cities.map(c => dist(c.cell, a))) - Math.min(...cities.map(c => dist(c.cell, b))))[0];
  if (forest !== undefined) open(forest, "logging");
  const harbor = cities.find(c => w.coastal[c.cell] && !g.sites.some(s => s.cell === c.cell) && fishStock(w, g, c.cell).cap >= 3);
  if (harbor) open(harbor.cell, "fishing");
}

/* ---------- Display helpers ---------- */
function fmtAmount(type, units) {
  const r = RES[type], v = units * r.perUnit;
  const s = v >= 100 ? Math.round(v).toLocaleString("en-US") : v >= 10 ? v.toFixed(0) : v.toFixed(1);
  return `${s} ${r.unit}`;
}
function fmtSiteOutput(kind, units) {
  const def = SITE_KINDS[kind];
  if (def.res) return `${fmtAmount(def.res, units)} a year`;
  if (kind === "logging") return `${(units * 5).toFixed(1)} million m³ of timber a year`;
  return `fish to feed ${fmtPop(units)} people`;
}

/* ---------- Value of a site's output, after hauling it to town by road ---------- */
function siteVA(g, x, u, mult) {
  const def = SITE_KINDS[x.kind];
  const food = def.good === "food";
  const gross = (x.outUnits || 0) * def.unitVA * (food ? 1 : priceOf(g, def.good) * u) * mult;
  x.haulCost = (x.outUnits || 0) * (x.dist || 0) * def.haul * (x.haulMult ?? 1) * (1 - SMELT.haulCut * (x.smeltShare || 0));
  x.gross = gross;
  return Math.max(0, gross - x.haulCost);
}

/* ---------- What governments and companies consider opening, expanding or reaching by road ---------- */
function siteCandidates(w, g, n, econ, privateOnly) {
  const out = [], nid = n.id;
  if (!econ.cities.length || !econ.reach) return out;
  const roadBusy = g.projects.some(p => p.kind === "road" && p.nid === nid);
  const deps = [];
  for (let i = 0; i < N_CELLS; i++) {
    if (g.owner[i] !== nid || (g.occ && g.occ[i] >= 0)) continue;
    const t = depositType(w, i);
    if (!t || !knowsDeposit(w, g, nid, i) || g.depLeft[i] < 1) continue;
    if (g.sites.some(s => s.cell === i) || g.projects.some(p => p.kind === "site" && p.cell === i)) continue;
    const k = RES[t].site;
    const near = econ.reach.has(i) ? 1 : 0.6 / (1 + 0.15 * Math.min(...econ.cities.map(c => dist(c.cell, i))));
    deps.push({ i, kind: k, score: Math.min(g.depLeft[i], 40) * w.depGrade[i] * SITE_KINDS[k].unitVA * priceOf(g, SITE_KINDS[k].good) * near });
  }
  deps.sort((a, b) => b.score - a.score);
  const tryCell = (i, kind) => {
    if (econ.reach.has(i)) { const q = quoteSite(w, g, nid, i, kind, econ); if (q.ok) out.push(q); return; }
    if (privateOnly || roadBusy || out.some(q => q.kind === "road")) return;
    const q = bestAccessRoad(w, g, nid, i, econ);
    if (!q.ok || q.cost > 30) return;
    const v = projectValue(w, g, nid, { edges: q.newEdges, site: { cell: i, kind, level: 1 } }, econ);
    q.value = v.value * 0.6; q.dGdp = v.dGdp * 0.6; q.forSite = kind;
    if (q.value > 0) out.push(q);
  };
  deps.slice(0, 3).forEach(d => tryCell(d.i, d.kind));
  // timber, if the nation lacks it and has no camp working the forests
  if ((econ.sat.timber ?? 1) < 0.95 || !g.sites.some(s => s.kind === "logging" && g.owner[s.cell] === nid && !s.exhausted)) {
    let best = null;
    for (let i = 0; i < N_CELLS; i++) {
      if (g.owner[i] !== nid || w.terrain[i] !== T.FOREST || siteBlock(w, g, nid, i, "logging")) continue;
      const sc = forestStock(w, g, i).held * (econ.reach.has(i) ? 2 : 1) / (1 + Math.min(...econ.cities.map(c => dist(c.cell, i))));
      if (!best || sc > best.sc) best = { i, sc };
    }
    if (best) tryCell(best.i, "logging");
  }
  // a harbor at a coastal town without one
  for (const c of econ.cities) {
    if (!w.coastal[c.cell] || siteBlock(w, g, nid, c.cell, "fishing")) continue;
    const q = quoteSite(w, g, nid, c.cell, "fishing", econ);
    if (q.ok) { out.push(q); break; }
  }
  // bigger operations where the workers and the deposit allow
  const grow = (econ.sites || []).filter(x => x.status === "working" && (x.fill ?? 1) > 0.95 && x.site.level < siteMaxLevel(w, x.site))
    .sort((a, b) => (b.va || 0) - (a.va || 0)).slice(0, 2);
  for (const x of grow) { const q = quoteSiteExpand(w, g, nid, x.site, econ); if (q.ok) out.push(q); }
  out.push(...smelterCandidates(w, g, n, econ));
  return out;
}

/* Rivals run their sites sensibly: let tired forests and fishing grounds rest, mothball mines that lose money. */
function aiManageSites(w, g, n, econ) {
  for (const x of econ.sites || []) {
    const s = x.site, def = SITE_KINDS[s.kind];
    if (s.exhausted) continue;
    if (def.renew) {
      if ((x.stock ?? 1) < 0.4) s.pace = "slow"; else if ((x.stock ?? 1) > 0.75) s.pace = "normal";
      continue;
    }
    const p = priceOf(g, def.good);
    if (s.pausedUntil !== undefined && s.pausedUntil > g.turn) continue;
    if (!s.paused && p < 0.55 && def.good === "gold") s.paused = true;
    else if (s.paused && p > 0.75) s.paused = false;
    s.pace = enemiesOf(g, n.id).length && ["metals", "oil", "coal"].includes(def.good) ? "fast" : "normal";
  }
}

function surveyText(w, g, p) {
  const f = p.found || [];
  if (!f.length) return `${p.label} is done. The geologists found nothing worth mining there.`;
  const fresh = f.filter(x => x.fresh), known = f.filter(x => !x.fresh);
  const desc = x => `${RES[x.t].label.toLowerCase()}: ${fmtAmount(x.t, w.depTotal[x.i])}`;
  const parts = [];
  if (fresh.length) parts.push(`new finds of ${fresh.map(desc).join(", ")}`);
  if (known.length) parts.push(`measured ${known.map(desc).join(", ")}`);
  return `${p.label} is done: ${parts.join("; ")}.`;
}

/* What a town's land can support: deposits, forest, fishing grounds, rivers, scenery. */
function regionResources(w, cells) {
  const r = { metals: 0, coal: 0, oil: 0, gold: 0, forestCells: 0, coastCells: 0, rugged: 0, mountains: 0 };
  for (const i of cells) {
    const d = w.dep ? w.dep[i] : 0;
    if (d) r[DEPOSITS[d].key]++;
    const t = w.terrain[i];
    if (t === T.FOREST) r.forestCells++;
    if (t === T.HILLS || t === T.MOUNTAIN) r.rugged++;
    if (t === T.MOUNTAIN) r.mountains++;
    if (w.coastal[i]) r.coastCells++;
  }
  return r;
}
function industryCap(kind, res, pop, port) {
  switch (INDUSTRIES[kind].cap) {
    case "fish": return Math.floor(res.coastCells * 0.3) + (port ? 1 : 0);
    case "forest": return Math.floor(res.forestCells * 0.3);
    case "metals": return res.metals;
    case "coal": return res.coal;
    case "gold": return res.gold;
    case "oil": return Math.floor(res.oil * 1.5);
    case "hydro": return Math.floor(res.rugged * 0.12);
    case "scenery": return Math.floor(res.coastCells * 0.15 + res.mountains * 0.2);
    default: return INDUSTRIES[kind].urban ? Math.max(1, Math.floor(pop * ECON7.urbanLevelsPerM)) : 99;
  }
}
function cityLevels(city) { return city.ind || {}; }
function urbanLevels(city) { let s = 0; const ind = cityLevels(city); for (const k in ind) if (INDUSTRIES[k] && INDUSTRIES[k].urban) s += ind[k]; return s; }

/* ---------- Laws that shape the economy ---------- */
const EDU_ORDER = ["minimal", "basic", "good", "excellent"];
const EDU_LAWS = {
  minimal:   { label: "Minimal",   costK: 0.2, skill: 0.2, stab: -2, tech: 0.4 },
  basic:     { label: "Basic",     costK: 0.6, skill: 0.4, stab: 0,  tech: 1.0 },
  good:      { label: "Good",      costK: 1.1, skill: 0.6, stab: 1,  tech: 1.4 },
  excellent: { label: "Excellent", costK: 1.8, skill: 0.8, stab: 2,  tech: 1.7 },
};
const RESEARCH_ORDER = ["none", "low", "medium", "high"];
const RESEARCH_LAWS = {
  none:   { label: "None",   share: 0 },
  low:    { label: "Low",    share: 0.004 },
  medium: { label: "Medium", share: 0.01 },
  high:   { label: "High",   share: 0.02 },
};
const TRADE_ORDER = ["protect", "balanced", "free"];
const TRADE_LAWS = {
  protect:  { label: "Protectionist", tariff: 0.2,  imports: 0.5, exports: 0.7, foreign: 0.6, stab: 1 },
  balanced: { label: "Balanced",      tariff: 0.08, imports: 1,   exports: 1,   foreign: 1,   stab: 0 },
  free:     { label: "Free trade",    tariff: 0,    imports: 1.5, exports: 1.3, foreign: 1.3, stab: -1 },
};
const FINANCE_ORDER = ["strict", "balanced", "loose"];
const FINANCE_LAWS = {
  strict:   { label: "Strict",   invest: 0.012, services: 0,    crisis: 0 },
  balanced: { label: "Balanced", invest: 0.02,  services: 0.05, crisis: 0.006 },
  loose:    { label: "Loose",    invest: 0.032, services: 0.12, crisis: 0.03 },
};

/* ---------- Technology ---------- */
const TECHS = {
  mech:        { label: "Mechanized farming", cost: 40,  does: "Tractors and harvesters: farms need a third fewer workers when machinery is available." },
  fert:        { label: "Fertilizers",        cost: 50,  does: "Chemicals raise harvests by up to a fifth." },
  assembly:    { label: "Assembly lines",     cost: 60,  does: "Manufacturing produces a quarter more per worker." },
  electrify:   { label: "Electrification",    cost: 45,  does: "Power stations produce a third more electricity." },
  electronics: { label: "Electronics",        cost: 70,  does: "Unlocks electronics plants." },
  medicine:    { label: "Modern medicine",    cost: 65,  does: "Healthcare does half again as much; fewer wounded soldiers die." },
  media:       { label: "Mass media",         cost: 55,  does: "Unlocks broadcasting networks." },
  finance:     { label: "Modern finance",     cost: 70,  does: "Unlocks business districts; borrowing costs a point less; more private investment." },
  combined:    { label: "Combined arms",      cost: 75,  does: "Divisions fight 10% harder." },
  computing:   { label: "Computing",          cost: 110, needs: "electronics", does: "Unlocks tech parks; services 8% more productive." },
  jets:        { label: "Jet aircraft",       cost: 100, needs: "electronics", does: "Air wings count 40% more in the battle for the sky." },
  nuclear:     { label: "Nuclear power",      cost: 140, needs: "electrify", does: "Unlocks nuclear power stations." },
  automation:  { label: "Automation",         cost: 180, needs: "computing", does: "All industry 20% more productive with fewer workers." },
};
const TECH_ORDER = ["mech", "electrify", "fert", "assembly", "media", "medicine", "electronics", "finance", "combined", "computing", "jets", "nuclear", "automation"];
function hasTech(n, t) { return !!(n && n.techs && n.techs[t]); }
function techAvailable(n, t) { return !hasTech(n, t) && (!TECHS[t].needs || hasTech(n, TECHS[t].needs)); }

/* ---------- The economy itself ---------- */
function emptyEconomy() {
  return { people: null, cities: [], regions: [], networks: [], gdp: 0, pop: 0.001, food: 0, faminePop: 0, famineShare: 0, isolated: [], roadEdges: 0, area: 0, sites: [], reach: new Map(),
    sectors: {}, subs: {}, goods: { supply: {}, demand: {}, imports: {}, exports: {}, util: {} }, sat: {}, levels: {}, workers: 0, research: 0, effects: {}, armsSat: 1, fuelSat: 1, constructionIndex: 1, exportValue: 0, importBill: 0, access: 0,
    workforce: 0, unemployed: 0, unemployment: 0, vacancies: 0, armed: 0, publicJobs: 0, granary: null, lostToIdle: 0, programs: 0, seats: 0, citySkill: 0, cityResearch: 0 };
}

/* While a government weighs its options nothing changes, so each nation's economy is worked out once.
   ECON_MEMO is only set inside withEconMemo(); hypothetical worlds are different objects and are never cached. */
let ECON_MEMO = null;
function withEconMemo(g, fn) {
  const outer = ECON_MEMO;
  if (outer && outer.g === g) return fn();
  ECON_MEMO = { g, byNation: new Map() };
  try { return fn(); } finally { ECON_MEMO = outer; }
}
function computeEconomy(w, g, nid) {
  if (ECON_MEMO && ECON_MEMO.g === g) {
    let e = ECON_MEMO.byNation.get(nid);
    if (!e) { ECON_MEMO.g = null; try { e = computeEconomyRaw(w, g, nid); } finally { ECON_MEMO.g = g; } ECON_MEMO.byNation.set(nid, e); }
    return e;
  }
  return computeEconomyRaw(w, g, nid);
}
function computeEconomyRaw(w, g, nid) {
  const nation = g.nations[nid];
  const occ = g.occ;
  const held = i => g.owner[i] === nid && !(occ && occ[i] >= 0);
  const cities = g.cities.filter(c => c.owner === nid && held(c.cell));
  if (!cities.length) return emptyEconomy();
  const laws = (nation && nation.laws) || {};
  const skill = nation && nation.skill !== undefined ? nation.skill : 0.35;
  const last = (nation && nation.market) || {};
  const tradeLaw = TRADE_LAWS[laws.trade || "balanced"];
  const WB = workBonus(g, nid);

  /* Land, people and resources of each town */
  const regions = cities.map(city => ({ city, cells: [], pop: 0, farmland: 0, touches: new Set() }));
  let area = 0;
  const partners = g.treaties ? g.treaties.filter(t => t.type === "trade" && (t.a === nid || t.b === nid)).map(t => (t.a === nid ? t.b : t.a)) : [];
  for (let i = 0; i < N_CELLS; i++) {
    if (!held(i)) continue;
    area++;
    let best = 0, bestD = Infinity;
    for (let k = 0; k < cities.length; k++) {
      const d = (cellX(i) - cellX(cities[k].cell)) ** 2 + (cellY(i) - cellY(cities[k].cell)) ** 2;
      if (d < bestD) { bestD = d; best = k; }
    }
    const r = regions[best];
    r.cells.push(i);
    r.pop += g.pop[i];
    r.farmland += cellFood(w, g, i);
    if (partners.length) {
      for (const [dx, dy] of DIRS4) {
        const x = cellX(i) + dx, y = cellY(i) + dy;
        if (!inBounds(x, y)) continue;
        const o = g.owner[idx(x, y)];
        if (o >= 0 && o !== nid) r.touches.add(o);
      }
    }
  }
  regions.forEach(r => { r.res = regionResources(w, r.cells); r.cm = cityEconMods(g, nation, r.city, r.pop); });

  /* Road networks and foreign markets */
  const joined = joinNetworks(w, g, nid, cities, regions, cityNetworks(g, nid, cities));
  const { netOf, count } = joined;
  const networks = Array.from({ length: count }, () => ({ regions: [], pop: 0, food: 0, port: false, capital: false, foreign: 0, partners: [], touches: new Set() }));
  regions.forEach((r, k) => {
    const net = networks[netOf[k]];
    r.net = netOf[k];
    net.regions.push(k);
    net.pop += r.pop;
    r.touches.forEach(o => net.touches.add(o));
    if (r.city.port && (!g.sea || !oceanPort(w, r.city) || portUsableBy(w, g, r.city, nid))) net.port = true;
    if (r.city.capital) net.capital = true;
  });
  // the capital is in enemy hands: a provincial seat governs in its place
  if (!networks.some(x => x.capital)) { const s = actingCapitalRegion(g, regions); if (s) { networks[s.net].capital = true; networks[s.net].acting = s.city.id; } }
  // trade roads: follow roads out of each network through wild land and partners' land
  if (partners.length && g.roads.size) {
    const pass = new Set([nid, -1, ...partners]);
    const adj = new Map();
    for (const k of g.roads) {
      const [a, b] = edgeEnds(k);
      if (!pass.has(g.owner[a]) || !pass.has(g.owner[b]) || (occ && (occ[a] >= 0 || occ[b] >= 0))) continue;
      if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b); adj.get(b).push(a);
    }
    networks.forEach((net, k) => {
      const start = regions.filter(r => r.net === k).map(r => r.city.cell);
      const seen = new Set(start), queue = start.slice();
      while (queue.length) {
        const c = queue.pop();
        const o = g.owner[c];
        if (o !== nid && o >= 0) net.touches.add(o);
        for (const nb of adj.get(c) || []) if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
      }
    });
  }
  let landPartner = false;
  for (const p of partners) {
    if (!g.nations[p] || !g.nations[p].alive) continue;
    const ppop = nationPop(g, p);
    const pPort = g.cities.some(c => c.owner === p && c.port && !(occ && occ[c.cell] >= 0) && !(g.sea && oceanPort(w, c) && portBlockadedFor(w, g, c, p)));
    for (const net of networks) {
      if (net.touches.has(p) || (net.port && pPort)) { net.foreign += DIPLO.tradeForeignShare * ppop * tradeLaw.foreign; net.partners.push(p); if (net.touches.has(p)) landPartner = true; }
    }
  }
  const anyPort = networks.some(n => n.port && n.capital) || networks.some(n => n.port);
  // sea trade needs ships: foreign ones in peace, your own when war keeps them away; and room in your ports
  const seaT = g.sea && g.sea.trade ? g.sea.trade[nid] : null;
  const seaShare = seaT ? seaT.share : 1;
  const seaAccess = anyPort ? (0.5 + WB.access) * seaShare : 0;
  const access = seaAccess + (networks.some(x => x.partners.length) ? 0.3 : 0);
  const importCapShare = access * tradeLaw.imports, exportCapShare = access * 0.8 * tradeLaw.exports;

  /* Industry levels in each town, limited by what the land holds */
  const levels = {};
  INDUSTRY_ORDER.forEach(k => { levels[k] = 0; });
  for (const r of regions) {
    r.ind = [];
    const L = cityLevels(r.city);
    for (const k of INDUSTRY_ORDER) {
      const want = L[k] || 0;
      if (!want) continue;
      const lvl = Math.min(want, industryCap(k, r.res, r.pop, r.city.port) + (INDUSTRIES[k].urban ? r.cm.room : 0));
      if (lvl > 0) r.ind.push({ kind: k, lvl });
    }
  }

  /* Sites on the map: mines, oil fields, logging camps and harbors. Each needs a road to a town;
     its workers come from the nearest town; its output goes onto the market of the network its road joins. */
  const reach = roadAccess(g, nid, cities, netOf);
  const siteList = [];
  for (const s of g.sites || []) {
    if (!held(s.cell)) continue;
    const x = siteEntry(w, g, s, nation, last, reach, networks);
    if (x.status === "working" && s.kind === "fishing" && g.sea) { const sc = portSeaCell(w, s.cell); if (sc >= 0 && zoneHostile(g, zoneOf(w, sc), nid)) x.status = "blockaded"; }
    x.haulMult = WB.haul;
    let best = 0, bd = Infinity;
    for (let k = 0; k < cities.length; k++) { const d = dist(cities[k].cell, s.cell); if (d < bd) { bd = d; best = k; } }
    x.region = regions[best];
    x.townId = cities[best].id;
    { const cm = regions[best].cm; x.haulMult = (x.haulMult ?? 1) * cm.haul; if (x.status === "working") { x.mult *= cm.siteOut; x.wmult *= cm.siteW; } }
    siteList.push(x);
    if (x.status === "working") {
      regions[best].ind.push(x);
      // a smelter at the mine works the ore as it comes up, as far as its coal, power and workers allow
      if (s.smelter && s.kind === "mine") { const sm = { kind: "smelter", lvl: s.level * (x.mult || 1), lvlFull: s.level * (x.mult || 1), mine: x, smelterOf: s, isoFixed: x.isoFixed }; x.smelterX = sm; regions[best].ind.push(sm); }
    }
  }

  /* Food: farmland, fishing fleets and fertilizer */
  const mech = (last.machinery ?? 0.4) * (hasTech(nation, "mech") ? 0.55 : 0.28);
  const fert = (last.chemicals ?? 0.4) * (hasTech(nation, "fert") ? 0.2 : 0.07);
  const laborPerFood = ECON7.farmLabor * (1 - mech);
  for (const r of regions) {
    const fish = r.ind.filter(x => x.kind === "fishing").reduce((s, x) => s + Math.min(x.lvl * INDUSTRIES.fishing.out.food * (x.mult ?? 1), x.capYear ?? Infinity), 0);
    r.fish = fish;
    r.food = r.farmland * harvestFactor(nation) * (1 + modSum(nation, "food")) * (1 + fert) * (WB.damCell >= 0 && dist(r.city.cell, WB.damCell) <= 6 ? 1.12 : 1) * r.cm.food + fish;
    networks[r.net].food += r.food;
  }

  /* Workers: farms first, then industry in order, then the jobs in services the town can pay for; the rest have no work */
  let pop = 0, food = 0, faminePop = 0;
  const foodprocLevels = regions.reduce((s, r) => s + r.ind.filter(x => x.kind === "foodproc").reduce((a, x) => a + x.lvl, 0), 0);
  const foodprocWant = foodprocLevels * INDUSTRIES.foodproc.in.food;
  const gran = granaryPlan(nation, regions.reduce((s, r) => s + r.pop, 0));
  // the reserve serves the capital's network; if the capital is lost, the government feeds the largest part still held
  const resNet = networks.find(x => x.capital) || networks.slice().sort((a, b) => b.pop - a.pop)[0];
  for (const net of networks) {
    // farms grow food for export only when machinery makes farm work pay; the state buys extra for its reserve
    const exportRoom = (net.port || net.partners.length) ? 0.25 * clamp(mech / 0.4, 0, 1) : 0;
    const base = net.pop * (1.02 + exportRoom) + (net.capital ? foodprocWant : 0);
    const wanted = base + (net === resNet ? gran.fillWant * 4 : 0);
    net.foodMade = Math.min(net.food, wanted);
    if (net === resNet) {
      gran.spare = Math.max(0, net.food - base) / 4;
      gran.fill = clamp((net.foodMade - base) / 4, 0, gran.fillWant);
      // a harvest short of what the people eat is made up from the reserve, as far as it goes
      const short = Math.max(0, net.pop - net.food) / 4;
      gran.release = Math.min(gran.stock, short);
      gran.short = short - gran.release;
      net.reserveFood = gran.release * 4;
    }
  }
  for (const r of regions) { const net = networks[r.net]; r.market = 1 - Math.exp(-((net.pop + net.foreign) * (net.capital ? 1 + WB.market : 1)) / ECON.tradeScaleM); }
  const soldiersNow = nation ? (nation.mil ? nation.mil.men : nation.soldiers || 0) : 0;
  const LF = labourForce(nation, laws);
  const armed = clamp(soldiersNow / Math.max(1, regions.reduce((s, r) => s + r.pop, 0) * 1e6 * LF.lf), 0, 0.3);
  const pubShare = publicJobShare(nation);
  const MW = labourLaw(laws, "minwage");
  let workforce = 0, unemployed = 0, vacancies = 0, publicJobs = 0;
  for (const r of regions) {
    const net = networks[r.net];
    r.foodRatio = (net.food + (net.reserveFood || 0)) / Math.max(0.001, net.pop);
    r.foodMade = net.food > 0 ? net.foodMade * r.food / net.food : 0;
    r.workforce = r.pop * LF.lf * (1 - armed);
  }
  peoplePools(nation, regions, networks, LF.lf > 0 ? LF.adults / LF.lf : 1);
  for (const r of regions) {
    r.farmWorkers = Math.min(r.workforce * 0.85, r.foodMade * laborPerFood * r.cm.farmLabor);
    r.farmTake = { u: 0, s: 0, e: 0 };
    takeAny(r.pool, r.farmWorkers, r.farmTake);
    r.farmTake.over = Math.max(0, r.farmTake.s + r.farmTake.e - r.farmWorkers * JOB_MIX.farm[1]);
    let indWorkers = 0;
    for (const x of r.ind) {
      const def = INDUSTRIES[x.kind];
      if (x.kind === "smelter") x.lvl = x.lvlFull * clamp(x.mine.fill ?? 1, 0, 1);   // it can only smelt what the miners dig
      const need = x.lvl * def.workers * (x.site ? x.wmult : hasTech(nation, "automation") && def.sector === "secondary" ? 0.7 : 1);
      indWorkers += jobFill(x, need, r.pool);
    }
    r.indWorkers = indWorkers;
  }
  shareSkills(regions, networks);
  for (const r of regions) {
    const net = networks[r.net];
    const avail = poolSum(r.pool), indWorkers = r.indWorkers, unfilled = r.unfilledInd || 0;
    r.publicJobs = r.workforce * (pubShare + (r.city.capital ? JOBS.capital : 0) + r.cm.pubJobs);
    r.svcJobs = (r.workforce * (JOBS.base + JOBS.market * r.market) + JOBS.perIndustry * indWorkers) * (1 - MW.cut) + r.publicJobs;
    r.serviceWorkers = Math.max(0, Math.min(avail, r.svcJobs));
    r.svcTake = takeServices(r.pool, r.serviceWorkers, r.publicJobs);
    // a minimum wage prices some of the lowest-paid jobs out
    r.minwageLost = MW.cut * Math.max(0, r.svcTake.u - (r.svcTake.pub ? r.svcTake.pub.u : 0));
    if (r.minwageLost > 0) { r.svcTake.u -= r.minwageLost; r.serviceWorkers -= r.minwageLost; r.pool.u += r.minwageLost; }
    r.svcSkill = r.serviceWorkers > 1e-6 ? skillIndex(r.svcTake.s / r.serviceWorkers, r.svcTake.e / r.serviceWorkers) : skill;
    r.unemployed = Math.max(0, avail - r.serviceWorkers);
    // in a town cut off from the national market, people without a job farm family plots on the land nobody else farms
    r.smallholders = 0;
    if (!net.capital && r.unemployed > 0) {
      r.smallholders = Math.min(r.unemployed, Math.max(0, r.food - r.foodMade) * laborPerFood);
      r.unemployed -= r.smallholders;
    }
    r.vacancies = Math.max(0, r.svcJobs - Math.max(0, avail)) + unfilled;
    workforce += r.workforce; unemployed += r.unemployed; vacancies += r.vacancies; publicJobs += Math.min(r.publicJobs, r.serviceWorkers);
    pop += r.pop; food += r.food;
    if (r.foodRatio < ECON.famineLine) faminePop += r.pop;
  }

  /* The goods market: what everyone wants at full output, then what can actually be made */
  const demand = {}, supply = {}, imports = {}, exports = {}, sat = {};
  GOOD_ORDER.forEach(k => { demand[k] = 0; supply[k] = 0; imports[k] = 0; exports[k] = 0; sat[k] = 1; });
  const all = regions.flatMap(r => r.ind.map(x => { x.region = r; x.iso = (x.isoFixed ?? (networks[r.net].capital ? (joined.bySea.has(r.city.id) ? 0.95 : 1) : ECON7.isolatedRate)) * (1 - strikeCut(nation, x.kind)); return x; }));
  for (const x of all) {
    const def = INDUSTRIES[x.kind];
    for (const g2 in def.in || {}) demand[g2] += def.in[g2] * x.lvl * x.fill;
    if (def.power) demand.power += def.power * x.lvl * x.fill;
  }
  // households, farms, hospitals, builders and the army
  const health = SERVICE_ORDER.indexOf(laws.services || "basic");
  demand.goods += pop * 0.25 * (1 + 0.6 * skill);
  demand.power += pop * 0.06;
  demand.electronics += pop * 0.03 * skill;
  demand.machinery += regions.reduce((s, r) => s + r.foodMade, 0) * 0.04 + pop * 0.02;
  demand.chemicals += regions.reduce((s, r) => s + r.farmland, 0) * 0.03 + pop * 0.01 * (1 + health);
  const build = (nation && nation.buildAvg) || 0;               // $B a season spent on construction, smoothed
  demand.timber += build * 4 * 0.06; demand.metals += build * 4 * 0.03; demand.machinery += build * 4 * 0.02;
  const arms = (nation && nation.armsAvg) || 0;                 // $B a season spent on equipment, smoothed
  demand.metals += arms * 4 * 0.12; demand.machinery += arms * 4 * 0.06; demand.chemicals += arms * 4 * 0.05; demand.electronics += arms * 4 * 0.02;
  let tanks = 0, wings = 0;
  if (g.divisions) for (const d of g.divisions) if (d.owner === nid && d.type === "arm") tanks++;
  if (g.airwings) for (const a of g.airwings) if (a.owner === nid) wings++;
  const fuelNeed = tanks * 0.12 + wings * 0.1 + (g.sea ? navyOil(g, nid) : 0);
  demand.oil += fuelNeed;

  const produce = (x, rate) => {
    x.rate = rate;
    const def = INDUSTRIES[x.kind];
    if (x.site) {
      const k = SITE_KINDS[x.kind].good;
      x.outUnits = Math.max(0, Math.min(def.out[k] * x.lvl * rate * x.mult, x.capYear * Math.min(1, rate)));
      if (k !== "food") supply[k] += x.outUnits;
      return;
    }
    for (const g2 in def.out || {}) if (g2 !== "food") supply[g2] += def.out[g2] * x.lvl * rate * (def.sector === "secondary" && def.sub === "Energy" && hasTech(nation, "electrify") ? 1.33 : 1) * (def.sub === "Manufacturing" && hasTech(nation, "assembly") ? 1.25 : 1);
  };
  const settle = k => {
    const short = Math.max(0, demand[k] - supply[k]);
    imports[k] = GOODS[k].local ? 0 : Math.min(short, demand[k] * importCapShare);
    sat[k] = demand[k] > 1e-6 ? Math.min(1, (supply[k] + imports[k]) / demand[k]) : 1;
    const surplus = Math.max(0, supply[k] - demand[k]);
    exports[k] = GOODS[k].local ? 0 : Math.min(surplus, Math.max(supply[k], 0.5) * exportCapShare + (k === "gold" ? surplus : 0));
  };
  const inputSat = def => Math.min(1, ...Object.keys(def.in || {}).filter(k => k !== "food").map(k => sat[k]));
  // 1. raw materials
  for (const x of all) if (INDUSTRIES[x.kind].sector === "primary") produce(x, x.fill * x.iso);
  ["timber", "metals", "coal", "oil", "gold"].forEach(settle);
  // 2. power stations
  for (const x of all) if (INDUSTRIES[x.kind].sub === "Energy") produce(x, x.fill * x.iso * inputSat(INDUSTRIES[x.kind]));
  supply.power += WB.power * (hasTech(nation, "electrify") ? 1.33 : 1);
  supply.power *= 1 + modSum(nation, "power");
  settle("power");
  const powerFactor = Math.pow(sat.power, 0.8);
  // 3. factories, then offices
  const foodSurplus = Math.max(0, food - pop);
  for (const x of all) {
    const def = INDUSTRIES[x.kind];
    if (def.sector !== "secondary" || def.sub === "Energy") continue;
    let s = inputSat(def);
    if (def.in && def.in.food) s = Math.min(s, foodSurplus / Math.max(0.01, foodprocWant));
    produce(x, x.fill * x.iso * Math.min(1, s) * powerFactor);
    if (x.kind === "smelter") { x.processed = Math.min(x.lvl * x.rate, x.mine.outUnits || 0); x.mine.smeltShare = (x.mine.outUnits || 0) > 1e-6 ? x.processed / x.mine.outUnits : 0; }
  }
  ["goods", "machinery", "chemicals"].forEach(settle);
  settle("electronics");
  for (const x of all) {
    const def = INDUSTRIES[x.kind];
    if (def.sector !== "tertiary" && def.sector !== "quaternary") continue;
    produce(x, x.fill * x.iso * powerFactor * (def.in ? inputSat(def) : 1));
  }
  demand.food = pop + foodprocLevels * INDUSTRIES.foodproc.in.food + gran.fill * 4;   // the reserve's purchase is bought, not sold abroad
  supply.food = regions.reduce((s, r) => s + r.foodMade, 0) + gran.release * 4;          // grain handed out from the store
  settle("food");

  /* What the sold share of each good is worth to its makers: a glut with no buyers earns little */
  const util = {};
  GOOD_ORDER.forEach(k => { util[k] = supply[k] > 1e-6 ? Math.min(1, (demand[k] + exports[k]) / supply[k]) : 1; });

  /* Value added, by sector and sub-sector */
  const tech = (nation ? nation.tech : 1) * (1 + modSum(nation, "output")) * (1 + labourLaw(laws, "hours").out);
  const levelsOf = k => all.filter(x => x.kind === k).reduce((s, x) => s + x.lvl * (x.rate ?? 0), 0);
  INDUSTRY_ORDER.forEach(k => { levels[k] = levelsOf(k); });
  const efficiency = 1 + Math.min(0.1, 0.02 * levels.business);
  const skillMult = 0.8 + 0.5 * skill;
  const staffNow = publicStaffing(regions);
  const healthMult = 1 + (SERVICE_LAWS[laws.services || "basic"].prod || 0) * ((SERVICE_LAWS[laws.services || "basic"].prod || 0) > 0 ? staffNow.f : 1) * (0.5 + 0.5 * sat.chemicals) * (hasTech(nation, "medicine") ? 1.5 : 1);
  const sectors = { primary: { va: 0, workers: 0 }, secondary: { va: 0, workers: 0 }, tertiary: { va: 0, workers: 0 }, quaternary: { va: 0, workers: 0 } };
  const subs = {};
  const addSub = (sector, sub, va, workers) => {
    sectors[sector].va += va; sectors[sector].workers += workers;
    const key = `${sector}|${sub}`;
    if (!subs[key]) subs[key] = { sector, sub, va: 0, workers: 0 };
    subs[key].va += va; subs[key].workers += workers;
  };
  const atPeace = !(g.wars && g.wars.some(war => war.sideA.includes(nid) || war.sideB.includes(nid)));
  const stab = nation ? nation.stability : 60;
  for (const x of all) {
    const def = INDUSTRIES[x.kind];
    const outKey = Object.keys(def.out || {})[0];
    let u = outKey && outKey !== "food" ? util[outKey] : 1;
    if (x.kind === "resort") u = (atPeace ? 1 : 0.3) * clamp(stab / 60, 0.3, 1.2);
    const importPenalty = Object.keys(def.in || {}).some(k => imports[k] > 0.05 * demand[k]) ? 1 - ECON7.importPremium * 0.5 : 1;
    const va = x.site ? siteVA(g, x, u, skillMult * efficiency * tech * healthMult)
      : x.kind === "smelter" ? (x.processed || 0) * SMELT.vaPerUnit * priceOf(g, "metals") * (util.metals ?? 1) * importPenalty * skillMult * efficiency * tech * healthMult
      : def.workers * x.lvl * (x.rate ?? 0) * def.va * u * importPenalty * skillMult * efficiency * tech * healthMult;
    const vaC = va * x.region.cm.out * (!x.site && def.sector === "secondary" ? x.region.cm.ind : 1) * (x.kind === "resort" ? x.region.cm.resort : 1);
    x.va = vaC;
    x.region.gdp = (x.region.gdp || 0) + vaC;
    addSub(def.sector, def.sub, vaC, x.workers);
  }
  // farms
  for (const r of regions) {
    const va = r.foodMade * ECON7.farmValueB * (1 + 0.5 * mech) * tech * healthMult
      + (r.smallholders || 0) / Math.max(1e-6, laborPerFood) * ECON7.farmValueB * JOBS.smallVA * tech * healthMult;   // family plots: a little food and income
    const vaF = va * r.cm.out;
    r.farmVA = vaF;
    r.gdp = (r.gdp || 0) + vaF;
    addSub("primary", "Agriculture", vaF, r.farmWorkers + (r.smallholders || 0));
  }
  // services: everyone else, as productive as the market, skills and tools around them allow
  const itBoost = Math.min(0.25, 0.04 * levels.techpark) + (hasTech(nation, "computing") ? 0.08 : 0);
  const finLaw = FINANCE_LAWS[laws.finance || "balanced"];
  const goldBoost = supply.gold > 0.1 ? 0.03 : 0;
  const logistics = clamp(0.35 + 0.35 * (1 - regions.filter(r => !networks[r.net].capital).length / regions.length) + (anyPort ? 0.15 : 0) + 0.15 * Math.min(sat.oil, sat.machinery) + WB.logistics, 0, 1);
  const tourism = levels.resort;
  for (const r of regions) {
    const net = networks[r.net];
    const market = 1 - Math.exp(-((net.pop + net.foreign) * (net.capital ? 1 + WB.market : 1)) / ECON.tradeScaleM);
    r.market = market;
    const mult = 1 + 0.45 * market + 0.5 * (r.svcSkill ?? skill) + 0.15 * (sat.goods - 0.5) + itBoost + finLaw.services + goldBoost + 0.12 * (net.port ? 1 : 0) + 0.1 * logistics + WB.finance + (WB.harborCity === r.city.id ? 0.08 : 0) + (WB.tourismCity === r.city.id ? 0.04 : 0) + r.cm.svc;
    r.serviceK = ECON7.serviceK * mult * (0.85 + 0.15 * sat.power) * tech * efficiency * healthMult * (net.capital ? 1 : 0.85) * r.cm.out * r.cm.size;
    const va = r.serviceWorkers * r.serviceK;
    r.svcVA = va;
    r.gdp = (r.gdp || 0) + va;
    // split services into their parts, by what drives each
    const parts = { "Retail and wholesale": 0.3 * (0.5 + sat.goods), "Transport and logistics": 0.18 * (0.5 + logistics), "Finance and banking": 0.08 * (1 + 3 * finLaw.services + 3 * goldBoost),
      "Healthcare": 0.1 * (0.6 + 0.3 * health), "Education": 0.1 * (0.6 + 0.4 * EDU_ORDER.indexOf(laws.education || "basic")), "Government and other services": 0.24 };
    const tot = Object.values(parts).reduce((s, v) => s + v, 0);
    for (const p in parts) addSub("tertiary", p, va * parts[p] / tot, r.serviceWorkers * parts[p] / tot);
    r.outputK = r.gdp / Math.max(0.001, r.pop);
  }
  // construction is counted where it happens
  if (build > 0) addSub("secondary", "Construction", build * 4 * 0.35 * tech, build * 4 * 0.35 / 24);
  // shipping: what your own freighters earn carrying your trade
  if (seaT && seaT.income > 0.001) addSub("tertiary", "Shipping", seaT.income, (seaT.tradeF || 0) * SHIP_TYPES.freighter.crew / 1e6);
  // trade: the cost of what had to be imported, and tariffs collected on it
  let importBill = 0, exportValue = 0;
  GOOD_ORDER.forEach(k => { const pr = GOODS[k].price * priceOf(g, k); importBill += imports[k] * pr; exportValue += exports[k] * pr; });
  let gdp = Object.values(sectors).reduce((s, x) => s + x.va, 0) - importBill * ECON7.importPremium - (seaT ? seaT.fees || 0 : 0);

  const constructionSat = Math.min(sat.timber, (sat.metals + sat.machinery) / 2);
  let roadEdges = 0;
  for (const k of g.roads) { const [a] = edgeEnds(k); if (g.owner[a] === nid) roadEdges++; }
  const isolated = regions.filter(r => !networks[r.net].capital).map(r => r.city);
  const cityResearch = regions.reduce((s, r) => s + (r.cm.learning ? 2 + r.ind.filter(x => x.kind === "university" || x.kind === "techpark").reduce((a, x) => a + x.lvl * (x.rate ?? 0), 0) : 0), 0);
  const research = all.reduce((s, x) => s + (INDUSTRIES[x.kind].research || 0) * x.lvl * (x.rate ?? 0), 0) + cityResearch;
  const armsSat = Math.min(sat.metals, (sat.machinery + sat.chemicals) / 2);
  const people = peopleSummary(nation, regions, all, { gdp, pop, unemployed, sat }, LF, armed);
  return {
    people,
    cities, regions, networks, gdp, pop, food, faminePop, famineShare: faminePop / Math.max(0.001, pop), isolated, roadEdges, area,
    sectors, subs: Object.values(subs), goods: { demand, supply, imports, exports, util }, sat, levels, workers: pop * LF.lf,
    research, mech, fert, logistics, tourism, importBill, exportValue, tariffs: importBill * tradeLaw.tariff,
    constructionIndex: (1 + 0.6 * (1 - constructionSat)) * (1 - Math.min(0.1, 0.02 * levels.business)) * (1 + modSum(nation, "build")) * (hasTrait(nation, "pragmatic") ? 0.95 : 1),
    armsSat, fuelSat: fuelNeed > 0 ? Math.min(1, sat.oil) : 1, healthMult, access, seaAccess, seaLinks: joined.links, bySea: joined.bySea, byRiver: joined.byRiver, freightFees: seaT ? seaT.fees || 0 : 0,
    effects: { goodsSat: sat.goods, powerSat: sat.power },
    workforce, unemployed, unemployment: unemployed / Math.max(1e-6, workforce), vacancies, armed, publicJobs, smallholders: regions.reduce((s, r) => s + (r.smallholders || 0), 0), harvest: harvestFactor(nation),
    granary: { ...gran, turn: g.turn }, lostToIdle: regions.reduce((s, r) => s + (r.unemployed || 0) * (r.serviceK || 0), 0),
    sites: siteList, reach,
    researchMult: 1 + WB.research + modSum(nation, "research"), skillBonus: WB.skill, capitalMult: 1 + WB.capital, interestCut: WB.interest, works: WB,
    programs: regions.reduce((s, r) => s + (r.cm.focus ? focusUpkeepCost(r.cm.focus, r) : 0), 0), seats: regions.filter(r => r.cm.seat).length,
    citySkill: Math.min(0.02, 0.01 * regions.filter(r => r.cm.learning).length), cityResearch,
  };
}

