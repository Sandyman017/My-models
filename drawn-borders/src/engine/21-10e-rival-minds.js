/* =====================================================================
   10e. Rival minds: the engine lists legal options with honest estimates;
        built-in rules or Claude choose; the engine re-checks and applies.
   ===================================================================== */
function lawLabel(law, value) {
  if (law === "tax") return `${taxLaw(value).label} taxes (${value}%)`;
  if (law === "services") return `${SERVICE_LAWS[value].label} healthcare`;
  if (law === "education") return `${EDU_LAWS[value].label} education`;
  if (law === "research") return `Research funding: ${RESEARCH_LAWS[value].label.toLowerCase()}`;
  if (law === "trade") return `Trade policy: ${TRADE_LAWS[value].label.toLowerCase()}`;
  if (law === "finance") return `Financial regulation: ${FINANCE_LAWS[value].label.toLowerCase()}`;
  if (law === "arms") return `Arms production: ${ARMS_LAWS[value].label.toLowerCase()}`;
  if (law === "granary") return `Food reserve: ${GRANARY_LAWS[value].label.toLowerCase()}`;
  if (LABOUR[law]) return `${LABOUR[law].name}: ${lawValueLabel(law, value)}`;
  return `Conscription: ${ARMY_LAWS[value].label.toLowerCase()}`;
}

function maxThreatTo(w, g, nid) {
  let best = 0, who = null;
  for (const z of liveNations(g)) {
    if (z.id === nid) continue;
    const t = threatFrom(w, g, nid, z.id);
    if (t > best) { best = t; who = z.id; }
  }
  return { level: best, who };
}

