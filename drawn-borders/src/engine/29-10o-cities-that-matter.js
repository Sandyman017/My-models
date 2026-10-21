/* =====================================================================
   10o. Cities that matter: each city's importance, character, mood and loyalty, and the programs that shape it
   Borrowed ideas: Hearts of Iron (victory points: some cities weigh far more in war), Europa Universalis and
   Victoria (provinces with their own worth, unrest and the pull of a lost homeland that lasts for generations),
   Civilization (cities that specialize), Anno and Cities: Skylines (each kind of district has its own needs).
   Importance is worked out from what the city really is: people, output, the seat of government, a harbor,
   rivers and roads, industry, mines, farms, universities, borders and history. Every number lists its causes.
   ===================================================================== */
const CITY = {
  moodBase: 55, moodPull: 0.3, outPerMood: 0.0012,
  unrestAt: 40, unrestK: 0.3, unrestCap: 5,
  occK: 8, occCap: 6,
  loyalNative: 92, loyalWar: 20, loyalDeal: 38, loyalBack: 80,
  loyalRate: 1.2, loyalMoodK: 0.04, loyalResist: 50, loyalRaise: 40, integrate: 85, integrateSeasons: 8,
  histMax: 16, popHistMax: 40, seatMax: 2,
};
// a town's people are everyone who lives in its land: the city and the farms and villages around it
const CITY_TIERS = [
  { key: "small", label: "Small town", min: 0 }, { key: "town", label: "Town", min: 2 }, { key: "city", label: "City", min: 5 },
  { key: "large", label: "Large city", min: 10 }, { key: "metro", label: "Metropolis", min: 18 },
];
const CITY_CLASSES = [
  { key: "local", label: "Local town", min: 0 }, { key: "regional", label: "Regional centre", min: 25 }, { key: "major", label: "Major city", min: 45 },
  { key: "great", label: "Great city", min: 65 }, { key: "world", label: "World city", min: 85 },
];
function cityTier(pop) { let t = CITY_TIERS[0]; for (const x of CITY_TIERS) if ((pop || 0) >= x.min) t = x; return t; }
function cityClass(imp) { let t = CITY_CLASSES[0]; for (const x of CITY_CLASSES) if ((imp || 0) >= x.min) t = x; return t; }
function cityClassIndex(imp) { return CITY_CLASSES.indexOf(cityClass(imp)); }
function cityOrd(k) { const s = ["th", "st", "nd", "rd"], v = k % 100; return k + (s[(v - 20) % 10] || s[v] || s[0]); }

/* What a city is: each role comes from its real numbers, and decides what its people care about and which
   programs it can take. */
const CITY_ROLES = {
  capital:    { label: "Capital", icon: "lorc/queen-crown", tip: "Seat of the government: ministries, parliament and the national food reserve. The nation's pride, and the prize every enemy wants." },
  seat:       { label: "Provincial seat", icon: "delapouite/vote", tip: "A governor, courts and offices of the ministries govern the region from here. If the capital falls, the government moves here." },
  front:      { label: "Front line", icon: "sbed/fire", tip: "Enemy soldiers hold ground within a few days' march." },
  port:       { label: "Port city", icon: "lorc/anchor", tip: "Ships from the whole world load and unload here: the nation's door to the world's markets." },
  metro:      { label: "Metropolis", icon: "delapouite/modern-city", tip: "Over 18 million people. Big cities are more productive (more firms, more customers), but crime and traffic weigh on their people." },
  industrial: { label: "Industrial city", icon: "delapouite/factory", tip: "Mills, plants and works employ many of its people. Smoke from heavy industry weighs on the city." },
  arsenal:    { label: "Arsenal", icon: "lorc/crossed-swords", tip: "Steel, machinery and chemical works that arm the nation: a target in any war." },
  mining:     { label: "Mining town", icon: "lorc/mining", tip: "Mines and oil fields worked from here. Miners care about safe shifts, and fear the day the deposit runs out." },
  farm:       { label: "Farm country", icon: "lorc/wheat", tip: "Its farms feed people in other towns. Farmers watch the harvest and the government's help." },
  energy:     { label: "Power town", icon: "lorc/power-lightning", tip: "Its power stations light a large share of the nation." },
  learning:   { label: "University town", icon: "delapouite/graduate-cap", tip: "Universities and laboratories. Students and teachers care about spending on education." },
  finance:    { label: "Banking centre", icon: "delapouite/bank", tip: "Banks, head offices and broadcasters." },
  resort:     { label: "Resort town", icon: "lorc/sun", tip: "Visitors come for its beaches or mountains. In war they stay away." },
  fishing:    { label: "Fishing town", icon: "delapouite/fishing", tip: "Its fleets fish the sea nearby. Empty nets mean hard times." },
  frontier:   { label: "Border town", icon: "sbed/shield", tip: "A few days' march from a foreign army. Its people fear a dangerous neighbor and feel safer with soldiers close by." },
  river:      { label: "River town", icon: "delapouite/stone-bridge", tip: "On a navigable river: barges, bridges and floods." },
  hub:        { label: "Crossroads", icon: "delapouite/crossroad", tip: "Roads leave in many directions: traders and travellers pass through." },
  heritage:   { label: "Old town", icon: "delapouite/greek-temple", tip: "An old city with a long history: 250 years or more, a former capital, or a great work standing in it." },
  newtown:    { label: "New town", icon: "delapouite/house", tip: "Founded only a few years ago." },
  foreign:    { label: "Under a new flag", icon: "lorc/flying-flag", tip: "It belonged to another nation, and many of its people still feel they belong there." },
};

/* City programs: one per city, chosen where the city's geography and character allow it. Each is set up like a
   project (paid once, takes a season or two) and costs upkeep every season while it runs. */
const FOCI = {
  port:     { label: "Free port", icon: "delapouite/harbor-dock", area: "economy", setup: 0.035, seasons: 1, upkeep: 0.0035, mood: 3,
              does: "A customs-free harbor district for merchants, warehouses and shipping lines: services here +8%, the harbor handles 50% more trade, people +3 happier." },
  industry: { label: "Industrial zone", icon: "delapouite/factory", area: "economy", setup: 0.03, seasons: 1, upkeep: 0.0025, mood: 0,
              does: "Land, rail sidings and power set aside for works: new factories and offices here cost 20% less, there is room for 2 more, and its industry makes 8% more. Smoke weighs twice as much on the people." },
  fortress: { label: "Fortress city", icon: "delapouite/military-fort", area: "defence", setup: 0.04, seasons: 2, upkeep: 0.004, mood: 0,
              does: "Walls, bunkers, depots and anti-aircraft guns: defenders fight 30% harder here, and its people stop fearing the neighbor (+3 instead)." },
  learning: { label: "University town", icon: "delapouite/graduate-cap", area: "interior", setup: 0.03, seasons: 1, upkeep: 0.003, mood: 2,
              does: "Grants for colleges, laboratories and student housing: +2 research a season, +1 more for each university or tech park level here, workforce skill +1 point, people +2 happier." },
  market:   { label: "Market town", icon: "delapouite/shop", area: "economy", setup: 0.02, seasons: 1, upkeep: 0.002, mood: 1,
              does: "Fairs, warehouses and a trading exchange where the roads meet: services here +6%, and people looking for work come here first (+30%)." },
  farms:    { label: "Farm country", icon: "delapouite/barn", area: "agriculture", setup: 0.03, setupFood: 0.5, seasons: 1, upkeep: 0.0025, upkeepFood: 0.03, mood: 2,
              does: "Farm credit, grain silos and an agricultural college: its land grows 5% more food with 6% fewer farm workers, farmers +2 happier." },
  mining:   { label: "Mining district", icon: "delapouite/mine-wagon", area: "economy", setup: 0.005, setupSite: 0.15, seasons: 1, upkeep: 0.0005, upkeepSite: 0.006, mood: -2,
              does: "Rail spurs, a mining school and rescue crews: its mines and oil fields haul 40% cheaper, need 15% fewer workers and produce 10% more. The work is still hard (−2)." },
  garden:   { label: "Garden city", icon: "delapouite/park-bench", area: "interior", setup: 0.04, seasons: 2, upkeep: 0.005, mood: 8,
              does: "Parks, clean water, trams and new housing: people +8 happier, smoke and crowding hurt half as much, families grow a little faster and people prefer to move here (+40%)." },
  resort:   { label: "Resort coast", icon: "delapouite/palm-tree", area: "economy", setup: 0.02, seasons: 1, upkeep: 0.002, mood: 2,
              does: "Promenades, beaches, ski lifts and an airport for visitors: its resorts earn 25% more and other nations warm to you a little." },
  seat:     { label: "Provincial seat", icon: "delapouite/vote", area: "interior", setup: 0.03, seasons: 2, upkeep: 0.004, mood: 4,
              does: "A governor, courts and ministries' offices: public jobs for 1.5% more of its workers, loyalty grows 1.5 points a season faster, people +4 happier, governing a large country costs 20% less stability, and if the capital falls the government moves here." },
};
const FOCUS_ORDER = ["port", "industry", "market", "mining", "farms", "learning", "resort", "garden", "fortress", "seat"];
const FOCUS_TASTE = {
  militarist:   { fortress: 1.6, industry: 1.4, mining: 1.3, seat: 1.1, garden: 0.7, resort: 0.6, port: 0.9 },
  mercantile:   { port: 1.6, market: 1.5, resort: 1.3, learning: 1.2, garden: 1.1, fortress: 0.6, mining: 0.9 },
  agrarian:     { farms: 1.7, garden: 1.2, seat: 1.1, market: 1.1, industry: 0.8, fortress: 0.8 },
  expansionist: { seat: 1.5, mining: 1.4, fortress: 1.2, industry: 1.2, farms: 1.1, resort: 0.7 },
};

/* ---------- Small helpers ---------- */
function cityFill(c, g, owner) {
  if (c.origin === undefined) c.origin = owner !== undefined ? owner : c.owner;
  if (c.founded === undefined) c.founded = 0;
  if (c.loyalty === undefined) c.loyalty = c.origin === c.owner ? CITY.loyalNative : 55;
  if (c.mood === undefined) c.mood = CITY.moodBase;
  if (!c.hist) c.hist = [];
  return c;
}
function cityHist(g, c, text, tone = "neutral") {
  if (!c) return;
  c.hist = (c.hist || []);
  c.hist.unshift({ turn: g.turn, text, tone });
  if (c.hist.length > CITY.histMax) c.hist.length = CITY.histMax;
}
function activeFocus(g, c) { return c && c.focus && FOCI[c.focus] && (g.turn === undefined || g.turn >= (c.focusAt || 0)) ? c.focus : null; }
function cityFocusOn(g, c, key) { return activeFocus(g, c) === key; }
function cityModsActive(g, c) { return (c.mods || []).filter(m => m.until === null || m.until === undefined || g.turn === undefined || m.until > g.turn); }
function addCityMod(g, c, e) {
  const { t, cityId, seasons, ...rest } = e;
  c.mods = (c.mods || []).filter(m => m.key !== rest.key);
  c.mods.push({ ...rest, until: seasons ? g.turn + seasons + 1 : null });
}
/* Big cities are more productive: more firms, more customers, more ideas (about 2.5% for each doubling of size
   above 4 million people, up to 6%). Ordinary towns stay as they were. */
