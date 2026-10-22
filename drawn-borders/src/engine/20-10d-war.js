/* =====================================================================
   10d. War: declarations, fronts, occupation, peace
   ===================================================================== */
const TERRAIN_DEF = { [T.PLAINS]: 1, [T.FOREST]: 1.25, [T.HILLS]: 1.45, [T.MOUNTAIN]: 1.9 };

function warBetween(g, a, b) {
  return g.wars.find(x => (x.sideA.includes(a) && x.sideB.includes(b)) || (x.sideA.includes(b) && x.sideB.includes(a)));
}
function atWar(g, a, b) { return !!warBetween(g, a, b); }
function enemiesOf(g, a) {
  const s = new Set();
  for (const x of g.wars) {
    if (x.sideA.includes(a)) x.sideB.forEach(v => s.add(v));
    if (x.sideB.includes(a)) x.sideA.forEach(v => s.add(v));
  }
  return [...s];
}
function alliesOf(g, a) {
  return g.treaties.filter(t => t.type === "alliance" && (t.a === a || t.b === a)).map(t => (t.a === a ? t.b : t.a)).filter(x => g.nations[x].alive);
}
function sideScore(war, nid) { return war.sideA.includes(nid) ? war.score : -war.score; }
function sameSide(war, a, b) { return (war.sideA.includes(a) && war.sideA.includes(b)) || (war.sideB.includes(a) && war.sideB.includes(b)); }

function occupiedShare(g, nid) {
  let own = 0, occ = 0;
  for (let i = 0; i < N_CELLS; i++) if (g.owner[i] === nid) { own++; if (g.occ[i] >= 0) occ++; }
  return own ? occ / own : 0;
}

/* x's reason for a war on y, the first that applies (strength 0: none). `w` lets it see hunger (a food embargo). */
function casusBelli(g, x, y, w) {
  const r = rel(g, x, y);
  if (r.mods.some(m => m.key === "broke_treaty")) return { label: `the ${nameOf(g, y)} broke a treaty with us`, strength: 3 };
  if (r.mods.some(m => m.key === "claim_town")) return { label: `our claim to ${g.opening ? g.opening.town : "a border town"}`, strength: 2 };
  const lostC = g.cities.filter(c => c.owner === y && c.origin === x && (c.loyalty ?? CITY.loyalNative) < CITY.integrate).sort((a, b) => (b.imp || 0) - (a.imp || 0))[0];
  if (lostC) return { label: `to win back ${lostC.name}`, strength: (lostC.loyalty ?? CITY.loyalNative) < 60 ? 2 : 1 };
  const ally = alliesOf(g, x).find(a => atWar(g, a, y));
  if (ally !== undefined) return { label: `defending our ally, the ${nameOf(g, ally)}`, strength: 3 };
  if (r.mods.some(m => m.key === "abandoned")) return { label: `the ${nameOf(g, y)} betrayed us in war`, strength: 2 };
  if (r.mods.some(m => m.key === "settled_near" && m.value <= -8)) return { label: "a border dispute over settled land", strength: 2 };
  // their embargo on us (10t): food cut off while our people go hungry, or trade strangled
  const st = strangledTrade(g, x, y, w);
  if (st && st.food) return { label: `the ${nameOf(g, y)} cut off our food while our people went hungry`, strength: 2 };
  if (st) return { label: `the ${nameOf(g, y)} strangled our trade`, strength: 1 };
  if (g.commitments.some(c => c.by === x && c.against === y && commitKind(c) === "war")) return { label: `the ${nameOf(g, y)} rejected our demands`, strength: 1 };
  if (r.mods.some(m => ["insult", "threatened", "deceived"].includes(m.key))) return { label: "insults to our honor", strength: 1 };
  return { label: "a war of conquest", strength: 0 };
}

