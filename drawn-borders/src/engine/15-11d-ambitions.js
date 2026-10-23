/* =====================================================================
   11d. Ambitions: goals your nation sets itself, drawn from its real situation
   Borrowed ideas: Hearts of Iron (a national focus gives the country a direction; choosing one path closes
   others for now), Europa Universalis (missions with concrete targets and rewards), Old World (ambitions
   offered to fit your situation, fulfilled for legitimacy).
   ===================================================================== */
const AMBITION_SLOTS = 2;
function aOrAn(word) { return /^[aeiou]/i.test(word) ? "an" : "a"; }
function ambCtx(w, g) { const econ = computeEconomy(w, g, PLAYER); return { w, g, n: g.nations[PLAYER], econ, Y: econ.gdp }; }
function joinedTowns(econ) { return econ.regions.filter(r => econ.networks[r.net].capital).length; }
function roundNice(v) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v))) - 1); return Math.ceil(v / (p * 5)) * p * 5; }
function myWorkingSites(c) { return (c.econ.sites || []).filter(x => x.status === "working").length; }
function knownUnworked(c) {
  let k = 0;
  for (let i = 0; i < N_CELLS; i++) if (c.g.owner[i] === PLAYER && knowsDeposit(c.w, c.g, PLAYER, i) && depositType(c.w, i) && c.g.depLeft[i] > 0.5 && !c.g.sites.some(s => s.cell === i)) k++;
  return k;
}
const SELF_GOODS = ["metals", "coal", "oil", "timber", "power", "goods", "machinery", "chemicals", "electronics"];