function citySizeSvc(pop) { return clamp(1 + 0.025 * Math.log2(Math.max(0.05, pop || 0) / 4), 1, 1.06); }
/* Every town helps its defenders (×1.25, as always); big cities more, because they are fought for street by street. */
function cityDefMult(c) {
  const pop = (c && c.pop) || 3;
  return clamp(1.25 + 0.05 * Math.log2(Math.max(1, pop / 3)), 1.25, 1.4);
}
function cityAtCellDef(g, cell) { const c = g.cities.find(x => x.cell === cell); return c ? cityDefMult(c) : 1; }
/* Families grow a little faster in a garden city; timed city effects can add more. */
function cityGrowthBonus(g, c) {
  let v = cityFocusOn(g, c, "garden") ? 0.001 : 0;
  for (const m of cityModsActive(g, c)) if (m.growth) v += m.growth;
  return v;
}
/* Where people looking for work would rather go: happier cities, markets and garden cities. */
function cityPull(g, c) {
  const f = activeFocus(g, c);
  return (0.7 + 0.6 * clamp(c.mood ?? CITY.moodBase, 0, 100) / 100) * (f === "garden" ? 1.4 : f === "market" ? 1.3 : 1);
}
function cityClosed(g, c) { return cityModsActive(g, c).some(m => m.noIntake); }
function cityRoleWords(c) {
  const words = (c.roles || []).filter(k => CITY_ROLES[k] && k !== "foreign").slice(0, 2).map(k => CITY_ROLES[k].label.toLowerCase());
  return words.length ? `: ${words.join(", ")}` : "";
}
/* How old a town is. Towns that stood before the nation was drawn have a past of their own: a few decades for
   some, centuries for others, longer on the coast where the first traders landed. It comes from the town's
   place on the map, so it never changes and old saves get the same answer. */
function cityPastYears(w, c) {
  if (c.founded > 0) return 0;
  const h = hash2(c.cell, 77, w.seed);
  const y = 20 + 480 * h * h;
  return Math.round(w.coastal && w.coastal[c.cell] ? y * 1.3 + 20 : y);
}
function cityAge(w, g, c) { return c.founded > 0 ? Math.max(0, (g.turn - c.founded) / 4) : cityPastYears(w, c) + g.turn / 4; }
function aAn(word) { return /^(?:[aeio]|u(?!ni|se|ra|ro))/i.test(word || "") ? `an ${word}` : `a ${word}`; }
function ageWords(y) { return y >= 100 ? `about ${Math.round(y / 10) * 10} years` : `${Math.floor(y)} years`; }
/* War score: a city cell weighs more the more the city matters (6 for an ordinary town before). */
function cityWarWeight(c) { return 1 + clamp(c.imp || 50, 0, 110) / 10; }

/* What a city's mood, loyalty and program do to its economy. Read by the economy itself, so every forecast,
   quote and rival plan sees them. Only stored numbers are used here: nothing heavy. */
function cityEconMods(g, n, c, pop) {
  const m = { out: 1, svc: 0, ind: 1, food: 1, farmLabor: 1, haul: 1, siteW: 1, siteOut: 1, resort: 1, pubJobs: 0, room: 0, size: citySizeSvc(pop), learning: false, seat: false, focus: null };
  const mood = c.mood ?? CITY.moodBase, loyal = c.loyalty ?? CITY.loyalNative;
  m.out = 1 + CITY.outPerMood * (mood - CITY.moodBase);
  if (loyal < CITY.loyalResist) m.out *= 1 - 0.3 * (CITY.loyalResist - loyal) / CITY.loyalResist;
  for (const x of cityModsActive(g, c)) if (x.out) m.out *= 1 + x.out;
  const f = activeFocus(g, c);
  m.focus = f;
  if (f === "port") m.svc += 0.08;
  else if (f === "industry") { m.ind = 1.08; m.room = 2; }
  else if (f === "market") m.svc += 0.06;
  else if (f === "farms") { m.food = 1.05; m.farmLabor = 0.94; }
  else if (f === "mining") { m.haul = 0.6; m.siteW = 0.85; m.siteOut = 1.1; }
  else if (f === "resort") m.resort = 1.25;
  else if (f === "seat") { m.pubJobs = 0.015; m.seat = true; }
  else if (f === "learning") m.learning = true;
  return m;
}
/* If the capital is held by the enemy, a provincial seat governs instead: the most populous one still held. */
function actingCapitalRegion(g, regions) {
  return regions.filter(r => r.cm && r.cm.seat).sort((a, b) => b.pop - a.pop)[0] || null;
}
function seatsOf(g, nid) { return g.cities.filter(c => c.owner === nid && (c.focus === "seat" || g.projects.some(p => p.kind === "focus" && p.cityId === c.id && p.focus === "seat"))).length; }

/* ---------- The city file: importance, roles, mood, and what it may become ---------- */
/* The rules need a city's file about once a season (roles and what it may become change slowly); the panels
   need it exactly as things stand, so they pass the economies they show and get a fresh file after every change. */
let CITY_CACHE = { g: null, key: "", map: null, turnG: null, turn: -1, turnMap: null };
function cityProfiles(w, g, econs, fresh) {
  if (!fresh && !econs && CITY_CACHE.turnG === g && CITY_CACHE.turn === g.turn && CITY_CACHE.turnMap) return CITY_CACHE.turnMap;
  const key = `${g.turn}|${g.ver}|${g.cities.length}|${g.projects.length}`;
  if (!fresh && CITY_CACHE.g === g && CITY_CACHE.key === key && CITY_CACHE.map) return CITY_CACHE.map;
  const map = cityProfilesRaw(w, g, econs);
  CITY_CACHE.g = g; CITY_CACHE.key = key; CITY_CACHE.map = map;
  if (fresh || CITY_CACHE.turnG !== g || CITY_CACHE.turn !== g.turn || !CITY_CACHE.turnMap) { CITY_CACHE.turnG = g; CITY_CACHE.turn = g.turn; CITY_CACHE.turnMap = map; }
  return map;
}
function cityProfile(w, g, city, econs) { return cityProfiles(w, g, econs).get(city.id) || null; }

