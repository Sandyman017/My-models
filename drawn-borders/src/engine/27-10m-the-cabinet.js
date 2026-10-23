/* =====================================================================
   10m. The cabinet: ministries, the ministers who run them, and the orders they carry out
   Every government has ministers. You establish ministries, appoint ministers, talk to them and give them
   orders. Every order is one of the legal actions the game already knows (a project, a law, a measure with a
   timed effect, a division, an envoy), with its exact cost and effect shown before you approve it.
   A minister's skill makes his area a little better or worse; his character colors his advice and his loyalty.
   ===================================================================== */
const MINISTRIES = {
  interior:    { label: "Interior", icon: "police-badge", title: "Minister of the Interior", start: true,
    looks: "order and stability, roads and new towns, people who move for work, healthcare and schools, wages, pensions and the labour laws", laws: ["services", "education", "hours", "unions", "minwage", "childwork", "women", "pensions"] },
  economy:     { label: "Economy and Trade", icon: "bank", title: "Minister of the Economy",
    looks: "taxes, trade, banks, research, factories, mines and harbors", laws: ["tax", "trade", "finance", "research"] },
  agriculture: { label: "Agriculture", icon: "wheat", title: "Minister of Agriculture",
    looks: "farms, irrigation, fishing, food processing and the national food reserve", laws: ["granary"] },
  energy:      { label: "Energy", icon: "oil-pump", title: "Minister of Energy",
    looks: "power stations, coal mines, and oil and gas fields", laws: [] },
  defence:     { label: "Defence", icon: "shield", title: "Minister of Defence", start: true,
    looks: "the army and the navy, conscription, arms production and the generals", laws: ["army", "arms"] },
  foreign:     { label: "Foreign Affairs", icon: "handshake", title: "Foreign Minister",
    looks: "relations with other nations, envoys and treaties", laws: [] },
};
const MIN_ORDER = ["interior", "economy", "agriculture", "energy", "defence", "foreign"];
const CAB = {
  estShare: 0.01, estMin: 2, estMax: 6,           // establishing a ministry: 1% of a year's output, $2-6B
  upkeepShare: 0.0003, upkeepMin: 0.03,           // each ministry costs 0.03% of a year's output every season
  stab: 0.8, output: 0.005, food: 0.015, power: 0.03, drill: 0.04, opinion: 2,   // per skill level above or below 3
  autoTotal: 0.03,                                 // all ministers together spend at most 3% of a year's output a season on their own
  overrule: 8, approve: 2, resignAt: 20,
  limits: [0, 0.005, 0.015, 0.03],               // what a minister may spend on his own each season, as a share of a year's output
};
const MIN_TRAITS = {
  honest:    { label: "Honest",    note: "never takes a bribe", clash: "corrupt" },
  corrupt:   { label: "Corrupt",   note: "takes bribes: −1% tax revenue, and a scandal may break", clash: "honest" },
  careful:   { label: "Careful",   note: "warns against costly or risky orders", clash: "bold" },
  bold:      { label: "Bold",      note: "likes big plans and seldom objects", clash: "careful" },
  loyal:     { label: "Loyal",     note: "stays loyal even when overruled", clash: "ambitious" },
  ambitious: { label: "Ambitious", note: "works hard to rise (half a skill level more), but hates being overruled", clash: "loyal" },
  popular:   { label: "Popular",   note: "liked by the people: +1 stability; dismissing this minister costs 3 more stability", clash: null },
  stubborn:  { label: "Stubborn",  note: "objects more often, and takes being overruled harder", clash: "bold" },
};
const LAW_NAMES = { tax: "Taxes", services: "Healthcare", education: "Education", research: "Research funding", trade: "Trade policy", finance: "Financial regulation", army: "Conscription", arms: "Arms production", granary: "Food reserve", hours: "Working hours", unions: "Trade unions", minwage: "Minimum wage", childwork: "Child labour", women: "Women at work", pensions: "Pensions" };
function lawSteps(law) {
  return { services: SERVICE_ORDER, education: EDU_ORDER, research: RESEARCH_ORDER, trade: TRADE_ORDER, finance: FINANCE_ORDER, army: ARMY_ORDER, arms: ARMS_ORDER, granary: GRANARY_ORDER }[law] || (LABOUR[law] ? LABOUR[law].order : null);
}
function lawValueLabel(law, v) {
  if (law === "tax") return taxLaw(v).label.toLowerCase() + ` (${v}%)`;
  const T = { services: SERVICE_LAWS, education: EDU_LAWS, research: RESEARCH_LAWS, trade: TRADE_LAWS, finance: FINANCE_LAWS, army: ARMY_LAWS, arms: ARMS_LAWS }[law];
  if (law === "granary") return GRANARY_LAWS[v].months ? `${GRANARY_LAWS[v].months} months of food` : "no store";
  if (LABOUR[law]) { const x = LABOUR[law].vals[v]; return x ? `${x.label.toLowerCase()}${x.sub ? ` (${x.sub})` : ""}` : String(v); }
  return T && T[v] ? (T[v].label || v).toLowerCase() : String(v);
}

/* ---------- Ministers ---------- */
function ministerTaken(g) {
  const s = new Set();
  const add = name => { s.add(name); s.add(name.split(" ").pop()); };
  for (const z of g.nations) {
    if (z.leader) add(z.leader.name);
    const C = z.cabinet;
    if (!C) continue;
    for (const k in C.min) if (C.min[k].minister) add(C.min[k].minister.name);
    for (const k in C.cands || {}) for (const m of C.cands[k].list || []) add(m.name);
  }
  return s;
}
function makeMinister(g, n, key, rng, skillBias = 0) {
  const sex = rng() < 0.42 ? "f" : "m";
  const taken = ministerTaken(g);
  let name = "";
  for (let k = 0; k < 60; k++) {
    const first = pick(rng, LEADER_FIRST[sex]), last = pick(rng, LEADER_LAST);
    name = `${first} ${last}`;
    if (!taken.has(name) && (k >= 20 || !taken.has(last))) break;   // a new surname if possible, never the same full name
  }
  const r = rng() + skillBias;
  const skill = r < 0.12 ? 1 : r < 0.36 ? 2 : r < 0.7 ? 3 : r < 0.92 ? 4 : 5;
  const keys = Object.keys(MIN_TRAITS);
  const weights = { corrupt: 0.55, popular: 0.8, stubborn: 0.8 };
  const traits = [];
  while (traits.length < 2) {
    const t = pickBy(rng, keys, k => weights[k] || 1);
    if (traits.includes(t) || traits.some(x => MIN_TRAITS[x].clash === t || MIN_TRAITS[t].clash === x)) continue;
    traits.push(t);
  }
  const mm = { id: g.nextId++, name, sex, age: 34 + Math.floor(rng() * 30), skill, traits, loyalty: 55 + Math.floor(rng() * 26), since: g.turn, face: Math.floor(rng() * 1e6), key, overruled: 0 };
  mm.group = ministerGroupPick(key, mm.face);
  return mm;
}
function hisHer(m) { return m && m.sex === "f" ? "her" : "his"; }
function himHer(m) { return m && m.sex === "f" ? "her" : "him"; }
function heShe(m) { return m && m.sex === "f" ? "she" : "he"; }
function minHas(m, t) { return !!(m && m.traits && m.traits.includes(t)); }
function ministry(n, key) { return n && n.cabinet ? n.cabinet.min[key] || null : null; }
function ministryActive(n, key) { const M = ministry(n, key); return !!(M && !M.pending && M.minister); }
function ministerSkill(m) { return m ? m.skill + (minHas(m, "ambitious") ? 0.5 : 0) : 3; }
/* How far a ministry's minister lifts (or drags) his area: skill 3 is the plain civil service, 5 is the best, 1 is a liability. */
function cabinetK(n, key) { return ministryActive(n, key) ? ministerSkill(ministry(n, key).minister) - 3 : 0; }
function establishCost(econ) { return clamp(Math.round(econ.gdp * CAB.estShare * 10) / 10, CAB.estMin, CAB.estMax); }
function ministryUpkeep(econ) { return Math.max(CAB.upkeepMin, econ.gdp * CAB.upkeepShare); }
function cabinetUpkeep(n, econ) {
  if (!n || !n.cabinet) return 0;
  let k = 0;
  for (const key of MIN_ORDER) { const M = n.cabinet.min[key]; if (M && !M.pending) k++; }
  return k * ministryUpkeep(econ);
}
function newMinistry(g, minister, pending) { return { minister, pending: !!pending, since: g.turn, auto: false, limit: 1, chat: [], log: [], cool: {} }; }
function initCabinet(g, n, rng) {
  const C = n.cabinet = { min: {}, cands: {} };
  const keys = n.isPlayer || n.minor ? ["interior", "defence"]
    : ["interior", "defence", "economy", "foreign", ...({ agrarian: ["agriculture"], mercantile: [], militarist: [], expansionist: [] }[n.archetype] || [])];
  for (const key of keys) C.min[key] = newMinistry(g, makeMinister(g, n, key, rng, n.isPlayer ? 0.05 : 0), false);
  return C;
}
function initCabinets(g, rng) { if (g.cabSalt === undefined) g.cabSalt = Math.floor(rng() * 1e9); for (const n of g.nations) if (!n.cabinet) initCabinet(g, n, rng); }