/* Each ambition: offer(c) → parameters or null; progress(c, a) → { cur, need, frac, text, done }; reward(c, a) → effects. */
const AMBITIONS = {
  unify: {
    cat: "Building", icon: "road", seasons: 12, prestige: 15,
    offer: c => (c.econ.cities.length >= 3 && joinedTowns(c.econ) < c.econ.cities.length ? { w: 2 } : null),
    title: () => "Join every town to the capital by road",
    why: () => "Towns cut off from the capital are poorer and restless. A connected nation is a strong one.",
    progress: (c, a) => { const j = joinedTowns(c.econ), t = c.econ.cities.length; return { cur: j, need: t, frac: j / Math.max(1, t), text: `${j} of ${t} towns joined`, done: j >= t && t >= 2 }; },
    reward: () => [{ t: "mod", key: "amb_unity", label: "A nation joined together", stab: 4, seasons: 12 }],
  },
  towns: {
    cat: "Building", icon: "town", seasons: 16, prestige: 15,
    offer: c => {
      if (c.econ.cities.length >= 14) return null;
      let wild = 0;
      for (let i = 0; i < N_CELLS && wild < 12; i++) if (c.g.owner[i] === -1 && isLand(c.w, i) && nearOwnLand(c.g, PLAYER, i, BUILD.townReach)) wild++;
      const have = c.g.cities.filter(t => t.owner === PLAYER).length;
      return wild >= 12 ? { start: have, target: have + 2, w: 1.4 } : null;
    },
    title: a => `Found ${a.target - a.start} new towns`,
    why: () => "Wild land beyond our borders is waiting for settlers. Whoever claims it first keeps it.",
    progress: (c, a) => { const k = c.g.cities.filter(t => t.owner === PLAYER).length - a.start; const need = a.target - a.start; return { cur: k, need, frac: k / need, text: `${Math.max(0, k)} of ${need} founded`, done: k >= need }; },
    reward: () => [{ t: "mod", key: "amb_pioneers", label: "Pioneer spirit", growth: 0.002, seasons: 12 }],
  },
  port: {
    cat: "Trade", icon: "anchor", seasons: 8, prestige: 10,
    offer: c => (!c.econ.cities.some(t => t.port) && c.econ.cities.some(t => c.w.coastal[t.cell]) ? { w: 1.6 } : null),
    title: () => "Open the nation to the sea",
    why: () => "A port lets us sell what we have too much of and buy what we lack.",
    progress: c => { const ok = c.econ.cities.some(t => t.port); return { cur: ok ? 1 : 0, need: 1, frac: ok ? 1 : 0, text: ok ? "A port is open" : "No port yet", done: ok }; },
    reward: () => [{ t: "mod", key: "amb_seatrade", label: "A boom in sea trade", output: 0.02, seasons: 8 }],
  },
  output: {
    cat: "Wealth", icon: "output", seasons: 16, prestige: 20,
    offer: c => ({ target: roundNice(c.Y * 1.25), w: 1.2 }),
    title: a => `Grow the economy to ${fmtMoney(a.target)} a year`,
    why: () => "A richer nation can afford everything else: schools, armies, great works.",
    progress: (c, a) => ({ cur: c.Y, need: a.target, frac: c.Y / a.target, text: `${fmtMoney(c.Y)} of ${fmtMoney(a.target)}`, done: c.Y >= a.target }),
    reward: c => [{ t: "capital", v: Math.round(c.Y * 0.01 * 10) / 10 }, { t: "mod", key: "amb_confidence", label: "Business confidence", stab: 2, seasons: 8 }],
  },
  selfsuff: {
    cat: "Wealth", icon: "output", seasons: 16, prestige: 15,
    offer: c => {
      const G = c.econ.goods;
      const k = SELF_GOODS.filter(k => G.demand[k] > 0.3 && G.supply[k] / G.demand[k] < 0.85).filter(k => {
        if (k === "metals") return knownUnworked(c) > 0 || (c.econ.sites || []).some(x => x.kind === "mine");
        if (k === "coal" || k === "oil") return (c.econ.sites || []).some(x => SITE_KINDS[x.kind].good === k) || [...Array(N_CELLS).keys()].some(i => c.g.owner[i] === PLAYER && knowsDeposit(c.w, c.g, PLAYER, i) && RES[depositType(c.w, i)] && RES[depositType(c.w, i)].key === k);
        if (k === "timber") return c.econ.regions.some(r => r.cells.some(i => c.w.terrain[i] === T.FOREST));
        return true;
      }).sort((a, b) => G.supply[a] / G.demand[a] - G.supply[b] / G.demand[b])[0];
      return k ? { good: k, w: 1.5 } : null;
    },
    title: a => `Make all the ${GOODS[a.good].label.toLowerCase()} we need`,
    why: (a, g) => { const d = g && g.trade ? dependence(g, PLAYER, a.good)[0] : null; return `We depend on others for ${GOODS[a.good].label.toLowerCase()}${d && d.share >= 0.2 ? ` (${pct(d.share)} of it comes from the ${nameOf(g, d.from)})` : ""}. In a war or a trade dispute, that dependence could cripple us.`; },
    progress: (c, a) => { const G = c.econ.goods; const f = G.demand[a.good] > 0 ? G.supply[a.good] / G.demand[a.good] : 1; return { cur: f, need: 1, frac: Math.min(1, f), text: `We make ${pct(Math.min(9.99, f))} of what we use`, done: f >= 0.999 }; },
    reward: () => [{ t: "mod", key: "amb_selfsuff", label: "Proud of our own industry", stab: 3, seasons: 8 }],
  },
  mines: {
    cat: "Wealth", icon: "mine", seasons: 12, prestige: 12,
    offer: c => (knownUnworked(c) >= 2 ? { start: myWorkingSites(c), target: myWorkingSites(c) + 2, w: 1.5 } : null),
    title: a => `Open ${a.target - a.start} more mines, fields or camps`,
    why: () => "Known deposits lie unworked in our land. Every one we open adds jobs and wealth.",
    progress: (c, a) => { const k = myWorkingSites(c) - a.start, need = a.target - a.start; return { cur: k, need, frac: k / need, text: `${Math.max(0, k)} of ${need} working`, done: k >= need }; },
    reward: () => [{ t: "mod", key: "amb_builders", label: "Experienced builders", build: -0.1, seasons: 8 }],
  },
  exports: {
    cat: "Trade", icon: "coin", seasons: 12, prestige: 12,
    offer: c => (tradeOpen(c.econ) ? { target: roundNice(Math.max(4, c.econ.exportValue * 1.6 + 2)), w: 1 } : null),
    title: a => `Earn ${fmtMoney(a.target)} a year from exports`,
    why: () => "Selling abroad brings in money, friends and influence.",
    progress: (c, a) => ({ cur: c.econ.exportValue, need: a.target, frac: c.econ.exportValue / a.target, text: `${fmtMoney(c.econ.exportValue)} of ${fmtMoney(a.target)}`, done: c.econ.exportValue >= a.target }),
    reward: c => [{ t: "money", v: Math.round(c.Y * 0.005 * 10) / 10 }],
  },
  diversify: {
    // a key good bought mostly from one nation (the engine's trade risks, 10s): find a second seller
    cat: "Trade", icon: "coin", seasons: 12, prestige: 10,
    offer: c => {
      if (!c.g.trade || !c.g.trade.v) return null;
      const r = tradeRisks(c.w, c.g, PLAYER, c.econ, { cheap: true }).find(x => x.share >= 0.6 && TRADE.key.includes(x.k) && x.from >= 0);
      return r ? { good: r.k, from: r.from, share: sr(r.share, 3), w: 1.3 + (r.level >= 2 ? 1 : 0) } : null;
    },
    title: a => `Find a second seller of ${goodWord(a.good)}`,
    why: (a, g) => `We buy ${pct(a.share)} of our ${goodWord(a.good)} from the ${nameOf(g, a.from)}. If they stopped selling, we would go short. Another seller (a trade agreement, a trade road, a harbor) or more of our own would make us safer.`,
    progress: (c, a) => {
      const d = dependence(c.g, PLAYER, a.good).find(x => x.from === a.from);
      const sh = d ? d.share : 0, met = a.good === "food" ? 1 - c.econ.famineShare : c.econ.sat[a.good] ?? 1;
      return { cur: sh, need: 0.4, frac: clamp((a.share - sh) / Math.max(0.01, a.share - 0.4), 0, 1), text: `${pct(sh)} from the ${nameOf(c.g, a.from)} now, need 40% or less with 90% of our need met (now ${pct(met)})`, done: sh <= 0.4 && met >= 0.9 };
    },
    reward: () => [{ t: "mod", key: "amb_supplies", label: "Safe supplies", stab: 2, seasons: 8 }],
  },
  debt: {
    cat: "Wealth", icon: "coin", seasons: 16, prestige: 18,
    offer: c => (c.n.treasury < -0.1 * c.Y ? { w: 2 } : null),
    title: () => "Pay off the national debt",
    why: () => "Interest eats our budget, and lenders grow nervous. A free nation owes nobody.",
    progress: c => ({ cur: c.n.treasury, need: 0, frac: c.n.treasury >= 0 ? 1 : 0, text: c.n.treasury >= 0 ? "Debt paid" : `${fmtMoney(-c.n.treasury)} still owed`, done: c.n.treasury >= 0 }),
    reward: () => [{ t: "mod", key: "amb_solvent", label: "Trusted by lenders", stab: 3, seasons: 8 }],
  },
  people: {
    cat: "People", icon: "people", seasons: 16, prestige: 15,
    offer: c => ({ target: Math.round(c.econ.pop * 1.12 * 10) / 10, w: 1 }),
    title: a => `Grow the nation to ${fmtPeople(a.target)} people`,
    why: () => "More people means more workers, more soldiers and a bigger market.",
    progress: (c, a) => ({ cur: c.econ.pop, need: a.target, frac: c.econ.pop / a.target, text: `${fmtPeople(c.econ.pop)} of ${fmtPeople(a.target)}`, done: c.econ.pop >= a.target }),
    reward: () => [{ t: "mod", key: "amb_people", label: "A growing nation", stab: 2, seasons: 8 }],
  },
  fed: {
    cat: "People", icon: "food", seasons: 8, prestige: 10,
    offer: c => (c.econ.famineShare > 0.02 ? { w: 2.5 } : null),
    title: () => "End hunger in every town",
    why: () => "Some of our people go hungry. Roads to farmland, irrigation or new farmland would feed them.",
    progress: c => ({ cur: 1 - c.econ.famineShare, need: 1, frac: 1 - c.econ.famineShare, text: c.econ.famineShare > 0.001 ? `${pct(c.econ.famineShare)} still short of food` : "Everyone is fed", done: c.econ.famineShare <= 0.001 }),
    reward: () => [{ t: "mod", key: "amb_fed", label: "Food on every table", stab: 3, seasons: 8 }],
  },
  skill: {
    cat: "People", icon: "flask", seasons: 16, prestige: 12,
    offer: c => { const tgt = EDU_LAWS[c.n.laws.education || "basic"].skill; const s = c.n.skill ?? 0.35; return tgt > s + 0.03 ? { target: Math.min(tgt, Math.round((s + 0.06) * 100) / 100), w: 1 } : null; },
    title: a => `Raise workforce skill to ${pct(a.target)}`,
    why: () => "Skilled workers make every factory and office more productive.",
    progress: (c, a) => { const s = c.n.skill ?? 0.35; return { cur: s, need: a.target, frac: s / a.target, text: `${pct(s)} of ${pct(a.target)}`, done: s >= a.target - 0.0005 }; },
    reward: () => [{ t: "mod", key: "amb_skill", label: "A learned nation", research: 0.2, seasons: 12 }],
  },
  tech: {
    cat: "Science", icon: "flask", seasons: 0, prestige: 12,
    offer: c => {
      const pts = Math.max(0.5, researchPoints(c.n, c.econ));
      const opts = TECH_ORDER.filter(t => techAvailable(c.n, t)).map(t => ({ t, s: Math.ceil(TECHS[t].cost / pts) })).filter(x => x.s <= 14).sort((a, b) => a.s - b.s);
      if (!opts.length) return null;
      const x = opts[Math.min(opts.length - 1, 1)];
      return { tech: x.t, seasons: Math.ceil(x.s * 1.4) + 2, w: 1.1 };
    },
    title: a => `Discover ${TECHS[a.tech].label.toLowerCase()}`,
    why: a => TECHS[a.tech].does,
    progress: (c, a) => { const done = hasTech(c.n, a.tech); const R = c.n.research; const p = done ? 1 : R && R.target === a.tech ? R.progress / TECHS[a.tech].cost : 0; return { cur: p, need: 1, frac: p, text: done ? "Discovered" : R && R.target === a.tech ? `${pct(p)} researched` : "Not being researched: choose it in the Economy panel", done }; },
    reward: c => [{ t: "research", v: Math.round(researchPoints(c.n, c.econ) * 3) }],
  },
  trade: {
    cat: "Diplomacy", icon: "globe", seasons: 10, prestige: 10,
    offer: c => {
      // a nation that could sell us what we now buy at the middlemen's price, or go without, comes first (10s)
      const op = new Map(), lack = new Map();
      for (const z of liveNations(c.g)) if (z.id !== PLAYER) op.set(z.id, opinionDetail(c.g, z.id, PLAYER).value);
      const cands = liveNations(c.g).filter(z => z.id !== PLAYER && !atWar(c.g, PLAYER, z.id) && !hasTreaty(c.g, PLAYER, z.id, "trade") && op.get(z.id) > -25);
      for (const z of cands) lack.set(z.id, sellsWhatWeLack(c.g, PLAYER, z.id));
      const useful = id => lack.get(id).v >= 0.002 * c.Y;
      const z = cands.sort((a, b) => (useful(b.id) ? 1 : 0) - (useful(a.id) ? 1 : 0) || op.get(b.id) - op.get(a.id) || a.id - b.id)[0];
      return z ? { nid: z.id, goods: useful(z.id) ? lack.get(z.id).goods.slice(0, 3) : [], linked: lack.get(z.id).linked, w: 1.2 + (useful(z.id) ? 0.4 : 0) } : null;
    },
    title: (a, g) => `Sign a trade agreement with the ${nameOf(g, a.nid)}`,
    why: (a, g) => a.goods && a.goods.length
      ? `The ${nameOf(g, a.nid)} has ${bJoin(a.goods.map(goodWord))} to spare, which we now buy from the world market at the middlemen's price, or go without. A trade agreement ends the import tax between us${a.linked ? "" : "; no route joins us yet, but a trade road or a harbor could open one"}. Write to them in the Nations panel.`
      : "Trade partners buy our goods and sell us what we lack. Write to them in the Nations panel.",
    progress: (c, a) => { const ok = hasTreaty(c.g, PLAYER, a.nid, "trade"); return { cur: ok ? 1 : 0, need: 1, frac: ok ? 1 : 0, text: ok ? "Signed" : "Not yet signed", done: ok, lost: !c.g.nations[a.nid].alive }; },
    reward: c => [{ t: "money", v: Math.round(c.Y * 0.003 * 10) / 10 }],
  },
  friend: {
    cat: "Diplomacy", icon: "globe", seasons: 12, prestige: 10,
    offer: c => {
      const z = liveNations(c.g).filter(z => z.id !== PLAYER && !atWar(c.g, PLAYER, z.id)).map(z => ({ z, op: opinionDetail(c.g, z.id, PLAYER).value })).filter(x => x.op > -15 && x.op < 25).sort((a, b) => b.op - a.op)[0];
      return z ? { nid: z.z.id, w: 0.9 } : null;
    },
    title: (a, g) => `Win the friendship of the ${nameOf(g, a.nid)}`,
    why: () => "Friends trade with us, stand by us in the Assembly, and think twice before attacking.",
    progress: (c, a) => { const op = c.g.nations[a.nid].alive ? opinionDetail(c.g, a.nid, PLAYER).value : -100; return { cur: op, need: 35, frac: clamp((op + 15) / 50, 0, 1), text: `Their opinion ${signed(op)} of +35`, done: op >= 35, lost: !c.g.nations[a.nid].alive }; },
    reward: () => [{ t: "stab", v: 2 }],
  },
  assembly: {
    cat: "Diplomacy", icon: "hall", seasons: 12, prestige: 15,
    offer: c => (c.g.turn >= 4 ? { w: 0.8 } : null),
    title: () => "Pass a motion of ours in the World Assembly",
    why: () => "Open a topic in the Assembly with a motion, and win the vote.",
    progress: (c, a) => { const ok = ((c.g.assembly && c.g.assembly.topics) || []).some(t => t.author === PLAYER && t.status === "passed" && t.closed >= a.since); return { cur: ok ? 1 : 0, need: 1, frac: ok ? 1 : 0, text: ok ? "Passed" : "No motion passed yet", done: ok }; },
    reward: () => [{ t: "mod", key: "amb_voice", label: "A respected voice in the world", stab: 2, seasons: 8 }],
  },
  army: {
    cat: "Power", icon: "army", seasons: 12, prestige: 10,
    offer: c => { const d = c.g.divisions.filter(x => x.owner === PLAYER).length; return { start: d, target: d + Math.max(3, Math.round(d * 0.3)), w: 0.9 + (maxThreatTo(c.w, c.g, PLAYER).level > 0.5 ? 1 : 0) }; },
    title: a => `Field ${a.target} divisions`,
    why: () => "An army big enough that no neighbor dares to test it.",
    progress: (c, a) => { const d = c.g.divisions.filter(x => x.owner === PLAYER).length; return { cur: d, need: a.target, frac: d / a.target, text: `${d} of ${a.target} divisions`, done: d >= a.target }; },
    reward: () => [{ t: "mod", key: "amb_safe", label: "A nation that feels safe", stab: 2, seasons: 8 }],
  },
  stronger: {
    cat: "Power", icon: "shield", seasons: 16, prestige: 12,
    offer: c => {
      const z = liveNations(c.g).filter(z => z.id !== PLAYER && !z.minor && sharesBorder(c.g, PLAYER, z.id) && armyPower(c.g, z.id) > armyPower(c.g, PLAYER) * 1.05)
        .sort((a, b) => armyPower(c.g, b.id) - armyPower(c.g, a.id))[0];
      return z ? { nid: z.id, w: 1.4 } : null;
    },
    title: (a, g) => `Build an army stronger than the ${nameOf(g, a.nid)}'s`,
    why: () => "Our neighbor's army is bigger than ours. Strength keeps the peace.",
    progress: (c, a) => { const r = armyPower(c.g, PLAYER) / Math.max(1, armyPower(c.g, a.nid)); return { cur: r, need: 1.1, frac: Math.min(1, r / 1.1), text: `${r.toFixed(2)}× their strength, need 1.10×`, done: r >= 1.1 || !c.g.nations[a.nid].alive }; },
    reward: () => [{ t: "mod", key: "amb_deterrent", label: "Respected by our neighbors", stab: 3, seasons: 8 }],
  },
  retake: {
    cat: "Power", icon: "town", seasons: 8, prestige: 20,
    offer: c => { const t = c.g.cities.find(x => x.owner === PLAYER && c.g.occ[x.cell] >= 0); return t ? { cityId: t.id, w: 4 } : null; },
    title: (a, g) => `Free ${(g.cities.find(t => t.id === a.cityId) || { name: "our town" }).name}`,
    why: () => "Enemy soldiers hold one of our towns. Its people are waiting for us.",
    progress: (c, a) => { const t = c.g.cities.find(x => x.id === a.cityId); const ok = t && t.owner === PLAYER && c.g.occ[t.cell] < 0; return { cur: ok ? 1 : 0, need: 1, frac: ok ? 1 : 0, text: ok ? "Free again" : "Still occupied", done: ok, lost: !t || t.owner !== PLAYER }; },
    reward: () => [{ t: "mod", key: "amb_liberation", label: "Liberation!", stab: 5, seasons: 6 }],
  },
  conquer: {
    cat: "Power", icon: "army", seasons: 8, prestige: 20,
    offer: c => {
      const foes = enemiesOf(c.g, PLAYER);
      if (!foes.length) return null;
      let best = null, bd = 99;
      for (const t of c.g.cities) if (foes.includes(t.owner) && c.g.occ[t.cell] !== PLAYER) { const d = distanceToNation(c.g, PLAYER, t.cell); if (d < bd) { bd = d; best = t; } }
      return best && bd <= 6 ? { cityId: best.id, w: 3 } : null;
    },
    title: (a, g) => `Take ${(g.cities.find(t => t.id === a.cityId) || { name: "the town" }).name}`,
    why: () => "Capturing it would give us the upper hand in the war and something to bargain with at the peace.",
    progress: (c, a) => { const t = c.g.cities.find(x => x.id === a.cityId); const ok = t && (t.owner === PLAYER || c.g.occ[t.cell] === PLAYER); return { cur: ok ? 1 : 0, need: 1, frac: ok ? 1 : 0, text: ok ? "Taken" : "Not taken yet", done: ok, lost: !t || (!atWar(c.g, PLAYER, t.owner) && t.owner !== PLAYER) }; },
    reward: () => [{ t: "mod", key: "amb_victory", label: "Victory in the field", stab: 4, seasons: 6 }],
  },
  work: {
    cat: "Great works", icon: "star", seasons: 0, prestige: 15,
    offer: c => {
      const k = WORK_ORDER.filter(k => quoteWorkLite(c.w, c.g, PLAYER, k, c.econ).ok)[0];
      return k ? { work: k, seasons: WORKS[k].seasons + 6, w: 1.3 } : null;
    },
    title: a => `Complete the ${WORKS[a.work].label}`,
    why: a => `${WORKS[a.work].does} Only one nation in the world can build it.`,
    progress: (c, a) => { const W = c.g.works[a.work] || {}; const mine = W.owner === PLAYER; const b = W.builders && W.builders[PLAYER]; const f = mine ? 1 : b ? b.progress / WORKS[a.work].seasons : 0; return { cur: f, need: 1, frac: f, text: mine ? "Completed" : b ? `${pct(f)} built` : "Not started: start it in the Agenda panel", done: mine, lost: W.owner !== null && W.owner !== undefined && W.owner !== PLAYER }; },
    reward: () => [],
  },
};