function lawCandidates(g, w, n, econ) {
  const out = [];
  const pref = ARCHETYPES[n.archetype].laws, L = n.laws;
  const budget = computeBudget(n, econ, L);
  const threat = maxThreatTo(w, g, n.id);
  const atWarNow = enemiesOf(g, n.id).length > 0;
  const push = (law, value, why) => { if (value !== L[law] && !out.some(o => o.law === law)) out.push({ law, value, why }); };
  const settled = g.turn - (n.lastLawTurn ?? -99) < 3 && n.stability >= 35 && !atWarNow;
  if (settled) return [];
  for (const x of groupLawWishes(g, n)) push(x.law, x.value, x.why);
  if (n.stability < 40) {
    if (L.tax > 15) push("tax", stepTax(L.tax, -1), "calm unrest");
    if (ARMY_ORDER.indexOf(L.army) >= 2 && threat.level < 0.6 && !atWarNow) push("army", stepLaw(ARMY_ORDER, L.army, -1), "ease the burden of conscription");
    if (L.services !== "generous" && budget.balance > 0) push("services", stepLaw(SERVICE_ORDER, L.services, 1), "calm unrest");
  }
  if (atWarNow && L.army !== "mobilized") push("army", stepLaw(ARMY_ORDER, L.army, 1), "fight the war");
  if (!atWarNow && threat.level > 0.5 && ARMY_ORDER.indexOf(L.army) < 2 && n.stability > 40) push("army", stepLaw(ARMY_ORDER, L.army, 1), `answer the threat from the ${nameOf(g, threat.who)}`);
  const armsNow = ARMS_ORDER.indexOf(L.arms || "low"), armsPref = ARMS_ORDER.indexOf(pref.arms || "low");
  if (atWarNow && armsNow < 3 && n.stability > 35) push("arms", ARMS_ORDER[armsNow + 1], "arm the troops for the war");
  if (!atWarNow && threat.level > 0.5 && armsNow < 3 && n.stability > 45) push("arms", ARMS_ORDER[armsNow + 1], `rearm against the ${nameOf(g, threat.who)}`);
  if (!atWarNow && threat.level < 0.25 && armsNow > armsPref) push("arms", ARMS_ORDER[armsNow - 1], "return the factories to civilian work");
  if (!atWarNow && armsNow > 1 && stockValue(n) > 0.05 * econ.gdp) push("arms", ARMS_ORDER[armsNow - 1], "the arsenals are already full");
  if (n.stability < 30 && armsNow >= 3) push("arms", ARMS_ORDER[armsNow - 1], "ease rationing before the people revolt");
  if (n.treasury < -0.3 * econ.gdp && budget.balance < 0) {
    if (armsNow > 1 && !atWarNow) push("arms", ARMS_ORDER[armsNow - 1], "stop the debt growing");
    if (L.tax < 45 && n.stability > 45) push("tax", stepTax(L.tax, 1), "stop the debt growing");
    if (L.services !== "minimal") push("services", stepLaw(SERVICE_ORDER, L.services, -1), "stop the debt growing");
    if (L.pensions === "generous") push("pensions", "basic", "stop the debt growing");
  }
  if (!atWarNow && threat.level < 0.2 && ARMY_ORDER.indexOf(L.army) > ARMY_ORDER.indexOf(pref.army)) push("army", stepLaw(ARMY_ORDER, L.army, -1), "save money now that no danger is in sight");
  if (n.treasury > 0.4 * econ.gdp && budget.balance > 0) {
    if (n.stability < 70 && L.services !== "generous") push("services", stepLaw(SERVICE_ORDER, L.services, 1), "spend a full treasury on its people");
    if (L.tax > 15) push("tax", stepTax(L.tax, -1), "the treasury is overflowing");
  }
  const toward = (law, order) => stepLaw(order, L[law], order.indexOf(pref[law]) > order.indexOf(L[law]) ? 1 : -1);
  if (n.crisisUntil > g.turn && L.finance !== "strict") push("finance", stepLaw(FINANCE_ORDER, L.finance, -1), "rein in the banks after the crash");
  if (n.treasury < -0.3 * econ.gdp && RESEARCH_ORDER.indexOf(L.research) > 0) push("research", stepLaw(RESEARCH_ORDER, L.research, -1), "save money while in debt");
  if (n.treasury > 0.25 * econ.gdp && budget.balance > 0 && RESEARCH_ORDER.indexOf(L.research) < RESEARCH_ORDER.indexOf(pref.research) + 1 && !atWarNow) push("research", stepLaw(RESEARCH_ORDER, L.research, 1), "invest a healthy treasury in science");
  if (n.treasury > 0.3 * econ.gdp && budget.balance > 0 && EDU_ORDER.indexOf(L.education) <= EDU_ORDER.indexOf(pref.education)) push("education", stepLaw(EDU_ORDER, L.education, 1), "build a more skilled workforce");
  if (econ.sat && econ.sat.goods < 0.5 && L.trade === "protect") push("trade", "balanced", "let foreign goods fill the empty shops");
  if ((econ.unemployment || 0) > 0.1 && L.services !== "generous" && budget.balance > 0 && n.treasury > 0) push("services", stepLaw(SERVICE_ORDER, L.services, 1), "give the jobless relief and public work");
  const gIdx = GRANARY_ORDER.indexOf(L.granary || "none"), gPref = GRANARY_ORDER.indexOf(pref.granary || "small");
  if (n.treasury < -0.3 * econ.gdp && budget.balance < 0 && gIdx > 0) push("granary", GRANARY_ORDER[gIdx - 1], "stop buying grain while in debt");
  if ((atWarNow || threat.level > 0.5) && gIdx < Math.min(3, gPref + 1) && n.treasury > 0) push("granary", GRANARY_ORDER[gIdx + 1], "lay in food for a war");
  if (!atWarNow && n.stability > 50 && threat.level < 0.3 && gIdx !== gPref && n.treasury > 0) push("granary", GRANARY_ORDER[gIdx + (gPref > gIdx ? 1 : -1)], "return to its preferred food reserve");
  if (n.stability > 50 && !atWarNow) {
    for (const [law, order] of [["education", EDU_ORDER], ["research", RESEARCH_ORDER], ["trade", TRADE_ORDER], ["finance", FINANCE_ORDER]]) if (L[law] !== pref[law] && order.indexOf(L[law]) < order.indexOf(pref[law])) push(law, toward(law, order), "return to its preferred policy");
  }
  if (n.stability > 55 && n.treasury > 0.1 * econ.gdp && !atWarNow) {
    if (L.tax !== pref.tax) push("tax", stepTax(L.tax, pref.tax > L.tax ? 1 : -1), "return to its preferred level");
    if (L.services !== pref.services) push("services", stepLaw(SERVICE_ORDER, L.services, SERVICE_ORDER.indexOf(pref.services) > SERVICE_ORDER.indexOf(L.services) ? 1 : -1), "return to its preferred level");
  }
  peopleLawWishes(g, n, econ, push, budget);
  const base = forecast(w, g, n.id, L);
  return out.slice(0, 3).map(o => {
    const alt = forecast(w, g, n.id, { ...L, [o.law]: o.value });
    return { ...o, dBalance: alt.budget.balance - base.budget.balance, dTarget: alt.target - base.target };
  });
}

function dealLabel(g, kind, y, terms) {
  const Y = `the ${nameOf(g, y)}`;
  const cities = terms.filter(t => t.type === "city").map(t => (g.cities.find(c => c.id === t.cityId) || {}).name).join(" and ");
  const trib = terms.find(t => t.type === "tribute");
  return {
    trade: `Propose a trade agreement to ${Y}`,
    nap: `Propose a non-aggression pact to ${Y}`,
    alliance: `Propose a defensive alliance to ${Y}`,
    border: `Propose a border accord to ${Y}`,
    demand_tribute: `Demand tribute${trib ? ` of ${fmtMoney(trib.amount)} a season` : ""} from ${Y}, under threat of war`,
    demand_city: `Demand ${cities} from ${Y}, under threat of war`,
    peace: `Offer ${Y} peace without conditions`,
    peace_demand: `Offer ${Y} peace if they hand over ${cities}`,
    peace_concede: `Offer ${Y} peace, handing over ${cities}`,
  }[kind];
}