function warAssessment(w, g, x, y) {
  if (x === y || !g.nations[y].alive || atWar(g, x, y) || !sharesBorder(g, x, y)) return null;
  if ((g.turn < (y === PLAYER ? OPENING.grace : 8) && !openingWarAllowed(g, x, y)) || g.nations[x].minor) return null;
  const nx = g.nations[x], ny = g.nations[y], per = personality(nx);
  let enemyPower = armyPower(g, y) * defenseMult(ny);
  for (const a of alliesOf(g, y)) if (a !== x && sharesBorder(g, a, x)) enemyPower += armyPower(g, a) * 0.8;
  const busy = enemiesOf(g, x).length;
  const ratio = armyPower(g, x) / Math.max(1, enemyPower) / (1 + busy);
  const winChance = 1 / (1 + Math.exp(-4 * (ratio - 1.25)));
  const econX = computeEconomy(w, g, x);
  const mine = [];
  for (let i = 0; i < N_CELLS; i++) if (controller(g, i) === x) mine.push(i);
  const d = distanceField(w, mine);
  let prize = 0;
  const prizeTowns = [];
  const portless = !g.cities.some(c => c.owner === x && oceanPort(w, c));
  let wantsPort = null, lostTown = null;
  const prizeList = [];
  for (const c of g.cities) {
    if (c.owner !== y || d[c.cell] > 6) continue;
    let v = regionValue(w, g, c).gdp * (0.5 + clamp(c.imp || 50, 0, 110) / 100);
    if (c.origin === x) { v *= 1.3; lostTown = lostTown || c.name; }
    if (portless && oceanPort(w, c)) { v *= 1.4; wantsPort = wantsPort || c.name; }
    prize += v;
    prizeList.push(c);
  }
  prizeList.sort((a, b) => (b.imp || 0) - (a.imp || 0)).forEach(c => prizeTowns.push(c.name));
  const lines = [];
  const prizePts = Math.min(60, (100 * prize * DIPLO.horizonYears * 0.5) / Math.max(1, econX.gdp) * per.landWeight);
  let v = winChance * prizePts * per.aggression;
  lines.push({ label: `Chance of winning about ${pct(winChance)} (our strength ${ratio.toFixed(2)}× theirs)`, pts: 0 });
  lines.push({ label: prizeTowns.length ? `Towns within reach: ${prizeTowns.slice(0, 3).join(", ")}` : "No towns within easy reach", pts: Math.round(v) });
  if (lostTown) lines.push({ label: `${lostTown} was ours, and its people remember`, pts: 0 });
  if (wantsPort) lines.push({ label: `${wantsPort}: a harbor on the open sea, which we lack`, pts: 0 });
  const cost = 14 * per.caution;
  v -= cost; lines.push({ label: "Cost of war: lives, money and unrest", pts: -Math.round(cost) });
  if ((g.treaties || []).some(t => t.type === "tribute" && t.a === y && t.b === x)) { v -= 30; lines.push({ label: "They pay us tribute", pts: -30 }); }
  const cb = casusBelli(g, x, y, w);
  if (hasTreaty(g, x, y, "truce") && cb.strength < 3) return null;
  if (hasTreaty(g, x, y, "nap")) {
    const c = (nx.archetype === "militarist" ? 25 : 45) + (hasTrait(nx, "honorable") ? 30 : 0);
    v -= c; lines.push({ label: "It would break our pact and our good name", pts: -c });
  }
  const opNow = opinionDetail(g, x, y).value;
  if (cb.strength === 0 && opNow > -15 && !(nx.archetype === "militarist" && ratio > 1.8)) return null;
  if (cb.strength === 0) { v -= 10 * per.caution; lines.push({ label: "No just cause; others will condemn us", pts: -Math.round(10 * per.caution) }); }
  else { v += cb.strength * 4; lines.push({ label: `Just cause: ${cb.label}`, pts: cb.strength * 4 }); }
  // the trade a war would end: what it is really worth with a trade book (10s), a flat cost for a treaty without one
  const lostTrade = warTradeLoss(w, g, x, y, econX);
  if (lostTrade === null) { if (hasTreaty(g, x, y, "trade")) { v -= 6; lines.push({ label: "We would lose our trade with them", pts: -6 }); } }
  else if (lostTrade > 0) {
    const tp = Math.min(10, (100 * lostTrade * DIPLO.horizonYears) / Math.max(1, econX.gdp) * per.tradeWeight);
    if (tp >= 0.5) { v -= tp; lines.push({ label: `We would lose our trade with them (${fmtMoney(lostTrade)} of output a year)`, pts: -Math.round(tp) }); }
  }
  const op = opinionDetail(g, x, y).value;
  v += -op / 5; lines.push({ label: `Our feelings toward them (${signed(op)})`, pts: Math.round(-op / 5) });
  if (workHolder(g, "atomic") === y) { v -= 25; lines.push({ label: "They have the atomic bomb", pts: -25 }); }
  if (workHolder(g, "forts") === y) { v -= 6; lines.push({ label: "Their Line of Fortresses", pts: -6 }); }
  if (nx.stability < 45) { v -= 15; lines.push({ label: "Too unstable at home", pts: -15 }); }
  if (busy) { v -= 10 * busy; lines.push({ label: "Already fighting elsewhere", pts: -10 * busy }); }
  if (g.commitments.some(c => c.by === x && c.against === y && commitKind(c) === "war")) { v += 12; lines.push({ label: "Our threat must be honored", pts: 12 }); }
  const ob = openingWarBonus(g, x, y, winChance);
  if (ob) { v += ob; lines.push({ label: `${g.opening.town} is rightfully ours`, pts: ob }); }
  if (g.turn < OPENING.grace && openingWarAllowed(g, x, y) && winChance < 0.45) return null;   // an early war only if they expect to win it
  return { value: Math.round(v), winChance, ratio, prizeTowns, cb, lines };
}

