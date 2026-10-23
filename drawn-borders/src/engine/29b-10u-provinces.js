/* =====================================================================
   10u. Provinces and villages (v38, part 1)
   Like the United States: a nation is divided into provinces, each with a capital, and inside them cities,
   towns and villages. Every cell of a nation belongs to one province (g.prov). A province with no town yet is a
   territory, run from the national capital, until a town there is made its capital. Provinces are drawn by the
   player at the founding (or "Divide it for me"); later they are split, joined and redrawn like real life: a new
   province costs money and about two seasons (its capital's government offices). New and conquered land joins
   the nearest province. Province capitals are what the old "provincial seat" program was: public jobs, loyalty,
   a government that carries on if the national capital falls, and a large country that is easier to govern.
   Villages appear by themselves where people live in the countryside (farmland, mines, fishing coasts) and grow
   or shrink with them. They change nothing in the economy: those people are already counted in their town.
   ===================================================================== */
const PROV = {
  minCells: 8, target: 32, maxPerNation: 12, histMax: 41,
  newShare: 0.03, newMin: 0.5, newMax: 12, territoryCost: 0.3, moveCost: 0.2, joinCost: 0.2,
  newSeasons: 2, moveSeasons: 1, joinSeasons: 1, capSeasons: 2,
  seatEase: 0.1, seatEaseMax: 4,            // each province capital eases governing a large country by 10%, at most 40% (as two provincial seats did)
  villageShare: 0.02, villageOn: 0.12, villageOff: 0.08, villageMine: 0.05, villageFish: 0.09,
};
const VILLAGE_HEADS = ["Ash", "Birch", "Brook", "Clay", "Elm", "Fern", "Glen", "Hay", "Holt", "Ivy", "Kin", "Lark", "Mill", "Moss", "Oak", "Pen", "Reed", "Rye", "Stone", "Thorn", "Wil", "Wold", "Yew", "Bar", "Cross", "Dun", "Fair", "Gold", "Har", "Lang", "Mar", "Nor", "Ock", "Sand", "Tarn", "Wick"];
const VILLAGE_TAILS = ["by", "ham", "ley", "well", "thorpe", "field", "brook", "stead", "wick", "cote", "dale", "ford", "hurst", "moor", "worth", "bridge", "holme", "combe"];
const VILLAGE_KINDS = { farm: "Farming village", mine: "Mining village", fish: "Fishing village" };

function provList(g, nid) { return (g.provinces || []).filter(p => p.owner === nid); }
function provById(g, id) { return id >= 0 && g.provinces ? g.provinces.find(p => p.id === id) || null : null; }
/* The province a cell belongs to (only if it really belongs to the cell's nation). */
function provAt(g, cell) {
  if (!g.prov || cell < 0) return null;
  const p = provById(g, g.prov[cell]);
  return p && p.owner === g.owner[cell] ? p : null;
}
function provCells(g, p) { const out = []; if (!g.prov) return out; for (let i = 0; i < N_CELLS; i++) if (g.prov[i] === p.id && g.owner[i] === p.owner) out.push(i); return out; }
function provTowns(g, p) { return g.cities.filter(c => c.owner === p.owner && g.prov && g.prov[c.cell] === p.id); }
function provCapital(g, p) { const c = p && p.capital !== null && p.capital !== undefined ? g.cities.find(x => x.id === p.capital) : null; return c && c.owner === p.owner ? c : null; }
function isTerritory(g, p) { return !provCapital(g, p); }
/* A province capital that is not the national capital governs its province, as the old provincial seats did. */
function provSeat(g, c) {
  if (!c || c.capital || !g.provinces) return false;
  for (const p of g.provinces) if (p.capital === c.id && p.owner === c.owner) return true;
  return false;
}
function provSeatsOf(g, nid) { return g.cities.filter(c => c.owner === nid && provSeat(g, c)); }
function provinceOfCity(g, c) { return c && g.prov ? provById(g, g.prov[c.cell]) : null; }

/* ---------- Dividing land: the farthest towns become seeds, the land goes to the nearest seed ---------- */
function bfsWithin(set, sources) {
  const d = new Map();
  const q = [];
  for (const s of sources) if (set.has(s) && !d.has(s)) { d.set(s, 0); q.push(s); }
  for (let k = 0; k < q.length; k++) {
    const c = q[k], x = cellX(c), y = cellY(c);
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const j = idx(nx, ny);
      if (set.has(j) && !d.has(j)) { d.set(j, d.get(c) + 1); q.push(j); }
    }
  }
  return d;
}
/* Split cells into k contiguous groups. Seeds are the given towns first, then towns far from every seed, then
   the farthest land (a territory). Each cell goes to the seed it can reach in the fewest steps. */
