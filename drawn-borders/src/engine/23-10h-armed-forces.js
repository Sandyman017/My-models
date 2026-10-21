/* =====================================================================
   10h. Armed forces: equipment, factories, divisions, supply, movement, battle
   ===================================================================== */
// Equipment comes out of factories. Money buys it; factory capacity (from output and raw materials) limits how fast.
const EQUIP = {
  kits:   { label: "Infantry weapons", short: "Small arms", unit: "sets", note: "rifles, machine guns, radios and trucks for 1,000 soldiers per set", costB: 0.015, pp: 0.6 },
  guns:   { label: "Artillery",        short: "Guns",       unit: "guns", note: "field, anti-tank and anti-air guns",                         costB: 0.004, pp: 0.1 },
  tanks:  { label: "Tanks",            short: "Tanks",      unit: "tanks", note: "armored fighting vehicles",                                 costB: 0.008, pp: 0.22 },
  planes: { label: "Aircraft",         short: "Aircraft",   unit: "planes", note: "fighters and ground-attack aircraft",                      costB: 0.025, pp: 0.7 },
};
const EQUIP_ORDER = ["kits", "guns", "tanks", "planes"];
const PRIORITY = { off: 0, low: 1, normal: 2, high: 4 };
const PRIORITY_ORDER = ["off", "low", "normal", "high"];

const DIV_TYPES = {
  inf: { label: "Infantry",  men: 15000, kits: 15, guns: 48,  tanks: 0,   attack: 10, defense: 16, breakthrough: 3,  mp: 4, armor: false,
         blurb: "Holds ground. Strong in defense, cheap to equip." },
  art: { label: "Artillery", men: 9000,  kits: 9,  guns: 180, tanks: 0,   attack: 20, defense: 8,  breakthrough: 3,  mp: 3, armor: false,
         blurb: "Breaks entrenched lines. Hits hard, defends poorly." },
  arm: { label: "Armored",   men: 9000,  kits: 9,  guns: 36,  tanks: 250, attack: 26, defense: 10, breakthrough: 20, mp: 7, armor: true,
         blurb: "Breaks through and exploits on open plains. Struggles in forest, hills and mountains, and stalls without fuel." },
};
const DIV_ORDER = ["inf", "art", "arm"];
const AIR = { planes: 100, costB: 0.3 };     // a full air wing; the cost is airfields and crews, the planes come from stock

// Arms production: the share of output spent on equipment, and how much civilian industry is turned over to it.
const ARMS_LAWS = {
  none:   { label: "None",        share: 0,     cap: 0,   stab: 0,  drag: 0 },
  low:    { label: "Low",         share: 0.01,  cap: 0.5, stab: 0,  drag: 0 },
  medium: { label: "Medium",      share: 0.025, cap: 1,   stab: 0,  drag: 0 },
  high:   { label: "High",        share: 0.05,  cap: 1.7, stab: -1, drag: 0.0006 },
  war:    { label: "War economy", share: 0.1,   cap: 3,   stab: -5, drag: 0.002 },
};
const ARMS_ORDER = ["none", "low", "medium", "high", "war"];

const MIL = {
  upkeepK: 60,          // $k per soldier per year
  maintenance: 0.025,   // share of equipment value per season
  raiseK: 20,           // one-off $k per new soldier
  trainSeasons: 2,
  ppPerGdp: 0.22,       // factory capacity per $B of yearly output, at full raw materials and medium arms production
  maxStack: 3,
  maxAttackers: 4,
  supplyRange: 6,        // cells a supply line reaches from a town or road joined to the capital
  isolatedRange: 3,
  menRefill: 0.25,      // share of a division's men that can be replaced per season
  winRatio: 1.15,
  deathShare: 0.4,      // share of casualties who die
};
const MOVE_COST = { [T.PLAINS]: 1, [T.FOREST]: 1.5, [T.HILLS]: 2, [T.MOUNTAIN]: 3 };
const ARMOR_TERRAIN = { [T.PLAINS]: 1, [T.FOREST]: 0.7, [T.HILLS]: 0.6, [T.MOUNTAIN]: 0.4 };
const MIX = {
  militarist:   { inf: 0.45, art: 0.15, arm: 0.40, air: 3 },
  expansionist: { inf: 0.55, art: 0.15, arm: 0.30, air: 2 },
  agrarian:     { inf: 0.65, art: 0.30, arm: 0.05, air: 1 },
  mercantile:   { inf: 0.55, art: 0.20, arm: 0.25, air: 2 },
};
const PROD_DEFAULTS = {
  militarist:   { kits: "normal", guns: "normal", tanks: "high",   planes: "high" },
  expansionist: { kits: "high",   guns: "normal", tanks: "normal", planes: "low" },
  agrarian:     { kits: "high",   guns: "high",   tanks: "low",    planes: "low" },
  mercantile:   { kits: "normal", guns: "normal", tanks: "low",    planes: "high" },
  player:       { kits: "high",   guns: "low",    tanks: "normal", planes: "normal" },
};

function ordinal(k) { const s = ["th", "st", "nd", "rd"], v = k % 100; return k + (s[(v - 20) % 10] || s[v] || s[0]); }
function nextName(n, type) {
  n.divCount = n.divCount || {};
  n.divCount[type] = (n.divCount[type] || 0) + 1;
  return type === "air" ? `${ordinal(n.divCount[type])} Air Wing` : `${ordinal(n.divCount[type])} ${DIV_TYPES[type].label}`;
}

/* ---------- Strength of a division ---------- */
function menFill(d) { return clamp(d.men / DIV_TYPES[d.type].men, 0, 1); }
function equipFill(d) {
  const t = DIV_TYPES[d.type];
  let wsum = 0, v = 0;
  const part = (have, need, wgt) => { if (need > 0) { wsum += wgt; v += wgt * Math.min(1, have / need); } };
  part(d.kits, t.kits, 0.4);
  part(d.guns, t.guns, t.tanks ? 0.15 : 0.6);
  part(d.tanks, t.tanks, 0.45);
  return wsum ? v / wsum : 1;
}
function divCombatValue(d) {
  const t = DIV_TYPES[d.type];
  return ((t.attack + t.defense) / 2) * Math.pow(menFill(d), 0.8) * equipFill(d) * (0.4 + 0.6 * d.org) * expFactor(d) * (d.training ? 0.5 : 1);
}
/* Overall military weight, used by diplomacy: divisions plus air power. */
function armyPower(g, nid) {
  let p = 0;
  for (const d of g.divisions) if (d.owner === nid) p += divCombatValue(d);
  for (const a of g.airwings) if (a.owner === nid) p += a.planes * 0.05;
  return p * 1000;
}

