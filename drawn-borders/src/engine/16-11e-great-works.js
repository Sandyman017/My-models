/* =====================================================================
   11e. Great works, world firsts, eras, and what your neighbors' generals are planning
   Borrowed ideas: Civilization (wonders only one nation can build: a race; "historic moments"; eras),
   Humankind (fame for being first), Into the Breach (the enemy's intentions are shown, so no attack is unfair).
   ===================================================================== */

/* ---------- Rivers, shared by the map painter and the rules (a dam needs a real river) ---------- */
function riverField(w) {
  if (w._rivers && w._rivers.seed === w.seed) return w._rivers;
  const R = 4, GW = GRID_W * R, GH = GRID_H * R, N = GW * GH, L = w.seaLevel, seed = w.seed;
  const h = new Float32Array(N), land = new Uint8Array(N);
  for (let py = 0; py < GH; py++) for (let px = 0; px < GW; px++) {
    const x = (px + 0.5) / R, y = (py + 0.5) / R, p = py * GW + px;
    h[p] = elevationAt(seed, x, y) + 0.03 * (fbm(x * 1.9, y * 1.9, seed + 333, 3) - 0.5);
    const gx = Math.floor(x), gy = Math.floor(y);
    land[p] = h[p] > L && gx >= 1 && gy >= 1 && gx < GRID_W - 1 && gy < GRID_H - 1 ? 1 : 0;
  }
  // priority flood from the coast: every land pixel finds its way down to the sea
  const heapK = new Float32Array(N), heapV = new Int32Array(N);
  let hn = 0;
  const push = (v, key) => { let i = hn++; while (i > 0) { const pa = (i - 1) >> 1; if (heapK[pa] <= key) break; heapK[i] = heapK[pa]; heapV[i] = heapV[pa]; i = pa; } heapK[i] = key; heapV[i] = v; };
  const pop = () => {
    const v = heapV[0], lk = heapK[--hn], lv = heapV[hn];
    let i = 0;
    while (true) { let c = 2 * i + 1; if (c >= hn) break; if (c + 1 < hn && heapK[c + 1] < heapK[c]) c++; if (heapK[c] >= lk) break; heapK[i] = heapK[c]; heapV[i] = heapV[c]; i = c; }
    heapK[i] = lk; heapV[i] = lv;
    return v;
  };
  const filled = new Float32Array(N), down = new Int32Array(N).fill(-1), order = new Int32Array(N), done = new Uint8Array(N);
  let oc = 0;
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let p = 0; p < N; p++) if (!land[p]) { done[p] = 1; filled[p] = L; const px = p % GW, py = (p / GW) | 0; if (NB.some(([dx, dy]) => { const qx = px + dx, qy = py + dy; return qx >= 0 && qy >= 0 && qx < GW && qy < GH && land[qy * GW + qx]; })) push(p, L); }
  while (hn) {
    const p = pop(), px = p % GW, py = (p / GW) | 0;
    for (const [dx, dy] of NB) {
      const qx = px + dx, qy = py + dy;
      if (qx < 0 || qy < 0 || qx >= GW || qy >= GH) continue;
      const q = qy * GW + qx;
      if (done[q]) continue;
      done[q] = 1;
      filled[q] = Math.max(h[q], filled[p] + 1e-6);
      down[q] = p;
      order[oc++] = q;
      push(q, filled[q]);
    }
  }
  // rain gathers downstream
  const acc = new Float32Array(N);
  for (let p = 0; p < N; p++) if (land[p]) acc[p] = 0.4 + moistureAt(seed, ((p % GW) + 0.5) / R, (((p / GW) | 0) + 0.5) / R);
  for (let i = oc - 1; i >= 0; i--) { const q = order[i]; if (down[q] >= 0 && land[down[q]]) acc[down[q]] += acc[q]; }
  // each map cell: the size of the biggest river crossing it (0 none, 1 stream … 4 great river)
  const cells = new Uint8Array(N_CELLS);
  for (let p = 0; p < N; p++) {
    if (!land[p] || acc[p] < 75) continue;
    const cls = acc[p] < 190 ? 1 : acc[p] < 520 ? 2 : acc[p] < 1400 ? 3 : 4;
    const i = idx(Math.floor((p % GW) / R), Math.floor(((p / GW) | 0) / R));
    if (cls > cells[i]) cells[i] = cls;
  }
  w._rivers = { seed, R, GW, GH, N, land, down, acc, cells };
  return w._rivers;
}
function riverCells(w) { return riverField(w).cells; }