function cityProfilesRaw(w, g, econs) {
  const out = new Map();
  const RC = riverCells(w);
  const works = [];
  for (const key in g.works || {}) { const W = g.works[key]; if (W && W.done !== null && W.done !== undefined && W.cell >= 0) works.push({ key, cell: W.cell, holder: workHolder(g, key) }); }
  const threatCache = new Map();
  const threatOf = (a, b) => { const k = a * 64 + b; if (!threatCache.has(k)) threatCache.set(k, threatFrom(w, g, a, b)); return threatCache.get(k); };
  const divAt = new Map();
  for (const d of g.divisions || []) divAt.set(d.cell, (divAt.get(d.cell) || []).concat([d]));
  const claimTown = typeof claimActive === "function" && claimActive(g) ? g.opening.town : null;
  for (const n of g.nations) {
    if (!n.alive) continue;
    const econ = (econs && econs[n.id]) || computeEconomy(w, g, n.id);
    const per = econ.gdp / Math.max(0.001, econ.pop);
    const natU = econ.unemployment || 0;
    const enemies = new Set(enemiesOf(g, n.id));
    const friends = friendlyTo(g, n.id);
    const ocean = econ.cities.filter(c => oceanPort(w, c)).length;
    const powerOf = r => r.ind.filter(x => INDUSTRIES[x.kind] && INDUSTRIES[x.kind].sub === "Energy").reduce((s, x) => s + (INDUSTRIES[x.kind].out.power || 0) * x.lvl * (x.rate ?? 1), 0);
    const powerAll = econ.regions.reduce((s, r) => s + powerOf(r), 0);
    const flows = (n.migr && n.migr.turn >= g.turn - 1 && n.migr.flows) || [];
    const cap = g.cities.find(c => c.owner === n.id && c.capital);
    const capNet = econ.networks.findIndex(x => x.capital);
    const seats = g.cities.filter(c => c.owner === n.id && c.focus === "seat").length;
    for (const r of econ.regions) {
      const c = r.city, cell = c.cell;
      cityFill(c, g);
      const pop = r.pop, gdp = Math.max(0, r.gdp || 0);
      const p = { id: c.id, city: c, owner: n.id, occupied: -1, pop, gdp, r, lines: [], roles: [], mood: [], foci: [] };
      const L = (label, pts) => { if (Math.abs(pts) >= 0.45) p.lines.push({ label, pts: Math.round(pts * 10) / 10 }); };
      const lv = k => r.ind.filter(x => x.kind === k).reduce((s, x) => s + (x.lvl || 0), 0);
      // people and wealth
      L(`${fmtPeople(pop)} people`, 6 * Math.log2(1 + pop / 0.5));
      L(`Output ${fmtMoney(gdp)} a year`, 5 * Math.log2(1 + gdp / 40));
      // government
      const seat = cityFocusOn(g, c, "seat");
      if (c.capital) L("Capital: seat of the government", 15);
      else if (seat) L("Provincial seat: governs its region", 5);
      if (!c.capital && c.wasCapital !== undefined && c.wasCapital !== null) L("Former capital", 4);
      // the sea
      p.ocean = oceanPort(w, c);
      const lvl = portLevel(c);
      if (p.ocean) {
        L(lvl >= 3 ? "Naval base and port on the open sea" : lvl === 2 ? "Port and shipyard on the open sea" : "Harbor on the open sea", [0, 4, 7, 10][lvl] || 4);
        if (ocean === 1) L("The nation's only harbor on the open sea", 3);
      } else if (c.port) L("Harbor on a lake", 2);
      // rivers
      let rcN = RC[cell] || 0;
      for (const [dx, dy] of DIRS4) { const X = cellX(cell) + dx, Y = cellY(cell) + dy; if (inBounds(X, Y) && isLand(w, idx(X, Y))) rcN = Math.max(rcN, RC[idx(X, Y)] || 0); }
      const wc = wharfCell(w, cell);
      p.riverName = wc >= 0 ? riverSystemName(w, wc) : "the river";
      p.estuary = !!(w.coastal[cell] && rcN >= 3 && portSeaCell(w, cell) >= 0);
      p.river = wc >= 0 && rcN >= 3 ? rcN : 0;
      if (p.estuary) L(`At the mouth of ${p.riverName}, where it meets the sea`, 3);
      if (p.river) L(p.river >= 4 ? `On ${p.riverName}, a great river` : `On ${p.riverName}, a navigable river`, p.river >= 4 ? 3 : 2);
      if (c.wharf) L("River wharf: barges to the towns upstream and down", 2);
      // roads
      let dirs = 0;
      for (const [dx, dy] of DIRS8) { const X = cellX(cell) + dx, Y = cellY(cell) + dy; if (inBounds(X, Y) && g.roads.has(edgeKey(cell, idx(X, Y)))) dirs++; }
      p.dirs = dirs;
      if (dirs >= 3) L(`Crossroads: roads leave in ${dirs} directions`, Math.min(6, 2 * (dirs - 2)));
      // industry and power
      const sec = r.ind.filter(x => !x.site && x.kind !== "smelter" && INDUSTRIES[x.kind] && INDUSTRIES[x.kind].sector === "secondary" && INDUSTRIES[x.kind].sub !== "Energy").reduce((s, x) => s + x.lvl, 0);
      p.secLevels = sec;
      if (sec >= 1) L(`Industry: ${sec} level${sec > 1 ? "s" : ""} of mills, plants and works`, Math.min(12, sec));
      p.arms = lv("heavy") + lv("chemical");
      if (p.arms >= 2) L("Arms industry: the steel, machinery and chemicals an army needs", 3);
      p.powerShare = powerAll > 0.01 ? powerOf(r) / powerAll : 0;
      p.powerLv = lv("power_coal") + lv("power_gas") + lv("power_hydro") + lv("power_nuclear");
      if (p.powerShare >= 0.15 && econ.regions.length > 1) L(`Power stations: ${pct(p.powerShare)} of the nation's electricity`, Math.min(6, 10 * p.powerShare));
      // the land's riches worked from here
      const sites = (econ.sites || []).filter(x => x.townId === c.id && x.status === "working");
      let sp = 0;
      for (const x of sites) sp += (x.kind === "goldmine" ? 3 : x.kind === "oilfield" ? 2.5 : x.kind === "fishing" || x.kind === "logging" ? 1 : 2) * (x.lvl || 1);
      p.sites = sites;
      p.resLv = sites.filter(x => SITE_KINDS[x.kind] && SITE_KINDS[x.kind].res).reduce((s, x) => s + (x.lvl || 1), 0);
      p.fishLv = sites.filter(x => x.kind === "fishing").reduce((s, x) => s + (x.lvl || 1), 0);
      if (sites.length) L(`Worked from here: ${sites.slice(0, 3).map(x => x.site.name).join(", ")}${sites.length > 3 ? ` and ${sites.length - 3} more` : ""}`, Math.min(12, sp));
      // known riches in its land that nobody works yet: what the city could become
      const untapped = {};
      for (const i of r.cells) {
        const t = depositType(w, i);
        if (!t || !knowsDeposit(w, g, n.id, i) || !(g.depLeft[i] > 0.5) || (g.sites || []).some(x => x.cell === i)) continue;
        untapped[t] = (untapped[t] || 0) + 1;
      }
      const ut = Object.entries(untapped);
      p.untapped = ut.reduce((s2, [, k]) => s2 + k, 0);
      if (ut.length) L(`Untapped riches in its land: ${ut.map(([t, k]) => `${k > 1 ? `${k} ` : ""}${RES[t].label.toLowerCase()}${k > 1 ? " deposits" : " deposit"}`).join(", ")}`, Math.min(4, ut.reduce((s2, [t, k]) => s2 + k * (Number(t) === 4 ? 1.5 : 1), 0)));
      // food
      p.surplus = (r.foodMade || 0) - pop;
      if (p.surplus >= 0.15) L(`Breadbasket: its farms feed ${fmtPeople(p.surplus)} people in other towns`, Math.min(8, 5 * p.surplus));
      // learning, money, visitors
      p.know = lv("university") + lv("techpark");
      if (p.know) L(`Universities and laboratories (${p.know} level${p.know > 1 ? "s" : ""})`, Math.min(8, 2 * p.know));
      p.money = lv("business") + lv("broadcast");
      if (p.money) L(`Banks, head offices and broadcasters (${p.money} level${p.money > 1 ? "s" : ""})`, Math.min(6, 2 * p.money));
      p.resorts = lv("resort");
      if (p.resorts) L(`Resorts and hotels (${p.resorts} level${p.resorts > 1 ? "s" : ""})`, Math.min(4, 1.5 * p.resorts));
      // borders and the front
      let nearD = 99, near = -1, front = false;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const X = cellX(cell) + dx, Y = cellY(cell) + dy;
        if (!inBounds(X, Y)) continue;
        const k = idx(X, Y);
        if (!isLand(w, k)) continue;
        const ctl = controller(g, k);
        if (ctl < 0 || ctl === n.id) continue;
        const d = Math.hypot(dx, dy);
        if (enemies.has(ctl) && d <= 3.2) front = true;
        if (g.owner[k] !== n.id && g.owner[k] >= 0 && d < nearD) { nearD = d; near = g.owner[k]; }
      }
      p.front = front; p.near = near; p.nearD = nearD;
      if (front) L("On the front line of the war", 5);
      else if (near >= 0 && nearD <= 3.5 && g.nations[near] && g.nations[near].alive) L(`Border city facing the ${nameOf(g, near)}`, g.nations[near].minor ? 1.5 : 3);
      // history
      p.age = cityAge(w, g, c);
      if (p.age >= 10) L(c.founded ? `Founded ${Math.floor(p.age)} years ago` : `An old town: ${ageWords(p.age)} old`, clamp(Math.log2(1 + p.age / 25), 0.5, 4));
      const cellsHere = new Set(r.cells);
      p.works = works.filter(x => x.holder === n.id && cellsHere.has(x.cell)).map(x => x.key);
      for (const k of p.works) L(`The ${WORKS[k].label} stands here`, 6);
      if (c.fights) L(`Battles fought here: ${c.fights}`, Math.min(3, c.fights));
      const tt = w.terrain[cell];
      if (tt === T.HILLS) L("Built on hills: a natural stronghold", 1.5);
      else if (tt === T.MOUNTAIN) L("Built in the mountains: a natural stronghold", 2.5);
      p.lines.sort((a, b) => b.pts - a.pts);
      p.imp = Math.max(1, Math.round(p.lines.reduce((s, l) => s + l.pts, 0)));

      // roles
      const R = (key, s) => p.roles.push({ key, s, ...CITY_ROLES[key] });
      if (c.capital) R("capital", 10);
      if (seat) R("seat", 6);
      if (front) R("front", 9);
      if (p.ocean) R("port", 5 + lvl);
      if (pop >= 18) R("metro", 7);
      if (sec >= 4 || (r.indWorkers || 0) / Math.max(1e-6, r.workforce) >= 0.12) R("industrial", 3 + sec / 3);
      if (p.arms >= 3) R("arsenal", 3 + p.arms / 2);
      if (p.resLv >= 2 || (p.resLv >= 1 && pop < 4)) R("mining", 3 + p.resLv / 2);
      if (p.surplus >= 0.3 && (r.foodMade || 0) >= 1.2 * pop) R("farm", 2 + Math.max(0, p.surplus) * 2);
      if ((p.powerShare >= 0.25 && econ.regions.length > 1) || p.powerLv >= 3) R("energy", 2.5);
      if (p.know >= 2) R("learning", 2.5 + p.know / 2);
      if (p.money >= 1 && pop >= 2) R("finance", 2.5 + p.money / 2);
      if (p.resorts >= 1) R("resort", 2 + p.resorts / 2);
      if (p.fishLv >= 1) R("fishing", 1.8);
      if (!front && near >= 0 && nearD <= 3.5) R("frontier", 4);
      if (p.river) R("river", 2 + (c.wharf ? 1 : 0));
      if (dirs >= 3) R("hub", 1.5 + dirs / 2);
      if (p.age >= 250 || (c.wasCapital !== undefined && c.wasCapital !== null && !c.capital) || p.works.length) R("heritage", 1 + Math.min(1.5, p.age / 300) + p.works.length);
      if (c.founded > 0 && g.turn - c.founded < 8) R("newtown", 1);
      if (c.origin !== c.owner && (c.loyalty ?? 90) < 70) R("foreign", 8);
      p.roles.sort((a, b) => b.s - a.s);
      p.has = new Set(p.roles.map(x => x.key));

      // garrison, fear and the neighbor
      let garrison = 0;
      for (const k of [cell, ...stepNeighbors(g, cell)]) for (const d of divAt.get(k) || []) if (friends.has(d.owner)) garrison++;
      p.garrison = garrison;
      p.fear = false;
      if (!front && near >= 0 && nearD <= 3.5 && g.nations[near] && !g.nations[near].minor) {
        const lvlR = n.isPlayer ? ((g.intel || {})[near] ?? 0) : (threatOf(n.id, near) >= 0.6 ? 2 : 0);
        p.fear = lvlR >= 2;
      }

      // mood: what the people of this city feel, and why
      const M = (label, v) => { if (Math.abs(v) >= 0.4) p.mood.push({ label, value: Math.round(v * 10) / 10 }); };
      const u = townURate(r);
      const ex = u - Math.max(JOBS.natural + 0.01, natU);
      if (ex > 0.004) M(`${pct1(u)} of its workers have no job (the nation: ${pct1(natU)})`, -clamp(ex * 120, 0, 18));
      else if (u < 0.03 && (r.vacancies || 0) > 0.02 * r.workforce) M("Plenty of work: jobs wait for workers", 3);
      const perInc = econ.people ? econ.people.bill / Math.max(0.001, econ.pop) : 0;
      const ratio = perInc > 0 ? (r.incomeK || 0) / perInc : (r.outputK || 0) / Math.max(0.001, per);
      if (Math.abs(ratio - 1) > 0.05) M(ratio > 1 ? `Richer than most of the nation (wages per person ${pct(ratio)} of the average)` : `Poorer than the rest of the nation (wages per person ${pct(ratio)} of the average)`, clamp(12 * (ratio - 1), -6, 6));
      if (r.foodRatio < ECON.famineLine) M("Hunger: not enough food reaches the city", -20);
      else if (r.foodRatio < 1) M("Food is short in the market", -6);
      const net = econ.networks[r.net];
      if (net && !net.capital) M("Cut off from the capital by road", -6);
      const garden = cityFocusOn(g, c, "garden");
      const q = c.popQ || [];
      const g1 = q.length >= 5 && q[0] > 0.01 ? pop / q[0] - 1 : 0;
      p.growth = g1;
      if (g1 > 0.05) M(`Housing shortage: ${pct(g1)} more people in a year`, -clamp((g1 - 0.05) * 120, 0, 10) * (garden ? 0.5 : 1));
      if (!front && (c.peakPop || 0) > 0.2 && pop < 0.85 * c.peakPop) M(`Shrinking: ${pct(1 - pop / c.peakPop)} fewer people than at its peak`, -5);
      const dirty = lv("heavy") + lv("chemical") + lv("power_coal") + 0.5 * (p.sites.filter(x => x.site.smelter).length);
      p.dirty = dirty;
      if (dirty > 2 && pop >= 1) M(`Smoke and smog from ${dirty >= 6 ? "its many works" : "its works"}`, -clamp(1.2 * (dirty - 2), 0, 10) * (garden ? 0.5 : 1) * (cityFocusOn(g, c, "industry") ? 2 : 1) * ((g.era || 0) >= 3 ? 1.2 : 1));
      if (c.capital) M("Pride of the capital", 4);
      for (const k of p.works) M(`Proud of the ${WORKS[k].label}`, 3);
      if (front) {
        const defending = g.wars.some(x => x.sideB.includes(n.id) && x.sideA.some(e => enemies.has(e)));
        M(defending ? "The front line is close, but the city stands firm" : "The war has come to its doorstep", defending ? -3 : -5);
      }
      const blockaded = !!(g.sea && g.sea.blockaded && g.sea.blockaded.includes(c.id));
      if (blockaded) M("Enemy warships blockade the harbor", -5);
      if ((g.battles || []).some(b => b.cell === cell && b.turn >= g.turn - 1)) M("Battle in its streets", -3);
      if (p.fear && !cityFocusOn(g, c, "fortress")) M(garrison ? `Fear of the ${nameOf(g, near)} across the border, eased by soldiers close by` : `Fear of the ${nameOf(g, near)}: no soldiers to defend it`, garrison ? -2 : -6);
      else if (p.has.has("frontier") && garrison && !front) M("Soldiers guard the border", 2);
      if (p.fear && cityFocusOn(g, c, "fortress")) M("Behind strong walls, the people feel safe", 3);
      if (claimTown && c.owner === PLAYER && c.name === claimTown) M(`The ${nameOf(g, g.opening.by)} claims the city`, -4);
      if (p.has.has("mining")) {
        const fast = p.sites.filter(x => SITE_KINDS[x.kind].res && (x.site.pace || "normal") === "fast").length;
        if (fast) M("Long, dangerous shifts at the mines", -Math.min(6, 2 * fast));
      }
      const dead = (econ.sites || []).filter(x => x.townId === c.id && x.site.exhausted && SITE_KINDS[x.kind].res && g.turn - (x.site.exhaustedAt ?? -99) <= 8);
      if (dead.length) M(`${dead[0].site.name} is worked out: miners lost their jobs`, -6);
      if (p.has.has("learning")) {
        const e = EDU_ORDER.indexOf(n.laws.education || "basic");
        M(e <= 0 ? "Students and teachers protest cuts to education" : e === 1 ? "Universities ask for more money" : e === 2 ? "Universities are well funded" : "Universities are the best funded in years", [-6, -2, 2, 4][e] ?? 0);
      }
      if (p.has.has("resort") && enemies.size) M("No visitors come in wartime", -4);
      if (p.has.has("fishing") && p.sites.some(x => x.kind === "fishing" && (x.stock ?? 1) < 0.4)) M("Empty nets: the fish are scarce", -4);
      if (p.has.has("farm")) {
        if (harvestFactor(n) < 0.95) M("A poor harvest on its farms", -4);
        if ((n.mods || []).some(m => m.key === "farm_subsidy")) M("Farm subsidies", 3);
      }
      if (pop >= 18) M("Big-city problems: crime and traffic", garden ? -1.5 : -3);
      if ((c.loyalty ?? 90) < 70 && c.origin !== c.owner) M(`Many still feel they belong to the ${nameOf(g, c.origin)} (loyalty ${Math.round(c.loyalty)})`, -(70 - c.loyalty) * 0.3);
      if (c.liberated !== undefined && c.liberated !== null && g.turn - c.liberated <= 8) M("Freed: back with its own nation", 6);
      const f = activeFocus(g, c);
      if (f && FOCI[f].mood) M(`City program: ${FOCI[f].label.toLowerCase()}`, FOCI[f].mood);
      for (const m of cityModsActive(g, c)) if (m.mood) M(m.label, m.mood);
      const inflow = flows.filter(x => x.to === c.id).reduce((s, x) => s + x.people, 0);
      p.inflow = inflow;
      p.moodTarget = clamp(CITY.moodBase + p.mood.reduce((s, x) => s + x.value, 0), 5, 95);
      p.mood.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

      // loyalty
      p.native = c.origin === c.owner;
      p.loyalRate = p.native ? 0 : cityLoyaltyRate(g, c);

      // programs this city could run
      for (const k of FOCUS_ORDER) p.foci.push({ key: k, why: focusBlockFor(w, g, c, k, p, r, econ, cap, capNet, seats) });
      out.set(c.id, p);
    }
    // occupied cities keep what was known of them
    for (const c of g.cities) {
      if (c.owner !== n.id || !(g.occ[c.cell] >= 0)) continue;
      cityFill(c, g);
      const by = g.occ[c.cell];
      const p = { id: c.id, city: c, owner: n.id, occupied: by, pop: c.pop || 0, gdp: 0, r: null, lines: [{ label: "Held by the enemy: last known standing", pts: c.imp || 10 }], roles: [], mood: [{ label: `Occupied by the ${nameOf(g, by)}`, value: -30 }], foci: [], imp: c.imp || 10, moodTarget: 22, has: new Set(), native: c.origin === c.owner, loyalRate: 0 };
      for (const k of c.roles || []) if (CITY_ROLES[k]) p.roles.push({ key: k, s: 1, ...CITY_ROLES[k] });
      p.has = new Set(p.roles.map(x => x.key));
      out.set(c.id, p);
    }
  }
  // ranks in the nation and the world
  const all = [...out.values()].sort((a, b) => b.imp - a.imp || b.pop - a.pop);
  all.forEach((p, k) => { p.rankW = k + 1; p.ofW = all.length; });
  const byN = new Map();
  for (const p of all) { if (!byN.has(p.owner)) byN.set(p.owner, []); byN.get(p.owner).push(p); }
  for (const list of byN.values()) list.forEach((p, k) => { p.rankN = k + 1; p.ofN = list.length; p.share = p.imp / Math.max(1, list.reduce((s, x) => s + x.imp, 0)); });
  return out;
}

