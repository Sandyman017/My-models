/* =====================================================================
   11. Running a season for every nation
   ===================================================================== */
const EVENTS = [
  { id: "strike", when: c => c.tax >= 35 && SERVICE_ORDER.indexOf(c.services) <= 1, chance: c => 0.08 + (c.tax - 35) * 0.01,
    make: c => ({ title: "General strike", tone: "bad", text: `${taxLaw(c.tax).label} taxes with only ${SERVICE_LAWS[c.services].label.toLowerCase()} public services pushed the unions to walk out.`, tech: -0.015, stability: -4 }) },
  { id: "riots", when: c => c.stability < 35, chance: c => (35 - c.stability) / 50,
    make: c => ({ title: "Riots in the capital", tone: "bad", text: `With stability at ${Math.round(c.stability)}, protests turned violent. Repairs and policing cost money.`, stability: -3, costShare: 0.01 }) },
  { id: "hunger", when: c => c.famineShare > 0.05, chance: c => 0.2 + c.famineShare,
    make: c => ({ title: "Bread protests", tone: "bad", text: `${pct(c.famineShare)} of your people live where there isn't enough food. Roads to farmland or irrigation would help.`, stability: -3 }) },
  { id: "bonds", when: c => c.debtRatio > 0.9, chance: c => 0.15 + (c.debtRatio - 0.9) * 0.3,
    make: c => ({ title: "Bond market jitters", tone: "bad", text: `Debt at ${pct(c.debtRatio)} of GDP worried lenders, and refinancing cost extra.`, stability: -2, costDebt: 0.01 }) },
  { id: "scandal", when: c => c.stability < 50, chance: () => 0.07,
    make: () => ({ title: "Corruption scandal", tone: "bad", text: "Weak institutions let officials skim public funds.", stability: -3, costShare: 0.015 }) },
  { id: "boom", when: c => c.biggestMarket > 14 && c.stability > 60, chance: () => 0.07,
    make: c => ({ title: "Trade boom", tone: "good", text: `Your largest road network now reaches ${c.biggestMarket.toFixed(1)}M people, and merchants are thriving.`, tech: 0.01 }) },
  { id: "drought", when: () => true, chance: () => 0.05,
    make: c => SERVICE_ORDER.indexOf(c.services) >= 2
      ? { title: "Drought", tone: "warn", text: "A dry season cut the harvest. Relief programs kept people fed.", popShare: -0.003, stability: -1 }
      : { title: "Drought", tone: "bad", text: `A dry season cut the harvest, and ${SERVICE_LAWS[c.services].label.toLowerCase()} public services gave little relief.`, popShare: -0.01, stability: -5 } },
  { id: "harvest", when: () => true, chance: () => 0.05,
    make: () => ({ title: "Bumper harvest", tone: "good", text: "Good weather across the farmland lifted spirits, and families grew.", popShare: 0.005, stability: 2 }) },
];

function rollEvent(ctx, rng) {
  for (const ev of EVENTS) if (ev.when(ctx) && rng() < ev.chance(ctx)) return { id: ev.id, ...ev.make(ctx) };
  return null;
}

function scalePopulation(g, cells, factor) { for (const c of cells) g.pop[c] *= factor; }

function applyEvent(g, n, econ, ev) {
  const effects = [];
  if (ev.tech) { n.tech *= 1 + ev.tech; effects.push(`${signedPct(ev.tech, 1)} output`); }
  if (ev.popShare) { econ.regions.forEach(r => scalePopulation(g, r.cells, 1 + ev.popShare)); effects.push(`${signedPct(ev.popShare, 1)} population`); }
  if (ev.stability) { n.stability = clamp(n.stability + ev.stability, 0, 100); effects.push(`${signed(ev.stability)} stability`); }
  let cost = 0;
  if (ev.costShare) cost += ev.costShare * econ.gdp / 4;
  if (ev.costDebt) cost += ev.costDebt * Math.max(0, -n.treasury);
  if (cost > 0) { n.treasury -= cost; effects.push(`${fmtMoney(-cost)}`); }
  return { ...ev, effects, cost };
}