/* ---------- The great works ---------- */
const WORKS = {
  dam: {
    label: "Great Dam", inspired: "the Hoover Dam", seasons: 10, cost: 28, prestige: 40, bound: true,
    does: "A wall of concrete across a mountain river: electricity for the nation and water for the fields below.",
    gives: "+2.5 electricity a year; farms of towns within 6 cells grow 12% more food",
  },
  railway: {
    label: "Transcontinental Railway", inspired: "the Union Pacific and the Trans-Siberian", seasons: 12, cost: 17, prestige: 40, bound: false,
    does: "Steel rails from one end of the nation to the other.",
    gives: "The capital's market reaches 25% further; hauling ore and timber costs half; logistics +15 points",
  },
  harbor: {
    label: "Grand Harbor", inspired: "the Port of Rotterdam", seasons: 8, cost: 21, prestige: 30, bound: true,
    does: "Deep docks, cranes and warehouses for the ships of the whole world.",
    gives: "Imports and exports +30 points of capacity; services in the harbor town +8%",
  },
  academy: {
    label: "National Academy of Sciences", inspired: "the Royal Society", seasons: 10, cost: 17, prestige: 35, bound: false,
    does: "The best minds of the nation, working under one roof.",
    gives: "Research +25%; workforce skill rises 4 points higher",
  },
  exchange: {
    label: "Stock Exchange", inspired: "the London and New York stock exchanges", seasons: 8, cost: 21, prestige: 30, bound: false,
    does: "Where the nation's savings meet its businesses.",
    gives: "Private investment +30%; borrowing costs 1 point less; services +3%",
  },
  fair: {
    label: "World's Fair", inspired: "the Great Exhibition of 1851", seasons: 6, cost: 17, prestige: 45, bound: false,
    does: "Palaces of glass and iron, and the whole world comes to see what we can make.",
    gives: "On opening: every nation's opinion of you +12, and +4 stability for 12 seasons. Visitors keep coming: services in the capital +4%",
  },
  forts: {
    label: "Line of Fortresses", inspired: "the Maginot Line", seasons: 10, cost: 30, prestige: 25, bound: true,
    does: "Concrete forts, bunkers and tunnels along the border with a dangerous neighbor.",
    gives: "Your armies defend 30% harder in your border lands; rivals think twice before attacking",
  },
  monument: {
    label: "National Monument", inspired: "the Statue of Liberty and the Eiffel Tower", seasons: 8, cost: 22, prestige: 30, bound: true,
    does: "A symbol of the nation that every child knows by heart.",
    gives: "+4 stability, for as long as it stands",
  },
  broadcast: {
    label: "National Broadcasting Tower", inspired: "the Berlin TV tower", seasons: 8, cost: 17, prestige: 30, bound: false,
    does: "One voice that reaches every home in the nation, and far across its borders.",
    gives: "+2 stability; other nations warm to your films and radio (+3 opinion)",
  },
  atomic: {
    label: "Atomic Project", inspired: "the Manhattan Project", seasons: 16, cost: 60, prestige: 70, bound: true,
    does: "Hidden laboratories in the wilderness, building the most powerful weapon ever made.",
    gives: "Rivals weigh any war against you far more carefully (−25 to their war plans)",
  },
};
const WORK_ORDER = ["monument", "harbor", "dam", "railway", "fair", "academy", "exchange", "broadcast", "forts", "atomic"];
const WORK_TASTE = {
  militarist:   { forts: 1.8, atomic: 2, monument: 1.1, railway: 1.1, fair: 0.6, exchange: 0.7 },
  mercantile:   { exchange: 1.8, harbor: 1.6, fair: 1.6, broadcast: 1.2, academy: 1.2, forts: 0.6, atomic: 0.6 },
  agrarian:     { dam: 1.8, monument: 1.2, academy: 1.1, forts: 0.8, atomic: 0.5 },
  expansionist: { railway: 1.8, dam: 1.2, forts: 1.2, monument: 1.2, atomic: 1.3 },
};

