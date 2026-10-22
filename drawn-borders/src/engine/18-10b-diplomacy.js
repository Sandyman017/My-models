/* =====================================================================
   10b. Diplomacy: relations, opinions, trust, treaties
   ===================================================================== */
const PERSONALITY = {
  expansionist: { pride: 1.2, caution: 0.7, aggression: 1.2, tradeWeight: 0.8, moneyWeight: 1.0, landWeight: 1.5,
    voice: "proud and ambitious; speaks of destiny, land and the future of its people" },
  mercantile:   { pride: 0.7, caution: 1.0, aggression: 0.4, tradeWeight: 1.6, moneyWeight: 1.3, landWeight: 0.8,
    voice: "polished and transactional; courteous, precise about money, allergic to waste and war" },
  agrarian:     { pride: 0.9, caution: 1.4, aggression: 0.5, tradeWeight: 0.9, moneyWeight: 1.0, landWeight: 1.0,
    voice: "plain-spoken and cautious; speaks of harvests, patience and keeping the peace" },
  militarist:   { pride: 1.5, caution: 0.6, aggression: 1.5, tradeWeight: 0.6, moneyWeight: 0.9, landWeight: 1.2,
    voice: "curt and martial; speaks of strength, order and honor; despises weakness" },
};
const PLAYER_PERSONALITY = { pride: 1, caution: 1, aggression: 0.8, tradeWeight: 1, moneyWeight: 1, landWeight: 1 };
function personality(n) {
  const base = n.archetype ? PERSONALITY[n.archetype] : PLAYER_PERSONALITY;
  if (!n.leader) return base;
  const out = { ...base };
  for (const t of n.leader.traits) for (const k in LEADER_TRAITS[t].mod) out[k] = Math.max(0.1, (out[k] || 0) + LEADER_TRAITS[t].mod[k]);
  if (n.minor) { out.aggression = Math.min(out.aggression, 0.3); out.caution = Math.max(out.caution, 1.3); }
  return out;
}

const AFFINITY = {
  "mercantile|mercantile": 8, "agrarian|agrarian": 6, "militarist|militarist": 4, "expansionist|expansionist": -4,
  "mercantile|militarist": -6, "agrarian|expansionist": -6, "agrarian|militarist": -4, "mercantile|expansionist": -2,
  "mercantile|agrarian": 4, "expansionist|militarist": 2,
};
function affinity(a, b) { if (!a || !b) return 0; return AFFINITY[`${a}|${b}`] ?? AFFINITY[`${b}|${a}`] ?? 0; }

const TREATY_INFO = {
  trade:    { label: "Trade agreement",     seasons: null },
  nap:      { label: "Non-aggression pact", seasons: 12 },
  alliance: { label: "Defensive alliance",  seasons: null },
  border:   { label: "Border accord",       seasons: 16 },
  tribute:  { label: "Tribute",             seasons: null },
  truce:    { label: "Truce",               seasons: 8 },
};
const BINDING = ["nap", "alliance", "border", "truce", "tribute"];

const DIPLO = {
  tradeForeignShare: 0.4,     // a trade partner's people count for 40% in your market
  horizonYears: 4,            // how far ahead nations value lasting gains
  nearBorderCells: 4,         // "near our border" for settling and border accords
  inboxSeasons: 2,            // envoys wait this long for an answer
  counterGap: 6,              // largest shortfall (in points) a nation will try to close with a counter-offer
};

function nameOf(g, id) { return g.nations[id] ? g.nations[id].name : "someone"; }
function liveNations(g) { return g.nations.filter(n => n.alive); }
function controller(g, i) { return g.occ[i] >= 0 ? g.occ[i] : g.owner[i]; }
function bumpWorld(g) { g.ver = (g.ver || 0) + 1; }

function contactMatrix(g) {
  const k = g.nations.length;
  const m = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < N_CELLS; i++) {
    const a = controller(g, i);
    if (a < 0) continue;
    if (cellX(i) + 1 < GRID_W) { const b = controller(g, i + 1); if (b >= 0 && b !== a) { m[a][b]++; m[b][a]++; } }
    if (cellY(i) + 1 < GRID_H) { const b = controller(g, i + GRID_W); if (b >= 0 && b !== a) { m[a][b]++; m[b][a]++; } }
  }
  return m;
}
function contact(g) {
  if (!g._contact || g._contactVer !== g.ver) { g._contact = contactMatrix(g); g._contactVer = g.ver; }
  return g._contact;
}
function sharesBorder(g, a, b) { return contact(g)[a][b] > 0; }

