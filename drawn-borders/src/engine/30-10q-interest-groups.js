/* =====================================================================
   10q. Interest groups: who holds power in the nation, what they want, and what they do when they are angry
   Borrowed ideas: Victoria 3 (groups whose power comes from the real economy), Tropico (factions with demands),
   Hearts of Iron and real history (a strong, angry army may move against the government).
   Power comes from what the nation is: factory and mine workers give the unions their weight, trade and banks
   give business theirs, soldiers under arms give the generals theirs. Approval comes from the laws and from what
   happens. Every number lists its causes.
   ===================================================================== */
const GROUP_ORDER = ["workers", "business", "army", "farmers", "faith"];
const GROUPS = {
  workers:  { label: "Workers", short: "Workers", the: "the workers", are: "are", icon: "delapouite/mining-helmet", color: "#d0644f",
              who: "Factory, mine, dock, railway and shop workers, and their unions.",
              wants: "Good healthcare and welfare, jobs for everyone, full shops, and not too many sons sent to the army.",
              happy: "They work willingly: output up to +2%.", angry: "They work slowly (output up to −2%) and may call a general strike." },
  business: { label: "Business", short: "Business", the: "business", are: "is", icon: "delapouite/briefcase", color: "#d9a441",
              who: "Industrialists, merchants, bankers and shipowners.",
              wants: "Low taxes, open trade, loose banking rules, small debts and a growing economy.",
              happy: "They invest more: private investment up to +25%.", angry: "They send their money abroad: private investment up to −40%." },
  army:     { label: "The army", short: "Army", the: "the army", are: "is", icon: "lorc/crossed-swords", color: "#8c9a5b",
              who: "Officers, generals and veterans.",
              wants: "A big army with good weapons, victories, and no land given away.",
              happy: "They serve with zeal: divisions train harder (+3% experience).", angry: "Officers may plot against the government." },
  farmers:  { label: "Farmers", short: "Farmers", the: "the farmers", are: "are", icon: "delapouite/farm-tractor", color: "#7fae4e",
              who: "Landowners, smallholders and farm workers.",
              wants: "Good prices for their grain: a state that buys it for the food reserve, and protection from cheap imports.",
              happy: "They farm harder: food up to +3%.", angry: "They hold back their grain (food up to −3%) and may block the roads." },
  faith:    { label: "Faith and tradition", short: "Faith", the: "the faithful", are: "are", icon: "delapouite/byzantin-temple", color: "#a98bd6",
              who: "Priests and temples, old families, villages and old towns.",
              wants: "Order, old customs, help for the poor, peace, and schools that do not turn the young against tradition.",
              happy: "They calm the country (counted in stability).", angry: "They fill the squares with protests." },
};
const GRP = {
  pull: 0.25, stabK: 0.2, stabCap: 8, demandAfter: 6, deadline: 8, met: 10, broken: -8, modSeasons: 12,
  happyAt: 68, angryAt: 32, crisisAt: 30, crisisShare: 0.15, ministerBonus: 3, ministerCap: 6, histMax: 24,
};
// which group a new minister comes from, by ministry
const MINISTER_GROUPS = {
  interior:    { workers: 0.35, faith: 0.3, business: 0.2, farmers: 0.15 },
  economy:     { business: 0.6, workers: 0.2, farmers: 0.1, faith: 0.1 },
  agriculture: { farmers: 0.7, faith: 0.15, business: 0.15 },
  energy:      { business: 0.5, workers: 0.4, army: 0.1 },
  defence:     { army: 0.75, business: 0.1, faith: 0.15 },
  foreign:     { business: 0.4, faith: 0.3, army: 0.15, workers: 0.15 },
};
function ministerGroupPick(key, face) {
  const W = MINISTER_GROUPS[key] || { workers: 0.2, business: 0.2, army: 0.2, farmers: 0.2, faith: 0.2 };
  let x = ((face || 0) % 1000) / 1000;
  for (const k of GROUP_ORDER) { const p = W[k] || 0; if (x < p) return k; x -= p; }
  return GROUP_ORDER.find(k => W[k]) || "workers";
}
function ministerGroup(m) { return m ? (m.group && GROUPS[m.group] ? m.group : ministerGroupPick(m.key, m.face)) : null; }
function groupWord(v) { return v >= 75 ? "loyal" : v >= GRP.happyAt ? "pleased" : v >= 45 ? "content" : v >= GRP.angryAt ? "unhappy" : v >= 18 ? "angry" : "furious"; }

/* ---------- Their state, kept on the nation ---------- */
function ensureGroups(w, g, n, econ) {
  if (n.groups && GROUP_ORDER.every(k => n.groups[k])) return n.groups;
  n.groups = n.groups || {};
  const e = econ || computeEconomy(w, g, n.id);
  const S = groupShares(g, n, e);
  const ctx = groupCtx(w, g, n, e);
  for (const k of GROUP_ORDER) {
    if (n.groups[k]) continue;
    const t = groupTarget(w, g, n, e, n.laws, k, ctx);
    n.groups[k] = { approval: t, target: t, share: S.share[k], mods: [], demand: null, lastDemand: -99, hist: [Math.round(t)] };
  }
  return n.groups;
}
function groupOf(n, k) { return n && n.groups ? n.groups[k] || null : null; }
function addGroupMod(g, n, k, key, label, v, seasons) {
  const s = groupOf(n, k);
  if (!s || !v) return;
  s.mods = (s.mods || []).filter(m => m.key !== key);
  s.mods.push({ key, label, v, until: seasons ? g.turn + seasons + 1 : null });
}
function groupModsActive(g, s) { return (s.mods || []).filter(m => m.until === null || m.until === undefined || m.until > g.turn); }

