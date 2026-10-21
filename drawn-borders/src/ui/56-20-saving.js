/* =====================================================================
   20. Saving (this browser only) and boot
   ===================================================================== */
function serializeGame(g) {
  if (!g) return null;
  return {
    owner: Array.from(g.owner), pop: Array.from(g.pop, v => Math.round(v * 1e5) / 1e5), irrigated: Array.from(g.irrigated),
    roads: Array.from(g.roads), cities: g.cities, nations: g.nations, projects: g.projects, turn: g.turn,
    chronicle: g.chronicle, nextId: g.nextId, usedNames: Array.from(g.usedNames),
    occ: Array.from(g.occ), rel: g.rel, treaties: g.treaties, wars: g.wars, inbox: g.inbox.slice(-60), letters: g.letters,
    memory: g.memory, commitments: g.commitments, stats: g.stats, assembly: g.assembly || null,
    sites: g.sites, depLeft: Array.from(g.depLeft, v => Math.round(v * 1000) / 1000), known: Array.from(g.known), surveyed: Array.from(g.surveyed),
    forest: Array.from(g.forest, v => Math.round(v * 1000) / 1000), fish: Array.from(g.fish, v => Math.round(v * 1000) / 1000), cleared: g.cleared,
    prices: g.prices, priceShock: g.priceShock, priceHist: g.priceHist, lastLetter: g.lastLetter, ver: g.ver,
    divisions: g.divisions, airwings: g.airwings, battles: g.battles, extraDeposits: g.extraDeposits || [],
    story: g.story, decisions: g.decisions, amb: g.amb, works: g.works, firsts: g.firsts, era: g.era || 0, intel: g.intel || {},
    sea: g.sea || null, trade: g.trade || null, opening: g.opening || null, cabSalt: g.cabSalt, topCity: g.topCity, depth: 1,
  };
}
function deserializeGame(s) {
  const g = {
    owner: Int8Array.from(s.owner), pop: Float32Array.from(s.pop), irrigated: Uint8Array.from(s.irrigated),
    roads: new Set(s.roads), cities: s.cities, nations: s.nations, projects: s.projects, turn: s.turn,
    chronicle: s.chronicle, nextId: s.nextId, usedNames: new Set(s.usedNames),
    occ: s.occ ? Int8Array.from(s.occ) : new Int8Array(N_CELLS).fill(-1),
    rel: s.rel || {}, treaties: s.treaties || [], wars: s.wars || [], inbox: s.inbox || [], letters: s.letters || [],
    memory: s.memory || {}, commitments: s.commitments || [], stats: s.stats || { warsStarted: {} }, lastLetter: s.lastLetter || {}, ver: (s.ver || 0) + 1,
    divisions: s.divisions || [], airwings: s.airwings || [], battles: s.battles || [], extraDeposits: s.extraDeposits || [],
  };
  g.assembly = s.assembly || null;
  g.sites = s.sites || []; g.cleared = s.cleared || [];
  g.depLeft = Float32Array.from(s.depLeft || []); g.known = Uint16Array.from(s.known || []); g.surveyed = Uint16Array.from(s.surveyed || []);
  g.forest = Float32Array.from(s.forest || []); g.fish = Float32Array.from(s.fish || []);
  g.prices = s.prices || { timber: 1, metals: 1, coal: 1, oil: 1, gold: 1 }; g.priceShock = s.priceShock || {}; g.priceHist = s.priceHist || [];
  g.story = { last: -99, lastTone: null, recent: {}, queue: [], past: [], vets: [], ...(s.story || {}) };
  g.decisions = s.decisions || []; g.works = s.works || {}; g.firsts = s.firsts || {}; g.era = s.era || 0; g.intel = s.intel || {};
  g.amb = { offers: [], active: [], log: [], offersTurn: -1, ...(s.amb || {}) };
  g.sea = s.sea || null;
  if (g.sea) seaState(g);
  g.trade = s.trade || null;
  if (g.trade) ensureTrade(g);
  // kept since v37 (they were lost on every reload before): the neighbour's opening claim, the ministers' salt, the top city
  if (s.opening) g.opening = s.opening;
  if (s.cabSalt !== undefined) g.cabSalt = s.cabSalt;
  if (s.topCity !== undefined) g.topCity = s.topCity;
  for (const c of g.cities) if (c.port && !c.portLvl) c.portLvl = 1;
  if (g.assembly) for (const t of g.assembly.topics) for (const m of t.msgs) if (m.pending) { m.pending = false; if (!m.text) m.text = m.fallback; }
  for (const L of g.letters) if (L.status !== "done") { L.status = "done"; L.reply = L.reply || "(The reply was lost when the page closed. Their decision still stands.)"; }
  for (const n of g.nations) {
    n.lastAsked = n.lastAsked || {}; n.lastWarned = n.lastWarned || {}; if (n.lastLawTurn === undefined) n.lastLawTurn = -99;
    n.laws.arms = n.laws.arms || (n.archetype ? ARCHETYPES[n.archetype].laws.arms : "medium");
    n.recentLosses = n.recentLosses || 0;
    const pref = n.archetype ? ARCHETYPES[n.archetype].laws : { education: "basic", research: "low", trade: "balanced", finance: "balanced" };
    for (const k of ["education", "research", "trade", "finance"]) n.laws[k] = n.laws[k] || pref[k];
    if (n.skill === undefined) n.skill = 0.36;
    n.techs = n.techs || {}; n.research = n.research || { target: null, progress: 0, queue: [] };
    if (n.capital === undefined) n.capital = 0;
    n.buildAvg = n.buildAvg || 0; n.armsAvg = n.armsAvg || 0; n.buildSpend = n.buildSpend || 0;
    if (n.crisisUntil === undefined) n.crisisUntil = -1;
    n.freighters = n.freighters || 0;
    n.navyUpkeep = g.sea ? navyUpkeep(g, n.id) : 0;
    n.laws.granary = n.laws.granary || (n.archetype ? ARCHETYPES[n.archetype].laws.granary : "small");
    if (!n.cabinet) initCabinet(g, n, mulberry32(n.id * 97 + 5));
    if (!n.granary) { const hp = n.history && n.history.length ? n.history[n.history.length - 1].pop || 0 : 0; n.granary = { stock: hp * granaryMonths(n.laws) / 12 * 0.5 }; }   // saves from before the reserve: half full
  }
  // saves from before experience mattered: standing divisions count as trained troops
  if (!s.depth) for (const d of g.divisions) if (!d.training && (d.exp || 0) < EXPS.start) d.exp = EXPS.start;
  return g;
}
function restore(saved) {
  const ok = isSaveData(saved);
  newWorld(ok && saved.seed ? saved.seed : randomSeed());
  ui.gameId = ok ? saveGameId(saved) : null;
  if (!ok) return;
  ui.name = saved.name || "";
  if (saved.game && (saved.phase === "play" || saved.phase === "collapsed")) {
    game = deserializeGame(saved.game);
    for (const [cell, type] of game.extraDeposits) { world.dep[cell] = type; world.hid[cell] = 0; setDepositSize(world, cell, type, false); }
    for (const c of game.cleared || []) world.terrain[c] = T.PLAINS;
    if (!game.cities.some(c => c.ind)) for (const n of game.nations) if (n.alive) seedIndustries(world, game, n);   // saves from before industry existed
    for (const n of game.nations) if (n.alive && !n.stock) initMilitary(world, game, n);   // saves from before armies existed
    if (game.nations[PLAYER] && game.nations[PLAYER].alive && game.nations[PLAYER].leader === undefined) playerLeader(game, mulberry32(world.seed * 977 + game.turn));   // saves from before you had a leader
    if (!saved.game.sea) seaMigrate(world, game);   // saves from before the sea: busy harbors count as ports, so no trade is lost
    if (saved.game && !saved.game.firsts) {   // saves from before world firsts: record what had already happened, quietly
      const sink = { firsts: [], warnings: [] };
      checkFirsts(world, game, sink);
      while (worldEra(game) > (game.era || 0)) checkFirsts(world, game, sink);
    }
    refreshCities(world, game, { init: !saved.game.cities.some(c => c.imp !== undefined) });
    for (const n of game.nations) if (n.alive) ensureGroups(world, game, n);
    if (!saved.game.trade) tradeMigrate(world, game);   // saves from before trade between nations: merchants sign their first contracts, quietly
    ui.phase = saved.phase;
  } else if (Array.isArray(saved.drawCells)) {
    applyClaimResult({ ok: true, cells: saved.drawCells, droppedCells: 0 });
  }
}