function pushDeal(out, g, w, x, y, terms, kind, threat) {
  const asked = g.nations[x].lastAsked || {};
  const family = kind.startsWith("peace") ? "peace" : kind.startsWith("demand") ? "demand" : kind;
  if (asked[`${family}:${y}`] !== undefined && g.turn - asked[`${family}:${y}`] < (family === "peace" ? 2 : 6)) return;
  if (validateDeal(g, w, x, y, terms)) return;
  const mine = evaluateDeal(g, w, x, y, terms, { noCounter: true });
  const theirs = evaluateDeal(g, w, y, x, terms, { noCounter: true, threat });
  if (mine.points < 2) return;
  if (!threat && theirs.points < -6) return;
  const likely = theirs.points >= 0 ? "they would probably accept" : theirs.points >= -6 ? "they might refuse" : "they will probably refuse";
  out.push({ kind, target: y, terms, threat, self: Math.round(threat && theirs.points < 0 ? mine.points * 0.5 : mine.points), other: Math.round(theirs.points), likely, label: dealLabel(g, kind, y, terms), lines: mine.lines });
}

function borderTownOf(w, g, owner, near, maxDist) {
  const mine = [];
  for (let i = 0; i < N_CELLS; i++) if (controller(g, i) === near) mine.push(i);
  const d = distanceField(w, mine);
  return g.cities.filter(c => c.owner === owner && !c.capital && d[c.cell] <= maxDist).sort((a, b) => d[a.cell] - d[b.cell])[0] || null;
}

function diplomacyCandidates(g, w, n) {
  const out = [];
  const x = n.id, per = personality(n);
  for (const other of liveNations(g)) {
    const y = other.id;
    if (y === x) continue;
    const war = warBetween(g, x, y);
    if (war) {
      const desire = peaceDesire(g, x, war);
      const held = g.cities.filter(c => c.owner === y && g.occ[c.cell] >= 0 && sameSide(war, g.occ[c.cell], x)).sort((a, b) => (a.capital ? 1 : 0) - (b.capital ? 1 : 0) || (b.imp || 0) - (a.imp || 0));
      if (sideScore(war, x) > 20 && held.length) {
        // Ask for as much as the loser can be brought to accept: two towns, then one, then whatever is held.
        const plain = held.filter(c => !c.capital);
        const asks = [plain.slice(0, 2), plain.slice(0, 1), held.slice(0, 1)].filter((a, k, all) => a.length && all.findIndex(b => b.map(c => c.id).join() === a.map(c => c.id).join()) === k);
        for (const ask of asks) {
          const before = out.length;
          pushDeal(out, g, w, x, y, [{ type: "peace" }, ...ask.map(c => ({ type: "city", from: y, cityId: c.id }))], "peace_demand", false);
          if (out.length > before) break;
        }
      }
      if (desire > 0) pushDeal(out, g, w, x, y, [{ type: "peace" }], "peace", false);
      const lost = g.cities.filter(c => c.owner === x && g.occ[c.cell] >= 0 && sameSide(war, g.occ[c.cell], y) && !c.capital).sort((a, b) => (a.imp || 0) - (b.imp || 0));
      if (desire > 15 && lost.length) pushDeal(out, g, w, x, y, [{ type: "peace" }, ...lost.slice(0, 2).map(c => ({ type: "city", from: x, cityId: c.id }))], "peace_concede", false);
      continue;
    }
    if (!hasTreaty(g, x, y, "trade")) pushDeal(out, g, w, x, y, [{ type: "trade" }], "trade", false);
    if (!hasTreaty(g, x, y, "nap") && threatFrom(w, g, x, y) > 0.25) pushDeal(out, g, w, x, y, [{ type: "nap" }], "nap", false);
    if (!hasTreaty(g, x, y, "alliance")) pushDeal(out, g, w, x, y, [{ type: "alliance" }], "alliance", false);
    if (!hasTreaty(g, x, y, "border") && rel(g, x, y).mods.some(m => m.key === "settled_near")) pushDeal(out, g, w, x, y, [{ type: "border" }], "border", false);
    const close = sharesBorder(g, x, y) || gap(w, g, x, y) <= 2;
    const ratio = armyPower(g, x) / Math.max(1, armyPower(g, y) * defenseMult(other));
    const pending = g.commitments.some(c => c.by === x && c.against === y) || g.inbox.some(it => it.from === x && it.status === "open");
    if (close && !n.minor && per.aggression >= 1 && ratio > 1.6 && opinionDetail(g, x, y).value < 25 && !pending && !hasTreaty(g, x, y, "tribute") && !hasTreaty(g, x, y, "truce")) {
      const gy = computeEconomy(w, g, y).gdp;
      const amount = Math.max(0.5, Math.round(gy * 0.012 * 2) / 2);
      pushDeal(out, g, w, x, y, [{ type: "tribute", from: y, amount, seasons: 8 }], "demand_tribute", true);
      const town = ratio > 2 && per.landWeight >= 1.2 ? borderTownOf(w, g, y, x, 4) : null;
      if (town) pushDeal(out, g, w, x, y, [{ type: "city", from: y, cityId: town.id }], "demand_city", true);
    }
    const enc = rel(g, x, y).mods.find(m => m.key === "settled_near");
    const warned = n.lastWarned && n.lastWarned[y] > g.turn - 6;
    if (enc && enc.value <= -10 && !warned) {
      out.push({ kind: "warn", target: y, terms: [], threat: false, self: 3, other: 0, likely: "", label: `Warn the ${other.name} to stop settling near our border`, lines: [{ label: "They keep founding towns near our border", pts: 3 }] });
    }
    const wa = warAssessment(w, g, x, y);
    if (wa && wa.value > (n.archetype === "militarist" ? -6 : 0)) {
      out.push({ kind: "war", target: y, terms: [], threat: false, self: wa.value, other: 0, likely: "", label: `Declare war on the ${other.name}, citing ${wa.cb.label}`, lines: wa.lines });
    }
  }
  return out.sort((a, b) => b.self - a.self).slice(0, 5);
}

