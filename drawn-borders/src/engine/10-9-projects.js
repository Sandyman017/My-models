/* =====================================================================
   9. Projects: roads, towns, ports, irrigation — quotes, value, ordering
   ===================================================================== */
function hypothetical(g, change) {
  const h = { ...g };
  if (change.edges) { h.roads = new Set(g.roads); change.edges.forEach(e => h.roads.add(e)); }
  if (change.claim) { h.owner = g.owner.slice(); change.claim.forEach(c => { h.owner[c] = change.nid; }); h.owner[change.city.cell] = change.nid; }
  if (change.city) h.cities = g.cities.concat([change.city]);
  if (change.portCity) h.cities = g.cities.map(c => (c.id === change.portCity ? { ...c, port: true } : c));
  if (change.portUp) h.cities = (h.cities || g.cities).map(c => (c.id === change.portUp.cityId ? { ...c, portLvl: change.portUp.level } : c));
  if (change.wharfCity) h.cities = (h.cities || g.cities).map(c => (c.id === change.wharfCity ? { ...c, wharf: true } : c));
  if (change.freighters) h.nations = g.nations.map(n => (n.id === change.nid ? { ...n, freighters: (n.freighters || 0) + change.freighters } : n));
  if (change.irrigate) { h.irrigated = g.irrigated.slice(); change.irrigate.forEach(c => { h.irrigated[c] = 1; }); }
  if (change.treaty) h.treaties = (g.treaties || []).concat([{ id: -1, ...change.treaty }]);
  // embargoes live in the trade book (10s): the copy gets its own list, the contracts stay shared (never changed)
  if ((change.embargo || change.lift) && g.trade) {
    let E = g.trade.embargoes || [];
    if (change.lift) E = E.filter(e => !(change.lift.id !== undefined ? e.id === change.lift.id : e.by === change.lift.by && e.on === change.lift.on));
    if (change.embargo) E = E.concat([change.embargo]);
    h.trade = { ...g.trade, embargoes: E };
  }
  // "this season": merchants have not yet looked for other sellers for what an embargo or war cut off (10s)
  if (change.noReroute) h.noReroute = true;
  if (change.site) {
    const sp = change.site;
    if (sp.id !== undefined) h.sites = g.sites.map(x => (x.id === sp.id ? { ...x, level: sp.level } : x));
    else h.sites = g.sites.concat([{ id: -1, cell: sp.cell, kind: sp.kind, level: sp.level || 1, pace: "normal", paused: false, opened: g.turn, extracted: 0, name: sp.name || "" }]);
  }
  if (change.work) {
    const k = change.work.key;
    h.works = { ...(g.works || {}), [k]: { owner: change.work.nid, done: g.turn, cell: change.work.cell, builders: {} } };
  }
  if (change.smelter) h.sites = (h.sites || g.sites).map(x => (x.id === change.smelter ? { ...x, smelter: true } : x));
  if (change.focus) h.cities = (h.cities || g.cities).map(c => (c.id === change.focus.cityId ? { ...c, focus: change.focus.key, focusAt: g.turn } : c));
  if (change.industry) {
    const { cityId, kind } = change.industry;
    h.cities = (h.cities || g.cities).map(c => (c.id === cityId ? { ...c, ind: { ...(c.ind || {}), [kind]: ((c.ind || {})[kind] || 0) + 1 } } : c));
  }
  return h;
}

