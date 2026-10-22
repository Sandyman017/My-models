/* =====================================================================
   12b. What the ministers know: each ministry's file, the cabinet briefing, and the files they can look up
   A real minister knows his ministry inside out and the state of the country in outline, and he can ask a
   colleague's ministry for its file. Everything here is read from the game itself, the same numbers the panels
   show, so a minister can never say something the game does not know. Used by Claude (as the minister's briefing
   and as lookups) and by the built-in replies when Claude is not available.
   ===================================================================== */
const BRIEF_ORD = ["", "1st", "2nd", "3rd"];
function ordinal(k) { return BRIEF_ORD[k] || `${k}th`; }
function bMoney(v) { return Math.abs(v) < 0.05 && v !== 0 ? `$${Math.round(Math.abs(v) * 1000)}M` : fmtMoney(v); }
function bSigned(v) { return Math.abs(v) < 0.0005 ? "±$0" : `${v > 0 ? "+" : "−"}${bMoney(Math.abs(v))}`; }   // a change of money, small ones in $M
function bPeople(m) { return m >= 1 ? `${m.toFixed(1)}M` : m >= 0.001 ? `${Math.round(m * 1000)}k` : `${Math.round(m * 1e6)}`; }   // m in millions
function bCount(v) { return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${Math.round(v / 1000)}k` : fmtCount(v); }
function goodWorth(g, k, q) { return q * GOODS[k].price * priceOf(g, k); }   // a year's quantity of a good, in $B
function bJoin(a) { return a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`; }

/* ---------- The world in numbers: every nation, the same figures the Statistics window uses ---------- */
function worldTable(w, g) {
  return withEconMemo(g, () => liveNations(g).map(z => {
    const e = computeEconomy(w, g, z.id);
    let divs = 0, men = 0, tanks = 0, planes = 0;
    for (const d of g.divisions) if (d.owner === z.id) { divs++; men += d.men; tanks += d.tanks || 0; }
    for (const a of g.airwings) if (a.owner === z.id) planes += a.planes;
    const nc = g.sea ? navyCounts(g, z.id) : { destroyer: 0, cruiser: 0, freighter: 0 };
    const h = z.history && z.history.length > 4 ? z.history[z.history.length - 5] : null;
    return { id: z.id, name: z.name, minor: !!z.minor, gdp: e.gdp, growth: h && h.gdp > 0 ? e.gdp / h.gdp - 1 : null, pop: e.pop, area: e.area, towns: e.cities.length,
      divs, men, tanks: Math.round(tanks), planes: Math.round(planes), depotTanks: Math.round((z.stock && z.stock.tanks) || 0), ships: nc.destroyer + nc.cruiser, freighters: nc.freighter,
      power: armyPower(g, z.id), stability: z.stability, treasury: z.treasury, techs: Object.keys(z.techs || {}).length, exp: e.exportValue || 0, imp: e.importBill || 0,
      prestige: z.prestige || 0, unemp: e.unemployment || 0, food: e.pop > 0.01 ? e.food / e.pop : 0, econ: e };
  }));
}
function rankIn(table, key, id, majorsOnly) {
  const rows = table.filter(r => !majorsOnly || !r.minor || r.id === id).slice().sort((a, b) => b[key] - a[key]);
  return { k: rows.findIndex(r => r.id === id) + 1, of: rows.length };
}
function rankText(table, key, id) {
  const me = table.find(r => r.id === id), v = me ? me[key] : 0;
  const above = table.filter(r => r[key] > v + 1e-9).length, same = table.filter(r => Math.abs(r[key] - v) <= 1e-9).length;
  return same > 1 ? `${ordinal(above + 1)} of ${table.length}, tied with ${same - 1} other${same > 2 ? "s" : ""}` : `${ordinal(above + 1)} of ${table.length}`;
}
function natLabel(g, z) { return `the ${z.name}${z.minor ? " (a small state)" : ""}`; }
function ratioText(r) { return r >= 0.95 && r <= 1.05 ? "about equal to ours" : r > 1 ? `${r.toFixed(1)} times ours` : `${Math.round(r * 100)}% of ours`; }

