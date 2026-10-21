/* =====================================================================
   10i. Generals: how rival commanders (and yours, if you delegate) use their forces
   ===================================================================== */
function estPower(w, g, d, role, cell) {
  return battlePower(w, g, d, role, cell, d.supplied !== false) * (role === "def" ? TERRAIN_DEF[w.terrain[cell]] * cityAtCellDef(g, cell) : seasonAttackMult(w, g, d, cell));
}

function planOperations(w, g, n) {
  const mine = g.divisions.filter(d => d.owner === n.id && !d.training && !d.voyage && (!n.isPlayer || d.auto));
  if (!mine.length) return;
  const enemies = enemiesOf(g, n.id);
  if (!enemies.length) { planGarrisons(w, g, n, mine); return; }
  const stance = (n.warPlan && n.warPlan.stance) || "defensive";
  const index = divIndex(g);
  const sup = supplyMap(w, g, n.id);
  const isEnemy = id => id >= 0 && enemies.includes(id);
  const busy = new Set();

  // Units cut off from supply fall back toward friendly supply; worn-out units rest.
  for (const d of mine) {
    if (sup[d.cell]) { if (d.org < 0.3) { d.path = []; busy.add(d); } continue; }
    let best = null, bd = Infinity;
    for (let i = 0; i < N_CELLS; i++) if (sup[i] && dist(i, d.cell) < bd && (index.get(i) || []).length < MIL.maxStack) { bd = dist(i, d.cell); best = i; }
    if (best !== null) { const p = findDivPath(w, g, d, best); if (p) { d.path = p.path; busy.add(d); } }
  }

  // The capital and the great cities are not left empty when an enemy army is a few days away.
  if (mine.length >= 3) {
    const threatened = c => g.divisions.some(e => isEnemy(e.owner) && !e.voyage && dist(e.cell, c.cell) <= 4);
    const keep = g.cities.filter(c => c.owner === n.id && !(g.occ[c.cell] >= 0) && (c.capital || (c.imp || 0) >= 45) && threatened(c))
      .sort((a, b) => (b.capital ? 200 : 0) + (b.imp || 0) - (a.capital ? 200 : 0) - (a.imp || 0)).slice(0, Math.min(2, Math.floor(mine.length / 3)));
    for (const c of keep) {
      const here = mine.find(d => d.cell === c.cell && !busy.has(d));
      if (here) { here.path = []; busy.add(here); continue; }
      const cand = mine.filter(d => !busy.has(d) && d.org >= 0.3 && dist(d.cell, c.cell) <= 5).sort((a, b) => dist(a.cell, c.cell) - dist(b.cell, c.cell))[0];
      if (cand) { const p = findDivPath(w, g, cand, c.cell); if (p && p.seasons <= 2) { cand.path = p.path; busy.add(cand); } }
    }
  }

  // Attacks where the odds are good.
  const targets = new Map();
  for (const d of mine) {
    if (busy.has(d)) continue;
    for (const k of stepNeighbors(g, d.cell)) {
      if (!isLand(w, k) || !isEnemy(controller(g, k)) && !(g.owner[k] === n.id && g.occ[k] >= 0 && isEnemy(g.occ[k]))) continue;
      if (!targets.has(k)) targets.set(k, []);
      targets.get(k).push(d);
    }
  }
  const threshold = stance === "offensive" ? 1.3 : 1.9;
  const scored = [...targets.entries()].map(([cell, atts]) => {
    const defs = (index.get(cell) || []).filter(e => isEnemy(e.owner));
    const pa = atts.map(d => estPower(w, g, d, "att", cell)).sort((a, b) => b - a).slice(0, MIL.maxAttackers).reduce((s, v) => s + v, 0);
    const pd = defs.reduce((s, e) => s + estPower(w, g, e, "def", cell), 0);
    const townC = g.cities.find(c => c.cell === cell);
    const town = !!townC;
    const ours = g.owner[cell] === n.id;
    const odds = pd > 0 ? pa / pd : 99;
    const value = (town ? Math.min(6, 1.5 + (townC.imp || 50) / 20) : 1) + (ours ? 2 : 0) + (defs.length ? 1 : 0);
    return { cell, atts, defs, odds, value };
  }).sort((a, b) => b.value * Math.min(b.odds, 3) - a.value * Math.min(a.odds, 3));
  for (const t of scored) {
    const free = t.atts.filter(d => !busy.has(d) && d.org >= 0.35);
    if (!free.length) continue;
    if (t.defs.length && t.odds < threshold) continue;
    if (!t.defs.length && stance !== "offensive" && g.owner[t.cell] !== n.id) continue;
    const use = t.defs.length ? free.slice(0, MIL.maxAttackers) : free.slice(0, 1);
    for (const d of use) { d.path = [t.cell]; busy.add(d); }
  }

  // Everyone else moves up to the front where it is thinnest, or holds.
  const front = [];
  for (let i = 0; i < N_CELLS; i++) {
    const ci = controller(g, i);
    if (!sup[i] || (ci !== n.id && !(stance === "offensive" && ci === -1 && isLand(w, i)))) continue;
    let pressure = 0, touches = false;
    for (const k of stepNeighbors(g, i)) {
      if (isEnemy(controller(g, k))) touches = true;
      for (const e of index.get(k) || []) if (isEnemy(e.owner)) pressure += divCombatValue(e);
    }
    if (touches) front.push({ cell: i, pressure, mine: (index.get(i) || []).filter(e => e.owner === n.id).length });
  }
  front.sort((a, b) => b.pressure - a.pressure);
  if (!front.length) { planGarrisons(w, g, n, mine.filter(d => !busy.has(d))); return; }
  for (const d of mine) {
    if (busy.has(d)) continue;
    if (enemyDivAdjacent(g, index, d.cell, n.id)) { d.path = []; continue; }
    const spot = front.find(f => f.mine < (f.pressure > 0 ? 2 : 1));
    if (stance === "offensive" && DIV_TYPES[d.type].armor && d.org >= 0.6) {
      const town = g.cities.filter(c => isEnemy(controller(g, c.cell)) && dist(c.cell, d.cell) <= 8).sort((a, b) => dist(a.cell, d.cell) - dist(b.cell, d.cell))[0];
      if (town) { const p = findDivPath(w, g, d, town.cell); if (p) { d.path = p.path; continue; } }
    }
    if (spot) {
      const p = findDivPath(w, g, d, spot.cell);
      if ((!p || p.seasons > 3) && aiSeaMove(w, g, d, spot.cell, p)) { spot.mine++; continue; }
      if (p) { d.path = p.path; spot.mine++; continue; }
    }
    d.path = [];
  }
}