function projectValue(w, g, nid, change, baseEcon) {
  const base = baseEcon || computeEconomy(w, g, nid);
  const after = computeEconomy(w, hypothetical(g, change), nid);
  const perPerson = base.gdp / Math.max(0.001, base.pop);
  const dGdp = after.gdp - base.gdp;
  const dFood = after.food - base.food;
  const famineRelief = Math.max(0, base.faminePop - after.faminePop);
  const value = dGdp + Math.max(0, dFood) * perPerson * ECON.futureFoodWeight + famineRelief * perPerson * 0.5;
  const satChanges = GOOD_ORDER.filter(k => base.sat && after.sat && base.goods.demand[k] > 0.05 && after.sat[k] - base.sat[k] > 0.02).map(k => ({ good: k, from: base.sat[k], to: after.sat[k] }));
  const satLosses = GOOD_ORDER.filter(k => base.sat && after.sat && base.goods.demand[k] > 0.05 && base.sat[k] - after.sat[k] > 0.02).map(k => ({ good: k, from: base.sat[k], to: after.sat[k] }));
  // a smelter: how much ore it would really smelt, and whether it would have coal and electricity to do it
  const sx = change && change.smelter != null ? (after.sites || []).find(y => y.site && y.site.id === change.smelter) : null;
  const smelt = sx && sx.smelterX ? { smelted: sx.smelterX.processed || 0, smeltCoal: after.sat ? after.sat.coal ?? 1 : 1, smeltPower: after.sat ? after.sat.power ?? 1 : 1 } : {};
  return { dGdp, dFood, famineRelief, value, gdpBase: base.gdp, reconnected: base.isolated.length - after.isolated.length, satChanges, satLosses, ...smelt };
}

function canAfford(n, gdp, cost) {
  if (gdp > 0 && Math.max(0, -n.treasury) / gdp > ECON.lendersCloseAt) return { ok: false, reason: "Lenders refuse new loans while debt is above 120% of GDP." };
  if (n.treasury - cost < BUILD.creditFloorShare * gdp) return { ok: false, reason: `Not enough money. This would push debt past ${pct(-BUILD.creditFloorShare)} of GDP.` };
  return { ok: true };
}

function busyCity(g, cityId, kind) { return g.projects.some(p => p.cityId === cityId && p.kind === kind); }

/* A road into another nation's land is a trade road: it needs a trade agreement (or alliance), and crosses only
   our land, wild land and theirs. We pay for all of it. */
function tradeRoadBlock(g, nid, other) {
  if (!g.nations[other] || !g.nations[other].alive) return "That nation no longer exists.";
  if (atWar(g, nid, other)) return `You are at war with the ${nameOf(g, other)}.`;
  if (!hasTreaty(g, nid, other, "trade") && !hasTreaty(g, nid, other, "alliance"))
    return `A road into the ${nameOf(g, other)}'s land needs a trade agreement with them first. Agree to trade, then build the road: the road is what lets the goods move.`;
  return null;
}
function quoteTradeRoad(w, g, nid, fromCity, toCity) {
  const other = toCity.owner;
  const block = tradeRoadBlock(g, nid, other);
  if (block) return { ok: false, kind: "road", reason: block };
  const path = findRoadPath(w, g, nid, fromCity.cell, toCity.cell, new Set([nid, -1, other]));
  if (!path) return { ok: false, kind: "road", reason: `No route over land joins ${fromCity.name} and ${toCity.name} without crossing a third nation.` };
  if (path.length > BUILD.roadMaxReach * 1.8) return { ok: false, kind: "road", path, reason: "Too far for one road. Start from a town closer to the border." };
  const q = roadQuote(w, g, path);
  if (!q.newEdges.length) return { ok: false, kind: "road", path, reason: "These towns are already connected by road." };
  // they build the stretch inside their own land; we pay for ours and the wild land between
  const theirs = q.newEdges.filter(e => edgeEnds(e).every(c => g.owner[c] === other));
  const theirShare = theirs.length ? roadQuote(w, { ...g, roads: new Set([...g.roads, ...q.newEdges.filter(e => !theirs.includes(e))]) }, path).cost : 0;
  q.partnerCost = theirShare;
  q.cost = Math.max(0, q.cost - theirShare);
  const value = projectValue(w, g, nid, { edges: q.newEdges });
  return { ok: true, kind: "road", trade: other, nid, path, from: fromCity, to: toCity, ...q, ...value, label: `Trade road from ${fromCity.name} to ${toCity.name} (the ${nameOf(g, other)})` };
}
/* The cheapest trade road between two nations, if one can be built. */
function bestTradeRoad(w, g, nid, other) {
  const mine = g.cities.filter(c => c.owner === nid && !(g.occ && g.occ[c.cell] >= 0));
  const theirs = g.cities.filter(c => c.owner === other && !(g.occ && g.occ[c.cell] >= 0));
  const pairs = [];
  for (const a of mine) for (const b of theirs) pairs.push({ a, b, d: dist(a.cell, b.cell) });
  pairs.sort((x, y) => x.d - y.d);
  for (const p of pairs.slice(0, 3)) {
    if (p.d > BUILD.roadMaxReach * 1.4) break;
    const q = quoteTradeRoad(w, g, nid, p.a, p.b);
    if (q.ok) return q;
  }
  return null;
}

