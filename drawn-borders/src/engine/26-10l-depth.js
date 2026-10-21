/* =====================================================================
   10l. Depth: work and the people who move for it, the national food reserve, smelters at the mines,
        soldiers who learn from battle, and the seasons that every general has to reckon with
   ===================================================================== */

/* ---------- Jobs: who works where, and who has no work ----------
   Farms and the mines, plants and offices built in a town give work first. Everyone else needs a job in the
   shops, transport, offices, schools and hospitals, and there are only as many of those as the town can pay for:
   a share of its people, more where roads reach a big market, more for every job in industry (wages spent in town,
   suppliers, repairs), and the public jobs that healthcare and education laws pay for. */
const JOBS = {
  base: 0.42,          // jobs in shops, transport, repairs and offices any town has, per worker
  market: 0.25,        // more where roads (or ships) reach a big market
  perIndustry: 1.5,    // service jobs each job in a mine, plant or office supports
  public: 0.04, health: 0.015, edu: 0.015, capital: 0.02,   // administration, hospitals, schools; ministries in the capital
  natural: 0.04,       // some people are always between jobs
  stabK: 50, stabCap: 12,
  smallVA: 0.4,        // a smallholder on a family plot makes 40% of what a farm worker makes
  smallMove: 0.35,     // smallholders are less ready to leave than the jobless
};
function pct1(x) { return x > 0 && x < 0.1 ? `${(x * 100).toFixed(1)}%` : pct(x); }
function publicJobShare(n, laws) {
  const L = laws || (n && n.laws) || {};
  return JOBS.public + JOBS.health * Math.max(0, SERVICE_ORDER.indexOf(L.services || "basic")) + JOBS.edu * Math.max(0, EDU_ORDER.indexOf(L.education || "basic")) + modSum(n, "jobs");
}
function unemploymentStabTerm(n, econ, laws) {
  const u = econ.unemployment || 0;
  if (u <= JOBS.natural + 0.005) return null;
  const welfare = { minimal: 1, basic: 0.9, good: 0.75, generous: 0.55 }[(laws || n.laws).services] ?? 1;
  const soft = welfare * (1 - Math.min(0.6, modSum(n, "jobRelief")));
  const v = -Math.min(JOBS.stabCap, JOBS.stabK * (u - JOBS.natural)) * soft;
  if (v > -0.05) return null;
  return { label: `Unemployment: ${pct1(u)} of workers have no job${soft < 0.8 ? " (eased by welfare and relief)" : ""}`, value: v };
}