function peaceDesire(g, nid, war) {
  const n = g.nations[nid], per = personality(n);
  const s = sideScore(war, nid);
  const seasons = g.turn - war.since;
  return Math.round(-s * 0.5 + seasons * 2 + (50 - n.stability) * 0.4 + occupiedShare(g, nid) * 60 - per.pride * 6 - 4);
}

function declareWar(g, w, attacker, defender) {
  const cb = casusBelli(g, attacker, defender, w);
  for (const t of treatiesBetween(g, attacker, defender)) endTreaty(g, t, BINDING.includes(t.type) && t.type !== "tribute" ? attacker : null);
  const war = { id: g.nextId++, sideA: [attacker], sideB: [defender], since: g.turn, cb: cb.label, cbStrength: cb.strength, score: 0, lastBattles: [] };
  g.wars.push(war);
  g.stats.warsStarted[attacker] = (g.stats.warsStarted[attacker] || 0) + 1;
  addMod(g, defender, attacker, "declared_war", "Declared war on us", -30, 0.5, -60);
  for (const z of liveNations(g)) {
    if (z.id === attacker || z.id === defender) continue;
    if (cb.strength === 0) addMod(g, z.id, attacker, "aggressor", "Started an unprovoked war", -20, 0.7, -40);
    else if (cb.strength === 1) addMod(g, z.id, attacker, "aggressor", "Started a war on thin grounds", -8, 0.7, -40);
    remember(g, z.id, `The ${nameOf(g, attacker)} declared war on the ${nameOf(g, defender)} (${cb.label}).`);
  }
  fulfilCommitment(g, attacker, defender);
  rememberBoth(g, attacker, defender, `The ${nameOf(g, attacker)} declared war on the ${nameOf(g, defender)} (${cb.label}).`);
  const news = [`The ${nameOf(g, attacker)} declared war on the ${nameOf(g, defender)}, citing ${cb.label}.`];
  for (const ally of alliesOf(g, defender)) if (ally !== attacker) news.push(...callToArms(g, w, war, ally, defender, attacker));
  bumpWorld(g);
  return { war, news };
}