function quoteRoad(w, g, nid, fromCity, toCity) {
  if (fromCity.id === toCity.id) return { ok: false, kind: "road", reason: "Pick a different town." };
  if (fromCity.owner !== nid) return { ok: false, kind: "road", reason: "Start the road at one of your own towns." };
  if (toCity.owner !== nid) return quoteTradeRoad(w, g, nid, fromCity, toCity);
  const path = findRoadPath(w, g, nid, fromCity.cell, toCity.cell);
  if (!path) return { ok: false, kind: "road", reason: "No route through your own land connects these towns." };
  const q = roadQuote(w, g, path);
  if (!q.newEdges.length) return { ok: false, kind: "road", path, reason: "These towns are already connected by road." };
  if (path.length > BUILD.roadMaxReach * 1.6) return { ok: false, kind: "road", path, reason: "Too far for one road. Connect a closer town first." };
  const value = projectValue(w, g, nid, { edges: q.newEdges });
  if (value.reconnected > 0) value.value += 0.012 * value.gdpBase * value.reconnected;
  return { ok: true, kind: "road", nid, path, from: fromCity, to: toCity, ...q, ...value, label: `Road from ${fromCity.name} to ${toCity.name}` };
}

function townClaim(w, g, site) {
  const claim = [];
  const R = Math.ceil(BUILD.townClaimRadius);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = cellX(site) + dx, y = cellY(site) + dy;
    if (!inBounds(x, y) || dx * dx + dy * dy > BUILD.townClaimRadius ** 2) continue;
    const i = idx(x, y);
    if (isLand(w, i) && g.owner[i] === -1) claim.push(i);
  }
  return claim;
}

function nearOwnLand(g, nid, cell, reach) {
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const x = cellX(cell) + dx, y = cellY(cell) + dy;
    if (inBounds(x, y) && g.owner[idx(x, y)] === nid) return true;
  }
  return false;
}

function quoteTown(w, g, nid, site) {
  const fail = reason => ({ ok: false, kind: "town", site, reason });
  if (!isLand(w, site)) return fail("Towns must be built on land.");
  const owner = g.owner[site];
  if (owner !== nid && owner !== -1) return fail("That land belongs to another nation.");
  if (g.occ && g.occ[site] >= 0) return fail("That land is occupied by an enemy army.");
  for (const t of g.treaties || []) {
    if (t.type !== "border" || (t.a !== nid && t.b !== nid)) continue;
    const other = t.a === nid ? t.b : t.a;
    if (distanceToNation(g, other, site) <= DIPLO.nearBorderCells) return fail(`Your border accord with the ${g.nations[other].name} forbids new towns this close to them.`);
  }
  const nearest = g.cities.reduce((m, c) => Math.min(m, dist(c.cell, site)), Infinity);
  const pendingNear = g.projects.some(p => p.kind === "town" && dist(p.site, site) < BUILD.townMinSpacing);
  if (nearest < BUILD.townMinSpacing || pendingNear) return fail("Too close to another town.");
  let overseas = null;
  if (owner === -1 && !nearOwnLand(g, nid, site, BUILD.townReach)) {
    overseas = overseasTownCheck(w, g, nid, site);
    if (!overseas.ok) return fail(overseas.reason);
  }
  const claim = townClaim(w, g, site);
  const name = uniqueName({ usedNames: new Set(g.usedNames) }, mulberry32(site * 977 + g.turn * 13 + nid));
  const city = { id: -1, owner: nid, cell: site, name, capital: false, port: false, irrigated: false };
  const value = projectValue(w, g, nid, { nid, claim, city });
  let claimFood = 0;
  claim.forEach(c => { claimFood += cellFood(w, g, c); });
  return {
    ok: true, kind: "town", nid, site, claim, name, claimFood, ...value, overseas: !!overseas, fromPort: overseas ? overseas.port.id : null,
    cost: (BUILD.townBaseB + BUILD.townPerCellB * claim.length) * (1 + 0.12 * g.cities.filter(c => c.owner === nid).length) + (overseas ? 1 : 0), seasons: 1, label: overseas ? `New town of ${name}, across the sea` : `New town of ${name}`,
  };
}