/* ---------- Power: what the nation is made of decides who has weight ---------- */
function groupShares(g, n, econ) {
  const W = Math.max(0.01, econ.workforce || 0);
  const sec = (econ.sectors && econ.sectors.secondary) || { workers: 0, va: 0 };
  const ter = (econ.sectors && econ.sectors.tertiary) || { workers: 0, va: 0 };
  const pri = (econ.sectors && econ.sectors.primary) || { workers: 0, va: 0 };
  const subs = Array.isArray(econ.subs) ? econ.subs : Object.values(econ.subs || {});
  const agri = subs.find(s => s.sub === "Agriculture") || { workers: pri.workers, va: pri.va };
  const mines = Math.max(0, pri.workers - agri.workers);
  const small = econ.smallholders || 0;
  const L = n.laws;
  const P = {};
  const add = (k, label, pts) => { P[k] = P[k] || { pts: 0, lines: [] }; if (Math.abs(pts) >= 0.3) { P[k].pts += pts; P[k].lines.push({ label, pts: Math.round(pts * 10) / 10 }); } };
  // workers
  add("workers", `${fmtPeople(sec.workers + mines)} in mines, plants and works`, 100 * (sec.workers + mines) / W);
  add("workers", `${fmtPeople(ter.workers)} in shops, transport and offices`, 35 * ter.workers / W);
  add("workers", `${fmtPeople(econ.unemployed || 0)} without a job`, 50 * (econ.unemployed || 0) / W);
  { const U = labourLaw(L, "unions"); if (U.power) add("workers", U.power > 0 ? "Strong unions organize the workers" : "Unions are banned: workers cannot organize", U.power); }
  // business
  const nonFarm = econ.gdp > 0 ? clamp(1 - agri.va / econ.gdp, 0, 1) : 0.5;
  add("business", `Industry, trade and services make ${pct(nonFarm)} of the economy`, 35 * nonFarm);
  add("business", "Banks, head offices and broadcasters", Math.min(8, 2 * (((econ.levels || {}).business || 0) + ((econ.levels || {}).broadcast || 0))));
  if (L.finance === "loose") add("business", "Loose banking rules give bankers sway", 4);
  if (L.finance === "strict") add("business", "Strict banking rules keep bankers in check", -3);
  if (L.trade === "free") add("business", "Free trade enriches the merchants", 3);
  // army
  const men = (n.mil && n.mil.men) || n.soldiers || 0;
  add("army", `${fmtCount(men)} soldiers under arms`, 400 * (men / 1e6) / W);
  if (g.wars && g.wars.some(x => x.sideA.includes(n.id) || x.sideB.includes(n.id))) add("army", "The nation is at war", 10);
  if (L.arms === "high") add("army", "High arms production", 4);
  if (L.arms === "war") add("army", "A war economy", 8);
  // farmers
  add("farmers", `${fmtPeople(agri.workers)} work the farms`, 80 * agri.workers / W);
  add("farmers", `${fmtPeople(small)} live on family plots`, 40 * small / W);
  if ((econ.famineShare || 0) > 0.01) add("farmers", "Food is short: whoever has grain has power", 5);
  // faith
  add("faith", "Temples, old families and old customs", 10);
  add("faith", "Village and farm people hold to tradition", 25 * (agri.workers + small) / W);
  const old = (econ.cities || []).filter(c => (c.roles || []).includes("heritage")).length;
  if (old) add("faith", `Old towns (${old})`, Math.min(6, 2 * old));
  const edu = { minimal: 6, basic: 3, good: 0, excellent: -3 }[L.education || "basic"] || 0;
  if (edu) add("faith", edu > 0 ? "Few schools: tradition rules the villages" : "Good schools teach new ideas", edu);
  if ((g.era || 0) > 0) add("faith", "The modern age", -1.5 * (g.era || 0));
  for (const k of GROUP_ORDER) { P[k] = P[k] || { pts: 0, lines: [] }; P[k].pts = Math.max(k === "faith" ? 4 : 1, P[k].pts); P[k].lines.sort((a, b) => b.pts - a.pts); }
  const tot = GROUP_ORDER.reduce((s, k) => s + P[k].pts, 0);
  const share = {};
  for (const k of GROUP_ORDER) share[k] = P[k].pts / tot;
  return { pow: P, share };
}