function partitionCells(g, cells, k, seedCells) {
  const set = new Set(cells);
  const towns = g.cities.filter(c => set.has(c.cell)).sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0) || (b.pop || 0) - (a.pop || 0) || a.id - b.id);
  const seeds = [];
  for (const s of seedCells || []) if (set.has(s) && !seeds.includes(s) && seeds.length < k) seeds.push(s);
  if (!seeds.length) seeds.push(towns.length ? towns[0].cell : cells[0]);
  while (seeds.length < k) {
    const d = bfsWithin(set, seeds);
    let best = -1, bestD = -1;
    for (const t of towns) { const v = d.get(t.cell); if (v !== undefined && v >= 5 && v > bestD) { bestD = v; best = t.cell; } }
    if (best < 0) for (const c of cells) { const v = d.get(c); if (v !== undefined && v > bestD) { bestD = v; best = c; } }
    if (best < 0 || bestD < 3) break;
    seeds.push(best);
  }
  // grow all seeds at once, the smallest province first, so the provinces come out of similar size
  const owner = new Map(), size = seeds.map(() => 1), queues = seeds.map(s => [s]), heads = seeds.map(() => 0);
  seeds.forEach((s, k2) => owner.set(s, k2));
  for (;;) {
    let k2 = -1;
    for (let j = 0; j < seeds.length; j++) if (heads[j] < queues[j].length && (k2 < 0 || size[j] < size[k2])) k2 = j;
    if (k2 < 0) break;
    const c = queues[k2][heads[k2]++], x = cellX(c), y = cellY(c);
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const j = idx(nx, ny);
      if (set.has(j) && !owner.has(j)) { owner.set(j, k2); queues[k2].push(j); size[k2]++; }
    }
  }
  const groups = seeds.map(() => []);
  for (const c of cells) {
    let o = owner.get(c);
    if (o === undefined) {   // an island or exclave: the nearest seed as the crow flies
      let bd = Infinity;
      seeds.forEach((s, k2) => { const v = dist(s, c); if (v < bd) { bd = v; o = k2; } });
    }
    groups[o].push(c);
  }
  return groups.map((cellsK, k2) => ({ cells: cellsK, seed: seeds[k2] })).filter(x => x.cells.length);
}
function autoProvinceCount(area) { return area < 40 ? 1 : area < 75 ? 2 : area < 120 ? 3 : area < 200 ? 4 : Math.min(PROV.maxPerNation, Math.round(area / 45)); }