function quotePort(w, g, nid, city) {
  const fail = reason => ({ ok: false, kind: "port", reason });
  if (city.owner !== nid) return fail("Not your town.");
  if (city.port) return fail(`${city.name} already has a port.`);
  if (!w.coastal[city.cell]) return fail(`${city.name} is not on the coast.`);
  if (portSeaCell(w, city.cell) < 0) return fail(`${city.name} lies on a lake, not the open sea: ships could not reach it.`);
  if (busyCity(g, city.id, "port")) return fail("A port is already being built here.");
  const value = projectValue(w, g, nid, { portCity: city.id });
  const room = g.sea ? portRoomValue(w, g, nid, PORT_LEVELS[1].tradeMt) : 0;
  value.dGdp += room; value.value += room; value.room = room;
  return { ok: true, kind: "port", nid, cityId: city.id, cost: BUILD.portB, seasons: 1, ...value, label: `Harbor at ${city.name}` };
}

function regionCellsOf(w, g, nid, city) {
  const econ = computeEconomy(w, g, nid);
  const r = econ.regions.find(r => r.city.id === city.id);
  return r ? r.cells : [];
}

function quoteIrrigation(w, g, nid, city) {
  const fail = reason => ({ ok: false, kind: "irrigation", reason });
  if (city.owner !== nid) return fail("Not your town.");
  if (city.irrigated) return fail(`${city.name}'s fields are already irrigated.`);
  if (busyCity(g, city.id, "irrigation")) return fail("Irrigation is already being dug here.");
  const plains = regionCellsOf(w, g, nid, city).filter(c => w.terrain[c] === T.PLAINS && !g.irrigated[c]);
  if (plains.length < BUILD.irrigationMinPlains) return fail(`Too little farmland around ${city.name} to irrigate.`);
  const value = projectValue(w, g, nid, { irrigate: plains });
  return {
    ok: true, kind: "irrigation", nid, cityId: city.id, cells: plains,
    cost: BUILD.irrigationBaseB + BUILD.irrigationPerPlainsB * plains.length,
    seasons: BUILD.irrigationSeasons, ...value, label: `Irrigation around ${city.name}`,
  };
}

function orderProject(g, quote, reason, isPrivate = false) {
  if (quote.kind === "work") { startWork(g, quote); return { kind: "work", label: quote.label }; }
  const n = g.nations[quote.nid];
  if (!isPrivate) { n.treasury -= quote.cost; n.buildSpend = (n.buildSpend || 0) + quote.cost; }
  const p = { id: g.nextId++, kind: quote.kind, nid: quote.nid, cost: quote.cost, label: quote.label, seasons: quote.seasons, progress: 0, reason: reason || null, private: isPrivate };
  if (quote.kind === "industry") { p.cityId = quote.cityId; p.ind = quote.ind; }
  if (quote.kind === "site") { p.cell = quote.cell; p.siteKind = quote.siteKind; p.siteId = quote.siteId; p.level = quote.level; p.name = quote.name; }
  if (quote.kind === "survey") p.cell = quote.cell;
  if (quote.kind === "smelter") { p.cell = quote.cell; p.siteId = quote.siteId; }
  if (quote.partnerCost && quote.trade !== undefined && g.nations[quote.trade]) g.nations[quote.trade].treasury -= quote.partnerCost;
  if (quote.kind === "road") { p.edges = quote.newEdges; p.path = quote.path; }
  if (quote.kind === "town") { p.site = quote.site; p.name = quote.name; g.usedNames.add(quote.name); if (quote.overseas) { p.overseas = true; p.fromPort = quote.fromPort; n.lastOverseas = g.turn; } }
  if (quote.kind === "portup") { p.cityId = quote.cityId; p.level = quote.level; }
  if (quote.kind === "wharf") p.cityId = quote.cityId;
  if (quote.kind === "ships") {
    p.cityId = quote.cityId; p.ship = quote.ship; p.count = quote.count; p.slips = quote.slips || 0; p.ordered = g.turn;
    if (quote.seller !== undefined) { p.seller = quote.seller; if (quote.yardId !== undefined) p.yardId = quote.yardId; if (quote.seller >= 0 && g.nations[quote.seller]) g.nations[quote.seller].treasury += quote.cost; }
  }
  if (quote.kind === "focus") { p.cityId = quote.cityId; p.focus = quote.focus; }
  if (quote.kind === "capital") { p.cityId = quote.cityId; addNationMod(g, n, { key: "capital_move", label: "The government is moving to a new capital", stab: -3, seasons: quote.seasons }); }
  if (quote.kind === "port" || quote.kind === "irrigation") p.cityId = quote.cityId;
  if (quote.kind === "irrigation") p.cells = quote.cells;
  if (quote.kind === "province") p.op = quote.op;
  g.projects.push(p);
  return p;
}