function territoryGap(w, g, a, b) {
  if (sharesBorder(g, a, b)) return 0;
  const src = [];
  for (let i = 0; i < N_CELLS; i++) if (controller(g, i) === a) src.push(i);
  if (!src.length) return Infinity;
  const d = distanceField(w, src);
  let best = Infinity;
  for (let i = 0; i < N_CELLS; i++) if (controller(g, i) === b && d[i] < best) best = d[i];
  return best === Infinity ? 99 : Math.max(1, best - 1);
}
function gap(w, g, a, b) {
  if (!g._gap || g._gapVer !== g.ver) { g._gap = {}; g._gapVer = g.ver; }
  const k = a < b ? `${a}-${b}` : `${b}-${a}`;
  if (!(k in g._gap)) g._gap[k] = territoryGap(w, g, a, b);
  return g._gap[k];
}

function nationPop(g, nid) {
  let p = 0;
  for (let i = 0; i < N_CELLS; i++) if (g.owner[i] === nid && g.occ[i] < 0) p += g.pop[i];
  return p;
}
function defenseMult(n) { return 0.75 + n.defense / 100; }

/* ---------- Relations ---------- */
function rel(g, a, b) {
  const k = `${a}>${b}`;
  if (!g.rel[k]) g.rel[k] = { mods: [], trust: 50, cred: 0.6 };
  return g.rel[k];
}
function addMod(g, from, to, key, label, value, decay, cap) {
  if (from === to || !g.nations[from] || !g.nations[to]) return;
  const r = rel(g, from, to);
  const limit = v => (cap === undefined ? v : value < 0 ? Math.max(cap, v) : Math.min(cap, v));
  const m = r.mods.find(x => x.key === key);
  if (m) { m.value = limit(m.value + value); m.label = label; m.decay = decay; }
  else r.mods.push({ key, label, value: limit(value), decay });
}
function decayRelations(g) {
  for (const k in g.rel) {
    const r = g.rel[k];
    r.mods.forEach(m => { m.value = m.value > 0 ? Math.max(0, m.value - m.decay) : Math.min(0, m.value + m.decay); });
    r.mods = r.mods.filter(m => Math.abs(m.value) >= 0.5);
  }
}
function driftTrust(g) {
  for (const a of liveNations(g)) for (const b of liveNations(g)) {
    if (a.id === b.id) continue;
    const r = rel(g, a.id, b.id);
    if (treatiesBetween(g, a.id, b.id).some(t => t.type !== "truce")) r.trust = Math.min(85, r.trust + 1);
    else r.trust += (50 - r.trust) * 0.04;
  }
}

/* How `from` sees `to`: items worked out from the world now, then remembered events. `opts.noEmbargo` leaves out
   everything that comes from embargoes (an old grudge must not feed on the embargo it would justify). */
function opinionDetail(g, from, to, opts = {}) {
  const items = [];
  const A = g.nations[from], B = g.nations[to];
  const aff = affinity(A.archetype, B.archetype);
  if (aff) items.push({ label: aff > 0 ? "Kindred character" : "Clashing character", value: aff });
  for (const t of treatiesBetween(g, from, to)) {
    const v = { trade: 10, nap: 5, alliance: 20, border: 5, truce: 0, tribute: t.a === from ? -10 : 4 }[t.type];
    if (v) items.push({ label: t.type === "tribute" ? (t.a === from ? "We pay them tribute" : "They pay us tribute") : TREATY_INFO[t.type].label, value: v });
  }
  const war = atWar(g, from, to);
  if (war) items.push({ label: "At war with us", value: -40 });
  if (!war && sharesBorder(g, from, to)) {
    const ratio = armyPower(g, to) / Math.max(1, armyPower(g, from));
    if (ratio > 1.3) items.push({ label: "Their army dwarfs ours", value: -Math.round(clamp(12 * (ratio - 1.3) + 4, 0, 20)) });
  }
  for (const z of liveNations(g)) {
    if (z.id === from || z.id === to) continue;
    if (atWar(g, from, z.id) && atWar(g, to, z.id)) items.push({ label: `Common enemy: ${z.name}`, value: 15 });
  }
  if (!war && B.softPower >= 1) items.push({ label: "Their films, radio and resorts", value: Math.round(B.softPower) });
  if (hasTrait(B, "honorable")) items.push({ label: "Their leader keeps every promise", value: 5 });
  const fmItem = foreignOpinionItem(B);
  if (fmItem) items.push(fmItem);
  if (A.archetype === "mercantile" && B.laws && B.laws.trade !== (A.laws && A.laws.trade)) items.push({ label: B.laws.trade === "protect" ? "Their tariffs shut out our merchants" : B.laws.trade === "free" ? "Their open markets" : "", value: B.laws.trade === "protect" ? -5 : B.laws.trade === "free" ? 4 : 0 });
  // trade (10t): their embargo while it stands, a need they fill, good customers (read from the book, no economy)
  for (const it of tradeOpinionItems(g, from, to, opts.noEmbargo)) items.push(it);
  rel(g, from, to).mods.forEach(m => { if (!(opts.noEmbargo && embargoModKey(m.key))) items.push({ label: m.label, value: Math.round(m.value) }); });
  const value = clamp(items.reduce((s, x) => s + x.value, 0), -100, 100);
  return { value, items: items.filter(x => x.value !== 0) };
}
function opinionLabel(v) {
  return v <= -50 ? "Hostile" : v <= -20 ? "Unfriendly" : v < -5 ? "Wary" : v <= 10 ? "Neutral" : v < 35 ? "Cordial" : "Friendly";
}

