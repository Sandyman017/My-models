/* =====================================================================
   10. Rival projects: what each nation could build, and why
   ===================================================================== */
function directionWord(from, to) {
  const ang = Math.atan2(cellY(to) - cellY(from), cellX(to) - cellX(from)) * 180 / Math.PI;
  const dirs = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
  return dirs[Math.round(((ang + 360) % 360) / 45) % 8];
}

function distanceToNation(g, nid, cell) {
  let best = Infinity;
  for (let i = 0; i < N_CELLS; i++) if (g.owner[i] === nid) best = Math.min(best, dist(i, cell));
  return best;
}

function explainProject(g, q, n) {
  const gain = q.dGdp > 0.05 ? ` Expects output +${fmtMoney(q.dGdp)} a year.` : "";
  if (q.kind === "work") return `Building the ${WORKS[q.work].label}, like ${WORKS[q.work].inspired}: ${WORKS[q.work].gives.charAt(0).toLowerCase()}${WORKS[q.work].gives.slice(1)}. ${fmtMoney(q.installment)} a season for ${q.seasons} seasons.`;
  if (q.kind === "road" && q.access) return `Building a road ${q.label.replace(/^Road /, "")} so it can be worked.${q.dGdp > 0.05 ? ` A site there could add ${fmtMoney(q.dGdp)} a year.` : ""}`;
  if (q.kind === "site") return `${q.siteId ? "Expanding" : "Opening"} ${q.name}: ${INDUSTRIES[q.siteKind].does}${gain}`;
  if (q.kind === "smelter") return `Building a smelter at ${(g.sites.find(x => x.id === q.siteId) || { name: "the mine" }).name}, so the ore leaves as metal.${gain}`;
  if (q.kind === "road") {
    if (q.trade !== undefined) return `Building a trade road to the ${nameOf(g, q.trade)} so goods can flow between us.${gain}`;
    if (q.famineRelief > 0.05) return `Linking ${q.from.name} and ${q.to.name} to move food to hungry towns.${gain}`;
    return `Linking ${q.from.name} and ${q.to.name} to join their markets and share timber and ore.${gain}`;
  }
  if (q.kind === "town") {
    const toPlayer = distanceToNation(g, PLAYER, q.site);
    const near = toPlayer <= 6 ? ` It lies only ${Math.round(toPlayer)} cells from your border.` : "";
    const capital = g.cities.find(c => c.owner === n.id && c.capital);
    const where = capital ? ` ${directionWord(capital.cell, q.site)} of ${capital.name}` : "";
    const why = n.archetype === "expansionist" ? "Land is what this nation values most." : `It claims farmland for ${q.claimFood.toFixed(1)}M more people.`;
    return `Settling ${q.name}${where}${q.overseas ? ", across the sea" : ""}. ${why}${near}`;
  }
  if (q.kind === "port") return `Building a harbor at ${g.cities.find(c => c.id === q.cityId).name} to open sea trade.${gain}`;
  if (q.kind === "portup") return `Enlarging the harbor at ${g.cities.find(c => c.id === q.cityId).name} into a ${PORT_LEVELS[q.level].label.toLowerCase()}: ${q.level === 2 ? "slipways for freighters and destroyers" : "a home for the battle fleet, with yards that build cruisers"}.`;
  if (q.kind === "wharf") return `Building a river wharf at ${g.cities.find(c => c.id === q.cityId).name}: barges join the towns on the same river.${gain}`;
  if (q.kind === "ships") return `${q.label}.`;
  if (q.kind === "irrigation") return `Irrigating the fields around ${g.cities.find(c => c.id === q.cityId).name} so it can feed more people.`;
  if (q.kind === "industry") return `${INDUSTRIES[q.ind].does}${gain}`;
  if (q.kind === "focus") { const c = g.cities.find(x => x.id === q.cityId); return `Making ${c ? c.name : "a town"} ${aAn(FOCI[q.focus].label.toLowerCase())}: ${FOCI[q.focus].does.charAt(0).toLowerCase()}${FOCI[q.focus].does.slice(1)}`; }
  if (q.kind === "capital") return q.label + ".";
  return "";
}