/* Advance construction one season. Roads appear on the map piece by piece. */
function advanceProjects(w, g) {
  const finished = [];
  for (const p of g.projects) {
    p.progress += 1;
    if (p.kind === "road") {
      const built = Math.min(p.edges.length, p.progress * BUILD.roadEdgesPerSeason);
      p.edges.slice(0, built).forEach(e => g.roads.add(e));
    }
    if (p.progress >= p.seasons) finished.push(p);
  }
  for (const p of finished) {
    if (p.kind === "town") {
      const siteOwner = g.owner[p.site];
      if (siteOwner !== -1 && siteOwner !== p.nid) { p.failed = true; g.nations[p.nid].treasury += p.cost * 0.5; continue; }
      townClaim(w, g, p.site).forEach(c => { g.owner[c] = p.nid; });
      g.owner[p.site] = p.nid;
      const born = { id: g.nextId++, owner: p.nid, cell: p.site, name: p.name, capital: false, port: false, irrigated: false, founded: g.turn, origin: p.nid, loyalty: 85, mood: 60, hist: [] };
      g.cities.push(born);
      cityHist(g, born, `Founded by the ${nameOf(g, p.nid)}${p.overseas ? ", by settlers who came across the sea" : ""}.`, "good");
      leaderDeed(g, p.nid, "towns");
      if (g.rel) {
        bumpWorld(g);
        for (const z of g.nations) {
          if (z.id === p.nid || !z.alive) continue;
          const d = distanceToNation(g, z.id, p.site);
          if (d > DIPLO.nearBorderCells) continue;
          addMod(g, z.id, p.nid, "settled_near", "Settled land near our border", -10, 0.5, -30);
          remember(g, z.id, `The ${g.nations[p.nid].name} founded ${p.name} only ${Math.round(d)} cells from our border.`);
        }
      }
    }
    if (p.kind === "port") { const c = g.cities.find(c => c.id === p.cityId); if (c) { c.port = true; c.portLvl = Math.max(1, c.portLvl || 1); } }
    if (p.kind === "portup" || p.kind === "wharf" || p.kind === "ships") finishSeaProject(w, g, p);
    if (p.kind === "site") {
      if (g.owner[p.cell] !== p.nid) { p.failed = true; g.nations[p.nid].treasury += p.cost * 0.5; continue; }
      if (p.siteId) { const st = g.sites.find(x => x.id === p.siteId); if (st) st.level = Math.max(st.level, p.level); }
      else if (!g.sites.some(x => x.cell === p.cell)) g.sites.push({ id: g.nextId++, cell: p.cell, kind: p.siteKind, level: 1, pace: "normal", paused: false, opened: g.turn, extracted: 0, name: p.name || siteName(g, p.cell, p.siteKind) });
    }
    if (p.kind === "survey") p.found = finishSurvey(w, g, p);
    if (p.kind === "smelter") {
      const st = g.sites.find(x => x.id === p.siteId);
      if (!st || g.owner[st.cell] !== p.nid || st.exhausted) { p.failed = true; g.nations[p.nid].treasury += p.cost * 0.5; continue; }
      st.smelter = true; st.smelterSince = g.turn;
    }
    if (p.kind === "industry") {
      const c = g.cities.find(c => c.id === p.cityId);
      if (!c || c.owner !== p.nid) { p.failed = true; continue; }
      c.ind = { ...(c.ind || {}), [p.ind]: ((c.ind || {})[p.ind] || 0) + 1 };
    }
    if (p.kind === "irrigation") {
      const c = g.cities.find(c => c.id === p.cityId);
      if (c) c.irrigated = true;
      p.cells.forEach(i => { if (w.terrain[i] === T.PLAINS) g.irrigated[i] = 1; });
    }
    if (p.kind === "focus") finishFocus(g, p);
    if (p.kind === "capital") finishCapitalMove(g, p);
    if (p.kind === "province") finishProvince(w, g, p);
  }
  g.projects = g.projects.filter(p => !finished.includes(p));
  return finished;
}