function threatFrom(w, g, E, Z) {
  if (E === Z || !g.nations[Z].alive || !g.nations[E].alive) return 0;
  if (atWar(g, E, Z)) return 1.5;
  const d = gap(w, g, E, Z);
  const reach = d === 0 ? 1 : d <= 4 ? 0.6 : d <= 10 ? 0.3 : 0.1;
  const ratio = armyPower(g, Z) / Math.max(1, armyPower(g, E) * defenseMult(g.nations[E]));
  const base = clamp(ratio - 0.5, 0, 1.5);
  const op = opinionDetail(g, E, Z).value;
  const hostility = op < -30 ? 1.3 : op < 0 ? 1 : op < 30 ? 0.75 : 0.5;
  const zn = g.nations[Z];
  const temper = zn.archetype ? personality(zn).aggression : 0.8 + 0.3 * Math.min(3, g.stats.warsStarted[Z] || 0);
  return clamp(base * reach * hostility * (0.6 + 0.4 * temper) * (hasTrait(g.nations[E], "paranoid") ? 1.35 : 1), 0, 1.5);
}

/* ---------- Memory: what each government remembers, in plain sentences ---------- */
function remember(g, nid, text) {
  if (!g.nations[nid] || g.nations[nid].isPlayer) return;
  if (!g.memory[nid]) g.memory[nid] = [];
  g.memory[nid].unshift({ turn: g.turn, text });
  if (g.memory[nid].length > 24) g.memory[nid].length = 24;
}
function rememberBoth(g, a, b, text) { remember(g, a, text); remember(g, b, text); }