/* ---------- Names: from where a province lies and what its land is like ---------- */
const DIR_NAMES = ["East", "Southeast", "South", "Southwest", "West", "Northwest", "North", "Northeast"];
function provGeoName(w, g, cells, nationCells) {
  const cx = a => a.reduce((s, c) => s + cellX(c) + 0.5, 0) / a.length, cy = a => a.reduce((s, c) => s + cellY(c) + 0.5, 0) / a.length;
  const dx = cx(cells) - cx(nationCells), dy = cy(cells) - cy(nationCells);
  const span = Math.sqrt(nationCells.length) / 2;
  const dir = Math.hypot(dx, dy) < 0.3 * span ? "Central" : DIR_NAMES[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
  const n = cells.length, count = t => cells.filter(c => w.terrain[c] === t).length;
  const coast = cells.filter(c => w.coastal[c]).length;
  const rough = count(T.HILLS) + count(T.MOUNTAIN);
  const feature = count(T.MOUNTAIN) >= 0.25 * n ? "Mountains" : rough >= 0.4 * n ? "Highlands" : coast >= 0.3 * n ? "Coast" : count(T.FOREST) >= 0.4 * n ? "Woods" : rough >= 0.2 * n ? "Uplands" : "Plains";
  return `${dir} ${feature}`;
}
function provNameFor(w, g, nid, cells, capitalCity, taken) {
  const own = [];
  for (let i = 0; i < N_CELLS; i++) if (g.owner[i] === nid) own.push(i);
  const options = [provGeoName(w, g, cells, own.length ? own : cells)];
  if (capitalCity) options.push(`${capitalCity.name} Province`, `Province of ${capitalCity.name}`);
  for (const o of options) if (!taken.has(o)) return o;
  for (let k = 2; k < 50; k++) if (!taken.has(`${options[0]} ${k}`)) return `${options[0]} ${k}`;
  return options[0];
}
function provNameSuggestions(w, g, p) {
  const cells = provCells(g, p), own = [];
  for (let i = 0; i < N_CELLS; i++) if (g.owner[i] === p.owner) own.push(i);
  const cap = provCapital(g, p) || provTowns(g, p).sort((a, b) => (b.pop || 0) - (a.pop || 0))[0];
  const out = [provGeoName(w, g, cells, own)];
  if (cap) out.push(`${cap.name} Province`);
  const h = hash2(p.id, cells.length, w.seed);
  out.push(NAME_HEADS[Math.floor(h * NAME_HEADS.length)] + ["ia", "a", "land", "mark", "shire", "ova"][Math.floor(hash2(p.id, 3, w.seed) * 6)]);
  return [...new Set(out)];
}

/* ---------- Keeping the map whole: every cell of a nation in one of its provinces ---------- */
/* Works on a province map and list (the real ones, or copies to weigh a change). Cells of a nation with no
   province of that nation join the nearest one; with splitOff, a piece cut off from its province becomes a
   province of its own if it is big enough, or joins the neighbor it touches most. */
function tidyProvinces(w, g, nid, prov, list, opts = {}) {
  const mine = list.filter(p => p.owner === nid);
  const ids = new Set(mine.map(p => p.id));
  const cells = [];
  for (let i = 0; i < N_CELLS; i++) {
    if (g.owner[i] !== nid) continue;
    cells.push(i);
    if (!ids.has(prov[i])) prov[i] = -1;
  }
  if (!cells.length) return;
  if (!mine.length) {
    const p = newProvince(w, g, nid, cells, null, list, prov, { capital: true });
    mine.push(p); ids.add(p.id);
  }
  // unassigned land joins the province it reaches first
  const set = new Set(cells);
  let front = cells.filter(c => prov[c] >= 0);
  while (front.length) {
    const next = [];
    for (const c of front) {
      const x = cellX(c), y = cellY(c);
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const j = idx(nx, ny);
        if (set.has(j) && prov[j] < 0) { prov[j] = prov[c]; next.push(j); }
      }
    }
    front = next;
  }
  const assigned = cells.filter(c => prov[c] >= 0);
  for (const c of cells) if (prov[c] < 0) {
    let best = -1, bd = Infinity;
    for (const a of assigned) { const v = dist(a, c); if (v < bd) { bd = v; best = a; } }
    prov[c] = best >= 0 ? prov[best] : mine[0].id;
  }
  if (opts.splitOff) {
    for (const p of mine.slice()) {
      const pc = cells.filter(c => prov[c] === p.id);
      const comps = componentsOf(pc);
      if (comps.length < 2) continue;
      // the piece with the capital (or the biggest) stays; the others go
      const cap = g.cities.find(c => c.id === p.capital);
      comps.sort((a, b) => (cap && b.includes(cap.cell) ? 1 : 0) - (cap && a.includes(cap.cell) ? 1 : 0) || b.length - a.length);
      for (const comp of comps.slice(1)) {
        if (comp.length >= PROV.minCells) { const q = newProvince(w, g, nid, comp, null, list, prov, { capital: true }); mine.push(q); continue; }
        const touch = new Map();
        for (const c of comp) for (const [dx, dy] of DIRS4) {
          const nx = cellX(c) + dx, ny = cellY(c) + dy;
          if (!inBounds(nx, ny)) continue;
          const j = idx(nx, ny);
          if (g.owner[j] === nid && prov[j] !== p.id) touch.set(prov[j], (touch.get(prov[j]) || 0) + 1);
        }
        const into = [...touch.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
        if (into) comp.forEach(c => { prov[c] = into[0]; });
      }
    }
  }
  // provinces left without land are gone
  const have = new Set(cells.map(c => prov[c]));
  for (let k = list.length - 1; k >= 0; k--) if (list[k].owner === nid && !have.has(list[k].id)) list.splice(k, 1);
}
function componentsOf(cells) {
  const set = new Set(cells), seen = new Set(), out = [];
  for (const s of cells) {
    if (seen.has(s)) continue;
    const comp = [], q = [s];
    seen.add(s);
    while (q.length) {
      const c = q.pop();
      comp.push(c);
      for (const [dx, dy] of DIRS4) {
        const nx = cellX(c) + dx, ny = cellY(c) + dy;
        if (!inBounds(nx, ny)) continue;
        const j = idx(nx, ny);
        if (set.has(j) && !seen.has(j)) { seen.add(j); q.push(j); }
      }
    }
    out.push(comp);
  }
  return out;
}
/* A new province on these cells. Its capital is the national capital if it lies there, or else the biggest town;
   with no town it is a territory. */
function newProvince(w, g, nid, cells, name, list, prov, opts = {}) {
  const set = new Set(cells);
  const towns = g.cities.filter(c => c.owner === nid && set.has(c.cell)).sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0) || (b.pop || 0) - (a.pop || 0) || a.id - b.id);
  const cap = opts.capital && towns.length ? towns[0] : null;
  const taken = new Set(list.filter(p => p.owner === nid).map(p => p.name));
  const p = { id: g.provNext = (g.provNext || 0) + 1, owner: nid, name: name || provNameFor(w, g, nid, cells, cap, taken), capital: cap ? cap.id : null, made: g.turn || 0, hist: [] };
  list.push(p);
  cells.forEach(c => { prov[c] = p.id; });
  return p;
}
/* Divide a nation's land into provinces by the same rule for everyone (the founding's "Divide it for me",
   rivals, and old saves). seedCells: towns that should head a province (old provincial seats). */
