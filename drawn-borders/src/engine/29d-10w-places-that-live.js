/* =====================================================================
   10w. Places that live
   Every village is a place of its own: it has a site (water, a ford, a crossroads, a harbor, high ground...),
   its own people, its own look (chosen by its climate, its site, what it lives from and the era), and a story.
   Villages grow where their site is good and the town nearby does well, shrink in hunger, war and when the
   young leave for the cities, and die when what they lived from is gone, leaving ruins. Where roads meet, a
   market village grows by itself. A big village on a good site asks for a town charter. A new mine makes a
   boomtown, and a worked-out one a bust, but people hold on to their homes for years.
   Hamlets (the small places between the villages) are worked out from the land each time, so they need no
   saving; each one still has its own people and look.
   The site of a place is also what a founder sees before building a town ("site report"), and a town's site
   now changes how fast it grows and how hard it is to take.
   ===================================================================== */
const VIL = {
  share: 0.02,               // a village's share of the people of its land, on an ordinary site
  grid: 0.12,                // hamlets stand on a grid of 6 km squares (the map painter uses the same squares)
  rate: 0.07, boomRate: 0.28, fallRate: 0.06, bustRate: 0.16,   // how fast a village moves toward its size each season
  born: 0.3,                 // a new village starts at this share of the size its site allows
  newPerSeason: 3,           // at most this many new villages a season in each nation
  ruinPop: 0.00025,          // a village with fewer people than this is abandoned (250 people)
  ruinsMax: 90,              // ruins remembered in the world (the oldest fade away)
  histMax: 40, logMax: 12,
  marketDelay: 8,            // seasons a crossroads must stand before a market village grows there
  marketMin: 0.05,           // people a crossroads' land needs for a market village
  charterPop: 0.008,         // a village of 8,000 people may ask for a town charter
  charterScore: 30,          // ... if its site is good enough
  charterCool: 8,            // seasons between two charter questions in one nation
  charterAgain: 20,          // seasons before a refused village asks again
  charterCostShare: 0.25,    // a charter costs a quarter of founding a new town (the village is already there)
  campShare: 0.08,           // of a mine's workers and their families, this share live in the camp beside it
  famShare: 2.2,             // people for each worker
  boomSeasons: 8,            // a mine is "new" for two years
  stayShare: 0.5, staySeasons: 12,   // after a bust, half of those who would leave stay on, for three years
  townGrowMax: 0.0008, townGrowMin: -0.0004, townDefMax: 0.15,
};
const VILLAGE_PLANS = {
  cluster:  { label: "Clustered village", text: "Houses packed close around a green, a well and a church, with fields all around." },
  grove:    { label: "Village among trees", text: "Small groups of houses under shade and fruit trees, gardens and ponds between them, footpaths everywhere." },
  line:     { label: "Street village", text: "One long line of houses along the river bank or the road, each with a strip of land behind it." },
  compound: { label: "Village of walled yards", text: "Family yards behind mud walls with round huts inside, bare sandy ground and footpaths crossing between them." },
  hill:     { label: "Hilltop village", text: "Packed tight on high ground, its lanes steep and narrow, easy to defend." },
  harbor:   { label: "Fishing village", text: "Houses along the shore, boats pulled up on the beach, nets drying and a small stone quay." },
  camp:     { label: "Mining camp", text: "Rows of miners' cottages and wooden barracks beside the pit, with spoil heaps and a railway siding." },
  market:   { label: "Market village", text: "Roads meet at a market square with inns, shops and stables around it." },
  scatter:  { label: "Scattered farms", text: "Farmhouses spread out, each in its own fields, with a chapel and a shop where the lanes cross." },
  modern:   { label: "Modern village", text: "New streets curving to quiet closes and a roundabout, rows of houses, a few flats, and shops on the main road." },
};
const VILLAGE_PLAN_ORDER = ["cluster", "grove", "line", "compound", "hill", "harbor", "camp", "market", "scatter", "modern"];
// how people live around each kind of village: the share of the countryside in hamlets, and a hamlet's usual size
const HAMLET_STYLE = {
  cluster: { share: 0.32, size: 0.0015 }, grove: { share: 0.42, size: 0.0009 }, line: { share: 0.32, size: 0.0014 },
  compound: { share: 0.42, size: 0.0012 }, hill: { share: 0.36, size: 0.0011 }, harbor: { share: 0.3, size: 0.0012 },
  camp: { share: 0.25, size: 0.0010 }, market: { share: 0.3, size: 0.0014 }, scatter: { share: 0.14, size: 0.0003 },
  modern: { share: 0.3, size: 0.0018 },
};
// the features of a site: what each does to a village's size (grow), to a town's growth a season (townGrow) and defence (def)
const SITE_FEATURES = {
  greatriver: { label: "On a great river",            grow: 0.3,   townGrow: 0.0003,  def: 0,    text: "Water all year, fish, and barges that carry goods far inland." },
  bigriver:   { label: "On a big river",              grow: 0.22,  townGrow: 0.0002,  def: 0,    text: "Water all year, fish, and a river big enough for barges." },
  river:      { label: "On a river",                  grow: 0.15,  townGrow: 0.0001,  def: 0,    text: "Water all year round, and fish." },
  stream:     { label: "By a stream",                 grow: 0.05,  townGrow: 0,       def: 0,    text: "A stream gives water, but not much more." },
  coast:      { label: "On the coast",                grow: 0.1,   townGrow: 0.0001,  def: 0,    text: "Fish, salt and boats to other coasts." },
  mouth:      { label: "Where a river meets the sea", grow: 0.2,   townGrow: 0.0003,  def: 0,    text: "Goods come down the river to the ships: the best place for a trading town." },
  bay:        { label: "A sheltered bay",             grow: 0.12,  townGrow: 0.0002,  def: 0,    text: "Calm water where boats are safe from storms: a natural harbor." },
  exposed:    { label: "An open, windy coast",        grow: -0.05, townGrow: 0,       def: 0,    text: "Storms come straight in from the sea." },
  dry:        { label: "Dry land",                    grow: -0.3,  townGrow: -0.0003, def: 0,    text: "Water only from deep wells: a big place cannot live here." },
  floodplain: { label: "On a floodplain",             grow: 0.08,  townGrow: 0,       def: 0,    text: "Rich soil left by the river, but the river floods." },
  drypoint:   { label: "Dry ground above wet land",   grow: 0.1,   townGrow: 0.0001,  def: 0.05, text: "Safe from the floods that cover the land around it." },
  hill:       { label: "High ground",                 grow: -0.05, townGrow: 0,       def: 0.08, text: "Easy to defend and healthy, but harder to farm and to reach." },
  bend:       { label: "Inside a river bend",         grow: 0.05,  townGrow: 0,       def: 0.07, text: "Water on three sides: the old way to build a safe town." },
  gap:        { label: "A pass through the mountains", grow: 0.15, townGrow: 0.0002,  def: 0.05, text: "Every traveller between the valleys goes this way." },
  fertile:    { label: "Good farmland",               grow: 0.1,   townGrow: 0.0001,  def: 0,    text: "Deep soil that feeds many people." },
  poor:       { label: "Poor soil",                   grow: -0.15, townGrow: -0.0001, def: 0,    text: "Thin soil: few people can live from it." },
  forest:     { label: "In the forest",               grow: -0.1,  townGrow: 0,       def: 0.03, text: "Timber all around, but little farmland." },
  road:       { label: "On a road",                   grow: 0.12,  townGrow: 0,       def: 0,    text: "Carts and travellers pass through and buy." },
  halfway:    { label: "A day's journey from the nearest town", grow: 0.2, townGrow: 0, def: 0, text: "Travellers on the road stop here for the night: inns, stables and a market grow up." },
  crossroads: { label: "Roads meet here",             grow: 0.35,  townGrow: 0.0002,  def: 0,    text: "A natural market: everyone passing stops to trade." },
  bridge:     { label: "A bridge over the river",     grow: 0.25,  townGrow: 0.0002,  def: 0.03, text: "All traffic crosses here, and pays for it." },
  lowest:     { label: "The lowest bridge before the sea", grow: 0.2, townGrow: 0.0003, def: 0,  text: "The last place the road can cross before the sea: where roads and ships meet." },
  ford:       { label: "A ford",                      grow: 0.05,  townGrow: 0,       def: 0,    text: "The river is shallow here: people can wade across." },
  remote:     { label: "No road",                     grow: -0.1,  townGrow: 0,       def: 0,    text: "Far from markets: what it grows is hard to sell." },
  mine:       { label: "A mine nearby",               grow: 0,     townGrow: 0,       def: 0,    text: "Work for miners, and shops and inns for them." },
  border:     { label: "Near a border",               grow: -0.08, townGrow: 0,       def: 0,    text: "Trade with neighbours, but the first place armies reach." },
};
let VILLAGE_ECON = null;   // each nation's economy at the end of the season (set by runSeason, so nothing is worked out twice)