function cityLoyaltyRate(g, c) {
  const origin = g.nations[c.origin];
  let v = CITY.loyalRate + CITY.loyalMoodK * ((c.mood ?? CITY.moodBase) - 50);
  if (cityFocusOn(g, c, "seat")) v += 1.5;
  if (!origin || !origin.alive) v += 0.6;
  else if (atWar(g, c.owner, c.origin)) v -= 0.6;
  for (const m of cityModsActive(g, c)) if (m.loyal) v += m.loyal;
  if ((c.mood ?? CITY.moodBase) < 25) v = Math.min(v, -0.5);
  return Math.round(v * 100) / 100;
}

function focusBlockFor(w, g, c, k, p, r, econ, cap, capNet, seats) {
  const F = FOCI[k];
  if (!F) return "Unknown program.";
  if (k === "port") return p.ocean ? null : "Needs a harbor on the open sea.";
  if (k === "industry") return p.secLevels >= 2 || p.pop >= 4 ? null : "Needs some industry already (2 levels of mills, plants and works) or at least 4 million people.";
  if (k === "fortress") return p.front || (p.near >= 0 && p.nearD <= 4.5) || c.capital || [T.HILLS, T.MOUNTAIN].includes(w.terrain[c.cell]) ? null : "Only for towns near a border, on high ground, or the capital.";
  if (k === "learning") return p.know >= 1 ? null : "Needs a university or a tech park.";
  if (k === "market") return p.dirs >= 3 || c.wharf || p.estuary ? null : "Needs a crossroads (roads in 3 or more directions), a river wharf, or a river mouth on the sea.";
  if (k === "farms") return p.has.has("farm") || (c.irrigated && (r.foodMade || 0) >= 1.1 * p.pop) ? null : "Only for farm country: its farms must feed other towns too (at least 20% more food than its people eat, or irrigated fields with a surplus).";
  if (k === "mining") return p.has.has("mining") ? null : "Only for mining towns: mines or oil fields worked from it must be a big part of its life (2 levels, or 1 in a town under 4 million people).";
  if (k === "garden") return p.pop >= 6 ? null : "Needs at least 6 million people.";
  if (k === "resort") return p.resorts >= 1 || industryCap("resort", r.res, r.pop, c.port) >= 1 ? null : "Needs a coast or mountains that draw visitors.";
  if (k === "seat") {
    if (c.capital) return "The capital already governs.";
    if (p.pop < 2) return "Needs at least 2 million people.";
    if (cap && r.net === capNet && dist(cap.cell, c.cell) < 7) return "Too close to the capital: it must be 7 cells away, or not joined to it by road.";
    if (c.focus !== "seat" && seats >= CITY.seatMax) return `A nation can have at most ${CITY.seatMax} provincial seats.`;
    return null;
  }
  return null;
}

/* ---------- Mood, loyalty, growth and the city's story, once a season ---------- */
function refreshCities(w, g, opts = {}) {
  for (const c of g.cities) cityFill(c, g);
  const prof = cityProfiles(w, g, opts.econs || null, true);
  for (const c of g.cities) {
    const p = prof.get(c.id);
    if (!p) continue;
    c.imp = p.imp; c.roles = p.roles.slice(0, 6).map(x => x.key); c.rankN = p.rankN; c.rankW = p.rankW;
    if (p.occupied < 0) {
      c.pop = Math.round(p.pop * 1000) / 1000;
      if (opts.init) { c.mood = Math.round(p.moodTarget * 10) / 10; if (!c.popQ || !c.popQ.length) c.popQ = [c.pop]; if (!c.popHist || !c.popHist.length) c.popHist = [c.pop]; c.peakPop = Math.max(c.peakPop || 0, c.pop); }
    }
  }
  return prof;
}