/* ---------- What each group feels, and why ---------- */
function groupCtx(w, g, n, econ) {
  const wars = (g.wars || []).filter(x => x.sideA.includes(n.id) || x.sideB.includes(n.id));
  const attacking = wars.find(x => x.sideA[0] === n.id && g.turn - (x.since ?? g.turn) >= 6) || null;
  const h = n.history || [];
  const gNow = h.length ? h[h.length - 1].gdp : econ.gdp, gYear = h.length > 4 ? h[h.length - 5].gdp : null;
  const lost = g.cities.filter(c => c.origin === n.id && c.owner !== n.id && g.nations[c.owner] && g.nations[c.owner].alive && (c.loyalty ?? 92) < CITY.integrate).sort((a, b) => (b.imp || 0) - (a.imp || 0))[0] || null;
  return {
    econ, budget: computeBudget(n, econ, n.laws), wars, atWar: wars.length > 0, attacking,
    warScore: wars.length ? Math.min(...wars.map(x => sideScore(x, n.id))) : 0,
    growth: gYear && gYear > 0 ? gNow / gYear - 1 : null,
    divs: (g.divisions || []).filter(d => d.owner === n.id).length,
    lost, threat: maxThreatTo(w, g, n.id).level,
  };
}
function groupTerms(w, g, n, econ, L, k, ctx) {
  const out = [];
  const T = (label, v) => { if (Math.abs(v) >= 0.4) out.push({ label, value: Math.round(v * 10) / 10 }); };
  const tax = { 15: 1, 25: 0, 35: -1, 45: -2 }[L.tax] ?? 0;
  const u = econ.unemployment || 0;
  if (k === "workers") {
    T(`${SERVICE_LAWS[L.services].label} healthcare and welfare`, { minimal: -12, basic: 0, good: 7, generous: 12 }[L.services] || 0);
    if (tax) T(`${taxLaw(L.tax).label} taxes`, { 1: 2, [-1]: -3, [-2]: -8 }[tax] || 0);
    if (L.education === "excellent") T("Excellent schools for their children", 2);
    if (L.education === "minimal") T("Hardly any schools for their children", -3);
    if (u > 0.05) T(`${pct1(u)} of workers have no job`, -clamp((u - 0.05) * 200, 0, 20));
    else if (u < 0.02) T("Plenty of work", 4);
    if (econ.sat && econ.sat.goods < 0.6) T(`Empty shops (${pct(econ.sat.goods)} of goods wanted)`, -clamp((0.6 - econ.sat.goods) * 20, 0, 10));
    if (L.army === "large") T("Their sons are drafted (broad draft)", -3);
    if (L.army === "mobilized") T("Total mobilization takes their sons", -8);
    if (L.arms === "high") T("Long shifts in the arms factories", -3);
    if (L.arms === "war") T("A war economy: rationing and endless shifts", -7);
    if (L.trade === "protect") T("Protected industries keep jobs safe", 3);
    if (L.trade === "free") T("Free trade puts jobs at risk", -4);
    if ((econ.famineShare || 0) > 0.002) T("Hunger in the cities", -clamp(econ.famineShare * 60, 0, 15));
  } else if (k === "business") {
    T(`${taxLaw(L.tax).label} taxes`, { 1: 10, 0: 0, [-1]: -8, [-2]: -18 }[tax] ?? 0);
    T(`Banking rules: ${FINANCE_LAWS[L.finance || "balanced"].label.toLowerCase()}`, { strict: -6, balanced: 0, loose: 5 }[L.finance || "balanced"] || 0);
    T(`Trade policy: ${TRADE_LAWS[L.trade || "balanced"].label.toLowerCase()}`, { protect: -4, balanced: 0, free: 6 }[L.trade || "balanced"] || 0);
    if (L.services === "generous") T("Universal healthcare means high taxes on firms", -4);
    if (RESEARCH_ORDER.indexOf(L.research || "low") >= 2) T("Research money helps new industries", 2);
    if (ctx.budget && ctx.budget.debtRatio > 0.6) T(`Debt at ${pct(ctx.budget.debtRatio)} of output`, -clamp((ctx.budget.debtRatio - 0.6) * 20, 0, 10));
    if (ctx.growth !== null && ctx.growth > 0.03) T(`A growing economy (+${pct1(ctx.growth)} in a year)`, 4);
    else if (ctx.growth !== null && ctx.growth < 0) T(`A shrinking economy (${pct1(ctx.growth)} in a year)`, -6);
    if (n.crisisUntil > g.turn) T("A banking crisis", -10);
    if (ctx.atWar) T(ARMS_ORDER.indexOf(L.arms || "low") >= 3 ? "War brings arms contracts" : "War disrupts trade", ARMS_ORDER.indexOf(L.arms || "low") >= 3 ? 3 : -4);
    // trade between nations (10s): our own bans cost the exporters; a rival's ban hurts our merchants
    const ban = ourBanLoss(g, n);
    if (ban) T(ban.v >= 0.005 ? `Our trade bans cost exporters ${bMoney(ban.v)} a year (goods nobody else buys)` : "Our trade bans (merchants dislike them)", banTerm(ban.v, econ));
    const hit = [...new Set(embargoesOn(g, n.id).filter(e => g.nations[e.by] && g.nations[e.by].alive).map(e => e.by))];
    if (hit.length) T(hit.length === 1 ? `The ${nameOf(g, hit[0])}'s trade ban hurts our merchants` : `Trade bans by ${bJoin(hit.map(b => `the ${nameOf(g, b)}`))} hurt our merchants`, -2);
  } else if (k === "army") {
    T(`Conscription: ${ARMY_LAWS[L.army].label.toLowerCase()}`, { small: -12, standard: -4, large: 3, mobilized: 6 }[L.army] || 0);
    T(`Arms production: ${ARMS_LAWS[L.arms || "low"].label.toLowerCase()}`, { none: -10, low: -4, medium: 0, high: 4, war: 6 }[L.arms || "low"] || 0);
    if (ctx.atWar && ctx.warScore > 20) T("Winning the war", 6);
    else if (ctx.atWar && ctx.warScore < -20) T("Losing the war", -8);
    if ((econ.armsSat ?? 1) < 0.6 && ctx.divs) T("Soldiers without enough weapons", -5);
    if (ctx.lost) T(`${ctx.lost.name} is in foreign hands`, -3);
    if (ctx.threat > 0.6 && ARMY_ORDER.indexOf(L.army) < 2) T("A dangerous neighbor, and too few soldiers", -4);
  } else if (k === "farmers") {
    T(`Trade policy: ${TRADE_LAWS[L.trade || "balanced"].label.toLowerCase()}`, { protect: 6, balanced: 0, free: -7 }[L.trade || "balanced"] || 0);
    T(`Food reserve: the state buys ${GRANARY_LAWS[L.granary || "none"].months ? `${GRANARY_LAWS[L.granary || "none"].months} months of grain` : "no grain"}`, { none: -4, small: 0, medium: 3, large: 5 }[L.granary || "none"] || 0);
    if ((n.mods || []).some(m => m.key === "farm_subsidy" && (m.until === null || m.until > g.turn))) T("Farm subsidies", 8);
    if (harvestFactor(n) < 0.95) T("A poor harvest", -5);
    if (tax) T(`${taxLaw(L.tax).label} taxes`, { 1: 2, [-1]: -2, [-2]: -5 }[tax] || 0);
    if (L.army === "mobilized") T("Total mobilization takes the farm hands", -4);
    const irr = (econ.cities || []).filter(c => c.irrigated).length;
    if (irr) T(`Irrigated fields (${irr} town${irr > 1 ? "s" : ""})`, Math.min(3, irr));
    if (embargoesBy(g, n.id).some(e => e.dir !== "buy" && (e.k === "food" || (e.k === "all" && e.food)))) T("Our ban on selling grain abroad", -3);
  } else if (k === "faith") {
    T(`${EDU_LAWS[L.education || "basic"].label} schools`, { minimal: 3, basic: 0, good: -2, excellent: -5 }[L.education || "basic"] || 0);
    T(`${SERVICE_LAWS[L.services].label} help for the poor`, { minimal: -4, basic: 0, good: 2, generous: 3 }[L.services] || 0);
    if (ctx.attacking) T(`A long war of our own making against the ${nameOf(g, ctx.attacking.sideB[0])}`, -5);
    else if (ctx.atWar && ctx.wars.some(x => x.sideB.includes(n.id))) T("Defending the homeland", 2);
    if (n.stability < 35) T("Disorder in the country", -5);
    if (L.trade === "free") T("Foreign goods and foreign ways", -2);
    if (((g.trade && g.trade.aid) || []).some(a => a.from === n.id && g.turn - a.turn < 8)) T("We fed the hungry abroad", 2);
  }
  peopleGroupTerms(n, econ, L, k, T);
  // their people in the government
  const mins = MIN_ORDER.filter(key => ministryActive(n, key) && ministerGroup(n.cabinet.min[key].minister) === k);
  if (mins.length) T(`Their people in the government: ${mins.map(key => `${n.cabinet.min[key].minister.name} (${MINISTRIES[key].label})`).join(", ")}`, Math.min(GRP.ministerCap, GRP.ministerBonus * mins.length));
  const s = groupOf(n, k);
  if (s) for (const m of groupModsActive(g, s)) T(m.label, m.v);
  return out.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}
/* What our own embargoes cost our exporters, a year: goods we have left unsold that the nations we embargo still
   buy from the world market or go without (what they would buy from us without the ban). Read from the book.
   `skip`: leave one embargo out (what lifting it would change). */
function ourBanLoss(g, n, skip) {
  const E = embargoesBy(g, n.id).filter(e => g.nations[e.on] && g.nations[e.on].alive && e.id !== skip);
  if (!E.length) return null;
  const T = g.trade, ix = tradeIndex(g), left = {};
  let v = 0;
  for (const e of E) {
    if (e.dir === "buy") continue;
    for (const k of TRADE_GOODS) {
      if (!embargoCovers(e, k)) continue;
      if (!(k in left)) left[k] = (T.unsold[k] || [])[n.id] || 0;
      if (left[k] <= 1e-4) continue;
      const theirWorld = ((ix.into[e.on] || {})[k] || []).filter(f => f.s < 0).reduce((s, f) => s + f.q, 0);
      const q = Math.min(left[k], ((T.unmet[k] || [])[e.on] || 0) + theirWorld);
      left[k] -= q;
      v += goodWorth(g, k, q);
    }
  }
  return { v, count: E.length };
}
// business people's mood about our trade bans: −1, and −4 more for each 1% of output our exporters lose (at most −8)
function banTerm(v, econ) { return -clamp(1 + 4 * 100 * v / Math.max(1, econ.gdp), 1, 8); }
function grainBanOf(g, nid, skip) { return embargoesBy(g, nid).some(e => e.id !== skip && e.dir !== "buy" && (e.k === "food" || (e.k === "all" && e.food))); }
/* How a new embargo of ours would move the groups' mood while it lasts (the same terms as groupTerms): business by
   the sales our exporters would lose (from the embargo preview), farmers when it stops grain sales. */