function militarySummary(g, nid) {
  let men = 0, value = 0, planes = 0, divs = 0;
  for (const d of g.divisions) if (d.owner === nid) {
    men += d.men; divs++;
    value += d.kits * EQUIP.kits.costB + d.guns * EQUIP.guns.costB + d.tanks * EQUIP.tanks.costB;
  }
  for (const a of g.airwings) if (a.owner === nid) { planes += a.planes; value += a.planes * EQUIP.planes.costB; }
  return { men, value, planes, divs };
}
function refreshMilitary(g, nid) {
  const n = g.nations[nid];
  n.mil = militarySummary(g, nid);
  n.soldiers = n.mil.men;
}

/* ---------- Factories ---------- */
function industryFill(econ) { return econ.armsSat ?? 1; }
/* Arms factories are converted civilian industry: steel works, chemical plants and electronics count most. */
function productionCapacity(econ, laws) {
  const L = econ.levels || {};
  const base = 0.2 * econ.gdp + 7 * (L.heavy || 0) + 4 * (L.chemical || 0) + 5 * (L.electronics || 0) + 2 * (L.light || 0);
  return base * ARMS_LAWS[(laws && laws.arms) || "low"].cap * (0.6 + 0.4 * (econ.armsSat ?? 1));
}

function armsPlan(n, econ, laws) {
  const budget = (econ.gdp / 4) * ARMS_LAWS[laws.arms || "low"].share;
  const pp = productionCapacity(econ, laws);
  const prio = n.prod || PROD_DEFAULTS.player;
  const units = { kits: 0, guns: 0, tanks: 0, planes: 0 };
  let wsum = 0;
  for (const k of EQUIP_ORDER) wsum += PRIORITY[prio[k]] ?? 2;
  if (budget <= 0 || wsum === 0) return { budget, pp, spend: 0, ppUsed: 0, units, limit: budget <= 0 ? "none" : "priorities" };
  let money = budget, cap = pp, spend = 0, ppUsed = 0;
  for (let pass = 0; pass < 2; pass++) {
    const m0 = money, c0 = cap;
    for (const k of EQUIP_ORDER) {
      const share = (PRIORITY[prio[k]] ?? 2) / wsum;
      if (!share) continue;
      const u = Math.floor(Math.min((m0 * share) / EQUIP[k].costB, (c0 * share) / EQUIP[k].pp));
      if (u <= 0) continue;
      units[k] += u;
      money -= u * EQUIP[k].costB; cap -= u * EQUIP[k].pp;
      spend += u * EQUIP[k].costB; ppUsed += u * EQUIP[k].pp;
    }
  }
  const avionics = 0.4 + 0.6 * ((econ.sat && econ.sat.electronics) ?? 1);
  if (avionics < 0.999) { const cut = units.planes - Math.floor(units.planes * avionics); units.planes -= cut; }
  return { budget, pp, spend, ppUsed, units, limit: spend < budget * 0.9 ? "factories" : "money", avionics };
}

function manpowerCap(n, econ) { return econ.pop * 1e6 * ARMY_LAWS[n.laws.army].share; }
function manpowerFree(n, econ) { return Math.max(0, manpowerCap(n, econ) - (n.mil ? n.mil.men : n.soldiers || 0)); }

/* ---------- Setting up each nation's forces at founding ---------- */
function initMilitary(w, g, n) {
  const econ = computeEconomy(w, g, n.id);
  n.stock = { kits: 6, guns: 60, tanks: 0, planes: 0 };
  n.prod = { ...(PROD_DEFAULTS[n.archetype || "player"]) };
  n.divCount = {};
  n.warPlan = { stance: n.archetype && PERSONALITY[n.archetype].aggression >= 1 ? "offensive" : "defensive" };
  const cities = g.cities.filter(c => c.owner === n.id);
  const capital = cities.find(c => c.capital) || cities[0];
  const men = econ.pop * 1e6 * ARMY_LAWS[n.laws.army].share * 0.7;
  const infCount = clamp(Math.round(men / DIV_TYPES.inf.men), 2, 9);
  const place = k => freeCellNear(w, g, n.id, cities[k % cities.length].cell);
  const add = (type, cell, fill = 1) => {
    const t = DIV_TYPES[type];
    g.divisions.push({ id: g.nextId++, owner: n.id, type, name: nextName(n, type), cell, men: Math.round(t.men * fill), kits: t.kits, guns: Math.round(t.guns * fill), tanks: Math.round(t.tanks * fill),
      org: 1, exp: EXPS.start, entrench: 0.1, path: [], training: 0, supplied: true, auto: true });
  };
  for (let k = 0; k < infCount; k++) add("inf", place(k));
  const extra = { militarist: ["arm", "art"], expansionist: ["arm"], agrarian: ["art"], mercantile: [], player: ["art"] }[n.archetype || "player"];
  extra.forEach((type, k) => add(type, place(k + 1), 0.8));
  const planes = { militarist: 120, expansionist: 60, agrarian: 0, mercantile: 120, player: 60 }[n.archetype || "player"];
  if (planes) g.airwings.push({ id: g.nextId++, owner: n.id, base: capital.id, planes, mission: "support", name: nextName(n, "air") });
  refreshMilitary(g, n.id);
}

