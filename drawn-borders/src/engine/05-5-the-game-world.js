/* =====================================================================
   5. The game world: ownership, people, roads, cities
   ===================================================================== */
function edgeKey(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }
function edgeEnds(k) { return k.split("-").map(Number); }

function emptyGame(w) {
  const g = {
    owner: new Int8Array(N_CELLS).fill(-1),
    pop: new Float32Array(N_CELLS),
    irrigated: new Uint8Array(N_CELLS),
    roads: new Set(),
    cities: [],
    nations: [],
    projects: [],
    turn: 0,
    chronicle: [],
    nextId: 1,
    usedNames: new Set(),
    occ: new Int8Array(N_CELLS).fill(-1),     // which nation's army holds a cell, or -1
    rel: {}, treaties: [], wars: [], inbox: [], letters: [], memory: {}, commitments: [],
    stats: { warsStarted: {} }, lastLetter: {}, ver: 0,
    divisions: [], airwings: [], battles: [],
    story: { last: -99, lastTone: null, recent: {}, queue: [], past: [], vets: [] }, decisions: [],
    amb: { offers: [], active: [], log: [], offersTurn: -1 }, works: {}, firsts: {}, era: 0, intel: {},
    sea: null,
  };
  for (let i = 0; i < N_CELLS; i++) g.pop[i] = cellDensity(w, i) * BUILD.wildPopShare;
  initNature(w, g);
  return g;
}

function uniqueName(g, rng) {
  for (let k = 0; k < 200; k++) {
    const n = pick(rng, NAME_HEADS) + pick(rng, NAME_TAILS);
    if (!g.usedNames.has(n)) { g.usedNames.add(n); return n; }
  }
  return `New Town ${g.usedNames.size + 1}`;
}

function foodWithin(w, g, cell, r, owners) {
  let food = 0;
  const cx = cellX(cell), cy = cellY(cell), R = Math.ceil(r);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = cx + dx, y = cy + dy;
    if (!inBounds(x, y) || dx * dx + dy * dy > r * r) continue;
    const i = idx(x, y);
    if (owners && !owners.has(g.owner[i])) continue;
    food += cellFood(w, g, i);
  }
  return food;
}

/* Place a capital near the middle and towns on the best farmland, spread apart. */
function placeTowns(w, g, nid, cells, rng) {
  const mx = cells.reduce((s, c) => s + cellX(c), 0) / cells.length;
  const my = cells.reduce((s, c) => s + cellY(c), 0) / cells.length;
  const own = new Set([nid]);
  const water = c => (portSeaCell(w, c) >= 0 ? 1.2 : 0) + (riverGeo(w).nav[c] >= 0 ? 0.6 : 0);
  const score = c => foodWithin(w, g, c, 2.2, own) + water(c);
  let capital = cells[0], best = -Infinity;
  for (const c of cells) {
    const s = score(c) - 0.35 * Math.hypot(cellX(c) - mx, cellY(c) - my);
    if (s > best) { best = s; capital = c; }
  }
  const sites = [capital];
  const count = clamp(Math.floor(cells.length / 40), 2, 5);
  while (sites.length < count) {
    let pickCell = -1, pickScore = -Infinity;
    for (const c of cells) {
      const nearest = Math.min(...sites.map(s => dist(s, c)));
      if (nearest < 5) continue;
      const s = score(c) + 0.25 * Math.min(nearest, 10);
      if (s > pickScore) { pickScore = s; pickCell = c; }
    }
    if (pickCell < 0) break;
    sites.push(pickCell);
  }
  sites.forEach((cell, k) => g.cities.push({ id: g.nextId++, owner: nid, cell, name: uniqueName(g, rng), capital: k === 0, port: false, irrigated: false, founded: 0, origin: nid, loyalty: CITY.loyalNative, mood: CITY.moodBase, hist: [] }));
}

function settleCells(w, g, nid, cells) {
  for (const c of cells) { g.owner[c] = nid; g.pop[c] = cellDensity(w, c); }
}

function distanceField(w, sources) {
  const d = new Float32Array(N_CELLS).fill(Infinity);
  const queue = [];
  for (const s of sources) { d[s] = 0; queue.push(s); }
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi];
    for (const [dx, dy] of DIRS4) {
      const x = cellX(c) + dx, y = cellY(c) + dy;
      if (!inBounds(x, y)) continue;
      const k = idx(x, y);
      if (!isLand(w, k) || d[k] !== Infinity) continue;
      d[k] = d[c] + 1;
      queue.push(k);
    }
  }
  return d;
}