/* ---------- The site of a place ---------- */
/* What never changes about a cell's site (worked out once for each world). */
function staticSites(w) {
  if (w._vsite && w._vsite.seed === w.seed) return w._vsite.list;
  const list = new Array(N_CELLS);
  const rc = riverCells(w), RG = riverGeo(w);
  const E = new Float32Array(N_CELLS), MO = new Float32Array(N_CELLS);   // height and wetness at every cell's middle
  for (let i = 0; i < N_CELLS; i++) { E[i] = elevationAt(w.seed, cellX(i) + 0.5, cellY(i) + 0.5); MO[i] = moistureAt(w.seed, cellX(i) + 0.5, cellY(i) + 0.5); }
  for (let i = 0; i < N_CELLS; i++) {
    list[i] = [];
    if (!isLand(w, i)) continue;
    const t = w.terrain[i], x = cellX(i), y = cellY(i), F = list[i];
    const cls = rc[i];
    if (cls >= 4) F.push("greatriver"); else if (cls === 3) F.push("bigriver"); else if (cls === 2) F.push("river"); else if (cls === 1) F.push("stream");
    let sea8 = 0;
    for (const [dx, dy] of DIRS8) if (isSeaXY(w, x + dx, y + dy)) sea8++;
    if (w.coastal[i]) {
      F.push("coast");
      if (cls >= 2) F.push("mouth");
      if (sea8 >= 2 && sea8 <= 3) F.push("bay"); else if (sea8 >= 5) F.push("exposed");
    }
    const m = MO[i];
    if (m < 0.33 && cls < 2 && !w.coastal[i]) F.push("dry");
    const e = E[i];
    let lower = 0, wetAround = 0;
    for (const [dx, dy] of DIRS8) {
      if (!inBounds(x + dx, y + dy)) continue;
      const k = idx(x + dx, y + dy);
      if (!isLand(w, k)) continue;
      if (E[k] < e) lower++;
      if (rc[k] >= 2 || MO[k] > 0.5) wetAround++;
    }
    if (t === T.PLAINS && cls >= 3 && e < w.seaLevel + 0.6 * (w.hillLevel - w.seaLevel)) F.push("floodplain");
    else if (t !== T.MOUNTAIN && lower >= 6 && wetAround >= 3 && (cls >= 2 || m > 0.48)) F.push("drypoint");
    if (t === T.HILLS) F.push("hill");
    // a river that crosses three or four sides of a cell loops round it
    let sides = 0;
    for (const [dx, dy] of DIRS4) { if (!inBounds(x + dx, y + dy)) continue; const r = RG.cross.get(edgeKey(i, idx(x + dx, y + dy))); if (r && r.cls >= 2) sides++; }
    if (sides >= 3) F.push("bend");
    // a pass: open land with mountains on two opposite sides
    if (t !== T.MOUNTAIN) {
      const mtn = (dx, dy) => { for (let s = 1; s <= 2; s++) { const X = x + dx * s, Y = y + dy * s; if (inBounds(X, Y) && w.terrain[idx(X, Y)] === T.MOUNTAIN) return true; } return false; };
      if ((mtn(1, 0) && mtn(-1, 0)) || (mtn(0, 1) && mtn(0, -1)) || (mtn(1, 1) && mtn(-1, -1)) || (mtn(1, -1) && mtn(-1, 1))) F.push("gap");
    }
    if (t === T.FOREST) F.push("forest");
    const food = TERRAIN[t].food + (w.coastal[i] ? ECON.coastalFood : 0);
    if (t === T.PLAINS && !F.includes("dry") && (cls >= 2 || m > 0.42)) F.push("fertile");
    else if (food <= 0.13 && t !== T.FOREST) F.push("poor");
  }
  w._vsite = { seed: w.seed, list };
  return list;
}
/* Roads at each cell this season: how many road segments touch it, and the river bridges they make. */
function roadSites(w, g) {
  const key = g.roads.size + ":" + g.turn;
  if (g._vroad && g._vroad.key === key && g._vroad.roads === g.roads) return g._vroad;
  const deg = new Uint8Array(N_CELLS), bridge = new Map();
  const RG = riverGeo(w), F = riverField(w);
  const lowest = new Map();   // basin -> { key, d }
  for (const k of g.roads) {
    const [a, b] = k.split("-").map(Number);
    if (deg[a] < 255) deg[a]++;
    if (deg[b] < 255) deg[b]++;
    const r = RG.cross.get(k);
    if (!r || r.cls < 2) continue;
    bridge.set(a, r); bridge.set(b, r);
    if (r.basin >= 0) {
      const mx = ((r.basin % F.GW) + 0.5) / F.R, my = (((r.basin / F.GW) | 0) + 0.5) / F.R;
      const d = Math.hypot((cellX(a) + cellX(b)) / 2 + 0.5 - mx, (cellY(a) + cellY(b)) / 2 + 0.5 - my);
      const old = lowest.get(r.basin);
      if (!old || d < old.d) lowest.set(r.basin, { key: k, d, a, b });
    }
  }
  const low = new Set();
  for (const v of lowest.values()) { low.add(v.a); low.add(v.b); }
  const R = { key, roads: g.roads, deg, bridge, low };
  Object.defineProperty(g, "_vroad", { enumerable: false, writable: true, configurable: true, value: R });   // not saved
  return R;
}
/* What the villages look up again and again in a season, worked out once: cells next to a working mine, next to a
   town, near a foreign border, and the town district of every cell. Not saved; rebuilt when the world changes. */