/* ---------- Statistics: what the world remembers each season ---------- */
const STATS_KEEP = 240; // seasons of history kept per nation (60 years)
function sr(v, d = 2) { const k = 10 ** d; return Math.round(v * k) / k; }

function historyEntry(n, econ, turn, g) {
  const e = { turn, gdp: sr(econ.gdp), pop: sr(econ.pop, 3), stability: sr(n.stability, 1), treasury: sr(n.treasury), soldiers: Math.round(n.soldiers || 0), prestige: Math.round(n.prestige || 0) };
  if (!g) return e;
  let divs = 0, tanks = 0, planes = 0;
  for (const d of g.divisions) if (d.owner === n.id) { divs++; tanks += d.tanks || 0; }
  for (const a of g.airwings) if (a.owner === n.id) planes += a.planes;
  const sec = econ.sectors || {};
  Object.assign(e, {
    area: econ.area || 0, towns: econ.cities.length, divs, tanks: Math.round(tanks + ((n.stock && n.stock.tanks) || 0)), planes: Math.round(planes),
    power: Math.round(armyPower(g, n.id)), techs: Object.keys(n.techs || {}).length, food: sr(econ.pop > 0.01 ? econ.food / econ.pop : 0),
    skill: sr(n.skill ?? 0.35), exp: sr(econ.exportValue || 0), imp: sr(econ.importBill || 0), research: sr(econ.research || 0),
    sec: ["primary", "secondary", "tertiary", "quaternary"].map(k => sr(sec[k] ? sec[k].va : 0, 1)),
    opP: n.isPlayer ? null : Math.round(opinionDetail(g, n.id, PLAYER).value),
  });
  if (g.sea) { const nc = navyCounts(g, n.id); e.ships = nc.destroyer + nc.cruiser; e.fr = nc.freighter; const T = g.sea.trade[n.id]; e.seaMt = T ? sr(T.carry, 1) : 0; }
  e.unemp = sr(econ.unemployment || 0, 3);
  if (econ.people) { const D = demoOf(n), ed = eduOf(n); e.ls = sr(econ.people.ls, 1); e.tfr = sr(D.tfr, 2); e.e0 = sr(D.e0, 1); e.old = sr(D.old, 3); e.kids = sr(D.kids, 3); e.edS = sr(ed.s, 3); e.edE = sr(ed.e, 3); e.lam = sr(econ.people.lam, 3); }
  e.resM = sr(monthsOfFood((n.granary && n.granary.stock) || 0, econ.pop), 1);
  return e;
}

function natStats(g, nid) {
  g.stats.nat = g.stats.nat || {};
  return g.stats.nat[nid] || (g.stats.nat[nid] = { battles: 0, won: 0, lost: 0, menLost: 0, menKilled: 0, tanksLost: 0, townsGained: 0, townsLost: 0, treaties: 0, peakGdp: 0, peakArmy: 0, peakArea: 0 });
}

