/* =====================================================================
   11b. A nation's story: prestige, timed effects, leaders who earn their names
   Borrowed ideas: Crusader Kings and Old World (rulers with traits who earn epithets and must be
   succeeded), Humankind and Civilization (fame from deeds the whole world can see).
   ===================================================================== */
const PRESTIGE_CATS = {
  wealth:    { label: "Wealth",      color: "#e3be45" },
  people:    { label: "Nation",      color: "#6fc28c" },
  science:   { label: "Science",     color: "#6fb6e0" },
  works:     { label: "Great works", color: "#d39a6a" },
  diplomacy: { label: "Diplomacy",   color: "#b48ce0" },
  power:     { label: "Power",       color: "#ef7c68" },
};
function addPrestige(g, nid, pts, cat, why) {
  const n = g.nations[nid];
  if (!n || !pts) return 0;
  const v = Math.round(pts * (pts > 0 && hasTrait(n, "ambitious") && (cat === "works" || why && why.startsWith("Ambition")) ? 1.25 : 1));
  n.prestige = (n.prestige || 0) + v;
  n.prestigeBy = n.prestigeBy || {};
  n.prestigeBy[cat] = (n.prestigeBy[cat] || 0) + v;
  n.prestigeLog = n.prestigeLog || [];
  n.prestigeLog.unshift({ turn: g.turn, pts: v, cat, why });
  if (n.prestigeLog.length > 40) n.prestigeLog.length = 40;
  return v;
}
function legacyRank(g, nid) {
  const live = liveNations(g).slice().sort((a, b) => (b.prestige || 0) - (a.prestige || 0));
  return { rank: live.findIndex(n => n.id === nid) + 1, of: live.length };
}

/* ---------- Timed effects on a nation: from decisions, ambitions and great works ----------
   Each: { key, label, until (turn it stops) or null, and any of: stab, output, growth, research, build, revenue,
   famineShield (0..1), noFast (no intensive mining) }. Effects stop once g.turn reaches `until`. */
function addNationMod(g, n, m, fromSeason) {
  if (!n) return;
  n.mods = (n.mods || []).filter(x => x.key !== m.key);
  const { seasons, ...rest } = m;
  n.mods.push({ ...rest, until: seasons ? g.turn + seasons + (fromSeason ? 1 : 0) : null });
}
function modSum(n, field) { let s = cabinetField(n, field); for (const m of (n && n.mods) || []) if (m[field]) s += m[field]; return s; }
function modFlag(n, field) { return ((n && n.mods) || []).some(m => m[field]); }
function pruneMods(g) {
  for (const n of g.nations) if (n.mods) n.mods = n.mods.filter(m => m.until === null || m.until > g.turn);
}

/* What a leader's character does for the nation they lead (the same for you and for your rivals). */
const TRAIT_EFFECTS = {
  aggressive:  "Armies attack 10% harder",
  cautious:    "Armies defend 10% harder",
  proud:       "+2 stability from national pride; apologizing costs more",
  pragmatic:   "New factories and mines cost 5% less",
  greedy:      "+5% tax revenue, but −2 stability",
  honorable:   "Every nation trusts their word: +5 opinion with all",
  paranoid:    "Sees threats everywhere: early warning of war plans, −1 stability",
  ambitious:   "+25% prestige from ambitions and great works",
  charismatic: "+4 stability",
  corrupt:     "−3 stability and 5% of taxes go missing",
  reformer:    "The economy modernizes faster",
};
function traitStabilityTerms(n) {
  const out = [];
  if (hasTrait(n, "proud")) out.push({ label: `${leaderName(n)}'s national pride`, value: 2 });
  if (hasTrait(n, "greedy")) out.push({ label: `${leaderName(n)}'s greed angers the people`, value: -2 });
  if (hasTrait(n, "paranoid")) out.push({ label: `${leaderName(n)}'s secret police`, value: -1 });
  return out;
}
/* Stability terms that come from this version's systems: timed effects, great works, the leader's character. */
function storyStabilityTerms(g, n) {
  const terms = [];
  for (const m of n.mods || []) if (m.stab) terms.push({ label: m.until !== null ? `${m.label} (until ${seasonLabel(m.until)})` : m.label, value: m.stab });
  terms.push(...traitStabilityTerms(n));
  terms.push(...workStabilityTerms(g, n));
  terms.push(...cityStabilityTerms(g, n));
  terms.push(...groupStabilityTerms(g, n));
  if (!n.leader && n.isPlayer) terms.push({ label: "No leader: the succession is undecided", value: -3 });
  return terms;
}