function villageCtx(w, g) {
  const key = `${g.turn}|${g.ver || 0}|${(g.sites || []).length}|${g.cities.length}|${g.roads.size}`;
  if (g._vctx && g._vctx.key === key) return g._vctx;
  const mine = new Uint8Array(N_CELLS), mineAt = new Uint8Array(N_CELLS), town = new Uint8Array(N_CELLS), border = new Uint8Array(N_CELLS);
  const mark = (arr, c, r) => { const x = cellX(c), y = cellY(c); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inBounds(x + dx, y + dy)) arr[idx(x + dx, y + dy)] = 1; };
  for (const s of g.sites || []) if (!s.exhausted && SITE_KINDS[s.kind] && SITE_KINDS[s.kind].res) { mark(mine, s.cell, 1); mineAt[s.cell] = 1; }
  for (const c of g.cities) mark(town, c.cell, 1);
  for (let i = 0; i < N_CELLS; i++) {
    const o = g.owner[i];
    if (o < 0) continue;
    const x = cellX(i), y = cellY(i);
    for (const [dx, dy] of DIRS4) {
      if (!inBounds(x + dx, y + dy)) continue;
      const q = g.owner[idx(x + dx, y + dy)];
      if (q >= 0 && q !== o) { mark(border, i, 2); break; }
    }
  }
  const townDist = new Float32Array(N_CELLS).fill(99);
  for (let i = 0; i < N_CELLS; i++) for (const c of g.cities) { const d = dist(c.cell, i); if (d < townDist[i]) townDist[i] = d; }
  const C = { key, mine, mineAt, town, border, townDist };
  Object.defineProperty(g, "_vctx", { enumerable: false, writable: true, configurable: true, value: C });   // not saved
  return C;
}
/* Every feature of a cell's site now: the fixed ones and those that come from roads, mines and borders. */
function siteFeatures(w, g, cell, nid) {
  const F = staticSites(w)[cell].slice();
  if (!isLand(w, cell)) return F;
  const R = roadSites(w, g);
  const deg = R.deg[cell];
  if (deg >= 3) F.push("crossroads"); else if (deg >= 1) F.push("road");
  if (deg >= 2 && villageCtx(w, g).townDist[cell] >= 2.5) F.push("halfway");
  if (R.bridge.has(cell)) { F.push("bridge"); if (R.low.has(cell)) F.push("lowest"); }
  else if (F.includes("river") || F.includes("stream")) F.push("ford");
  if (!deg && g.cities.every(c => dist(c.cell, cell) > 1.5)) {
    let near = false;
    for (const [dx, dy] of DIRS8) { const X = cellX(cell) + dx, Y = cellY(cell) + dy; if (inBounds(X, Y) && R.deg[idx(X, Y)]) { near = true; break; } }
    if (!near) F.push("remote");
  }
  const C = villageCtx(w, g);
  if (C.mine[cell]) F.push("mine");
  const own = nid !== undefined ? nid : g.owner[cell];
  if (own >= 0) {
    let foreign = own === g.owner[cell] ? C.border[cell] === 1 : false;
    if (own !== g.owner[cell]) {   // a site someone else is weighing (a town on wild land): look around it
      const x = cellX(cell), y = cellY(cell);
      for (let dy = -2; dy <= 2 && !foreign; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (!inBounds(x + dx, y + dy)) continue;
        const o = g.owner[idx(x + dx, y + dy)];
        if (o >= 0 && o !== own) { foreign = true; break; }
      }
    }
    if (foreign) F.push("border");
  }
  return F;
}
function siteSums(F) {
  let grow = 0, townGrow = 0, def = 0;
  for (const k of F) { const S = SITE_FEATURES[k]; if (!S) continue; grow += S.grow; townGrow += S.townGrow; def += S.def; }
  return { grow, townGrow: clamp(townGrow, VIL.townGrowMin, VIL.townGrowMax), def: clamp(def, 0, VIL.townDefMax) };
}
/* How good a site is, 0-100: 50 is an ordinary place. */
function siteScore(F) { return Math.round(clamp(50 + 60 * siteSums(F).grow, 0, 100)); }
function siteWord(score) { return score >= 80 ? "an excellent site" : score >= 65 ? "a very good site" : score >= 52 ? "a good site" : score >= 40 ? "an ordinary site" : score >= 25 ? "a poor site" : "a hard place to live"; }
/* The site report a founder reads before building a town here: every feature with what it does, in numbers the
   engine really uses (a town's growth and defence; claimed food; harbor and wharf chances). */
function siteReport(w, g, cell, nid) {
  const F = siteFeatures(w, g, cell, nid);
  const S = siteSums(F);
  const lines = F.filter(k => SITE_FEATURES[k]).map(k => {
    const D = SITE_FEATURES[k];
    const fx = [];
    if (D.townGrow) fx.push(`${D.townGrow > 0 ? "+" : ""}${(D.townGrow * 400).toFixed(2)}% growth a year`);
    if (D.def) fx.push(`+${Math.round(D.def * 100)}% defence`);
    if (D.grow && !D.townGrow) fx.push(`villages ${D.grow > 0 ? "+" : ""}${Math.round(D.grow * 100)}%`);
    return { key: k, label: D.label, text: D.text, fx, tone: D.grow > 0.001 || D.def > 0 ? "good" : D.grow < -0.001 ? "bad" : "neutral" };
  });
  const rcls = riverCells(w)[cell];
  const notes = [];
  if (w.coastal[cell] && typeof portSeaCell === "function" && portSeaCell(w, cell) >= 0) notes.push("A harbor can be built here (sea trade, the world market, ships).");
  if (typeof wharfCell === "function" && wharfCell(w, cell) >= 0) notes.push("A river wharf can be built here (barges to other river towns).");
  if (rcls < 2 && !w.coastal[cell]) notes.push("No river and no sea: all its trade goes by road.");
  const score = siteScore(F);
  return { cell, features: F, lines, notes, score, word: siteWord(score), townGrow: S.townGrow, def: S.def, grow: S.grow };
}
/* A town's site as the engine uses it each season (growth a season, defence), kept on the town. */
function townSiteRefresh(w, g) {
  for (const c of g.cities) {
    const S = siteSums(siteFeatures(w, g, c.cell, c.owner));
    c.siteGrow = Math.round(S.townGrow * 1e5) / 1e5;
    c.siteDef = Math.round(S.def * 100) / 100;
  }
}

/* ---------- What a village looks like ---------- */
function villagePlanFor(w, g, v, F) {
  if (v.kind === "mine") return "camp";
  if (v.kind === "fish") return "harbor";
  if (v.kind === "market") return "market";
  if (modernAt(w, g, v.cell, v.pop)) return "modern";
  const x = cellX(v.cell) + 0.5, y = cellY(v.cell) + 0.5, m = moistureAt(w.seed, x, y);
  if (m < 0.34 && !F.includes("greatriver") && !F.includes("bigriver")) return "compound";
  if (F.includes("hill")) return "hill";
  if (F.includes("river") || F.includes("bigriver") || F.includes("greatriver") || (F.includes("road") && hash2(v.cell, 3, w.seed + 811) < 0.4)) return "line";
  if (m > 0.48 || F.includes("forest")) return "grove";
  if (g.pop[v.cell] < 0.12 && !F.includes("border")) return "scatter";
  return "cluster";
}
/* From the Electronic Age, villages close to a big city fill with people who work there and are rebuilt with new
   streets: first a few, more in each later era; big villages anywhere follow in the last eras. */