/* ---------- People move for work: from towns without jobs to towns with work, and away from hunger ---------- */
const MIGR = { share: 0.15, cutoff: 0.4, famine: 0.04, intake: 0.03, minFlow: 0.002, minTown: 0.02, maxIn: 0.25, maxOut: 0.12 };
function townURate(r) { return r.workforce > 1e-6 ? (r.unemployed || 0) / r.workforce : 0; }
/* Who would like to leave a town for work: the jobless, and some of the smallholders scraping by on family plots. */
function townLeaveRate(r) { return r.workforce > 1e-6 ? ((r.unemployed || 0) + JOBS.smallMove * (r.smallholders || 0)) / r.workforce : 0; }
function cellsPop(g, cells) { let s = 0; for (const c of cells) s += g.pop[c]; return s; }
/* Take people out of a town's land, evenly; returns how many actually left. */
function takePeople(g, cells, people) {
  const have = cellsPop(g, cells);
  const take = Math.min(people, have * MIGR.maxOut);
  if (!(take > 0) || !(have > 0)) return 0;
  const f = 1 - take / have;
  for (const c of cells) g.pop[c] *= f;
  return take;
}
/* Settle newcomers in a town's land, more where more people already live (in the town itself if it is empty). */
function givePeople(g, cells, townCell, people) {
  const have = cellsPop(g, cells);
  if (!(have > 1e-4)) { g.pop[townCell] += people; return; }
  for (const c of cells) g.pop[c] += people * g.pop[c] / have;
}
function migrateNation(w, g, n, econ) {
  const regions = econ.regions;
  const out = { turn: g.turn, flows: [], moved: 0 };
  if (regions.length < 2) { n.migr = out; return out; }
  const capNet = econ.networks.findIndex(x => x.capital);
  const lfS = (econ.people && econ.people.lf) || ECON7.workShare;
  const family = 1 / lfS;                      // each worker who moves brings a family
  // how many workers each town can take in this season: the jobs waiting there, a few more, and never more than a quarter of the town
  const room = new Map(regions.map(r => [r, r.pop < MIGR.minTown || cityClosed(g, r.city) ? 0 : Math.max(0, Math.min((r.vacancies || 0) + MIGR.intake * r.workforce, MIGR.maxIn * r.workforce))]));
  const plan = [];
  const add = (a, b, workers, why) => { if (workers * family >= MIGR.minFlow * 0.25) plan.push({ a, b, people: workers * family, why }); };
  // the jobless go where the work is: along the roads (and sea lanes) of their own network, or from a cut-off town to the capital's market
  const sources = regions.filter(r => townLeaveRate(r) > JOBS.natural + 0.02 && (r.unemployed || 0) + (r.smallholders || 0) > 0.002).sort((a, b) => townLeaveRate(b) - townLeaveRate(a));
  for (const a of sources) {
    const ua = townLeaveRate(a);
    const dests = regions.filter(b => b !== a && room.get(b) > 0.0005 && townURate(b) < ua - 0.03 && (b.net === a.net || b.net === capNet) && networkFed(econ, b));
    if (!dests.length) continue;
    const natInc = econ.people ? econ.people.bill / Math.max(0.001, econ.pop) : 0;
    const weight = b => room.get(b) * (1 + (b.market || 0)) * (b.net === a.net ? 1 : MIGR.cutoff) * (ua - townURate(b)) / (1 + dist(a.city.cell, b.city.cell) / 15) * cityPull(g, b.city) * (natInc > 0 ? clamp((b.incomeK || natInc) / natInc, 0.5, 2) : 1);
    const W = dests.reduce((s, b) => s + weight(b), 0);
    if (!(W > 0)) continue;
    const pool = (a.unemployed || 0) + JOBS.smallMove * (a.smallholders || 0);
    const movers = pool * MIGR.share * (a.net === capNet || dests.some(b => b.net === a.net) ? 1 : MIGR.cutoff);
    for (const b of dests) {
      const m = Math.min(room.get(b), movers * weight(b) / W);
      if (m <= 0) continue;
      room.set(b, room.get(b) - m);
      add(a, b, m, "work");
    }
  }
  // hunger: families leave towns where the food has run out, for any town of the nation that can feed them
  for (const a of regions) {
    if (a.foodRatio >= ECON.famineLine) continue;
    const dests = regions.filter(b => b !== a && b.foodRatio >= 1.05 && b.pop >= MIGR.minTown).sort((x, y) => dist(a.city.cell, x.city.cell) - dist(a.city.cell, y.city.cell)).slice(0, 2);
    if (!dests.length) continue;
    const leave = a.pop * MIGR.famine * lfS;
    dests.forEach((b, k) => add(a, b, Math.min(leave * (k ? 0.35 : 0.65), b.pop * 0.03 * lfS), "hunger"));
  }
  // move them, counting exactly who left and who arrived
  for (const p of plan) {
    const moved = takePeople(g, p.a.cells, p.people);
    if (moved <= 0) continue;
    givePeople(g, p.b.cells, p.b.city.cell, moved);
    const f = out.flows.find(x => x.from === p.a.city.id && x.to === p.b.city.id && x.why === p.why);
    if (f) f.people += moved; else out.flows.push({ from: p.a.city.id, to: p.b.city.id, fromCell: p.a.city.cell, toCell: p.b.city.cell, people: moved, why: p.why });
  }
  out.flows.sort((a, b) => b.people - a.people);
  out.moved = out.flows.reduce((s, f) => s + f.people, 0);
  n.migr = out;
  if (typeof REC !== "undefined" && REC) for (const f of out.flows.slice(0, 6)) if (f.people >= 0.01) REC.events.push({ t: "migrate", from: f.fromCell, to: f.toCell, people: f.people, owner: n.id, phase: "migrate" });
  return out;
}
function networkFed(econ, r) { return r.foodRatio >= ECON.famineLine; }