/* ---------- Building industry: quotes, the state's projects and private investment ---------- */
function industryBlock(w, g, nid, city, kind, econ) {
  const def = INDUSTRIES[kind], n = g.nations[nid];
  if (!def) return "Unknown industry.";
  if (SITE_KINDS[kind]) return "Opened on the map, at a deposit, forest or coast.";
  if (city.owner !== nid) return "Not your town.";
  if (g.occ && g.occ[city.cell] >= 0) return `${city.name} is occupied.`;
  if (def.tech && !hasTech(n, def.tech)) return `Needs the ${TECHS[def.tech].label} technology.`;
  if (def.skill && (n.skill ?? 0.35) < def.skill) return `Needs a more skilled workforce (skill ${pct(def.skill)}, yours ${pct(n.skill ?? 0.35)}). Spend more on education.`;
  const r = econ.regions.find(x => x.city.id === city.id);
  if (!r) return `${city.name} is cut off.`;
  const lvl = cityLevels(city)[kind] || 0;
  const pending = g.projects.filter(p => p.kind === "industry" && p.cityId === city.id && p.ind === kind).length;
  if (pending) return `A ${def.label.toLowerCase()} is already being built in ${city.name}.`;
  if (def.cap) {
    const cap = industryCap(kind, r.res, r.pop, city.port);
    if (lvl >= cap) {
      const why = { fish: "fishing grounds on its coast", forest: "forest in its land", metals: "metal ore", coal: "coal", gold: "gold", oil: "oil or gas", hydro: "rivers in hills or mountains", scenery: "coast or mountains for visitors" }[def.cap];
      return cap === 0 ? `${city.name}'s land has no ${why}.` : `${city.name}'s ${why} can support only ${cap} level${cap > 1 ? "s" : ""}.`;
    }
  }
  if (def.urban) {
    const cap = industryCap(kind, r.res, r.pop, city.port);
    const pendingUrban = g.projects.filter(p => p.kind === "industry" && p.cityId === city.id && INDUSTRIES[p.ind].urban).length;
    if (urbanLevels(city) + pendingUrban >= cap + (cityFocusOn(g, city, "industry") ? 2 : 0)) return `${city.name} (${r.pop.toFixed(1)}M people) has no room for more factories or offices. Bigger towns hold more.`;
  }
  if (def.minMarket) {
    const net = econ.networks[r.net];
    if (net.pop + net.foreign < def.minMarket) return `Needs a market of ${def.minMarket}M people within reach by road (this one has ${(net.pop + net.foreign).toFixed(1)}M).`;
  }
  if (def.perNation) {
    const have = g.cities.filter(c => c.owner === nid).reduce((s, c) => s + (cityLevels(c)[kind] || 0), 0) + g.projects.filter(p => p.nid === nid && p.ind === kind).length;
    if (have >= def.perNation) return `A nation can run at most ${def.perNation} of these.`;
  }
  return null;
}

function quoteIndustry(w, g, nid, city, kind, base) {
  const econ = base || computeEconomy(w, g, nid);
  const block = industryBlock(w, g, nid, city, kind, econ);
  const def = INDUSTRIES[kind];
  if (block) return { ok: false, kind: "industry", ind: kind, cityId: city.id, reason: block };
  const lvl = cityLevels(city)[kind] || 0;
  const value = projectValue(w, g, nid, { industry: { cityId: city.id, kind } }, econ);
  // what GDP alone misses: research, morale and influence
  if (def.research) value.value += def.research * 0.0012 * econ.gdp;
  if (kind === "broadcast") value.value += 0.012 * econ.gdp;
  const cost = def.costB * (1 + 0.15 * lvl) * econ.constructionIndex * (def.urban && cityFocusOn(g, city, "industry") ? 0.8 : 1);
  return { ok: true, kind: "industry", ind: kind, nid, cityId: city.id, cost, seasons: def.seasons, ...value,
    label: `${def.label} at ${city.name}${lvl ? ` (level ${lvl + 1})` : ""}` };
}