function modernAt(w, g, cell, pop) {
  const era = g.era || 0;
  if (era < 3) return false;
  const h = hash2(cell, 31, w.seed + 913);
  const share = 0.3 + 0.2 * (era - 3);
  const big = g.cities.some(c => dist(c.cell, cell) <= 2.3 && (c.pop || 0) >= 5);
  return (big && h < share) || (era >= 5 && pop >= 0.006 && h < share - 0.3);
}
/* The look of the country around a cell (for its hamlets): the same climate rules, without a village's own reasons. */
function landPlanAt(w, g, cell) {
  const x = cellX(cell) + 0.5, y = cellY(cell) + 0.5, m = moistureAt(w.seed, x, y);
  const F = staticSites(w)[cell];
  if (modernAt(w, g, cell, 0)) return "modern";
  if (m < 0.34) return "compound";
  if (F.includes("hill")) return "hill";
  if (m > 0.48 || F.includes("forest")) return "grove";
  if (g.pop[cell] < 0.12) return "scatter";
  return F.includes("river") || F.includes("bigriver") ? "line" : "cluster";
}
function villageSizeWord(pop) { return pop < 0.0005 ? "hamlet" : pop < 0.0025 ? "village" : pop < 0.006 ? "large village" : "very large village"; }

/* ---------- Villages: who lives where ---------- */
/* What its people live from: a mine next door, a crossroads market, farmland, or a fishing coast. null: too few people
   for a village here. `stay` uses lower thresholds (a village is slow to die). */
function villageKindAt(w, g, i, stay) {
  const p = g.pop[i];
  const R = roadSites(w, g);
  const mine = villageCtx(w, g).mineAt[i] === 1;   // the camp stands at the pit; the villages around it still farm
  if (mine && p >= PROV.villageMine * (stay ? 0.5 : 1)) return "mine";
  const jt = g.villMeta && g.villMeta.junctions ? g.villMeta.junctions[i] : undefined;
  if (marketSpot(w, g, i) && jt !== undefined && g.turn - jt >= VIL.marketDelay && p >= VIL.marketMin * (stay ? 0.7 : 1)) return "market";
  if (cellFood(w, g, i) >= 0.3 && p >= (stay ? PROV.villageOff : PROV.villageOn)) return "farm";
  if (w.coastal[i] && p >= PROV.villageFish * (stay ? 0.8 : 1)) return "fish";
  if (p >= (stay ? PROV.villageOff : PROV.villageOn) * 1.3) return "farm";   // crowded hill and forest land gathers into villages too
  return null;
}
/* Where a market grows by itself, as in history: where roads meet, where a road crosses a river, and at the stop a day's
   journey along the road from the nearest town. */
function marketSpot(w, g, i) {
  const R = roadSites(w, g);
  if (!R.deg[i]) return false;
  return R.deg[i] >= 3 || R.bridge.has(i) || (R.deg[i] >= 2 && villageCtx(w, g).townDist[i] >= 2.5);
}
/* The people living at the mines next to a camp: a share of their workers and families. */
function campPeople(g, cell) {
  let w = 0;
  for (const s of g.sites || []) {
    if (s.exhausted || !SITE_KINDS[s.kind] || !SITE_KINDS[s.kind].res) continue;
    if (s.cell !== cell) continue;
    w += s.lastWorkers || 0;
  }
  return w * VIL.famShare * VIL.campShare;
}
/* How big a village's site and fortunes let it be, with the reasons (each a share of the size it would have). */
function villageTarget(w, g, v, econ) {
  const P = g.pop[v.cell] || 0;
  const F = siteFeatures(w, g, v.cell, g.owner[v.cell]);
  const S = siteSums(F);
  const why = [];
  let mult = Math.max(0.3, 1 + S.grow);
  if (v.kind === "market") { mult *= 1.4; why.push({ label: "Market days bring trade", v: 0.4 }); }
  // the town nearby: a happy, busy town lifts its villages; a miserable one drags them down
  const town = nearestCity(g, v.cell, g.owner[v.cell]);
  if (town) {
    const m = clamp(((town.mood ?? CITY.moodBase) - 50) / 50, -1, 1) * 0.15;
    if (Math.abs(m) > 0.02) why.push({ label: m > 0 ? `${town.name} is doing well` : `${town.name} is unhappy`, v: m });
    mult *= 1 + m;
  }
  // the young leave farm villages for the cities as eras pass; villages near big towns fill with people who work there
  const era = g.era || 0;
  if (v.plan === "modern") { const u = 0.08 * era; mult *= 1 + u; if (u > 0) why.push({ label: "People who work in the town live here", v: u }); }
  else if (v.kind === "farm" && era > 0) { const u = -0.06 * era; mult *= 1 + u; why.push({ label: "The young leave for the cities", v: u }); }
  // hunger and war
  const r = econ && econ.regions ? regionAtCell(econ, v.cell) : null;
  if (r && r.foodRatio < ECON.famineLine) { mult *= 0.7; why.push({ label: "Hunger: families leave", v: -0.3 }); }
  if (g.occ && g.occ[v.cell] >= 0) { mult *= 0.4; why.push({ label: `Occupied by the ${nameOf(g, g.occ[v.cell])}`, v: -0.6 }); }
  let target = P * VIL.share * mult;
  if (v.kind === "mine") {
    const camp = campPeople(g, v.cell);
    if (camp > 0) { target = Math.max(target * 0.5, Math.min(P * 0.25, camp)); why.push({ label: "Miners and their families", v: null }); }
  }
  if (v.kind === "fish") {
    const fishOk = (g.sites || []).some(s => s.kind === "fishing" && !s.exhausted && dist(s.cell, v.cell) <= 1.5);
    if (fishOk) { target *= 1.2; why.push({ label: "A fishing harbor works here", v: 0.2 }); }
  }
  if (v.status === "bust") { target *= 0.12; why.push({ label: "The mine closed", v: -0.88 }); }
  if (v.status === "fading") { target = 0; why.push({ label: "Too few people left to keep it going", v: -1 }); }
  return { target: Math.max(0, target), features: F, why, mult };
}
/* The town district a cell belongs to, in a nation's economy (an index kept on the economy itself). */
function regionAtCell(econ, cell) {
  if (!econ._cellReg) {
    const m = new Int16Array(N_CELLS).fill(-1);
    econ.regions.forEach((r, k) => { for (const c of r.cells) m[c] = k; });
    Object.defineProperty(econ, "_cellReg", { enumerable: false, value: m });
  }
  const k = econ._cellReg[cell];
  return k >= 0 ? econ.regions[k] : null;
}
function villageLog(g, v, text, tone = "neutral") {
  v.log = v.log || [];
  v.log.unshift({ t: g.turn, text, tone });
  if (v.log.length > VIL.logMax) v.log.length = VIL.logMax;
}
function newVillageId(g) { const M = villMeta(g); return M.next++; }
function villMeta(g) {
  if (!g.villMeta) g.villMeta = { next: 1, junctions: {}, lastCharter: {}, chartered: [], ruinsLost: 0 };
  const M = g.villMeta;
  if (!M.junctions) M.junctions = {};
  if (!M.lastCharter) M.lastCharter = {};
  if (!M.chartered) M.chartered = [];
  if (!M.next) M.next = 1;
  return M;
}
/* How long a village that stood before the nation was drawn has been there (from its place, so it never changes). */
function villagePastYears(w, v) {
  const h = hash2(v.cell, 21, w.seed + 4410);
  return Math.round(40 + 560 * h * h + (w.coastal[v.cell] ? 80 : 0));
}
function villageAge(w, g, v) { return v.born > 0 ? Math.max(0, (g.turn - v.born) / 4) : villagePastYears(w, v) + (g.turn || 0) / 4; }
/* Fill in what older saves lack, so every village has its id, site, look, story and population line. */
function ensureVillages(w, g) {
  if (!Array.isArray(g.villages)) g.villages = [];
  const M = villMeta(g);
  for (const v of g.villages) {
    if (!v.id) v.id = M.next++;
    if (!v.status) v.status = "village";
    if (!Array.isArray(v.hist)) v.hist = [];
    if (!Array.isArray(v.log)) { v.log = []; villageLog(g, v, v.born > 0 ? "Grew up from farms in the countryside." : `Has stood here for about ${villagePastYears(w, v)} years.`); }
    if (v.peak === undefined) v.peak = v.pop || 0;
    if (!v.plan) v.plan = villagePlanFor(w, g, v, siteFeatures(w, g, v.cell, g.owner[v.cell]));
    if (!v.since) v.since = g.turn || 0;
  }
}