function autoDivide(w, g, nid, k, seedCells) {
  const cells = [];
  for (let i = 0; i < N_CELLS; i++) if (g.owner[i] === nid) cells.push(i);
  if (!cells.length) return [];
  for (let i = g.provinces.length - 1; i >= 0; i--) if (g.provinces[i].owner === nid) g.provinces.splice(i, 1);
  cells.forEach(c => { g.prov[c] = -1; });
  const cap = g.cities.find(c => c.owner === nid && c.capital);
  const groups = partitionCells(g, cells, Math.max(1, k || autoProvinceCount(cells.length)), [cap ? cap.cell : -1, ...(seedCells || [])].filter(c => c >= 0));
  const made = groups.map(gr => newProvince(w, g, nid, gr.cells, null, g.provinces, g.prov, { capital: true }));
  tidyProvinces(w, g, nid, g.prov, g.provinces);
  ensureGovernors(g);
  return made;
}

/* ---------- Every season, and when a game starts or an old save loads ---------- */
function ensureProvinces(w, g) {
  const fresh = !g.prov || g.prov.length !== N_CELLS || !Array.isArray(g.provinces);
  if (fresh) {
    g.prov = new Int16Array(N_CELLS).fill(-1);
    g.provinces = [];
    // saves from before provinces: provincial seats become province capitals, seat programs being set up are refunded
    for (const pr of g.projects.filter(p => p.kind === "focus" && p.focus === "seat")) { if (g.nations[pr.nid]) g.nations[pr.nid].treasury += pr.cost; }
    g.projects = g.projects.filter(p => !(p.kind === "focus" && p.focus === "seat"));
    for (const n of g.nations) {
      if (!n.alive) continue;
      const seats = g.cities.filter(c => c.owner === n.id && c.focus === "seat");
      const area = g.owner.reduce((s, o) => s + (o === n.id ? 1 : 0), 0);
      autoDivide(w, g, n.id, Math.max(autoProvinceCount(area), seats.length + 1), seats.map(c => c.cell));
      for (const c of seats) {
        const p = provById(g, g.prov[c.cell]);
        if (p) p.capital = c.id;
        c.focus = null; c.focusAt = null;
      }
    }
  }
  if (!Array.isArray(g.villages)) { g.villages = []; updateVillages(w, g); }
  syncProvinces(w, g);
  ensureGovernors(g);   // money levels and governors (10v), for old saves too
}
/* A province capital no longer in its province passes to the province's biggest town (or the province becomes a
   territory). Works on the real map or on copies. Returns [{ p, from, to }] for each change. */
function resolveCapitals(g, nid, prov, list) {
  const out = [];
  for (const p of list) {
    if (p.owner !== nid || p.capital === null || p.capital === undefined) continue;
    const c = g.cities.find(x => x.id === p.capital);
    if (c && c.owner === p.owner && prov[c.cell] === p.id) continue;
    const next = g.cities.filter(x => x.owner === nid && prov[x.cell] === p.id).sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0) || (b.pop || 0) - (a.pop || 0) || a.id - b.id)[0];
    p.capital = next ? next.id : null;
    out.push({ p, from: c || null, to: next || null });
  }
  return out;
}
/* Land that changed hands joins the nearest province of its new nation; a province capital that was lost
   passes to the province's biggest town (or the province becomes a territory). Returns news for the player. */
function syncProvinces(w, g, news) {
  if (!g.prov) return;
  for (let i = 0; i < N_CELLS; i++) if (g.owner[i] < 0) g.prov[i] = -1;
  for (const n of g.nations) if (n.alive) tidyProvinces(w, g, n.id, g.prov, g.provinces);
  g.provinces = g.provinces.filter(p => g.nations[p.owner] && g.nations[p.owner].alive);
  for (const n of g.nations) {
    if (!n.alive) continue;
    for (const { p, from, to } of resolveCapitals(g, n.id, g.prov, g.provinces)) {
      if (news && p.owner === PLAYER) news.push({ tone: "warn", text: to ? `${from ? from.name : "The old capital"} is no longer in ${p.name}: its government moved to ${to.name}.` : `${p.name} has lost its capital${from ? `, ${from.name}` : ""}. It is a territory now, run from the national capital.` });
    }
  }
}
/* Once a season: provinces' numbers for their history, villages, and rivals' redrawing. */
function recordProvinces(g, nid, econ) {
  if (!g.provinces) return;
  const st = provinceStats(null, g, nid, econ);
  for (const s of st) {
    const p = s.p;
    p.hist = (p.hist || []).concat([{ t: g.turn, pop: Math.round(s.pop * 1000) / 1000, gdp: Math.round(s.gdp * 10) / 10 }]).slice(-PROV.histMax);
  }
}
function seasonProvinces(w, g, dispatch) {
  if (!g.prov) return;
  updateVillages(w, g);
  rivalProvinces(w, g, dispatch);
}