function seasonCities(w, g, dispatch) {
  const news = dispatch ? (dispatch.cities = dispatch.cities || []) : null;
  // battles fought in a city's streets last season
  for (const b of g.battles || []) {
    if (b.turn !== g.turn - 1) continue;
    const c = g.cities.find(x => x.cell === b.cell);
    if (c) { c.fights = (c.fights || 0) + 1; if (!c.hist || !c.hist[0] || c.hist[0].turn !== g.turn) cityHist(g, c, `A battle was fought at ${c.name}: the ${nameOf(g, b.attacker)} ${b.won ? "beat" : "were thrown back by"} the ${nameOf(g, b.defender)}.`, "warn"); }
  }
  for (const c of g.cities) { cityFill(c, g); c.mods = cityModsActive(g, c); }
  const prof = cityProfiles(w, g, null, true);
  const prevTop = g.topCity ?? null;
  for (const c of g.cities) {
    const n = g.nations[c.owner];
    const p = prof.get(c.id);
    if (!n || !n.alive || !p) continue;
    const before = { imp: c.imp, cls: cityClassIndex(c.imp || 0), mood: c.mood, loyalty: c.loyalty, pop: c.pop || 0 };
    c.imp = p.imp; c.roles = p.roles.slice(0, 6).map(x => x.key); c.rankN = p.rankN; c.rankW = p.rankW;
    const occ = p.occupied >= 0;
    // occupation and liberation, as the city lived them
    const wasOcc = c.occBy !== undefined && c.occBy !== null && c.occBy >= 0;
    if (occ && (!wasOcc || c.occBy !== p.occupied)) cityHist(g, c, `Occupied by the army of the ${nameOf(g, p.occupied)}.`, "bad");
    if (!occ && wasOcc) {
      cityHist(g, c, `Freed from the ${nameOf(g, c.occBy)}'s occupation.`, "good");
      addCityMod(g, c, { key: "freed", label: "Freed from enemy occupation", mood: 6, seasons: 6 });
      c.mood = Math.max(c.mood, 45);   // relief: the soldiers have gone, whatever else is still wrong
      if (c.owner === PLAYER && news) news.push({ cityId: c.id, tone: "good", text: `${c.name} is free again: the ${nameOf(g, c.occBy)}'s soldiers have gone, and its people are celebrating.` });
    }
    c.occBy = occ ? p.occupied : -1;
    if (!occ) {
      c.pop = Math.round(p.pop * 1000) / 1000;
      c.peakPop = Math.max(c.peakPop || 0, c.pop);
      c.popQ = (c.popQ || []).concat([c.pop]).slice(-5);
      if (g.turn % 4 === 0) c.popHist = (c.popHist || []).concat([c.pop]).slice(-CITY.popHistMax);
    }
    c.mood = Math.round(clamp(c.mood + CITY.moodPull * (p.moodTarget - c.mood), 0, 100) * 10) / 10;
    // loyalty: native cities stay loyal; others slowly come to feel at home
    if (c.origin === c.owner) c.loyalty = Math.round((c.loyalty + (CITY.loyalNative - c.loyalty) * 0.1) * 10) / 10;
    else if (!occ) {
      c.loyalty = Math.round(clamp(c.loyalty + cityLoyaltyRate(g, c), 0, CITY.loyalNative) * 10) / 10;
      if (c.loyalty >= CITY.integrate) c.settled = (c.settled || 0) + 1; else c.settled = 0;
      if (c.settled >= CITY.integrateSeasons) {
        const old = nameOf(g, c.origin);
        c.origin = c.owner; c.settled = 0;
        cityHist(g, c, `${c.name} now feels fully part of the ${n.name}. The old ties to the ${old} have faded.`, "good");
        if (c.owner === PLAYER && news) news.push({ cityId: c.id, tone: "good", text: `The people of ${c.name} now feel fully part of the nation. The ${old} has lost its claim on them.` });
      } else if (c.owner === PLAYER && news && before.loyalty < 70 && c.loyalty >= 70) news.push({ cityId: c.id, tone: "good", text: `The people of ${c.name} are coming to feel at home in the nation (loyalty ${Math.round(c.loyalty)}).` });
    }
    // what the player hears about his own cities
    if (c.owner === PLAYER && news && !occ) {
      const cls = cityClassIndex(c.imp);
      if (before.imp !== undefined && cls > before.cls && cls >= 1) {
        const t = `${c.name} has become a ${cityClass(c.imp).label.toLowerCase()} (importance ${c.imp}).`;
        news.push({ cityId: c.id, tone: "good", text: `${t} ${p.lines.slice(0, 2).map(l => l.label).join("; ")}.` });
        cityHist(g, c, t, "good");
      }
      for (const m of [1, 2, 5, 10, 20, 30]) if (before.pop > 0.05 && before.pop < m && c.pop >= m) { const t = `${c.name} has grown past ${m} million people.`; news.push({ cityId: c.id, tone: "good", text: t }); cityHist(g, c, t, "good"); }
      if (before.mood >= 30 && c.mood < 30) {
        const why = p.mood.filter(x => x.value < 0).slice(0, 2).map(x => x.label.charAt(0).toLowerCase() + x.label.slice(1));
        const t = `Unrest in ${c.name}: the city's mood has fallen to ${Math.round(c.mood)}${why.length ? ` (${why.join("; ")})` : ""}.`;
        news.push({ cityId: c.id, tone: "bad", text: t });
        cityHist(g, c, `Unrest: the mood fell to ${Math.round(c.mood)}.`, "bad");
        addChronicle(g, t, "warn", PLAYER);
      }
    }
  }
  // the greatest city in the world
  const top = [...prof.values()].filter(p => p.occupied < 0).sort((a, b) => b.imp - a.imp)[0];
  if (top) {
    g.topCity = top.id;
    if (prevTop !== null && prevTop !== top.id && news) {
      const t = `${top.city.name} (${nameOf(g, top.owner)}) is now the most important city in the world (importance ${top.imp}).`;
      news.push({ cityId: top.id, tone: top.owner === PLAYER ? "good" : "neutral", text: t });
      addChronicle(g, t, top.owner === PLAYER ? "good" : "neutral", top.owner);
      cityHist(g, top.city, "Became the most important city in the world.", "good");
    }
  }
  return news;
}

/* ---------- What cities do to a nation's stability ---------- */
function cityStabilityTerms(g, n) {
  const own = g.cities.filter(c => c.owner === n.id);
  if (!own.length) return [];
  const imp = c => Math.max(1, c.imp || 10);
  const tot = own.reduce((s, c) => s + imp(c), 0);
  const terms = [];
  const held = c => !(g.occ && g.occ[c.cell] >= 0);
  const unrest = own.filter(c => held(c) && (c.mood ?? CITY.moodBase) < CITY.unrestAt)
    .map(c => ({ c, v: -(imp(c) / tot) * (CITY.unrestAt - c.mood) * CITY.unrestK })).filter(x => x.v <= -0.15).sort((a, b) => a.v - b.v);
  let sum = 0;
  unrest.forEach((x, k) => {
    const v = Math.max(-CITY.unrestCap - sum, x.v);
    sum += v;
    if (k < 3) terms.push({ label: `Unrest in ${x.c.name} (mood ${Math.round(x.c.mood)})`, value: v });
    else if (k === 3) terms.push({ label: `Unrest in ${unrest.length - 3} more town${unrest.length - 3 > 1 ? "s" : ""}`, value: v });
    else terms[terms.length - 1].value += v;
  });
  const seatHeld = own.some(c => held(c) && cityFocusOn(g, c, "seat"));
  let occSum = 0;
  for (const c of own.filter(c => !held(c)).sort((a, b) => imp(b) - imp(a))) {
    let v = -(imp(c) / tot) * CITY.occK * (c.capital && seatHeld ? 0.5 : 1);
    v = Math.max(-CITY.occCap - occSum, v);
    occSum += v;
    if (v <= -0.15) terms.push({ label: `The enemy holds ${c.name}${c.capital ? `, our capital${seatHeld ? " (the government carries on from a provincial seat)" : ""}` : c.rankN && c.rankN <= 3 ? `, our ${["", "first", "second", "third"][c.rankN]} city` : ""}`, value: v });
  }
  return terms;
}

/* ---------- When a city changes hands ---------- */
function cityChangedHands(g, city, from, to) {
  cityFill(city, g, from);
  if (to < 0 || to === from) return;
  const war = atWar(g, from, to);
  city.focus = null; city.focusAt = null;
  city.mods = (city.mods || []).filter(m => m.keep);
  if (to === city.origin) {
    city.loyalty = Math.max(city.loyalty ?? 0, CITY.loyalBack);
    city.liberated = g.turn;
    city.mood = Math.max(city.mood ?? 50, 55);
    cityHist(g, city, `Returned to the ${nameOf(g, to)}${war ? " after the war" : ""}. Its people celebrated in the streets.`, "good");
  } else {
    city.loyalty = Math.min(city.loyalty ?? CITY.loyalNative, war ? CITY.loyalWar : CITY.loyalDeal);
    city.mood = Math.min(city.mood ?? 50, war ? 35 : 45);
    city.settled = 0;
    cityHist(g, city, war ? `Taken by the ${nameOf(g, to)} from the ${nameOf(g, from)} in war.` : `Handed over by the ${nameOf(g, from)} to the ${nameOf(g, to)}.`, "bad");
    // the nation that lost it will not forget
    if (g.nations[from] && g.nations[from].alive && from !== to) {
      addMod(g, from, to, "took_towns", "Took our towns from us", -(10 + Math.min(20, (city.imp || 20) / 4)), 0.25, -45);
      remember(g, from, `The ${nameOf(g, to)} took ${city.name} from us${war ? " in war" : ""}.`);
    }
  }
}

/* ---------- City programs: quotes, upkeep and what rivals consider ---------- */
/* A program costs in proportion to what it works on: the city's output, for farm country its harvest, for a
   mining district what its mines and oil fields produce. */
function minesOutput(r) { return (r.ind || []).reduce((s, x) => s + (x.site && SITE_KINDS[x.kind] && SITE_KINDS[x.kind].res ? Math.max(0, x.va || 0) : 0), 0); }
function focusBaseCost(F, r, a, food, site) { return a * Math.max(0, r.gdp || 0) + (food || 0) * Math.max(0, r.foodMade || 0) + (site ? site * minesOutput(r) : 0); }
function focusSetupCost(key, r) { const F = FOCI[key]; return Math.round(clamp(focusBaseCost(F, r, F.setup, F.setupFood, F.setupSite), 0.5, 12) * 10) / 10; }
function focusUpkeepCost(key, r) { const F = FOCI[key]; return Math.round(clamp(focusBaseCost(F, r, F.upkeep, F.upkeepFood, F.upkeepSite), 0.03, 2.5) * 100) / 100; }
function cityProgramsUpkeep(g, n, econ) {
  let s = 0;
  for (const r of econ.regions || []) if (r.city.focus && FOCI[r.city.focus] && g.turn >= (r.city.focusAt || 0)) s += focusUpkeepCost(r.city.focus, r);
  return s;
}
function quoteFocus(w, g, nid, city, key, base) {
  const F = FOCI[key];
  const fail = reason => ({ ok: false, kind: "focus", focus: key, cityId: city.id, reason });
  if (!F) return fail("Unknown program.");
  if (city.owner !== nid) return fail("Not your town.");
  if (g.occ[city.cell] >= 0) return fail(`${city.name} is occupied.`);
  const econ = base || computeEconomy(w, g, nid);
  const r = econ.regions.find(x => x.city.id === city.id);
  if (!r) return fail(`${city.name} is cut off.`);
  if (cityFocusOn(g, city, key)) return fail(`${city.name} already runs this program.`);
  if (g.projects.some(p => p.kind === "focus" && p.cityId === city.id)) return fail(`A program is already being set up in ${city.name}.`);
  const p = cityProfile(w, g, city);
  const why = p ? (p.foci.find(x => x.key === key) || {}).why : "The city's file is not ready yet.";
  if (why) return fail(why);
  const cost = focusSetupCost(key, r), upkeep = focusUpkeepCost(key, r);
  const v = projectValue(w, g, nid, { focus: { cityId: city.id, key } }, econ);
  // what output alone misses
  let extra = 0;
  const n = g.nations[nid];
  if (key === "fortress") extra += maxThreatTo(w, g, nid).level * econ.gdp * 0.01 * (p && (p.has.has("frontier") || p.front) ? 1 : 0.3) + (p && p.fear ? 0.004 * econ.gdp : 0);
  if (key === "garden") extra += (r.gdp || 0) * 0.015 + (p && p.dirty > 2 ? (r.gdp || 0) * 0.01 : 0) + ((city.mood ?? CITY.moodBase) < 45 ? (r.gdp || 0) * 0.02 : 0);
  if (key === "learning") extra += (2 + (p ? p.know : 0)) * 0.0012 * econ.gdp * 2;
  if (key === "seat") extra += (city.origin !== nid ? 0.02 : 0.003) * econ.gdp + (econ.area > FOUNDING.sizeThreshold ? 0.004 * econ.gdp : 0);
  if (key === "resort") extra += 0.003 * econ.gdp;
  if (key === "port") extra += 0.002 * econ.gdp;
  if (key === "industry") { const room = industryCap("light", r.res, r.pop, city.port) - urbanLevels(city); extra += (room <= 0 ? 0.008 : 0.003) * econ.gdp; }
  if (F.mood) extra += Math.max(0, F.mood) * (r.gdp || 0) * 0.0012;
  const value = v.value - upkeep * 4 + extra;
  return { ok: true, kind: "focus", nid, cityId: city.id, focus: key, cost, upkeep, seasons: F.seasons, ...v, value, extra,
    replaces: activeFocus(g, city), label: `${F.label} in ${city.name}`, n: n ? n.id : nid };
}
function focusCandidates(w, g, n, econ) {
  // rival governments look at their cities every other season, and settle in for three years before they reshape them
  if (!n.isPlayer && ((g.turn + n.id) % 2 !== 0 || g.turn < 12)) return [];
  if (n.treasury < 0.02 * econ.gdp) return [];
  const taste = FOCUS_TASTE[n.archetype] || {};
  const prof = cityProfiles(w, g);
  const towns = econ.regions.map(r => ({ r, p: prof.get(r.city.id) })).filter(x => x.p && !activeFocus(g, x.r.city) && !g.projects.some(q => q.kind === "focus" && q.cityId === x.r.city.id))
    .sort((a, b) => b.p.imp - a.p.imp).slice(0, 2);
  const out = [];
  for (const { r, p } of towns) {
    const keys = p.foci.filter(x => !x.why).map(x => x.key).sort((a, b) => (taste[b] || 1) - (taste[a] || 1)).slice(0, 3);
    for (const k of keys) {
      const q = quoteFocus(w, g, n.id, r.city, k, econ);
      if (!q.ok) continue;
      q.value *= taste[k] || 1;
      out.push(q);
    }
  }
  return out.sort((a, b) => b.value / b.cost - a.value / a.cost).slice(0, 2);
}
function focusDoneText(g, p) {
  const c = g.cities.find(x => x.id === p.cityId);
  const F = FOCI[p.focus];
  return c && F ? `${c.name} is now ${aAn(F.label.toLowerCase())}: ${F.does.charAt(0).toLowerCase()}${F.does.slice(1)}` : `${p.label} is complete.`;
}
function finishFocus(g, p) {
  const c = g.cities.find(x => x.id === p.cityId);
  if (!c || c.owner !== p.nid) { p.failed = true; if (g.nations[p.nid]) g.nations[p.nid].treasury += p.cost * 0.5; return; }
  const old = c.focus && FOCI[c.focus] ? FOCI[c.focus].label : null;
  c.focus = p.focus; c.focusAt = g.turn; c.focusSince = g.turn;
  cityHist(g, c, `Became ${aAn(FOCI[p.focus].label.toLowerCase())}${old ? ` (no longer ${aAn(old.toLowerCase())})` : ""}.`, "good");
}