/* ---------- Each season ---------- */
/* Villages grow and shrink, new ones grow up, markets appear at crossroads, mines make and break camps, emptied
   places become ruins, and big villages on good sites ask for a town charter. Returns news for the player. */
function seasonVillages(w, g, dispatch) {
  if (!g.prov) return [];
  ensureVillages(w, g);
  const M = villMeta(g);
  const news = [];
  const say = (v, text, tone, chron) => {
    villageLog(g, v, text, tone);
    if (g.owner[v.cell] === PLAYER) {
      news.push({ text: `${v.name}: ${text}`, tone, cell: v.cell });
      if (chron) addChronicle(g, `${v.name}: ${text}`, tone === "bad" ? "warn" : tone === "good" ? "good" : "neutral", PLAYER);
    }
  };
  const R = roadSites(w, g);
  // crossroads: remember when each first appeared, so a market can grow there in time
  for (let i = 0; i < N_CELLS; i++) {
    if (marketSpot(w, g, i)) { if (M.junctions[i] === undefined) M.junctions[i] = g.turn; }
    else if (M.junctions[i] !== undefined) delete M.junctions[i];
  }
  const econOf = nid => (VILLAGE_ECON && VILLAGE_ECON.get(nid)) || null;
  const townAt = new Set(g.cities.map(c => c.cell));
  const C = villageCtx(w, g);
  const nearTown = i => C.town[i] === 1;
  const byCell = new Map();
  // 1. the villages there are
  for (const v of g.villages) {
    if (v.status === "ruin") { byCell.set(v.cell, v); continue; }
    const own = g.owner[v.cell];
    // a town now stands on it or right beside it: the town has swallowed the village
    if (townAt.has(v.cell) || nearTown(v.cell)) {
      const c = g.cities.find(x => dist(x.cell, v.cell) <= 1.5);
      if (c && v.pop > 0) { cityHist(g, c, `Grew out over the old village of ${v.name}.`, "neutral"); }
      v.status = "swallowed"; continue;
    }
    if (own < 0) { v.status = "ruin"; v.ruinAt = g.turn; v.pop = 0; villageLog(g, v, "Its land was left without a nation, and its people scattered.", "bad"); byCell.set(v.cell, v); continue; }
    const kind = villageKindAt(w, g, v.cell, true);
    if (v.kind === "mine" && kind !== "mine" && v.status !== "bust") { v.status = "bust"; say(v, "The mine has closed. The miners are leaving.", "bad", true); }
    else if (kind && kind !== v.kind && v.status !== "bust") {
      if (kind === "market") say(v, roadSites(w, g).deg[v.cell] >= 3 ? "Roads meet here now, and a weekly market has opened on the green." : roadSites(w, g).bridge.has(v.cell) ? "Everyone crossing the bridge passes through: a weekly market has opened." : "Travellers on the road stop here for the night: inns, stables and a market have opened.", "good", true);
      else if (kind === "mine") say(v, "A mine has opened next to the village.", "good");
      v.kind = kind;
    }
    if (!kind && v.status !== "bust" && v.status !== "fading") { v.status = "fading"; say(v, "Too few people are left on the land around it: the village is emptying.", "warn"); }
    else if (kind && v.status === "fading") { v.status = "village"; say(v, "People came back to the land, and the village lives again.", "good"); }
    // a busted camp that farmland can feed lives on as a farm village
    if (v.status === "bust" && kind === "farm" && v.pop < 0.002) { v.status = "village"; v.kind = "farm"; say(v, "The miners have gone, but farmers stayed on: it is a farm village now.", "neutral"); }
    // a new mine: a boom
    if (v.kind === "mine" && v.status !== "bust") {
      const fresh = (g.sites || []).some(s => !s.exhausted && SITE_KINDS[s.kind] && SITE_KINDS[s.kind].res && s.cell === v.cell && g.turn - (s.opened || 0) <= VIL.boomSeasons && s.opened > 0);
      if (fresh && v.status !== "boom") { v.status = "boom"; say(v, "A new mine has opened: fortune seekers pour in, tents and shacks go up overnight.", "good", true); }
      else if (!fresh && v.status === "boom") { v.status = "village"; say(v, "The boom has settled: the camp is a mining village now.", "neutral"); }
    }
    const econ = econOf(own);
    const T = villageTarget(w, g, v, econ);
    const plan = villagePlanFor(w, g, v, T.features);
    if (plan !== v.plan) {
      if (plan === "modern") say(v, "New streets of modern houses are going up for people who work in the town.", "good");
      else if (plan === "camp") say(v, "Miners' cottages and barracks spread along the pit.", "neutral");
      else if (plan === "market") say(v, "Inns and shops have gone up around the new market square.", "good");
      v.plan = plan;
    }
    const before = v.pop || 0;
    const rate = v.status === "boom" ? VIL.boomRate : v.status === "bust" ? VIL.bustRate : T.target < before ? VIL.fallRate : VIL.rate;
    let pop = before + (T.target - before) * rate;
    if (g.occ && g.occ[v.cell] >= 0 && !v.occBy) { v.occBy = g.occ[v.cell]; say(v, `Soldiers of the ${nameOf(g, g.occ[v.cell])} marched in. Many families fled.`, "bad", true); }
    else if (v.occBy !== undefined && v.occBy !== null && !(g.occ && g.occ[v.cell] >= 0)) { v.occBy = null; say(v, "The soldiers have gone. Families are coming home.", "good"); }
    pop = Math.max(0, Math.min(pop, (g.pop[v.cell] || 0) * 0.4));
    v.pop = Math.round(pop * 1e6) / 1e6;
    v.target = Math.round(T.target * 1e6) / 1e6;
    v.hist = (v.hist || []).concat([Math.round(v.pop * 1e6)]).slice(-VIL.histMax);
    // milestones
    for (const m of [0.001, 0.0025, 0.005, 0.008, 0.012]) if (before < m && v.pop >= m && (v.peak || 0) < m) say(v, `Has grown to ${fmtCount(m * 1e6)} people.`, "good");
    v.peak = Math.max(v.peak || 0, v.pop);
    if (v.pop < VIL.ruinPop && (v.status === "bust" || v.status === "fading" || T.target < VIL.ruinPop)) {
      v.status = "ruin"; v.ruinAt = g.turn; v.pop = 0;
      say(v, `The last families have left. ${v.name} is abandoned: its roofs fall in and fields grow wild.`, "bad", true);
    }
    byCell.set(v.cell, v);
  }
  g.villages = g.villages.filter(v => v.status !== "swallowed");
  // 2. new villages: where people crowd the land and no village stands yet (gathered a few at a time, so the map comes alive)
  const born = new Map();
  const cand = [];
  for (let i = 0; i < N_CELLS; i++) {
    const own = g.owner[i];
    if (own < 0 || townAt.has(i) || nearTown(i)) continue;
    const old = byCell.get(i);
    if (old && old.status !== "ruin") continue;
    if (g.pop[i] < Math.min(PROV.villageMine, VIL.marketMin)) continue;
    const kind = villageKindAt(w, g, i, false);
    if (!kind) continue;
    cand.push({ i, kind, own, s: (kind === "market" ? 1 : 0) + g.pop[i] + hash2(i, 7, w.seed) * 0.01 });
  }
  cand.sort((a, b) => b.s - a.s || a.i - b.i);
  const first = !g.villages.length || !g.turn;
  const taken = new Set(g.villages.map(v => v.name));
  for (const c of cand) {
    const k = born.get(c.own) || 0;
    if (!first && k >= VIL.newPerSeason) continue;
    born.set(c.own, k + 1);
    const ruin = byCell.get(c.i);
    let v;
    if (ruin) {
      v = ruin;
      v.status = "village"; v.kind = c.kind; v.pop = 0; v.since = g.turn; v.ruinAt = undefined;
      say(v, "Settlers have come back to the old ruins and rebuilt the village.", "good", true);
    } else {
      v = { id: newVillageId(g), cell: c.i, name: villageName(w, g, c.i, taken), kind: c.kind, born: first ? 0 : g.turn, since: g.turn || 0, pop: 0, peak: 0, status: "village", hist: [], log: [] };
      taken.add(v.name);
      g.villages.push(v);
      if (first) villageLog(g, v, `Has stood here for about ${villagePastYears(w, v)} years.`);
      else say(v, c.kind === "market" ? (roadSites(w, g).deg[c.i] >= 3 ? "A market village has grown up where the roads meet." : roadSites(w, g).bridge.has(c.i) ? "A market village has grown up at the bridge." : "A market village has grown up around the inns on the road.") : c.kind === "mine" ? "A camp has grown up beside the mine." : c.kind === "fish" ? "Fishing families have built a new village on the shore." : "A new village has grown up among the farms.", "good");
    }
    const T = villageTarget(w, g, v, econOf(c.own));
    v.plan = villagePlanFor(w, g, v, T.features);
    v.pop = Math.round(T.target * (first ? 1 : VIL.born) * 1e6) / 1e6;
    v.target = Math.round(T.target * 1e6) / 1e6;
    v.peak = Math.max(v.peak || 0, v.pop);
    v.hist = [Math.round(v.pop * 1e6)];
    byCell.set(c.i, v);
  }
  // 3. ruins fade from memory after many years, the oldest first
  const ruins = g.villages.filter(v => v.status === "ruin").sort((a, b) => (a.ruinAt || 0) - (b.ruinAt || 0));
  if (ruins.length > VIL.ruinsMax) { const drop = new Set(ruins.slice(0, ruins.length - VIL.ruinsMax)); g.villages = g.villages.filter(v => !drop.has(v)); M.ruinsLost = (M.ruinsLost || 0) + drop.size; }
  g.villages.sort((a, b) => a.cell - b.cell);
  // 4. towns: their site, their mines' booms and busts
  townSiteRefresh(w, g);
  townBoomsAndBusts(w, g, news);
  // 5. charters: a big village on a good site asks to become a town
  charterSeason(w, g, news, dispatch);
  if (dispatch) dispatch.villages = news;
  return news;
}
/* A town whose new mine draws crowds is a boomtown for a while; when its mine is worked out, its people hold on to
   their homes for years before they leave (they leave half as fast for three years). */