/* Called once at the end of each season, after the armies have moved. */
function recordSeasonStats(g, reports, ownersBefore) {
  const S = g.stats;
  S.wars = S.wars || []; S.world = S.world || []; S.records = S.records || {};
  let deaths = 0;
  for (const r of reports) {
    const A = r.attacker, D = r.defender;
    const la = (r.losses[A] && r.losses[A].men) || 0, ld = (r.losses[D] && r.losses[D].men) || 0;
    deaths += la + ld;
    const a = natStats(g, A), d = natStats(g, D);
    a.battles++; d.battles++;
    if (r.won) { a.won++; d.lost++; } else { a.lost++; d.won++; leaderDeed(g, D, "held"); }
    a.menLost += la; d.menLost += ld; a.menKilled += ld; d.menKilled += la;
    a.tanksLost += (r.losses[A] && r.losses[A].tanks) || 0; d.tanksLost += (r.losses[D] && r.losses[D].tanks) || 0;
    const war = g.wars.find(x => (x.sideA.includes(A) && x.sideB.includes(D)) || (x.sideB.includes(A) && x.sideA.includes(D)));
    if (war) {
      const e = syncWar(g, war);
      e.battles++; e.losses[A] = (e.losses[A] || 0) + la; e.losses[D] = (e.losses[D] || 0) + ld;
    }
    S.battleLog = S.battleLog || [];
    S.battleLog.push({ turn: g.turn, place: r.town || r.terrain.toLowerCase(), a: A, d: D, won: r.won, ratio: r.ratio, la, ld });
    if (S.battleLog.length > 80) S.battleLog.shift();
    if (!S.records.bloodiest || la + ld > S.records.bloodiest.men) S.records.bloodiest = { men: la + ld, turn: g.turn, place: r.town || r.terrain.toLowerCase(), a: A, d: D, won: r.won };
  }
  for (const war of g.wars) syncWar(g, war);
  for (const e of S.wars) {
    if (e.ended !== null) continue;
    if (!g.wars.some(x => x.id === e.id)) e.ended = g.turn;
  }
  if (S.wars.length > 60) S.wars = S.wars.filter((e, i) => e.ended === null || i >= S.wars.length - 60);
  for (const c of g.cities) {
    const before = ownersBefore.get(c.id);
    if (before === undefined || before === c.owner || before < 0 || c.owner < 0) continue;
    natStats(g, c.owner).townsGained++;
    natStats(g, before).townsLost++;
  }
  S.world.push({ turn: g.turn, wars: g.wars.length, battles: reports.length, deaths, treaties: g.treaties.filter(t => t.type !== "truce").length });
  if (S.world.length > STATS_KEEP) S.world.shift();
}
function syncWar(g, war) {
  const S = g.stats;
  let e = S.wars.find(x => x.id === war.id);
  if (!e) { e = { id: war.id, a: [], b: [], since: war.since, cb: war.cb, ended: null, battles: 0, losses: {}, score: 0 }; S.wars.push(e); }
  for (const id of war.sideA) if (!e.a.includes(id)) e.a.push(id);
  for (const id of war.sideB) if (!e.b.includes(id)) e.b.push(id);
  e.score = war.score;
  return e;
}
/* Peaks and records, kept as the history rolls on */
function updatePeaks(g, n, h) {
  const s = natStats(g, n.id);
  s.peakGdp = Math.max(s.peakGdp, h.gdp || 0);
  s.peakArmy = Math.max(s.peakArmy, h.soldiers || 0);
  s.peakArea = Math.max(s.peakArea, h.area || 0);
  const R = g.stats.records = g.stats.records || {};
  const top = (key, v) => { if (!R[key] || v > R[key].v) R[key] = { v, nid: n.id, turn: h.turn }; };
  top("richest", h.gdp || 0);
  top("largestArmy", h.soldiers || 0);
  top("largestLand", h.area || 0);
  top("mostPeople", h.pop || 0);
  if (h.pop > 0.5) top("bestPerPerson", (h.gdp || 0) / h.pop);
}