const INDUSTRY_TASTE = {
  militarist:   { heavy: 1.8, chemical: 1.5, oilfield: 1.5, mine: 1.4, coalmine: 1.3, power_coal: 1.2, power_gas: 1.2, electronics: 1.3, broadcast: 1.3, resort: 0.5, business: 0.6 },
  mercantile:   { light: 1.4, resort: 1.6, business: 1.8, techpark: 1.6, fishing: 1.2, foodproc: 1.2, university: 1.3, broadcast: 1.1, heavy: 0.8 },
  agrarian:     { foodproc: 1.6, fishing: 1.4, logging: 1.2, chemical: 1.2, university: 1.1, power_hydro: 1.2, heavy: 0.8 },
  expansionist: { mine: 1.4, logging: 1.3, oilfield: 1.4, heavy: 1.3, coalmine: 1.2, light: 1.1 },
};

function projectSpec(q) {
  if (q.kind === "work") return { kind: "work", work: q.work };
  if (q.kind === "road" && q.access) return { kind: "road", from: q.from.id, toCell: q.toCell };
  if (q.kind === "road") return { kind: "road", from: q.from.id, to: q.to.id };
  if (q.kind === "site") return { kind: "site", cell: q.cell, siteKind: q.siteKind, siteId: q.siteId };
  if (q.kind === "smelter") return { kind: "smelter", siteId: q.siteId };
  if (q.kind === "industry") return { kind: "industry", cityId: q.cityId, ind: q.ind };
  if (q.kind === "focus") return { kind: "focus", cityId: q.cityId, focus: q.focus };
  if (q.kind === "town") return { kind: "town", site: q.site };
  return { kind: q.kind, cityId: q.cityId };
}
function requote(w, g, nid, spec) {
  if (spec.kind === "work") return quoteWork(w, g, nid, spec.work);
  if (spec.kind === "smelter") { const st = g.sites.find(x => x.id === spec.siteId); return st ? quoteSmelter(w, g, nid, st) : { ok: false }; }
  if (spec.kind === "site") {
    if (spec.siteId) { const st = g.sites.find(x => x.id === spec.siteId); return st ? quoteSiteExpand(w, g, nid, st) : { ok: false }; }
    return quoteSite(w, g, nid, spec.cell, spec.siteKind);
  }
  if (spec.kind === "road" && spec.toCell !== undefined) {
    const a = g.cities.find(c => c.id === spec.from);
    return a && a.owner === nid ? quoteAccessRoad(w, g, nid, a, spec.toCell) : { ok: false };
  }
  if (spec.kind === "road") {
    const a = g.cities.find(c => c.id === spec.from), b = g.cities.find(c => c.id === spec.to);
    return a && b && a.owner === nid ? quoteRoad(w, g, nid, a, b) : { ok: false };
  }
  if (spec.kind === "town") return quoteTown(w, g, nid, spec.site);
  const c = g.cities.find(x => x.id === spec.cityId);
  if (!c) return { ok: false };
  if (spec.kind === "industry") return quoteIndustry(w, g, nid, c, spec.ind);
  if (spec.kind === "focus") return quoteFocus(w, g, nid, c, spec.focus);
  if (spec.kind === "capital") return quoteCapitalMove(w, g, nid, c);
  if (spec.kind === "portup") return quotePortUp(w, g, nid, c);
  if (spec.kind === "wharf") return quoteWharf(w, g, nid, c);
  return spec.kind === "port" ? quotePort(w, g, nid, c) : quoteIrrigation(w, g, nid, c);
}

function buildMenu(g, w, n) { return withEconMemo(g, () => buildMenuRaw(g, w, n)); }
function buildMenuRaw(g, w, n) {
  const econ = computeEconomy(w, g, n.id);
  const weights = ARCHETYPES[n.archetype].weights;
  let k = 1;
  const projects = aiCandidates(w, g, n, econ)
    .map(q => ({ q, score: (q.value * (q.kind === "industry" || q.kind === "site" ? (INDUSTRY_TASTE[n.archetype][q.ind || q.siteKind] || 1) : q.access ? 1 : weights[q.kind === "portup" ? "port" : q.kind === "wharf" ? "road" : q.kind] ?? 1)) / q.cost }))
    .map(x => (x.q.kind === "town" && econ.isolated.length >= 3 ? { ...x, score: x.score * 0.4 } : x))
    .filter(x => x.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ q, score }) => ({ id: `P${k++}`, cat: "project", kind: q.kind, label: q.label, cost: q.cost, upfront: q.upfront, score, dGdp: q.dGdp, dFood: q.dFood, note: explainProject(g, q, n), spec: projectSpec(q) }));
  const laws = lawCandidates(g, w, n, econ).map(l => ({ id: `L${k++}`, cat: "law", ...l, label: lawLabel(l.law, l.value) }));
  const diplomacy = diplomacyCandidates(g, w, n).map(d => ({ id: `D${k++}`, cat: "diplomacy", ...d }));
  const military = militaryCandidates(w, g, n).map(m => ({ id: `M${k++}`, cat: "military", ...m }));
  return { projects, laws, diplomacy, military, gdp: econ.gdp };
}