/* ---------- A province's numbers: sums of its land and towns, no new rules ---------- */
/* People are counted cell by cell; each town's output is shared among the provinces its land lies in, by people. */
function provinceStats(w, g, nid, econ) {
  const list = provList(g, nid);
  const by = new Map(list.map(p => [p.id, { p, cells: 0, pop: 0, gdp: 0, towns: [], villages: 0, held: 0 }]));
  for (let i = 0; i < N_CELLS; i++) {
    if (g.owner[i] !== nid) continue;
    const s = by.get(g.prov[i]);
    if (!s) continue;
    s.cells++;
    s.pop += g.pop[i];
  }
  for (const r of (econ && econ.regions) || []) {
    if (!(r.pop > 0)) continue;
    const per = (r.gdp || 0) / r.pop;
    for (const c of r.cells) { const s = by.get(g.prov[c]); if (s) s.gdp += per * g.pop[c]; }
  }
  for (const c of g.cities) if (c.owner === nid) { const s = by.get(g.prov[c.cell]); if (s) s.towns.push(c); }
  for (const v of g.villages || []) if (g.owner[v.cell] === nid) { const s = by.get(g.prov[v.cell]); if (s) s.villages++; }
  const out = [...by.values()];
  for (const s of out) {
    const h = s.p.hist || [];
    const yearAgo = h.length >= 5 ? h[h.length - 5] : h[0];
    s.growth = yearAgo && yearAgo.pop > 0 ? s.pop / yearAgo.pop - 1 : null;
    s.perK = s.pop > 0 ? s.gdp / s.pop : 0;
    s.capital = provCapital(g, s.p);
    s.territory = !s.capital;
    s.towns.sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0) || (s.capital && b.id === s.capital.id ? 1 : 0) - (s.capital && a.id === s.capital.id ? 1 : 0) || (b.pop || 0) - (a.pop || 0));
  }
  const nat = g.cities.find(c => c.owner === nid && c.capital);
  return out.sort((a, b) => (nat && g.prov[nat.cell] === b.p.id ? 1 : 0) - (nat && g.prov[nat.cell] === a.p.id ? 1 : 0) || b.pop - a.pop);
}

/* ---------- Villages: where the countryside lives ---------- */
function villageName(w, g, cell, taken) {
  for (let k = 0; k < 40; k++) {
    const n = VILLAGE_HEADS[Math.floor(hash2(cell, k, w.seed + 501) * VILLAGE_HEADS.length)] + VILLAGE_TAILS[Math.floor(hash2(cell, k, w.seed + 502) * VILLAGE_TAILS.length)];
    if (!taken.has(n)) return n;
  }
  return `${VILLAGE_HEADS[cell % VILLAGE_HEADS.length]}${VILLAGE_TAILS[cell % VILLAGE_TAILS.length]} ${cell}`;
}
/* What its people live from, if anything that gathers a village: farmland, a mine or oil field next door, or a
   fishing coast. null: too few people. `stay` uses the lower threshold (a village is slow to die). */