function planGarrisons(w, g, n, mine) {
  const towns = g.cities.filter(c => c.owner === n.id && g.occ[c.cell] < 0);
  if (!towns.length) return;
  const threats = liveNations(g).filter(z => z.id !== n.id).map(z => ({ id: z.id, t: threatFrom(w, g, n.id, z.id) })).filter(x => x.t > 0.1);
  const weight = c => {
    let s = 0.08 + clamp(c.imp || 15, 0, 110) / 140 + (c.capital ? 0.1 : 0);
    for (const th of threats) { const d = distanceToNation(g, th.id, c.cell); if (d <= 8) s += th.t * (9 - d) / 4; }
    return s;
  };
  const ranked = towns.map(c => ({ c, w: weight(c), have: 0 })).sort((a, b) => b.w - a.w);
  const total = ranked.reduce((s, r) => s + r.w, 0) || 1;
  ranked.forEach(r => { r.want = Math.max(r === ranked[0] ? 1 : 0, Math.round((r.w / total) * mine.length)); });
  const assigned = new Set();
  for (const r of ranked) for (const d of mine) {
    if (r.have >= Math.min(r.want, MIL.maxStack)) break;
    if (assigned.has(d)) continue;
    if (d.cell === r.c.cell) { assigned.add(d); r.have++; d.path = []; }
  }
  for (const d of mine) {
    if (assigned.has(d)) continue;
    const r = ranked.find(x => x.have < Math.min(x.want, MIL.maxStack)) || ranked.find(x => x.have < MIL.maxStack);
    if (!r) break;
    const p = findDivPath(w, g, d, r.c.cell);
    if ((!p || p.seasons > 3) && aiSeaMove(w, g, d, r.c.cell, p)) { r.have++; assigned.add(d); continue; }
    if (p) { d.path = p.path; r.have++; assigned.add(d); }
  }
}

function stockValue(n) { return EQUIP_ORDER.reduce((s, k) => s + (n.stock ? n.stock[k] : 0) * EQUIP[k].costB, 0); }