function workState(g, key) { return g.works[key] || (g.works[key] = { owner: null, done: null, cell: -1, builders: {} }); }
/* Who enjoys a finished work: bound works belong to whoever holds the land they stand on. */
function workHolder(g, key) {
  const W = g.works[key];
  if (!W || W.owner === null || W.owner === undefined) return -1;
  if (WORKS[key].bound && W.cell >= 0) {
    const o = g.owner[W.cell];
    return o >= 0 && g.occ[W.cell] < 0 && g.nations[o] && g.nations[o].alive ? o : -1;
  }
  return g.nations[W.owner] && g.nations[W.owner].alive ? W.owner : -1;
}
function worldAvgGdp(w, g) {
  const live = liveNations(g).filter(n => !n.minor);
  if (!live.length) return 300;
  return live.reduce((s, n) => s + ((n.history[n.history.length - 1] || {}).gdp || 0), 0) / live.length;
}
function workCost(w, g, key) { return Math.round(WORKS[key].cost * clamp(worldAvgGdp(w, g) / 400, 0.8, 4) * 2) / 2; }

/* Where a work can stand, or why it cannot be built yet. */
function workReq(w, g, nid, key, econ) {
  const n = g.nations[nid];
  const e = econ || computeEconomy(w, g, nid);
  const fail = why => ({ ok: false, why });
  if (!e.cities.length) return fail("You hold no towns.");
  const capital = e.cities.find(c => c.capital) || e.cities[0];
  const held = i => g.owner[i] === nid && g.occ[i] < 0;
  switch (key) {
    case "dam": {
      const rv = riverCells(w);
      let best = -1, bs = 0;
      for (let i = 0; i < N_CELLS; i++) {
        if (!held(i) || rv[i] < 2) continue;
        const t = w.terrain[i];
        let rough = t === T.HILLS || t === T.MOUNTAIN ? 1 : 0;
        if (!rough) for (const [dx, dy] of DIRS4) { const x = cellX(i) + dx, y = cellY(i) + dy; if (inBounds(x, y) && [T.HILLS, T.MOUNTAIN].includes(w.terrain[idx(x, y)])) rough = 0.6; }
        if (!rough || (rv[i] < 3 && rough < 1)) continue;
        const towns = e.cities.filter(c => dist(c.cell, i) <= 6).length;
        const sc = rough * rv[i] * (1 + towns);
        if (towns && sc > bs) { bs = sc; best = i; }
      }
      return best >= 0 ? { ok: true, cell: best } : fail("Needs a big river running through hills or mountains in your land, near your towns.");
    }
    case "railway": {
      const joined = e.regions.filter(r => e.networks[r.net].capital).map(r => r.city);
      let span = 0;
      for (const a of joined) for (const b of joined) span = Math.max(span, dist(a.cell, b.cell));
      if (joined.length < 5) return fail(`Needs at least 5 towns joined to the capital by road (you have ${joined.length}).`);
      if (span < 24) return fail(`Your road network must stretch at least 24 cells end to end (yours: ${Math.round(span)}).`);
      return { ok: true, cell: capital.cell };
    }
    case "harbor": {
      const ports = e.cities.filter(c => c.port).sort((a, b) => (regionOf(e, b.id) || { pop: 0 }).pop - (regionOf(e, a.id) || { pop: 0 }).pop);
      return ports.length ? { ok: true, cell: ports[0].cell } : fail("Needs a town with a port.");
    }
    case "academy": {
      if (EDU_ORDER.indexOf(n.laws.education || "basic") < 2) return fail("Needs good or excellent education.");
      if (!(e.levels.university > 0)) return fail("Needs a working university in one of your towns.");
      return { ok: true, cell: capital.cell };
    }
    case "exchange": return hasTech(n, "finance") ? { ok: true, cell: capital.cell } : fail("Needs the Modern finance technology.");
    case "fair": {
      const avg = worldAvgGdp(w, g);
      if (e.gdp < 1.15 * avg) return fail(`Needs an economy at least 15% bigger than the average great power (${fmtMoney(1.15 * avg)} a year).`);
      if (enemiesOf(g, nid).length) return fail("Cannot be held during a war.");
      if (!g.treaties.some(t => t.type === "trade" && (t.a === nid || t.b === nid))) return fail("Needs at least one trade partner to send visitors.");
      return { ok: true, cell: capital.cell };
    }
    case "forts": {
      const big = liveNations(g).filter(z => z.id !== nid && !z.minor && sharesBorder(g, nid, z.id)).sort((a, b) => armyPower(g, b.id) - armyPower(g, a.id))[0];
      if (!big) return fail("Needs a land border with a great power.");
      let best = -1, bd = 99;
      for (let i = 0; i < N_CELLS; i++) {
        if (!held(i)) continue;
        let edge = false;
        for (const [dx, dy] of DIRS4) { const x = cellX(i) + dx, y = cellY(i) + dy; if (inBounds(x, y) && g.owner[idx(x, y)] === big.id) edge = true; }
        if (!edge) continue;
        const d = dist(i, capital.cell);
        if (d < bd) { bd = d; best = i; }
      }
      return best >= 0 ? { ok: true, cell: best, against: big.id } : fail("Needs a land border with a great power.");
    }
    case "monument": return n.stability >= 55 ? { ok: true, cell: capital.cell } : fail("Needs stability of at least 55: a divided nation builds no monuments.");
    case "broadcast": return hasTech(n, "media") ? { ok: true, cell: capital.cell } : fail("Needs the Mass media technology.");
    case "atomic": {
      if (!hasTech(n, "nuclear") || !hasTech(n, "computing")) return fail("Needs the Nuclear power and Computing technologies.");
      let best = -1, bs = -1;
      for (let i = 0; i < N_CELLS; i++) {
        if (!held(i)) continue;
        const far = Math.min(...e.cities.map(c => dist(c.cell, i)));
        const sc = far + (w.terrain[i] === T.MOUNTAIN || w.terrain[i] === T.HILLS ? 2 : 0);
        if (sc > bs) { bs = sc; best = i; }
      }
      return { ok: true, cell: best };
    }
  }
  return fail("Unknown work.");
}