function villageKind(w, g, i, stay) {
  const p = g.pop[i];
  const mine = (g.sites || []).some(s => !s.exhausted && SITE_KINDS[s.kind] && SITE_KINDS[s.kind].res && Math.abs(cellX(s.cell) - cellX(i)) <= 1 && Math.abs(cellY(s.cell) - cellY(i)) <= 1);
  if (mine && p >= PROV.villageMine * (stay ? 0.7 : 1)) return "mine";
  if (cellFood(w, g, i) >= 0.3 && p >= (stay ? PROV.villageOff : PROV.villageOn)) return "farm";
  if (w.coastal[i] && p >= PROV.villageFish * (stay ? 0.8 : 1)) return "fish";
  return null;
}
function villagePop(g, v) { return g.pop[v.cell] * PROV.villageShare * (0.5 + hash2(v.cell, 11, 977)); }   // the biggest village of its land; the rest live on farms and in hamlets
function updateVillages(w, g) {
  const townAt = new Set(g.cities.map(c => c.cell));
  const nearTown = i => g.cities.some(c => Math.abs(cellX(c.cell) - cellX(i)) <= 1 && Math.abs(cellY(c.cell) - cellY(i)) <= 1);
  const keep = [];
  const blocked = new Uint8Array(N_CELLS);
  const block = i => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = cellX(i) + dx, y = cellY(i) + dy; if (inBounds(x, y)) blocked[idx(x, y)] = 1; } };
  // villages that still have their people stay first, so the map does not reshuffle
  for (const v of g.villages || []) {
    if (g.owner[v.cell] < 0 || townAt.has(v.cell) || nearTown(v.cell) || blocked[v.cell]) continue;
    const kind = villageKind(w, g, v.cell, true);
    if (!kind) continue;
    v.kind = kind;
    v.pop = Math.round(villagePop(g, v) * 1e5) / 1e5;
    keep.push(v); block(v.cell);
  }
  const taken = new Set(keep.map(v => v.name));
  const cand = [];
  for (let i = 0; i < N_CELLS; i++) {
    if (g.owner[i] < 0 || blocked[i] || townAt.has(i)) continue;
    if (g.pop[i] < PROV.villageMine * 0.7) continue;
    const kind = villageKind(w, g, i, false);
    if (kind) cand.push({ i, kind, s: g.pop[i] + hash2(i, 7, w.seed) * 0.01 });
  }
  cand.sort((a, b) => b.s - a.s || a.i - b.i);
  for (const c of cand) {
    if (blocked[c.i] || nearTown(c.i)) continue;
    const v = { cell: c.i, name: villageName(w, g, c.i, taken), kind: c.kind, born: g.turn || 0, pop: 0 };
    v.pop = Math.round(villagePop(g, v) * 1e5) / 1e5;
    taken.add(v.name);
    keep.push(v); block(c.i);
  }
  g.villages = keep.sort((a, b) => a.cell - b.cell);
}
function villageAt(g, cell) { return (g.villages || []).find(v => v.cell === cell) || null; }

/* ---------- Redrawing provinces: weigh a change on copies, then pay, wait, and apply ---------- */
/* op: { t: "draw", cells, to (province id, or null for a new province), name }
       { t: "join", from, into }      { t: "capital", pid, cityId } */