/* Three people who could take a ministry; the list stays the same for a year unless someone is appointed. */
function candidatesFor(g, n, key) {
  const C = n.cabinet;
  const c = C.cands[key];
  if (c && g.turn - c.turn < 4 && c.list.length) return c.list;
  let h = 0;
  for (const ch of n.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  if (g.cabSalt === undefined) g.cabSalt = Math.floor(Math.random() * 1e9);
  const rng = mulberry32((g.turn * 7393 + n.id * 131 + MIN_ORDER.indexOf(key) * 17 + 3 + h + g.cabSalt) >>> 0);
  C.cands[key] = { turn: g.turn, list: [0, 1, 2].map(i => makeMinister(g, n, key, rng, i === 0 ? 0.1 : 0)) };
  return C.cands[key].list;
}

/* ---------- What the cabinet does for the nation without being asked: the minister's skill at work ---------- */
function cabinetField(n, field) { return cabinetFieldBase(n, field) + groupField(n, field); }
function cabinetFieldBase(n, field) {
  if (!n || !n.cabinet) return 0;
  if (field === "output") return CAB.output * cabinetK(n, "economy");
  if (field === "food") return CAB.food * cabinetK(n, "agriculture");
  if (field === "power") return CAB.power * cabinetK(n, "energy");
  if (field === "revenue") {
    let s = 0;
    for (const key of MIN_ORDER) if (ministryActive(n, key) && minHas(n.cabinet.min[key].minister, "corrupt")) s -= 0.01;
    return s;
  }
  return 0;
}
function cabinetStabTerms(n) {
  const out = [];
  if (!n || !n.cabinet) return out;
  const k = cabinetK(n, "interior");
  if (Math.abs(k) >= 0.25) out.push({ label: `${n.cabinet.min.interior.minister.name}, ${k > 0 ? "a capable" : "a weak"} Minister of the Interior`, value: CAB.stab * k });
  for (const key of MIN_ORDER) if (ministryActive(n, key) && minHas(n.cabinet.min[key].minister, "popular")) out.push({ label: `${n.cabinet.min[key].minister.name} is a popular minister`, value: 1 });
  return out;
}
function drillCapFor(n) { return EXPS.drillCap + CAB.drill * cabinetK(n, "defence") + groupField(n, "drill"); }
function foreignOpinionItem(B) {
  const k = cabinetK(B, "foreign");
  if (Math.abs(k) < 0.25) return null;
  return { label: `Their foreign minister ${B.cabinet.min.foreign.minister.name}`, value: Math.round(CAB.opinion * k) };
}
/* Which ministry looks after a project. */
function projectArea(q) {
  switch (q.kind) {
    case "road": case "town": return "interior";
    case "irrigation": return "agriculture";
    case "port": case "portup": case "wharf": case "smelter": case "survey": return "economy";
    case "ships": return "defence";
    case "industry": return /^power_/.test(q.ind) ? "energy" : q.ind === "foodproc" ? "agriculture" : "economy";
    case "focus": return FOCI[q.focus] ? FOCI[q.focus].area : "interior";
    case "site": return q.siteKind === "coalmine" || q.siteKind === "oilfield" ? "energy" : q.siteKind === "fishing" ? "agriculture" : "economy";
    default: return null;
  }
}

/* ---------- Orders: everything a ministry can do now, with exact costs and effects ---------- */
function atWarAny(g, nid) { return liveNations(g).some(z => z.id !== nid && atWar(g, nid, z.id)); }
function round1(v) { return Math.round(v * 10) / 10; }
function slugId(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48); }
let cabinetCache = null;
/* The projects the government could start, from the same list the rival governments choose from. */
function cabinetProjects(w, g, n, econ) {
  const key = `${g.turn}|${n.id}|${g.projects.length}|${Math.round(n.treasury)}|${g.sites.length}|${g.cities.length}|${g.roads.size}`;
  if (cabinetCache && cabinetCache.key === key && cabinetCache.g === g) return cabinetCache.list;
  let list = [];
  try { list = aiCandidates(w, g, n, econ).filter(q => q && q.ok !== false && projectArea(q)); } catch (e) { console.warn("cabinet projects", e); list = []; }
  for (const x of econ.sites || []) {
    if (x.kind !== "mine" || x.status !== "working" || x.site.smelter) continue;
    if (list.some(q => q.kind === "smelter" && q.siteId === x.site.id)) continue;
    const q = quoteSmelter(w, g, n.id, x.site, econ);
    if (q.ok) list.push(q);
  }
  cabinetCache = { key, g, list };
  return list;
}
function projectOrder(w, g, n, econ, q) {
  const cost = q.cost;
  const lines = [`${fmtMoney(cost)}, ready in ${q.seasons} season${q.seasons > 1 ? "s" : ""}`];
  if (Math.abs(q.dGdp || 0) >= 0.05) lines.push(`Output ${fmtSignedMoney(q.dGdp)} a year`);
  if ((q.dFood || 0) > 0.01) lines.push(`Food for ${fmtPeople(q.dFood)} more people`);
  if ((q.famineRelief || 0) > 0.01) lines.push(`Ends hunger for ${fmtPeople(q.famineRelief)}`);
  if (q.reconnected > 0) lines.push(`Joins ${q.reconnected} cut-off town${q.reconnected > 1 ? "s" : ""} to the capital`);
  const parts = [q.cityId, q.ind, q.siteKind, q.siteId, q.cell, q.site, q.toCell, q.level, q.focus, q.path && q.path.length ? `${q.path[0]}-${q.path[q.path.length - 1]}` : null].filter(v => v !== undefined && v !== null);
  return { id: `p:${q.kind}:${parts.join(":")}`, kind: "project", group: "Projects", label: q.label, cost, lines, q,
    score: ((q.value ?? q.dGdp ?? 0) / Math.max(0.5, cost)) * 2 + (q.famineRelief > 0.05 ? 1 : 0) };
}
function lawOrder(w, g, n, econ, law, value, base) {
  const after = forecast(w, g, n.id, { ...n.laws, [law]: value });
  const dBal = after.budget.balance - base.budget.balance;
  const dStab = after.target - base.target;
  const lines = [];
  if (Math.abs(dBal) >= 0.01) lines.push(`Budget ${fmtSignedMoney(dBal)} a season`);
  if (Math.abs(dStab) >= 0.5) lines.push(`Stability will ${dStab > 0 ? "rise" : "fall"} ${Math.abs(Math.round(dStab))} point${Math.abs(Math.round(dStab)) > 1 ? "s" : ""}`);
  let below = false;
  if (law === "army") {
    const allowed = ARMY_LAWS[value].share * econ.pop * 1e6, now = (n.mil && n.mil.men) || 0;
    below = allowed < now;
    lines.push(`Up to ${fmtCount(allowed)} may serve${below ? ` (fewer than the ${fmtCount(now)} under arms now)` : ""}`);
  }
  if (law === "granary") lines.push(GRANARY_LAWS[value].months ? `Keeps ${GRANARY_LAWS[value].months} months of food in store` : "No food is kept in store");
  if (law === "research") lines.push("Changes how fast new technologies come");
  if (law === "education") lines.push("Changes how skilled your workers become");
  if (law === "trade") lines.push(`Tariff ${pct(TRADE_LAWS[value].tariff)} on imports`);
  if (law === "finance") lines.push(value === "loose" ? "Faster private investment, more risk of a banking crisis" : value === "strict" ? "Safer banks, slower private investment" : "The middle way for banks");
  if (!lines.length) lines.push("Little change this season");
  return { id: `law:${law}:${value}`, kind: "law", group: "Laws", law, value, label: `${LAW_NAMES[law]}: ${lawValueLabel(law, value)}`, cost: 0, lines,
    dBal, dStab, below, score: 0 };
}
function fxOrder(id, label, effects, g, nid, extra = {}) {
  const ge = fxGroupEffect(id, label);
  if (ge) effects = effects.concat([ge]);
  const lines = effects.map(e => effectText(g, e, nid).text).filter(Boolean);
  const cost = Math.max(0, -effects.filter(e => e.t === "money").reduce((s, e) => s + e.v, 0));
  return { id, kind: "fx", group: "Measures", label, effects, lines, cost, score: 0, ...extra };
}
function cooling(n, key, id, seasons, g) { const M = ministry(n, key); return M && M.cool && M.cool[id] !== undefined && g.turn - M.cool[id] < seasons; }
function specialOrders(w, g, n, econ, key) {
  const out = [], Y = econ.gdp, nid = n.id;
  const money = share => -Math.max(0.2, round1(Y * share));
  if (key === "interior") {
    const u = econ.unemployment || 0;
    if (!modFlag(n, "jobs") && !cooling(n, key, "fx:publicworks", 6, g)) out.push(fxOrder("fx:publicworks", "Public works: roads, dams and schools", [{ t: "money", v: money(0.012) }, { t: "mod", key: "public_works", label: "Public works", jobs: 0.03, stab: 1, seasons: 6 }], g, nid, { score: u > 0.05 ? 3 : u > 0.03 ? 1 : -1 }));
    if (!(n.mods || []).some(m => m.key === "relief") && !cooling(n, key, "fx:relief", 8, g)) out.push(fxOrder("fx:relief", "Pay unemployment relief", [{ t: "mod", key: "relief", label: "Unemployment relief", jobRelief: 0.5, revenue: -0.02, seasons: 8 }], g, nid, { score: u > 0.06 ? 2 : -1 }));
    if (n.stability < 50 && !cooling(n, key, "fx:crackdown", 8, g)) out.push(fxOrder("fx:crackdown", "Police crackdown on unrest", [{ t: "stab", v: 4 }, { t: "mod", key: "crackdown_memory", label: "People remember the police crackdown", stab: -1, seasons: 8 }], g, nid, { score: n.stability < 30 ? 2 : -1 }));
    if (!cooling(n, key, "fx:festival", 8, g)) out.push(fxOrder("fx:festival", "A national holiday with parades and fairs", [{ t: "money", v: money(0.002) }, { t: "stab", v: 2 }], g, nid, { score: n.stability < 40 ? 1 : -1 }));
    const sad = econ.regions.filter(r => (r.city.mood ?? 55) < 45 && !(r.city.mods || []).some(m => m.key === "citycare" && (m.until === null || m.until > g.turn))).sort((a, b) => (a.city.mood ?? 55) - (b.city.mood ?? 55))[0];
    if (sad && !cooling(n, key, `fx:citycare:${sad.city.id}`, 6, g)) out.push(fxOrder(`fx:citycare:${sad.city.id}`, `A program for ${sad.city.name}: housing, clinics, schools and police`, [{ t: "money", v: -Math.max(0.2, round1((sad.gdp || 0) * 0.015)) }, { t: "cityMod", cityId: sad.city.id, key: "citycare", label: "A government program for the city", mood: 8, seasons: 6 }], g, nid, { score: (sad.city.mood ?? 55) < 32 ? 2 : 0.5 }));
  }
  if (key === "economy") {
    if (!cooling(n, key, "fx:wealthtax", 8, g)) out.push(fxOrder("fx:wealthtax", "A one-off tax on the rich", [{ t: "money", v: Math.max(0.2, round1(Y * 0.006)) }, { t: "stab", v: -2 }, { t: "capital", v: -round1(Y * 0.01) }], g, nid, { score: n.treasury < -0.2 * Y ? 1 : -1 }));
    if (!(n.mods || []).some(m => m.key === "stimulus") && !cooling(n, key, "fx:stimulus", 6, g)) out.push(fxOrder("fx:stimulus", "Stimulus spending", [{ t: "money", v: money(0.012) }, { t: "mod", key: "stimulus", label: "Stimulus spending", output: 0.02, seasons: 4 }], g, nid, { score: (econ.unemployment || 0) > 0.04 && n.treasury > 0 ? 1 : -1 }));
    if ((n.laws.trade || "balanced") !== "protect" && tradeOpen(econ) && !cooling(n, key, "fx:investors", 12, g)) out.push(fxOrder("fx:investors", "Invite foreign investors", [{ t: "money", v: money(0.002) }, { t: "capital", v: round1(Y * 0.008) }], g, nid, { score: 0.5 }));
    out.push(...economyTradeOrders(w, g, n, econ));
  }
  if (key === "agriculture") {
    if (!(n.mods || []).some(m => m.key === "farm_subsidy") && !cooling(n, key, "fx:farmsub", 8, g)) out.push(fxOrder("fx:farmsub", "Farm subsidies", [{ t: "money", v: money(0.008) }, { t: "mod", key: "farm_subsidy", label: "Farm subsidies", food: 0.05, seasons: 8 }], g, nid, { score: (econ.famineShare || 0) > 0.01 ? 3 : econ.food / Math.max(0.1, econ.pop) < 1.1 ? 1 : -1 }));
    const months = monthsOfFood((n.granary && n.granary.stock) || 0, econ.pop);
    if (months < 8 && !cooling(n, key, "fx:buygrain", 2, g)) {
      // the grain comes from the cheapest seller we can reach, at its price at our border (10s); without a book, the old world-market price
      const offer = g.trade && g.trade.v ? grainOffers(w, g, nid)[0] || null : econ.access > 0 ? { nid: -1, p: GRAN.priceB * 1.6 } : null;
      const score = months < 1 && harvestFactor(n) < 0.95 ? 2 : -1;
      if (offer) {
        const o = fxOrder("fx:buygrain", offer.nid < 0 ? "Buy grain on the world market for the reserve" : `Buy grain from the ${nameOf(g, offer.nid)} for the reserve`, [{ t: "money", v: -Math.max(0.1, round1(econ.pop / 12 * offer.p)) }, { t: "granary", months: 1 }], g, nid, { score, good: "food", target: offer.nid >= 0 ? offer.nid : undefined });
        if (offer.price) o.lines.push(`Price at our border: ${bMoney(offer.p)} for a year's food for a million people (the cheapest seller we can reach)`);
        out.push(o);
      } else if (g.trade && g.trade.v) out.push({ id: "fx:buygrain", kind: "fx", group: "Measures", label: "Buy grain abroad for the reserve", effects: [], lines: [], cost: 0, score: -9, good: "food",
        blocked: tradeOpen(econ) ? "No nation we can reach has grain to spare, and the world market is closed to us." : "We cannot buy grain abroad: no nation can reach us, and the world market is closed to us (we need a harbor on the ocean, or a trade partner who has one)." });
    }
    out.push(...grainTradeOrders(w, g, n, econ, key, months));
  }
  if (key === "energy") {
    for (const x of (econ.sites || []).filter(x => (x.kind === "coalmine" || x.kind === "oilfield") && x.status === "working")) {
      const s = x.site;
      if (s.pace !== "fast" && !modFlag(n, "noFast")) out.push(fxOrder(`pace:${s.id}:fast`, `Work ${s.name} intensively`, [{ t: "sitePace", siteId: s.id, pace: "fast" }], g, nid, { group: "Mines and fields", score: (econ.sat.power ?? 1) < 0.9 ? 1.5 : -1, lines2: ["More coal or oil now; the deposit runs out sooner"] }));
      if (s.pace === "fast") out.push(fxOrder(`pace:${s.id}:normal`, `Work ${s.name} at a normal pace`, [{ t: "sitePace", siteId: s.id, pace: "normal" }], g, nid, { group: "Mines and fields", score: -1 }));
    }
  }
  if (key === "defence") {
    const towns = g.cities.filter(c => c.owner === nid && g.occ[c.cell] < 0).sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0));
    const threatR = atWarAny(g, nid) ? 3 : liveNations(g).some(z => z.id !== nid && (warRisk(w, g, z.id, nid) || { level: 0 }).level >= 2) ? 2 : 0;
    for (const type of ["inf", "art", "arm", "air"]) {
      let q = null, cap = null;
      for (const c of towns) { const t = raiseQuote(w, g, nid, type, c.id); if (t.ok) { q = t; cap = c; break; } }
      if (!q) {
        if (nid === PLAYER && type !== "air" && towns.length) { const t = raiseQuote(w, g, nid, type, towns[0].id); out.push({ id: `raise:${type}`, kind: "noraise", group: "Forces", label: `Raise an ${DIV_TYPES[type].label.toLowerCase()} division`, cost: 0, lines: [], blocked: t.reason || "It cannot be done now.", score: -9 }); }
        continue;
      }
      const lines = [type === "air" ? `${q.planes} planes from the depots` : `${fmtCount(q.men)} soldiers, equipped ${pct(q.fill)}`, `${fmtMoney(q.cost)}, trains for ${MIL.trainSeasons} seasons at ${cap.name}`];
      out.push({ id: `raise:${type}`, kind: "raise", group: "Forces", label: type === "air" ? `Raise an air wing at ${cap.name}` : `Raise an ${DIV_TYPES[type].label.toLowerCase()} division at ${cap.name}`, cost: q.cost, lines, q,
        score: threatR ? (type === "inf" ? threatR : threatR - 1) : -1 });
    }
    const stance = (n.warPlan && n.warPlan.stance) || "defensive";
    out.push({ id: `stance:${stance === "offensive" ? "defensive" : "offensive"}`, kind: "stance", group: "Forces", value: stance === "offensive" ? "defensive" : "offensive",
      label: stance === "offensive" ? "Order the generals to hold the line" : "Order the generals onto the offensive", cost: 0,
      lines: [stance === "offensive" ? "In war they defend and attack only with 2 to 1 odds" : "In war they press the attack where the odds favor them"], score: -1 });
    const drillable = g.divisions.filter(d => d.owner === nid && !d.training);
    const threat = atWarAny(g, nid) ? 3 : liveNations(g).some(z => z.id !== nid && (warRisk(w, g, z.id, nid) || { level: 0 }).level >= 2) ? 2 : 0;
    if (!cooling(n, key, "fx:exercises", 4, g) && drillable.some(d => (d.exp || 0) < 0.4)) out.push(fxOrder("fx:exercises", "Army exercises", [{ t: "money", v: money(0.003) }, { t: "drill", v: 0.05, cap: 0.4 }], g, nid,
      { score: threat && drillable.reduce((s, d) => s + (d.exp || 0), 0) / drillable.length < 0.35 ? 1 : -0.5 }));
    out.push(...warGoodsOrders(w, g, n, econ));
  }
  if (key === "foreign") {
    // nations near us first; then up to two more that could sell us what we lack (offered only a trade agreement)
    const all = liveNations(g).filter(z => z.id !== nid);
    const lack = new Map(all.map(z => [z.id, sellsWhatWeLack(g, nid, z.id)]));
    const near = all.slice().sort((a, b) => (sharesBorder(g, nid, b.id) ? 1 : 0) - (sharesBorder(g, nid, a.id) ? 1 : 0) || (a.minor ? 1 : 0) - (b.minor ? 1 : 0)).slice(0, 5);
    const traders = all.filter(z => !near.includes(z) && lack.get(z.id).v >= 0.002 * Y && !hasTreaty(g, nid, z.id, "trade") && !atWar(g, nid, z.id)).sort((a, b) => lack.get(b.id).v - lack.get(a.id).v || a.id - b.id).slice(0, 2);
    const others = near.concat(traders);
    for (const z of others) {
      const op = opinionDetail(g, z.id, nid).value;
      const war = atWar(g, nid, z.id);
      const onlyTrade = traders.includes(z);
      if (!war && !onlyTrade && !cooling(n, key, `goodwill:${z.id}`, 4, g)) out.push(fxOrder(`goodwill:${z.id}`, `Goodwill visit to the ${z.name}`, [{ t: "money", v: money(0.0015) }, { t: "opinion", from: z.id, key: "goodwill", label: "Visits from their foreign minister", v: 6, cap: 12 }], g, nid,
        { group: "Relations", score: !z.minor && (warRisk(w, g, z.id, nid) || { level: 0 }).level >= 2 ? 2 : op < -10 ? 0.5 : -1, target: z.id }));
      if ((g.lastLetter || {})[z.id] === g.turn) continue;
      const types = war ? ["peace"] : onlyTrade ? ["trade"] : ["trade", "nap", "alliance", ...(sharesBorder(g, nid, z.id) ? ["border"] : [])];
      for (const type of types) {
        if (validateDeal(g, w, nid, z.id, [{ type }])) continue;
        const L = lack.get(z.id);
        const sells = type === "trade" && L.v >= 0.002 * Y;
        out.push({ id: `envoy:${type}:${z.id}`, kind: "envoy", group: "Relations", type, target: z.id, cost: 0,
          label: type === "peace" ? `Propose peace to the ${z.name}` : `Propose a ${TREATY_INFO[type].label.toLowerCase()} to the ${z.name}`,
          lines: [`They answer at once. Their opinion of you now: ${op > 0 ? "+" : ""}${op} (${opinionLabel(op).toLowerCase()})`].concat(sells ? [lackText(g, L)] : []),
          score: type === "trade" && op > 0 ? 1 + (sells ? 1 : 0) : type === "trade" && sells && op > -10 ? 0.5 : type === "peace" ? 0.5 : -1, op });
      }
    }
  }
  return out;
}