function rulePlan(g, w, n) {
  const enemies = enemiesOf(g, n.id);
  if (enemies.length) return `Win the war against the ${enemies.map(e => nameOf(g, e)).join(" and ")}, then secure an honorable peace.`;
  const t = maxThreatTo(w, g, n.id);
  if (t.level > 0.5) return `Arm against the ${nameOf(g, t.who)} and look for friends who fear them too.`;
  return {
    mercantile: "Grow trade with every neighbor willing to deal, and keep the peace that trade needs.",
    expansionist: "Claim the remaining wild land before anyone else does, and make neighbors respect our strength.",
    agrarian: "Feed our people, irrigate our fields, and avoid entanglements.",
    militarist: "Build an army no neighbor dares to test, and take what weakness offers.",
  }[n.archetype];
}

function ruleReason(o) {
  if (o.cat === "diplomacy") {
    const pros = o.lines.filter(l => l.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 2).map(l => l.label.toLowerCase());
    return pros.length ? `${pros.join("; ")}.`.replace(/^./, c => c.toUpperCase()) : "It serves our interests.";
  }
  if (o.cat === "law") return `To ${o.why}.`;
  if (o.cat === "military") return `${o.why.charAt(0).toUpperCase()}${o.why.slice(1)}.`;
  return o.note;
}

function ruleOrders(g, w, n, menu) {
  const actions = [];
  const d = menu.diplomacy[0];
  if (d && d.self >= (d.kind === "war" ? 6 : 4)) actions.push({ option: d.id, reason: ruleReason(d) });
  let money = n.treasury - 0.04 * menu.gdp;
  const maxProjects = n.treasury > 0.25 * menu.gdp ? 2 : 1;
  let count = 0;
  for (const p of menu.projects) {
    if (count >= maxProjects) break;
    const need = p.upfront ?? p.cost;
    if (need <= money) { actions.push({ option: p.id, reason: p.note }); money -= need; count++; }
  }
  if (menu.laws[0]) actions.push({ option: menu.laws[0].id, reason: ruleReason(menu.laws[0]) });
  const m = ruleMilitaryChoice(g, w, n, menu.military || []);
  if (m) actions.push({ option: m.id, reason: ruleReason(m) });
  return { source: "rules", plan: rulePlan(g, w, n), actions, letter: null };
}

/* ---------- Turning a chosen option into deeds ---------- */
function applyOrders(g, w, n, orders, menu, dispatch) {
  const byId = {};
  [...menu.projects, ...menu.laws, ...menu.diplomacy, ...(menu.military || [])].forEach(o => { byId[o.id] = o; });
  if (orders.plan) n.plan = orders.plan;
  n.mindSource = orders.source;
  const say = (text, why) => {
    dispatch.abroad.push({ nid: n.id, text, why, source: orders.source });
    noteFor(n, g, text, why, orders.source);
  };
  let diplomacyDone = false, projectsDone = 0, lawDone = false, militaryDone = false;
  for (const a of orders.actions) {
    const o = byId[a.option];
    if (!o) continue;
    const why = a.reason || "";
    if (o.cat === "law" && !lawDone) {
      n.laws = { ...n.laws, [o.law]: o.value };
      n.lastLawTurn = g.turn;
      lawDone = true;
      say(`Changed its laws: ${o.label}.`, why);
    } else if (o.cat === "project" && projectsDone < 2) {
      const q = requote(w, g, n.id, o.spec);
      if (!q.ok) continue;
      const gdp = computeEconomy(w, g, n.id).gdp;
      const need = q.upfront ?? q.cost;
      if (!canAfford(n, gdp, need).ok || n.treasury - need < -0.1 * gdp) continue;
      orderProject(g, q, why);
      projectsDone++;
      say(`Began work on ${q.label.charAt(0).toLowerCase()}${q.label.slice(1)} (${fmtMoney(q.cost)}).`, why);
      addChronicle(g, `${n.name}: ${why || q.label}`, "neutral", n.id);
    } else if (o.cat === "military" && !militaryDone) {
      const text = applyMilitaryOption(g, n, o);
      if (text) { militaryDone = true; say(text, why); }
    } else if (o.cat === "diplomacy" && !diplomacyDone) {
      diplomacyDone = executeDiplomacy(g, w, n, o, why, orders.letter && orders.letter.option === o.id ? orders.letter.text : null, dispatch, say);
    }
  }
}