/* What the divisions already in the field are missing, by kind of equipment. */
function shortfall(g, nid) {
  const out = { kits: 0, guns: 0, tanks: 0, planes: 0 };
  for (const d of g.divisions) if (d.owner === nid) { const t = DIV_TYPES[d.type]; for (const k of ["kits", "guns", "tanks"]) out[k] += Math.max(0, t[k] - d[k]); }
  for (const a of g.airwings) if (a.owner === nid) out.planes += Math.max(0, AIR.planes - a.planes);
  return out;
}

/* Rival quartermasters keep factories making what the army will need, and stop when the depots are full. */
function aiManageProduction(g, n) {
  const mix = MIX[n.archetype];
  const short = shortfall(g, n.id);
  const wings = g.airwings.filter(a => a.owner === n.id).length;
  const want = {
    kits: short.kits + 2 * DIV_TYPES.inf.kits,
    guns: short.guns + DIV_TYPES.art.guns,
    tanks: short.tanks + (mix.arm >= 0.2 ? DIV_TYPES.arm.tanks : mix.arm > 0 ? 60 : 0),
    planes: short.planes + (wings < mix.air ? AIR.planes : 20),
  };
  const base = PROD_DEFAULTS[n.archetype];
  const prod = {};
  for (const k of EQUIP_ORDER) {
    const have = n.stock[k];
    prod[k] = have >= 2 * want[k] ? "off" : have >= want[k] ? "low" : n.focus === k ? "high" : base[k];
  }
  n.prod = prod;
}

/* Rivals raise forces according to character, danger and what their factories have made. */
function aiRecruit(w, g, n) {
  const econ = computeEconomy(w, g, n.id);
  const mix = MIX[n.archetype];
  const atWarNow = enemiesOf(g, n.id).length > 0;
  const threat = maxThreatTo(w, g, n.id).level;
  const reserve = 0.03 * econ.gdp;
  const towns = g.cities.filter(c => c.owner === n.id && g.occ[c.cell] < 0);
  if (!towns.length) return [];
  const raised = [];
  const enemyNear = c => {
    let best = Infinity;
    for (const z of liveNations(g)) if (z.id !== n.id) best = Math.min(best, distanceToNation(g, z.id, c.cell));
    return best;
  };
  const base = towns.filter(c => stackAt(g, c.cell, n.id) < MIL.maxStack && !((c.loyalty ?? CITY.loyalNative) < CITY.loyalRaise && c.origin !== n.id)).sort((a, b) => enemyNear(a) - enemyNear(b))[0];
  // In peace a government keeps only part of its allowed manpower under arms: more when it feels threatened or is ruled by generals.
  const lean = { militarist: 0.3, expansionist: 0.15, agrarian: 0, mercantile: -0.05 }[n.archetype] || 0;
  const desire = atWarNow ? 1 : clamp(0.45 + 0.4 * threat + lean, 0.35, 0.95);
  const underArms = n.mil ? n.mil.men : 0;
  const limit = underArms >= manpowerCap(n, econ) * desire ? 0 : atWarNow ? 2 : 1;
  for (let k = 0; k < limit && base; k++) {
    const mine = g.divisions.filter(d => d.owner === n.id);
    const counts = { inf: 0, art: 0, arm: 0 };
    mine.forEach(d => { counts[d.type]++; });
    const total = mine.length || 1;
    const want = DIV_ORDER.map(t => ({ t, gap: mix[t] - counts[t] / total })).sort((a, b) => b.gap - a.gap);
    for (const { t } of want) {
      const q = raiseQuote(w, g, n.id, t, base.id);
      if (!q.ok || n.treasury - q.cost < reserve) continue;
      if (t !== "inf" && q.fill < 0.5) continue;
      raiseForce(g, n.id, q);
      raised.push(`Raised the ${g.divisions[g.divisions.length - 1].name} at ${base.name}.`);
      break;
    }
  }
  const wings = g.airwings.filter(a => a.owner === n.id).length;
  if (wings < mix.air && n.stock.planes >= 60) {
    const cap = towns.find(c => c.capital) || towns[0];
    const q = raiseQuote(w, g, n.id, "air", cap.id);
    if (q.ok && n.treasury - q.cost > reserve) { const wing = raiseForce(g, n.id, q); raised.push(`Formed the ${wing.name} at ${cap.name}.`); }
  }
  return raised;
}