/* ---------- The national food reserve: grain bought from the farms in good years, released when harvests fail ---------- */
const GRANARY_ORDER = ["none", "small", "medium", "large"];
const GRANARY_LAWS = {
  none:   { label: "None",     months: 0 },
  small:  { label: "2 months", months: 2 },
  medium: { label: "4 months", months: 4 },
  large:  { label: "8 months", months: 8 },
};
const GRAN = {
  priceB: 1.0,       // $B the state pays farmers for a year's food for 1M people
  spoil: 0.01,       // share of the stock lost each season to damp, rot and rats
  fillShare: 0.0625, // at most a sixteenth of the target is bought in one season (a reserve is built up over years)
  startShare: 1,     // new nations start with their reserve full
};
function granaryMonths(laws) { return (GRANARY_LAWS[(laws && laws.granary) || "none"] || GRANARY_LAWS.none).months; }
function granaryFillWant(stock, target, pop) { return target > stock ? Math.min(target - stock, Math.max(GRAN.fillShare * target, 0.005 * pop)) : 0; }
/* The plan for this season, before the harvest is known: what the state wants to buy, and what it holds. */
function granaryPlan(nation, pop) {
  const months = granaryMonths(nation && nation.laws);
  const stock = (nation && nation.granary && nation.granary.stock) || 0;
  const target = pop * months / 12;
  return { months, stock, target, fillWant: granaryFillWant(stock, target, pop), fill: 0, spare: 0, release: 0, short: 0, pop };
}
/* What filling the reserve would cost under a given law (so a law change shows its price before it is made). */
function granaryCost(n, econ, laws) {
  const G = econ.granary;
  if (!G) return { fill: 0, cost: 0 };
  const target = G.pop * granaryMonths(laws) / 12;
  const fill = Math.min(granaryFillWant(G.stock, target, G.pop), G.spare);
  return { fill, cost: fill * GRAN.priceB };
}
function fmt1(v) { return v >= 10 ? Math.round(v).toString() : v.toFixed(1); }
function monthsOfFood(stock, pop) { return pop > 0.001 ? stock / (pop / 12) : 0; }
/* After the season: what was bought goes in, what was released comes out, and some always spoils. */
function settleGranary(n, econ, budget) {
  const G = n.granary || (n.granary = { stock: 0 });
  const E = econ.granary;
  if (!E) return;
  const fill = budget ? budget.granaryFill || 0 : 0;
  const before = G.stock || 0;
  const after = Math.max(0, before - E.release + fill);
  const spoiled = after * GRAN.spoil;
  G.stock = after - spoiled;
  G.last = { turn: E.turn ?? null, fill, release: E.release, spoiled, short: E.short };
  if (E.release > 0.0005) G.lastRelease = E.release;
}

/* ---------- The harvest: brought in each autumn, good or bad, and it feeds the nation for a year ----------
   Weather varies: most years are close to normal, some are rich, and now and then a bad year cuts the harvest hard.
   Fishing does not depend on it. A nation with food to spare hardly notices; one that only just feeds itself goes short. */
const HARVEST = { sd: 0.06, min: 0.8, max: 1.12, badChance: 0.07, bad: 0.85 };
function harvestFactor(n) { return n && n.harvest ? n.harvest : 1; }
function rollHarvests(w, g) {
  const rng = mulberry32((w.seed * 31 + g.turn * 7919 + 99) >>> 0);
  for (const n of g.nations) {
    if (!n.alive) continue;
    let h = 1 + gaussian(rng) * HARVEST.sd;
    if (rng() < HARVEST.badChance) h *= HARVEST.bad;
    if (n.droughtTurn != null && g.turn - n.droughtTurn <= 1) h = Math.min(h, 0.95) * 0.95;   // after a dry summer, a poor harvest at best
    n.harvest = Math.round(clamp(h, HARVEST.min, HARVEST.max) * 1000) / 1000;
    n.harvestTurn = g.turn;
  }
}
function harvestWord(h) { return h < 0.88 ? "a bad harvest" : h < 0.95 ? "a poor harvest" : h > 1.06 ? "a rich harvest" : h > 1.02 ? "a good harvest" : "a normal harvest"; }

/* ---------- Every nation starts able to fuel its first power station ----------
   A coal mine or an oil field joined to a town by road. Without one, the power stations stand idle from the first day. */
function seedFuel(w, g, n) {
  const nid = n.id;
  const has = k => g.sites.some(s => s.kind === k && g.owner[s.cell] === nid);
  if (has("coalmine") || has("oilfield")) return;
  const cities = g.cities.filter(c => c.owner === nid);
  if (!cities.length) return;
  const cands = [];
  for (let i = 0; i < N_CELLS; i++) {
    if (g.owner[i] !== nid || (w.dep[i] !== 2 && w.dep[i] !== 3) || g.sites.some(s => s.cell === i)) continue;
    cands.push({ i, t: w.dep[i], d: Math.min(...cities.map(c => dist(c.cell, i))) });
  }
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands.slice(0, 4)) {
    const from = cities.slice().sort((a, b) => dist(a.cell, c.i) - dist(b.cell, c.i))[0];
    const path = from.cell === c.i ? [c.i] : findRoadPath(w, g, nid, from.cell, c.i);
    if (!path || path.length > 16) continue;
    if (path.length > 1) pathEdges(path).forEach(e => g.roads.add(e));
    const kind = RES[c.t].site;
    g.sites.push({ id: g.nextId++, cell: c.i, kind, level: 1, pace: "normal", paused: false, opened: 0, extracted: 0, name: siteName(g, c.i, kind) });
    return;
  }
}