function executeDiplomacy(g, w, n, o, why, letterText, dispatch, say) {
  const x = n.id, y = o.target;
  if (!g.nations[y] || !g.nations[y].alive) return false;
  if (o.kind === "war") {
    if (atWar(g, x, y) || !sharesBorder(g, x, y)) return false;
    const { news } = declareWar(g, w, x, y);
    say(`Declared war on the ${nameOf(g, y)}.`, why);
    news.slice(1).forEach(t => dispatch.war.push(t));
    addChronicle(g, news[0], "bad", x);
    if (y === PLAYER) {
      g.inbox.push({ id: g.nextId++, from: x, kind: "declaration", terms: [], threat: false, turn: g.turn, expires: g.turn, status: "info",
        text: letterText || templateLetter(g, n, o) });
    }
    return true;
  }
  if (o.kind === "warn") {
    n.lastWarned = { ...(n.lastWarned || {}), [y]: g.turn };
    if (y === PLAYER) g.inbox.push({ id: g.nextId++, from: x, kind: "warning", terms: [], threat: false, turn: g.turn, expires: g.turn, status: "info", text: letterText || templateLetter(g, n, o) });
    remember(g, x, `We warned the ${nameOf(g, y)} to stop settling near our border.`);
    say(`Warned the ${nameOf(g, y)} to stop settling near its border.`, why);
    return true;
  }
  if (validateDeal(g, w, x, y, o.terms)) return false;
  const family = o.kind.startsWith("peace") ? "peace" : o.kind.startsWith("demand") ? "demand" : o.kind;
  n.lastAsked = { ...(n.lastAsked || {}), [`${family}:${y}`]: g.turn };
  if (g.nations[y].isPlayer) {
    g.inbox.push({ id: g.nextId++, from: x, kind: o.kind, terms: o.terms, threat: o.threat, turn: g.turn, expires: g.turn + DIPLO.inboxSeasons, status: "open",
      text: letterText || templateLetter(g, n, o), reason: why });
    say(`Sent you a proposal: ${termsText(g, o.terms)}${o.threat ? ", with a threat of war if you refuse" : ""}.`, why);
    return true;
  }
  const ev = evaluateDeal(g, w, y, x, o.terms, { threat: o.threat, noCounter: true });
  if (ev.points >= 0) {
    applyDeal(g, w, x, y, o.terms);
    if (o.threat) addTreaty(g, "truce", x, y);
    const best = ev.lines.filter(l => l.pts > 0).sort((a, b) => b.pts - a.pts)[0];
    say(`Agreed with the ${nameOf(g, y)} on ${termsText(g, o.terms)}.`, why + (best ? ` The ${nameOf(g, y)} accepted: ${best.label.toLowerCase()}.` : ""));
    addChronicle(g, `The ${nameOf(g, x)} and the ${nameOf(g, y)} agreed on ${termsText(g, o.terms)}.`, "neutral", x);
    noteFor(g.nations[y], g, `Accepted the ${nameOf(g, x)}'s proposal of ${termsText(g, o.terms)}.`, best ? best.label : null, "rules");
  } else {
    addMod(g, x, y, "refused", "Rejected our proposal", -3, 1, -9);
    n.lastAsked[`${family}:${y}`] = g.turn + 10; // a refusal stings: wait about four years before asking again
    if (o.threat) addCommitment(g, x, y, termsText(g, o.terms));
    const worst = ev.lines.filter(l => l.pts < 0).sort((a, b) => a.pts - b.pts)[0];
    say(`Proposed ${termsText(g, o.terms)} to the ${nameOf(g, y)}, who refused${worst ? `: ${worst.label.toLowerCase()}` : ""}.`, why);
    remember(g, x, `The ${nameOf(g, y)} refused our proposal of ${termsText(g, o.terms)}.`);
  }
  return true;
}

function noteFor(n, g, text, why, source) {
  n.feed.unshift({ turn: g.turn, text, why, source: source || null });
  if (n.feed.length > 30) n.feed.length = 30;
}

function templateLetter(g, n, o) {
  const P = nameOf(g, o.target);
  const open = { militarist: `To the government of ${P}.`, mercantile: `Esteemed neighbors of ${P},`, agrarian: `To our neighbors in ${P},`, expansionist: `To the rulers of ${P},` }[n.archetype];
  const body = {
    trade: "Our merchants and yours would both grow richer if our markets were open to one another. We propose a trade agreement.",
    nap: "Neither of us gains from a war on our shared frontier. We propose that both our nations pledge not to attack the other.",
    alliance: "Dangerous neighbors surround us both. We propose a defensive alliance: an attack on one of us will be answered by both.",
    border: "Your settlers keep pressing toward our land. We propose a border accord, so that neither of us founds new towns near the other.",
    demand_tribute: "Our army is far stronger than yours. Pay the tribute we ask, and there will be no war between us. Refuse, and we will take what we are owed.",
    demand_city: "That town lies in the shadow of our army. Hand it over and we will leave you in peace. Refuse, and we will take it.",
    peace: "This war has cost both our peoples enough. We offer peace without conditions.",
    peace_demand: "The war has gone our way. We will make peace if you hand over the towns our armies already hold.",
    peace_concede: "We are ready to end this war, and will give up the towns your armies hold to do it.",
    warn: "Your new towns press against our border. This is our warning: continue, and we will treat it as a hostile act.",
    war: "Our patience is at an end. From this day, our nations are at war.",
  }[o.kind] || "We write to you on a matter of state.";
  return `${open}\n\n${body}\n\n— ${n.leader ? `${leaderName(n)}, for the ${n.name}` : `The ${n.name}`}`;
}