/* The nearest cell of our own land, starting from a town, that still has room for another division. */
function freeCellNear(w, g, nid, cell) {
  const seen = new Set([cell]);
  const queue = [cell];
  while (queue.length) {
    const c = queue.shift();
    if (g.owner[c] === nid && stackAt(g, c, nid) < MIL.maxStack) return c;
    for (const k of stepNeighbors(g, c)) if (!seen.has(k) && isLand(w, k) && g.owner[k] === nid) { seen.add(k); queue.push(k); }
  }
  return cell;
}

/* ---------- Raising forces ---------- */
function stackAt(g, cell, nid) { return g.divisions.filter(d => d.cell === cell && (nid === undefined || d.owner === nid)).length; }

function raiseQuote(w, g, nid, type, cityId) {
  const n = g.nations[nid];
  const city = g.cities.find(c => c.id === cityId);
  if (!city || city.owner !== nid || g.occ[city.cell] >= 0) return { ok: false, reason: "Choose one of your own towns that is not occupied." };
  if ((city.loyalty ?? CITY.loyalNative) < CITY.loyalRaise && city.origin !== nid) return { ok: false, reason: `The people of ${city.name} would not serve a government they do not yet see as their own (loyalty ${Math.round(city.loyalty)}). Raise divisions in another town.` };
  const econ = computeEconomy(w, g, nid);
  if (type === "air") {
    if (n.stock.planes < 30) return { ok: false, reason: `You need at least 30 aircraft in stock (you have ${fmtCount(n.stock.planes)}). Raise aircraft production.` };
    return { ok: true, type, cityId, cost: AIR.costB, planes: Math.min(AIR.planes, n.stock.planes), label: `New air wing at ${city.name}` };
  }
  const t = DIV_TYPES[type];
  const free = manpowerFree(n, econ);
  const men = Math.min(t.men, Math.floor(free));
  if (men < t.men * 0.5) return { ok: false, reason: `Not enough manpower: ${fmtCount(free)} available, ${fmtCount(t.men * 0.5)} needed at least. Widen conscription or wait for your population to grow.` };
  if (stackAt(g, city.cell, nid) >= MIL.maxStack) return { ok: false, reason: `${city.name} already holds ${MIL.maxStack} divisions. Move one out first.` };
  const take = k => Math.min(t[k], Math.floor(n.stock[k]));
  const q = { ok: true, type, cityId, men, kits: take("kits"), guns: take("guns"), tanks: take("tanks"), cost: (men * MIL.raiseK) / 1e6, label: `New ${t.label.toLowerCase()} division at ${city.name}` };
  q.fill = equipFill({ type, kits: q.kits, guns: q.guns, tanks: q.tanks });
  return q;
}

function raiseForce(g, nid, q) {
  const n = g.nations[nid];
  const city = g.cities.find(c => c.id === q.cityId);
  n.treasury -= q.cost;
  if (q.type === "air") {
    n.stock.planes -= q.planes;
    const wing = { id: g.nextId++, owner: nid, base: q.cityId, planes: q.planes, mission: "support", name: nextName(n, "air") };
    g.airwings.push(wing);
    refreshMilitary(g, nid);
    return wing;
  }
  n.stock.kits -= q.kits; n.stock.guns -= q.guns; n.stock.tanks -= q.tanks;
  const d = { id: g.nextId++, owner: nid, type: q.type, name: nextName(n, q.type), cell: city.cell, men: q.men, kits: q.kits, guns: q.guns, tanks: q.tanks,
    org: 0.3, exp: 0, entrench: 0, path: [], training: MIL.trainSeasons, supplied: true, auto: true };
  g.divisions.push(d);
  refreshMilitary(g, nid);
  return d;
}

function disbandDivision(g, d) {
  const n = g.nations[d.owner];
  n.stock.kits += d.kits; n.stock.guns += d.guns; n.stock.tanks += d.tanks;
  g.divisions = g.divisions.filter(x => x !== d);
  refreshMilitary(g, d.owner);
}

/* ---------- Supply: armies live on what reaches them from towns and roads ---------- */
function friendlyTo(g, nid) { const s = new Set(alliesOf(g, nid)); s.add(nid); return s; }

function supplyMap(w, g, nid, noSea) {
  const rem = new Int8Array(N_CELLS).fill(-1);
  const friends = friendlyTo(g, nid);
  const passable = i => isLand(w, i) && (friends.has(controller(g, i)) || (g.owner[i] === -1 && g.occ[i] < 0));
  const econ = computeEconomy(w, g, nid);
  const buckets = Array.from({ length: MIL.supplyRange + 1 }, () => []);
  const reach = MIL.supplyRange + ((g.nations[nid].logistics ?? 0) >= 0.75 ? 1 : 0);
  if (buckets.length < reach + 1) buckets.push([]);
  const seed = (cell, r) => { r = Math.min(r, reach); if (rem[cell] < r) { rem[cell] = r; buckets[r].push(cell); } };
  const capNet = econ.networks.findIndex(x => x.capital);
  econ.regions.forEach(r => seed(r.city.cell, r.net === capNet ? reach : MIL.isolatedRange));
  for (const c of g.cities) if (g.occ[c.cell] === nid) seed(c.cell, MIL.isolatedRange + 1);   // captured towns become depots
  if (!noSea && g.sea) for (const src of seaSupplySources(w, g, nid, econ)) seed(src.cell, src.range);   // ports and beachheads supplied by sea
  const capital = econ.regions.find(r => r.city.capital);
  if (capital) {
    const adj = new Map();
    for (const k of g.roads) {
      const [a, b] = edgeEnds(k);
      if (controller(g, a) !== nid || controller(g, b) !== nid) continue;
      if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b); adj.get(b).push(a);
    }
    const seen = new Set([capital.city.cell]);
    const queue = [capital.city.cell];
    while (queue.length) {
      const c = queue.pop();
      seed(c, reach);
      for (const nb of adj.get(c) || []) if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
    }
  }
  for (let r = reach; r > 0; r--) {
    for (const c of buckets[r]) {
      if (rem[c] !== r) continue;
      for (const [dx, dy] of DIRS4) {
        const x = cellX(c) + dx, y = cellY(c) + dy;
        if (!inBounds(x, y)) continue;
        const k = idx(x, y);
        if (passable(k)) seed(k, r - 1);
      }
    }
  }
  const sup = new Uint8Array(N_CELLS);
  for (let i = 0; i < N_CELLS; i++) if (rem[i] >= 0) sup[i] = 1;
  return sup;
}