/* Grow a rival territory outward from its capital over free land. */
function growTerritory(w, g, seedCell, targetFood, maxArea, blocked) {
  const cells = [seedCell];
  const taken = new Set(cells);
  const frontier = [seedCell];
  let food = cellFood(w, g, seedCell);
  while (food < targetFood && cells.length < maxArea && frontier.length) {
    let bestK = 0, bestD = Infinity;
    for (let fi = 0; fi < frontier.length; fi++) {
      const d = dist(frontier[fi], seedCell);
      if (d < bestD) { bestD = d; bestK = fi; }
    }
    const c = frontier.splice(bestK, 1)[0];
    for (const [dx, dy] of DIRS4) {
      const x = cellX(c) + dx, y = cellY(c) + dy;
      if (!inBounds(x, y)) continue;
      const k = idx(x, y);
      if (taken.has(k) || !isLand(w, k) || g.owner[k] !== -1 || blocked(k)) continue;
      taken.add(k); cells.push(k); frontier.push(k);
      food += cellFood(w, g, k);
      if (food >= targetFood) break;
    }
  }
  return cells;
}

/* ---------- Leaders: every government has a face, a temper and an age ---------- */
const LEADER_TRAITS = {
  aggressive:  { label: "Aggressive",  mod: { aggression: 0.35, caution: -0.15 }, clash: "cautious", note: "quick to reach for the sword" },
  cautious:    { label: "Cautious",    mod: { caution: 0.4, aggression: -0.2 }, clash: "aggressive", note: "weighs every risk twice" },
  proud:       { label: "Proud",       mod: { pride: 0.45 }, clash: "pragmatic", note: "never forgives an insult" },
  pragmatic:   { label: "Pragmatic",   mod: { pride: -0.3, tradeWeight: 0.3 }, clash: "proud", note: "cares about results, not honor" },
  greedy:      { label: "Greedy",      mod: { moneyWeight: 0.45 }, clash: "honorable", note: "can be bought" },
  honorable:   { label: "Honorable",   mod: {}, clash: "corrupt", note: "keeps every treaty signed" },
  paranoid:    { label: "Paranoid",    mod: { caution: 0.2 }, note: "sees threats everywhere" },
  ambitious:   { label: "Ambitious",   mod: { landWeight: 0.35, aggression: 0.15 }, note: "wants a bigger country" },
  charismatic: { label: "Charismatic", mod: {}, clash: "corrupt", note: "loved by the people (+4 stability)" },
  corrupt:     { label: "Corrupt",     mod: { moneyWeight: 0.2 }, clash: "honorable", note: "skims the treasury (−5% tax, −3 stability)" },
  reformer:    { label: "Reformer",    mod: {}, note: "modernizes the economy (faster growth)" },
};
const LEADER_FIRST = {
  m: ["Aldric", "Teodor", "Kasimir", "Ruven", "Doran", "Matthias", "Oren", "Corin", "Halvar", "Emeric", "Joran", "Viktor", "Ansel", "Lucan", "Bastian", "Edvin", "Tomas", "Radek", "Severin", "Iskander"],
  f: ["Mira", "Selene", "Ilsa", "Yara", "Lis", "Sabine", "Vesna", "Nadia", "Ines", "Petra", "Talia", "Rhea", "Mirela", "Zora", "Liesel", "Anka", "Dalia", "Orsolya", "Katrin", "Elodie"],
};
const LEADER_LAST = ["Vardane", "Holm", "Kessler", "Marov", "Orsini", "Tallis", "Brand", "Veyne", "Castell", "Dragan", "Ilves", "Moreau", "Strand", "Kovac", "Lindqvist", "Avesta", "Rourke", "Baskov", "Ferro", "Halden", "Novak", "Szabo", "Wren", "Asker"];
const LEADER_TITLES = {
  militarist: { m: "Marshal", f: "Marshal" }, expansionist: { m: "Emperor", f: "Empress" },
  mercantile: { m: "Chancellor", f: "Chancellor" }, agrarian: { m: "King", f: "Queen" },
  minor_mercantile: { m: "Doge", f: "Dogaressa" }, minor_agrarian: { m: "Prince", f: "Princess" },
};