function townBoomsAndBusts(w, g, news) {
  for (const s of g.sites || []) {
    if (!SITE_KINDS[s.kind] || !SITE_KINDS[s.kind].res) continue;
    const c = nearestCity(g, s.cell, g.owner[s.cell]);
    if (!c || dist(c.cell, s.cell) > 3) continue;
    if (!s.exhausted && s.opened > 0 && g.turn - s.opened <= VIL.boomSeasons && (s.lastWorkers || 0) >= 0.02) {
      if (!cityModsActive(g, c).some(m => m.key === "boom")) {
        addCityMod(g, c, { key: "boom", label: `Boomtown: newcomers crowd in for ${s.name}`, mood: -3, seasons: Math.max(1, VIL.boomSeasons - (g.turn - s.opened)) });
        cityHist(g, c, `Became a boomtown when ${s.name} opened.`, "good");
        if (c.owner === PLAYER) news.push({ text: `${c.name} is a boomtown: newcomers crowd in for the work at ${s.name}. Camps and saloons spring up; prices and tempers rise.`, tone: "neutral", cell: c.cell });
      }
    }
    if (s.exhausted && s.exhaustedAt === g.turn - 1 && !cityModsActive(g, c).some(m => m.key === "stay")) {
      addCityMod(g, c, { key: "stay", label: "People hold on: their homes, families and shops are here", stay: VIL.stayShare, seasons: VIL.staySeasons });
      cityHist(g, c, `${s.name} was worked out. Most families stayed on at first.`, "warn");
    }
  }
}
/* How much of the usual leaving a town's people hold back (0 to 1). */
function cityStay(g, c) {
  let s = 0;
  for (const m of cityModsActive(g, c)) if (m.stay) s = Math.max(s, m.stay);
  return clamp(s, 0, 0.9);
}

/* ---------- Town charters ---------- */
/* A village may ask for a charter when it is big, on a good site, joined by road, and far enough from every town. */
function charterCheck(w, g, v) {
  const nid = g.owner[v.cell];
  if (nid < 0 || !g.nations[nid] || !g.nations[nid].alive) return { ok: false, why: ["No nation holds its land."] };
  if (v.status === "ruin" || v.status === "bust" || v.status === "fading") return { ok: false, why: ["It is not growing."] };
  if (g.occ && g.occ[v.cell] >= 0) return { ok: false, why: ["It is occupied."] };
  const F = siteFeatures(w, g, v.cell, nid);
  const score = siteScore(F);
  const near = g.cities.reduce((m, c) => Math.min(m, dist(c.cell, v.cell)), Infinity);
  const why = [];
  if (v.pop < VIL.charterPop) why.push(`It needs ${fmtCount(VIL.charterPop * 1e6)} people (it has ${fmtCount(v.pop * 1e6)}).`);
  if (score < VIL.charterScore) why.push(`Its site is too poor (${score}; ${VIL.charterScore} needed).`);
  if (near < BUILD.townMinSpacing) why.push(`A town is too close (${near.toFixed(1)} cells; ${BUILD.townMinSpacing} needed).`);
  if (!roadSites(w, g).deg[v.cell]) why.push("No road reaches it.");
  if (g.projects.some(p => p.kind === "town" && dist(p.site, v.cell) < BUILD.townMinSpacing)) why.push("A new town is being founded nearby.");
  return { ok: !why.length, why, score, near, nid };
}
function charterCost(g, nid) {
  const towns = g.cities.filter(c => c.owner === nid).length;
  return Math.round(BUILD.townBaseB * (1 + 0.12 * towns) * VIL.charterCostShare * 10) / 10;
}
/* Once a season: in each nation, at most one village asks (and none soon after the last). Rivals answer at once by their
   character; the player's question waits for the storyteller (it is asked like any decision). */