/* ---------- Smelters: the ore is smelted where it is dug ---------- */
const SMELT = { costB: 3.5, seasons: 2, vaPerUnit: 1.6, haulCut: 0.5 };
INDUSTRIES.smelter = { sector: "secondary", sub: "Metal smelting", label: "Smelter", workers: 0.02, va: 80, in: { coal: 0.5 }, power: 0.1, costB: SMELT.costB, seasons: SMELT.seasons,
  does: "Smelts the ore where it is dug. The metal is worth more than the ore and weighs less to haul. Burns coal and needs workers." };
function quoteSmelter(w, g, nid, s, base) {
  const fail = reason => ({ ok: false, kind: "smelter", siteId: s ? s.id : null, reason });
  if (!s || s.kind !== "mine") return fail("Only metal ore is smelted.");
  if (g.owner[s.cell] !== nid) return fail("Not yours.");
  if (g.occ && g.occ[s.cell] >= 0) return fail("Occupied by an enemy army.");
  if (s.exhausted) return fail("The mine is worked out.");
  if (s.smelter) return fail("It already has a smelter.");
  if (g.projects.some(p => p.kind === "smelter" && p.siteId === s.id)) return fail("A smelter is already being built here.");
  const econ = base || computeEconomy(w, g, nid);
  const x = (econ.sites || []).find(y => y.site.id === s.id);
  if (!x || x.status !== "working") return fail("The mine has to be working first.");
  const value = projectValue(w, g, nid, { smelter: s.id }, econ);
  const cost = SMELT.costB * (DIFFICULTY[w.terrain[s.cell]] || 1) * (1 + 0.2 * (s.level - 1)) * econ.constructionIndex;
  const units = s.level * (x.mult || 1);
  return { ok: true, kind: "smelter", nid, cell: s.cell, siteId: s.id, cost, seasons: SMELT.seasons, ...value, units, coal: units * INDUSTRIES.smelter.in.coal, workersNeed: units * INDUSTRIES.smelter.workers, label: `Smelter at ${s.name}` };
}
function smelterCandidates(w, g, n, econ) {
  const out = [];
  const mines = (econ.sites || []).filter(x => x.kind === "mine" && x.status === "working" && !x.site.smelter && (x.outUnits || 0) > 0.3).sort((a, b) => (b.outUnits || 0) - (a.outUnits || 0)).slice(0, 2);
  for (const x of mines) { const q = quoteSmelter(w, g, n.id, x.site, econ); if (q.ok && q.dGdp > 0) out.push(q); }
  return out;
}

/* ---------- Experience: divisions learn from every battle; replacements are green ---------- */
const EXPS = { win: 0.06, loss: 0.03, recruit: 0.1, train: 0.075, trainCap: 0.15, drill: 0.01, drillCap: 0.25, start: 0.2 };
const EXP_LEVELS = [
  { at: 0, label: "Green", note: "new to soldiering" },
  { at: 0.1, label: "Trained", note: "drilled, but untested" },
  { at: 0.3, label: "Seasoned", note: "has seen battle" },
  { at: 0.55, label: "Veteran", note: "battle-hardened" },
  { at: 0.8, label: "Elite", note: "the best troops in the land" },
];
function expFactor(d) { return 0.9 + 0.5 * clamp((d && d.exp) || 0, 0, 1); }
function expLevel(exp) { let L = EXP_LEVELS[0]; for (const x of EXP_LEVELS) if ((exp || 0) >= x.at - 1e-9) L = x; return L; }
function expRank(exp) { return EXP_LEVELS.indexOf(expLevel(exp)); }
function sideExpLine(list, side) {
  if (!list.length) return null;
  const f = list.reduce((s, d) => s + expFactor(d), 0) / list.length;
  if (Math.abs(f - 1) < 0.06) return null;
  const avg = list.reduce((s, d) => s + (d.exp || 0), 0) / list.length;
  const L = expLevel(avg);
  return { label: `${L.label} ${side === "att" ? "attackers" : "defenders"} (${L.note})`, mult: Math.round(f * 100) / 100, already: true, side };
}

/* ---------- The seasons of war ----------
   Spring thaw and autumn rains turn the fields to mud; winter brings snow, frost and frozen rivers; summer is
   the season for campaigning. Roads are the way through any season. */