/* One nation's season: money, army, growth, then stability. Returns a report with every cause. */
function runNationSeason(w, g, n, rng) {
  for (const s of g.sites) if (s.pausedUntil !== undefined && g.turn >= s.pausedUntil && g.owner[s.cell] === n.id) { s.paused = false; delete s.pausedUntil; }
  const econ = computeEconomy(w, g, n.id);
  const pf = freshPopFlow(n, g);
  const siteNews = workSites(w, g, n, econ);
  if (!n.isPlayer) aiManageSites(w, g, n, econ);
  const budget = computeBudget(n, econ, n.laws);
  n.treasury += budget.balance;
  settleGranary(n, econ, budget);
  for (const k of EQUIP_ORDER) n.stock[k] += budget.arms.units[k];
  // what this season's market looked like steers next season's farms, builders and arms makers
  n.market = { ...econ.sat };
  n.buildAvg = (n.buildAvg || 0) * 0.7 + (n.buildSpend || 0) * 0.3;
  n.buildSpend = 0;
  n.armsAvg = (n.armsAvg || 0) * 0.7 + budget.arms.spend * 0.3;
  n.fuelSat = econ.fuelSat;
  n.logistics = econ.logistics;
  n.mediaLevels = econ.levels.broadcast || 0;
  n.softPower = Math.min(8, 2 * (econ.levels.broadcast || 0) + 0.6 * (econ.levels.resort || 0)) + (econ.works ? econ.works.soft : 0) + 0.5 * econ.regions.filter(r => r.cm && r.cm.focus === "resort").length;
  const discovered = advanceResearch(g, n, econ);
  const crisis = financialCrisis(g, n, econ, rng);
  n.crisisActive = n.crisisUntil > g.turn;

  const tg = econ.cities.length ? clamp(techGrowth(n, econ, n.laws, rng), -0.03, 0.03) : 0;
  n.tech = Math.max(0.2, n.tech * (1 + tg));

  const svGrowth = SERVICE_LAWS[n.laws.services].growth;
  for (const r of econ.regions) {
    const fed = ECON.growthMax * clamp((r.foodRatio - 1) / ECON.growthHeadroom, ECON.famineFloor, 1);
    const hunger = fed < 0 ? fed * (1 - Math.min(0.9, modSum(n, "famineShield"))) : 0;
    const growth = (fed < 0 ? hunger : peopleGrowth(fed, n)) + modSum(n, "growth") + cityGrowthBonus(g, r.city);
    pf.famine += r.pop * hunger; pf.births += r.pop * (growth - hunger);
    scalePopulation(g, r.cells, 1 + growth);
  }
  peopleSeason(w, g, n, econ, pf, econ.pop);
  const migr = migrateNation(w, g, n, econ);
  pf.moved = migr.moved;

  const event = null;   // situations now come to you as decisions with a choice (section 11c)

  const after = computeEconomy(w, g, n.id);
  const perCap = after.people ? after.people.ls : after.gdp / Math.max(0.001, after.pop);
  const mood = n.lastLs ? clamp(ECON.moodWeight * (perCap / n.lastLs - 1) * 4, -ECON.moodCap, ECON.moodCap) : 0;
  n.lastLs = perCap;
  n.lastGdpPerCap = after.gdp / Math.max(0.001, after.pop);
  const terms = stabilityTerms(n, econ, budget, n.laws, mood, warStabilityTerms(g, n.id).concat(storyStabilityTerms(g, n)));
  const target = clamp(sumTerms(terms), 0, 100);
  const from = n.stability;
  n.stability = clamp(n.stability + ECON.stabPull * (target - n.stability), 0, 100);
  return { budget, terms, target, from, to: n.stability, event, discovered, crisis, siteNews, econ: after, migr, granary: econ.granary };
}

function regimeChange(n, rng) {
  const old = n.name;
  const kinds = n.minor ? Object.keys(MINOR_TITLES) : Object.keys(ARCHETYPES);
  n.archetype = pick(rng, kinds.filter(k => k !== n.archetype));
  const base = old.replace(/^(Republic of |Kingdom of |Free City of |Principality of )/, "").replace(/ (Dominion|Directorate)$/, "");
  n.name = n.minor ? MINOR_TITLES[n.archetype](base) : ARCHETYPES[n.archetype].title(base);
  n.laws = { ...n.laws, ...ARCHETYPES[n.archetype].laws };
  n.research = { target: null, progress: 0, queue: [] };
  n.leader = makeLeader(n, rng, n.history.length ? n.history[n.history.length - 1].turn : 0);
  n.stability = 40;
  n.baseStability = Math.max(n.baseStability, 50);
  return `${old} fell into civil war. The ${n.name} has taken power as a ${ARCHETYPES[n.archetype].label.toLowerCase()} state, led by ${leaderName(n)}.`;
}

function addChronicle(g, text, tone = "neutral", nid = null) {
  g.chronicle.unshift({ turn: g.turn, text, tone, nid });
  if (g.chronicle.length > 400) g.chronicle.length = 400;
}