/* ---------- Movement ---------- */
function canEnter(w, g, nid, cell) {
  if (!isLand(w, cell)) return false;
  const c = controller(g, cell);
  if (c === -1 || c === nid) return true;
  if (alliesOf(g, nid).includes(c)) return true;
  return atWar(g, nid, c);
}
function roadNeighbors(g, cell) {
  const out = [];
  for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = cellX(cell) + dx, y = cellY(cell) + dy;
    if (!inBounds(x, y)) continue;
    const k = idx(x, y);
    if (g.roads.has(edgeKey(cell, k))) out.push(k);
  }
  return out;
}
function stepNeighbors(g, cell) {
  const out = [];
  for (const [dx, dy] of DIRS4) {
    const x = cellX(cell) + dx, y = cellY(cell) + dy;
    if (inBounds(x, y)) out.push(idx(x, y));
  }
  return out.concat(roadNeighbors(g, cell));
}
function moveCost(w, g, type, from, to, nid) {
  if (g.roads.has(edgeKey(from, to)) && controller(g, from) === controller(g, to)) return 0.5;
  const sw = seasonWar(g), tt = w.terrain[to];
  let c = MOVE_COST[tt] + ((tt === T.HILLS || tt === T.MOUNTAIN ? sw.rugged : sw.offRoad) || 0);   // mud and snow off the roads
  if (DIV_TYPES[type].armor && tt !== T.PLAINS) c *= 1.5;
  if (DIV_TYPES[type].armor && sw.armorMove) c *= sw.armorMove;
  // rivers without a bridge (a road) take time to cross, unless winter has frozen them over
  const rv = g.roads.has(edgeKey(from, to)) ? null : riverBetween(w, from, to);
  if (rv && !(sw.frozen && rv.cls < 4)) c += rv.cls >= 4 ? 1.5 : 1;
  const ctl = controller(g, to);
  if (ctl >= 0 && ctl !== nid && !alliesOf(g, nid).includes(ctl)) c += 0.5;
  return c;
}
/* A small binary heap keyed by cost, for path searches. */
function heapPush(h, cell, pri) {
  h.push([pri, cell]);
  let i = h.length - 1;
  while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
}
function heapPop(h) {
  const top = h[0], last = h.pop();
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < h.length && h[l][0] < h[m][0]) m = l;
      if (r < h.length && h[r][0] < h[m][0]) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]]; i = m;
    }
  }
  return top[1];
}
function findDivPath(w, g, d, target) {
  if (d.cell === target || !canEnter(w, g, d.owner, target)) return null;
  const cost = new Float32Array(N_CELLS).fill(Infinity);
  const prev = new Int32Array(N_CELLS).fill(-1);
  const done = new Uint8Array(N_CELLS);
  const enterable = new Map();
  const ok = k => { if (!enterable.has(k)) enterable.set(k, canEnter(w, g, d.owner, k)); return enterable.get(k); };
  cost[d.cell] = 0;
  const open = [];
  heapPush(open, d.cell, 0);
  while (open.length) {
    const c = heapPop(open);
    if (done[c]) continue;
    done[c] = 1;
    if (c === target) break;
    for (const k of stepNeighbors(g, c)) {
      if (done[k] || !ok(k)) continue;
      const nc = cost[c] + moveCost(w, g, d.type, c, k, d.owner);
      if (nc < cost[k]) { cost[k] = nc; prev[k] = c; heapPush(open, k, nc); }
    }
  }
  if (cost[target] === Infinity) return null;
  const path = [];
  for (let c = target; c !== d.cell; c = prev[c]) path.push(c);
  path.reverse();
  return { path, cost: cost[target], seasons: Math.max(1, Math.ceil(cost[target] / DIV_TYPES[d.type].mp)) };
}

function divIndex(g) {
  const m = new Map();
  for (const d of g.divisions) { if (!m.has(d.cell)) m.set(d.cell, []); m.get(d.cell).push(d); }
  return m;
}
function enemyDivAdjacent(g, index, cell, nid) {
  for (const k of stepNeighbors(g, cell)) for (const e of index.get(k) || []) if (atWar(g, e.owner, nid)) return true;
  return false;
}

function occupyCell(g, cell, nid, news) {
  const owner = g.owner[cell];
  const before = controller(g, cell);
  if (owner === nid || (owner >= 0 && alliesOf(g, nid).includes(owner))) g.occ[cell] = -1;
  else g.occ[cell] = nid;
  g._contact = null;
  bumpWorld(g);
  recOcc(g, cell);
  const city = g.cities.find(c => c.cell === cell);
  if (city && before !== controller(g, cell) && news) {
    news.push(owner === nid ? `The ${nameOf(g, nid)} retook ${city.name}.` : `The ${nameOf(g, nid)} captured ${city.name} from the ${nameOf(g, owner)}.`);
    const wing = g.airwings.filter(a => a.base === city.id && a.owner === owner);
    wing.forEach(a => rebaseWing(g, a));
  }
}
function rebaseWing(g, a) {
  const home = g.cities.filter(c => c.owner === a.owner && g.occ[c.cell] < 0).sort((x, y) => (y.capital ? 1 : 0) - (x.capital ? 1 : 0))[0];
  if (home) a.base = home.id; else g.airwings = g.airwings.filter(x => x !== a);
}

/* ---------- Air power ---------- */
function theaterPlanes(g, nid) {
  const n = g.nations[nid];
  return g.airwings.filter(a => a.owner === nid && a.mission === "support").reduce((s, a) => s + a.planes, 0) * (hasTech(n, "jets") ? 1.4 : 1) * (0.5 + 0.5 * ((n && n.fuelSat) ?? 1));
}
function airBalance(g, a, b) {
  const pa = theaterPlanes(g, a), pb = theaterPlanes(g, b);
  if (pa + pb < 1) return 0;
  return (pa - pb) / (pa + pb);
}