function banGroupDelta(g, n, econ, lost, food) {
  const cur = ourBanLoss(g, n), out = {};
  const b = Math.round(banTerm((cur ? cur.v : 0) + Math.max(0, lost), econ) - (cur ? banTerm(cur.v, econ) : 0));
  if (b) out.business = b;
  if (food && !grainBanOf(g, n.id)) out.farmers = -3;
  return out;
}
/* And what lifting one of our embargoes would give back. */
function liftGroupDelta(g, n, econ, e) {
  const cur = ourBanLoss(g, n), rest = ourBanLoss(g, n, e.id), out = {};
  const b = Math.round((rest ? banTerm(rest.v, econ) : 0) - (cur ? banTerm(cur.v, econ) : 0));
  if (b) out.business = b;
  if (grainBanOf(g, n.id) && !grainBanOf(g, n.id, e.id)) out.farmers = 3;
  return out;
}
/* "Business −3, Farmers −3 (approval, while it lasts)": the lasting mood change of a trade action, for its order. */
function lastingGroupText(d, when) {
  const parts = GROUP_ORDER.filter(k => d[k]).map(k => `${GROUPS[k].short} ${signed(d[k])}`);
  return parts.length ? `${parts.join(", ")} (approval, ${when})` : "";
}
function groupTarget(w, g, n, econ, L, k, ctx) {
  return Math.round(clamp(50 + groupTerms(w, g, n, econ, L, k, ctx || groupCtx(w, g, n, econ)).reduce((s, t) => s + t.value, 0), 5, 95) * 10) / 10;
}
/* How a law would change each group's mood: shown on the law buttons. */
function groupLawDelta(w, g, n, law, value) {
  const econ = computeEconomy(w, g, n.id);
  const ctx = groupCtx(w, g, n, econ);
  const L2 = { ...n.laws, [law]: law === "tax" ? Number(value) : value };
  const out = {};
  for (const k of GROUP_ORDER) out[k] = Math.round(groupTarget(w, g, n, econ, L2, k, ctx) - groupTarget(w, g, n, econ, n.laws, k, ctx));
  return out;
}

/* ---------- Demands: one at a time per group, with a deadline ---------- */
const lawIs = (n, law, list) => list.includes(n.laws[law]);
const GROUP_DEMANDS = {
  workers: [
    { key: "health", applies: (n) => lawIs(n, "services", ["minimal", "basic"]), met: (n) => lawIs(n, "services", ["good", "generous"]), law: () => ({ law: "services", value: "good" }), label: () => "Raise healthcare and welfare to good" },
    { key: "jobs", applies: (n, c) => (c.econ.unemployment || 0) > 0.07, met: (n, c) => (c.econ.unemployment || 0) < 0.06, label: () => "Bring unemployment below 6% (public works, new factories, mines)" },
    { key: "draft", applies: (n, c) => lawIs(n, "army", ["large", "mobilized"]) && !c.atWar, met: (n) => lawIs(n, "army", ["small", "standard"]), law: () => ({ law: "army", value: "standard" }), label: () => "End the broad draft (limited draft or volunteers)" },
    { key: "shifts", applies: (n, c) => lawIs(n, "arms", ["high", "war"]) && !c.atWar, met: (n) => lawIs(n, "arms", ["none", "low", "medium"]), law: () => ({ law: "arms", value: "medium" }), label: () => "Cut arms production to medium" },
    { key: "tax", applies: (n) => n.laws.tax >= 45, met: (n) => n.laws.tax <= 35, law: () => ({ law: "tax", value: 35 }), label: () => "Lower taxes to 35% or less" },
  ],
  business: [
    { key: "tax", applies: (n) => n.laws.tax >= 35, met: (n) => n.laws.tax <= 25, law: () => ({ law: "tax", value: 25 }), label: () => "Lower taxes to 25% or less" },
    { key: "trade", applies: (n) => lawIs(n, "trade", ["protect"]), met: (n) => !lawIs(n, "trade", ["protect"]), law: () => ({ law: "trade", value: "balanced" }), label: () => "End protectionism (balanced or free trade)" },
    { key: "banks", applies: (n) => lawIs(n, "finance", ["strict"]), met: (n) => !lawIs(n, "finance", ["strict"]), law: () => ({ law: "finance", value: "balanced" }), label: () => "Ease the banking rules (balanced or loose)" },
    { key: "debt", applies: (n, c) => c.budget && c.budget.debtRatio > 0.8, met: (n, c) => !c.budget || c.budget.debtRatio < 0.6, label: () => "Bring the debt below 60% of a year's output" },
    { key: "free", applies: (n, c) => lawIs(n, "trade", ["balanced"]) && (n.groups.business.share || 0) >= 0.25 && tradeOpen(c.econ), met: (n) => lawIs(n, "trade", ["free"]), law: () => ({ law: "trade", value: "free" }), label: () => "Free trade" },
  ],
  army: [
    { key: "winback", applies: (n, c) => !!c.lost, met: (n, c, d) => !!c.econ.cities.find(z => z.id === d.cityId), gone: (g, n, c, d) => { const city = g.cities.find(z => z.id === d.cityId); return !city || city.origin !== n.id; }, label: (n, c) => `Win back ${c.lost.name}`, extra: (n, c) => ({ cityId: c.lost.id }), deadline: 16 },
    { key: "draft", applies: (n) => lawIs(n, "army", ["small", "standard"]), met: (n, c, d) => ARMY_ORDER.indexOf(n.laws.army) > ARMY_ORDER.indexOf(d.from), law: (n) => ({ law: "army", value: ARMY_ORDER[ARMY_ORDER.indexOf(n.laws.army) + 1] }), label: (n) => `Raise conscription to ${ARMY_LAWS[ARMY_ORDER[ARMY_ORDER.indexOf(n.laws.army) + 1]].label.toLowerCase()}`, extra: (n) => ({ from: n.laws.army }) },
    { key: "arms", applies: (n) => lawIs(n, "arms", ["none", "low"]), met: (n) => !lawIs(n, "arms", ["none", "low"]), law: () => ({ law: "arms", value: "medium" }), label: () => "Raise arms production to medium" },
    { key: "divs", applies: (n, c) => c.divs < 6 || c.threat > 0.5, met: (n, c, d) => c.divs >= d.target, label: (n, c) => `Raise 2 more divisions (to ${c.divs + 2})`, extra: (n, c) => ({ target: c.divs + 2 }) },
  ],
  farmers: [
    { key: "reserve", applies: (n) => lawIs(n, "granary", ["none", "small"]), met: (n) => lawIs(n, "granary", ["medium", "large"]), law: () => ({ law: "granary", value: "medium" }), label: () => "Buy our grain: a food reserve of 4 months or more" },
    { key: "nofree", applies: (n) => lawIs(n, "trade", ["free"]), met: (n) => !lawIs(n, "trade", ["free"]), law: () => ({ law: "trade", value: "balanced" }), label: () => "End free trade in food (balanced or protected trade)" },
    { key: "protect", applies: (n) => lawIs(n, "trade", ["balanced"]) && (n.groups.farmers.share || 0) >= 0.3, met: (n) => lawIs(n, "trade", ["protect"]), law: () => ({ law: "trade", value: "protect" }), label: () => "Protect the farms from cheap imports" },
  ],
  faith: [
    { key: "poor", applies: (n) => lawIs(n, "services", ["minimal"]), met: (n) => !lawIs(n, "services", ["minimal"]), law: () => ({ law: "services", value: "basic" }), label: () => "Help the poor: healthcare and welfare of at least basic" },
    { key: "peace", applies: (n, c) => !!c.attacking, met: (n, c) => !c.attacking, label: () => "Make peace", labelG: (g, c) => `Make peace with the ${nameOf(g, c.attacking.sideB[0])}` },
    { key: "schools", applies: (n) => lawIs(n, "education", ["excellent"]), met: (n) => !lawIs(n, "education", ["excellent"]), law: () => ({ law: "education", value: "good" }), label: () => "Schools of the old kind (education good or lower)" },
    { key: "holiday", applies: (n) => !!ministry(n, "interior"), met: (n, c, d) => { const M = ministry(n, "interior"); return !!(M && M.cool && M.cool["fx:festival"] >= d.since); }, label: () => "A national holiday with parades (an order of the Interior minister)" },
  ],
};
function demandDef(k, key) { return (GROUP_DEMANDS[k] || []).find(d => d.key === key) || null; }