/* ---------- Moving the capital ---------- */
function quoteCapitalMove(w, g, nid, city) {
  const fail = reason => ({ ok: false, kind: "capital", cityId: city.id, reason });
  if (city.owner !== nid) return fail("Not your town.");
  if (city.capital) return fail(`${city.name} is already the capital.`);
  if (g.occ[city.cell] >= 0) return fail(`${city.name} is occupied.`);
  if (g.projects.some(p => p.kind === "capital" && p.nid === nid)) return fail("The capital is already moving.");
  const econ = computeEconomy(w, g, nid);
  const r = econ.regions.find(x => x.city.id === city.id);
  if (!r) return fail(`${city.name} is cut off.`);
  if (r.pop < 1) return fail(`${city.name} is too small to hold the government (it needs a million people).`);
  const cost = Math.round(Math.max(2, econ.gdp * 0.03) * 10) / 10;
  const old = g.cities.find(c => c.owner === nid && c.capital);
  return { ok: true, kind: "capital", nid, cityId: city.id, from: old ? old.id : null, cost, seasons: 4, dGdp: 0, dFood: 0, value: 0, label: `Move the capital to ${city.name}` };
}
function finishCapitalMove(g, p) {
  const c = g.cities.find(x => x.id === p.cityId);
  if (!c || c.owner !== p.nid || g.occ[c.cell] >= 0) { p.failed = true; if (g.nations[p.nid]) g.nations[p.nid].treasury += p.cost * 0.5; return; }
  const old = g.cities.find(x => x.owner === p.nid && x.capital);
  if (old) {
    old.capital = false; old.wasCapital = g.turn;
    addCityMod(g, old, { key: "lost_capital", label: "The government has left for a new capital", mood: -8, seasons: 8 });
    cityHist(g, old, `The government moved away to ${c.name}. ${old.name} is the capital no more.`, "bad");
  }
  c.capital = true;
  addCityMod(g, c, { key: "new_capital", label: "Proud to be the new capital", mood: 6, seasons: 8 });
  cityHist(g, c, `Became the capital of the ${nameOf(g, p.nid)}${old ? `, in place of ${old.name}` : ""}.`, "good");
  bumpWorld(g);
}

/* ---------- Battles in cities ---------- */
function cityBattleLines(g, city, A, D) {
  const out = [];
  if (!city) return out;
  if (city.owner === D || alliesOf(g, D).includes(city.owner)) {
    if (cityFocusOn(g, city, "fortress")) out.push({ label: `The fortress of ${city.name}`, mult: 1.3, side: "def" });
    const fm = cityModsActive(g, city).reduce((s, m) => s + (m.def || 0), 0);
    if (fm > 0.01) out.push({ label: `Trenches and bunkers around ${city.name}`, mult: 1 + fm, side: "def" });
  }
  if (city.owner === D && (city.loyalty ?? 90) < 45 && city.origin === A) out.push({ label: `The people of ${city.name} side with the ${nameOf(g, A)}`, mult: 0.85, side: "def" });
  else if (city.owner === D && (city.loyalty ?? 90) >= 70 && (city.mood ?? 55) >= 68) out.push({ label: `The people of ${city.name} stand with its defenders`, mult: 1.05, side: "def" });
  return out;
}