/* Military choices offered to rival minds: the stance of their generals and what their factories favor. */
function militaryCandidates(w, g, n) {
  const out = [];
  const enemies = enemiesOf(g, n.id);
  const stance = (n.warPlan && n.warPlan.stance) || "defensive";
  if (enemies.length) {
    const names = enemies.map(e => `the ${nameOf(g, e)}`).join(" and ");
    if (stance !== "offensive") out.push({ kind: "stance", value: "offensive", label: `Order the generals onto the offensive against ${names}`, why: "press the attack where the odds are good" });
    if (stance !== "defensive") out.push({ kind: "stance", value: "defensive", label: `Order the generals to hold defensive lines against ${names}`, why: "preserve the army and hold what we have" });
  }
  const mix = MIX[n.archetype];
  const mine = g.divisions.filter(d => d.owner === n.id);
  const total = mine.length || 1;
  const armorShare = mine.filter(d => d.type === "arm").length / total;
  const wings = g.airwings.filter(a => a.owner === n.id).length;
  const p = { ...n.prod, [n.focus]: "high" };
  if (armorShare < mix.arm && p.tanks !== "high") out.push({ kind: "focus", value: "tanks", label: "Shift factories toward tanks", why: "we have too few armored divisions for our plans" });
  if (wings < mix.air && p.planes !== "high") out.push({ kind: "focus", value: "planes", label: "Shift factories toward aircraft", why: "our skies are thinly defended" });
  if (enemies.length && p.kits !== "high") out.push({ kind: "focus", value: "kits", label: "Shift factories toward infantry weapons", why: "the war needs riflemen more than prestige weapons" });
  return out.slice(0, 3).concat(navalCandidates(g, n));
}

function applyMilitaryOption(g, n, o) {
  if (o.kind === "stance") { n.warPlan = { stance: o.value }; return `Ordered its generals ${o.value === "offensive" ? "onto the offensive" : "to hold defensive lines"}.`; }
  if (o.kind === "navy") { n.navyStance = o.value; return o.value === "offensive" ? "Ordered its admirals to seek battle and blockade the enemy's ports." : "Ordered its admirals to guard its own waters and convoys."; }
  if (o.kind === "focus") {
    n.focus = o.value;
    aiManageProduction(g, n);
    return `Shifted its factories toward ${EQUIP[o.value].label.toLowerCase()}.`;
  }
  return null;
}

/* ---------- The military season, called from runSeason ---------- */
function sameSideAs(g, a, b) {
  if (a === b) return true;
  return g.wars.some(war => sameSide(war, a, b)) || alliesOf(g, a).includes(b);
}

function runMilitarySeason(w, g, rng, dispatch) {
  for (const n of liveNations(g)) {
    if (n.isPlayer) continue;
    for (const t of aiRecruit(w, g, n)) noteFor(n, g, t, null, "rules");
    for (const t of aiBuildShips(w, g, n)) noteFor(n, g, t, null, "rules");
    aiManageProduction(g, n);
  }
  for (const n of liveNations(g)) reinforce(g, w, n, computeEconomy(w, g, n.id));
  const voyageNews = maintainVoyages(w, g);
  for (const n of liveNations(g)) planOperations(w, g, n);
  for (const n of liveNations(g)) {
    if (!n.isPlayer) for (const t of aiLandings(w, g, n)) noteFor(n, g, t, null, "rules");
    planNaval(w, g, n);
  }
  const sea = resolveSea(w, g, rng);
  const res = resolveMilitary(g, w, rng);
  res.reports.unshift(...sea.landReports);
  g.battles = sea.landReports.concat(g.battles || []).slice(0, 40);
  const after = seaAftermath(w, g, rng);
  const seaNews = voyageNews.concat(sea.news, after);
  dispatch.sea = seaNews.filter(x => x.nid === PLAYER || (x.other === PLAYER && x.shared));
  dispatch.seaBattles = sea.reports.filter(r => r.attacker === PLAYER || r.defender === PLAYER || sameSideAs(g, PLAYER, r.attacker) || sameSideAs(g, PLAYER, r.defender));
  g.sea.seaBattles = sea.reports;
  for (const r of sea.reports) {
    if (dispatch.seaBattles.includes(r)) continue;
    const lost = Object.values(r.sunk).reduce((a, l) => a + l.length, 0);
    dispatch.war.push(`Sea battle in the ${r.zoneName}: the ${nameOf(g, r.won ? r.attacker : r.defender)} beat the ${nameOf(g, r.won ? r.defender : r.attacker)}${lost ? `; ${lost} ship${lost > 1 ? "s" : ""} sunk` : ""}.`);
  }
  for (const x of seaNews) if (!dispatch.sea.includes(x) && x.blockade) dispatch.war.push(x.text);
  for (const x of seaNews) if (x.tone === "bad" || x.blockade) addChronicle(g, x.text, x.tone === "bad" ? "bad" : "warn", x.nid);
  dispatch.war.push(...res.news);
  for (const r of res.reports) {
    if (r.attacker === PLAYER || r.defender === PLAYER) continue;
    const where = r.town ? r.town : `the ${r.terrain.toLowerCase()}`;
    if (r.town || r.destroyed.length) dispatch.war.push(`Battle at ${where}: the ${nameOf(g, r.attacker)} ${r.won ? "defeated" : "was thrown back by"} the ${nameOf(g, r.defender)}${r.destroyed.length ? `; ${r.destroyed.join(", ")} destroyed` : ""}.`);
  }
  return res;
}