function makeLeader(n, rng, turn, g) {
  const sex = rng() < 0.5 ? "m" : "f";
  const taken = new Set(g ? g.nations.filter(z => z.leader).flatMap(z => z.leader.name.split(" ")) : []);
  let name = "";
  for (let k = 0; k < 12; k++) {
    const first = pick(rng, LEADER_FIRST[sex]), last = pick(rng, LEADER_LAST);
    name = `${first} ${last}`;
    if (!taken.has(first) && !taken.has(last)) break;
  }
  const titles = LEADER_TITLES[n.minor ? `minor_${n.archetype}` : n.archetype] || { m: "President", f: "President" };
  const keys = Object.keys(LEADER_TRAITS);
  const traits = [];
  while (traits.length < 2) {
    const t = pick(rng, keys);
    if (traits.includes(t) || traits.some(x => LEADER_TRAITS[x].clash === t || LEADER_TRAITS[t].clash === x)) continue;
    traits.push(t);
  }
  return { name, title: titles[sex], sex, age: 38 + Math.floor(rng() * 26), traits, since: turn };
}
function leaderName(n) { return n.leader ? `${n.leader.title} ${n.leader.name}${n.leader.epithet ? ` ${n.leader.epithet}` : ""}` : null; }
function hasTrait(n, t) { return !!(n && n.leader && n.leader.traits.includes(t)); }

/* Old leaders die or retire; a successor brings new habits, and old grudges soften. */
function ageLeaders(g, rng) {
  const news = [];
  for (const n of liveNations(g)) {
    if (!n.leader) continue;
    n.leader.age += 0.25;
    const chance = n.leader.age > 64 ? (n.leader.age - 62) * 0.005 : 0.001;
    if (rng() >= chance) continue;
    const old = leaderName(n);
    const how = n.leader.age > 70 && rng() < 0.5 ? "retired" : "died";
    if (n.isPlayer) { news.push(playerLeaderGone(g, rng, old, how)); continue; }
    n.leader = makeLeader(n, rng, g.turn, g);
    for (const z of g.nations) if (z.id !== n.id) { const r = rel(g, n.id, z.id); r.mods.forEach(m => { m.value *= 0.7; }); r.trust += (50 - r.trust) * 0.3; }
    const text = `${old} of the ${n.name} ${how}. ${leaderName(n)} (${n.leader.traits.map(t => LEADER_TRAITS[t].label.toLowerCase()).join(", ")}) now leads.`;
    news.push({ nid: n.id, text });
    remember(g, n.id, `${old} ${how}; ${leaderName(n)} took power.`);
  }
  return news;
}

/* ---------- Placing many nations: great powers first, then small city-states in the gaps ---------- */
const MAJOR_RIVALS = 4, MINOR_STATES = 4;
const MINOR_TITLES = { mercantile: base => `Free City of ${base}`, agrarian: base => `Principality of ${base}` };

function chooseArchetypes(rng, count) {
  const keys = Object.keys(ARCHETYPES);
  const out = [];
  const bag = [];
  while (out.length < count) {
    if (!bag.length) bag.push(...keys.slice().sort(() => rng() - 0.5));
    out.push(bag.pop());
  }
  return out;
}