/* ---------- Decisions that only a particular city can bring ---------- */
function myCities(c, pred) {
  const prof = cityProfiles(c.w, c.g);
  const out = [];
  for (const r of c.econ.regions) { const p = prof.get(r.city.id); if (p && (!pred || pred(p, r))) out.push(p); }
  return out;
}
function cityCost(p, share, min = 0.2) { return -Math.max(min, Math.round((p.gdp || 0) * share * 10) / 10); }
function cityMod(p, key, label, fields, seasons) { return { t: "cityMod", cityId: p.id, key, label, ...fields, seasons }; }
function topNeg(p) { const x = (p.mood || []).filter(m => m.value < 0)[0]; return x ? x.label.charAt(0).toLowerCase() + x.label.slice(1) : "everything"; }
const CITY_DECISIONS = {
  dockers: {
    cat: "Labor", icon: "anchor", tone: "bad",
    find: c => {
      const T = c.g.sea && c.g.sea.trade ? c.g.sea.trade[c.nid] : null;
      if (!T || !(T.carry > 0.3)) return null;
      const list = myCities(c, p => p.has.has("port") && ((p.city.mood ?? 55) < 50 || c.n.stability < 55 || c.n.laws.tax >= 35 || ["high", "war"].includes(c.n.laws.arms)));
      if (!list.length) return null;
      const p = list.sort((a, b) => b.imp - a.imp)[0];
      return { p, w: 0.7 + ((p.city.mood ?? 55) < 45 ? 0.5 : 0) };
    },
    make: (c, f) => ({
      title: `Dockers strike in ${f.p.city.name}`, cell: f.p.city.cell, cityId: f.p.id,
      body: `The dockers of ${f.p.city.name} have stopped work. Ships wait at anchor in the bay and goods pile up on the quays. They want higher pay and safer cranes.`,
      options: [
        { id: "a", tag: "kind", label: "Raise the dockers' pay", effects: [{ t: "money", v: cityCost(f.p, 0.012) }, cityMod(f.p, "dock_pay", "The dockers won their raise", { mood: 6 }, 6)] },
        { id: "b", tag: "force", label: "Send soldiers to unload the ships", effects: [{ t: "stab", v: -2 }, cityMod(f.p, "dock_soldiers", "Soldiers broke the dock strike", { mood: -12 }, 8)] },
        { id: "c", tag: "thrift", label: "Wait them out", effects: [cityMod(f.p, "dock_idle", "The port stood idle", { out: -0.12 }, 1), cityMod(f.p, "dock_bitter", "A long dock strike", { mood: -3 }, 4)] },
      ], def: "c",
    }),
  },
  smog: {
    cat: "Health", icon: "plus", tone: "bad",
    find: c => {
      const list = myCities(c, p => p.pop >= 2 && p.dirty >= 3 && !cityFocusOn(c.g, p.city, "garden"));
      if (!list.length) return null;
      const p = list.sort((a, b) => b.dirty - a.dirty)[0];
      return { p, w: 0.5 + p.dirty * 0.08 };
    },
    make: (c, f) => ({
      title: `Smog over ${f.p.city.name}`, cell: f.p.city.cell, cityId: f.p.id,
      body: `A thick yellow smog has settled over ${f.p.city.name}. Doctors report crowded clinics and people cough in the streets. The works say they cannot afford to clean their chimneys.`,
      options: [
        { id: "a", tag: "kind", label: `A clean-air law for ${f.p.city.name}`, effects: [cityMod(f.p, "clean_air", "Clean-air law", { mood: 10, out: -0.03 }, 12)] },
        { id: "b", tag: "thrift", label: "Pay for filters in the chimneys", effects: [{ t: "money", v: cityCost(f.p, 0.02, 0.3) }, cityMod(f.p, "filters", "Filters in the chimneys", { mood: 6 }, 8)] },
        { id: "c", tag: "force", label: "Smoke means jobs", effects: [cityMod(f.p, "smog", "Choking smog", { mood: -8 }, 8), popEffect(c, f.p.id, -0.004)] },
      ], def: "b",
    }),
  },
  housing: {
    cat: "Society", icon: "town", tone: "bad",
    find: c => {
      const list = myCities(c, p => p.pop >= 1.5 && ((p.growth || 0) >= 0.06 || (p.inflow || 0) >= 0.03 * p.pop));
      if (!list.length) return null;
      const p = list.sort((a, b) => (b.growth || 0) - (a.growth || 0))[0];
      return { p, w: 0.6 + Math.min(1.5, (p.growth || 0) * 6) };
    },
    make: (c, f) => ({
      title: `No room in ${f.p.city.name}`, cell: f.p.city.cell, cityId: f.p.id,
      body: `${f.p.city.name} ${(f.p.growth || 0) >= 0.02 ? `has grown by ${pct(f.p.growth)} in a year` : "is filling with newcomers"}. Families sleep in sheds and cellars, and rents have doubled. The city council asks the government for help.`,
      options: [
        { id: "a", tag: "kind", label: "Build housing estates", effects: [{ t: "money", v: cityCost(f.p, 0.025, 0.3) }, cityMod(f.p, "housing", "New housing estates", { mood: 8 }, 8)] },
        { id: "b", tag: "thrift", label: "Rent controls", effects: [cityMod(f.p, "rent_control", "Rent controls", { mood: 4, out: -0.02 }, 8)] },
        { id: "c", tag: "force", label: "Let the market sort it out", effects: [cityMod(f.p, "no_housing", "Housing shortage", { mood: -8 }, 6)] },
      ], def: "b",
    }),
  },
  minebust: {
    cat: "Labor", icon: "mine", tone: "bad",
    find: c => {
      const seen = c.g.story.busts || [];
      for (const x of c.econ.sites || []) {
        if (!x.site.exhausted || !SITE_KINDS[x.kind].res || c.g.turn - (x.site.exhaustedAt ?? -99) > 2 || seen.includes(x.site.id)) continue;
        const p = cityProfiles(c.w, c.g).get(x.townId);
        if (p && p.owner === c.nid && p.occupied < 0) return { p, site: x.site, w: 2 };
      }
      return null;
    },
    make: (c, f) => {
      (c.g.story.busts = c.g.story.busts || []).push(f.site.id);
      return {
        title: `The mine is closing at ${f.p.city.name}`, cell: f.p.city.cell, cityId: f.p.id,
        body: `${f.site.name} is worked out. Its miners have lost their jobs, and the shops on the main street of ${f.p.city.name} are closing one by one.`,
        options: [
          { id: "a", tag: "kind", label: "Retrain the miners", effects: [{ t: "money", v: cityCost(f.p, 0.015, 0.2) }, cityMod(f.p, "retrain", "Retraining for the miners", { mood: 5 }, 6)] },
          { id: "b", tag: "thrift", label: "Help families move to towns with work", effects: [popEffect(c, f.p.id, -0.03), cityMod(f.p, "moved_on", "Families moved on", { mood: 2 }, 4)] },
          { id: "c", tag: "force", label: "They must fend for themselves", effects: [cityMod(f.p, "abandoned", "An abandoned mining town", { mood: -10 }, 8)] },
        ], def: "b",
      };
    },
  },
  students: {
    cat: "Politics", icon: "scroll", tone: "bad",
    find: c => {
      const edu = EDU_ORDER.indexOf(c.n.laws.education || "basic");
      const unprovoked = c.g.wars.some(x => x.sideA[0] === c.nid && x.cbStrength === 0);
      if (edu > 1 && c.n.stability >= 45 && !unprovoked) return null;
      const list = myCities(c, p => p.has.has("learning"));
      if (!list.length) return null;
      return { p: list.sort((a, b) => b.know - a.know)[0], edu, unprovoked, w: 0.6 + (edu <= 0 ? 0.6 : 0) + (unprovoked ? 0.5 : 0) };
    },
    make: (c, f) => {
      const up = EDU_ORDER[f.edu + 1];
      const why = f.unprovoked ? "march against the war" : f.edu <= 1 ? "say the universities are starving for money" : "demand a say in how the country is run";
      return {
        title: `Students march in ${f.p.city.name}`, cell: f.p.city.cell, cityId: f.p.id,
        body: `Thousands of students have filled the squares of ${f.p.city.name}. They ${why}. The rector asks the government to listen.`,
        options: [
          ...(up && f.edu <= 1 ? [{ id: "a", tag: "kind", label: `Raise education to ${EDU_LAWS[up].label.toLowerCase()}`, effects: [{ t: "law", law: "education", value: up }, cityMod(f.p, "students_won", "The students won", { mood: 6 }, 6)] }] : []),
          { id: "b", tag: "kind", label: "Meet the students' leaders", effects: [{ t: "stab", v: 1 }, cityMod(f.p, "students_heard", "The government listened", { mood: 4 }, 6)] },
          { id: "c", tag: "force", label: "Close the universities for a season", effects: [{ t: "mod", key: "uni_closed", label: "Universities closed", research: -0.15, seasons: 1 }, cityMod(f.p, "uni_closed", "Universities closed by force", { mood: -10 }, 8)] },
        ], def: "b",
      };
    },
  },
  separatists: {
    cat: "Politics", icon: "flag", tone: "bad",
    find: c => {
      const list = myCities(c, p => !p.native && (p.city.loyalty ?? 90) < 35 && (p.city.mood ?? 55) < 45);
      if (!list.length) return null;
      return { p: list.sort((a, b) => a.city.loyalty - b.city.loyalty)[0], w: 1.5 };
    },
    make: (c, f) => {
      const o = f.p.city.origin;
      return {
        title: `Separatists in ${f.p.city.name}`, cell: f.p.city.cell, cityId: f.p.id,
        body: `In ${f.p.city.name} many still feel they belong to the ${nameOf(c.g, o)}. Their flags hang from windows, and a committee demands self-rule. Our officials are afraid to walk in some streets.`,
        options: [
          { id: "a", tag: "kind", label: "Grant the city self-rule", effects: [{ t: "cityLoyalty", cityId: f.p.id, v: 18 }, cityMod(f.p, "self_rule", "Self-rule", { out: -0.04 }, 12), ...(c.g.nations[o] && c.g.nations[o].alive && o !== c.nid ? [{ t: "opinion", from: o, v: 4, key: "autonomy", label: "Gave our people self-rule" }] : [])] },
          { id: "b", tag: "force", label: "Arrest the leaders", effects: [{ t: "stab", v: -1 }, { t: "cityLoyalty", cityId: f.p.id, v: -6 }, cityMod(f.p, "arrests", "Arrests in the night", { mood: -12 }, 8)] },
          { id: "c", tag: "thrift", label: "Invest in the city", effects: [{ t: "money", v: cityCost(f.p, 0.03, 0.4) }, { t: "cityLoyalty", cityId: f.p.id, v: 8 }, cityMod(f.p, "invest", "Investment from the government", { mood: 10 }, 8)] },
          { id: "d", tag: "proud", label: "Ignore them", effects: [{ t: "cityLoyalty", cityId: f.p.id, v: -3 }, cityMod(f.p, "ignored", "Ignored by the government", { mood: -4 }, 6)] },
        ], def: "d",
      };
    },
  },
  borderfear: {
    cat: "Border", icon: "shield", tone: "bad",
    find: c => {
      const list = myCities(c, p => p.fear && !p.garrison && !cityFocusOn(c.g, p.city, "fortress") && !cityModsActive(c.g, p.city).some(m => m.def));
      if (!list.length) return null;
      return { p: list.sort((a, b) => b.imp - a.imp)[0], w: 1 };
    },
    make: (c, f) => ({
      title: `Fear on the border at ${f.p.city.name}`, cell: f.p.city.cell, cityId: f.p.id,
      body: `The army of the ${nameOf(c.g, f.p.near)} is gathering across the border from ${f.p.city.name}. Families pack their carts at night, and the mayor asks: who will defend us?`,
      options: [
        { id: "a", tag: "force", label: "Fortify the town", effects: [{ t: "money", v: cityCost(f.p, 0.025, 0.5) }, cityMod(f.p, "fortified", "Trenches and bunkers", { def: 0.2, mood: 4 }, 12)] },
        { id: "b", tag: "kind", label: "Reassure the people", effects: [cityMod(f.p, "reassured", "The government promised protection", { mood: 3 }, 4)] },
        { id: "c", tag: "thrift", label: "Move families inland", effects: [popEffect(c, f.p.id, -0.02), cityMod(f.p, "evacuated", "Families moved inland", { mood: -2 }, 4)] },
      ], def: "b",
    }),
  },
  festival: {
    cat: "Society", icon: "flag", tone: "good",
    find: c => {
      const round = y => y === 10 || (y >= 25 && y % 25 === 0);
      const list = myCities(c, p => round(Math.floor(p.age)) && (p.city.mood ?? 55) >= 45 && p.rankN <= 4 && !cityModsActive(c.g, p.city).some(m => m.key === "festival" || m.key === "no_festival"));
      if (!list.length) return null;
      return { p: list.sort((a, b) => b.age - a.age)[0], w: 0.9 };
    },
    make: (c, f) => {
      const yrs = Math.floor(f.p.age);
      return {
        title: `${f.p.city.name} celebrates ${yrs} years`, cell: f.p.city.cell, cityId: f.p.id,
        body: `${f.p.city.name} was founded ${yrs} years ago, and the city wants a celebration: parades, fireworks over the rooftops and a new statue in the main square.`,
        options: [
          { id: "a", tag: "kind", label: "A grand festival", effects: [{ t: "money", v: cityCost(f.p, 0.015, 0.2) }, { t: "stab", v: 1 }, cityMod(f.p, "festival", "Anniversary festival", { mood: 8 }, 6), { t: "prestige", v: 2, cat: "people", why: `${f.p.city.name}'s festival` }] },
          { id: "b", tag: "thrift", label: "A modest celebration", effects: [cityMod(f.p, "festival", "A modest celebration", { mood: 4 }, 4)] },
          { id: "c", tag: "force", label: "No money for parties", effects: [cityMod(f.p, "no_festival", "No festival this year", { mood: -3 }, 4)] },
        ], def: "b",
      };
    },
  },
  charter: {
    cat: "Economy", icon: "coin", tone: "good",
    find: c => {
      const list = myCities(c, p => (p.has.has("port") || p.has.has("hub") || p.has.has("finance") || p.has.has("river") || p.estuary || cityFocusOn(c.g, p.city, "market") || p.rankN === 1) && p.gdp >= 0.06 * c.econ.gdp && !cityModsActive(c.g, p.city).some(m => m.key === "charter" || m.key === "no_charter"));
      if (!list.length) return null;
      return { p: list.sort((a, b) => b.gdp - a.gdp)[0], w: 0.6 };
    },
    make: (c, f) => ({
      title: `The merchants of ${f.p.city.name} ask for a charter`, cell: f.p.city.cell, cityId: f.p.id,
      body: `The merchants' guild of ${f.p.city.name} asks for a charter: the right to run their own exchange, set fair rules and keep a share of the customs. They promise the city will boom.`,
      options: [
        { id: "a", tag: "thrift", label: "Grant the charter", effects: [cityMod(f.p, "charter", "Merchants' charter", { out: 0.04 }, 16), { t: "mod", key: "charter_customs", label: `Customs kept by ${f.p.city.name}'s merchants`, revenue: -0.01, seasons: 16 }] },
        { id: "b", tag: "proud", label: "Refuse: trade answers to the state", effects: [cityMod(f.p, "no_charter", "The charter was refused", { mood: -4 }, 6)] },
      ], def: "a",
    }),
  },
  cityfire: {
    cat: "Disaster", icon: "fire", tone: "bad",
    find: c => {
      const list = myCities(c, p => p.pop >= 3 && p.age >= 4);
      if (!list.length) return null;
      return { p: list[Math.floor(c.rng() * list.length)], w: 0.25 };
    },
    make: (c, f) => ({
      title: `Fire in the old town of ${f.p.city.name}`, cell: f.p.city.cell, cityId: f.p.id,
      body: `A fire that started in a bakery has spread through the narrow wooden streets of ${f.p.city.name}'s old town. Hundreds of houses are ash, and thousands of families need a roof.`,
      options: [
        { id: "a", tag: "kind", label: "Rebuild it as it was", effects: [{ t: "money", v: cityCost(f.p, 0.02, 0.3) }, cityMod(f.p, "rebuilt", "The old town rebuilt", { mood: 2 }, 4)] },
        { id: "b", tag: "bold", label: "Rebuild with wide streets and stone", effects: [{ t: "money", v: cityCost(f.p, 0.04, 0.5) }, cityMod(f.p, "rebuilt", "Rebuilt in stone, with wide streets", { out: 0.03, mood: 4 }, 16)] },
        { id: "c", tag: "thrift", label: "Leave it to the people", effects: [popEffect(c, f.p.id, -0.012), cityMod(f.p, "burnt", "Burnt-out streets", { mood: -8 }, 8)] },
      ], def: "a",
    }),
  },
  riots: {
    cat: "Politics", icon: "fist", tone: "bad",
    find: c => {
      const list = myCities(c, p => (p.city.mood ?? 55) < 28);
      if (!list.length) return null;
      const p = list.sort((a, b) => a.city.mood - b.city.mood)[0];
      return { p, w: 1.4 + (28 - p.city.mood) / 10 };
    },
    make: (c, f) => ({
      title: `Riots in ${f.p.city.name}`, cell: f.p.city.cell, cityId: f.p.id,
      body: `Angry crowds in ${f.p.city.name} have smashed shop windows and set carts on fire. Their anger: ${topNeg(f.p)}. The police ask for orders.`,
      options: [
        { id: "a", tag: "kind", label: "Promise reforms and spending", effects: [{ t: "money", v: cityCost(f.p, 0.015, 0.2) }, cityMod(f.p, "reforms", "Promised reforms", { mood: 10 }, 6)] },
        { id: "b", tag: "force", label: "Curfew and police on every corner", effects: [{ t: "stab", v: -1 }, cityMod(f.p, "curfew", "Curfew", { mood: -4 }, 6)] },
        { id: "c", tag: "thrift", label: "Let it burn itself out", effects: [{ t: "stab", v: -2 }, cityMod(f.p, "riot_damage", "Riots in the streets", { out: -0.05 }, 2), cityMod(f.p, "riot_bitter", "Bitter after the riots", { mood: -2 }, 4)] },
      ], def: "b",
    }),
  },
  newcomers: {
    cat: "Society", icon: "people", tone: "neutral",
    find: c => {
      const list = myCities(c, p => (p.inflow || 0) >= Math.max(0.015, 0.012 * p.pop));
      if (!list.length) return null;
      return { p: list.sort((a, b) => b.inflow - a.inflow)[0], w: 0.8 };
    },
    make: (c, f) => ({
      title: `Newcomers in ${f.p.city.name}`, cell: f.p.city.cell, cityId: f.p.id,
      body: `${fmtPeople(f.p.inflow)} people came to ${f.p.city.name} last season looking for work. Quarters of shacks have grown at the edge of the city, and old residents grumble.`,
      options: [
        { id: "a", tag: "kind", label: "Schools and help for the newcomers", effects: [{ t: "money", v: cityCost(f.p, 0.01, 0.2) }, cityMod(f.p, "welcome", "Help for the newcomers", { mood: 5 }, 6)] },
        { id: "b", tag: "force", label: `Close ${f.p.city.name} to newcomers`, effects: [cityMod(f.p, "closed", "Closed to newcomers", { noIntake: true, mood: 2 }, 8)] },
        { id: "c", tag: "thrift", label: "Do nothing", effects: [cityMod(f.p, "shanties", "Shanty towns", { mood: -5 }, 6)] },
      ], def: "c",
    }),
  },
  rivalry: {
    cat: "Politics", icon: "town", tone: "bad",
    find: c => {
      const list = myCities(c).filter(p => p.occupied < 0).sort((a, b) => b.imp - a.imp);
      if (list.length < 2 || !list[0].city.capital) return null;
      const [a, b] = list;
      if (b.imp < 25 || b.imp < 0.7 * a.imp || cityModsActive(c.g, b.city).some(m => ["ministry_moved", "snubbed", "promised"].includes(m.key))) return null;
      return { p: b, cap: a, w: 0.45 + Math.min(0.8, (b.imp / a.imp - 0.7) * 2) };
    },
    make: (c, f) => ({
      title: `${f.p.city.name} wants what ${f.cap.city.name} has`, cell: f.p.city.cell, cityId: f.p.id,
      body: `${f.p.city.name} is the nation's second city, and its people feel the capital takes everything: the ministries, the money and the attention. Its newspapers ask why ${f.cap.city.name} should decide everything.`,
      options: [
        { id: "a", tag: "kind", label: `Move a ministry's offices to ${f.p.city.name}`, effects: [{ t: "money", v: cityCost(f.p, 0.012, 0.3) }, cityMod(f.p, "ministry_moved", "A ministry moved here", { mood: 7, out: 0.01 }, 16), cityMod(f.cap, "ministry_left", `A ministry left for ${f.p.city.name}`, { mood: -2 }, 6)] },
        { id: "b", tag: "thrift", label: "Promise more money for its roads and schools", effects: [cityMod(f.p, "promised", "Promises from the capital", { mood: 3 }, 6)] },
        { id: "c", tag: "proud", label: "The capital governs: that is final", effects: [cityMod(f.p, "snubbed", "Snubbed by the capital", { mood: -6 }, 8), cityMod(f.cap, "capital_firm", "The capital stood firm", { mood: 1 }, 4)] },
      ], def: "b",
    }),
  },
  bridge: {
    cat: "Economy", icon: "road", tone: "neutral",
    find: c => {
      const list = myCities(c, p => p.has.has("river") && p.pop >= 1 && !cityModsActive(c.g, p.city).some(m => m.key === "bridge" || m.key === "no_bridge"));
      if (!list.length) return null;
      return { p: list.sort((a, b) => b.pop - a.pop)[0], w: 0.55 };
    },
    make: (c, f) => ({
      title: `A bridge for ${f.p.city.name}`, cell: f.p.city.cell, cityId: f.p.id,
      body: `${f.p.city.name} lies on both banks of ${f.p.riverName}, and the old ferries cannot carry its carts, trams and crowds. The city's engineers have drawn a great bridge.`,
      options: [
        { id: "a", tag: "bold", label: "Build the great bridge", effects: [{ t: "money", v: cityCost(f.p, 0.03, 0.4) }, cityMod(f.p, "bridge", `The great bridge over ${f.p.riverName}`, { out: 0.03, mood: 2, keep: true }, null)] },
        { id: "b", tag: "thrift", label: "More ferries", effects: [{ t: "money", v: cityCost(f.p, 0.006, 0.2) }, cityMod(f.p, "bridge", "More ferries across the river", { out: 0.01 }, 16)] },
        { id: "c", tag: "proud", label: "Not now", effects: [cityMod(f.p, "no_bridge", "The bridge was not built", { mood: -2 }, 8)] },
      ], def: "b",
    }),
  },
  mayor: {
    cat: "Society", icon: "town", tone: "neutral",
    find: c => {
      const list = myCities(c, p => p.pop >= 2.5 && p.rankN <= 2 && !cityModsActive(c.g, p.city).some(m => m.key === "grand" || m.key === "no_grand"));
      if (!list.length) return null;
      return { p: list[0], w: 0.45 };
    },
    make: (c, f) => ({
      title: `The mayor of ${f.p.city.name} has a grand plan`, cell: f.p.city.cell, cityId: f.p.id,
      body: `The mayor of ${f.p.city.name} wants the whole world to talk about the city. Her plan: trams and an underground railway under the main streets, or a great stadium for the games. She asks the government to pay.`,
      options: [
        { id: "a", tag: "bold", label: "Pay for the trams and the underground", effects: [{ t: "money", v: cityCost(f.p, 0.03, 0.5) }, cityMod(f.p, "grand", "Trams and an underground railway", { out: 0.025, mood: 3, keep: true }, null)] },
        { id: "b", tag: "kind", label: "Pay for the stadium", effects: [{ t: "money", v: cityCost(f.p, 0.012, 0.3) }, cityMod(f.p, "grand", "The great stadium", { mood: 6 }, 16), { t: "prestige", v: 1, cat: "people", why: `${f.p.city.name}'s stadium` }] },
        { id: "c", tag: "thrift", label: "The city must pay for its own dreams", effects: [cityMod(f.p, "no_grand", "The government said no to the mayor", { mood: -2 }, 8)] },
      ], def: "c",
    }),
  },
  fair: {
    cat: "Economy", icon: "coin", tone: "good",
    find: c => {
      const list = myCities(c, p => p.pop >= 1 && (p.has.has("hub") || p.has.has("river") || p.has.has("port") || p.estuary || cityFocusOn(c.g, p.city, "market") || p.rankN === 1) && !cityModsActive(c.g, p.city).some(m => m.key === "fair"));
      if (!list.length || c.g.wars.some(x => x.sideA.includes(c.nid) || x.sideB.includes(c.nid))) return null;
      return { p: list[Math.floor(c.rng() * list.length)], w: 0.4 };
    },
    make: (c, f) => ({
      title: `A great fair in ${f.p.city.name}`, cell: f.p.city.cell, cityId: f.p.id,
      body: `Merchants from across the region want to hold a great fair in ${f.p.city.name}: stalls in every square, new machines on show and buyers from abroad. They ask the government to help build the halls.`,
      options: [
        { id: "a", tag: "kind", label: "Build the exhibition halls", effects: [{ t: "money", v: cityCost(f.p, 0.01, 0.2) }, cityMod(f.p, "fair", "The great fair", { out: 0.05, mood: 4 }, 2), { t: "prestige", v: 1, cat: "people", why: `The great fair at ${f.p.city.name}` }] },
        { id: "b", tag: "thrift", label: "Let the merchants pay for it", effects: [cityMod(f.p, "fair", "A merchants' fair", { out: 0.02 }, 1)] },
      ], def: "b",
    }),
  },
  oldquarter: {
    cat: "Society", icon: "town", tone: "neutral",
    find: c => {
      const list = myCities(c, p => p.has.has("heritage") && p.pop >= 1.5 && !cityModsActive(c.g, p.city).some(m => m.key === "oldtown"));
      if (!list.length) return null;
      return { p: list.sort((a, b) => b.pop - a.pop)[0], w: 0.4 };
    },
    make: (c, f) => ({
      title: `Builders want the old quarter of ${f.p.city.name}`, cell: f.p.city.cell, cityId: f.p.id,
      body: `Builders want to pull down the crooked old streets at the heart of ${f.p.city.name} and put up offices, shops and wide avenues. The old families and the painters say the city would lose its soul.`,
      options: [
        { id: "a", tag: "kind", label: "Protect the old quarter", effects: [cityMod(f.p, "oldtown", "The old quarter is protected", { mood: 3, out: -0.01, keep: true }, null)] },
        { id: "b", tag: "bold", label: "Let them build the new avenues", effects: [cityMod(f.p, "oldtown", "New avenues through the old town", { out: 0.03, keep: true }, null), cityMod(f.p, "oldtown_lost", "The old quarter was pulled down", { mood: -7 }, 8)] },
        { id: "c", tag: "thrift", label: "Restore the old houses for new shops", effects: [{ t: "money", v: cityCost(f.p, 0.012, 0.2) }, cityMod(f.p, "oldtown", "The old quarter restored", { out: 0.01, mood: 2, keep: true }, null)] },
      ], def: "a",
    }),
  },
  silt: {
    cat: "Economy", icon: "anchor", tone: "bad",
    find: c => {
      const list = myCities(c, p => p.has.has("port") && p.age >= 3 && !cityModsActive(c.g, p.city).some(m => m.key === "dredged" || m.key === "silted"));
      if (!list.length) return null;
      return { p: list[Math.floor(c.rng() * list.length)], w: 0.3 };
    },
    make: (c, f) => ({
      title: `The harbor of ${f.p.city.name} is silting up`, cell: f.p.city.cell, cityId: f.p.id,
      body: `Mud carried by the currents has made the harbor of ${f.p.city.name} shallow. The biggest ships must wait for the high tide, and some captains now sail to other ports.`,
      options: [
        { id: "a", tag: "thrift", label: "Dredge the harbor", effects: [{ t: "money", v: cityCost(f.p, 0.012, 0.3) }, cityMod(f.p, "dredged", "Deep water in the harbor", { out: 0.01 }, 40)] },
        { id: "b", tag: "proud", label: "The ships can wait for the tide", effects: [cityMod(f.p, "silted", "A shallow harbor", { out: -0.04 }, 12)] },
      ], def: "a",
    }),
  },
};
Object.assign(DECISIONS, CITY_DECISIONS);