/* Can it be started, where, and for how much: cheap enough to show for every work on every redraw. */
function quoteWorkLite(w, g, nid, key, base) {
  const fail = reason => ({ ok: false, kind: "work", work: key, reason });
  const W = g.works[key];
  if (W && W.owner !== null && W.owner !== undefined) return fail(`The ${nameOf(g, W.owner)} already completed it.`);
  if (W && W.builders && W.builders[nid]) return fail("You are already building it.");
  if (Object.values(g.works).some(x => x.builders && x.builders[nid])) return fail("Your builders are busy with another great work.");
  const econ = base || computeEconomy(w, g, nid);
  const req = workReq(w, g, nid, key, econ);
  if (!req.ok) return fail(req.why);
  const cost = workCost(w, g, key), def = WORKS[key];
  return { ok: true, kind: "work", nid, work: key, cell: req.cell, cost, seasons: def.seasons, installment: Math.round(cost / def.seasons * 100) / 100, label: `Build the ${def.label}`, econ };
}
function quoteWork(w, g, nid, key, base) {
  const lite = quoteWorkLite(w, g, nid, key, base);
  if (!lite.ok) return lite;
  const { econ, cost } = lite, req = lite;
  const def = WORKS[key];
  const v = projectValue(w, g, nid, { work: { key, nid, cell: req.cell } }, econ);
  const prestigeValue = def.prestige * econ.gdp * 0.0009;
  const installment = Math.round(cost / def.seasons * 100) / 100;
  return { ok: true, kind: "work", nid, work: key, cell: req.cell, cost, seasons: def.seasons, installment, upfront: 2 * installment, label: `Build the ${def.label}`, ...v, value: v.value + prestigeValue + (key === "monument" ? econ.gdp * 0.006 : 0) };
}
function startWork(g, q) {
  const W = workState(g, q.work);
  W.builders[q.nid] = { started: g.turn, cell: q.cell, cost: q.cost, seasons: q.seasons, paid: 0, progress: 0, paused: false, stalled: false };
  return W.builders[q.nid];
}
function stopWork(g, key, nid, refund) {
  const W = g.works[key];
  if (!W || !W.builders[nid]) return 0;
  const b = W.builders[nid];
  const back = Math.round(b.paid * refund * 10) / 10;
  g.nations[nid].treasury += back;
  delete W.builders[nid];
  return back;
}