/* The few industries worth quoting in each town, so rivals and investors don't weigh hundreds of options. */
function industryCandidates(w, g, n, econ, privateOnly) {
  const out = [];
  for (const kind of INDUSTRY_ORDER) {
    const def = INDUSTRIES[kind];
    if (SITE_KINDS[kind] || (privateOnly && def.state)) continue;
    const towns = econ.regions.filter(r => !industryBlock(w, g, n.id, r.city, kind, econ));
    if (!towns.length) continue;
    towns.sort((a, b) => b.pop - a.pop);
    for (const r of towns.slice(0, def.urban ? 2 : 1)) {
      const q = quoteIndustry(w, g, n.id, r.city, kind, econ);
      if (q.ok) out.push(q);
    }
  }
  return out;
}

/* Businesses invest a share of output wherever it pays best. Finance law and stability set how much. */
function runPrivateInvestment(w, g, n) {
  const econ = computeEconomy(w, g, n.id);
  if (!econ.cities.length) return [];
  const fin = FINANCE_LAWS[n.laws.finance || "balanced"];
  const climate = clamp(n.stability / 60, 0.3, 1.2) * clamp(1.25 - n.laws.tax / 100, 0.6, 1.1) * (hasTech(n, "finance") ? 1.2 : 1) * (enemiesOf(g, n.id).length ? 0.6 : 1) * Math.max(0.2, 1 + modSum(n, "invest"));
  n.capital = (n.capital || 0) + (econ.gdp / 4) * fin.invest * climate * (econ.capitalMult || 1) * profitFactor(n);
  const news = [];
  for (let k = 0; k < 2; k++) {
    const cands = industryCandidates(w, g, n, econ, true).concat(siteCandidates(w, g, n, econ, true)).map(q => ({ q, roi: q.dGdp / q.cost })).filter(x => x.roi > 0.07).sort((a, b) => b.roi - a.roi);
    const best = cands[0];
    if (!best) break;
    if (n.capital < best.q.cost) break;
    n.capital -= best.q.cost;
    orderProject(g, best.q, "private", true);
    n.buildSpend = (n.buildSpend || 0) + best.q.cost;
    news.push(best.q);
  }
  n.capital = Math.min(n.capital, 30);
  return news;
}

/* ---------- Research, skills and the business cycle, each season ---------- */
const AI_RESEARCH = {
  militarist:   ["mech", "combined", "electrify", "assembly", "electronics", "jets", "medicine", "media", "fert", "finance", "computing", "nuclear", "automation"],
  expansionist: ["mech", "fert", "assembly", "electrify", "combined", "medicine", "electronics", "media", "finance", "jets", "computing", "nuclear", "automation"],
  agrarian:     ["mech", "fert", "medicine", "electrify", "assembly", "media", "electronics", "finance", "computing", "combined", "nuclear", "jets", "automation"],
  mercantile:   ["electrify", "finance", "assembly", "mech", "media", "electronics", "computing", "medicine", "fert", "automation", "nuclear", "combined", "jets"],
};
function researchPoints(n, econ) {
  const spend = (econ.gdp / 4) * RESEARCH_LAWS[n.laws.research || "low"].share;
  return (spend * 10 * (0.4 + (n.skill ?? 0.35)) + econ.research) * (econ.researchMult || 1);
}
function advanceResearch(g, n, econ) {
  n.research = n.research || { target: null, progress: 0 };
  const R = n.research;
  if (!R.target || hasTech(n, R.target) || !techAvailable(n, R.target)) {
    const own = (R.queue || []).find(t => techAvailable(n, t));
    R.target = own || (n.isPlayer ? TECH_ORDER : AI_RESEARCH[n.archetype] || TECH_ORDER).find(t => techAvailable(n, t)) || null;
    R.auto = !own;
  }
  R.progress += researchPoints(n, econ);
  if (!R.target || R.progress < TECHS[R.target].cost) return null;
  const done = R.target;
  R.progress -= TECHS[done].cost;
  n.techs = { ...(n.techs || {}), [done]: g.turn };
  n.tech *= 1.015;
  R.target = null;
  if (R.queue) R.queue = R.queue.filter(t => t !== done);
  return done;
}
function updateSkill(n, econ) {
  const target = EDU_LAWS[n.laws.education || "basic"].skill + Math.min(0.1, 0.02 * (econ.levels.university || 0)) + (econ.skillBonus || 0) + (econ.citySkill || 0);
  n.skill = (n.skill ?? 0.35) + (target - (n.skill ?? 0.35)) * 0.04;
}