/* ---------- Claude as the rivals' strategic mind ---------- */
function nationBrief(g, w, n) {
  const econ = computeEconomy(w, g, n.id);
  const h = n.history, prev = h.length >= 2 ? h[h.length - 2] : null;
  const fc = forecast(w, g, n.id, n.laws);
  return [
    `State: population ${fmtPop(econ.pop)}; output ${fmtMoney(econ.gdp)} a year${prev ? ` (${signedPct(econ.gdp / prev.gdp - 1, 1)} last season)` : ""}; treasury ${n.treasury >= 0 ? fmtMoney(n.treasury) : `debt of ${fmtMoney(-n.treasury)}`} (${fmtSignedMoney(fc.budget.balance)} a season); stability ${Math.round(n.stability)} of 100, heading toward ${Math.round(fc.target)}; army ${fmtCount(n.soldiers)} soldiers; food ${pct(econ.food / econ.pop)} of need; ${econ.cities.length} towns${econ.isolated.length ? `, ${econ.isolated.length} cut off from the capital` : ""}.`,
    `Laws: ${taxLaw(n.laws.tax).label} taxes, ${SERVICE_LAWS[n.laws.services].label} healthcare, ${EDU_LAWS[n.laws.education].label} education, research ${RESEARCH_LAWS[n.laws.research].label.toLowerCase()}, ${TRADE_LAWS[n.laws.trade].label.toLowerCase()} trade, ${FINANCE_LAWS[n.laws.finance].label.toLowerCase()} finance, conscription ${ARMY_LAWS[n.laws.army].label.toLowerCase()}, arms production ${ARMS_LAWS[n.laws.arms || "low"].label.toLowerCase()}.`,
    economyBrief(n, econ),
    militaryBrief(g, w, n, econ),
  ].join("\n");
}

function relationsBrief(g, w, n) {
  const relevant = z => z.isPlayer || !z.minor || atWar(g, n.id, z.id) || treatiesBetween(g, n.id, z.id).length || gap(w, g, n.id, z.id) <= 4;
  return liveNations(g).filter(z => z.id !== n.id && relevant(z)).map(z => {
    const op = opinionDetail(g, n.id, z.id);
    const reasons = op.items.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 4).map(i => `${i.label} ${signed(i.value)}`).join("; ");
    const r = rel(g, n.id, z.id);
    const d = gap(w, g, n.id, z.id);
    const ratio = armyPower(g, z.id) / Math.max(1, armyPower(g, n.id));
    const treaties = treatiesBetween(g, n.id, z.id).map(t => `${TREATY_INFO[t.type].label}${t.type === "tribute" ? ` (${nameOf(g, t.a)} pays ${fmtMoney(t.amount)} a season)` : ""}${t.until ? ` until ${seasonLabel(t.until)}` : ""}`).join(", ") || "none";
    const war = warBetween(g, n.id, z.id);
    const their = opinionDetail(g, z.id, n.id).value;
    return `- ${z.name}${z.archetype ? ` (${z.minor ? "small city-state" : ARCHETYPES[z.archetype].label.toLowerCase()}${z.leader ? `, led by ${leaderName(z)}, ${z.leader.traits.map(t => LEADER_TRAITS[t].label.toLowerCase()).join(" and ")}` : ""})` : ""}: our opinion of them ${signed(op.value)} [${reasons || "no strong feelings"}]; their opinion of us about ${signed(their)}; our trust in them ${Math.round(r.trust)}/100; we ${r.cred > 0.6 ? "take their threats seriously" : r.cred > 0.35 ? "half-believe their threats" : "no longer believe their threats"}; treaties: ${treaties}; ${d === 0 ? "we share a border" : `${d} cells of wild land separate us`}; their army is ${ratio.toFixed(2)}× ours; their output ${fmtMoney(computeEconomy(w, g, z.id).gdp)} a year${war ? `; AT WAR with us since ${seasonLabel(war.since)}, war score ${signed(sideScore(war, n.id))} (positive means we are winning)` : ""}.`;
  }).join("\n");
}

function optionText(o) {
  if (o.cat === "project") return `${o.id} ${o.label}. Cost ${fmtMoney(o.cost)}.${o.dGdp > 0.05 ? ` Output +${fmtMoney(o.dGdp)} a year.` : ""}${o.dFood > 0.05 ? ` Food for ${o.dFood.toFixed(1)}M more.` : ""} Engine note: ${o.note}`;
  if (o.cat === "law") return `${o.id} Change to ${o.label}, to ${o.why}. Budget ${fmtSignedMoney(o.dBalance)} a season; stability target ${signed1(o.dTarget)}.`;
  if (o.cat === "military") return `${o.id} ${o.label}. Engine note: ${o.why}.`;
  const why = o.lines.slice().sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts)).slice(0, 4).map(l => `${l.label} (${l.pts > 0 ? "+" : ""}${Math.round(l.pts)})`).join("; ");
  return `${o.id} ${o.label}. Engine value for us ${o.self > 0 ? "+" : ""}${o.self}${o.likely ? `; ${o.likely}` : ""}. Factors: ${why}.`;
}