/* Each season: builders are paid; the first to finish wins the race, and the others get half their money back. */
function advanceWorks(w, g, dispatch) {
  const paid = {};
  const finished = [];
  for (const key of WORK_ORDER) {
    const W = g.works[key];
    if (!W || W.owner !== null && W.owner !== undefined) continue;
    for (const id of Object.keys(W.builders)) {
      const nid = Number(id), b = W.builders[id], n = g.nations[nid];
      if (!n || !n.alive) { delete W.builders[id]; continue; }
      if (g.owner[b.cell] !== nid) { const back = stopWork(g, key, nid, 0.5); if (nid === PLAYER) dispatch.economy.push({ tone: "bad", text: `The site of the ${WORKS[key].label} was lost. Work stopped; ${fmtMoney(back)} was recovered.` }); continue; }
      if (b.paused) continue;
      const inst = b.cost / b.seasons;
      const gdp = computeEconomy(w, g, nid).gdp;
      if (!canAfford(n, gdp, inst).ok) {
        b.stalled = true;
        if (nid === PLAYER) dispatch.economy.push({ tone: "bad", text: `Not enough money this season: work on the ${WORKS[key].label} stalled.` });
        continue;
      }
      b.stalled = false;
      n.treasury -= inst; b.paid += inst; b.progress += 1;
      n.buildSpend = (n.buildSpend || 0) + inst;
      paid[nid] = (paid[nid] || 0) + inst;
      if (b.progress >= b.seasons) finished.push({ key, nid, b });
    }
  }
  // two finishing the same season: whoever started first wins
  finished.sort((a, b) => a.b.started - b.b.started || b.b.paid - a.b.paid);
  for (const f of finished) {
    const W = g.works[f.key];
    if (W.owner !== null && W.owner !== undefined) continue;
    completeWork(w, g, f.key, f.nid, dispatch);
  }
  return paid;
}
function completeWork(w, g, key, nid, dispatch) {
  const W = g.works[key], def = WORKS[key], n = g.nations[nid];
  const b = W.builders[nid];
  W.owner = nid; W.done = g.turn; W.cell = b ? b.cell : W.cell;
  delete W.builders[nid];
  const pts = addPrestige(g, nid, def.prestige, "works", `Built the ${def.label}`);
  leaderDeed(g, nid, "works");
  if (!g.firsts.work) { g.firsts.work = { nid, turn: g.turn }; addPrestige(g, nid, 10, "works", "The first great work in the world"); }
  if (key === "fair") {
    for (const z of liveNations(g)) if (z.id !== nid) addMod(g, z.id, nid, "worlds_fair", "Visited their World's Fair", 12, 0.5, 15);
    addNationMod(g, n, { key: "fair_glow", label: "The glow of the World's Fair", stab: 4, seasons: 12 });
  }
  const text = `The ${n.name} completed the ${def.label}, inspired by ${def.inspired}. It is the only one in the world.`;
  addChronicle(g, text, nid === PLAYER ? "good" : "neutral", nid);
  dispatch.firsts.push({ nid, tone: nid === PLAYER ? "good" : "neutral", text: nid === PLAYER ? `You completed the ${def.label}! ${def.gives}. +${pts} prestige.` : text });
  if (nid !== PLAYER) noteFor(n, g, `Completed the ${def.label}.`, null);
  // everyone else racing for it stops, and gets half their money back
  for (const id of Object.keys(W.builders)) {
    const back = stopWork(g, key, Number(id), 0.5);
    if (Number(id) === PLAYER) dispatch.firsts.push({ nid, tone: "bad", text: `The ${n.name} finished the ${def.label} before you. Your builders stopped; ${fmtMoney(back)} of what you spent was recovered.` });
  }
  bumpWorld(g);
}

/* What finished works do for the nation that holds them, read by the economy and the rest of the rules. */
function workBonus(g, nid) {
  const B = { power: 0, damCell: -1, logistics: 0, market: 0, haul: 1, access: 0, harborCity: null, research: 0, skill: 0, capital: 0, interest: 0, finance: 0, tourismCity: null, stab: 0, soft: 0, forts: false, atomic: false };
  if (!g.works) return B;
  for (const key in g.works) {
    if (workHolder(g, key) !== nid) continue;
    const W = g.works[key];
    const cityAt = W.cell >= 0 ? g.cities.find(c => c.cell === W.cell) : null;
    switch (key) {
      case "dam": B.power += 2.5; B.damCell = W.cell; break;
      case "railway": B.logistics += 0.15; B.market += 0.25; B.haul = 0.5; break;
      case "harbor": B.access += 0.3; B.harborCity = cityAt ? cityAt.id : null; break;
      case "academy": B.research += 0.25; B.skill += 0.04; break;
      case "exchange": B.capital += 0.3; B.interest += 0.01; B.finance += 0.03; break;
      case "fair": { const cap = g.cities.find(c => c.owner === nid && c.capital); B.tourismCity = cap ? cap.id : null; break; }
      case "forts": B.forts = true; break;
      case "monument": B.stab += 4; break;
      case "broadcast": B.stab += 2; B.soft += 3; break;
      case "atomic": B.atomic = true; break;
    }
  }
  return B;
}
function workStabilityTerms(g, n) {
  const out = [];
  if (workHolder(g, "monument") === n.id) out.push({ label: "The National Monument", value: 4 });
  if (workHolder(g, "broadcast") === n.id) out.push({ label: "The National Broadcasting Tower", value: 2 });
  return out;
}
/* The Line of Fortresses: border lands of its holder. */
function fortHere(g, cell, D) {
  if (workHolder(g, "forts") !== D || g.owner[cell] !== D) return false;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = cellX(cell) + dx, y = cellY(cell) + dy;
    if (!inBounds(x, y)) continue;
    const o = g.owner[idx(x, y)];
    if (o >= 0 && o !== D) return true;
  }
  return false;
}