function placeRival(w, g, rng, fromPlayer, capitals, minDist, foodTarget, minor) {
  const fromOthers = capitals.length ? distanceField(w, capitals) : null;
  let bestCell = -1, bestScore = -Infinity;
  for (let i = 0; i < N_CELLS; i++) {
    if (!isLand(w, i) || g.owner[i] !== -1 || fromPlayer[i] === Infinity || fromPlayer[i] < (minor ? 5 : 6)) continue;
    if (fromOthers && fromOthers[i] < minDist) continue;
    if (minor && distanceToAnyOwner(g, i) < 4) continue;
    const spread = fromOthers ? Math.min(fromOthers[i], fromPlayer[i]) : fromPlayer[i];
    const s = Math.min(spread, minor ? 12 : 22) + foodWithin(w, g, i, 3, null) * (minor ? 0.6 : 1) + (minor && w.coastal[i] ? 2 : 0) + (minor ? 0 : 3 * Math.max(0, 1 - seaGeo(w).coastDist[i] / 5));
    if (s > bestScore) { bestScore = s; bestCell = i; }
  }
  if (bestCell < 0) return null;
  const cells = growTerritory(w, g, bestCell, foodTarget, maxCells(w), k => fromPlayer[k] < 3 || (g.owner[k] !== -1));
  return cells.length >= (minor ? 4 : 12) ? { capital: bestCell, cells } : null;
}
function distanceToAnyOwner(g, cell) {
  let best = Infinity;
  const cx = cellX(cell), cy = cellY(cell);
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
    const x = cx + dx, y = cy + dy;
    if (!inBounds(x, y)) continue;
    if (g.owner[idx(x, y)] >= 0) best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

function makeNation(id, name, archetype, traits, isPlayer) {
  const laws = { ...labourDefaults(), ...(archetype ? { ...ARCHETYPES[archetype].laws } : { tax: 25, services: "basic", army: "standard", arms: "low", education: "basic", research: "low", trade: "balanced", finance: "balanced", granary: "small" }) };
  return {
    id, name, isPlayer, archetype, color: NATION_COLORS[id], laws,
    treasury: 0, soldiers: 0, tech: 1, stability: traits.stability, baseStability: traits.base,
    defense: traits.defense, lastGdpPerCap: 0, alive: true, history: [], feed: [],
    plan: "", lastWarned: {}, lastLosses: 0, recentLosses: 0, lastAsked: {}, lastLawTurn: -99,
    skill: archetype === "mercantile" ? 0.42 : archetype === "agrarian" ? 0.3 : 0.36, techs: {}, research: { target: null, progress: 0, queue: [] }, capital: 0, market: null, buildAvg: 0, armsAvg: 0, buildSpend: 0, crisisUntil: -1,
  };
}

function setupGame(w, playerCells, playerName, seed) {
  const rng = mulberry32(seed * 31 + 7);
  const g = emptyGame(w);
  settleCells(w, g, PLAYER, playerCells);
  g.nations.push(makeNation(PLAYER, playerName, null, shapeTraits(w, playerCells), true));
  g.nations[PLAYER].leader = makeLeader(g.nations[PLAYER], mulberry32(seed * 977 + 13), 0, g);
  placeTowns(w, g, PLAYER, playerCells, rng);

  const fromPlayer = distanceField(w, playerCells);
  const playerFood = playerCells.reduce((s, c) => s + cellFood(w, g, c), 0);
  const archetypes = chooseArchetypes(rng, MAJOR_RIVALS);
  const warlike = archetypes.findIndex(a => a === "militarist" || a === "expansionist");
  if (warlike > 0) [archetypes[0], archetypes[warlike]] = [archetypes[warlike], archetypes[0]];
  const capitals = [];
  const addRival = (placed, archetype, minor) => {
    const rid = g.nations.length;
    settleCells(w, g, rid, placed.cells);
    const base = uniqueName(g, rng);
    const name = minor ? MINOR_TITLES[archetype](base) : ARCHETYPES[archetype].title(base);
    const n = makeNation(rid, name, archetype, shapeTraits(w, placed.cells), false);
    n.minor = minor;
    g.nations.push(n);
    n.leader = makeLeader(n, rng, 0, g);
    placeTowns(w, g, rid, placed.cells, rng);
    if (minor) g.cities = g.cities.filter(c => c.owner !== rid || c.capital);
    const own = g.cities.filter(c => c.owner === rid);
    for (let k = 1; k < own.length; k++) {
      const path = findRoadPath(w, g, rid, own[0].cell, own[k].cell);
      if (path && k < 3) pathEdges(path).forEach(e => g.roads.add(e));
    }
  };
  for (let r = 0; r < MAJOR_RIVALS; r++) {
    const foodTarget = playerFood * (0.8 + rng() * 0.35);
    const placed = (r === 0 && placeNeighbor(w, g, rng, fromPlayer, foodTarget)) || placeRival(w, g, rng, fromPlayer, capitals, 12, foodTarget, false);
    if (!placed) break;
    capitals.push(placed.capital);
    addRival(placed, archetypes[r], false);
  }
  for (let r = 0; r < MINOR_STATES; r++) {
    const placed = placeRival(w, g, rng, fromPlayer, capitals, 7, playerFood * (0.16 + rng() * 0.1), true);
    if (!placed) break;
    capitals.push(placed.capital);
    addRival(placed, rng() < 0.55 ? "mercantile" : "agrarian", true);
  }

  for (const n of g.nations) {
    const econ = computeEconomy(w, g, n.id);
    n.treasury = econ.gdp * ECON.startTreasuryShare;
    n.granary = { stock: econ.pop * granaryMonths(n.laws) / 12 * GRAN.startShare };
    seedIndustries(w, g, n);
    n.market = { ...computeEconomy(w, g, n.id).sat };
    initMilitary(w, g, n);
    n.lastGdpPerCap = computeEconomy(w, g, n.id).gdp / econ.pop;
    n.history.push(historyEntry(n, econ, 0, g));
  }
  initCabinets(g, mulberry32(seed * 53 + 5));
  setupOpening(w, g);
  refreshCities(w, g, { init: true });
  for (const n of g.nations) ensurePeople(w, g, n);
  for (const n of g.nations) if (n.alive) ensureGroups(w, g, n);
  tradeMigrate(w, g);   // the first contracts between nations (10s)
  return g;
}