function joinWar(g, war, nid, side) {
  const arr = side === "A" ? war.sideA : war.sideB;
  if (!arr.includes(nid)) arr.push(nid);
  for (const foe of side === "A" ? war.sideB : war.sideA) for (const t of treatiesBetween(g, nid, foe)) endTreaty(g, t, null);
  bumpWorld(g);
}
function abandonAlly(g, ally, friend) {
  const t = g.treaties.find(t => t.type === "alliance" && ((t.a === ally && t.b === friend) || (t.a === friend && t.b === ally)));
  if (t) g.treaties = g.treaties.filter(x => x !== t);
  addMod(g, friend, ally, "abandoned", "Abandoned us in war", -40, 0.5, -60);
  rel(g, friend, ally).trust = Math.max(0, rel(g, friend, ally).trust - 30);
  remember(g, friend, `The ${nameOf(g, ally)} abandoned our alliance when we were attacked.`);
}
function callToArms(g, w, war, ally, friend, foe) {
  const n = g.nations[ally];
  if (n.isPlayer) {
    g.inbox.push({ id: g.nextId++, from: friend, kind: "call", warId: war.id, foe, turn: g.turn, expires: g.turn + DIPLO.inboxSeasons, status: "open", terms: [], threat: false,
      text: `Our alliance is now tested. The ${nameOf(g, foe)} has attacked us. We call on you to stand with us as you promised.\n\n— The ${nameOf(g, friend)}` });
    return [`The ${nameOf(g, friend)} called on you to honor your alliance against the ${nameOf(g, foe)}.`];
  }
  const per = personality(n);
  const op = opinionDetail(g, ally, friend).value;
  const ratio = armyPower(g, foe) / Math.max(1, armyPower(g, ally) + armyPower(g, friend));
  const honor = 12 + op / 4 - per.caution * Math.max(0, ratio - 0.8) * 15 - (n.stability < 30 ? 15 : 0);
  if (honor >= 0) {
    joinWar(g, war, ally, war.sideA.includes(friend) ? "A" : "B");
    addMod(g, friend, ally, "honored", "Came to our aid in war", 20, 0.5, 30);
    remember(g, ally, `We joined our ally, the ${nameOf(g, friend)}, in its war against the ${nameOf(g, foe)}.`);
    return [`The ${n.name} honored its alliance and joined the war against the ${nameOf(g, foe)}.`];
  }
  abandonAlly(g, ally, friend);
  return [`The ${n.name} refused to fight for its ally, the ${nameOf(g, friend)}.`];
}

function warScore(g, war) {
  let a = 0, b = 0, areaA = 0, areaB = 0;
  const cityW = new Map(g.cities.map(c => [c.cell, cityWarWeight(c)]));
  for (let i = 0; i < N_CELLS; i++) {
    const o = g.owner[i];
    if (o < 0) continue;
    if (war.sideA.includes(o)) areaA++;
    if (war.sideB.includes(o)) areaB++;
    const oc = g.occ[i];
    if (oc < 0) continue;
    const wgt = cityW.get(i) || 1;
    if (war.sideA.includes(oc) && war.sideB.includes(o)) a += wgt;
    if (war.sideB.includes(oc) && war.sideA.includes(o)) b += wgt;
  }
  // a blockaded port counts like ground taken
  if (g.sea && g.sea.blockadedBy) for (const id in g.sea.blockadedBy) {
    const c = g.cities.find(x => x.id === Number(id)), by = g.sea.blockadedBy[id];
    if (!c) continue;
    if (war.sideB.includes(c.owner) && war.sideA.includes(by)) a += 4;
    if (war.sideA.includes(c.owner) && war.sideB.includes(by)) b += 4;
  }
  return clamp(Math.round((100 * (a - b)) / (0.3 * Math.min(areaA, areaB) + 6)), -100, 100);
}

function endWarBetween(g, war, x, y) {
  const leaders = [war.sideA[0], war.sideB[0]];
  const all = [...war.sideA, ...war.sideB];
  const leaving = leaders.includes(x) && leaders.includes(y) ? all : [x, y].filter(id => !leaders.includes(id));
  const sideOfId = id => (war.sideA.includes(id) ? "A" : "B");
  for (let i = 0; i < N_CELLS; i++) {
    const o = g.owner[i], oc = g.occ[i];
    if (oc < 0 || o < 0 || !all.includes(o) || !all.includes(oc)) continue;
    if (sideOfId(o) === sideOfId(oc)) continue;
    if (leaving.includes(o) || leaving.includes(oc)) g.occ[i] = -1;
  }
  const truceWith = id => (sideOfId(id) === "A" ? war.sideB : war.sideA);
  for (const l of leaving) for (const foe of truceWith(l)) if (!hasTreaty(g, l, foe, "truce")) addTreaty(g, "truce", l, foe);
  if (leaving.length === all.length) g.wars = g.wars.filter(v => v !== war);
  else { war.sideA = war.sideA.filter(id => !leaving.includes(id)); war.sideB = war.sideB.filter(id => !leaving.includes(id)); }
  for (const a of leaving) for (const b of truceWith(a)) { addMod(g, a, b, "peace_made", "Made peace with us", 5, 0.5, 10); }
  g._contact = null;
  sendHome(g);
  bumpWorld(g);
}