/* ---------- Each season: power, approval, demands ---------- */
function seasonGroups(w, g, dispatch) {
  const news = dispatch ? (dispatch.groups = dispatch.groups || []) : null;
  for (const n of g.nations) {
    if (!n.alive) continue;
    const econ = computeEconomy(w, g, n.id);
    ensureGroups(w, g, n, econ);
    const S = groupShares(g, n, econ);
    const ctx = groupCtx(w, g, n, econ);
    for (const k of GROUP_ORDER) {
      const s = n.groups[k], G = GROUPS[k];
      s.mods = groupModsActive(g, s);
      s.share = Math.round(S.share[k] * 1000) / 1000;
      const before = s.approval;
      s.target = groupTarget(w, g, n, econ, n.laws, k, ctx);
      s.approval = Math.round(clamp(s.approval + GRP.pull * (s.target - s.approval), 0, 100) * 10) / 10;
      s.hist = (s.hist || []).concat([Math.round(s.approval)]).slice(-GRP.histMax);
      const mine = n.id === PLAYER && news;
      // demands
      if (s.demand) {
        const D = demandDef(k, s.demand.key);
        if (D && D.gone && D.gone(g, n, ctx, s.demand)) { s.demand = null; s.lastDemand = g.turn; }
        else if (!D || D.met(n, ctx, s.demand)) {
          addGroupMod(g, n, k, `kept:${s.demand.key}`, `You did what they asked: ${s.demand.label.charAt(0).toLowerCase()}${s.demand.label.slice(1)}`, GRP.met, GRP.modSeasons);
          if (mine) news.push({ group: k, tone: "good", text: `${G.label}: you did what they asked (${s.demand.label.charAt(0).toLowerCase()}${s.demand.label.slice(1)}). Their approval rises.` });
          s.demand = null; s.lastDemand = g.turn;
        } else if (g.turn >= s.demand.until) {
          addGroupMod(g, n, k, `broken:${s.demand.key}`, `You ignored their demand: ${s.demand.label.charAt(0).toLowerCase()}${s.demand.label.slice(1)}`, GRP.broken, GRP.modSeasons);
          if (mine) news.push({ group: k, tone: "bad", text: `${G.label}: the time for their demand (${s.demand.label.charAt(0).toLowerCase()}${s.demand.label.slice(1)}) has run out. They feel ignored.` });
          s.demand = null; s.lastDemand = g.turn;
        }
      } else if (s.approval < 48 && g.turn >= 4 && g.turn - (s.lastDemand ?? -99) >= GRP.demandAfter) {
        const D = (GROUP_DEMANDS[k] || []).find(d => d.applies(n, ctx));
        if (D) {
          const L = D.law ? D.law(n, ctx) : null;
          s.demand = { key: D.key, label: D.labelG ? D.labelG(g, ctx) : D.label(n, ctx), since: g.turn, until: g.turn + (D.deadline || GRP.deadline), ...(L ? { law: L.law, value: L.value } : {}), ...(D.extra ? D.extra(n, ctx) : {}) };
          if (mine && s.share >= 0.1) news.push({ group: k, tone: "warn", text: `${G.label} (${pct(s.share)} of the power) ${G.are === "is" ? "demands" : "demand"}: ${s.demand.label.charAt(0).toLowerCase()}${s.demand.label.slice(1)}. You have ${s.demand.until - g.turn} seasons.` });
        }
      }
      // crossing into anger or pleasure
      if (mine && s.share >= 0.12) {
        if (before >= GRP.angryAt && s.approval < GRP.angryAt) {
          const why = groupTerms(w, g, n, econ, n.laws, k, ctx).filter(t => t.value < 0).slice(0, 2).map(t => t.label.charAt(0).toLowerCase() + t.label.slice(1));
          news.push({ group: k, tone: "bad", text: `${G.label} ${G.are} now angry (approval ${Math.round(s.approval)})${why.length ? `: ${why.join("; ")}` : ""}.` });
          addChronicle(g, `${G.label} turned against the government (approval ${Math.round(s.approval)}).`, "warn", PLAYER);
        } else if (before < GRP.happyAt && s.approval >= GRP.happyAt) news.push({ group: k, tone: "good", text: `${G.label} ${G.are} pleased with the government (approval ${Math.round(s.approval)}). ${G.happy}` });
      }
    }
  }
  return news;
}