function seasonPrompt(g, w, rivals, menus) {
  const player = g.nations[PLAYER].name;
  const blocks = rivals.map(n => {
    const m = menus[n.id];
    const memory = (g.memory[n.id] || []).slice(0, 8).map(x => `- ${seasonLabel(x.turn)}: ${x.text}`).join("\n") || "- Nothing notable yet.";
    return `=== NATION ${n.id}: ${n.name} (${ARCHETYPES[n.archetype].label}) ===
Character: ${n.minor ? "A small city-state: it cannot hope to win wars alone, so it survives by trade, neutrality and protectors. " : ""}${ARCHETYPES[n.archetype].blurb} Voice: ${PERSONALITY[n.archetype].voice}.
Leader: ${leaderName(n)}, aged ${Math.floor(n.leader.age)}, ${n.leader.traits.map(t => `${LEADER_TRAITS[t].label.toLowerCase()} (${LEADER_TRAITS[t].note})`).join(" and ")}. Letters are written and signed in the leader's own voice.
Its plan from last season: ${n.plan || "none yet"}
${nationBrief(g, w, n)}
Neighbors:
${relationsBrief(g, w, n)}
What it remembers (newest first):
${memory}
OPTIONS
DIPLOMACY (choose at most 1)
${m.diplomacy.map(optionText).join("\n") || "(none)"}
PROJECTS (choose at most 2; total cost must fit a treasury of ${fmtMoney(n.treasury)})
${m.projects.map(optionText).join("\n") || "(none)"}
LAWS (choose at most 1)
${m.laws.map(optionText).join("\n") || "(none)"}
MILITARY (choose at most 1; the engine's generals carry it out)
${(m.military || []).map(optionText).join("\n") || "(none)"}`;
  }).join("\n\n");
  return `You are the strategic mind of rival governments in a turn-based geopolitical strategy game. It is ${seasonLabel(g.turn)}. For each nation below, decide what its government does this season.

Decide as that nation's real leaders would. Pursue its own interests (security, prosperity, land, standing) in the way its character dictates. Remember past dealings: reward partners who kept their word, punish betrayal, and follow through on threats the nation has made unless that would be ruinous. Be realistic: wars are costly and risky, states avoid strengthening dangerous neighbors, and they seek friends against common threats. Treat the ${player} exactly like any other state, neither friend nor target by default.

The game engine has already listed every legal option with its own estimate ("engine value": positive means good for that nation). You may only choose option ids from that nation's own list. You may pick a lower-valued option, or none at all, when the nation's character or longer-term strategy calls for it.

If a chosen DIPLOMACY option is addressed to the ${player}, also write the letter its government sends: 50 to 110 words, in that nation's voice, referring to concrete facts from its briefing. Do not mention game mechanics, points or options.

Reply with only JSON in exactly this shape:
{"nations":[{"id":1,"plan":"one or two sentences: this nation's strategy for the next few years","actions":[{"option":"D2","reason":"one sentence, in-world, why"}],"letter":{"option":"D2","text":"..."}}]}
Use "letter": null when no letter goes to the ${player}. Include every nation listed below.

${blocks}`;
}

function cleanText(s, max) {
  return String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
}

function validateClaudeOrders(res, menus, rivals, g) {
  const out = {};
  const list = res && Array.isArray(res.nations) ? res.nations : [];
  for (const n of rivals) {
    const entry = list.find(e => Number(e && e.id) === n.id);
    if (!entry || !Array.isArray(entry.actions)) continue;
    const m = menus[n.id];
    const byId = {};
    [...m.projects, ...m.laws, ...m.diplomacy, ...(m.military || [])].forEach(o => { byId[o.id] = o; });
    const counts = { diplomacy: 0, project: 0, law: 0, military: 0 };
    const limits = { diplomacy: 1, project: 2, law: 1, military: 1 };
    let cost = 0;
    const actions = [];
    for (const a of entry.actions.slice(0, 6)) {
      const id = cleanText(a && a.option, 8).toUpperCase();
      const o = byId[id];
      if (!o || counts[o.cat] >= limits[o.cat]) continue;
      if (o.cat === "project") { if (cost + o.cost > n.treasury) continue; cost += o.cost; }
      counts[o.cat]++;
      actions.push({ option: id, reason: cleanText(a.reason, 260) });
    }
    let letter = null;
    if (entry.letter && typeof entry.letter === "object") {
      const id = cleanText(entry.letter.option, 8).toUpperCase();
      const o = byId[id];
      if (o && o.cat === "diplomacy" && o.target === PLAYER && actions.some(a => a.option === id)) letter = { option: id, text: cleanText(entry.letter.text, 1200) };
    }
    out[n.id] = { source: "claude", plan: cleanText(entry.plan, 300) || n.plan, actions, letter };
  }
  return out;
}