function warStabilityTerms(g, nid) {
  const terms = [];
  for (const war of g.wars) {
    if (!war.sideA.includes(nid) && !war.sideB.includes(nid)) continue;
    const seasons = g.turn - war.since;
    const foes = (war.sideA.includes(nid) ? war.sideB : war.sideA).map(id => nameOf(g, id)).join(" and ");
    const defending = war.sideB.includes(nid);
    if (defending && seasons < 4) terms.push({ label: `Rallying against the ${foes}`, value: 4 });
    if (!defending && war.cbStrength === 0 && war.sideA[0] === nid) terms.push({ label: "An unprovoked war is unpopular", value: -4 });
    const media = 1 - 0.15 * Math.min(3, (g.nations[nid] && g.nations[nid].mediaLevels) || 0);
    terms.push({ label: `War with the ${foes} (season ${seasons + 1})${media < 1 ? ", softened by the press" : ""}`, value: -Math.min(12, 2 + seasons * 0.6) * media });
  }
  const occ = occupiedShare(g, nid);
  if (occ > 0.005) terms.push({ label: `Enemy occupation (${pct(occ)} of our land)`, value: -45 * occ });
  const nb = g.sea && g.sea.blockaded ? g.sea.blockaded.filter(id => { const c = g.cities.find(x => x.id === id); return c && c.owner === nid; }).length : 0;
  if (nb) terms.push({ label: `Enemy warships blockade ${nb} of our port${nb > 1 ? "s" : ""}`, value: -Math.min(5, 1.5 * nb) });
  const n = g.nations[nid];
  if (n && n.recentLosses > 500) {
    const share = n.recentLosses / Math.max(1, nationPop(g, nid) * 1e6);
    terms.push({ label: `Grief over ${fmtCount(n.recentLosses)} recent casualties`, value: -Math.min(10, share * 3000) });
  }
  return terms;
}

function checkEliminations(g) {
  const news = [];
  for (const n of liveNations(g)) {
    const own = g.cities.filter(c => c.owner === n.id);
    if (own.length && own.every(c => g.occ[c.cell] >= 0)) {
      n.occupiedSeasons = (n.occupiedSeasons || 0) + 1;
      if (n.occupiedSeasons >= 2) {
        for (const c of own) { const by = g.occ[c.cell]; if (by >= 0) transferCity(g, c, by); }
        news.push(`The ${n.name} surrendered. Its towns now belong to the armies that hold them.`);
      }
    } else n.occupiedSeasons = 0;
  }
  for (const n of liveNations(g)) {
    if (g.cities.some(c => c.owner === n.id)) continue;
    n.alive = false;
    for (let i = 0; i < N_CELLS; i++) { if (g.owner[i] === n.id) { g.owner[i] = -1; g.occ[i] = -1; } if (g.occ[i] === n.id) g.occ[i] = -1; }
    g.treaties = g.treaties.filter(t => t.a !== n.id && t.b !== n.id);
    g.divisions = g.divisions.filter(d => d.owner !== n.id);
    g.airwings = g.airwings.filter(a => a.owner !== n.id);
    if (g.sea) g.sea.fleets = g.sea.fleets.filter(f => f.owner !== n.id);
    n.freighters = 0;
    for (const war of [...g.wars]) {
      war.sideA = war.sideA.filter(id => id !== n.id);
      war.sideB = war.sideB.filter(id => id !== n.id);
      if (!war.sideA.length || !war.sideB.length) g.wars = g.wars.filter(v => v !== war);
    }
    g.inbox.forEach(it => { if (it.from === n.id && it.status === "open") it.status = "void"; });
    tradeForgetDead(g);   // its embargoes, promises and preferred-seller choices go with it (10s)
    news.push(`The ${n.name} has ceased to exist.`);
    bumpWorld(g);
  }
  return news;
}