/* What the AI could build: one great work at a time, and only with money in the bank. */
function workCandidates(w, g, n, econ) {
  if (Object.values(g.works).some(x => x.builders && x.builders[n.id])) return [];
  if (n.stability < 40 || (n.minor && econ.gdp < 120)) return [];
  const out = [];
  for (const key of WORK_ORDER) {
    if (n.minor && key !== "monument") continue;
    const lite = quoteWorkLite(w, g, n.id, key, econ);
    if (!lite.ok || n.treasury < 2 * lite.installment) continue;
    const q = quoteWork(w, g, n.id, key, econ);
    if (key === "forts" || key === "atomic") { const t = maxThreatTo(w, g, n.id); q.value += t.level * econ.gdp * (key === "atomic" ? 0.03 : 0.02); }
    q.value *= (WORK_TASTE[n.archetype] || {})[key] || 1;
    q.upfront = q.installment * 2;
    out.push(q);
  }
  return out.sort((a, b) => b.value / b.cost - a.value / a.cost).slice(0, 2);
}

/* ---------- World firsts and eras ---------- */
const ERAS = [
  { key: "steam", name: "Age of Steam", tech: null },
  { key: "electric", name: "Age of Electricity", tech: "electrify" },
  { key: "radio", name: "Age of Radio", tech: "media" },
  { key: "electronic", name: "Electronic Age", tech: "electronics" },
  { key: "atomic", name: "Atomic Age", tech: "nuclear" },
  { key: "info", name: "Information Age", tech: "computing" },
];
function worldEra(g) {
  const k = g.era || 0;
  const next = ERAS[k + 1];
  return next && g.nations.some(n => hasTech(n, next.tech)) ? k + 1 : k;
}
const FIRSTS = [
  ...TECH_ORDER.map(t => ({ key: `tech_${t}`, cat: "science", pts: 8, test: n => hasTech(n, t), text: `discover ${TECHS[t].label.toLowerCase()}` })),
  { key: "gdp500", cat: "wealth", pts: 15, test: (n, h) => h.gdp >= 500, text: "build an economy of $500B a year" },
  { key: "gdp1000", cat: "wealth", pts: 20, test: (n, h) => h.gdp >= 1000, text: "build an economy of $1T a year" },
  { key: "gdp2000", cat: "wealth", pts: 30, test: (n, h) => h.gdp >= 2000, text: "build an economy of $2T a year" },
  { key: "pop50", cat: "people", pts: 15, test: (n, h) => h.pop >= 50, text: "reach 50 million people" },
  { key: "pop100", cat: "people", pts: 20, test: (n, h) => h.pop >= 100, text: "reach 100 million people" },
  { key: "towns10", cat: "people", pts: 10, test: (n, h) => h.towns >= 10, text: "found or hold ten towns" },
  { key: "sites6", cat: "wealth", pts: 10, test: (n, h, g) => g.sites.filter(s => g.owner[s.cell] === n.id && !s.exhausted && !s.paused).length >= 6, text: "work six mines, oil fields, camps or harbors" },
  { key: "trade3", cat: "diplomacy", pts: 10, test: (n, h, g) => g.treaties.filter(t => t.type === "trade" && (t.a === n.id || t.b === n.id)).length >= 3, text: "trade with three nations at once" },
  { key: "skill60", cat: "science", pts: 10, test: n => (n.skill ?? 0) >= 0.6, text: "train a workforce of 60% skill" },
  { key: "divs20", cat: "power", pts: 10, test: (n, h) => h.divs >= 20, text: "field twenty divisions" },
];
function checkFirsts(w, g, dispatch) {
  for (const F of FIRSTS) {
    if (g.firsts[F.key]) continue;
    const winners = liveNations(g).filter(n => { const h = n.history[n.history.length - 1]; return h && F.test(n, h, g); });
    if (!winners.length) continue;
    const n = winners.sort((a, b) => (b.prestige || 0) - (a.prestige || 0))[0];
    g.firsts[F.key] = { nid: n.id, turn: g.turn };
    const pts = addPrestige(g, n.id, F.pts, F.cat, `World first: ${F.text}`);
    const text = n.isPlayer ? `World first! You are the first nation to ${F.text}. +${pts} prestige.` : `World first: the ${n.name} became the first nation to ${F.text}.`;
    dispatch.firsts.push({ nid: n.id, tone: n.isPlayer ? "good" : "neutral", text });
    addChronicle(g, n.isPlayer ? `World first: we became the first nation to ${F.text}.` : text, n.isPlayer ? "good" : "neutral", n.id);
  }
  const era = worldEra(g);
  if (era > (g.era || 0)) {
    g.era = era;
    const E = ERAS[era];
    const first = g.firsts[`tech_${E.tech}`];
    const by = first ? g.nations[first.nid] : null;
    if (by) addPrestige(g, by.id, 5, "science", `Led the world into the ${E.name}`);
    const text = `A new era begins: the ${E.name}.${by ? ` The ${by.isPlayer ? "world follows our lead" : `${by.name} led the way`}.` : ""}`;
    dispatch.firsts.push({ nid: by ? by.id : null, tone: by && by.isPlayer ? "good" : "neutral", text });
    addChronicle(g, text, "good", by ? by.id : null);
  }
}