/* ---------- Trade orders (10s): embargoes, lifting them, preferred sellers, grain and food aid ----------
   Every one is an engine action the Trade panel and rival governments use too; the numbers come from the same
   embargo preview. Ids use only [a-z0-9:_-] so the minister's answer can name them. None is in AUTO_FX: a
   minister never starts or ends an embargo on his own. */
const EMB_PV_CACHE = { g: null, stamp: "", m: new Map() };
/* An embargo preview costs a few what-if economies: keep it while nothing in the world changes. */
function embargoPreviewCached(w, g, by, on, k, dir, food) {
  const stamp = `${g.turn}|${g.ver || 0}|${g.trade ? `${g.trade.turn}:${(g.trade.embargoes || []).length}:${g.trade.nextId}` : ""}`;
  if (EMB_PV_CACHE.g !== g || EMB_PV_CACHE.stamp !== stamp) { EMB_PV_CACHE.g = g; EMB_PV_CACHE.stamp = stamp; EMB_PV_CACHE.m = new Map(); }
  const key = `${by}|${on}|${k}|${dir}|${food ? 1 : 0}|${JSON.stringify(g.nations[by].laws)}`;
  if (!EMB_PV_CACHE.m.has(key)) EMB_PV_CACHE.m.set(key, embargoPreview(w, g, by, on, k, dir, food));
  return EMB_PV_CACHE.m.get(key);
}
/* "Their output −$0.4B a year, ours −$0.2B; their opinion of you −1 → −16 (wary)". */
function embargoConsequenceText(pv) {
  return `Their output ${bSigned(pv.them)} a year, ours ${bSigned(pv.self)}; their opinion of you ${signed(pv.op0)} → ${signed(pv.op1)} (${pv.word.toLowerCase()})`;
}
/* One embargo order, with its preview; null when that embargo is already in force. */
function embargoOrder(w, g, n, econ, on, k, dir, extra = {}) {
  const nid = n.id, id = `embargo:${dir}:${k}:${on}`, good = k === "all" ? null : k;
  const label = extra.label || embargoEffectText(g, { on, k, dir });
  const block = embargoBlock(g, nid, on, k, dir);
  if (block && /already in force/.test(block)) return null;
  if (block) return { id, kind: "fx", group: "Trade", label, effects: [], lines: [], cost: 0, blocked: block, score: -9, good, target: on, allGoods: k === "all" };
  const pv = embargoPv(embargoPreviewCached(w, g, nid, on, k, dir, false));
  const o = fxOrder(id, label, [{ t: "embargo", on, k, dir, why: "choice", pv }], g, nid, { group: "Trade", good, target: on, allGoods: k === "all", score: extra.score ?? -1 });
  const hungry = k === "food" && computeEconomy(w, g, on).famineShare > 0.02;
  // how our own groups take it while it lasts (the same terms as their mood: 30q)
  const groups = dir !== "buy" ? banGroupDelta(g, n, econ, pv.lost, k === "food" || (k === "all" && !!extra.food)) : {};
  o.emb = { pv, k, dir, on, hungry, groups };
  o.lines = [embargoConsequenceText(pv)].concat(pv.lost > 0.005 ? [`Our exporters lose ${bMoney(pv.lost)} of sales a year until they find other buyers`] : [], embargoPvLines(pv),
    pv.ends ? ["It ends our treaty with them"] : [], pv.broken ? ["It BREAKS our promise to them: every nation will see it"] : [], hungry ? ["They are hungry: every nation would see us let them go hungry"] : [],
    [lastingGroupText(groups, "while it lasts")].filter(Boolean));
  return o;
}
function economyTradeOrders(w, g, n, econ) {
  if (!g.trade || !g.trade.v) return [];
  const nid = n.id, out = [], Y = Math.max(1, econ.gdp);
  // embargoes on our main partners: the good we sell them most, the good we buy from them most, and all trade
  const TO = tradeOf(g, nid);
  const top = o => Object.entries(o).filter(([k]) => k !== "food").map(([k, q]) => ({ k, v: goodWorth(g, k, q) })).sort((a, b) => b.v - a.v)[0];
  const embs = [];
  for (const p of TO.partners.slice(0, 4)) {
    if (atWar(g, nid, p.nid) || !g.nations[p.nid] || !g.nations[p.nid].alive) continue;
    const s = top(p.sell), b = top(p.buy);
    if (s && s.v >= 0.01) embs.push([p.nid, s.k, "sell"]);
    if (b && b.v >= 0.01) embs.push([p.nid, b.k, "buy"]);
    if (p.sellV + p.buyV >= 0.02) embs.push([p.nid, "all", "both"]);
  }
  // a nation with an embargo on us can be answered with a full embargo, even when it has cut all our trade already
  for (const by of [...new Set(embargoesOn(g, nid).map(e => e.by))].sort((a, b) => a - b))
    if (g.nations[by] && g.nations[by].alive && !atWar(g, nid, by) && !embs.some(x => x[0] === by && x[1] === "all")) embs.push([by, "all", "both"]);
  for (const [on, k, dir] of embs.slice(0, 8)) { const o = embargoOrder(w, g, n, econ, on, k, dir, k === "all" ? { label: `Stop all trade with the ${nameOf(g, on)} (a full embargo; food still allowed)` } : {}); if (o) out.push(o); }
  // lifting our own embargoes
  for (const e of embargoesBy(g, nid)) {
    const young = g.turn - e.since < TRADE.minEmbargo;
    const o = fxOrder(`lift:${e.id}`, `Lift our embargo on the ${nameOf(g, e.on)} (${e.k === "all" ? "all trade" : goodWord(e.k)})`, [{ t: "lift", id: e.id, on: e.on }], g, nid, { group: "Trade", target: e.on, good: e.k === "all" ? null : e.k, score: -0.5 });
    const groups = liftGroupDelta(g, n, econ, e);
    o.lift = { young, since: e.since, groups };
    o.lines = [young ? `No goodwill: it began less than a year ago (${seasonLabel(e.since)})` : "Their opinion of us rises a little, and their grudge halves", "Our merchants may trade with them again at once; the full contracts are signed at the end of the season"]
      .concat([lastingGroupText(groups, "once it ends")].filter(Boolean));
    out.push(o);
  }
  // a second seller for the key goods we buy most
  const imp = TRADE_GOODS.filter(k => k !== "food" && (econ.goods.imports[k] || 0) > 1e-3).map(k => ({ k, v: goodWorth(g, k, econ.goods.imports[k]) })).filter(x => x.v >= 0.005 * Y || TRADE.key.includes(x.k)).sort((a, b) => b.v - a.v).slice(0, 3);
  const prefCount = (g.trade.prefer || []).filter(p => p.by === nid).length;
  for (const { k } of imp) {
    const cur = (g.trade.prefer || []).find(p => p.by === nid && p.k === k);
    if (cur) {
      const o = fxOrder(`prefer:${k}:none`, `Stop preferring the ${nameOf(g, cur.from)} for ${goodWord(k)}`, [{ t: "prefer", k, from: null }], g, nid, { group: "Trade", good: k, target: cur.from, score: -1 });
      out.push(o);
      continue;
    }
    const offers = tradeOffers(w, g, nid, k).sellers.filter(s => !s.whyNot && s.price);
    const cheapest = offers.slice().sort((a, b) => a.price.p - b.price.p)[0];
    const dep = dependence(g, nid, k)[0];
    const alt = offers.filter(s => s.nid >= 0 && s.offered > 1e-3 && (!dep || s.nid !== dep.from)).sort((a, b) => a.price.p - b.price.p || a.nid - b.nid)[0];
    const risky = dep && dep.share >= 0.6 && TRADE.key.includes(k);
    if (alt && prefCount >= 3) out.push({ id: `prefer:${k}:${alt.nid}`, kind: "fx", group: "Trade", label: `Buy ${goodWord(k)} from the ${nameOf(g, alt.nid)} first (a second seller)`, effects: [], lines: [], cost: 0, good: k, target: alt.nid, score: -9,
      blocked: "We already prefer three sellers, the most our merchants will follow: stop preferring one of them first" });
    else if (alt) {
      const o = fxOrder(`prefer:${k}:${alt.nid}`, `Buy ${goodWord(k)} from the ${nameOf(g, alt.nid)} first (a second seller)`, [{ t: "prefer", k, from: alt.nid }], g, nid, { group: "Trade", good: k, target: alt.nid, score: risky ? 0.5 : -1 });
      const dearer = cheapest ? alt.price.p / cheapest.price.p - 1 : 0;
      o.pref = { dearer };
      o.lines.push(`Their price at our border: ${pct(alt.price.p / Math.max(1e-6, alt.price.base))} of the world price${dearer > 0.005 ? ` (${pct(dearer)} more than the cheapest seller)` : " (the cheapest seller)"}`);
      if (risky) o.lines.push(`Today ${pct(dep.share)} of our ${goodWord(k)} comes from the ${nameOf(g, dep.from)}`);
      out.push(o);
    } else if (risky) out.push({ id: `prefer:${k}:find`, kind: "fx", group: "Trade", label: `Find a second seller of ${goodWord(k)}`, effects: [], lines: [], cost: 0, good: k, score: -9,
      blocked: `No other nation we can reach has ${goodWord(k)} to sell${econ.trade && econ.trade.worldImportCapRaw > 0 ? "; the world market sells some, at the middlemen's price" : ", and the world market is closed to us"}. A trade road, a harbor on the ocean or a trade agreement would open new sellers` });
  }
  return out;
}
/* Agriculture: food aid to hungry nations we can reach, and a ban on selling grain to a buyer. */
function grainTradeOrders(w, g, n, econ, key, months) {
  if (!g.trade || !g.trade.v) return [];
  const nid = n.id, out = [];
  const hungry = liveNations(g).filter(z => z.id !== nid).map(z => ({ z, e: computeEconomy(w, g, z.id) })).filter(x => x.e.famineShare > 0.02).sort((a, b) => b.e.famineShare - a.e.famineShare || a.z.id - b.z.id).slice(0, 3);
  for (const { z, e } of hungry) {
    const id = `aid:${z.id}`, label = `Send grain to the ${z.name} (food aid)`;
    const qt = foodAidQuote(w, g, nid, z.id, 1);
    if (!qt.ok) { out.push({ id, kind: "fx", group: "Trade", label, effects: [], lines: [], cost: 0, score: -9, target: z.id, good: "food", blocked: qt.reason }); continue; }
    if (cooling(n, key, id, 4, g)) continue;
    const ours = monthsOfFood(qt.q, econ.pop);
    const o = fxOrder(id, label, [{ t: "foodAid", to: z.id, months: 1, got: sr(qt.months, 2), q: sr(qt.q, 4), opinion: Math.round(qt.opinion), ours: sr(ours, 2) }], g, nid,
      { group: "Trade", target: z.id, good: "food", score: months - ours >= 3 && qt.opinion > 0 && !atWar(g, nid, z.id) ? 0.5 : -1 });
    o.aid = { after: months - ours, recent: qt.recent };
    o.lines.push(`${pct(e.famineShare)} of their people go hungry`);
    if (qt.recent) o.lines.push("No new goodwill: we sent them grain less than a year ago");
    // the faithful are proud of a nation that feeds the hungry (30q: for two years after the last aid)
    if (!((g.trade.aid || []).some(a => a.from === nid && g.turn - a.turn < 8))) o.lines.push(lastingGroupText({ faith: 2 }, "for 8 seasons: we fed the hungry abroad"));
    out.push(o);
  }
  for (const p of tradeOf(g, nid).partners.filter(p => (p.sell.food || 0) > 1e-3 && !atWar(g, nid, p.nid)).slice(0, 2)) {
    const o = embargoOrder(w, g, n, econ, p.nid, "food", "sell", { label: `Stop selling grain to the ${nameOf(g, p.nid)}` });
    if (o) out.push(o);
  }
  return out;
}
/* Defence: the war goods we sell to a nation that claims our land or whose generals plan a war on us. */
function warGoodsOrders(w, g, n, econ) {
  if (!g.trade || !g.trade.v) return [];
  const nid = n.id, out = [];
  const intel = g.intel || {};
  const hot = liveNations(g).filter(z => z.id !== nid && !atWar(g, nid, z.id) && ((claimActive(g) && g.opening.by === z.id) || (nid === PLAYER && (typeof intel[z.id] === "number" ? intel[z.id] : 0) >= 2)));
  for (const z of hot) {
    const tw = tradeWith(g, nid, z.id);
    const ks = Object.keys(tw.aSells).filter(k => STRATEGIC_USE[k] && !tw.aSells[k].blocked && tw.aSells[k].shareOfNeed >= 0.3).sort((a, b) => tw.aSells[b].shareOfNeed - tw.aSells[a].shareOfNeed).slice(0, 2);
    for (const k of ks) {
      const o = embargoOrder(w, g, n, econ, z.id, k, "sell", { label: `Stop selling ${goodWord(k)} to the ${z.name} (${STRATEGIC_USE[k]})`, score: 0.5 });
      if (o) { o.lines.unshift(`They get ${pct(Math.min(1, tw.aSells[k].shareOfNeed))} of their ${goodWord(k)} from us`); out.push(o); }
    }
  }
  return out;
}
/* The minister's own view of an order: the code decides whether he objects and why; Claude only puts it in words. */
function objectionFor(w, g, n, econ, m, o) {
  if (!m) return null;
  const Y = Math.max(1, econ.gdp);
  const careful = minHas(m, "careful") || minHas(m, "stubborn"), bold = minHas(m, "bold");
  if (o.cost > 0) {
    const debtAfter = Math.max(0, -(n.treasury - o.cost)) / Y;
    const lim = bold ? 0.35 : careful ? 0.15 : 0.25;
    if (debtAfter > lim) return `We are too deep in debt: this would take the debt to ${pct(debtAfter)} of a year's output.`;
    if (careful && o.cost > 0.04 * Y) return `It is a lot of money (${fmtMoney(o.cost)}) for one order.`;
  }
  if (o.kind === "project" && !bold && (o.q.dGdp || 0) < -Math.max(0.05, 0.005 * Y) && !((o.q.dFood || 0) > 0.01 || (o.q.famineRelief || 0) > 0.01 || o.q.reconnected > 0 || (o.q.satChanges || []).length)) return `It would lower our output by ${fmtMoney(-o.q.dGdp)} a year for now.`;
  if (o.kind === "law") {
    if (o.dStab <= (bold ? -6 : careful ? -2 : -3.5)) return `People will not like it: stability would head ${Math.abs(Math.round(o.dStab))} points down.`;
    if (o.dBal < -0.02 * Y / 4 && n.treasury < 0 && !bold) return `It costs ${fmtMoney(-o.dBal)} a season, and we are already in debt.`;
    if (o.law === "arms" && o.value === "war" && !atWarAny(g, n.id) && careful) return "We are at peace. A war economy would make people poorer for nothing.";
  }
  if (o.id === "fx:crackdown" && (careful || minHas(m, "honest"))) return "People will remember the police long after the streets are quiet.";
  if (o.id === "fx:publicworks" && (econ.unemployment || 0) < 0.02) return "Hardly anyone is without work. The money would build little we need.";
  if (o.id === "fx:stimulus" && n.treasury < -0.15 * Y) return "We would be borrowing to spend, and our debt is already high.";
  if (o.kind === "envoy" && o.type === "alliance" && (o.op ?? 0) < 20) return "They do not like us enough yet. I expect them to refuse.";
  if (o.kind === "envoy" && o.type !== "peace" && (o.op ?? 0) < -10) return "Their opinion of us is poor. I expect them to refuse.";
  if (o.kind === "law" && o.law === "army" && o.below) return "We have more soldiers than this law allows. Many would be sent home.";
  if (o.kind === "stance" && o.value === "offensive" && careful) return "Attacks cost lives. Our generals should be sure before they strike.";
  // trade (10s): what an embargo, a lift, food aid or a preferred seller would cost us, in numbers
  if (o.emb) {
    const pv = o.emb.pv;
    if (pv.broken) return "We promised them not to do this. Every nation would see us break our word.";
    if (pv.ends && !bold) return "It would end our treaty with them.";
    if (o.emb.hungry) return "They are hungry. Every nation would see us let them go hungry.";
    if (!bold && -pv.self >= 0.005 * Y) return `It would cost us ${fmtMoney(-pv.self)} of output a year${pv.lost > 0.005 ? `: our exporters would lose ${fmtMoney(pv.lost)} of sales` : ""}.`;
    if (careful && pv.war >= 3) return `They would hate us for it: their wish for war with us would rise by ${pv.war}.`;
  }
  if (o.lift && o.lift.young && careful) return "It began less than a year ago. Lifting it now earns us no goodwill, and they will think we are weak.";
  if (o.aid && o.aid.after < 2 && !bold) return `Our own reserve would fall to ${fmt1(Math.max(0, o.aid.after))} months of food.`;
  if (o.pref && o.pref.dearer > 0.05 && careful) return `Their price at our border is ${pct(o.pref.dearer)} above the cheapest seller's. We would pay more for safety.`;
  const mg = ministerGroup(m);
  if (mg && n.groups && !bold) {
    if (o.kind === "law") { const d = groupLawDelta(w, g, n, o.law, o.value)[mg]; if (d <= -5) return `It would anger ${GROUPS[mg].the}, the people I come from: their approval would fall ${-d} points.`; }
    const ld = o.emb ? (o.emb.groups || {})[mg] || 0 : 0;
    if (ld <= -4) return `It would anger ${GROUPS[mg].the}, the people I come from: their approval would fall ${-ld} points while it lasts.`;
    const ge = (o.effects || []).find(e => e.t === "group");
    if (ge && (ge.v[mg] || 0) <= -5) return `It would anger ${GROUPS[mg].the}, the people I come from.`;
  }
  return null;
}
function ministryOrders(w, g, nid, key) {
  // nothing changes while the menu is drawn up: each nation's economy is worked out once (the trade orders read several)
  return withEconMemo(g, () => ministryOrdersRaw(w, g, nid, key));
}
function ministryOrdersRaw(w, g, nid, key) {
  const n = g.nations[nid];
  if (!ministryActive(n, key)) return [];
  const econ = computeEconomy(w, g, nid);
  const m = ministry(n, key).minister;
  const out = [];
  const projects = cabinetProjects(w, g, n, econ).filter(q => projectArea(q) === key)
    .sort((a, b) => (b.value ?? 0) / Math.max(0.5, b.cost) - (a.value ?? 0) / Math.max(0.5, a.cost)).slice(0, 8);
  for (const q of projects) out.push(projectOrder(w, g, n, econ, q));
  const lawsHere = MINISTRIES[key].laws;
  if (lawsHere.length) {
    const base = forecast(w, g, nid, n.laws);
    for (const law of lawsHere) {
      const cur = n.laws[law];
      const vals = law === "tax" ? [stepTax(cur, -1), stepTax(cur, 1)] : (() => { const O = lawSteps(law); const i = O.indexOf(cur ?? O[0]); return [O[i - 1], O[i + 1]]; })();
      for (const v of vals) if (v !== undefined && v !== cur) out.push(lawOrder(w, g, n, econ, law, v, base));
    }
  }
  out.push(...specialOrders(w, g, n, econ, key));
  const seen = new Set();
  for (const o of out) {
    if (seen.has(o.id)) o.dup = true;
    seen.add(o.id);
    const af = o.cost > 0 ? canAfford(n, econ.gdp, o.cost) : { ok: true };
    o.blocked = af.ok ? o.blocked || null : af.reason;
    o.objection = o.blocked ? null : objectionFor(w, g, n, econ, m, o);
  }
  return out.filter(o => !o.dup);
}
/* Carry out an order. Every order is checked again against the world as it is now. */
function executeOrder(w, g, nid, key, id, how) {
  const n = g.nations[nid];
  const M = ministry(n, key);
  if (!M || !ministryActive(n, key)) return { ok: false, text: "That ministry has no minister." };
  const o = ministryOrders(w, g, nid, key).find(x => x.id === id);
  if (!o) return { ok: false, text: "That order can no longer be given: things have changed." };
  if (o.blocked) return { ok: false, text: o.blocked };
  const m = M.minister;
  let text = "";
  if (o.kind === "project") {
    const p = orderProject(g, o.q, `Ordered through the ${MINISTRIES[key].label} ministry`);
    text = `Began work on ${o.q.label.charAt(0).toLowerCase()}${o.q.label.slice(1)} (${fmtMoney(p && p.cost !== undefined ? p.cost : o.cost)}).`;
  } else if (o.kind === "law") {
    n.laws = { ...n.laws, [o.law]: o.value };
    text = `${LAW_NAMES[o.law]} set to ${lawValueLabel(o.law, o.value)}.`;
  } else if (o.kind === "fx") {
    applyEffects(w, g, nid, o.effects);
    M.cool[o.id] = g.turn;
    // a trade action writes its own news (the embargo, the lift, the aid): the log keeps only what was ordered
    text = o.emb || o.lift || o.aid ? `${o.label}.` : `${o.label}: ${o.lines.join("; ")}.`;
  } else if (o.kind === "raise") {
    const d = raiseForce(g, nid, o.q);
    text = `${o.label}${d && d.name ? `: the ${d.name}` : ""}.`;
  } else if (o.kind === "stance") {
    n.warPlan = { ...(n.warPlan || {}), stance: o.value };
    text = o.value === "offensive" ? "The generals will press the attack where the odds favor them." : "The generals will hold the line.";
  } else if (o.kind === "envoy") {
    const r = ministerEnvoy(w, g, nid, o, m);
    text = r.text;
  }
  if (how !== "auto") {
    if (o.objection) { m.overruled = (m.overruled || 0) + 1; m.loyalty = clamp(m.loyalty - CAB.overrule * (minHas(m, "loyal") ? 0.5 : minHas(m, "ambitious") || minHas(m, "stubborn") ? 1.5 : 1), 0, 100); }
    else if (o.cost > 0 && m.praised !== g.turn) { m.loyalty = clamp(m.loyalty + CAB.approve, 0, 100); m.praised = g.turn; }
  }
  M.log.unshift({ turn: g.turn, text: how === "auto" ? `On ${hisHer(m)} own: ${text}` : text });
  if (M.log.length > 12) M.log.length = 12;
  if (nid === PLAYER) addChronicle(g, `${MINISTRIES[key].label}: ${text}`, "neutral", PLAYER);
  return { ok: true, text, overruled: !!o.objection };
}
/* The foreign minister carries a proposal himself: it is weighed exactly like a letter with formal terms. */
function ministerEnvoy(w, g, nid, o, m) { return sendEnvoy(w, g, nid, o.target, o.type, m); }
/* An envoy (a minister, or the government's envoy when m is null, as in a decision) brings a proposal in person:
   one treaty type, or a list of terms (a decision may offer money with it). */