function aiCandidates(w, g, n, econ) {
  const out = [];
  const nid = n.id;
  const cities = econ.cities;
  for (let a = 0; a < cities.length; a++) for (let b = a + 1; b < cities.length; b++) {
    if (econ.regions[a].net === econ.regions[b].net) continue;
    if (dist(cities[a].cell, cities[b].cell) > BUILD.roadMaxReach) continue;
    if (g.projects.some(p => p.kind === "road" && p.nid === nid)) continue;
    const q = quoteRoad(w, g, nid, cities[a], cities[b]);
    if (q.ok) out.push(q);
  }
  const sites = [];
  const wild = new Set([-1]), own = new Set([nid]);
  // a city-state stays a city-state: it may found a couple of satellite towns, no more
  const townRoom = !n.minor || cities.length + g.projects.filter(p => p.nid === nid && p.kind === "town").length < 3;
  const needSea = !n.minor && !g.cities.some(c => c.owner === nid && portSeaCell(w, c.cell) >= 0);
  for (let i = 0; townRoom && i < N_CELLS; i++) {
    if (!isLand(w, i)) continue;
    if (g.owner[i] !== nid && g.owner[i] !== -1) continue;
    if (g.owner[i] === -1 && !nearOwnLand(g, nid, i, BUILD.townReach)) continue;
    if (g.cities.some(c => dist(c.cell, i) < BUILD.townMinSpacing + 1)) continue;
    sites.push({ i, food: foodWithin(w, g, i, BUILD.townClaimRadius, wild) + 0.3 * foodWithin(w, g, i, 2, own) + (needSea ? (portSeaCell(w, i) >= 0 ? 1.5 : 1.2 * Math.max(0, 1 - seaGeo(w).coastDist[i] / 6)) : 0) });
  }
  sites.sort((a, b) => b.food - a.food).slice(0, 6).forEach(s => {
    const q = quoteTown(w, g, nid, s.i);
    if (!q.ok) return;
    // a first town on the open sea is worth more than its fields: it can have a harbor
    if (needSea && portSeaCell(w, s.i) >= 0) q.value += econ.gdp * 0.04 * ({ mercantile: 1, expansionist: 0.8, militarist: 0.6, agrarian: 0.4 }[n.archetype] || 0.5);
    if (q.dGdp < 0) q.value -= q.dGdp * 0.6;   // most of the work lost while it is cut off comes back once a road joins it
    out.push(q);
  });
  for (const c of cities) {
    const qp = quotePort(w, g, nid, c);
    if (qp.ok) out.push(qp);
    const qi = quoteIrrigation(w, g, nid, c);
    if (qi.ok) out.push(qi);
  }
  out.push(...industryCandidates(w, g, n, econ, false));
  out.push(...siteCandidates(w, g, n, econ, false));
  out.push(...workCandidates(w, g, n, econ));
  out.push(...aiSeaCandidates(w, g, n, econ));
  out.push(...focusCandidates(w, g, n, econ));
  if (!g.projects.some(p => p.kind === "road" && p.nid === nid)) {
    for (const t of g.treaties || []) {
      if (t.type !== "trade" || (t.a !== nid && t.b !== nid)) continue;
      const other = t.a === nid ? t.b : t.a;
      if (econ.networks.some(net => net.partners.includes(other))) continue;
      const q = bestTradeRoad(w, g, nid, other);
      if (q) out.push(q);
    }
  }
  return out;
}


function stepLaw(order, current, dir) { return order[clamp(order.indexOf(current) + dir, 0, order.length - 1)]; }
function stepTax(v, dir) { return TAX_LAWS[clamp(TAX_LAWS.findIndex(t => t.v === v) + dir, 0, TAX_LAWS.length - 1)].v; }