/* ---------- A good: made, needed, bought and sold (and from whom, by this season's contracts) ---------- */
function goodLine(g, econ, k, nid = PLAYER) {
  const G = econ.goods, d = G.demand[k] || 0, s = G.supply[k] || 0, im = G.imports[k] || 0, ex = G.exports[k] || 0, sat = econ.sat[k] ?? 1;
  const T = econ.trade || {};
  if (d < 0.02 && s < 0.02) return `${GOODS[k].label}: we neither make nor use any.`;
  const parts = [`we make ${bMoney(goodWorth(g, k, s))} a year and need ${bMoney(goodWorth(g, k, d))}`];
  if (im > 0.01) { const from = tradeShareText(g, T.importsFrom && T.importsFrom[k], "from", im); parts.push(`we import ${bMoney(goodWorth(g, k, im))} (${pct(im / Math.max(0.01, d))} of our need)${from ? `: from ${from}` : ""}`); }
  if (ex > 0.01) { const to = tradeShareText(g, T.exportsTo && T.exportsTo[k], "to", ex); parts.push(`we export ${bMoney(goodWorth(g, k, ex))}${to ? `: to ${to}` : ""}`); }
  if (im <= 0.01 && ex <= 0.01 && !GOODS[k].local) parts.push("no trade abroad");
  // a contract an embargo, a war or a lost harbor has cut since the merchants signed it
  for (const x of ((T.cut && T.cut[k]) || []).slice(0, 2)) {
    parts.push(x.from !== undefined
      ? `CUT OFF: ${bMoney(goodWorth(g, k, x.q))} a year we bought from ${whoName(g, x.from)} cannot come (${tradeBlockedText(g, x.code, x.from, nid, k)})`
      : `CUT OFF: ${bMoney(goodWorth(g, k, x.q))} a year we sold to ${whoName(g, x.to)} cannot go (${tradeBlockedText(g, x.code, nid, x.to, k)})`);
  }
  if (sat < 0.95) parts.push(`SHORTAGE: only ${pct(sat)} of the need is met${GOODS[k].local ? "" : shortWhy(g, econ, k, nid)}`);
  else if (G.util[k] < 0.9 && s > 0.05) parts.push(`${pct(1 - G.util[k])} of what we make finds no buyer`);
  const p = GOODS[k].local ? 1 : priceOf(g, k);
  if (Math.abs(p - 1) >= 0.08) parts.push(`world price ${p > 1 ? "high" : "low"} (${pct(p)} of normal)`);
  return `${GOODS[k].label}: ${parts.join("; ")}.`;
}
/* Why we could not buy the rest of a good we are short of. */
function shortWhy(g, econ, k, nid) {
  if (!g.trade || !g.trade.v) return "";
  if (!tradeOpen(econ)) return " (we cannot trade: no nation can reach us, and the world market is closed to us)";
  const unmet = (g.trade.unmet[k] || [])[nid] || 0;
  if (unmet <= 0.005) return "";
  return (econ.trade && econ.trade.worldImportCapRaw > 0) ? " (no nation we can reach had more to sell, and our harbors bring only so much from the world market)" : " (no nation we can reach had more to sell, and the world market is closed to us)";
}
/* How this nation trades: its routes, the world market, what trade costs and earns, agreements, embargoes, sanctions. */
function tradeAccessLine(g, n, econ) {
  const nid = n.id;
  if (!g.trade || !g.trade.v) {
    // a game with no merchants' book yet (the founding preview): the old rule, world market only
    if (!(econ.access > 0)) return "We have no harbor and no trade partner, so we can neither import nor export anything. A port or a trade agreement would open trade.";
    const partners0 = (g.treaties || []).filter(t => t.type === "trade" && (t.a === nid || t.b === nid)).map(t => nameOf(g, t.a === nid ? t.b : t.a));
    return `We can buy abroad up to ${pct(Math.min(1, econ.access * TRADE_LAWS[n.laws.trade || "balanced"].imports))} of what we lack (at a premium). Imports cost ${bMoney(econ.importBill)} a year, exports earn ${bMoney(econ.exportValue)}. ${econ.seaAccess ? "We trade by sea through our harbors. " : ""}${partners0.length ? `Trade agreements with ${bJoin(partners0.map(x => `the ${x}`))}.` : "No trade agreements."}`;
  }
  const T = econ.trade || {}, out = [];
  const byMode = { land: [], over: [], sea: [] };
  for (const o of Object.keys(T.links || {}).map(Number).sort((a, b) => a - b)) {
    const z = g.nations[o], L = T.links[o];
    if (!z || !z.alive || !byMode[L.m]) continue;
    byMode[L.m].push(L.m === "sea" ? `the ${z.name} (${Math.round(L.d).toLocaleString("en-US")} km)` : `the ${z.name}`);
  }
  const routes = [];
  if (byMode.land.length) routes.push(`across our border to ${bJoin(byMode.land)}`);
  if (byMode.over.length) routes.push(`by caravan across wild land to ${bJoin(byMode.over)}`);
  if (byMode.sea.length) routes.push(`by sea to ${bJoin(byMode.sea)}`);
  out.push(routes.length ? `Our merchants reach other nations ${routes.join("; ")}.` : "No other nation can reach us: no shared border, no caravan route across wild land, and no sea lane between our harbors and theirs.");
  const wCap = T.worldImportCapRaw || 0;
  if (wCap > 0) {
    const via = T.mainPort !== null && T.mainPort !== undefined ? g.cities.find(c => c.id === T.mainPort) : null;
    out.push(`The world market beyond the map is open to us${via ? ` through our harbor at ${via.name}` : T.transit !== null && T.transit !== undefined ? ` through the ${nameOf(g, T.transit)}'s harbors` : ""}: it can sell us up to ${wCap >= 1 ? "all" : pct(wCap)} of what we need of a good, at the middlemen's price (${pct(TRADE.worldPremium)} above the world price).`);
  } else out.push("The world market beyond the map is closed to us: we need a harbor on the ocean, or a trade partner who has one.");
  out.push(`Imports cost ${bMoney(econ.importBill)} a year at world prices${(T.importCost || 0) > econ.importBill + 0.005 ? ` (${bMoney(T.importCost)} with transport and the middlemen's cut)` : ""}; exports earn ${bMoney(econ.exportValue)} a year.${(econ.tariffs || 0) > 0.005 ? ` Import tax brings the state ${bMoney(econ.tariffs)} a year (${pct(lawTariff(g, nid))} on the ${bMoney(econ.tariffBase || 0)} of imports that pay it).` : ""}`);
  const partners = (g.treaties || []).filter(t => t.type === "trade" && (t.a === nid || t.b === nid)).map(t => `the ${nameOf(g, t.a === nid ? t.b : t.a)}`);
  out.push(partners.length ? `Trade agreements (no import tax between us): ${bJoin(partners)}.` : "No trade agreements.");
  const ours = embargoesBy(g, nid), theirs = embargoesOn(g, nid);
  if (ours.length) out.push(`Our embargoes: ${ours.map(e => `we ${embargoVerb(e)} the ${nameOf(g, e.on)} (since ${seasonLabel(e.since)})`).join("; ")}.`);
  if (theirs.length) out.push(`Embargoes on us: ${theirs.map(e => `the ${nameOf(g, e.by)} ${embargoVerb(e)} us (since ${seasonLabel(e.since)}${EMBARGO_WHY[e.why] ? `, ${EMBARGO_WHY[e.why]}` : ""})`).join("; ")}.`);
  for (const s of ((g.assembly && g.assembly.sanctions) || []).filter(x => x.until > g.turn)) {
    if (s.target === nid) out.push(`World Assembly sanctions on us until ${seasonLabel(s.until)}: ${bJoin(s.by.filter(b => g.nations[b] && g.nations[b].alive).map(b => `the ${nameOf(g, b)}`))} do not trade with us.`);
    else if (s.by.includes(nid)) out.push(`We keep the World Assembly's sanctions on the ${nameOf(g, s.target)} until ${seasonLabel(s.until)}: no trade with them.`);
  }
  const pref = (g.trade.prefer || []).filter(p => p.by === nid);
  if (pref.length) out.push(`Preferred sellers (our merchants count their price ${pct(TRADE.prefer)} lower): ${pref.map(p => `${goodWord(p.k)} from the ${nameOf(g, p.from)}`).join(", ")}.`);
  return out.join(" ");
}

/* ---------- Trade between nations, in the ministers' words: read from the merchants' book (10s) ---------- */
// can this nation trade at all: a route to another nation, or the world market (a game without a book: the old rule)
function tradeOpen(econ) { return !!(econ && ((econ.trade && econ.trade.open) || econ.access > 0)); }
function whoName(g, id) { return id < 0 ? "the world market" : `the ${nameOf(g, id)}`; }
function goodWord(k) { return GOODS[k].label.toLowerCase(); }
// why an embargo was declared, as its victim hears it
const EMBARGO_WHY = { retaliation: "in answer to ours", pressure: "to press its claim on us", hostility: "out of old hatred", war_goods: "because we sell war goods to its enemy", threat: "as it threatened" };
// what each strategic good does for an army (the engine's arms supply needs metals, machinery and chemicals; fuel is oil)
const STRATEGIC_USE = { metals: "their arms factories need metal", machinery: "their arms factories need machinery", chemicals: "their arms factories need chemicals", oil: "their tanks, planes and ships run on it", electronics: "modern weapons need it" };
function tradeRouteWord(L) {
  if (!L) return "no route between us (no shared border, caravan route or sea lane)";
  if (L.m === "land") return "by road across the border";
  if (L.m === "over") return `by caravan across wild land (${Math.round(L.d)} km)`;
  if (L.m === "sea") return `by sea (${Math.round(L.d).toLocaleString("en-US")} km)`;
  return "through the world market";
}
/* "the X 70%, the world market 30%": who a good comes from (or goes to), as shares of the whole. */
function tradeShareText(g, list, key, total) {
  const by = new Map();
  for (const x of list || []) by.set(x[key], (by.get(x[key]) || 0) + x.q);
  const rows = [...by.entries()].filter(([, q]) => q > 1e-4).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  if (!rows.length) return "";
  const tot = total > 0 ? total : rows.reduce((s, r) => s + r[1], 0);
  const shown = rows.slice(0, 3).map(([id, q]) => `${whoName(g, id)} ${pct(Math.min(1, q / tot))}`);
  const rest = rows.slice(3).reduce((s, r) => s + r[1], 0);
  if (rest > 1e-4) shown.push(`others ${pct(rest / tot)}`);
  return shown.join(", ");
}
// an amount of a good a year, in words: grain as the people it feeds, the rest as money
function tradeQtyText(g, k, q) { return k === "food" ? `grain for ${bPeople(q)} people` : `${goodWord(k)} ${bMoney(goodWorth(g, k, q))}`; }
/* What stops trade between two nations now, in words (war, sanctions, embargoes either way). */
function pairBlockText(g, a, b) {
  if (atWar(g, a, b)) return "at war: no trade passes between us";
  const A = g.assembly;
  if (A && A.sanctions && A.sanctions.some(x => x.until > g.turn && ((x.target === a && x.by.includes(b)) || (x.target === b && x.by.includes(a))))) return "World Assembly sanctions";
  const E = embargoesBy(g, a, b).map(e => `we ${embargoVerb(e)} them`).concat(embargoesBy(g, b, a).map(e => `they ${embargoVerb(e)} us`));
  return E.join("; ");
}
/* The grain we could buy abroad now, cheapest first: each nation we can reach with grain to spare, then the world
   market if it is open to us. Prices at our border, $B for a year's food for a million people. */
function grainOffers(w, g, nid) {
  if (!g.trade || !g.trade.v || !g.nations[nid] || !g.nations[nid].alive) return [];
  const out = [];
  for (const s of tradeOffers(w, g, nid, "food").sellers) {
    if (s.whyNot || !s.price || (s.nid >= 0 && atWar(g, nid, s.nid))) continue;
    const spare = s.nid < 0 ? Infinity : ((g.trade.unsold.food || [])[s.nid] || 0);
    if (spare <= 0.005) continue;
    out.push({ nid: s.nid, p: s.price.p, price: s.price, spare, link: s.link, d: s.d });
  }
  return out.sort((a, b) => a.p - b.p || a.nid - b.nid);
}
/* What a nation has to spare (nobody bought it, or it went to the world market) of the goods we now buy at the
   middlemen's price from the world market, or go without: the value a year, the goods, and whether a route joins
   us. Used to choose which nations deserve a trade agreement. */
function sellsWhatWeLack(g, nid, zid) {
  const T = g.trade;
  if (!T || !T.v) return { v: 0, goods: [] };
  const ix = tradeIndex(g);
  let v = 0;
  const goods = [];
  for (const k of TRADE_GOODS) {
    const fromWorld = ((ix.into[nid] || {})[k] || []).filter(f => f.s < 0).reduce((s, f) => s + f.q, 0);
    const lack = ((T.unmet[k] || [])[nid] || 0) + fromWorld;
    if (lack <= 1e-3) continue;
    const toWorld = ((ix.outOf[zid] || {})[k] || []).filter(f => f.b < 0).reduce((s, f) => s + f.q, 0);
    const spare = ((T.unsold[k] || [])[zid] || 0) + toWorld;
    const q = Math.min(lack, spare);
    if (q <= 1e-3) continue;
    v += goodWorth(g, k, q);
    goods.push(k);
  }
  return { v, goods, linked: !!tradeLink(g, nid, zid) };
}
/* "They have oil and metals to spare, which ..." for an envoy order or an ambition: honest about the route. */
function lackText(g, L) {
  const goods = bJoin(L.goods.slice(0, 3).map(goodWord));
  return L.linked ? `They have ${goods} to spare, which we now buy at the middlemen's price or go without (about ${bMoney(L.v)} a year)` : `They have ${goods} to spare (about ${bMoney(L.v)} a year that we lack), but no route joins us yet: a trade agreement, then a trade road or a harbor, could open one`;
}

/* The economy file: who we buy from and sell to, a year. */
function tradePartnerLines(w, g, nid, econ) {
  if (!g.trade || !g.trade.v) return [];
  const TO = tradeOf(g, nid), out = [];
  const need = k => ((g.trade.need[k] || [])[nid]) || 0;
  const goodsOf = o => Object.entries(o).filter(([, q]) => q > 1e-4).map(([k, q]) => ({ k, q, v: goodWorth(g, k, q) })).sort((a, b) => b.v - a.v);
  const natBuy = TO.partners.reduce((s, p) => s + p.buyV, 0), allBuy = natBuy + TO.world.buyV;
  out.push(`In all: exports ${bMoney(econ.exportValue)} a year, imports ${bMoney(econ.importBill)} a year (balance ${fmtSignedMoney(econ.exportValue - econ.importBill)}).${allBuy > 0.005 ? ` Of what we buy, ${pct(natBuy / allBuy)} comes from nations on the map and ${pct(TO.world.buyV / allBuy)} from the world market beyond it.` : ""}`);
  for (const p of TO.partners.slice(0, 8)) {
    const z = g.nations[p.nid];
    if (!z) continue;
    const sells = goodsOf(p.sell).slice(0, 4).map(x => tradeQtyText(g, x.k, x.q));
    const buys = goodsOf(p.buy).slice(0, 4).map(x => `${tradeQtyText(g, x.k, x.q)}${need(x.k) > 0 ? ` (${pct(Math.min(1, x.q / need(x.k)))} of our need)` : ""}`);
    const parts = [sells.length ? `we sell them ${bMoney(p.sellV)}: ${sells.join(", ")}` : "we sell them nothing", buys.length ? `we buy ${bMoney(p.buyV)}: ${buys.join(", ")}` : "we buy nothing from them", tradeRouteWord(tradeLink(g, nid, p.nid))];
    if (hasTreaty(g, nid, p.nid, "trade")) parts.push("a trade agreement: no import tax");
    const cut = pairBlockText(g, nid, p.nid);
    if (cut) parts.push(`CUT: ${cut}`);
    out.push(`The ${z.name}${z.minor ? " (small state)" : ""}: ${parts.join("; ")}.`);
  }
  if (TO.partners.length > 8) out.push(`We also trade a little with ${TO.partners.length - 8} more nation${TO.partners.length - 8 > 1 ? "s" : ""}.`);
  if (TO.world.open) {
    const wb = [], ws = [];
    for (const k of TRADE_GOODS) {
      const G = TO.goods[k];
      if (!G) continue;
      const qb = G.from.filter(f => f.nid < 0).reduce((s, f) => s + f.q, 0), qs = G.to.filter(f => f.nid < 0).reduce((s, f) => s + f.q, 0);
      if (qb > 1e-4) wb.push(tradeQtyText(g, k, qb));
      if (qs > 1e-4) ws.push(tradeQtyText(g, k, qs));
    }
    out.push(`The world market beyond the map: we buy ${bMoney(TO.world.buyV)}${wb.length ? ` (${wb.slice(0, 5).join(", ")})` : ""} and sell ${bMoney(TO.world.sellV)}${ws.length ? ` (${ws.slice(0, 5).join(", ")})` : ""}. What we buy there carries the middlemen's cut, ${pct(TRADE.worldPremium)} above the world price.`);
  }
  if (!TO.partners.length && !TO.world.open) out.push(tradeOpen(econ) ? "No contracts this season: no nation we can reach wanted what we sell or had what we need." : "We trade with no one: no nation can reach us, and the world market is closed to us.");
  const U = g.trade.unsold, M = g.trade.unmet;
  const unsold = TRADE_GOODS.filter(k => k !== "food" && ((U[k] || [])[nid] || 0) > 1e-3).map(k => ({ k, q: U[k][nid], v: goodWorth(g, k, U[k][nid]) })).filter(x => x.v >= 0.01).sort((a, b) => b.v - a.v);
  if (unsold.length) out.push(`Nobody bought (no buyer we can reach wanted more): ${unsold.slice(0, 4).map(x => tradeQtyText(g, x.k, x.q)).join(", ")} a year.`);
  const unmet = TRADE_GOODS.filter(k => ((M[k] || [])[nid] || 0) > 1e-3).map(k => ({ k, q: M[k][nid], v: goodWorth(g, k, M[k][nid]) })).filter(x => x.v >= 0.01).sort((a, b) => b.v - a.v);
  if (unmet.length) out.push(`Nobody could sell us (we wanted more, but no seller we can reach had it): ${unmet.slice(0, 4).map(x => tradeQtyText(g, x.k, x.q)).join(", ")} a year.`);
  return out;
}
/* The economy file: where our trade is at risk, who depends on us, and the war goods we sell. */
function tradeRiskLines(w, g, nid, econ) {
  if (!g.trade || !g.trade.v) return [];
  const out = [];
  const gdp = Math.max(1, econ.gdp);
  const R = tradeRisks(w, g, nid, econ, { cheap: true });
  for (const r of R.slice(0, 6)) out.push(`${r.level >= 2 ? "DANGER: " : r.level >= 1 ? "RISK: " : ""}${r.text} (worth ${bMoney(r.lossPct * gdp)} a year, ${pct1(r.lossPct)} of our output): ${r.why.join("; ")}.`);
  if (!R.length) out.push("We depend on no single nation for much: nothing we buy from one seller is worth half a percent of our output, or a fifth of what we need of a key good.");
  const TO = tradeOf(g, nid);
  for (const p of TO.partners) {
    for (const k of Object.keys(p.sell)) {
      const need = ((g.trade.need[k] || [])[p.nid]) || 0, sh = need > 0 ? Math.min(1, p.sell[k] / need) : 0;
      if (sh < 0.3 || goodWorth(g, k, p.sell[k]) < 0.01) continue;
      out.push(`The ${nameOf(g, p.nid)} gets ${pct(sh)} of its ${goodWord(k)} from us (${bMoney(goodWorth(g, k, p.sell[k]))} a year)${STRATEGIC_USE[k] ? `: ${STRATEGIC_USE[k]}` : k === "food" ? ": it feeds their people" : ""}.`);
    }
  }
  const T = econ.trade || {};
  for (const k of TRADE_GOODS) {
    const list = (T.exportsTo && T.exportsTo[k]) || [], ex = list.reduce((s, x) => s + x.q, 0);
    if (ex <= 1e-4) continue;
    const by = new Map();
    for (const x of list) if (x.to >= 0) by.set(x.to, (by.get(x.to) || 0) + x.q);
    for (const [to, q] of by) if (q / ex >= 0.5 && goodWorth(g, k, q) >= 0.005 * gdp) out.push(`Our ${goodWord(k)} sales depend on the ${nameOf(g, to)}: they buy ${pct(q / ex)} of what we sell abroad (${bMoney(goodWorth(g, k, q))} a year).`);
  }
  return out;
}
/* The agriculture file: grain bought and sold abroad, famine relief, food aid, grain embargoes, hunger abroad. */
function foodTradeLines(w, g, nid, econ, table) {
  if (!g.trade || !g.trade.v) return [];
  const T = econ.trade || {}, out = [];
  const inn = (T.importsFrom && T.importsFrom.food) || [], outF = (T.exportsTo && T.exportsTo.food) || [];
  const qi = inn.reduce((s, x) => s + x.q, 0), qo = outF.reduce((s, x) => s + x.q, 0);
  const reliefIn = inn.filter(x => x.r === "relief").reduce((s, x) => s + x.q, 0), reliefOut = outF.filter(x => x.r === "relief").reduce((s, x) => s + x.q, 0);
  if (qi > 1e-3) out.push(`Grain bought abroad: food for ${bPeople(qi)} people a year (${pct(qi / Math.max(0.01, econ.pop))} of our people), from ${tradeShareText(g, inn, "from", qi)}${reliefIn > 1e-3 ? `; ${bPeople(reliefIn)} of it is famine relief while our harvest is short` : ""}. It feeds hungry towns before the national reserve is opened.`);
  if (qo > 1e-3) out.push(`Grain sold abroad: food for ${bPeople(qo)} people a year, to ${tradeShareText(g, outF, "to", qo)}${reliefOut > 1e-3 ? `; ${bPeople(reliefOut)} of it feeds the hungry there` : ""}.`);
  const unmet = (g.trade.unmet.food || [])[nid] || 0;
  if (unmet > 0.005) out.push(`Nobody could sell us grain for ${bPeople(unmet)} more people.`);
  const s = grainOffers(w, g, nid)[0];
  if (s) out.push(`The cheapest grain we can buy now: from ${whoName(g, s.nid)}, ${bMoney(s.p)} at our border for a year's food for a million people (${s.price.why.filter(x => x.value > 0).map(x => `${x.label.toLowerCase()} ${bMoney(x.value)}`).join(", ")}).`);
  else out.push(tradeOpen(econ) ? "No nation we can reach has grain to spare, and the world market is closed to us." : "We cannot buy grain abroad: no nation can reach us, and the world market is closed to us.");
  for (const a of (g.trade.aid || []).filter(x => (x.from === nid || x.to === nid) && g.turn - x.turn <= 8).slice(-3)) {
    out.push(a.from === nid ? `Food aid: we sent the ${nameOf(g, a.to)} grain from our reserve in ${seasonLabel(a.turn)} (a month's food for ${bPeople(a.q * 12)} people).` : `Food aid: the ${nameOf(g, a.from)} sent us grain in ${seasonLabel(a.turn)} (a month's food for ${bPeople(a.q * 12)} people).`);
  }
  for (const e of (g.trade.embargoes || []).filter(x => (x.on === nid || x.by === nid) && (x.k === "food" || (x.k === "all" && x.food)))) {
    out.push(e.on === nid ? `GRAIN EMBARGO: the ${nameOf(g, e.by)} ${embargoVerb(e)} us (since ${seasonLabel(e.since)}).` : `Our grain embargo: we ${embargoVerb(e)} the ${nameOf(g, e.on)} (since ${seasonLabel(e.since)}).`);
  }
  const hungry = (table || []).filter(r => r.id !== nid && r.econ && r.econ.famineShare > 0.02);
  if (hungry.length) out.push(`Hunger abroad: ${hungry.map(r => `the ${r.name} (${pct(r.econ.famineShare)} of its people)`).join(", ")}. We can send grain from our reserve as food aid (an order of this ministry).`);
  return out;
}
/* One line for the cabinet briefing. */
function tradeBriefLine(w, g, n, econ) {
  if (!g.trade || !g.trade.v) return "";
  const nid = n.id;
  if (!tradeOpen(econ)) return "Trade: we cannot trade with anyone yet: no nation can reach us, and the world market is closed to us.";
  const TO = tradeOf(g, nid);
  const top = TO.partners.slice(0, 3).map(p => `the ${nameOf(g, p.nid)} (${[p.sellV >= 0.0005 ? `we sell ${bMoney(p.sellV)}` : "", p.buyV >= 0.0005 ? `we buy ${bMoney(p.buyV)}` : ""].filter(Boolean).join(", ") || "little trade"})`);
  const risk = tradeRisks(w, g, nid, econ, { cheap: true }).filter(r => r.level >= 1)[0];
  const on = embargoesOn(g, nid), by = embargoesBy(g, nid);
  return `Trade: exports ${bMoney(econ.exportValue)} and imports ${bMoney(econ.importBill)} a year. ${top.length ? `Main partners: ${bJoin(top)}.` : "No partners among the nations of the map."} The world market is ${econ.trade && econ.trade.worldImportCapRaw > 0 ? "open" : "closed"} to us.${risk ? ` We depend on the ${nameOf(g, risk.from)} for ${pct(risk.share)} of our ${goodWord(risk.k)}.` : ""}${on.length ? ` Embargoes on us: ${on.map(e => `the ${nameOf(g, e.by)} ${embargoVerb(e)} us`).join("; ")}.` : ""}${by.length ? ` Our embargoes: ${by.map(e => `we ${embargoVerb(e)} the ${nameOf(g, e.on)}`).join("; ")}.` : ""}`;
}
/* One line for a nation's file: what we trade with them, both ways, the route and any embargo. Appended last. */
function tradeWithLine(g, nid, zid) {
  if (!g.trade || !g.trade.v) return "";
  const tw = tradeWith(g, nid, zid);   // aSells: what we sell them; bSells: what they sell us
  const items = (o, whose) => Object.entries(o).filter(([, x]) => x.q > 1e-4).sort((a, b) => b[1].v - a[1].v).slice(0, 4)
    .map(([k, x]) => `${tradeQtyText(g, k, x.q)}${x.shareOfNeed > 0.005 ? ` (${pct(Math.min(1, x.shareOfNeed))} of ${whose} need)` : ""}${x.blocked ? " (CUT)" : ""}`);
  const buy = items(tw.bSells, "our"), sell = items(tw.aSells, "their");
  if (!buy.length && !sell.length && !tw.embargoes.length && !tw.promise) return tw.link ? `Trade with us: none this season (route: ${tradeRouteWord(tw.link)}).` : "Trade with us: none, and no route between us (no shared border, caravan route or sea lane).";
  const parts = [buy.length ? `we buy ${buy.join(", ")} from them` : "we buy nothing from them", sell.length ? `they buy ${sell.join(", ")} from us` : "they buy nothing from us", `route: ${tradeRouteWord(tw.link)}`];
  if (hasTreaty(g, nid, zid, "trade")) parts.push("a trade agreement: no import tax");
  for (const e of tw.embargoes) parts.push(e.by === nid ? `EMBARGO: we ${embargoVerb(e)} them (since ${seasonLabel(e.since)})` : `EMBARGO: they ${embargoVerb(e)} us (since ${seasonLabel(e.since)}${EMBARGO_WHY[e.why] ? `, ${EMBARGO_WHY[e.why]}` : ""})`);
  if (tw.promise) parts.push(tw.promise.by === nid ? `we promised not to embargo them again until ${seasonLabel(tw.promise.until)}` : `they promised not to embargo us again until ${seasonLabel(tw.promise.until)}`);
  return `Trade with us (a year): ${parts.join("; ")}.`;
}
/* For the Defence file: war goods a threatening nation gets from us. */
function strategicSalesLine(g, nid, zid) {
  if (!g.trade || !g.trade.v) return "";
  const tw = tradeWith(g, nid, zid);
  const L = Object.entries(tw.aSells).filter(([k, x]) => STRATEGIC_USE[k] && !x.blocked && x.shareOfNeed >= 0.3).sort((a, b) => b[1].shareOfNeed - a[1].shareOfNeed)
    .map(([k, x]) => `${pct(Math.min(1, x.shareOfNeed))} of their ${goodWord(k)} (${STRATEGIC_USE[k]})`);
  return L.length ? `The ${nameOf(g, zid)} buys from us ${bJoin(L)}. Stopping it would weaken their army, and anger them.` : "";
}

/* ---------- A nation's file, as our foreign ministry and military intelligence know it ---------- */
function nationFile(w, g, nid, zid, table, depth = 2) {
  const z = g.nations[zid];
  if (!z || !z.alive) return [`There is no living nation by that name.`];
  table = table || worldTable(w, g);
  const row = table.find(r => r.id === zid), me = table.find(r => r.id === nid);
  const A = ARCHETYPES[z.archetype];
  const L = [];
  const lead = z.leader ? `${leaderName(z)}, age ${Math.floor(z.leader.age)}${z.leader.traits && z.leader.traits.length ? `, ${z.leader.traits.map(t => LEADER_TRAITS[t] ? `${LEADER_TRAITS[t].label.toLowerCase()} (${LEADER_TRAITS[t].note})` : t).join(", ")}` : ""}` : "no known leader";
  L.push(`${z.name}${z.minor ? " - a small state" : ""}. Character: ${A ? `${A.label.toLowerCase()} (${A.blurb.charAt(0).toLowerCase()}${A.blurb.slice(1)})` : z.archetype}. Led by ${lead}.`);
  L.push(`Size: ${row.towns} town${row.towns === 1 ? "" : "s"}, ${bPeople(row.pop)} people, ${fmtArea(row.area)}. Economy ${bMoney(row.gdp)} a year (${rankText(table, "gdp", zid)} in the world${row.growth !== null ? `, ${row.growth >= 0 ? "+" : ""}${(row.growth * 100).toFixed(1)}% in a year` : ""}). Stability ${Math.round(z.stability)}. Treasury ${z.treasury >= 0 ? bMoney(z.treasury) : `in debt ${bMoney(-z.treasury)}`}.`);
  L.push(`Armed forces: ${row.divs} divisions, ${bCount(row.men)} soldiers, ${row.tanks} tanks in the field${row.depotTanks ? ` and ${row.depotTanks} in depots` : ""}, ${row.planes} warplanes${g.sea ? `, ${row.ships} warships` : ""}. Army strength ${rankText(table, "power", zid)} in the world; ${zid === nid ? "" : `${ratioText(row.power / Math.max(1, me.power))}.`}`);
  L.push(groupsFileLine(g, z));
  if (zid === nid) return L;
  const op = opinionDetail(g, zid, nid);
  const reasons = op.items.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, depth >= 2 ? 4 : 2).map(i => /^Their foreign minister/.test(i.label) ? `our foreign minister's work ${signed(i.value)}` : `"${i.label}" ${signed(i.value)}`);
  L.push(`Their opinion of us: ${signed(op.value)}${reasons.length ? ` (their reasons, as they see it: ${reasons.join("; ")})` : ""}.`);
  const tr = treatiesBetween(g, nid, zid).map(t => t.type === "tribute" ? (t.a === nid ? "we pay them tribute" : "they pay us tribute") : TREATY_INFO[t.type].label.toLowerCase());
  const war = warBetween(g, nid, zid);
  L.push(war ? `WE ARE AT WAR with them since ${seasonLabel(war.since)}${war.cb ? ` (their cause: ${war.cb})` : ""}. War score ${signed(sideScore(war, nid))} for us.` : `Treaties with us: ${tr.length ? tr.join(", ") : "none"}. ${sharesBorder(g, nid, zid) ? "They border us." : `Not our neighbor (${gap(w, g, nid, zid)} cells between us).`}`);
  const allies = alliesOf(g, zid).filter(a => a !== nid).map(a => nameOf(g, a));
  const enemies = enemiesOf(g, zid).filter(a => a !== nid).map(a => nameOf(g, a));
  if (allies.length || enemies.length) L.push(`${allies.length ? `Allied with ${bJoin(allies.map(x => `the ${x}`))}. ` : ""}${enemies.length ? `At war with ${bJoin(enemies.map(x => `the ${x}`))}.` : ""}`.trim());
  if (!war) {
    const r = warRisk(w, g, zid, nid);
    if (r) {
      const motives = (r.lines || []).filter(l => l.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 3).map(l => l.label.toLowerCase());
      const brakes = (r.lines || []).filter(l => l.pts < 0).sort((a, b) => a.pts - b.pts).slice(0, 2).map(l => l.label.toLowerCase());
      L.push(`Intelligence on war with us: risk ${r.label.toLowerCase()}. ${r.why}${r.chance !== undefined ? ` They put their own chance of winning at about ${pct(r.chance)}.` : ""}${motives.length ? ` What draws them: ${motives.join("; ")}.` : ""}${brakes.length ? ` What holds them back: ${brakes.join("; ")}.` : ""}`);
    }
  }
  if (g.opening && g.opening.by === zid && openingActive(g)) L.push(`They claim our town ${g.opening.town} (stage: ${g.opening.stage}).`);
  const letters = (g.inbox || []).filter(it => it.status === "open" && it.from === zid);
  if (letters.length) L.push(`They wrote to us: ${letters.length} letter${letters.length > 1 ? "s" : ""} waiting for an answer.`);
  if (depth >= 2 && !z.isPlayer) {
    if (z.plan) L.push(`What their government is aiming for, as our embassy hears it: "${String(z.plan).slice(0, 200)}"`);
    const moves = (z.feed || []).slice(0, 3).map(x => `${seasonLabel(x.turn)}: ${x.text}`);
    if (moves.length) L.push(`Their recent moves: ${moves.join(" ")}`);
  }
  if (depth >= 2 && z.cabinet) {
    const mins = MIN_ORDER.filter(k => ministryActive(z, k)).map(k => `${MINISTRIES[k].label} (${z.cabinet.min[k].minister.name}, skill ${z.cabinet.min[k].minister.skill})`);
    if (mins.length) L.push(`Their ministries: ${mins.join(", ")}.`);
  }
  // trade comes last: the built-in replies read the first lines by their place
  const tl = tradeWithLine(g, nid, zid);
  if (tl) L.push(tl);
  return L;
}