/* ---------- What they do to the nation ---------- */
function groupStabilityTerms(g, n) {
  if (!n || !n.groups) return [];
  const out = [];
  let sum = 0;
  for (const k of GROUP_ORDER) {
    const s = n.groups[k];
    if (!s) continue;
    const v = (s.share || 0) * ((s.approval ?? 50) - 50) * GRP.stabK;
    if (Math.abs(v) < 0.3) continue;
    out.push({ label: `${GROUPS[k].label} ${GROUPS[k].are} ${groupWord(s.approval)} (approval ${Math.round(s.approval)}, ${pct(s.share)} of the power)`, value: v });
    sum += v;
  }
  if (Math.abs(sum) > GRP.stabCap) { const f = GRP.stabCap / Math.abs(sum); for (const t of out) t.value *= f; }
  return out;
}
/* Passive effects of a pleased or angry group, in proportion to its power (full effect from 25% of the power). */
function groupField(n, field) {
  if (!n || !n.groups) return 0;
  const f = k => { const s = n.groups[k]; return s ? Math.min(1, (s.share || 0) / 0.25) * (s.approval >= GRP.happyAt ? 1 : s.approval < GRP.angryAt ? -1 : 0) : 0; };
  if (field === "output") { const x = f("workers"); return x > 0 ? 0.02 * x : 0.02 * x; }
  if (field === "food") return 0.03 * f("farmers");
  if (field === "invest") { const x = f("business"); return x > 0 ? 0.25 * x : 0.4 * x; }
  if (field === "drill") { const x = f("army"); return x > 0 ? 0.03 * x : 0; }
  return 0;
}
/* A minister who is dismissed takes his group's goodwill with him. */
function groupMinisterDismissed(g, n, m) {
  const k = ministerGroup(m);
  if (!k || !n.groups) return;
  addGroupMod(g, n, k, `dismissed:${m.id}`, `${m.name}, one of theirs, was dismissed`, -6, 8);
}
/* Land won and lost: the army remembers. */
function groupsCityChanged(g, city, from, to) {
  if (to < 0 || to === from) return;
  const war = atWar(g, from, to);
  const A = g.nations[to], B = g.nations[from];
  if (A && A.groups) addGroupMod(g, A, "army", `won:${city.id}`, `${city.name} was won${war ? " in war" : ""}`, war ? 5 : 2, 12);
  if (B && B.groups && B.alive) {
    addGroupMod(g, B, "army", `lost:${city.id}`, war ? `${city.name} was lost in war` : `${city.name} was given away`, war ? -5 : -8, 16);
    if (!war) addGroupMod(g, B, "faith", `lost:${city.id}`, `${city.name} was given away`, -3, 12);
  }
}
/* What a rival government does for its strongest unhappy group: the law it asks for. */
function groupLawWishes(g, n) {
  if (!n.groups) return [];
  return GROUP_ORDER.map(k => ({ k, s: n.groups[k] })).filter(x => x.s && x.s.demand && x.s.demand.law && x.s.approval < 45 && (x.s.share || 0) >= 0.18)
    .sort((a, b) => b.s.share * (50 - b.s.approval) - a.s.share * (50 - a.s.approval)).slice(0, 1)
    .map(x => ({ law: x.s.demand.law, value: x.s.demand.value, why: `satisfy ${GROUPS[x.k].the}` }));
}

/* ---------- Effects on groups from decisions and orders ---------- */
function groupEffectText(e) {
  const parts = GROUP_ORDER.filter(k => e.v && e.v[k]).map(k => `${GROUPS[k].short} ${signed(e.v[k])}`);
  return { text: `${parts.join(", ")} (approval, ${e.seasons ? `${e.seasons} seasons` : "for good"})`, tone: toneOf(GROUP_ORDER.reduce((s, k) => s + (e.v[k] || 0), 0)) };
}
function applyGroupEffect(g, n, e, why) {
  if (!n.groups) return;
  for (const k of GROUP_ORDER) if (e.v && e.v[k]) addGroupMod(g, n, k, `fx:${e.key || why || "x"}:${k}`, e.label || why || "A government decision", e.v[k], e.seasons || GRP.modSeasons);
}
function groupEffectScore(n, e) {
  if (!n || !n.groups) return 0;
  return GROUP_ORDER.reduce((s, k) => s + (e.v[k] || 0) * ((n.groups[k] && n.groups[k].share) || 0.2) * (n.groups[k] && n.groups[k].approval < 40 ? 0.5 : 0.3), 0);
}
// what the ministers' special orders do to the groups
const FX_GROUPS = {
  "fx:publicworks": { workers: 6 }, "fx:relief": { workers: 5, business: -2 }, "fx:crackdown": { workers: -8, army: 3, faith: 2 },
  "fx:festival": { faith: 6, workers: 2 }, "fx:wealthtax": { business: -12, workers: 5 }, "fx:stimulus": { business: 5, workers: 3 },
  "fx:investors": { business: 5 }, "fx:farmsub": { farmers: 8, business: -1 }, "fx:buygrain": { farmers: -3 }, "fx:exercises": { army: 4 },
};
function fxGroupEffect(id, label) {
  const base = id && id.startsWith("fx:citycare") ? { workers: 2 } : FX_GROUPS[id];
  return base ? { t: "group", v: base, seasons: GRP.modSeasons, key: id, label } : null;
}
// what decisions do to the groups: by decision and option
const DEC_GROUPS = {
  strike: { a: { workers: 8, business: -4 }, b: { workers: -10, business: 4, army: 1 }, c: { workers: -4 } },
  collapse: { a: { workers: 4 }, b: { workers: 8, business: -4 }, c: { workers: -10, business: 2 } },
  goldrush: { a: { business: 3, farmers: -2 }, b: { business: 2 }, c: { business: -8, workers: 2 } },
  oilspill: { a: { farmers: 3, faith: 2 }, b: { business: 2 }, c: { farmers: -5, faith: -4, business: 3 } },
  fire: { a: { farmers: 3, army: 1 }, b: { farmers: -4 } },
  drought: { a: { farmers: 8 }, b: { farmers: -2, workers: 2 }, d: { farmers: 3 }, c: { farmers: -10 } },
  genstrike: { a: { workers: 8, business: -3 }, b: { workers: 4, business: 4 }, c: { workers: -12, army: 2, business: 3 }, e: { workers: 6, business: -2 } },
  jobless: { a: { workers: 6 }, b: { workers: 4, business: -2 }, c: { workers: -10, army: 1, faith: -2 } },
  refugees: { a: { faith: 2, workers: -3 }, b: { business: 3, workers: -1 }, c: { workers: 2, faith: -2, army: 1 } },
  incident: { a: { army: 4, faith: 1 }, b: { army: -5 }, c: { army: -1 } },
  investors: { a: { business: 6, workers: -1 }, b: { business: -4, workers: 2, faith: 1 } },
  epidemic: { a: { business: -2 }, b: { workers: 3, faith: 2 }, c: { business: 2, workers: -4 } },
  scientist: { a: { business: 2 } },
  scandal: { a: { faith: 3 } },
  scandal_out: { a: { faith: 2 }, b: { faith: -6, workers: -3 } },
  harvest: { a: { farmers: 5, business: 2 }, b: { farmers: 3, faith: 3 }, c: { farmers: 4 } },
  veterans: { a: { army: 8 }, b: { army: 3, faith: 1 }, c: { army: -8 } },
  overfish: { a: { workers: -2 } },
  clearcut: { a: { farmers: 2, faith: 1 }, b: { business: 2 } },
  flood: { a: { farmers: 3 }, b: { farmers: 4, workers: 2 }, c: { farmers: -5 } },
  windfall: { a: { business: 2 }, b: { workers: 4, faith: 2 }, c: { business: 5 } },
  dockers: { a: { workers: 5, business: -2 }, b: { workers: -8, army: 1 }, c: { workers: -2 } },
  smog: { a: { workers: 3, business: -4 }, c: { workers: -3, business: 3 } },
  housing: { a: { workers: 3 }, b: { business: -3, workers: 2 }, c: { business: 2, workers: -3 } },
  minebust: { a: { workers: 4 }, c: { workers: -5 } },
  students: { a: { faith: -2 }, c: { faith: 2, army: 1 } },
  separatists: { b: { army: 2 }, a: { army: -2 } },
  borderfear: { a: { army: 3 } },
  festival: { a: { faith: 3 } },
  charter: { a: { business: 6, workers: -1 }, b: { business: -4 } },
  riots: { a: { workers: 3, business: -2 }, b: { army: 2, workers: -4 } },
  newcomers: { b: { workers: 2, faith: 2, business: -3 } },
  bridge: { a: { business: 2 } },
  fair: { a: { business: 3 } },
  oldquarter: { a: { faith: 4, business: -3 }, b: { business: 4, faith: -5 }, c: { faith: 1, business: 1 } },
  embargoed: { a: { business: 2 }, b: { business: 1, faith: 1 }, c: { army: 2, business: -3 }, d: { business: -2 }, e: { business: 3, army: -2 } },
};
function decisionGroupEffects(key, d) {
  const T = DEC_GROUPS[key];
  if (!T || !d || !d.options) return;
  for (const o of d.options) if (T[o.id] && !o.effects.some(e => e.t === "group")) o.effects = o.effects.concat([{ t: "group", v: T[o.id], seasons: GRP.modSeasons, key: `${key}:${o.id}`, label: d.title }]);
}