/* ---------- Treaties ---------- */
function treatiesBetween(g, a, b) { return g.treaties.filter(t => (t.a === a && t.b === b) || (t.a === b && t.b === a)); }
function hasTreaty(g, a, b, type) { return treatiesBetween(g, a, b).some(t => t.type === type); }
function addTreaty(g, type, a, b, extra = {}) {
  if (type !== "tribute" && hasTreaty(g, a, b, type)) return null;
  const seasons = extra.seasons ?? TREATY_INFO[type].seasons;
  const t = { id: g.nextId++, type, a, b, since: g.turn, until: seasons ? g.turn + seasons : null, ...extra };
  g.treaties.push(t);
  if (type !== "truce" && g.stats) { natStats(g, a).treaties++; natStats(g, b).treaties++; }
  if (["trade", "nap", "alliance", "border"].includes(type)) { leaderDeed(g, a, "treaties"); leaderDeed(g, b, "treaties"); }
  return t;
}
function endTreaty(g, t, breaker) {
  g.treaties = g.treaties.filter(x => x !== t);
  if (breaker === null || breaker === undefined) return;
  const victim = t.a === breaker ? t.b : t.a;
  if (t.type === "trade") { addMod(g, victim, breaker, "ended_trade", "Ended our trade", -10, 1, -20); remember(g, victim, `${nameOf(g, breaker)} ended our trade agreement.`); return; }
  if (t.type === "tribute" && t.b === breaker) { remember(g, victim, `${nameOf(g, breaker)} released us from paying tribute.`); return; }
  addMod(g, victim, breaker, "broke_treaty", `Broke our ${TREATY_INFO[t.type].label.toLowerCase()}`, -50, 1, -80);
  const r = rel(g, victim, breaker);
  r.trust = Math.max(0, r.trust - 35);
  for (const z of liveNations(g)) {
    if (z.id === breaker || z.id === victim) continue;
    addMod(g, z.id, breaker, "faithless", "Breaks its treaties", -15, 0.5, -30);
    rel(g, z.id, breaker).trust = Math.max(0, rel(g, z.id, breaker).trust - 15);
    remember(g, z.id, `${nameOf(g, breaker)} broke its ${TREATY_INFO[t.type].label.toLowerCase()} with ${nameOf(g, victim)}.`);
  }
  remember(g, victim, `${nameOf(g, breaker)} broke its ${TREATY_INFO[t.type].label.toLowerCase()} with us.`);
}
function expireTreaties(g) {
  const news = [];
  for (const t of [...g.treaties]) {
    if (t.until !== null && t.until !== undefined && g.turn >= t.until) {
      g.treaties = g.treaties.filter(x => x !== t);
      news.push({ a: t.a, b: t.b, text: `The ${TREATY_INFO[t.type].label.toLowerCase()} between ${nameOf(g, t.a)} and ${nameOf(g, t.b)} has run its course.` });
    }
  }
  return news;
}
function payTributes(g) {
  for (const t of g.treaties) if (t.type === "tribute") {
    g.nations[t.a].treasury -= t.amount;
    g.nations[t.b].treasury += t.amount;
  }
}

/* ---------- Commitments: threats made, and whether they were carried out ----------
   A threat is of war (the default) or of an embargo ({kind: "embargo", k: good or null}). War carries out any
   threat; an embargo carries out only a threat of embargo. */
function commitKind(c) { return c.kind || "war"; }
function addCommitment(g, by, against, label, extra = {}) {
  const kind = extra.kind || "war";
  if (g.commitments.some(c => c.by === by && c.against === against && commitKind(c) === kind)) return;
  g.commitments.push({ by, against, turn: g.turn, label, ...(kind !== "war" ? { kind, k: extra.k ?? null } : {}) });
}
function fulfilCommitment(g, by, against, kind) {
  const kept = g.commitments.filter(c => c.by === by && c.against === against && (kind !== "embargo" || commitKind(c) === "embargo"));
  if (!kept.length) return;
  const r = rel(g, against, by);
  r.cred = clamp(r.cred + 0.25, 0, 1);
  for (const z of liveNations(g)) if (z.id !== by) rel(g, z.id, by).cred = clamp(rel(g, z.id, by).cred + 0.1, 0, 1);
  g.commitments = g.commitments.filter(c => !kept.includes(c));
}
function checkCommitments(g) {
  const news = [];
  for (const c of [...g.commitments]) {
    if (g.turn - c.turn < 3) continue;
    g.commitments = g.commitments.filter(x => x !== c);
    if (!g.nations[c.by].alive || !g.nations[c.against].alive) continue;
    // a threat to cut off trade is carried out by an embargo in force, and made moot by a war (no trade passes)
    if (commitKind(c) === "embargo" && (atWar(g, c.by, c.against) || embargoesBy(g, c.by, c.against).length)) continue;
    const r = rel(g, c.against, c.by);
    r.cred = clamp(r.cred - 0.25, 0, 1);
    const what = commitKind(c) === "embargo" ? `to cut off ${c.k && GOODS[c.k] ? `our ${GOODS[c.k].label.toLowerCase()}` : "our trade"}` : "war";
    remember(g, c.against, `${nameOf(g, c.by)} threatened ${what} over ${c.label} but never acted.`);
    if (c.by === PLAYER) news.push(commitKind(c) === "embargo" ? `The ${nameOf(g, c.against)} noted that you never cut off their trade as you threatened over ${c.label}. Your threats now carry less weight with them.` : `The ${nameOf(g, c.against)} noted that you never carried out your threat over ${c.label}. Your threats now carry less weight with them.`);
    if (c.against === PLAYER) news.push(commitKind(c) === "embargo" ? `The ${nameOf(g, c.by)} threatened to cut off your trade over ${c.label} but did not act. Their threats will worry you less.` : `The ${nameOf(g, c.by)} threatened you over ${c.label} but did not act. Their threats will worry you less.`);
  }
  return news;
}