/* ---------- Deeds and epithets: "the Builder", "the Conqueror" ---------- */
const EPITHETS = [
  { key: "works",     need: 1, name: "the Builder",    why: "completed a great work" },
  { key: "conquered", need: 3, name: "the Conqueror",  why: "taken three towns" },
  { key: "ambitions", need: 3, name: "the Great",      why: "fulfilled three national ambitions" },
  { key: "growth",    need: 1, name: "the Prosperous", why: "doubled the nation's output" },
  { key: "techs",     need: 5, name: "the Wise",       why: "seen five great discoveries" },
  { key: "towns",     need: 4, name: "the Founder",    why: "founded four towns" },
  { key: "held",      need: 8, name: "the Shield",     why: "won eight defensive battles" },
  { key: "treaties",  need: 5, name: "the Peacemaker", why: "signed five treaties" },
];
function leaderDeed(g, nid, key, k = 1) {
  const n = g.nations[nid];
  if (!n || !n.alive || !n.leader) return;
  const L = n.leader;
  L.deeds = L.deeds || {};
  L.deeds[key] = (L.deeds[key] || 0) + k;
  if (L.epithet) return;
  const e = EPITHETS.find(x => x.key === key && L.deeds[key] >= x.need);
  if (!e) return;
  const before = leaderName(n);
  L.epithet = e.name; L.epithetWhy = e.why;
  const text = n.isPlayer ? `Your leader, ${before}, is now called ${L.name} ${e.name}, having ${e.why}.` : `${before} of the ${n.name} is now called ${L.name} ${e.name}, having ${e.why}.`;
  (g.epiNews = g.epiNews || []).push({ nid, text });
  addChronicle(g, text, "good", nid);
  addPrestige(g, nid, 5, "people", `${L.name} ${e.name}`);
}
function checkGrowthDeeds(w, g) {
  for (const n of liveNations(g)) {
    if (!n.leader) continue;
    const h = n.history[n.history.length - 1];
    if (!h) continue;
    if (n.leader.gdpStart === undefined) n.leader.gdpStart = h.gdp;
    if (!n.leader.grew && n.leader.gdpStart > 1 && h.gdp >= 2 * n.leader.gdpStart) { n.leader.grew = true; leaderDeed(g, n.id, "growth"); }
  }
}

/* The player's leader: chosen at random at founding; when they die or retire, you choose the successor. */
function playerLeader(g, rng) {
  const n = g.nations[PLAYER];
  n.leader = makeLeader(n, rng, g.turn, g);
  n.leader.gdpStart = n.history.length ? n.history[n.history.length - 1].gdp : undefined;
  return n.leader;
}
function successionCandidates(g, rng) {
  const n = g.nations[PLAYER];
  const out = [];
  const roles = ["the governing party's choice", "a popular general", "a reforming minister", "the opposition's leader", "a provincial governor", "a famous industrialist"].sort(() => rng() - 0.5);
  for (let k = 0; k < 12 && out.length < 3; k++) {
    const L = makeLeader(n, rng, g.turn, g);
    if (out.some(o => o.name === L.name || o.traits.join() === L.traits.join())) continue;
    L.age = 41 + Math.floor(rng() * 22);
    L.role = roles[out.length];
    out.push(L);
  }
  return out;
}
function playerLeaderGone(g, rng, old, how) {
  const n = g.nations[PLAYER];
  n.leader = null;
  const cands = successionCandidates(g, rng);
  const cap = g.cities.find(c => c.owner === PLAYER && c.capital);
  g.decisions.push({
    id: g.nextId++, key: "succession", nid: PLAYER, turn: g.turn, expires: g.turn + DECISION_SEASONS, cat: "Leader", icon: "crown", tone: "neutral",
    title: "Who will lead the nation?", cell: cap ? cap.cell : -1,
    body: `${old} has ${how}. The nation needs a new leader, and three candidates have come forward. Their character will shape everything from the army to the treasury.`,
    options: cands.map((L, i) => ({ id: "abc"[i], tag: "kind", label: `${L.title} ${L.name}, ${L.role}`, sub: `age ${L.age} · ${L.traits.map(t => LEADER_TRAITS[t].label.toLowerCase()).join(", ")}`, effects: [{ t: "successor", leader: L }] })),
    def: "a",
  });
  return { nid: PLAYER, text: `${old} has ${how}. Choose who leads the nation next.` };
}