function sendEnvoy(w, g, nid, to, type, m) {
  const terms = Array.isArray(type) ? type : [{ type }];
  const text = m ? `${m.name}, our foreign minister, brings our proposal in person.` : "Our envoy brings our proposal in person.";
  const analysis = analyzeLetterRules(text);
  const outcome = processLetter(g, w, to, text, terms, false, analysis);
  g.lastLetter = g.lastLetter || {};
  g.lastLetter[to] = g.turn;
  const entry = { id: g.nextId++, turn: g.turn, to, text, terms: outcome.terms, threat: false, status: "done", verdict: outcome.verdict, lines: outcome.lines, notes: outcome.notes,
    counter: outcome.counter, counterStatus: null, reply: templateReply(g, to, outcome), source: "rules", inferred: outcome.inferred, summary: "", manipulation: false, ...(m ? { byMinister: m.name } : {}) };
  g.letters.unshift(entry);
  if (g.letters.length > 40) g.letters.length = 40;
  const answer = { accept: "They accepted.", reject: "They refused.", counter: "They answered with a counter-offer: you can answer it in Letters.", message: "They read it." }[outcome.verdict] || "";
  const t = `${m ? m.name : "Our envoy"} proposed ${termsText(g, terms)} to the ${nameOf(g, to)}. ${answer}`;
  if (!m && nid === PLAYER) addChronicle(g, t, outcome.verdict === "accept" ? "good" : "neutral", PLAYER);
  return { text: t, verdict: outcome.verdict };
}