/* ---------- Crises: what an angry, powerful group does ---------- */
function groupCrisis(c, k, at = GRP.crisisAt, share = GRP.crisisShare) {
  const s = groupOf(c.n, k);
  if (!s || s.approval >= at || (s.share || 0) < share) return null;
  return { s, w: 1.2 + (at - s.approval) * 0.08 + (s.share - share) * 4 };
}
function topGrievances(c, k, m = 2) {
  const terms = groupTerms(c.w, c.g, c.n, c.econ, c.n.laws, k, groupCtx(c.w, c.g, c.n, c.econ)).filter(t => t.value < 0).slice(0, m);
  return terms.map(t => t.label.charAt(0).toLowerCase() + t.label.slice(1)).join("; ") || "the government's choices";
}
function demandLawOption(c, k, id, extra = []) {
  const s = groupOf(c.n, k);
  if (!s || !s.demand || !s.demand.law) return [];
  return [{ id, tag: "kind", label: `Give them what they ask: ${s.demand.label.charAt(0).toLowerCase()}${s.demand.label.slice(1)}`, effects: [{ t: "law", law: s.demand.law, value: s.demand.value }, ...extra] }];
}
const GROUP_DECISIONS = {
  capflight: {
    cat: "Economy", icon: "coin", tone: "bad",
    find: c => groupCrisis(c, "business"),
    make: c => {
      const lower = TAX_LAWS[TAX_LAWS.findIndex(t => t.v === c.n.laws.tax) - 1];
      return {
        title: "Money flees the country", cell: c.econ.cities[0].cell,
        body: `Bankers and industrialists are moving their money abroad. Their complaint: ${topGrievances(c, "business")}. New factories are put off and shares are falling.`,
        options: [
          ...(lower ? [{ id: "a", tag: "kind", label: `Promise lower taxes (${lower.label.toLowerCase()})`, effects: [{ t: "law", law: "tax", value: lower.v }, { t: "group", v: { business: 8, workers: -2 }, seasons: 12 }] }] : []),
          { id: "b", tag: "thrift", label: "Guarantee their deposits", effects: [{ t: "money", v: -Math.max(0.3, round1(c.Y * 0.012)) }, { t: "group", v: { business: 6 }, seasons: 12 }] },
          { id: "c", tag: "proud", label: "Let them go", effects: [{ t: "mod", key: "capflight", label: "Money flees abroad", invest: -0.4, seasons: 8 }, { t: "group", v: { business: -3 }, seasons: 8 }] },
          { id: "d", tag: "force", label: "Freeze their accounts", effects: [{ t: "money", v: Math.max(0.3, round1(c.Y * 0.01)) }, { t: "stab", v: -2 }, { t: "group", v: { business: -15, workers: 6 }, seasons: 16 }, { t: "mod", key: "frozen", label: "Investors fear the state", invest: -0.3, seasons: 12 }] },
        ], def: "c",
      };
    },
  },
  plot: {
    cat: "Politics", icon: "army", tone: "bad",
    find: c => groupCrisis(c, "army", GRP.crisisAt, 0.12),
    make: c => {
      const upA = ARMY_ORDER[ARMY_ORDER.indexOf(c.n.laws.army) + 1], upW = ARMS_ORDER[ARMS_ORDER.indexOf(c.n.laws.arms || "low") + 1];
      const cap = c.econ.cities.find(x => x.capital) || c.econ.cities[0];
      return {
        title: "Officers plot against the government", cell: cap.cell,
        body: `The secret police report that officers meet at night in the barracks of ${cap.name}. They say the government betrays the army: ${topGrievances(c, "army")}.`,
        options: [
          { id: "a", tag: "kind", label: "Give the army what it wants", effects: [...(upA ? [{ t: "law", law: "army", value: upA }] : []), ...(upW ? [{ t: "law", law: "arms", value: upW }] : []), { t: "group", v: { army: 14, workers: -3 }, seasons: 12 }] },
          ...(ministry(c.n, "defence") ? [{ id: "b", tag: "bold", label: "Make a general the Minister of Defence", effects: [{ t: "general" }, { t: "group", v: { army: 10 }, seasons: 12 }] }] : []),
          { id: "c", tag: "force", label: "Arrest the plotters", effects: [{ t: "stab", v: -2 }, { t: "group", v: { army: -8, faith: 1 }, seasons: 12 }, { t: "mod", key: "purge", label: "Officers arrested", stab: -1, seasons: 4 }] },
          { id: "d", tag: "thrift", label: "Ignore the rumors", effects: [{ t: "follow", key: "coup", inMin: 1, inMax: 2, chance: 0.6, risk: "the officers try to seize power" }] },
        ], def: "a",
      };
    },
  },
  coup: {
    cat: "Politics", icon: "army", tone: "bad", followOnly: true,
    find: c => groupOf(c.n, "army") && c.n.groups.army.approval < 45 ? { w: 1 } : null,
    make: c => {
      const cap = c.econ.cities.find(x => x.capital) || c.econ.cities[0];
      const upA = ARMY_ORDER[Math.min(ARMY_ORDER.indexOf(c.n.laws.army) + 1, 2)], upW = ARMS_ORDER[Math.min(ARMS_ORDER.indexOf(c.n.laws.arms || "low") + 1, 3)];
      return {
        title: `Soldiers in the streets of ${cap.name}`, cell: cap.cell,
        body: `Before dawn, armored cars surrounded the ministries in ${cap.name}. The plotting officers demand a government that serves the army. Loyal regiments wait for your order.`,
        options: [
          { id: "a", tag: "kind", label: "Give in: the generals get their way", effects: [...(upA !== c.n.laws.army ? [{ t: "law", law: "army", value: upA }] : []), ...(upW !== (c.n.laws.arms || "low") ? [{ t: "law", law: "arms", value: upW }] : []), ...(ministry(c.n, "defence") ? [{ t: "general" }] : []), { t: "stab", v: -5 }, { t: "group", v: { army: 20, workers: -5, faith: -3 }, seasons: 16 }] },
          { id: "b", tag: "force", label: "Call the loyal regiments", effects: [{ t: "stab", v: -8 }, { t: "group", v: { army: -10, faith: 2 }, seasons: 16 }, { t: "mod", key: "coup_failed", label: "The army is purged after the failed coup", stab: -1, seasons: 8 }] },
        ], def: "b",
      };
    },
  },
  blockade: {
    cat: "Society", icon: "wheat", tone: "bad",
    find: c => groupCrisis(c, "farmers"),
    make: c => ({
      title: "Farmers block the roads", cell: c.econ.cities[0].cell,
      body: `Tractors and carts block the roads into the towns, and grain is left in the barns. The farmers say: ${topGrievances(c, "farmers")}.`,
      options: [
        { id: "a", tag: "kind", label: "Farm subsidies", effects: [{ t: "money", v: -Math.max(0.2, round1(c.Y * 0.008)) }, { t: "mod", key: "farm_subsidy", label: "Farm subsidies", food: 0.05, seasons: 8 }, { t: "group", v: { farmers: 6 }, seasons: 12 }] },
        ...(c.n.laws.trade !== "protect" ? [{ id: "b", tag: "proud", label: "Protect the farms from imports", effects: [{ t: "law", law: "trade", value: "protect" }, { t: "group", v: { farmers: 6, business: -4 }, seasons: 12 }] }] : []),
        { id: "c", tag: "force", label: "Clear the roads", effects: [{ t: "stab", v: -2 }, { t: "mod", key: "grain_held", label: "Farmers hold back their grain", food: -0.03, seasons: 2 }, { t: "group", v: { farmers: -10 }, seasons: 12 }] },
      ], def: "c",
    }),
  },
  protest: {
    cat: "Society", icon: "flag", tone: "bad",
    find: c => groupCrisis(c, "faith", GRP.crisisAt, 0.12),
    make: c => {
      const cap = c.econ.cities.find(x => x.capital) || c.econ.cities[0];
      return {
        title: "Crowds fill the squares", cell: cap.cell,
        body: `After the evening prayers, crowds marched from the temples to the squares of ${cap.name} with candles and banners. They say: ${topGrievances(c, "faith")}.`,
        options: [
          ...demandLawOption(c, "faith", "a", [{ t: "group", v: { faith: 6 }, seasons: 12 }]),
          { id: "b", tag: "kind", label: "A national day of prayer and parades", effects: [{ t: "money", v: -Math.max(0.2, round1(c.Y * 0.003)) }, { t: "stab", v: 1 }, { t: "group", v: { faith: 8 }, seasons: 12 }] },
          { id: "c", tag: "force", label: "Disperse the crowds", effects: [{ t: "stab", v: -3 }, { t: "group", v: { faith: -10, army: 2 }, seasons: 12 }] },
        ], def: "b",
      };
    },
  },
};
Object.assign(DECISIONS, GROUP_DECISIONS);
DECISIONS.genstrike.find = c => {
  const x = groupCrisis(c, "workers");
  return x ? { w: x.w } : null;
};
DECISIONS.genstrike.make = c => {
  const L = c.n.laws;
  const up = SERVICE_ORDER[SERVICE_ORDER.indexOf(L.services) + 1];
  const lower = TAX_LAWS[TAX_LAWS.findIndex(t => t.v === L.tax) - 1];
  const dem = groupOf(c.n, "workers") && c.n.groups.workers.demand;
  return {
    title: "General strike", cell: c.econ.cities[0].cell,
    body: `The unions have called a general strike. Trains stand still and factories are silent. The workers' complaint: ${topGrievances(c, "workers")}.`,
    options: [
      ...(dem && dem.law && !(dem.law === "services" && up) && !(dem.law === "tax" && lower) ? demandLawOption(c, "workers", "e", [{ t: "stab", v: 2 }]) : []),
      ...(up ? [{ id: "a", tag: "kind", label: `Raise healthcare to ${SERVICE_LAWS[up].label.toLowerCase()}`, effects: [{ t: "law", law: "services", value: up }, { t: "stab", v: 2 }] }] : []),
      ...(lower ? [{ id: "b", tag: "kind", label: `Cut taxes to ${lower.label.toLowerCase()}`, effects: [{ t: "law", law: "tax", value: lower.v }, { t: "stab", v: 2 }] }] : []),
      { id: "c", tag: "force", label: "Break the strike", effects: [{ t: "stab", v: -6 }, { t: "mod", key: "strike_broken", label: "Strike broken by force", output: -0.03, seasons: 1 }] },
    ], def: "c",
  };
};