const SEASON_WAR = [
  { key: "thaw", name: "Spring thaw", icon: "mud", offRoad: 0.5, rugged: 0.5, armorMove: 1.25, armorAttack: 0.8,
    note: "Melting snow turns the fields to mud: armies off the roads march slowly, and tanks bog down." },
  { key: "summer", name: "Summer", icon: "sun",
    note: "Dry ground and long days: the best season to campaign." },
  { key: "rain", name: "Autumn rains", icon: "rain", offRoad: 0.25, rugged: 0.25, armorMove: 1.1, armorAttack: 0.9,
    note: "Autumn rains soften the ground: marches off the roads are slower, and tanks struggle." },
  { key: "winter", name: "Winter", icon: "snow", offRoad: 0.5, rugged: 1, attack: 0.85, ruggedAttack: 0.7, frost: 2, mountainFrost: 0.015, frozen: true, sail: 1.25, landing: 0.8,
    note: "Snow and frost: armies off the roads move slowly and attacks are harder, above all in hills and mountains. Troops without supply freeze. Small rivers freeze over. Storms slow the ships and swamp the landing craft." },
];
function seasonWar(g) { return SEASON_WAR[(((g && g.turn) || 0) % 4 + 4) % 4]; }
function seasonEffectsList(sw) {
  const out = [];
  if (sw.offRoad) out.push(`marches off the roads ${sw.offRoad >= 0.5 ? "much " : ""}slower${sw.rugged > sw.offRoad ? " (slowest in hills and mountains)" : ""}`);
  if (sw.armorAttack) out.push(`tank attacks ${pct(1 - sw.armorAttack)} weaker`);
  if (sw.attack) out.push(`attacks ${pct(1 - sw.attack)} weaker, ${pct(1 - sw.ruggedAttack)} weaker in hills and mountains`);
  if (sw.frost) out.push("troops without supply lose men twice as fast; even supplied troops in the mountains lose some to frostbite");
  if (sw.frozen) out.push("small rivers frozen: no time lost crossing them");
  if (sw.sail) out.push(`voyages take ${pct(sw.sail - 1)} longer, landings ${pct(1 - sw.landing)} weaker`);
  return out;
}
/* The season's weight on one division's attack, for the generals' planning. */
function seasonAttackMult(w, g, d, cell) {
  const sw = seasonWar(g), t = w.terrain[cell];
  let m = 1;
  if (sw.attack) m *= t === T.HILLS || t === T.MOUNTAIN ? sw.ruggedAttack : sw.attack;
  if (sw.armorAttack && DIV_TYPES[d.type].armor) m *= sw.armorAttack;
  return m;
}

/* ---------- Where the people of a nation came from and went, last season ---------- */
function freshPopFlow(n, g) {
  const pf = { turn: g.turn, births: 0, famine: 0, war: 0, events: n.popEvents || 0, moved: 0 };
  n.popEvents = 0;
  n.popFlow = pf;
  return pf;
}

/* ---------- What the player hears about it at the end of the season ---------- */
function depthNews(w, g, n, rep) {
  const out = [];
  const name = id => (g.cities.find(c => c.id === id) || { name: "a town" }).name;
  const mg = rep.migr;
  if (mg && mg.moved >= 0.01) {
    const work = mg.flows.filter(f => f.why === "work"), hunger = mg.flows.filter(f => f.why === "hunger");
    const list = fl => fl.slice(0, 3).map(f => `${fmtPeople(f.people)} from ${name(f.from)} to ${name(f.to)}`).join(", ");
    const total = work.reduce((s, f) => s + f.people, 0);
    if (work.length === 1 && total >= 0.01) out.push({ text: `About ${fmtPeople(total)} people moved from ${name(work[0].from)} to ${name(work[0].to)} to find work.`, tone: "neutral" });
    else if (work.length > 1 && total >= 0.01) out.push({ text: `About ${fmtPeople(total)} people moved to find work: ${list(work)}.`, tone: "neutral" });
    if (hunger.length) out.push({ text: `Hungry families left for towns with food: ${list(hunger)}.`, tone: "bad" });
  }
  const G = rep.granary;
  if (G && G.release > 0.001) {
    const left = monthsOfFood((n.granary && n.granary.stock) || 0, rep.econ.pop);
    out.push({ text: `The harvest fell short, so the national granaries fed ${fmtPeople(G.release * 4)} people this season. ${left >= 0.5 ? `${fmt1(left)} months of food are left in store.` : "The granaries are now empty."}`, tone: left >= 0.5 ? "warn" : "bad" });
  }
  return out;
}