/* The whole world takes one season. Touches no DOM; returns the dispatch to show the player.
   `plan` carries the rivals' decisions (from Claude or the built-in rules), made at the start of the season. */
function runSeason(w, g, plan) {
  const rng = mulberry32((w.seed * 7919 + g.turn * 104729 + 17) >>> 0);
  const dispatch = { season: seasonLabel(g.turn), player: null, abroad: [], built: [], warnings: [], war: [], diplomacy: [], economy: [], ambitions: [], firsts: [], decisions: [], leader: [], cabinet: [], opening: [], cities: [], groups: [], trade: [] };
  const ownersBefore = new Map(g.cities.map(c => [c.id, c.owner]));
  const pn = g.nations[PLAYER];
  const last = pn.history[pn.history.length - 1];

  // Envoys left unanswered count as a refusal, and a small slight.
  for (const it of g.inbox) {
    if (it.status !== "open" || g.turn < it.expires) continue;
    respondToEnvoy(g, w, it, false, true);
    dispatch.diplomacy.push(`You left the ${nameOf(g, it.from)}'s envoy without an answer. They took it as a refusal.`);
  }
  expireDecisions(w, g, dispatch);
  reviewEmbargoes(w, g, dispatch);   // rivals keep or lift their embargoes, by fixed rules (10t)
  rivalPreferredSellers(w, g);

  for (const n of g.nations) n.navyUpkeep = g.sea ? navyUpkeep(g, n.id) : 0;
  // Rivals act on the decisions they made at the start of the season.
  for (const n of liveNations(g)) {
    if (n.isPlayer) continue;
    const menu = (plan && plan.menus && plan.menus[n.id]) || buildMenu(g, w, n);
    const orders = (plan && plan.orders && plan.orders[n.id]) || ruleOrders(g, w, n, menu);
    applyOrders(g, w, n, orders, menu, dispatch);
    tradeEarlyWarning(w, g, n, menu, orders, dispatch);
  }
  cabinetSeasonStart(w, g, dispatch);
  const worksPaid = advanceWorks(w, g, dispatch);

  payTributes(g);
  for (const e of expireTreaties(g)) dispatch.diplomacy.push(e.text);

  const reports = g.nations.map(n => (n.alive ? runNationSeason(w, g, n, rng) : null));
  reports.forEach((r, id) => {
    if (!r) return;
    const n = g.nations[id];
    if (r.discovered) {
      leaderDeed(g, id, "techs");
      const t = `${id === PLAYER ? "Your scientists" : `The ${n.name}'s scientists`} completed ${TECHS[r.discovered].label}. ${TECHS[r.discovered].does}`;
      if (id === PLAYER) dispatch.economy.push({ text: t, tone: "good" }); else { dispatch.abroad.push({ nid: id, text: `Developed ${TECHS[r.discovered].label}.`, why: null }); noteFor(n, g, `Developed ${TECHS[r.discovered].label}.`, null); }
      addChronicle(g, t, "good", id);
    }
    if (r.crisis) {
      if (id === PLAYER) dispatch.economy.push({ text: r.crisis, tone: "bad" }); else dispatch.abroad.push({ nid: id, text: r.crisis, why: null });
      addChronicle(g, `${id === PLAYER ? "" : `${n.name}: `}${r.crisis}`, "bad", id);
    }
  });
  if (reports[PLAYER]) for (const x of depthNews(w, g, g.nations[PLAYER], reports[PLAYER])) dispatch.economy.push(x);
  reports.forEach((r, id) => {
    if (!r) return;
    for (const x of r.siteNews || []) {
      if (id === PLAYER) dispatch.economy.push(x);
      if (x.tone === "bad" || id === PLAYER) addChronicle(g, id === PLAYER ? x.text : `${g.nations[id].name}: ${x.text}`, x.tone === "bad" ? "bad" : "neutral", id);
    }
  });
  regrowNature(w, g);
  for (const x of prospect(w, g, rng)) {
    if (x.nid === PLAYER) { dispatch.economy.push({ text: `${x.text} Click it on the map to see how much is there.`, tone: "good" }); addChronicle(g, x.text, "good", PLAYER); }
  }
  for (const x of updateWorldPrices(w, g, rng, reports.map(r => r && r.econ))) { dispatch.economy.push({ text: x.text, tone: "neutral" }); addChronicle(g, x.text, "neutral", null); }
  for (const n of liveNations(g)) {
    for (const q of runPrivateInvestment(w, g, n)) {
      if (n.id === PLAYER) dispatch.economy.push({ text: `Private investors began ${q.label.charAt(0).toLowerCase()}${q.label.slice(1)} (${fmtMoney(q.cost)}).`, tone: "neutral" });
    }
  }

  const wars = runMilitarySeason(w, g, rng, dispatch);

  for (const p of advanceProjects(w, g)) {
    const n = g.nations[p.nid];
    const text = p.failed ? `${p.label} failed: the land was lost before it was finished. Half the cost was refunded.` : p.kind === "survey" ? surveyText(w, g, p) : p.kind === "ships" ? shipsDoneText(p) : p.kind === "focus" ? focusDoneText(g, p) : p.kind === "capital" ? `The government has moved: ${(g.cities.find(c => c.id === p.cityId) || { name: "the new city" }).name} is the new capital.` : `${p.label} is complete.`;
    if (p.nid === PLAYER) dispatch.built.push({ text: p.private ? `${text} (built by private investors)` : text, tone: p.failed ? "bad" : "good" });
    else if (!p.private && !(p.kind === "ships" && p.ship === "freighter")) { dispatch.abroad.push({ nid: p.nid, text, why: null }); noteFor(n, g, text, null); }
    if ((!p.private && !(p.kind === "ships" && p.ship === "freighter")) || p.nid === PLAYER) addChronicle(g, p.nid === PLAYER ? text : `${n.name}: ${text}`, p.failed ? "bad" : "neutral", p.nid);
  }

  for (const x of ageLeaders(g, rng)) {
    if (x.nid === PLAYER) { dispatch.leader.push(x.text); addChronicle(g, x.text, "warn", PLAYER); continue; }
    dispatch.abroad.push({ nid: x.nid, text: x.text, why: null });
    noteFor(g.nations[x.nid], g, x.text, null);
    addChronicle(g, x.text, "warn", x.nid);
  }
  decayRelations(g);
  driftTrust(g);
  dispatch.diplomacy.push(...checkCommitments(g));
  runAssembly(w, g, rng, dispatch);

  for (const n of liveNations(g)) {
    if (n.isPlayer || n.stability > 0.5) continue;
    const text = regimeChange(n, rng);
    dispatch.abroad.push({ nid: n.id, text, why: null });
    addChronicle(g, text, "warn", n.id);
    noteFor(n, g, text, null);
  }
  for (const t of checkEliminations(g)) { dispatch.war.push(t); addChronicle(g, t, "bad", null); }
  tradeForgetDead(g);
  for (const t of wars.news) addChronicle(g, t, "warn", null);
  dispatch.battles = wars.reports.filter(r => r.attacker === PLAYER || r.defender === PLAYER || sameSideAs(g, PLAYER, r.attacker) || sameSideAs(g, PLAYER, r.defender));

  recordSeasonStats(g, wars.reports, ownersBefore);
  const pr = reports[PLAYER];
  for (const n of g.nations) n.navyUpkeep = g.sea ? navyUpkeep(g, n.id) : 0;
  g.turn += 1;
  for (const n of g.nations) {
    if (!n.alive) continue;
    const h = historyEntry(n, computeEconomy(w, g, n.id), g.turn, g);
    n.history.push(h);
    if (n.history.length > STATS_KEEP) n.history.shift();
    updatePeaks(g, n, h);
  }
  openingSeason(w, g, dispatch);
  cabinetSeasonEnd(w, g, dispatch, rng);
  seasonCities(w, g, dispatch);
  seasonGroups(w, g, dispatch);
  if (g.turn % 4 === 2) {
    rollHarvests(w, g);
    const h = harvestFactor(g.nations[PLAYER]);
    const P = g.nations[PLAYER];
    const dry = P.droughtTurn != null && g.turn - P.droughtTurn <= 1;
    const store = monthsOfFood((P.granary && P.granary.stock) || 0, P.history.length ? P.history[P.history.length - 1].pop || 0 : 0);
    if (P.alive && (Math.abs(h - 1) >= 0.03 || dry)) dispatch.economy.push({ text: `The harvest is in: ${harvestWord(h)}, ${pct(h)} of a normal year${dry ? ", after the dry summer" : ""}. It feeds the nation until next autumn.${h < 0.95 ? (store >= 0.5 ? ` If the fields can't feed everyone, the national reserve (${fmt1(store)} months of food) makes up the rest while it lasts.` : " There is no grain in the national reserve to make up a shortfall.") : ""}`, tone: h < 0.95 ? "warn" : "good" });
  }
  // merchants sign next season's contracts, with the harvest known (10s); the season's statistics then show them
  noteEmbargoCuts(g);
  for (const x of clearWorldTrade(w, g, { history: true })) { dispatch.trade.push(x); addChronicle(g, x.text, x.tone === "good" ? "good" : x.tone === "warn" ? "warn" : "neutral", PLAYER); }
  refreshEmbargoes(w, g);
  rivalFoodAid(w, g, dispatch);
  checkGrowthDeeds(w, g);
  checkFirsts(w, g, dispatch);
  if (g.nations[PLAYER].alive) checkAmbitions(w, g, dispatch);
  dispatch.decisions = storyteller(w, g, rng, dispatch);
  checkIntel(w, g, dispatch);
  pruneMods(g);
  for (const x of g.epiNews || []) { if (x.nid === PLAYER) dispatch.leader.push(x.text); else dispatch.abroad.push({ nid: x.nid, text: x.text, why: null }); }
  g.epiNews = [];
  for (const n of g.nations) { const h = n.history[n.history.length - 1]; if (h && h.turn === g.turn) h.prestige = Math.round(n.prestige || 0); }
  const now = computeEconomy(w, g, PLAYER);
  dispatch.player = {
    report: pr,
    gdp: now.gdp, gdpChange: last.gdp ? now.gdp / last.gdp - 1 : 0,
    pop: now.pop, popChange: last.pop ? now.pop / last.pop - 1 : 0,
    treasury: pn.treasury, balance: pr ? pr.budget.balance - (pr.event ? pr.event.cost : 0) - (worksPaid[PLAYER] || 0) : 0, worksPaid: worksPaid[PLAYER] || 0,
    losses: pn.lastLosses || 0,
  };
  pn.lastLosses = 0;
  if (pr && pr.event) addChronicle(g, `${pr.event.title}. ${pr.event.text}`, pr.event.tone, PLAYER);
  if ((now.unemployment || 0) > 0.1) dispatch.warnings.push(`${pct(now.unemployment)} of your workers have no job. People leave towns without work, and the jobless are angry. Mines, factories and offices create jobs, and so do roads that join towns to a bigger market.`);
  if (now.famineShare > 0.02) dispatch.warnings.push(`${pct(now.famineShare)} of your people don't have enough food. Join hungry towns to farmland by road, irrigate, or settle new farmland.`);
  if (now.isolated.length) dispatch.warnings.push(`${now.isolated.map(c => c.name).join(", ")} ${now.isolated.length > 1 ? "are" : "is"} not joined to your capital by road. Each cut-off town costs stability and misses out on trade.`);
  if (pn.treasury < 0 && pr && pr.budget.balance < 0) dispatch.warnings.push(`You are borrowing ${fmtMoney(-pr.budget.balance)} a season. Interest rises once debt passes 60% of GDP.`);
  dispatch.envoys = g.inbox.filter(it => it.status === "open" || (it.status === "info" && it.turn === g.turn - 1)).length;
  dispatch.weather = seasonWar(g);
  return dispatch;
}