/* ---------- What each minister would tell you this season ---------- */
/* The trade worry of the Economy minister, from the merchants' book (cheap: read every time the panel is drawn).
   Only when losing it would really hurt (the engine's own test: half a percent of output, or a fifth of a key good).
   Level 2: half or more of a key good comes from a nation that has an embargo on us, is at war with us, or whose
   generals our intelligence expects to attack. Level 1: 60% or more of a good from one nation. */
function tradeConcern(w, g, n, econ) {
  if (!g.trade || !g.trade.v) return null;
  const nid = n.id;
  const R = tradeRisks(w, g, nid, econ, { cheap: true });
  for (const r of R) {
    if (!TRADE.key.includes(r.k) || r.share < 0.5) continue;
    const emb = embargoesBy(g, r.from, nid), war = atWar(g, nid, r.from);
    const iv = nid === PLAYER && g.intel ? g.intel[r.from] : 0, intel = typeof iv === "number" ? iv : (iv && iv.level) || 0;
    if (emb.length || war || intel >= 2) return { level: 2, text: `${pct(r.share)} of our ${goodWord(r.k)} comes from the ${nameOf(g, r.from)}, and ${war ? "we are at war with them" : emb.length ? `they have an embargo on us (${emb.map(e => embargoLabel(g, e).toLowerCase()).join("; ")})` : "our generals expect them to attack us"}.` };
  }
  const r1 = R.find(r => r.share >= 0.6);
  if (!r1) return null;
  const alt = r1.why[r1.why.length - 1] || "";
  return { level: 1, text: `We depend on the ${nameOf(g, r1.from)} for ${pct(r1.share)} of our ${goodWord(r1.k)} (${bMoney(r1.lossPct * Math.max(1, econ.gdp))} a year).${alt ? ` ${alt.charAt(0).toUpperCase()}${alt.slice(1)}.` : ""}` };
}
/* " The X's contract is cut: <why>." for a good we are short of, when that is the reason. */
function cutText(g, nid, econ, k) {
  const c = ((econ.trade && econ.trade.cut && econ.trade.cut[k]) || []).find(x => x.from !== undefined);
  return c ? ` What we bought from ${whoName(g, c.from)} cannot come: ${tradeBlockedText(g, c.code, c.from, nid, k)}.` : "";
}
/* What the Agriculture minister can say about buying grain in a famine (cheap: no economy is worked out). */
function grainHint(g, nid, econ) {
  if (!g.trade || !g.trade.v) return "";
  const fed = (econ.foodIn || 0) / Math.max(0.1, econ.pop);
  const ban = embargoesOn(g, nid).find(e => e.k === "food" || (e.k === "all" && e.food));
  if (ban) return ` The ${nameOf(g, ban.by)} stopped selling us food.`;
  if (fed > 0.005) return ` Grain bought abroad feeds ${pct(fed)} of our people, but it is not enough.`;
  if (!tradeOpen(econ)) return " We cannot buy grain abroad: no nation can reach us, and the world market is closed to us.";
  const T = econ.trade || {};
  const seller = Object.keys(T.links || {}).map(Number).some(o => ((g.trade.unsold.food || [])[o] || 0) > 0.005 && !tradeBlocked(g, o, nid, "food"));
  return seller || T.worldImportCapRaw > 0 ? " Grain can be bought abroad: an order of this ministry puts it in the reserve." : " No nation we can reach has grain to spare, and the world market is closed to us.";
}
function ministryConcern(w, g, n, econ, key) {
  const nid = n.id;
  if (key === "interior") {
    const worst = econ.regions.filter(r => r.pop > 0.2).sort((a, b) => townURate(b) - townURate(a))[0];
    if (n.stability < 35) return { level: 2, text: `Stability is low (${Math.round(n.stability)}). We must calm the country before it turns on us.` };
    if (worst && townURate(worst) > 0.08) return { level: 2, text: `${pct(townURate(worst))} of the workers in ${worst.city.name} have no job.` };
    const angry = econ.regions.map(r => r.city).filter(c => (c.mood ?? 55) < 32).sort((a, b) => (b.imp || 0) - (a.imp || 0))[0];
    if (angry) return { level: (angry.imp || 0) >= 35 || angry.capital ? 2 : 1, text: `Unrest in ${angry.name}: the mood there is ${Math.round(angry.mood)}.` };
    const doubt = econ.regions.map(r => r.city).filter(c => c.origin !== c.owner && (c.loyalty ?? 92) < 40).sort((a, b) => a.loyalty - b.loyalty)[0];
    if (doubt) return { level: 1, text: `The people of ${doubt.name} do not yet feel part of our nation (loyalty ${Math.round(doubt.loyalty)}).` };
    const mad = n.groups ? GROUP_ORDER.filter(k => k !== "army" && n.groups[k].approval < GRP.angryAt && n.groups[k].share >= 0.12).sort((a, b) => n.groups[b].share - n.groups[a].share)[0] : null;
    if (mad) return { level: 2, text: `${GROUPS[mad].label} ${GROUPS[mad].are} angry (approval ${Math.round(n.groups[mad].approval)}, ${pct(n.groups[mad].share)} of the power)${n.groups[mad].demand ? `. They demand: ${n.groups[mad].demand.label.toLowerCase()}` : ""}.` };
    const dem = n.groups ? GROUP_ORDER.filter(k => n.groups[k].demand && n.groups[k].share >= 0.15 && n.groups[k].demand.until - g.turn <= 3)[0] : null;
    if (dem) return { level: 1, text: `${GROUPS[dem].label} wait for their demand (${n.groups[dem].demand.label.toLowerCase()}): ${n.groups[dem].demand.until - g.turn} season${n.groups[dem].demand.until - g.turn === 1 ? "" : "s"} left.` };
    const cut = econ.networks.filter(x => !x.capital).reduce((s, x) => s + x.pop, 0);
    if (cut > 0.15 * econ.pop) return { level: 1, text: `${fmtPeople(cut)} people live in towns not joined to the capital by road.` };
    return { level: 0, text: `The country is calm. Stability ${Math.round(n.stability)}.` };
  }
  if (key === "economy") {
    if (n.treasury < -0.6 * econ.gdp) return { level: 2, text: `Our debt is ${pct(-n.treasury / econ.gdp)} of a year's output. Lenders are getting nervous.` };
    const tc = tradeConcern(w, g, n, econ);
    if (tc && tc.level >= 2) return tc;
    const short = GOOD_ORDER.filter(k => econ.goods.demand[k] > 0.2 && (econ.sat[k] ?? 1) < 0.7 && k !== "power" && k !== "food");
    if (short.length) return { level: 1, text: `We are short of ${short.slice(0, 2).map(k => GOODS[k].label.toLowerCase()).join(" and ")}.${cutText(g, nid, econ, short[0])}` };
    if (tc) return tc;
    return { level: 0, text: `Output is ${fmtMoney(econ.gdp)} a year.` };
  }
  if (key === "agriculture") {
    if ((econ.famineShare || 0) > 0.02) return { level: 2, text: `${pct(econ.famineShare)} of our people do not have enough food.${grainHint(g, nid, econ)}` };
    const ratio = econ.food / Math.max(0.1, econ.pop);
    const fedAbroad = (econ.foodIn || 0) / Math.max(0.1, econ.pop);
    if (ratio < 1.1) return { level: 1, text: `The farms feed only ${pct(ratio)} of what we need.${fedAbroad > 0.005 ? ` Grain bought abroad feeds ${pct(fedAbroad)} more, while its sellers keep selling.` : ""} One bad harvest and people go hungry.` };
    return { level: 0, text: `The farms feed ${pct(ratio)} of our needs. ${fmt1(monthsOfFood((n.granary && n.granary.stock) || 0, econ.pop))} months of food in store.` };
  }
  if (key === "energy") {
    if ((econ.sat.power ?? 1) < 0.85) return { level: 2, text: `Blackouts: we make only ${pct(econ.sat.power)} of the electricity we need.` };
    // fuel that a war, an embargo or a lost harbor keeps from reaching us
    for (const k of ["oil", "coal"]) {
      const c = ((econ.trade && econ.trade.cut && econ.trade.cut[k]) || []).find(x => x.from !== undefined);
      if (c && (econ.sat[k] ?? 1) < 0.9) return { level: 2, text: `${GOODS[k].label} from ${whoName(g, c.from)} cannot reach us (${tradeBlockedText(g, c.code, c.from, nid, k)}): we have ${pct(econ.sat[k] ?? 1)} of what we need${k === "oil" ? `, and the army ${pct(econ.fuelSat ?? 1)} of its fuel` : ""}.` };
    }
    if ((econ.sat.coal ?? 1) < 0.8 && econ.goods.demand.coal > 0.2) return { level: 1, text: `We are short of coal (${pct(econ.sat.coal)} of what we need).${cutText(g, nid, econ, "coal")}` };
    return { level: 0, text: `We make ${pct(econ.sat.power ?? 1)} of the electricity we need.` };
  }
  if (key === "defence") {
    const hot = liveNations(g).filter(z => z.id !== nid).map(z => ({ z, r: warRisk(w, g, z.id, nid) })).filter(x => x.r && x.r.level >= 2).sort((a, b) => b.r.level - a.r.level)[0];
    if (atWarAny(g, nid)) return { level: 2, text: "We are at war. Every division counts." };
    if (hot) return { level: 2, text: `The war risk from the ${hot.z.name} is ${hot.r.label.toLowerCase()}.` };
    if (n.groups && n.groups.army.approval < GRP.angryAt && n.groups.army.share >= 0.1) return { level: 2, text: `The officers are angry (approval ${Math.round(n.groups.army.approval)}). I hear talk in the barracks that I do not like.${n.groups.army.demand ? ` They want: ${n.groups.army.demand.label.toLowerCase()}.` : ""}` };
    // the nation that claims our town arms itself with what we sell it
    if (claimActive(g)) { const line = strategicSalesLine(g, nid, g.opening.by); if (line) return { level: 1, text: line }; }
    return { level: 0, text: `${g.divisions.filter(d => d.owner === nid).length} divisions stand ready. No neighbor is preparing for war.` };
  }
  if (key === "foreign") {
    const worst = liveNations(g).filter(z => z.id !== nid && sharesBorder(g, nid, z.id)).map(z => ({ z, v: opinionDetail(g, z.id, nid).value })).sort((a, b) => a.v - b.v)[0];
    if (worst && worst.v < -30) return { level: 2, text: `The ${worst.z.name} is ${opinionLabel(worst.v).toLowerCase()} toward us (${worst.v}).` };
    // an embargo on us: the worst one first (how much it hurt us when it was declared)
    const emb = embargoesOn(g, nid).filter(e => g.nations[e.by] && g.nations[e.by].alive).sort((a, b) => (b.hurt || 0) - (a.hurt || 0) || a.id - b.id)[0];
    if (emb) return { level: (emb.hurt || 0) >= 1 || emb.k === "all" || TRADE.key.includes(emb.k) ? 2 : 1, text: `The ${nameOf(g, emb.by)} ${embargoVerb(emb)} us (since ${seasonLabel(emb.since)}). An envoy, a letter with an offer, or our own embargo could answer it.` };
    const partners = (g.treaties || []).filter(t => t.type === "trade" && (t.a === nid || t.b === nid)).length;
    if (!partners) return { level: 1, text: "We have no trade agreements yet. Our merchants are waiting." };
    return { level: 0, text: `We have ${partners} trade agreement${partners > 1 ? "s" : ""}.` };
  }
  return { level: 0, text: "" };
}
/* The orders a minister would put to you first. */
function recommendedOrders(orders) {
  return orders.filter(o => !o.blocked && !o.objection && o.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
}

/* ---------- The cabinet's season: own work, loyalty, scandals, resignations, rivals' appointments ---------- */
function cabinetSeasonStart(w, g, dispatch) {
  const n = g.nations[PLAYER];
  if (!n || !n.alive || !n.cabinet) return;
  let spent = 0;
  for (const key of MIN_ORDER) {
    const M = n.cabinet.min[key];
    if (!M || M.pending || !M.minister || !M.auto) continue;
    const econ = computeEconomy(w, g, PLAYER);
    if (n.treasury < 0 && (minHas(M.minister, "careful") || n.treasury < -0.2 * econ.gdp)) continue;
    const limit = Math.min((CAB.limits[M.limit] || 0) * econ.gdp, CAB.autoTotal * econ.gdp - spent);
    if (limit <= 0) continue;
    const AUTO_FX = ["fx:publicworks", "fx:farmsub", "fx:buygrain", "fx:exercises", "fx:stimulus"];
    const orders = ministryOrders(w, g, PLAYER, key).filter(o => (o.kind === "project" || AUTO_FX.includes(o.id) || /^(pace|goodwill):/.test(o.id) || (o.kind === "raise" && ministryConcern(w, g, n, econ, "defence").level >= 2)) && o.cost <= limit);
    const best = recommendedOrders(orders)[0];
    if (!best) continue;
    const r = executeOrder(w, g, PLAYER, key, best.id, "auto");
    if (r.ok) spent += best.cost;
    if (r.ok && dispatch) dispatch.cabinet.push({ key, text: `${M.minister.name} (${MINISTRIES[key].label}), on ${hisHer(M.minister)} own: ${r.text}`, tone: "good" });
  }
}
function cabinetSeasonEnd(w, g, dispatch, rng) {
  notePendingEmbargoCuts(g);
  for (const n of liveNations(g)) {
    if (!n.cabinet) initCabinet(g, n, rng);
    const C = n.cabinet;
    const econ = computeEconomy(w, g, n.id);
    for (const key of MIN_ORDER) {
      const M = C.min[key];
      if (!M) continue;
      if (M.pending) { M.pending = false; if (n.isPlayer && dispatch) dispatch.cabinet.push({ key, text: `The ${MINISTRIES[key].label} ministry is ready. ${M.minister ? `${M.minister.name} takes office.` : ""}` }); continue; }
      for (const x of M.chat || []) if (x.order && x.order.status === "proposed") x.order.status = "expired";
      const m = M.minister;
      if (!m) continue;
      if (g.turn % 4 === 0) m.age += 1;
      m.loyalty = clamp(m.loyalty + (62 - m.loyalty) * 0.04, 0, 100);
      let gone = null;
      if (m.age >= 70 && rng() < 0.06) gone = `${m.name} retires from the ${MINISTRIES[key].label} ministry at ${m.age}.`;
      else if (m.loyalty < CAB.resignAt && rng() < 0.3) gone = `${m.name} resigns from the ${MINISTRIES[key].label} ministry, saying the leader no longer listens.`;
      if (gone) {
        M.minister = null;
        if (n.isPlayer) { if (dispatch) dispatch.cabinet.push({ key, text: `${gone} Appoint someone new.`, tone: "bad" }); addChronicle(g, gone, "warn", PLAYER); if (minHas(m, "popular")) n.stability = clamp(n.stability - 1, 0, 100); }
        continue;
      }
      if (minHas(m, "ambitious") && m.loyalty < 32 && rng() < 0.15) {
        n.stability = clamp(n.stability - 2, 0, 100);
        m.loyalty = clamp(m.loyalty + 6, 0, 100);
        const t = `${m.name} leaked cabinet quarrels to the press. The government looks divided (−2 stability).`;
        if (n.isPlayer) { if (dispatch) dispatch.cabinet.push({ key, text: t, tone: "bad" }); addChronicle(g, t, "warn", PLAYER); }
      }
      if (minHas(m, "corrupt") && g.turn - (m.scandal ?? -99) >= 8 && rng() < 0.05) {
        m.scandal = g.turn;
        n.stability = clamp(n.stability - 3, 0, 100);
        const t = `Scandal: ${m.name} (${MINISTRIES[key].label}) was caught taking bribes (−3 stability). You can dismiss ${himHer(m)}.`;
        if (n.isPlayer) { if (dispatch) dispatch.cabinet.push({ key, text: t, tone: "bad" }); addChronicle(g, t, "bad", PLAYER); }
        else noteFor(n, g, `A bribery scandal in the ${MINISTRIES[key].label} ministry.`, null);
      }
    }
    if (!n.isPlayer) aiCabinet(w, g, n, econ, rng);
  }
}
/* What each of your ministers worries about, for the season's report. Called at the end of the season, after the
   merchants have signed the new contracts, so a trade worry is about this season's trade. */
function cabinetConcernNews(w, g, dispatch) {
  const n = g.nations[PLAYER];
  if (!n || !n.alive || !n.cabinet || !dispatch) return;
  const econ = computeEconomy(w, g, PLAYER);
  for (const key of MIN_ORDER) {
    if (!ministryActive(n, key)) continue;
    const c = ministryConcern(w, g, n, econ, key), M = n.cabinet.min[key];
    const kind = `${c.level}:${c.text.replace(/[0-9.,$%MBk]+/g, "#")}`;
    const fresh = kind !== M.lastConcern || (c.level >= 2 && g.turn - (M.lastConcernTurn ?? -99) >= 4);
    if (c.level >= 1 && fresh) { dispatch.cabinet.push({ key, text: `${M.minister.name} (${MINISTRIES[key].label}): ${c.text}`, tone: c.level >= 2 ? "warn" : "neutral" }); M.lastConcernTurn = g.turn; }
    M.lastConcern = kind;
  }
}
/* An embargo declared on us since the last contracts: note what it cut while the old contracts are still in the
   book. The decision about it (14-11c) is made after the new contracts are signed, when those flows are gone. */
function notePendingEmbargoCuts(g) {
  const T = g.trade;
  if (!T || !T.pendingDecisions || !T.pendingDecisions.length) return;
  const ix = tradeIndex(g);
  for (const p of T.pendingDecisions) {
    if (p.cut) continue;
    const e = (T.embargoes || []).find(x => x.id === p.id);
    const cut = [];
    if (e) for (const k of TRADE_GOODS) {
      if (!embargoCovers(e, k)) continue;
      const qi = e.dir !== "buy" ? ((ix.into[e.on] || {})[k] || []).filter(f => f.s === e.by).reduce((s, f) => s + f.q, 0) : 0;
      const qo = e.dir !== "sell" ? ((ix.outOf[e.on] || {})[k] || []).filter(f => f.b === e.by).reduce((s, f) => s + f.q, 0) : 0;
      const need = (T.need[k] || [])[e.on] || 0;
      if (qi > 1e-4) cut.push({ k, dir: "in", q: sr(qi, 4), share: need > 0 ? sr(qi / need, 3) : 0, v: sr(goodWorth(g, k, qi), 3) });
      if (qo > 1e-4) cut.push({ k, dir: "out", q: sr(qo, 4), share: 0, v: sr(goodWorth(g, k, qo), 3) });
    }
    p.cut = cut;
  }
}
/* Rival governments open ministries as they grow rich, and replace ministers who fail them. */
function aiCabinet(w, g, n, econ, rng) {
  const C = n.cabinet;
  for (const key of MIN_ORDER) {
    const M = C.min[key];
    if (M && !M.minister) { M.minister = makeMinister(g, n, key, rng); continue; }
    if (M && M.minister && (M.minister.skill <= 1 || M.minister.loyalty < 25) && rng() < 0.15) { M.minister = makeMinister(g, n, key, rng, 0.1); continue; }
  }
  if (n.minor) return;
  const cost = establishCost(econ);
  const missing = MIN_ORDER.filter(k => !C.min[k]);
  if (missing.length && n.treasury > 4 * cost && rng() < 0.08) {
    const key = missing[0];
    n.treasury -= cost;
    C.min[key] = newMinistry(g, makeMinister(g, n, key, rng), true);
  }
}

/* ---------- Your decisions about the cabinet ---------- */
function establishMinistry(w, g, nid, key, candidateId) {
  const n = g.nations[nid];
  if (ministry(n, key)) return { ok: false, text: "That ministry already exists." };
  const econ = computeEconomy(w, g, nid);
  const cost = establishCost(econ);
  const af = canAfford(n, econ.gdp, cost);
  if (!af.ok) return { ok: false, text: af.reason };
  const cands = candidatesFor(g, n, key);
  const m = cands.find(x => x.id === candidateId);
  if (!m) return { ok: false, text: "Choose one of the candidates." };
  n.treasury -= cost;
  n.cabinet.min[key] = newMinistry(g, { ...m, since: g.turn + 1 }, true);
  delete n.cabinet.cands[key];
  if (nid === PLAYER) addChronicle(g, `You established a Ministry of ${MINISTRIES[key].label} (${fmtMoney(cost)}), with ${m.name} as minister. It opens next season.`, "neutral", PLAYER);
  return { ok: true, cost };
}
function dismissCost(m) { return m ? 1 + (minHas(m, "popular") ? 3 : 0) + (m.loyalty > 70 ? 1 : 0) : 0; }
function dismissMinister(w, g, nid, key) {
  const n = g.nations[nid], M = ministry(n, key);
  if (!M || !M.minister) return { ok: false };
  const m = M.minister, c = dismissCost(m);
  n.stability = clamp(n.stability - c, 0, 100);
  for (const k of MIN_ORDER) { const o = n.cabinet.min[k]; if (o && o.minister && k !== key) o.minister.loyalty = clamp(o.minister.loyalty - 2, 0, 100); }
  M.minister = null;
  M.chat = [];
  groupMinisterDismissed(g, n, m);
  if (nid === PLAYER) addChronicle(g, `You dismissed ${m.name} from the ${MINISTRIES[key].label} ministry (−${c} stability).`, "warn", PLAYER);
  return { ok: true, cost: c };
}
function appointMinister(w, g, nid, key, candidateId) {
  const n = g.nations[nid], M = ministry(n, key);
  if (!M || M.minister) return { ok: false };
  const m = candidatesFor(g, n, key).find(x => x.id === candidateId);
  if (!m) return { ok: false };
  M.minister = { ...m, since: g.turn };
  M.chat = [];
  delete n.cabinet.cands[key];
  if (nid === PLAYER) addChronicle(g, `${m.name} is the new ${MINISTRIES[key].title}.`, "neutral", PLAYER);
  return { ok: true };
}

/* ---------- A minister's briefing: the facts he may talk about, for Claude and for his own replies ---------- */
function ministryFacts(w, g, n, econ, key) {
  const f = [];
  const L = n.laws;
  if (key === "interior") {
    f.push(`Stability ${Math.round(n.stability)} of 100.`);
    f.push(`Unemployment ${pct1(econ.unemployment || 0)} of workers.`);
    const worst = econ.regions.slice().sort((a, b) => townURate(b) - townURate(a)).slice(0, 2).filter(r => townURate(r) > 0.02);
    if (worst.length) f.push(`Most jobless towns: ${worst.map(r => `${r.city.name} ${pct1(townURate(r))}`).join(", ")}.`);
    const cutN = econ.networks.filter(x => !x.capital).length;
    f.push(`Towns: ${econ.cities.length}; ${cutN} group${cutN === 1 ? "" : "s"} of towns not joined to the capital by road.`);
    f.push(`Healthcare law: ${lawValueLabel("services", L.services)}; education law: ${lawValueLabel("education", L.education || "basic")}.`);
  }
  if (key === "economy") {
    f.push(`Output ${fmtMoney(econ.gdp)} a year. Treasury ${n.treasury >= 0 ? fmtMoney(n.treasury) : `debt ${fmtMoney(-n.treasury)}`}.`);
    f.push(`Taxes ${L.tax}%. Trade policy ${lawValueLabel("trade", L.trade || "balanced")}. Research funding ${lawValueLabel("research", L.research || "low")}.`);
    const short = GOOD_ORDER.filter(k => econ.goods.demand[k] > 0.2 && (econ.sat[k] ?? 1) < 0.8).map(k => `${GOODS[k].label.toLowerCase()} ${pct(econ.sat[k])}`);
    if (short.length) f.push(`Goods in short supply (share of need met): ${short.join(", ")}.`);
  }
  if (key === "agriculture") {
    f.push(`The farms and fishing can feed ${pct(econ.food / Math.max(0.1, econ.pop))} of the people. Hungry people: ${pct(econ.famineShare || 0)}.`);
    f.push(`This year's harvest: ${harvestWord(harvestFactor(n))} (${pct(harvestFactor(n))} of normal).`);
    f.push(`Food reserve: ${fmt1(monthsOfFood((n.granary && n.granary.stock) || 0, econ.pop))} months in store; the law asks for ${GRANARY_LAWS[L.granary || "none"].months}.`);
  }
  if (key === "energy") {
    f.push(`Electricity: ${pct(econ.sat.power ?? 1)} of need. Coal: ${pct(econ.sat.coal ?? 1)}. Oil: ${pct(econ.sat.oil ?? 1)}.`);
    const s = (econ.sites || []).filter(x => x.kind === "coalmine" || x.kind === "oilfield");
    f.push(s.length ? `Coal mines and oil fields: ${s.map(x => `${x.site.name} (${x.status})`).join(", ")}.` : "We have no coal mine or oil field.");
  }
  if (key === "defence") {
    const divs = g.divisions.filter(d => d.owner === n.id);
    f.push(`${divs.length} divisions, ${fmtCount((n.mil && n.mil.men) || 0)} soldiers. Conscription ${lawValueLabel("army", L.army)}; arms production ${lawValueLabel("arms", L.arms)}.`);
    f.push(`Free manpower for new divisions: ${fmtCount(manpowerFree(n, econ))}. Equipment in depots: ${fmtCount((n.stock && n.stock.kits) || 0)} infantry kits, ${fmtCount((n.stock && n.stock.guns) || 0)} guns, ${fmtCount((n.stock && n.stock.tanks) || 0)} tanks, ${fmtCount((n.stock && n.stock.planes) || 0)} planes.`);
    f.push(`Generals' order: ${(n.warPlan && n.warPlan.stance) === "offensive" ? "attack where the odds favor us" : "hold the line"}. Season: ${seasonWar(g).name}.`);
    if (atWarAny(g, n.id)) f.push("We are at war.");
  }
  if (key === "foreign") {
    for (const z of liveNations(g).filter(z => z.id !== n.id).slice(0, 8)) {
      const v = opinionDetail(g, z.id, n.id).value;
      const tr = treatiesBetween(g, n.id, z.id).map(t => TREATY_INFO[t.type] ? TREATY_INFO[t.type].label.toLowerCase() : t.type);
      f.push(`The ${z.name}${z.minor ? " (small state)" : ""}: opinion of us ${v > 0 ? "+" : ""}${v}${atWar(g, n.id, z.id) ? ", AT WAR with us" : ""}${tr.length ? `, treaties: ${tr.join(", ")}` : ""}.`);
    }
  }
  return f;
}