function charterSeason(w, g, news, dispatch) {
  const M = villMeta(g);
  M.pendingCharter = (M.pendingCharter || []).filter(p => g.villages.some(v => v.id === p.vid));
  for (const n of liveNations(g)) {
    if (g.turn < 6) continue;
    if (g.turn - (M.lastCharter[n.id] ?? -99) < VIL.charterCool) continue;
    if (n.id === PLAYER && (g.decisions.some(d => d.key === "townCharter") || M.pendingCharter.some(p => p.nid === PLAYER))) continue;
    const cands = g.villages.filter(v => g.owner[v.cell] === n.id && v.pop >= VIL.charterPop && (!v.charter || g.turn - (v.charter.asked || -99) >= VIL.charterAgain));
    let best = null, bs = -1;
    for (const v of cands) {
      const ch = charterCheck(w, g, v);
      if (!ch.ok) continue;
      const s = v.pop * 1000 + ch.score;
      if (s > bs) { bs = s; best = v; }
    }
    if (!best) continue;
    best.charter = { asked: g.turn };
    M.lastCharter[n.id] = g.turn;
    if (n.id === PLAYER) { M.pendingCharter.push({ nid: n.id, vid: best.id }); continue; }
    const c = decisionCtx(w, g, n.id, mulberry32((w.seed * 31 + g.turn * 977 + n.id * 13 + best.id) >>> 0));
    const d = makeDecision(c, "townCharter", { w: 1, vid: best.id });
    if (!d) continue;
    const o = aiPickOption(c, d);
    decide(w, g, d, o.id, false);
  }
  void news; void dispatch;
}
/* The player's charter question, asked by the storyteller at the end of the season. */
function charterDecisions(w, g, rng) {
  const M = villMeta(g);
  const out = [];
  for (const p of (M.pendingCharter || []).filter(x => x.nid === PLAYER)) {
    const d = makeDecision(decisionCtx(w, g, PLAYER, rng), "townCharter", { w: 1, vid: p.vid });
    if (d) out.push(d);
  }
  M.pendingCharter = (M.pendingCharter || []).filter(x => x.nid !== PLAYER);
  return out;
}
/* Turn a village into a town (the "charterTown" effect of the decision). */
function grantCharter(w, g, nid, vid, makeCapital) {
  const v = g.villages.find(x => x.id === vid);
  if (!v || g.owner[v.cell] !== nid || g.cities.some(c => c.cell === v.cell)) return null;
  const pop = v.pop;
  const born = { id: g.nextId++, owner: nid, cell: v.cell, name: v.name, capital: false, port: false, irrigated: false, founded: g.turn, origin: nid, loyalty: 82, mood: 62, hist: [], fromVillage: { born: v.born, pop, since: v.since } };
  g.cities.push(born);
  if (g.usedNames) g.usedNames.add(v.name);
  cityHist(g, born, `Was the village of ${v.name}${v.born > 0 ? `, which grew up in ${seasonLabel(v.born)}` : `, about ${Math.round(villageAge(w, g, v))} years old`}, with ${fmtCount(pop * 1e6)} people.`, "neutral");
  cityHist(g, born, `Granted a town charter by the ${nameOf(g, nid)}.`, "good");
  if (typeof leaderDeed === "function") leaderDeed(g, nid, "towns");
  const M = villMeta(g);
  M.chartered.unshift({ name: v.name, cell: v.cell, nid, turn: g.turn, pop, cityId: born.id });
  if (M.chartered.length > 40) M.chartered.length = 40;
  // the villages right beside it become part of the new town
  const inside = g.villages.filter(x => x !== v && Math.abs(cellX(x.cell) - cellX(v.cell)) <= 1 && Math.abs(cellY(x.cell) - cellY(v.cell)) <= 1);
  for (const x of inside) if (x.status !== "ruin") cityHist(g, born, `Took in the village of ${x.name}.`, "neutral");
  g.villages = g.villages.filter(x => x !== v && !inside.includes(x));
  if (makeCapital && g.provinces) {
    const p = provById(g, g.prov[v.cell]);
    if (p && p.owner === nid && !provCapital(g, p)) { p.capital = born.id; cityHist(g, born, `Became the capital of ${p.name}.`, "good"); }
  }
  bumpWorld(g);
  return born;
}
/* What a charter would change: the land the new town would take as its own district, and the output gained. */
function charterPreview(w, g, nid, v) {
  const city = { id: -2, owner: nid, cell: v.cell, name: v.name, capital: false, port: false, irrigated: false, founded: g.turn, origin: nid, loyalty: 82, mood: 62, hist: [] };
  const own = g.cities.filter(c => c.owner === nid);
  const cells = [];
  let pop = 0;
  const from = new Map();
  for (let i = 0; i < N_CELLS; i++) {
    if (g.owner[i] !== nid) continue;
    let best = null, bd = Infinity;
    for (const c of own) { const d = (cellX(i) - cellX(c.cell)) ** 2 + (cellY(i) - cellY(c.cell)) ** 2; if (d < bd) { bd = d; best = c; } }
    const dn = (cellX(i) - cellX(v.cell)) ** 2 + (cellY(i) - cellY(v.cell)) ** 2;
    if (dn < bd) { cells.push(i); pop += g.pop[i]; if (best) from.set(best.name, (from.get(best.name) || 0) + 1); }
  }
  let dGdp = 0;
  try { dGdp = projectValue(w, g, nid, { city }).dGdp; } catch (e) { dGdp = 0; }
  return { cells: cells.length, pop, from: [...from.entries()].sort((a, b) => b[1] - a[1]), dGdp };
}

/* ---------- Hamlets: the small places between the villages ---------- */
/* The hamlets of one cell, worked out from its people and land each time (never saved): each stands on one of the 6 km
   squares whose centre lies in the cell, and has its own people and look. Their people add up to the hamlets' share of
   the cell. Squares under a town, a village, the sea or the mountains are left empty. */