/* ---------- Battle ---------- */
function battlePower(w, g, d, role, cell, sideSupplied) {
  const t = DIV_TYPES[d.type];
  const terrain = w.terrain[cell];
  const owner = g.nations[d.owner];
  let v = (role === "att" ? t.attack : t.defense) * Math.pow(menFill(d), 0.8) * equipFill(d) * (0.25 + 0.75 * d.org) * expFactor(d);
  if (hasTech(owner, "combined")) v *= 1.1;
  if (t.armor) v *= 0.5 + 0.5 * (owner.fuelSat ?? 1);
  if (!sideSupplied) v *= 0.6;
  if (d.training) v *= 0.5;
  if (role === "att") {
    if (t.armor) v *= ARMOR_TERRAIN[terrain];
    if (terrain === T.PLAINS) v += t.breakthrough * 0.5 * menFill(d) * equipFill(d);
  } else {
    v *= 1 + d.entrench;
  }
  return v * 1000;
}

function resolveBattle(w, g, cell, attackers, defenders, rng, sup, opts) {
  const A = attackers[0].owner, D = defenders[0].owner;
  const lines = [];
  const terrain = w.terrain[cell];
  const city = g.cities.find(c => c.cell === cell);
  let pa = 0, pd = 0;
  let paDry = 0, crossing = null;
  attackers.forEach(d => {
    const v = battlePower(w, g, d, "att", cell, sup[d.owner][d.cell]);
    paDry += v;
    const rv = opts && opts.landing ? null : riverBetween(w, d.cell, cell);
    if (!rv) { pa += v; return; }
    const road = g.roads.has(edgeKey(d.cell, cell));
    const ice = !road && seasonWar(g).frozen && rv.cls < 4;
    const m = road ? 0.9 : ice ? 0.95 : rv.cls >= 4 ? 0.65 : 0.75;
    if (!crossing || m < crossing.m) crossing = { rv, m, road, ice };
    pa += v * m;
  });
  defenders.forEach(d => { pd += battlePower(w, g, d, "def", cell, sup[d.owner][cell]); });
  const cdm = city ? cityDefMult(city) : 1;
  const terr = TERRAIN_DEF[terrain] * cdm;
  if (terr > 1.01) lines.push({ label: city ? `${TERRAIN[terrain].name} and the streets of ${city.name}${city.pop >= 1 ? ` (${fmtPeople(city.pop)} people)` : ""} favor the defender` : `${TERRAIN[terrain].name} favor the defender`, mult: Math.round(terr * 100) / 100, side: "def" });
  pd *= terr;
  if (g.owner[cell] === D && g.occ[cell] < 0) {
    const home = 0.85 + g.nations[D].defense / 200;
    if (Math.abs(home - 1) > 0.02) lines.push({ label: home > 1 ? "Defenders know this ground (good defensive borders)" : "Exposed borders weaken the defense", mult: home, side: "def" });
    pd *= home;
  }
  if (fortHere(g, cell, D)) { lines.push({ label: "The Line of Fortresses", mult: 1.3, side: "def" }); pd *= 1.3; }
  for (const L of cityBattleLines(g, city, A, D)) { lines.push(L); pd *= L.mult; }
  if (crossing && paDry > 0) lines.push({ label: crossing.road ? `Fighting over the bridges on ${riverLabel(crossing.rv)}` : crossing.ice ? `Crossing ${riverLabel(crossing.rv)} on the ice` : `Attacking across ${riverLabel(crossing.rv)}`, mult: Math.round((pa / paDry) * 100) / 100, already: true, side: "att" });
  if (opts && opts.landing) {
    pa *= 0.5; lines.push({ label: "Landing from the sea: troops wade ashore under fire", mult: 0.5, side: "att" });
    const k = opts.landing.cruisers || 0;
    if (k > 0) { const m = Math.min(1.3, 1 + 0.08 * k); pa *= m; lines.push({ label: `Naval gunfire from ${k} cruiser${k > 1 ? "s" : ""}`, mult: m, side: "att" }); }
    if (city && portLevel(city) >= 3 && controller(g, city.cell) === D) { pd *= 1.3; lines.push({ label: `Shore batteries of the naval base at ${city.name}`, mult: 1.3, side: "def" }); }
  }
  if (hasTrait(g.nations[D], "cautious")) { lines.push({ label: `${leaderName(g.nations[D])} is a careful commander`, mult: 1.1, side: "def" }); pd *= 1.1; }
  if (hasTrait(g.nations[A], "aggressive")) { lines.push({ label: `${leaderName(g.nations[A])} demands the attack`, mult: 1.1, side: "att" }); pa *= 1.1; }
  const dug = defenders.reduce((s, d) => s + d.entrench, 0) / defenders.length;
  if (dug > 0.05) lines.push({ label: `Defenders were dug in`, mult: 1 + dug, already: true, side: "def" });
  if (attackers.some(d => DIV_TYPES[d.type].armor) && terrain !== T.PLAINS) lines.push({ label: `Tanks slowed by ${TERRAIN[terrain].name.toLowerCase()}`, mult: ARMOR_TERRAIN[terrain], already: true, side: "att" });
  if (attackers.some(d => DIV_TYPES[d.type].armor) && terrain === T.PLAINS) lines.push({ label: "Open plains let the tanks break through", mult: 1.15, already: true, side: "att" });
  const attOut = attackers.filter(d => !sup[d.owner][d.cell]).length, defOut = defenders.filter(d => !sup[d.owner][cell]).length;
  if (attOut) lines.push({ label: `${attOut === attackers.length ? "Attackers" : "Some attackers"} out of supply`, mult: 0.6, already: true, side: "att" });
  if (defOut) lines.push({ label: `${defOut === defenders.length ? "Defenders" : "Some defenders"} out of supply`, mult: 0.6, already: true, side: "def" });
  const sides = new Set(attackers.map(d => d.cell)).size;
  if (sides >= 2) { const m = sides >= 3 ? 1.2 : 1.1; pa *= m; lines.push({ label: `Attacked from ${sides} sides`, mult: m, side: "att" }); }
  const hasArmor = attackers.some(d => DIV_TYPES[d.type].armor);
  const atGuns = defenders.reduce((s, d) => s + d.guns, 0) / Math.max(1, defenders.reduce((s, d) => s + d.men, 0) / 1000);
  if (hasArmor && atGuns < 3) { pa *= 1.2; lines.push({ label: "Defenders lack anti-tank guns", mult: 1.2, side: "att" }); }
  const air = airBalance(g, A, D);
  if (Math.abs(air) > 0.1) {
    const m = 1 + 0.25 * Math.abs(air);
    if (air > 0) pa *= m; else pd *= m;
    lines.push({ label: `Air superiority: ${air > 0 ? `the ${nameOf(g, A)}` : `the ${nameOf(g, D)}`}`, mult: m, side: air > 0 ? "att" : "def" });
  }
  // the season: snow and frost, mud for the tanks, winter seas for a landing
  const sw = seasonWar(g);
  if (sw.attack && !(opts && opts.landing)) {
    const rugged = terrain === T.HILLS || terrain === T.MOUNTAIN;
    const m = rugged ? sw.ruggedAttack : sw.attack;
    pa *= m;
    lines.push({ label: rugged ? `Winter in the ${terrain === T.MOUNTAIN ? "mountains" : "hills"}: attacking through deep snow` : "Winter: attacking through snow and frost", mult: m, side: "att" });
  }
  if (sw.armorAttack && attackers.some(d => DIV_TYPES[d.type].armor)) {
    const armorPow = attackers.filter(d => DIV_TYPES[d.type].armor).reduce((s2, d) => s2 + battlePower(w, g, d, "att", cell, sup[d.owner][d.cell]), 0);
    const m = 1 - (armorPow / Math.max(1, paDry)) * (1 - sw.armorAttack);
    if (m < 0.995) { pa *= m; lines.push({ label: `${sw.name}: the tanks bog down in the mud`, mult: Math.round(m * 100) / 100, side: "att" }); }
  }
  if (opts && opts.landing && sw.landing) { pa *= sw.landing; lines.push({ label: "Winter seas: waves swamp the landing craft", mult: sw.landing, side: "att" }); }
  // veterans and green troops
  for (const L of [sideExpLine(attackers, "att"), sideExpLine(defenders, "def")]) if (L) lines.push(L);
  const luck = 0.85 + 0.3 * rng();
  const R = (pa * luck) / Math.max(1, pd);
  const won = R >= MIL.winRatio;
  const lossA = clamp(0.05 / Math.sqrt(R), 0.012, 0.22), lossD = clamp(0.045 * Math.sqrt(R) * (won ? 1.3 : 1), 0.01, 0.3);
  const report = {
    cell, turn: g.turn, town: city ? city.name : null, terrain: TERRAIN[terrain].name, attacker: A, defender: D,
    attDivs: attackers.map(d => d.name), defDivs: defenders.map(d => d.name), ratio: Math.round(R * 100) / 100, won, lines,
    attPower: Math.round(pa), defPower: Math.round(pd), losses: {}, destroyed: [], retreated: [],
  };
  const apply = (list, frac, side) => {
    let men = 0, tanks = 0;
    for (const d of list) {
      const armorShield = DIV_TYPES[d.type].armor && side === "att" ? 0.7 : 1;
      const m = Math.round(d.men * frac);
      const tk = Math.round(d.tanks * frac * (side === "att" && atGuns > 6 ? 1.4 : armorShield));
      d.men -= m; d.tanks -= tk;
      d.kits = Math.max(0, d.kits - (m / 1000) * 0.9);
      d.guns = Math.max(0, Math.round(d.guns - d.guns * frac * 0.7));
      d.org = clamp(d.org - (side === "att" ? (won ? 0.2 : 0.45) / Math.sqrt(R) : 0.3 * Math.sqrt(R)), 0, 1);
      const wonIt = (side === "att") === won;
      d.fought = g.turn;
      d.exp = Math.min(1, (d.exp || 0) + (wonIt ? EXPS.win : EXPS.loss));
      d.battles = (d.battles || 0) + 1;
      if (wonIt) d.wins = (d.wins || 0) + 1;
      men += m; tanks += tk;
    }
    return { men, tanks };
  };
  report.losses[A] = apply(attackers, lossA, "att");
  report.losses[D] = apply(defenders, lossD, "def");
  return report;
}