/* Rule-based choice among the military options, so rivals still steer their wars without Claude. */
function ruleMilitaryChoice(g, w, n, options) {
  if (!options.length) return null;
  const enemies = enemiesOf(g, n.id);
  const per = personality(n);
  if (enemies.length) {
    const war = warBetween(g, n.id, enemies[0]);
    const score = war ? sideScore(war, n.id) : 0;
    const mine = armyPower(g, n.id), theirs = enemies.reduce((s, e) => s + armyPower(g, e), 0);
    const off = options.find(o => o.kind === "stance" && o.value === "offensive");
    const def = options.find(o => o.kind === "stance" && o.value === "defensive");
    if (off && (mine > theirs * (per.aggression >= 1 ? 1.0 : 1.3) || (score > 10 && mine > theirs * 0.8))) return off;
    if (def && mine < theirs * 0.8 && score < 5) return def;
  }
  const nav = options.find(o => o.kind === "navy");
  if (nav && enemies.length) {
    const mine = navyPower(g, n.id), theirs = enemies.reduce((s, e) => s + navyPower(g, e), 0);
    if (nav.value === "offensive" && mine > theirs * 1.3) return nav;
    if (nav.value === "defensive" && mine < theirs * 0.8) return nav;
  }
  if (g.turn % 3 === n.id % 3) return options.find(o => o.kind === "focus") || null;
  return null;
}

function economyBrief(n, econ) {
  const sec = Object.entries(econ.sectors).map(([k, v]) => `${SECTORS[k].label.toLowerCase()} ${pct(v.va / Math.max(1, econ.gdp))}`).join(", ");
  const short = GOOD_ORDER.filter(k => econ.goods.demand[k] > 0.05 && econ.sat[k] < 0.8).map(k => `${GOODS[k].label.toLowerCase()} (${pct(econ.sat[k])})`);
  const glut = GOOD_ORDER.filter(k => econ.goods.util[k] < 0.8).map(k => GOODS[k].label.toLowerCase());
  const known = Object.keys(n.techs || {}).map(t => TECHS[t].label);
  return `Economy: ${sec}; workforce skill ${pct(n.skill ?? 0.35)}; unemployment ${pct(econ.unemployment || 0)}; food reserve ${fmt1(monthsOfFood((n.granary && n.granary.stock) || 0, econ.pop))} months; shortages: ${short.join(", ") || "none"}; unsold surplus: ${glut.join(", ") || "none"}; technologies: ${known.join(", ") || "none yet"}.`;
}

function militaryBrief(g, w, n, econ) {
  const mine = g.divisions.filter(d => d.owner === n.id);
  const c = { inf: 0, art: 0, arm: 0 };
  mine.forEach(d => { c[d.type]++; });
  const planes = g.airwings.filter(a => a.owner === n.id).reduce((s, a) => s + a.planes, 0);
  const plan = armsPlan(n, econ, n.laws);
  return `Forces: ${mine.length} divisions (${c.inf} infantry, ${c.art} artillery, ${c.arm} armored), ${planes} aircraft; manpower ${fmtCount(n.mil ? n.mil.men : 0)} of ${fmtCount(manpowerCap(n, econ))} allowed; factories turn out about ${EQUIP_ORDER.map(k => `${fmtCount(plan.units[k])} ${EQUIP[k].unit}`).join(", ")} a season; generals' stance: ${(n.warPlan && n.warPlan.stance) || "defensive"}. ${navalBrief(w, g, n)}`;
}