/* ---------- One of our towns ---------- */
function townFile(w, g, nid, city, econ) {
  const r = econ.regions.find(x => x.city.id === city.id);
  if (!r) return city.owner === nid && g.occ && g.occ[city.cell] >= 0 ? [`${city.name}${city.capital ? " (the capital)" : ""} is OCCUPIED by the ${nameOf(g, g.occ[city.cell])}. While enemy soldiers hold it, it gives us no taxes, food or soldiers. We must take it back, or win it back in a peace.`] : [`${city.name} is not one of our towns.`];
  const L = [];
  const occ = g.occ && g.occ[city.cell] >= 0 ? g.occ[city.cell] : -1;
  const net = econ.networks[r.net];
  L.push(`${city.name}${city.capital ? " (the capital)" : ""}: ${bPeople(r.pop)} people.${occ >= 0 ? ` OCCUPIED by the ${nameOf(g, occ)}.` : ""} ${city.capital ? "" : net && net.capital ? "Joined to the capital by road." : "NOT joined to the capital by road."}${city.port ? ` A harbor${city.portLvl > 1 ? ` (level ${city.portLvl})` : ""}.` : ""}${city.irrigated ? " Irrigated farmland." : ""}`);
  L.push(`Work: ${bPeople(r.workforce)} workers; ${bPeople(r.farmWorkers || 0)} on farms, ${bPeople(r.indWorkers || 0)} in industry and mines, ${bPeople(r.serviceWorkers || 0)} in services. Unemployment ${pct1(townURate(r))}${r.vacancies > 0.005 ? `; ${bPeople(r.vacancies)} jobs nobody fills` : ""}. Output ${bMoney(r.gdp || 0)} a year.`);
  L.push(`Food: the farmland${r.fish ? " and fishing" : ""} here could feed ${pct(r.foodRatio || 0)} of its people.`);
  const ind = Object.entries(city.ind || {}).filter(([, v]) => v > 0).map(([k, v]) => `${INDUSTRIES[k] ? INDUSTRIES[k].label.toLowerCase() : k}${v > 1 ? ` (level ${v})` : ""}`);
  L.push(ind.length ? `Industry: ${ind.join(", ")}.` : "No industry.");
  L.push(`Standing: ${cityClass(city.imp).label.toLowerCase()}, importance ${city.imp || "?"}${city.rankN ? ` (${cityOrd(city.rankN)} in the nation, ${cityOrd(city.rankW)} in the world)` : ""}${(city.roles || []).filter(k => CITY_ROLES[k]).length ? `; ${(city.roles || []).filter(k => CITY_ROLES[k]).slice(0, 4).map(k => CITY_ROLES[k].label.toLowerCase()).join(", ")}` : ""}. Mood ${Math.round(city.mood ?? 55)}${city.origin !== city.owner ? `; loyalty ${Math.round(city.loyalty ?? 92)} (it was the ${nameOf(g, city.origin)}'s)` : ""}${city.focus && FOCI[city.focus] ? `; program: ${FOCI[city.focus].label.toLowerCase()}` : ""}.`);
  const sites = (econ.sites || []).filter(s => s.townId === city.id).map(s => `${s.site.name} (${s.status})`);
  if (sites.length) L.push(`Mines and fields worked from here: ${sites.join(", ")}.`);
  return L;
}
function siteLine(w, g, s) {
  const est = depositEstimate(w, g, s.site.cell);
  const out = s.site.lastOut || 0;
  const def = SITE_KINDS[s.site.kind];
  let left = "";
  if (!def.renew && w.depTotal[s.site.cell] > 0) {
    const lo = Math.max(0, est.low - (s.site.extracted || 0)), hi = Math.max(0, est.high - (s.site.extracted || 0));
    left = out > 0.01 ? `; about ${Math.round(lo / out)}-${Math.round(hi / out)} years left at this pace` : "";
  }
  return `${s.site.name} (level ${s.site.level}, ${s.status}${s.site.paused ? ", paused" : ""}, ${(def.paces[["careful", "normal", "intensive"].indexOf(s.site.pace)] || s.site.pace).toLowerCase()} pace): ${bMoney(goodWorth(g, def.good, out))} of ${GOODS[def.good].label.toLowerCase()} a year${left}`;
}

/* The neighbor's claim on our town: the danger of the first years. */
function claimActive(g) { return !!(g.opening && openingActive(g) && g.nations[g.opening.by] && g.nations[g.opening.by].alive); }
function claimLine(g) {
  const O = g.opening, x = nameOf(g, O.by);
  if (O.stage === "war") return `DANGER: the ${x} is at war with us over our town ${O.town}.`;
  if (O.stage === "refused") return `DANGER: the ${x} claims our town ${O.town}. We refused its demand; it may attack from ${seasonLabel(OPENING.warFrom)} if it thinks it can win, until ${seasonLabel(O.until)}. A bigger army, an ally on its border, money or a pact can stop it.`;
  if (O.stage === "demand") return `DANGER: the ${x} demands our town ${O.town} and threatens war if we refuse. Its letter waits for an answer.`;
  return `DANGER: the ${x} says our town ${O.town} belongs to it, and will soon demand it.`;
}

/* ---------- The files ---------- */
function econFileOf(w, g, nid) { return withEconMemo(g, () => computeEconomy(w, g, nid)); }

/* What every minister knows: the state of the country and the world in outline. */
function cabinetBriefing(w, g, nid, table) {
  const n = g.nations[nid];
  table = table || worldTable(w, g);
  const me = table.find(r => r.id === nid), econ = me.econ;
  const f = forecast(w, g, nid, n.laws);
  const L = [];
  L.push(`It is ${seasonLabel(g.turn)}, the ${ERAS[g.era || 0].name}. ${n.name} is led by ${leaderName(n) || "its president"}. There are ${table.filter(r => !r.minor).length} great powers and ${table.filter(r => r.minor).length} small states in the world.`);
  L.push(`Economy: ${bMoney(econ.gdp)} a year (${rankText(table, "gdp", nid)} in the world${me.growth !== null ? `; ${me.growth >= 0 ? "+" : ""}${(me.growth * 100).toFixed(1)}% in the last year` : ""}). Treasury ${n.treasury >= 0 ? bMoney(n.treasury) : `debt ${bMoney(-n.treasury)}`}; the budget ${f.budget.balance >= 0 ? `gains ${bMoney(f.budget.balance)}` : `loses ${bMoney(-f.budget.balance)}`} a season. Taxes ${n.laws.tax}%.`);
  L.push(`People: ${bPeople(econ.pop)} in ${econ.cities.length} towns. Stability ${Math.round(n.stability)} (heading to ${Math.round(f.target)}). Unemployment ${pct1(econ.unemployment || 0)}. Our farmland could feed ${pct(econ.food / Math.max(0.01, econ.pop))} of the people${(econ.foodIn || 0) > 0.005 ? `, and grain bought abroad feeds ${pct(econ.foodIn / Math.max(0.01, econ.pop))} more` : ""}${econ.famineShare > 0.001 ? `; ${pct(econ.famineShare)} go hungry` : ""}. Electricity ${pct(econ.sat.power ?? 1)} of need.`);
  L.push(`Armed forces: ${me.divs} divisions, ${bCount(me.men)} soldiers, ${me.tanks + me.depotTanks} tanks (${me.tanks} with the divisions), ${me.planes} warplanes${g.sea ? `, ${me.ships} warships` : ""}. Army strength ${rankText(table, "power", nid)} in the world.`);
  const wars = enemiesOf(g, nid).map(e => nameOf(g, e));
  const allies = alliesOf(g, nid).map(a => nameOf(g, a));
  const risks = liveNations(g).filter(z => z.id !== nid).map(z => ({ z, r: warRisk(w, g, z.id, nid) })).filter(x => x.r && x.r.level >= 1).sort((a, b) => b.r.level - a.r.level);
  L.push(`${wars.length ? `AT WAR with ${bJoin(wars.map(x => `the ${x}`))}. ` : "At peace. "}${allies.length ? `Allies: ${bJoin(allies.map(x => `the ${x}`))}. ` : "No allies. "}${risks.length ? `War risk: ${risks.slice(0, 3).map(x => `the ${x.z.name} ${x.r.label.toLowerCase()}`).join(", ")}.` : claimActive(g) ? "" : "No neighbor is thinking of war against us."}`);
  if (claimActive(g)) L.push(claimLine(g));
  L.push(groupsFileLine(g, n));
  { const pl = peopleBriefLine(g, n, computeEconomy(w, g, n.id)); if (pl) L.push(pl); }
  { const tl = tradeBriefLine(w, g, n, econ); if (tl) L.push(tl); }
  const open = (g.inbox || []).filter(it => it.status === "open");
  if (open.length) L.push(`Letters waiting for the president's answer: ${open.map(it => `${it.threat ? "a demand" : "a letter"} from the ${nameOf(g, it.from)}`).join(", ")}.`);
  const worries = MIN_ORDER.filter(k => ministryActive(n, k)).map(k => ({ k, c: ministryConcern(w, g, n, econ, k) })).filter(x => x.c.level >= 2);
  if (worries.length) L.push(`Ministers' main worries: ${worries.map(x => `${MINISTRIES[x.k].label}: ${x.c.text}`).join(" ")}`);
  const missing = MIN_ORDER.filter(k => !ministry(n, k));
  if (missing.length) L.push(`Ministries not yet established: ${missing.map(k => MINISTRIES[k].label).join(", ")}.`);
  return L;
}

function ministerFile(w, g, nid, key, table) {
  const n = g.nations[nid];
  table = table || worldTable(w, g);
  const me = table.find(r => r.id === nid), econ = me.econ;
  const L = n.laws;
  const S = [];
  const sec = (title, lines) => { const l = lines.filter(Boolean); if (l.length) S.push({ title, lines: l }); };
  const f = forecast(w, g, nid, L);
  const B = f.budget;
  const majors = table.filter(r => !r.minor);

  if (key === "economy") {
    sec("The economy", [
      `Output ${bMoney(econ.gdp)} a year, ${rankText(table, "gdp", nid)} in the world; $${fmtCount(econ.gdp / Math.max(0.01, econ.pop) * 1000)} per person (${rankText(table.map(r => ({ ...r, pp: r.gdp / Math.max(0.01, r.pop) })), "pp", nid)} per person).${me.growth !== null ? ` Growth in the last year: ${me.growth >= 0 ? "+" : ""}${(me.growth * 100).toFixed(1)}%.` : ""}`,
      `Where it comes from: ${Object.entries(econ.sectors).map(([k, v]) => `${SECTORS[k].label.toLowerCase()} ${pct(v.va / Math.max(0.01, econ.gdp))} of output and ${pct(v.workers / Math.max(0.01, Object.values(econ.sectors).reduce((s, x) => s + x.workers, 0)))} of workers`).join("; ")}. (Primary: farms, mines, forests, fishing. Secondary: factories and power. Tertiary: services. Quaternary: research, technology, media, finance.)`,
      `Biggest industries: ${econ.subs.filter(x => x.va > 0.05).sort((a, b) => b.va - a.va).slice(0, 8).map(x => `${x.sub.toLowerCase()} ${bMoney(x.va)} (${bPeople(x.workers)} workers)`).join(", ")}.`,
      `Unemployment ${pct1(econ.unemployment || 0)}${econ.vacancies > 0.01 ? `; ${bPeople(econ.vacancies)} jobs nobody fills` : ""}.`,
    ]);
    sec("The budget, each season", [
      `Income: taxes ${bMoney(B.revenue)} (rate ${L.tax}%, ${pct(B.collection)} collected because of stability)${B.tariffs > 0.005 ? `, tariffs ${bMoney(B.tariffs)}` : ""}.`,
      `Spending: healthcare ${bMoney(B.services)}, schools ${bMoney(B.education)}, research ${bMoney(B.research)}, army ${bMoney(B.army + (B.armyUpkeep || 0))}, arms ${bMoney((B.arms && B.arms.spend) || 0)}${B.navy ? `, navy ${bMoney(B.navy)}` : ""}${B.granary ? `, food reserve ${bMoney(B.granary)}` : ""}${B.ministries ? `, ministries ${bMoney(B.ministries)}` : ""}${B.interest ? `, interest on debt ${bMoney(B.interest)}` : ""}.`,
      `Balance: ${B.balance >= 0 ? `+${bMoney(B.balance)}` : bMoney(B.balance)} a season. Treasury ${n.treasury >= 0 ? bMoney(n.treasury) : `debt ${bMoney(-n.treasury)} (${pct(B.debtRatio)} of a year's output, interest ${pct1(B.interestRate || 0)})`}.`,
      `Laws: taxes ${L.tax}%, trade policy ${lawValueLabel("trade", L.trade || "balanced")}, finance ${lawValueLabel("finance", L.finance || "balanced")}, research funding ${lawValueLabel("research", L.research || "low")}.`,
    ]);
    sec("Goods: made, needed, bought and sold (value a year)", GOOD_ORDER.map(k => goodLine(g, econ, k, nid)).concat([tradeAccessLine(g, n, econ)]));
    sec("Trade partners (value a year)", tradePartnerLines(w, g, nid, econ));
    sec("Trade dependence and risks", tradeRiskLines(w, g, nid, econ));
    sec("Research", [
      `Technologies known: ${Object.keys(n.techs || {}).length ? Object.keys(n.techs).map(t => TECHS[t] ? TECHS[t].label : t).join(", ") : "none yet"}. Research ${fmt1(econ.research || 0)} points a year${n.research && n.research.target && TECHS[n.research.target] ? `; working on ${TECHS[n.research.target].label}` : ""}.`,
      `Next technologies: ${TECH_ORDER.filter(t => !(n.techs || {})[t] && (!TECHS[t].needs || (n.techs || {})[TECHS[t].needs])).slice(0, 4).map(t => `${TECHS[t].label} (${TECHS[t].does})`).join("; ")}.`,
    ]);
    const proj = (g.projects || []).filter(p => p.nid === nid);
    if (proj.length) sec("Being built now", proj.slice(0, 10).map(p => `${p.label}: ${bMoney(p.cost)}, ${Math.max(0, p.seasons - (p.progress || 0))} season${p.seasons - (p.progress || 0) === 1 ? "" : "s"} left${p.private ? " (private investors)" : ""}.`));
    sec("Other economies", majors.concat(table.filter(r => r.minor && r.id === nid)).sort((a, b) => b.gdp - a.gdp).map(r => `${r.id === nid ? `${n.name} (us)` : r.name}: ${bMoney(r.gdp)} a year, ${bPeople(r.pop)} people, ${r.growth !== null ? `${r.growth >= 0 ? "+" : ""}${(r.growth * 100).toFixed(1)}%/year` : "growth unknown"}, exports ${bMoney(r.exp)}, imports ${bMoney(r.imp)}, treasury ${r.treasury >= 0 ? bMoney(r.treasury) : `debt ${bMoney(-r.treasury)}`}.`));
    sec("World market prices (100% = normal)", [GOOD_ORDER.filter(k => !GOODS[k].local).map(k => `${GOODS[k].label.toLowerCase()} ${pct(priceOf(g, k))}`).join(", ") + "."]);
  }

  if (key === "defence") {
    const divs = g.divisions.filter(d => d.owner === nid);
    const byType = Object.keys(DIV_TYPES).map(t => ({ t, list: divs.filter(d => d.type === t) })).filter(x => x.list.length);
    const avgExp = divs.length ? divs.reduce((s, d) => s + (d.exp || 0), 0) / divs.length : 0;
    const fill = divs.length ? divs.reduce((s, d) => s + equipFill(d), 0) / divs.length : 1;
    sec("Our armed forces", [
      `${divs.length} divisions (${byType.map(x => `${x.list.length} ${DIV_TYPES[x.t].label.toLowerCase()}`).join(", ") || "none"}), ${bCount(me.men)} soldiers, ${me.tanks} tanks in the field and ${Math.round((n.stock && n.stock.tanks) || 0)} in depots, ${me.planes} warplanes in ${g.airwings.filter(a => a.owner === nid).length} air wing${g.airwings.filter(a => a.owner === nid).length === 1 ? "" : "s"}${g.sea ? `, ${me.ships} warships and ${me.freighters} freighters` : ""}.`,
      divs.length ? `Readiness: equipment ${pct(fill)} of what the divisions should have; average experience ${pct(avgExp)} (peacetime drill can raise it to ${pct(drillCapFor(n))}).` : "We have no divisions at all.",
      `Depots: ${fmtCount((n.stock && n.stock.kits) || 0)} infantry kits, ${fmtCount((n.stock && n.stock.guns) || 0)} guns, ${fmtCount((n.stock && n.stock.tanks) || 0)} tanks, ${fmtCount((n.stock && n.stock.planes) || 0)} planes. Free manpower for new divisions: ${bCount(manpowerFree(n, econ))}.`,
      B.arms ? `Arms production: ${lawValueLabel("arms", L.arms)}; this season the factories make ${EQUIP_ORDER.filter(k => B.arms.units[k] > 0).map(k => `${B.arms.units[k]} ${k === "kits" ? "sets of infantry weapons" : EQUIP[k].unit}`).join(", ") || "nothing"} for ${bMoney(B.arms.spend)}${B.arms.limit === "factories" ? " (held back by too few factories)" : B.arms.limit === "money" ? " (held back by the budget)" : ""}.` : "",
      `Conscription: ${lawValueLabel("army", L.army)}. Army costs ${bMoney(B.army + (B.armyUpkeep || 0))} a season. Generals' order: ${(n.warPlan && n.warPlan.stance) === "offensive" ? "attack where the odds favor us" : "hold the line"}. Season: ${seasonWar(g).name}.`,
    ]);
    const own = g.cities.filter(c => c.owner === nid);
    const near = cell => { let best = null, bd = 1e9; for (const c of g.cities) { const d = Math.hypot(cellX(c.cell) - cellX(cell), cellY(c.cell) - cellY(cell)); if (d < bd) { bd = d; best = c; } } return best ? (bd < 1.5 ? `at ${best.name}` : `near ${best.name}${best.owner !== nid ? ` (${nameOf(g, best.owner)})` : ""}`) : ""; };
    if (divs.length) sec("Our divisions", divs.slice(0, 30).map(d => `${d.name}: ${fmtCount(d.men)} soldiers, equipment ${pct(equipFill(d))}, experience ${pct(d.exp || 0)}, ${near(d.cell)}${d.training ? `, in training (${d.training} season${d.training > 1 ? "s" : ""} left)` : d.engaged ? ", in battle" : ""}${d.battles ? `; ${d.wins || 0} of ${d.battles} battles won` : ""}.`));
    void own;
    sec("Armies of the world (from the general staff and military intelligence)", table.slice().sort((a, b) => b.power - a.power).map((r, i) => `${i + 1}. ${r.id === nid ? `${n.name} (us)` : r.name}${r.minor ? " (small state)" : ""}: ${r.divs} divisions, ${bCount(r.men)} soldiers, ${r.tanks + r.depotTanks} tanks (${r.tanks} with the divisions), ${r.planes} planes${g.sea ? `, ${r.ships} warships` : ""}${r.id === nid ? "" : `; army strength ${ratioText(r.power / Math.max(1, me.power))}${atWar(g, nid, r.id) ? "; AT WAR WITH US" : sharesBorder(g, nid, r.id) ? "; borders us" : ""}`}.`));
    const threats = liveNations(g).filter(z => z.id !== nid && !atWar(g, nid, z.id)).map(z => ({ z, r: warRisk(w, g, z.id, nid) })).filter(x => x.r);
    sec("Threats", (claimActive(g) ? [claimLine(g)] : []).concat(threats.length ? threats.sort((a, b) => b.r.level - a.r.level).map(({ z, r }) => {
      const motives = (r.lines || []).filter(l => l.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 2).map(l => l.label.toLowerCase());
      return `The ${z.name}: war risk ${r.label.toLowerCase()}. ${r.why}${r.chance !== undefined ? ` Their own estimate of winning: about ${pct(r.chance)}.` : ""}${motives.length ? ` Motives: ${motives.join("; ")}.` : ""}`;
    }) : claimActive(g) ? [] : ["No neighbor shares a border with us outside a war."]));
    // the war goods we sell to the nations that threaten us
    const armsTo = [...new Set([...(claimActive(g) ? [g.opening.by] : []), ...threats.filter(x => x.r.level >= 1).map(x => x.z.id)])].map(id => strategicSalesLine(g, nid, id)).filter(Boolean);
    if (armsTo.length) { const t = S.find(x => x.title === "Threats"); if (t) t.lines.push(...armsTo); }
    const wars = g.wars.filter(x => x.sideA.includes(nid) || x.sideB.includes(nid));
    if (wars.length) sec("Our wars", wars.map(x => {
      const foes = (x.sideA.includes(nid) ? x.sideB : x.sideA).map(e => nameOf(g, e));
      const lostTowns = g.cities.filter(c => c.owner === nid && g.occ && g.occ[c.cell] >= 0).map(c => c.name);
      const heldTowns = g.cities.filter(c => c.owner !== nid && g.occ && g.occ[c.cell] === nid).map(c => c.name);
      const st = natStats(g, nid);
      return `Against ${bJoin(foes.map(x => `the ${x}`))} since ${seasonLabel(x.since)}${x.cb ? ` (cause: ${x.cb})` : ""}. War score ${signed(sideScore(x, nid))} for us (−100 to +100). ${lostTowns.length ? `Enemy troops occupy our towns ${bJoin(lostTowns)}. ` : ""}${heldTowns.length ? `We occupy ${bJoin(heldTowns)}. ` : ""}Battles so far: ${st.won} won, ${st.lost} lost; ${bCount(st.menLost)} of our soldiers lost.`;
    }));
    const al = alliesOf(g, nid);
    if (al.length) sec("Allies", al.map(a => { const r = table.find(x => x.id === a); return `The ${r.name}: ${r.divs} divisions, army ${ratioText(r.power / Math.max(1, me.power))}.`; }));
    if (g.opening && openingActive(g)) { const o = openingOdds(w, g); if (o) sec("The claim on our town", [`The ${o.x.name} claims ${g.opening.town} (stage: ${g.opening.stage}). Their army against ours, counting our defense: ${o.ratio.toFixed(1)} to 1.${g.opening.stage === "war" ? "" : o.value !== null && o.value > 0 ? " They think they can win." : " For now they think a war too costly."}`]); }
  }

  if (key === "foreign") {
    const others = liveNations(g).filter(z => z.id !== nid);
    sec("Our standing in the world", [
      `Prestige ${Math.round(n.prestige || 0)}${table.some(r => r.prestige > 0) ? ` (${rankText(table, "prestige", nid)})` : ""}. ${alliesOf(g, nid).length ? `Allies: ${bJoin(alliesOf(g, nid).map(a => `the ${nameOf(g, a)}`))}.` : "We have no allies."} Treaties: ${(g.treaties || []).filter(t => t.a === nid || t.b === nid).length}.`,
      `Opinion of us: ${others.map(z => `the ${z.name} ${signed(opinionDetail(g, z.id, nid).value)}`).join(", ")}.`,
    ]);
    for (const z of others.sort((a, b) => (a.minor - b.minor) || (sharesBorder(g, nid, b.id) - sharesBorder(g, nid, a.id)))) sec(`${z.name}`, nationFile(w, g, nid, z.id, table, 2));
    const worldWars = g.wars.filter(x => !x.sideA.includes(nid) && !x.sideB.includes(nid));
    sec("Wars between other nations", worldWars.length ? worldWars.map(x => `${bJoin(x.sideA.map(a => `the ${nameOf(g, a)}`))} against ${bJoin(x.sideB.map(a => `the ${nameOf(g, a)}`))} since ${seasonLabel(x.since)}.`) : ["No other nations are at war with each other."]);
    const A = g.assembly;
    if (A && A.topics && A.topics.length) {
      const open = A.topics.filter(t => t.status === "open"), done = A.topics.filter(t => t.status !== "open").slice(-2);
      const votes = t => { const v = Object.values(t.votes || {}); return `${v.filter(x => x === "yes").length} for, ${v.filter(x => x === "no").length} against, ${v.filter(x => x === "abstain").length} abstaining`; };
      sec("The World Assembly", open.map(t => `Open: "${t.title}" (raised by the ${nameOf(g, t.author)}; so far ${votes(t)}${t.votes && t.votes[nid] ? `; we voted ${t.votes[nid]}` : "; we have not voted"}).`)
        .concat(done.map(t => `Decided: "${t.title}" - ${t.status} (${votes(t)}).`)));
    }
    const blocs = (g.treaties || []).filter(t => t.type === "alliance" && t.a !== nid && t.b !== nid);
    if (blocs.length) sec("Other alliances", [blocs.map(t => `the ${nameOf(g, t.a)} with the ${nameOf(g, t.b)}`).join("; ") + "."]);
  }

  if (key === "interior") {
    const terms = f.terms.filter(t => Math.abs(t.value) >= 0.3).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    sec("Stability", [
      `Stability ${Math.round(n.stability)} of 100, heading to ${Math.round(f.target)}. ${n.stability < 30 ? "DANGER: unrest, strikes and lower tax collection." : n.stability < 50 ? "People are restless; taxes are collected less well." : "The country is calm for now."}${f.target < n.stability - 4 ? " It is FALLING: the causes below pull it down." : f.target > n.stability + 4 ? " It is rising." : ""}`,
      `What makes it: ${terms.map(t => `${t.label} ${t.value > 0 ? "+" : ""}${t.value.toFixed(1)}`).join("; ")}.`,
    ]);
    sec("People and work", [
      `${bPeople(econ.pop)} people (${rankText(table, "pop", nid)} in the world). ${n.popFlow ? `Last season: ${bPeople(n.popFlow.births || 0)} more from births${n.popFlow.famine ? `, ${bPeople(n.popFlow.famine)} lost to hunger` : ""}${n.popFlow.war ? `, ${bPeople(n.popFlow.war)} lost to war` : ""}${n.popFlow.moved ? `, ${bPeople(n.popFlow.moved)} moved between towns for work` : ""}.` : ""}`,
      `Workers ${bPeople(econ.workforce || 0)}; unemployment ${pct1(econ.unemployment || 0)}${econ.vacancies > 0.01 ? `; ${bPeople(econ.vacancies)} jobs nobody fills` : ""}. Public jobs ${bPeople(econ.publicJobs || 0)}, soldiers ${bCount(me.men)}.`,
      `Healthcare: ${lawValueLabel("services", L.services)} (${bMoney(B.services)} a season). Schools: ${lawValueLabel("education", L.education || "basic")} (${bMoney(B.education)} a season); workers' skill ${pct(n.skill ?? 0.35)}.`,
      `Roads: ${econ.roadEdges} stretches. ${econ.isolated.length ? `Towns cut off from the capital: ${bJoin(econ.isolated.map(c => c.name))}; each costs stability and trade.` : "Every town is joined to the capital by road."}`,
    ]);
    const cprof = cityProfiles(w, g);
    sec("Our towns", econ.regions.slice().sort((a, b) => (b.city.imp || 0) - (a.city.imp || 0)).map(r => {
      const net = econ.networks[r.net];
      const occ = g.occ && g.occ[r.city.cell] >= 0;
      const p = cprof.get(r.city.id);
      const c = r.city;
      const moodWhy = p ? p.mood.filter(x => Math.abs(x.value) >= 2).slice(0, 2).map(x => `${x.label.toLowerCase()} ${x.value > 0 ? "+" : ""}${Math.round(x.value)}`).join("; ") : "";
      return `${c.name}${c.capital ? " (capital)" : ""}: ${cityClass(c.imp).label.toLowerCase()}, importance ${c.imp || "?"}${c.rankW ? ` (${cityOrd(c.rankW)} in the world)` : ""}${(c.roles || []).filter(k => CITY_ROLES[k] && k !== "capital").length ? `; ${(c.roles || []).filter(k => CITY_ROLES[k] && k !== "capital").slice(0, 3).map(k => CITY_ROLES[k].label.toLowerCase()).join(", ")}` : ""}; ${bPeople(r.pop)} people, unemployment ${pct1(townURate(r))}, output ${bMoney(r.gdp || 0)}, farmland for ${pct(r.foodRatio || 0)} of its people; mood ${Math.round(c.mood ?? 55)}${moodWhy ? ` (${moodWhy})` : ""}${c.origin !== c.owner ? `; loyalty ${Math.round(c.loyalty ?? 92)} (it was the ${nameOf(g, c.origin)}'s)` : ""}${c.focus && FOCI[c.focus] ? `; program: ${FOCI[c.focus].label.toLowerCase()}` : ""}${net && net.capital ? "" : ", CUT OFF from the capital"}${c.port ? ", harbor" : ""}${occ ? `, OCCUPIED by the ${nameOf(g, g.occ[c.cell])}` : ""}.`;
    }));
    const lostT = g.cities.filter(c => c.origin === nid && c.owner !== nid);
    sec("Interest groups", groupFileLines(w, g, n));
    sec("People and work", peopleFileLines(w, g, n, econ));
    if (lostT.length) sec("Towns we have lost", lostT.map(c => `${c.name}, now the ${nameOf(g, c.owner)}'s: its people's loyalty to them is ${Math.round(c.loyalty ?? 92)}${(c.loyalty ?? 92) < CITY.integrate ? "; we have a just cause to win it back" : "; they have come to feel at home there"}.`));
    const occTowns = g.cities.filter(c => c.owner === nid && g.occ && g.occ[c.cell] >= 0);
    if (occTowns.length) { const lines = occTowns.map(c => `${c.name}${c.capital ? " (capital)" : ""}: OCCUPIED by the ${nameOf(g, g.occ[c.cell])}; it gives us nothing until we take it back.`); const t = S.find(x => x.title === "Our towns"); if (t) t.lines.push(...lines); else sec("Our towns", lines); }
    const mods = (n.mods || []).filter(m => m.stab).map(m => `${m.label} ${m.stab > 0 ? "+" : ""}${m.stab} stability${m.until !== undefined ? ` until ${seasonLabel(m.until)}` : ""}`);
    if (mods.length) sec("Passing effects", mods);
  }

  if (key === "agriculture") {
    const h = harvestFactor(n);
    const reserve = monthsOfFood((n.granary && n.granary.stock) || 0, econ.pop);
    sec("Food", [
      `Our farmland and fishing grounds could feed ${pct(econ.food / Math.max(0.01, econ.pop))} of our ${bPeople(econ.pop)} people (${rankText(table, "food", nid)} in the world per person); farmers only grow what can be eaten or sold, so the rest of the land is spare.${(econ.foodIn || 0) > 0.005 ? ` Grain bought abroad feeds ${pct(econ.foodIn / Math.max(0.01, econ.pop))} more.` : ""}${econ.famineShare > 0.001 ? ` HUNGER: ${pct(econ.famineShare)} of the people do not get enough.` : " Nobody goes hungry."}`,
      `This year's harvest: ${harvestWord(h)} (${pct(h)} of normal). ${goodLine(g, econ, "food", nid)}`,
      `Food reserve: ${fmt1(reserve)} months in store; the law asks for ${GRANARY_LAWS[L.granary || "none"].months}. ${B.granary ? `Filling it costs ${bMoney(B.granary)} this season.` : ""}`,
      `Farming methods: ${econ.mech ? "machines on the farms" : "no farm machines yet"}, ${econ.fert ? "fertilizer in use" : "no fertilizer yet"}. Farm workers: ${bPeople(econ.regions.reduce((s, r) => s + (r.farmWorkers || 0), 0))}. Fishing fleets: ${fmt1(econ.levels.fishing || 0)}; food factories: ${fmt1(econ.levels.foodproc || 0)}.`,
    ].concat(foodTradeLines(w, g, nid, econ, table)));
    sec("Farm regions", econ.regions.slice().sort((a, b) => (b.foodMade || 0) - (a.foodMade || 0)).map(r => `${r.city.name}: grows food for ${bPeople(r.foodMade || 0)} people; its farmland could feed ${pct(r.foodRatio || 0)} of its own people; ${bPeople(r.farmWorkers || 0)} farm workers${r.city.irrigated ? ", irrigated" : ""}${r.fish ? ", fishing" : ""}.`));
    const fish = (econ.sites || []).filter(s => s.site.kind === "fishing" || s.site.kind === "logging");
    if (fish.length) sec("Forests and fishing grounds", fish.map(s => siteLine(w, g, s)));
  }

  if (key === "energy") {
    const st = ["power_coal", "power_gas", "power_hydro", "power_nuclear"];
    const plants = econ.cities.flatMap(c => st.filter(k => (c.ind || {})[k] > 0).map(k => `${INDUSTRIES[k].label} at ${c.name}${c.ind[k] > 1 ? ` (level ${c.ind[k]})` : ""}`));
    sec("Electricity", [
      `${goodLine(g, econ, "power", nid)}${(econ.sat.power ?? 1) < 0.95 ? " Blackouts cost stability and slow every factory." : ""}`,
      plants.length ? `Power stations: ${plants.join(", ")}.` : "We have no power station.",
      `Fuel for the stations, the factories and the army: ${goodLine(g, econ, "coal", nid)} ${goodLine(g, econ, "oil", nid)}`,
      `The army's fuel: ${pct(econ.fuelSat ?? 1)} of what tanks, planes and ships need.`,
    ]);
    const sites = (econ.sites || []).filter(s => s.site.kind === "coalmine" || s.site.kind === "oilfield");
    sec("Coal mines and oil fields", sites.length ? sites.map(s => siteLine(w, g, s)) : ["We have no coal mine or oil field."]);
    const others = (econ.sites || []).filter(s => s.site.kind === "mine" || s.site.kind === "goldmine");
    if (others.length) sec("Other mines (the Economy ministry runs them)", others.map(s => siteLine(w, g, s)));
    sec("Fuel prices (100% = normal)", [`Coal ${pct(priceOf(g, "coal"))}, oil and gas ${pct(priceOf(g, "oil"))}.`]);
  }
  return S;
}
function fileText(sections) { return sections.map(s => `## ${s.title}\n${s.lines.map(l => `- ${l}`).join("\n")}`).join("\n\n"); }

/* ---------- Finding what the president asks about ---------- */
function findNationIn(g, text, nid) {
  const t = text.toLowerCase();
  let best = null, bl = 0;
  for (const z of liveNations(g)) {
    if (z.id === nid) continue;
    const full = z.name.toLowerCase();
    const core = full.replace(/^(the |kingdom of |republic of |principality of |free city of |grand duchy of |duchy of |empire of |federation of )/, "").replace(/ (dominion|directorate|republic|kingdom|empire|federation|union|confederacy|league|commonwealth)$/, "").trim();
    for (const k of [full, core]) if (k.length >= 3 && t.includes(k) && k.length > bl) { best = z; bl = k.length; }
  }
  return best;
}
function findTownIn(g, text, nid) {
  const t = text.toLowerCase();
  return g.cities.filter(c => c.owner === nid && t.includes(c.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0] || null;
}
const GOOD_WORDS = { food: /\b(food|grain|wheat|bread)\b/, timber: /\b(timber|wood|lumber)\b/, metals: /\b(metals?|iron|steel)\b/, coal: /\bcoal\b/, oil: /\b(oil|gas|petrol|petroleum|fuel)\b/, gold: /\bgold\b/,
  power: /\b(electricity|electric|power (station|plant|supply|grid)s?|blackouts?|grid)\b/, goods: /\b(consumer goods|shops?)\b/, machinery: /\bmachine(s|ry)?\b/, chemicals: /\bchemicals?\b/, electronics: /\b(electronics?|radios?|computers?)\b/ };
function findGoodIn(text) {
  const t = text.toLowerCase();
  for (const k of ["electronics", "machinery", "chemicals", "goods", "power", "food", "timber", "metals", "coal", "oil", "gold"]) if (GOOD_WORDS[k].test(t)) return k;
  return null;
}