function provincePlan(w, g, nid, op) {
  const prov = g.prov.slice();
  const list = g.provinces.map(p => ({ ...p }));
  const fail = reason => ({ ok: false, reason });
  const mineIds = new Set(list.filter(p => p.owner === nid).map(p => p.id));
  const before = list.filter(p => p.owner === nid).map(p => p.id);
  let target = null;
  if (op.t === "draw") {
    const cells = (op.cells || []).filter(c => g.owner[c] === nid);
    if (!cells.length) return fail("Draw over your own land.");
    if (op.to !== null && op.to !== undefined) {
      if (!mineIds.has(op.to)) return fail("That province is not yours.");
      const moved = cells.filter(c => prov[c] !== op.to);
      if (!moved.length) return fail("That land is already in this province.");
      moved.forEach(c => { prov[c] = op.to; });
      target = list.find(p => p.id === op.to);
    } else {
      if (cells.length < PROV.minCells) return fail(`Too small: a province needs at least ${fmtArea(PROV.minCells)} (you drew ${fmtArea(cells.length)}).`);
      if (before.length >= PROV.maxPerNation) return fail(`A nation can have at most ${PROV.maxPerNation} provinces.`);
      const capCity = g.cities.find(c => c.owner === nid && c.capital);
      target = newProvince(w, g, nid, cells, op.name || null, list, prov, { capital: true });
      // the national capital stays the capital of the province it was before, unless the new one holds it
      if (capCity && cells.includes(capCity.cell)) target.capital = capCity.id;
    }
  } else if (op.t === "join") {
    const a = list.find(p => p.id === op.from), b = list.find(p => p.id === op.into);
    if (!a || !b || a.owner !== nid || b.owner !== nid || a.id === b.id) return fail("Choose two of your provinces.");
    let touch = false;
    for (let i = 0; i < N_CELLS && !touch; i++) {
      if (prov[i] !== a.id || g.owner[i] !== nid) continue;
      for (const [dx, dy] of DIRS4) { const x = cellX(i) + dx, y = cellY(i) + dy; if (inBounds(x, y) && prov[idx(x, y)] === b.id && g.owner[idx(x, y)] === nid) { touch = true; break; } }
    }
    if (!touch) return fail(`${a.name} and ${b.name} do not touch.`);
    for (let i = 0; i < N_CELLS; i++) if (prov[i] === a.id) prov[i] = b.id;
    target = b;
  } else if (op.t === "capital") {
    const p = list.find(x => x.id === op.pid);
    const c = g.cities.find(x => x.id === op.cityId);
    if (!p || p.owner !== nid) return fail("Not your province.");
    if (!c || c.owner !== nid || prov[c.cell] !== p.id) return fail(`That town is not in ${p.name}.`);
    if (p.capital === c.id) return fail(`${c.name} is already its capital.`);
    if (g.occ && g.occ[c.cell] >= 0) return fail(`${c.name} is occupied.`);
    p.capital = c.id;
    target = p;
  } else return fail("Unknown change.");
  tidyProvinces(w, g, nid, prov, list, { splitOff: op.t === "draw" });
  const capMoves = resolveCapitals(g, nid, prov, list);
  const after = list.filter(p => p.owner === nid);
  const created = after.filter(p => !before.includes(p.id));
  const removed = before.filter(id => !after.some(p => p.id === id)).map(id => g.provinces.find(p => p.id === id)).filter(Boolean);
  if (op.t === "draw" && !created.length && !g.prov.some((v, i) => v !== prov[i] && g.owner[i] === nid)) return fail("This would change nothing.");
  const moved = [];
  for (let i = 0; i < N_CELLS; i++) if (g.owner[i] === nid && g.prov[i] !== prov[i]) moved.push(i);
  // the provinces that keep their name but change: land lost or gained, a capital moved
  const changed = after.filter(p => !created.includes(p)).map(p => {
    let was = 0, now = 0;
    for (let i = 0; i < N_CELLS; i++) if (g.owner[i] === nid) { if (g.prov[i] === p.id) was++; if (prov[i] === p.id) now++; }
    const cm = capMoves.find(x => x.p === p);
    return { p, was, now, cap: cm || null };
  }).filter(x => x.was !== x.now || x.cap);
  return { ok: true, prov, list, created, removed, target, moved, changed };
}
function provCost(w, g, nid, plan, op, econ) {
  if (op.t === "join") return { cost: PROV.joinCost, seasons: PROV.joinSeasons };
  const E = econ || computeEconomy(w, g, nid);
  const officeCost = city => {
    const r = city ? E.regions.find(x => x.city.id === city.id) : null;
    return r ? Math.round(clamp(PROV.newShare * Math.max(0, r.gdp || 0), PROV.newMin, PROV.newMax) * 10) / 10 : PROV.territoryCost;
  };
  if (op.t === "capital") return { cost: officeCost(g.cities.find(c => c.id === op.cityId)), seasons: PROV.capSeasons };
  let cost = PROV.moveCost, seasons = PROV.moveSeasons;
  for (const p of plan.created) {
    const cap = p.capital !== null ? g.cities.find(c => c.id === p.capital) : null;
    cost += cap && cap.capital ? PROV.territoryCost : officeCost(cap);
    seasons = PROV.newSeasons;
  }
  return { cost: Math.round(cost * 10) / 10, seasons };
}
function quoteProvince(w, g, nid, op, econ) {
  const fail = reason => ({ ok: false, kind: "province", reason });
  if (!g.prov) return fail("This nation has no provinces yet.");
  if (g.projects.some(p => p.kind === "province" && p.nid === nid)) return fail("Another change to the provinces is still under way. Wait until it is done.");
  const plan = provincePlan(w, g, nid, op);
  if (!plan.ok) return fail(plan.reason);
  const { cost, seasons } = provCost(w, g, nid, plan, op, econ);
  return { ok: true, kind: "province", nid, op, cost, seasons, dGdp: 0, dFood: 0, value: 0, label: provChangeLabel(g, plan, op), plan };
}
function provChangeLabel(g, plan, op) {
  if (op.t === "join") { const a = provById(g, op.from), b = provById(g, op.into); return `Join ${a ? a.name : "a province"} to ${b ? b.name : "another"}`; }
  if (op.t === "capital") { const c = g.cities.find(x => x.id === op.cityId), p = provById(g, op.pid); return `${c ? c.name : "A town"} becomes the capital of ${p ? p.name : "its province"}`; }
  if (plan.created.length) return `New province: ${plan.created.map(p => p.name).join(", ")}`;
  return `Move ${fmtArea(plan.moved.length)} of land into ${plan.target ? plan.target.name : "another province"}`;
}
/* What a change would do, in words, for the confirm card and for rivals' news. */
function provPlanLines(g, plan) {
  const out = [];
  for (const p of plan.created) {
    const cap = p.capital !== null ? g.cities.find(c => c.id === p.capital) : null;
    const n = plan.prov.reduce((s, v, i) => s + (v === p.id && g.owner[i] === p.owner ? 1 : 0), 0);
    out.push(`${p.name}: ${fmtArea(n)}, ${cap ? `capital ${cap.name}` : "no town yet, so a territory run from the national capital"}`);
  }
  for (const x of plan.changed || []) {
    if (plan.created.length === 0 && x.p === plan.target && !x.cap) continue;
    const parts = [];
    if (x.now !== x.was) parts.push(x.now > x.was ? `grows to ${fmtArea(x.now)}` : `keeps ${fmtArea(x.now)} of ${fmtArea(x.was)}`);
    if (x.cap) parts.push(x.cap.to ? `its capital moves from ${x.cap.from ? x.cap.from.name : "the old capital"} to ${x.cap.to.name}` : `it loses its capital${x.cap.from ? `, ${x.cap.from.name}` : ""}, and becomes a territory`);
    if (parts.length) out.push(`${x.p.name} ${parts.join(", and ")}`);
  }
  for (const p of plan.removed) out.push(`${p.name} ends: its land joins ${plan.target ? plan.target.name : "its neighbors"}`);
  if (plan.moved.length && !plan.created.length && plan.target) out.push(`${fmtArea(plan.moved.length)} of land moves into ${plan.target.name}`);
  return out;
}
function applyProvincePlan(g, nid, plan) {
  g.prov = plan.prov;
  const others = g.provinces.filter(p => p.owner !== nid);
  g.provinces = others.concat(plan.list.filter(p => p.owner === nid));
  for (const p of plan.created) p.made = g.turn;
  ensureGovernors(g);
  bumpWorld(g);
}
function finishProvince(w, g, p) {
  const plan = provincePlan(w, g, p.nid, p.op);
  if (!plan.ok) { p.failed = true; p.why = plan.reason; if (g.nations[p.nid]) g.nations[p.nid].treasury += p.cost * 0.5; return; }
  applyProvincePlan(g, p.nid, plan);
  p.done = provPlanLines(g, plan);
  const cap = p.op.t === "capital" ? g.cities.find(c => c.id === p.op.cityId) : null;
  if (cap) cityHist(g, cap, `Became the capital of ${(provById(g, p.op.pid) || { name: "its province" }).name}.`, "good");
  for (const q of plan.created) { const c = provCapital(g, q); if (c && !c.capital) cityHist(g, c, `Became the capital of the new province of ${q.name}.`, "good"); }
}
function provinceDoneText(g, p) {
  if (p.failed) return `${p.label}: the change could not be made (${(p.why || "the land changed").replace(/\.$/, "")}). Half the cost was refunded.`;
  return `${p.label}: done.${p.done && p.done.length ? ` ${p.done.join("; ")}.` : ""}`;
}
function renameProvince(g, nid, pid, name) {
  const p = provById(g, pid);
  const clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, 32);
  if (!p || p.owner !== nid || !clean) return false;
  if (provList(g, nid).some(q => q.id !== pid && q.name.toLowerCase() === clean.toLowerCase())) return false;
  p.name = clean;
  return true;
}