/* ---------- Intelligence: which neighbors are planning war against you, and why ---------- */
const RISK_LABELS = ["Low", "Watchful", "High", "Imminent"];
function warRisk(w, g, x, y = PLAYER) {
  const n = g.nations[x];
  if (!n || !n.alive || x === y || atWar(g, x, y) || !sharesBorder(g, x, y)) return null;
  if (n.minor) return { level: 0, label: RISK_LABELS[0], lines: [], why: "A small state cannot hope to win a war against us alone." };
  if (hasTreaty(g, x, y, "truce")) return { level: 0, label: RISK_LABELS[0], lines: [], why: "A truce still binds them." };
  if (hasTreaty(g, x, y, "alliance")) return { level: 0, label: RISK_LABELS[0], lines: [], why: "We are allies." };
  const wa = warAssessment(w, g, x, y);
  if (!wa) return { level: 0, label: RISK_LABELS[0], lines: [], why: g.turn < (y === PLAYER ? OPENING.grace : 8) ? "Too early: every government is still finding its feet." : "They have no cause for war and no great grudge against us." };
  const v = wa.value;
  // the same lines the rival governments use: a war option is on their table once its value is above zero
  const level = v >= 6 ? 3 : v > 0 ? 2 : v > -12 ? 1 : 0;
  const why = level === 3 ? "Their generals see a war against us as worth it, and may strike soon."
    : level === 2 ? "A war against us is one of the options their government is weighing."
    : level === 1 ? "They have thought about it, but the costs still hold them back."
    : "The costs of a war hold them back.";
  return { level, label: RISK_LABELS[level], value: v, lines: wa.lines, wa, why, chance: wa.winChance, ratio: wa.ratio };
}
function checkIntel(w, g, dispatch) {
  const pn = g.nations[PLAYER];
  if (!pn.alive) return;
  const th = hasTrait(pn, "paranoid") ? 1 : 2;
  g.intel = g.intel || {};
  for (const z of liveNations(g)) {
    if (z.isPlayer) continue;
    const r = warRisk(w, g, z.id);
    const lvl = r ? r.level : 0;
    const prev = g.intel[z.id] ?? 0;
    if (r && lvl >= th && prev < th) {
      const motive = (r.lines || []).filter(l => l.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 2).map(l => l.label.toLowerCase()).join("; ");
      dispatch.warnings.push(`Intelligence: the ${z.name}'s generals are drawing up plans for war against us (risk: ${r.label.toLowerCase()}).${motive ? ` Their reasons: ${motive}.` : ""} A stronger army, an ally or a pact would make them think again.`);
    }
    g.intel[z.id] = lvl;
  }
}