function hamletsOf(w, g, cell) {
  if (!isLand(w, cell) || w.terrain[cell] === T.MOUNTAIN) return [];
  const P = g.pop[cell] || 0;
  if (P < 0.01) return [];
  if (g.cities.some(c => c.cell === cell)) return [];
  // hamlets are built like the village of their land, if it has one of the country kinds
  const vil = (g.villages || []).find(x => x.cell === cell && x.status !== "ruin");
  const plan = vil && ["cluster", "grove", "line", "compound", "hill", "scatter", "modern"].includes(vil.plan) ? vil.plan : landPlanAt(w, g, cell);
  const HS = HAMLET_STYLE[plan];
  const total = P * HS.share * (g.owner[cell] >= 0 ? 1 : 0.6);
  const G = VIL.grid, x0 = cellX(cell), y0 = cellY(cell);
  // only cells by the sea need each square tested for water (inland every square is land)
  let nearSea = false;
  for (const [dx, dy] of DIRS8) if (isSeaXY(w, x0 + dx, y0 + dy)) { nearSea = true; break; }
  const sq = [];
  for (let cy = Math.ceil(y0 / G - 0.5); (cy + 0.5) * G < y0 + 1; cy++) for (let cx = Math.ceil(x0 / G - 0.5); (cx + 0.5) * G < x0 + 1; cx++) {
    const x = (cx + 0.5) * G, y = (cy + 0.5) * G;
    if (Math.floor(x) !== x0 || Math.floor(y) !== y0) continue;
    if (nearSea && elevationAt(w.seed, x, y) + 0.03 * (fbm(x * 1.9, y * 1.9, w.seed + 333, 4) - 0.5) <= w.seaLevel + 0.003) continue;
    sq.push({ cx, cy, x, y, h: hash2(cx, cy, w.seed + 7100) });
  }
  if (!sq.length) return [];
  // away from towns that spill over from neighbouring cells
  const towns = g.cities.filter(c => Math.abs(cellX(c.cell) - x0) <= 2 && Math.abs(cellY(c.cell) - y0) <= 2);
  const free = sq.filter(s => !towns.some(c => Math.hypot(s.x - cellX(c.cell) - 0.5, s.y - cellY(c.cell) - 0.5) < (0.24 + 0.21 * Math.sqrt(Math.max(0, c.pop || 0.5))) * 1.15));
  const want = clamp(Math.round(total / HS.size), 1, Math.max(1, Math.round(free.length * 0.6)));   // never every square: fields and woods between them
  const pick = free.sort((a, b) => a.h - b.h).slice(0, want);
  const W = pick.reduce((s, q) => s + 0.4 + hash2(q.cx, q.cy, w.seed + 7105), 0);
  return pick.map(q => {
    const share = (0.4 + hash2(q.cx, q.cy, w.seed + 7105)) / W;
    // somewhere in its square, but never over the edge of its cell
    const hx = clamp((q.cx + 0.2 + 0.6 * hash2(q.cx, q.cy, w.seed + 7101)) * G, x0 + 0.01, x0 + 0.99), hy = clamp((q.cy + 0.2 + 0.6 * hash2(q.cx, q.cy, w.seed + 7102)) * G, y0 + 0.01, y0 + 0.99);
    return { cx: q.cx, cy: q.cy, x: hx, y: hy, pop: total * share, plan, cell };
  });
}
/* Who lives where in one cell: its village, its hamlets, and those on farms (or the town, in a town's cell). */
function cellSettlement(w, g, cell) {
  const P = g.pop[cell] || 0;
  const town = g.cities.find(c => c.cell === cell) || null;
  const v = (g.villages || []).find(x => x.cell === cell && x.status !== "ruin") || null;
  const hamlets = town ? [] : hamletsOf(w, g, cell);
  const inHamlets = hamlets.reduce((s, h) => s + h.pop, 0);
  const inVillage = v ? v.pop : 0;
  return { P, town, village: v, hamlets, inHamlets, inVillage, onFarms: Math.max(0, P - inHamlets - inVillage), plan: landPlanAt(w, g, cell) };
}
/* A nation's villages in numbers, for panels and statistics. */
function villageStats(w, g, nid) {
  const list = (g.villages || []).filter(v => g.owner[v.cell] === nid);
  const live = list.filter(v => v.status !== "ruin");
  const byKind = {}, byPlan = {};
  for (const v of live) { byKind[v.kind] = (byKind[v.kind] || 0) + 1; byPlan[v.plan] = (byPlan[v.plan] || 0) + 1; }
  let people = 0, growing = 0, shrinking = 0;
  for (const v of live) {
    people += v.pop;
    const h = v.hist || [];
    const a = h.length >= 5 ? h[h.length - 5] : h[0];
    if (a && v.pop * 1e6 > a * 1.01) growing++; else if (a && v.pop * 1e6 < a * 0.99) shrinking++;
  }
  const M = villMeta(g);
  return {
    count: live.length, ruins: list.length - live.length, people, growing, shrinking, byKind, byPlan,
    biggest: live.slice().sort((a, b) => b.pop - a.pop).slice(0, 8),
    booms: live.filter(v => v.status === "boom"), markets: live.filter(v => v.kind === "market"),
    ready: live.filter(v => v.pop >= VIL.charterPop * 0.75).map(v => ({ v, check: charterCheck(w, g, v) })),
    chartered: M.chartered.filter(c => c.nid === nid),
  };
}

/* ---------- The charter question ---------- */
Object.assign(DECISIONS, {
  townCharter: {
    cat: "Towns", icon: "coin", tone: "good", followOnly: true,
    find: () => null,
    make: (c, f) => {
      const v = (c.g.villages || []).find(x => x.id === f.vid);
      if (!v) return null;
      const ch = charterCheck(c.w, c.g, v);
      if (!ch.ok || ch.nid !== c.nid) return null;
      const cost = charterCost(c.g, c.nid);
      const pv = charterPreview(c.w, c.g, c.nid, v);
      const rep = siteReport(c.w, c.g, v.cell, c.nid);
      const good = rep.lines.filter(l => l.tone === "good").slice(0, 3).map(l => l.label.toLowerCase());
      const p = provAt(c.g, v.cell);
      const terr = p && !provCapital(c.g, p);
      const from = pv.from.slice(0, 2).map(([name]) => name);
      const age = v.born > 0 ? `grew up ${Math.max(1, Math.round((c.g.turn - v.born) / 4))} years ago` : `has stood for about ${Math.round(villageAge(c.w, c.g, v))} years`;
      const charter = extra => ({ t: "charterTown", vid: v.id, name: v.name, cells: pv.cells, people: pv.pop, dGdp: pv.dGdp, ...extra });
      const town = nearestCity(c.g, v.cell, c.nid);
      return {
        title: `${v.name} asks for a town charter`, cell: v.cell, villageId: v.id,
        body: `${v.name} ${age} and is now ${aAn(villageSizeWord(v.pop))} of ${fmtCount(v.pop * 1e6)} people, on ${rep.word}${good.length ? ` (${good.join(", ")})` : ""}. Its people ask for a town charter: their own council, a court and a market hall. `
          + `As a town it would take the nearest land as its own district: ${pv.cells} cell${pv.cells === 1 ? "" : "s"} with ${fmtPeople(pv.pop)} people${from.length ? `, now part of ${from.join(" and ")}` : ""}. `
          + `${pv.dGdp > 0.05 ? `Your ministers expect output to rise by ${fmtMoney(pv.dGdp)} a year.` : pv.dGdp < -0.05 ? `Your ministers expect output to fall by ${fmtMoney(-pv.dGdp)} a year at first (a new town's offices cost more than they bring).` : "It would change output very little at first."}`,
        options: [
          { id: "a", tag: "bold", label: `Grant the charter (${fmtMoney(cost)} for its town hall)`, effects: [{ t: "money", v: -cost }, charter({})] },
          ...(terr ? [{ id: "c", tag: "proud", label: `Grant it and make it the capital of ${p.name}`, effects: [{ t: "money", v: -Math.round(cost * 1.6 * 10) / 10 }, charter({ capitalOf: p.name })] }] : []),
          { id: "b", tag: "thrift", label: "Not yet: it stays a village", effects: [{ t: "villageRefuse", vid: v.id, name: v.name }, ...(town ? [{ t: "cityMod", cityId: town.id, key: "charter_refused", label: `${v.name} was refused a charter`, mood: -2, seasons: 4 }] : [])] },
        ],
        def: c.n.treasury > cost * 2 ? "a" : "b",
      };
    },
  },
});