function retreatCell(w, g, index, d, from, enemyNid) {
  const friends = friendlyTo(g, d.owner);
  let best = -1, bestScore = -Infinity;
  for (const k of stepNeighbors(g, from)) {
    if (!isLand(w, k) || !friends.has(controller(g, k))) continue;
    const here = index.get(k) || [];
    if (here.some(e => e.owner !== d.owner && atWar(g, e.owner, d.owner))) continue;
    if (here.filter(e => e.owner === d.owner).length >= MIL.maxStack) continue;
    const enemyNear = stepNeighbors(g, k).some(j => (index.get(j) || []).some(e => e.owner === enemyNid));
    const s = (g.cities.some(c => c.cell === k) ? 2 : 0) - (enemyNear ? 3 : 0) + rngless(k);
    if (s > bestScore) { bestScore = s; best = k; }
  }
  return best;
}
function rngless(k) { return hash2(k, 7, 3) * 0.5; }

/* While a season is simulated for playback, movements and captures are recorded here (see section 17b). */
let REC = null;
function recMove(d, from, to) { if (REC) REC.events.push({ t: "move", id: d.id, from, to, phase: REC.phase, step: REC.step }); }
function recOcc(g, cell) { if (REC) REC.events.push({ t: "occ", cell, occ: g.occ[cell], phase: REC.phase, step: REC.phase === "sweep" ? REC.sweep++ : REC.step }); }

function moveDivTo(index, d, cell) {
  recMove(d, d.cell, cell);
  const arr = index.get(d.cell);
  if (arr) index.set(d.cell, arr.filter(x => x !== d));
  d.cell = cell;
  if (!index.has(cell)) index.set(cell, []);
  index.get(cell).push(d);
}