/* ---------- Rivals redraw by the same rules, once a year each ---------- */
function rivalProvinces(w, g, dispatch) {
  if (g.turn < 4) return;
  for (const n of liveNations(g)) {
    if (n.isPlayer || (g.turn + n.id) % 4 !== 0) continue;
    if (g.projects.some(p => p.kind === "province" && p.nid === n.id)) continue;
    const econ = computeEconomy(w, g, n.id);
    if (n.treasury < 0.05 * econ.gdp) continue;
    const list = provList(g, n.id);
    let op = null;
    // a territory where a town has grown becomes a full province
    for (const p of list) {
      if (provCapital(g, p)) continue;
      const t = provTowns(g, p).filter(c => !(g.occ && g.occ[c.cell] >= 0)).sort((a, b) => (b.pop || 0) - (a.pop || 0))[0];
      if (t && (t.pop || 0) >= 1) { op = { t: "capital", pid: p.id, cityId: t.id }; break; }
    }
    // a province grown too big for one governor (by conquest or new towns) is split in two
    if (!op && list.length < PROV.maxPerNation) {
      const big = list.map(p => ({ p, cells: provCells(g, p) })).filter(x => x.cells.length >= 2.2 * PROV.target).sort((a, b) => b.cells.length - a.cells.length)[0];
      if (big) {
        const cap = provCapital(g, big.p);
        const parts = partitionCells(g, big.cells, 2, cap ? [cap.cell] : []);
        if (parts.length === 2 && parts[1].cells.length >= PROV.minCells) op = { t: "draw", cells: parts[1].cells, to: null };
      }
    }
    if (!op) continue;
    const q = quoteProvince(w, g, n.id, op, econ);
    if (!q.ok || !canAfford(n, econ.gdp, q.cost).ok || q.cost > 0.04 * econ.gdp) continue;
    orderProject(g, q, "Governing the country");
  }
  void dispatch;
}