/* ---------- For the ministers' files: one line on who holds power ---------- */
function groupsFileLine(g, z) {
  if (!z || !z.groups) return "Interest groups: unknown.";
  const order = GROUP_ORDER.slice().sort((a, b) => z.groups[b].share - z.groups[a].share);
  const dem = order.filter(k => z.groups[k].demand).map(k => `${GROUPS[k].label}: ${z.groups[k].demand.label.toLowerCase()} (${z.groups[k].demand.until - g.turn} seasons left)`);
  const st = groupStabilityTerms(g, z).reduce((s, t) => s + t.value, 0);
  return `Interest groups (who holds power): ${order.map(k => `${GROUPS[k].label} ${pct(z.groups[k].share)} of the power, approval ${Math.round(z.groups[k].approval)} (${groupWord(z.groups[k].approval)})`).join("; ")}. Together they move stability ${signed1(st)}.${dem.length ? ` Their demands: ${dem.join("; ")}.` : ""}`;
}
function groupFileLines(w, g, n) {
  if (!n.groups) return ["Unknown."];
  const econ = computeEconomy(w, g, n.id), ctx = groupCtx(w, g, n, econ);
  return GROUP_ORDER.slice().sort((a, b) => n.groups[b].share - n.groups[a].share).map(k => {
    const s = n.groups[k];
    const why = groupTerms(w, g, n, econ, n.laws, k, ctx).slice(0, 4).map(t => `${t.label.toLowerCase()} ${t.value > 0 ? "+" : ""}${Math.round(t.value)}`).join("; ");
    return `${GROUPS[k].label}: ${pct(s.share)} of the power, approval ${Math.round(s.approval)} (${groupWord(s.approval)}, heading to ${Math.round(s.target ?? s.approval)})${why ? `; why: ${why}` : ""}${s.demand ? `; DEMAND: ${s.demand.label.toLowerCase()} (${s.demand.until - g.turn} seasons left)` : ""}. When pleased: ${GROUPS[k].happy.toLowerCase()} When angry: ${GROUPS[k].angry.toLowerCase()}`;
  });
}