function removePopulationLoss(g, nid, deaths) {
  if (deaths <= 0) return;
  const pop = nationPop(g, nid) * 1e6;
  if (pop <= 0) return;
  if (g.nations[nid] && g.nations[nid].popFlow) g.nations[nid].popFlow.war -= Math.min(deaths, pop) / 1e6;
  const f = Math.max(0, 1 - deaths / pop);
  for (let i = 0; i < N_CELLS; i++) if (g.owner[i] === nid && g.occ[i] < 0) g.pop[i] *= f;
}

/* One season of military operations for the whole world. */
function resolveMilitary(g, w, rng) {
  const news = [], reports = [];
  for (const n of g.nations) n.lastLosses = 0;
  const live = liveNations(g);
  const sup = {};
  for (const n of live) sup[n.id] = supplyMap(w, g, n.id);
  const index = divIndex(g);
  for (const d of g.divisions) {
    d.supplied = !!(sup[d.owner] && sup[d.owner][d.cell]);
    const t = DIV_TYPES[d.type];
    d.mpLeft = d.training || d.sailed === g.turn || (d.voyage && d.voyage.loading) ? 0 : t.armor && !d.supplied ? 1 : t.mp * (d.org < 0.2 ? 0.5 : 1) * (t.armor ? 0.5 + 0.5 * (g.nations[d.owner].fuelSat ?? 1) : 1);
    d.fullMp = d.mpLeft;
    d.engaged = false; d.moved = d.sailed === g.turn;
  }

  // Movement in small steps so armies on both sides move at the same time.
  const attacks = new Map();
  const movers = g.divisions.filter(d => d.path && d.path.length && d.mpLeft > 0);
  if (REC) REC.phase = "move";
  for (let step = 0; step < 14; step++) {
    if (REC) REC.step = step;
    let any = false;
    const order = movers.slice().sort(() => rng() - 0.5);
    for (const d of order) {
      if (!d.path.length || d.mpLeft <= 0 || d.engaged) continue;
      const next = d.path[0];
      if (!canEnter(w, g, d.owner, next)) { d.path = []; continue; }
      const cost = moveCost(w, g, d.type, d.cell, next, d.owner);
      if (cost > d.mpLeft + 1e-6 && d.mpLeft < d.fullMp) { d.mpLeft = 0; continue; }
      const here = index.get(next) || [];
      const foes = here.filter(e => e.owner !== d.owner && atWar(g, e.owner, d.owner));
      if (foes.length) {
        if (!attacks.has(next)) attacks.set(next, []);
        attacks.get(next).push(d);
        d.engaged = true; d.mpLeft = 0; any = true;
        continue;
      }
      if (here.filter(e => e.owner === d.owner).length >= MIL.maxStack) { d.mpLeft = 0; continue; }
      moveDivTo(index, d, next);
      d.path.shift();
      d.mpLeft -= cost; d.moved = true; d.entrench = 0; any = true;
      const ctl = controller(g, next);
      if (ctl !== d.owner && (ctl === -1 ? false : atWar(g, ctl, d.owner) || g.owner[next] === d.owner)) occupyCell(g, next, d.owner, news);
      if (enemyDivAdjacent(g, index, next, d.owner)) d.mpLeft = 0;
    }
    if (!any) break;
  }

  // Battles
  const cells = [...attacks.keys()].sort(() => rng() - 0.5);
  if (REC) { REC.phase = "battle"; REC.step = -1; }
  for (const cell of cells) {
    const byOwner = new Map();
    for (const d of attacks.get(cell)) { if (!byOwner.has(d.owner)) byOwner.set(d.owner, []); byOwner.get(d.owner).push(d); }
    for (const [owner, list] of byOwner) {
      const att = list.filter(d => d.men > 0).sort((a, b) => divCombatValue(b) - divCombatValue(a)).slice(0, MIL.maxAttackers);
      const def = (index.get(cell) || []).filter(e => e.owner !== owner && atWar(g, e.owner, owner));
      if (!att.length) continue;
      if (REC) REC.step++;
      if (!def.length) {
        if ((index.get(cell) || []).filter(e => e.owner === owner).length < MIL.maxStack && canEnter(w, g, owner, cell)) {
          const lead = att[0];
          moveDivTo(index, lead, cell); lead.path.shift(); lead.moved = true; lead.entrench = 0;
          occupyCell(g, cell, owner, news);
        }
        continue;
      }
      const r = resolveBattle(w, g, cell, att, def, rng, sup);
      if (REC) {
        REC.events.push({ t: "battle", cell, attacker: r.attacker, defender: r.defender, won: r.won, phase: "battle", step: REC.step });
        for (const d of att) REC.events.push({ t: "engage", id: d.id, from: d.cell, to: cell, phase: "battle", step: REC.step });
      }
      if (r.won) {
        for (const d of def) {
          const to = retreatCell(w, g, index, d, cell, owner);
          if (to < 0) { r.destroyed.push(d.name); d.men = 0; if (REC) REC.events.push({ t: "destroy", id: d.id, phase: "battle", step: REC.step }); }
          else { moveDivTo(index, d, to); d.path = []; d.voyage = null; d.entrench = 0; r.retreated.push(d.name); }
        }
        const lead = att[0];
        if (canEnter(w, g, owner, cell)) {
          moveDivTo(index, lead, cell); lead.path.shift(); lead.moved = true; lead.entrench = 0;
          occupyCell(g, cell, owner, news);
        }
      } else att.forEach(d => { d.path = []; });
      for (const nid of [r.attacker, r.defender]) {
        const l = r.losses[nid];
        g.nations[nid].lastLosses += l.men;
        const nn = g.nations[nid];
        removePopulationLoss(g, nid, l.men * MIL.deathShare * (hasTech(nn, "medicine") ? 0.75 : 1) * (1 - 0.05 * SERVICE_ORDER.indexOf(nn.laws.services)));
      }
      reports.push(r);
    }
  }
  for (const d of g.divisions) if (d.men <= 0) {
    const r = reports.find(x => x.destroyed.includes(d.name) && (x.defender === d.owner));
    if (!r) news.push(`The ${nameOf(g, d.owner)}'s ${d.name} was destroyed.`);
  }
  g.divisions = g.divisions.filter(d => d.men > 300);
  const fresh = divIndex(g);
  if (REC) { REC.phase = "sweep"; REC.sweep = 0; }

  // Armies take control of undefended ground next to them.
  for (const d of g.divisions) {
    if (d.training || !d.supplied) continue;
    let swept = 0;
    for (const k of stepNeighbors(g, d.cell)) {
      if (swept >= 3) break;
      const ctl = controller(g, k);
      if (ctl < 0 || ctl === d.owner || !atWar(g, ctl, d.owner) && g.owner[k] !== d.owner) continue;
      if (g.owner[k] === d.owner && g.occ[k] < 0) continue;
      if (g.cities.some(c => c.cell === k)) continue;
      if ((fresh.get(k) || []).length || enemyDivAdjacent(g, fresh, k, d.owner)) continue;
      occupyCell(g, k, d.owner, null);
      swept++;
    }
  }

  if (REC) REC.phase = "after";
  // Supply, attrition, recovery
  for (const n of liveNations(g)) sup[n.id] = supplyMap(w, g, n.id);
  const sw = seasonWar(g);
  for (const d of g.divisions) {
    d.supplied = !!(sup[d.owner] && sup[d.owner][d.cell]);
    if (d.training) { d.training--; d.org = Math.min(1, d.org + 0.3); d.exp = Math.min(EXPS.trainCap, (d.exp || 0) + EXPS.train); continue; }
    if (!d.supplied) {
      const loss = Math.round(d.men * 0.04 * (sw.frost || 1));
      d.men -= loss; d.org = Math.max(0, d.org - 0.25);
      g.nations[d.owner].lastLosses += loss;
    } else {
      if (!d.engaged) d.org = Math.min(1, d.org + 0.3);
      if (sw.mountainFrost && w.terrain[d.cell] === T.MOUNTAIN) { const loss = Math.round(d.men * sw.mountainFrost); d.men -= loss; g.nations[d.owner].lastLosses += loss; }
      if (!d.engaged && d.fought !== g.turn && (d.exp || 0) < drillCapFor(g.nations[d.owner])) d.exp = Math.min(drillCapFor(g.nations[d.owner]), (d.exp || 0) + EXPS.drill);   // drill between battles
    }
    if (!d.moved && !d.engaged) d.entrench = Math.min(0.3, d.entrench + 0.1);
  }

  // Air war: fighters duel wherever both sides fly; dominance wears down enemy divisions.
  for (const war of g.wars) for (const a of war.sideA) for (const b of war.sideB) {
    const pa = theaterPlanes(g, a), pb = theaterPlanes(g, b);
    if (pa > 0 && pb > 0) {
      const la = 0.06 * (pb / (pa + pb)), lb = 0.06 * (pa / (pa + pb));
      g.airwings.forEach(x => { if (x.owner === a && x.mission === "support") x.planes = Math.round(x.planes * (1 - la)); if (x.owner === b && x.mission === "support") x.planes = Math.round(x.planes * (1 - lb)); });
    }
    const bal = airBalance(g, a, b);
    if (Math.abs(bal) > 0.3) {
      const victim = bal > 0 ? b : a;
      g.divisions.forEach(d => { if (d.owner === victim && enemyDivAdjacent(g, fresh, d.cell, victim)) d.org = Math.max(0, d.org - 0.08 * Math.abs(bal)); });
    }
  }
  g.airwings = g.airwings.filter(x => x.planes >= 5);

  for (const n of liveNations(g)) {
    refreshMilitary(g, n.id);
    n.recentLosses = Math.round((n.recentLosses || 0) * 0.6 + n.lastLosses);
  }
  for (const war of g.wars) war.score = warScore(g, war);
  g.battles = reports.slice(-40);
  return { news, reports };
}