/* A loose financial system grows faster and sometimes crashes. */
function financialCrisis(g, n, econ, rng) {
  const fin = FINANCE_LAWS[n.laws.finance || "balanced"];
  if (n.crisisUntil > g.turn) return null;
  const debt = Math.max(0, -n.treasury) / Math.max(1, econ.gdp);
  const chance = fin.crisis * (1 + 2 * debt) * (n.stability < 40 ? 1.5 : 1) * (hasTech(n, "finance") ? 0.7 : 1) * (econ.sat.gold < 1 && econ.goods.supply.gold > 0.1 ? 0.6 : 1);
  if (rng() >= chance) return null;
  n.tech *= 0.95;
  n.crisisUntil = g.turn + 3;
  n.capital = 0;
  return `A banking crisis: lenders panicked, investment stopped and output fell 5%.`;
}

/* ---------- Every nation starts with the industry its land and character suggest ---------- */
function seedIndustries(w, g, n) {
  let econ = computeEconomy(w, g, n.id);
  // every nation starts with at least one source of energy: if its land has none, a coal seam is found in its hills or forests
  const fuel = econ.regions.some(r => r.res.coal || r.res.oil || industryCap("power_hydro", r.res, r.pop, false) > 0);
  if (!fuel) {
    const cells = econ.regions.flatMap(r => r.cells).filter(i => !w.dep[i] && (w.terrain[i] === T.HILLS || w.terrain[i] === T.FOREST));
    const spot = cells.sort((a, b) => hash2(a, 3, w.seed) - hash2(b, 3, w.seed))[0] ?? econ.regions[0].cells.find(i => !w.dep[i]);
    if (spot !== undefined) { w.dep[spot] = 2; w.hid[spot] = 0; setDepositSize(w, spot, 2, false); g.depLeft[spot] = w.depTotal[spot]; (g.extraDeposits = g.extraDeposits || []).push([spot, 2]); econ = computeEconomy(w, g, n.id); }
  }
  const add = (city, kind, k = 1) => { city.ind = city.ind || {}; city.ind[kind] = (city.ind[kind] || 0) + k; };
  const regions = econ.regions.slice().sort((a, b) => b.pop - a.pop);
  const cap = regions.find(r => r.city.capital) || regions[0];
  if (!cap) return;
  const has = { metals: 0, coal: 0, oil: 0, gold: 0 };
  for (const r of regions) {
    for (const k of ["metals", "coal", "oil", "gold"]) has[k] += r.res[k];
  }
  seedSites(w, g, n);
  seedFuel(w, g, n);
  const fuelSite = g.sites.some(s => s.kind === "coalmine" && g.owner[s.cell] === n.id) ? "power_coal" : g.sites.some(s => s.kind === "oilfield" && g.owner[s.cell] === n.id) ? "power_gas" : null;
  add(cap.city, fuelSite || (industryCap("power_hydro", cap.res, cap.pop, false) > 0 ? "power_hydro" : has.coal ? "power_coal" : has.oil ? "power_gas" : "power_coal"));
  add(cap.city, "light");
  add(cap.city, "foodproc");
  add(cap.city, "university");
  if ((has.metals && has.coal) || n.archetype === "militarist" || n.archetype === "expansionist") add(cap.city, "heavy");
  if (n.archetype === "militarist" && has.oil) add(cap.city, "chemical");
  if (regions[1]) add(regions[1].city, "light");
  if (regions[1] && n.archetype !== "agrarian") add(regions[1].city, fuelSite === "power_gas" ? "power_gas" : "power_coal");
}