/* Three offers from different kinds of goal, the most pressing first, with some variety. */
function ambitionOffers(w, g, rng) {
  const c = ambCtx(w, g);
  const taken = new Set(g.amb.active.map(a => a.key));
  const recent = new Set((g.amb.log || []).filter(x => g.turn - x.turn < 12).map(x => x.key));
  const all = [];
  for (const key in AMBITIONS) {
    if (taken.has(key) || recent.has(key)) continue;
    const A = AMBITIONS[key];
    const p = A.offer(c);
    if (!p) continue;
    const a = { key, cat: A.cat, ...p };
    a.seasons = p.seasons || A.seasons;
    const pr = A.progress(c, { ...a, since: g.turn });
    if (pr.done) continue;
    all.push({ a, w: p.w * (0.6 + rng()) });
  }
  all.sort((x, y) => y.w - x.w);
  const out = [], cats = new Set();
  for (const x of all) { if (out.length >= 3) break; if (cats.has(x.a.cat)) continue; cats.add(x.a.cat); out.push(x.a); }
  for (const x of all) { if (out.length >= 3) break; if (!out.includes(x.a)) out.push(x.a); }
  return out.map(a => { const { w: _w, ...rest } = a; return { id: g.nextId++, ...rest, title: AMBITIONS[a.key].title(a, g), why: AMBITIONS[a.key].why(a, g), prestige: AMBITIONS[a.key].prestige }; });
}
function refreshOffers(w, g, econ) {
  if (g.amb.active.length >= AMBITION_SLOTS) { g.amb.offers = []; return; }
  // offers stay put until something changes, they grow stale, or one is already fulfilled
  const c = econ ? { w, g, n: g.nations[PLAYER], econ, Y: econ.gdp } : null;
  const stillOpen = g.amb.offers.length && g.amb.offersTurn >= 0 && g.turn - g.amb.offersTurn < 8
    && (!c || g.amb.offers.every(o => { const p = AMBITIONS[o.key].progress(c, { ...o, since: g.turn }); return !p.done && !p.lost; }));
  if (stillOpen) return;
  const rng = mulberry32((w.seed * 131 + g.turn * 7 + g.amb.active.length * 3) >>> 0);
  g.amb.offers = ambitionOffers(w, g, rng);
  g.amb.offersTurn = g.turn;
}
function ambitionProgress(w, g, a) { return AMBITIONS[a.key].progress(ambCtx(w, g), a); }
function pickAmbition(w, g, id) {
  if (g.amb.active.length >= AMBITION_SLOTS) return null;
  const o = g.amb.offers.find(x => x.id === id);
  if (!o) return null;
  const a = { ...o, since: g.turn, deadline: g.turn + o.seasons };
  g.amb.active.push(a);
  g.amb.offers = [];
  addChronicle(g, `You set the nation an ambition: ${a.title.charAt(0).toLowerCase()}${a.title.slice(1)}, by ${seasonLabel(a.deadline)}.`, "neutral", PLAYER);
  return a;
}
function dropAmbition(w, g, id) {
  const a = g.amb.active.find(x => x.id === id);
  if (!a) return;
  g.amb.active = g.amb.active.filter(x => x !== a);
  const n = g.nations[PLAYER];
  if (g.turn > a.since) n.stability = Math.max(0, n.stability - 2);
  g.amb.log.unshift({ turn: g.turn, key: a.key, title: a.title, result: "dropped" });
  g.amb.offersTurn = -1;
  addChronicle(g, `You gave up the ambition to ${a.title.charAt(0).toLowerCase()}${a.title.slice(1)}.`, "warn", PLAYER);
  g.amb.offersTurn = -1;
}
/* Checked at the end of each season: ambitions fulfilled, lost or out of time. */
function checkAmbitions(w, g, dispatch) {
  const c = ambCtx(w, g);
  if (!c.econ.cities.length) return;
  for (const a of g.amb.active.slice()) {
    const A = AMBITIONS[a.key];
    const p = A.progress(c, a);
    if (p.done) {
      g.amb.active = g.amb.active.filter(x => x !== a);
      g.amb.offersTurn = -1;
      const effects = A.reward(c, a);
      applyEffects(w, g, PLAYER, effects);
      const pts = addPrestige(g, PLAYER, a.prestige, ambPrestigeCat(a.cat), `Ambition: ${a.title}`);
      leaderDeed(g, PLAYER, "ambitions");
      g.amb.log.unshift({ turn: g.turn, key: a.key, title: a.title, result: "done", pts });
      const what = effects.map(e => effectText(g, e, PLAYER).text).filter(Boolean).join("; ");
      dispatch.ambitions.push({ tone: "good", text: `Ambition fulfilled: ${a.title}. +${pts} prestige${what ? `; ${what}` : ""}.` });
      addChronicle(g, `Ambition fulfilled: ${a.title}.`, "good", PLAYER);
    } else if (p.lost || g.turn >= a.deadline) {
      g.amb.active = g.amb.active.filter(x => x !== a);
      g.amb.offersTurn = -1;
      const n = g.nations[PLAYER];
      addNationMod(g, n, { key: `amb_fail_${a.key}`, label: "A broken promise", stab: -3, seasons: 4 });
      addPrestige(g, PLAYER, -3, ambPrestigeCat(a.cat), `Missed ambition: ${a.title}`);
      g.amb.log.unshift({ turn: g.turn, key: a.key, title: a.title, result: p.lost ? "lost" : "failed" });
      dispatch.ambitions.push({ tone: "bad", text: `${p.lost ? "Ambition lost" : "Time ran out"}: ${a.title}. The people feel let down (−3 stability for 4 seasons, −3 prestige).` });
      addChronicle(g, `The ambition to ${a.title.charAt(0).toLowerCase()}${a.title.slice(1)} ${p.lost ? "can no longer be fulfilled" : "was not fulfilled in time"}.`, "bad", PLAYER);
    }
  }
  if (g.amb.log.length > 40) g.amb.log.length = 40;
}
function ambPrestigeCat(cat) { return { Building: "people", Trade: "wealth", Wealth: "wealth", People: "people", Science: "science", Diplomacy: "diplomacy", Power: "power", "Great works": "works" }[cat] || "people"; }