/* ---------- Reinforcement and production each season ---------- */
function reinforce(g, w, n, econ) {
  const sup = supplyMap(w, g, n.id);
  let pool = manpowerFree(n, econ);
  const index = divIndex(g);
  const mine = g.divisions.filter(d => d.owner === n.id).sort((a, b) => (enemyDivAdjacent(g, index, b.cell, n.id) ? 1 : 0) - (enemyDivAdjacent(g, index, a.cell, n.id) ? 1 : 0));
  for (const d of mine) {
    if (!sup[d.cell]) continue;
    const t = DIV_TYPES[d.type];
    const add = Math.floor(Math.max(0, Math.min(t.men - d.men, pool, t.men * MIL.menRefill)));
    if (add > 0) d.exp = ((d.exp || 0) * d.men + EXPS.recruit * add) / (d.men + add);   // replacements arrive green
    d.men += add; pool -= add;
    for (const k of ["kits", "guns", "tanks"]) {
      const give = Math.max(0, Math.min(t[k] - d[k], n.stock[k]));
      d[k] += give; n.stock[k] -= give;
    }
  }
  for (const a of g.airwings) if (a.owner === n.id) {
    const give = Math.max(0, Math.min(AIR.planes - a.planes, n.stock.planes));
    a.planes += give; n.stock.planes -= give;
  }
  refreshMilitary(g, n.id);
}

/* Divisions left on foreign soil after a peace go home. */
function mayStand(g, nid, cell) {
  const c = controller(g, cell);
  return c === -1 || c === nid || alliesOf(g, nid).includes(c) || atWar(g, nid, c);
}
function sendHome(g) {
  for (const d of g.divisions) {
    if (mayStand(g, d.owner, d.cell)) continue;
    const home = g.cities.filter(c => c.owner === d.owner && g.occ[c.cell] < 0).sort((a, b) => dist(a.cell, d.cell) - dist(b.cell, d.cell))[0];
    if (home) { d.cell = home.cell; d.path = []; d.voyage = null; } else d.men = 0;
  }
  g.divisions = g.divisions.filter(d => d.men > 0);
  for (const a of g.airwings) { const base = g.cities.find(c => c.id === a.base); if (!base || base.owner !== a.owner) rebaseWing(g, a); }
}

