/* =====================================================================
   10s. Trade between nations: once a season the merchants of every nation sign their contracts — who sells
        what to whom — by price at the border, distance, roads, caravans across wild land and sea lanes, import
        taxes and trade agreements, embargoes, sanctions and wars. Whatever no nation on the map can sell or buy
        goes to the world beyond the map, through ports and trade partners, at the middlemen's price.
        The economy reads this book every time it is worked out; it never writes it. A war, an embargo or a lost
        port cuts a contract at once; finding new sellers takes until the next season's contracts.
   ===================================================================== */
const TRADE = {
  landT: 2.5,          // $ a ton for each 50 km across a border by road and rail
  overT: 5,            // $ a ton for each 50 km by caravan across wild land, with no road
  seaBaseT: 15,        // $ a ton for a voyage: loading, unloading and the harbor (≈ SEA.freightRate for a short route)
  seaPerKmT: 0.004,    // and for each km at sea ($24–42 a ton on the routes these maps have)
  worldPremium: 0.25,  // buying from beyond the map goes through middlemen and long voyages (= ECON7.importPremium)
  renewBand: 0.1,      // merchants keep last season's seller unless another is at least 10% cheaper
  prefer: 0.1,         // a seller the government prefers is treated as 10% cheaper
  dislike: 0.1,        // buyers pay up to 10% more rather than buy from a nation they hate (opinion below -40)
  overGap: 8,          // caravans cross at most 8 cells (400 km) of wild land between two nations
  borderMtPerEdge: 0.2, borderMtMin: 1, borderMtMax: 4,   // Mt a year across a border with no road, by its length
  roadMt: 10,          // Mt a year for each road that crosses the border (a road with a railway beside it)
  overMt: 1,           // Mt a year by caravan across wild land
  importOpen: { protect: 0.5, balanced: 1, free: 1 },   // share of a shortage merchants may fill from other nations
  exportOpen: { protect: 0.7, balanced: 1, free: 1 },   // share of a surplus they may sell to other nations
  foodExport: 0.25,    // farms grow for export at most a quarter of their people's need, and only with machinery
  foodRelief: 0.1,     // in a famine abroad, farms can spare a tenth of their people's need more: sold only to the hungry
  histKeep: 40, aidKeep: 24,
  minEmbargo: 4,       // an embargo lifted sooner than a year after it began earns no goodwill
  cooldown: 8,         // no nation declares a new embargo on the same nation within two years of the last
  promise: 16,         // a nation paid to lift an embargo promises not to bring it back for four years
  strategic: ["metals", "oil", "chemicals", "machinery", "electronics"],   // what armies are made of
  key: ["food", "oil", "coal", "metals", "machinery", "chemicals"],        // what a nation cannot do without for long
};
// goods in the order merchants load them: most value for each ton first (they fill a narrow border road first)
const TRADE_LOAD_ORDER = ["electronics", "machinery", "chemicals", "goods", "metals", "oil", "gold", "timber", "coal"];
const TRADE_GOODS = GOOD_ORDER.filter(k => !GOODS[k].local);
const TRADE_REASON = { renewed: "Last season's seller", cheapest: "The cheapest seller", only: "The only seller we can reach", preferred: "Our preferred seller", relief: "Famine relief" };

function emptyTradeBook() {
  return { v: 1, turn: 0, flows: [], links: {}, need: {}, unsold: {}, unmet: {}, embargoes: [], promises: [], prefer: [], nextId: 1, aid: [], hist: [] };
}
/* The book for this game, created (empty) if it has none yet; fills in parts missing from older versions. */
function ensureTrade(g) {
  if (!g.trade) g.trade = emptyTradeBook();
  const T = g.trade, E = emptyTradeBook();
  for (const k in E) if (T[k] === undefined || T[k] === null) T[k] = E[k];
  return T;
}
function linkKey(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }
function tradeLink(g, a, b) { return g.trade && g.trade.links ? g.trade.links[linkKey(a, b)] || null : null; }

/* ---------- The index: each nation's contracts, worked out once per book (never saved) ---------- */
const TRADE_IDX = new WeakMap();
const TRADE_IDX_EMPTY = { into: {}, outOf: {}, pairV: {}, pairT: {}, world: {} };
function tradeIndex(g) {
  const T = g.trade;
  if (!T || !T.flows) return TRADE_IDX_EMPTY;
  let ix = TRADE_IDX.get(T.flows);
  if (ix) return ix;
  ix = { into: {}, outOf: {}, pairV: {}, pairT: {}, world: {} };
  const put = (o, nid, k, f) => { const a = o[nid] || (o[nid] = {}); (a[k] || (a[k] = [])).push(f); };
  for (const f of T.flows) {
    put(ix.into, f.b, f.k, f);
    put(ix.outOf, f.s, f.k, f);
    const pk = `${f.s}>${f.b}`;
    ix.pairV[pk] = (ix.pairV[pk] || 0) + f.q * GOODS[f.k].price;
    ix.pairT[pk] = (ix.pairT[pk] || 0) + (f.t || 0);
  }
  TRADE_IDX.set(T.flows, ix);
  return ix;
}

/* ---------- What stops trade between two nations ---------- */
function embargoCovers(e, k) { return e.k === k || (e.k === "all" && (k !== "food" || !!e.food)); }
/* Why the seller s cannot sell good k to the buyer b right now (null: nothing stops it). The world (-1) is never
   stopped here: ports and access decide that. Every test reads only the game, so both sides always agree. */
function tradeBlocked(g, s, b, k) {
  if (s < 0 || b < 0) return null;
  const S = g.nations[s], B = g.nations[b];
  if (!S || !B || !S.alive || !B.alive) return "dead";
  if (atWar(g, s, b)) return "war";
  const A = g.assembly;
  if (A && A.sanctions && A.sanctions.some(x => x.until > g.turn && ((x.target === s && x.by.includes(b)) || (x.target === b && x.by.includes(s))))) return "sanctions";
  const E = g.trade && g.trade.embargoes;
  if (E && E.length) for (const e of E) {
    if (e.by === s && e.on === b && e.dir !== "buy" && embargoCovers(e, k)) return "embargo_by_seller";
    if (e.by === b && e.on === s && e.dir !== "sell" && embargoCovers(e, k)) return "embargo_by_buyer";
  }
  return null;
}
function tradeBlockedText(g, code, s, b, k) {
  const good = k && GOODS[k] ? GOODS[k].label.toLowerCase() : "goods";
  switch (code) {
    case "dead": return "that nation is gone";
    case "war": return "war between them";
    case "sanctions": return "World Assembly sanctions";
    case "embargo_by_seller": return `the ${nameOf(g, s)} stopped selling ${good} to the ${nameOf(g, b)}`;
    case "embargo_by_buyer": return `the ${nameOf(g, b)} stopped buying ${good} from the ${nameOf(g, s)}`;
    case "port": return "no usable harbor on the ocean (blockade or lost port)";
    default: return "";
  }
}
function lawTariff(g, nid) { const n = g.nations[nid]; return TRADE_LAWS[(n && n.laws && n.laws.trade) || "balanced"].tariff; }

/* ---------- The price at the buyer's border ----------
   base: the world price; transport by mode and distance; the buyer's import tax (none between trade partners);
   the middlemen's cut on what comes from beyond the map. Stored contracts keep only quantity and distance, so a
   price change or a new trade law shows at once. */
function deliveredPrice(g, k, s, b, m, d) {
  const base = GOODS[k].price * priceOf(g, k);
  const tons = SEA.tonsPerUnit[k] || 0;
  let transport = 0;
  if (m === "land") transport = tons * TRADE.landT * (d / 50) / 1000;
  else if (m === "over") transport = tons * TRADE.overT * (d / 50) / 1000;
  else if (m === "sea") transport = tons * (TRADE.seaBaseT + TRADE.seaPerKmT * d) / 1000;
  const premium = s < 0 ? TRADE.worldPremium * base : 0;
  const treaty = s >= 0 && b >= 0 && hasTreaty(g, s, b, "trade");
  const tariff = b >= 0 && !treaty ? lawTariff(g, b) * base : 0;
  const p = base + transport + tariff + premium;
  const why = [{ label: "Price on the world market", value: base }];
  if (transport > 0) why.push({ label: m === "sea" ? `Shipping (${Math.round(d).toLocaleString("en-US")} km by sea)` : m === "over" ? `Caravans across wild land (${Math.round(d)} km)` : `Road and rail (${Math.round(d)} km)`, value: transport });
  if (tariff > 0) why.push({ label: "Import tax", value: tariff });
  else if (treaty) why.push({ label: "No import tax: trade agreement", value: 0 });
  if (premium > 0) why.push({ label: "Middlemen's cut (bought beyond the map)", value: premium });
  return { p, base, transport, tariff, premium, treaty, why };
}

/* ---------- Sea routes between two nations' main harbors (geography only, cached per world, never saved) ---------- */
function mainOceanPort(w, g, nid) {
  const ports = g.cities.filter(c => c.owner === nid && portUsableBy(w, g, c, nid));
  if (!ports.length) return null;
  ports.sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0) || portLevel(b) - portLevel(a) || a.id - b.id);
  return ports[0];
}
function tradeSeaRoute(w, pa, pb) {
  const ca = portSeaCell(w, pa.cell), cb = portSeaCell(w, pb.cell);
  if (ca < 0 || cb < 0) return null;
  if (!w._tradeSea || w._tradeSea.seed !== w.seed) w._tradeSea = { seed: w.seed, m: new Map() };
  const key = ca < cb ? `${ca}>${cb}` : `${cb}>${ca}`;
  if (!w._tradeSea.m.has(key)) {
    const p = seaPath(w, Math.min(ca, cb), Math.max(ca, cb));
    w._tradeSea.m.set(key, p ? { km: p.km, z: routeZones(w, p.cells) } : null);
  }
  return w._tradeSea.m.get(key);
}

/* ---------- The season's contracts ---------- */
/* What every live nation offers and wants this season, from its economy worked out fresh. */
function tradePositions(w, g) {
  const out = {};
  for (const n of liveNations(g)) out[n.id] = computeEconomyRaw(w, g, n.id);
  return out;
}
/* Merchants sign next season's contracts. Called at the end of each season (after the harvest), at the start of
   a game and when an old save is loaded. Deterministic: no random numbers; ties go by nation id. */
function clearWorldTrade(w, g, opts = {}) {
  const old = ensureTrade(g);
  let econs;
  try {
    econs = tradePositions(w, g);
    const book = buildTradeBook(w, g, econs, old);
    const news = opts.quiet ? [] : tradeNews(w, g, old, book, econs);
    Object.assign(g.trade, book);
    if (opts.history) {
      for (const n of liveNations(g)) {
        const h = n.history[n.history.length - 1];
        if (!h || h.turn !== g.turn) continue;
        const fresh = historyEntry(n, computeEconomyRaw(w, g, n.id), g.turn, g);
        n.history[n.history.length - 1] = { ...h, ...fresh, prestige: h.prestige };
      }
    }
    return news;
  } catch (e) {
    // a fault in the trade book must never stop the season: the old contracts stand
    if (typeof console !== "undefined") console.warn("trade clearing failed", e);
    return [];
  }
}
/* Old saves and new games: an empty book, then contracts signed twice (the second time with the first season's
   trade already flowing, as it would be in a game that had always had them). Quiet: no news, no opinion changes. */
function tradeMigrate(w, g) {
  if (!g.trade) g.trade = emptyTradeBook();
  ensureTrade(g);
  g.trade.turn = g.turn;
  clearWorldTrade(w, g, { quiet: true });
  clearWorldTrade(w, g, { quiet: true, history: true });
}

function buildTradeBook(w, g, econs, old) {
  const ids = Object.keys(econs).map(Number).sort((a, b) => a - b);
  const N = g.nations.length;
  const arr = () => new Array(N).fill(0);
  /* 1. Links: a pair trades only by a link both sides see (borders, roads, caravans, sea lanes) */
  const links = {};
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j], A = econs[a].trade, B = econs[b].trade;
    const la = A.landView[b], lb = B.landView[a];
    if (la && lb) {
      const cap = Math.min(la.cap, lb.cap);
      links[linkKey(a, b)] = { m: "land", cap: [cap, cap], d: Math.max(50, Math.round(Math.min(la.d, lb.d))), cross: la.cross || lb.cross || null };
      continue;
    }
    // ships between two harbors on the open ocean
    const pa = mainOceanPort(w, g, a), pb = pa ? mainOceanPort(w, g, b) : null;
    if (pa && pb) {
      const r = tradeSeaRoute(w, pa, pb);
      if (r) { links[linkKey(a, b)] = { m: "sea", cap: [999, 999], d: Math.round(r.km), z: r.z, pa: a < b ? pa.id : pb.id, pb: a < b ? pb.id : pa.id }; continue; }
    }
    // caravans across a narrow stretch of wild land
    const gp = gap(w, g, a, b);
    if (gp > 0 && gp <= TRADE.overGap) links[linkKey(a, b)] = { m: "over", cap: [TRADE.overMt, TRADE.overMt], d: Math.round(gp * 50) + 100 };
  }
  const linkOf = (s, b) => { const L = links[linkKey(s, b)]; if (!L) return null; return { L, cap: L.cap[s < b ? 0 : 1] }; };

  /* 2. What each nation wants and offers, good by good */
  const need = {}, offer = {}, want = {}, relief = arr(), reliefWant = arr();
  for (const k of TRADE_GOODS) { need[k] = arr(); offer[k] = arr(); want[k] = arr(); }
  for (const id of ids) {
    const T = econs[id].trade, law = (g.nations[id].laws && g.nations[id].laws.trade) || "balanced";
    for (const k of TRADE_GOODS) {
      if (k === "food") continue;
      const P = T.positions[k] || { short: 0, surplus: 0, demand: 0 };
      need[k][id] = P.demand;
      want[k][id] = P.short;
      offer[k][id] = P.surplus;
    }
    need.food[id] = econs[id].pop;
    want.food[id] = T.foodGap;
    offer.food[id] = T.foodOffer;
    relief[id] = T.foodRelief;
    reliefWant[id] = T.foodGap;
    T._open = { inN: TRADE.importOpen[law] ?? 1, outN: TRADE.exportOpen[law] ?? 1 };
  }
  const prefOf = (b, k, s) => (old.prefer || []).some(x => x.by === b && x.k === k && x.from === s);
  const lastQ = {};
  for (const f of old.flows || []) if (f.s >= 0 && f.b >= 0) lastQ[`${f.s}>${f.b}>${f.k}`] = (lastQ[`${f.s}>${f.b}>${f.k}`] || 0) + f.q;
  const hate = {};
  const opinionOf = (b, s) => { const k = `${b}>${s}`; if (!(k in hate)) hate[k] = opinionDetail(g, b, s).value; return hate[k]; };
  const flows = [];
  const tonsUsed = {};
  const capLeft = (s, b, link) => link.cap - (tonsUsed[`${s}>${b}`] || 0);

  /* 3. Nation to nation, good by good: famine relief first, then food, then goods by value per ton */
  const match = (k, offerArr, wantArr, reason) => {
    const tons = SEA.tonsPerUnit[k] || 0;
    const cands = [];
    for (const s of ids) {
      if (offerArr[s] <= 1e-4) continue;
      for (const b of ids) {
        if (b === s || wantArr[b] <= 1e-4) continue;
        const ln = linkOf(s, b);
        if (!ln || tradeBlocked(g, s, b, k)) continue;
        const dp = deliveredPrice(g, k, s, b, ln.L.m, ln.L.d);
        let cost = dp.p;
        const pref = prefOf(b, k, s);
        if (pref) cost *= 1 - TRADE.prefer;
        if (opinionOf(b, s) < -40) cost *= 1 + TRADE.dislike;
        cands.push({ s, b, cost, ln, pref, renew: (lastQ[`${s}>${b}>${k}`] || 0) });
      }
    }
    if (!cands.length) return;
    // the cheapest offer each buyer could get, to judge whether keeping last season's seller is reasonable
    const best = {};
    for (const c of cands) best[c.b] = Math.min(best[c.b] ?? Infinity, c.cost);
    const take = (c, q, r) => {
      const tmax = tons > 0 ? capLeft(c.s, c.b, c.ln) / tons : Infinity;
      q = Math.min(q, offerArr[c.s], wantArr[c.b], tmax);
      if (q <= 1e-4) return;
      offerArr[c.s] -= q; wantArr[c.b] -= q;
      tonsUsed[`${c.s}>${c.b}`] = (tonsUsed[`${c.s}>${c.b}`] || 0) + q * tons;
      const prev = flows.find(f => f.s === c.s && f.b === c.b && f.k === k);
      if (prev) { prev.q += q; prev.t += q * tons; return; }
      flows.push({ s: c.s, b: c.b, k, q, t: q * tons, m: c.ln.L.m, d: c.ln.L.d, r });
    };
    // last season's contracts are renewed first, unless a seller at least 10% cheaper is now on offer
    for (const c of cands.filter(c => c.renew > 0 && c.cost <= best[c.b] * (1 + TRADE.renewBand)).sort((x, y) => x.s - y.s || x.b - y.b))
      take(c, c.renew, c.pref ? "preferred" : "renewed");
    cands.sort((x, y) => x.cost - y.cost || x.s - y.s || x.b - y.b);
    for (const c of cands) {
      const sellers = cands.filter(o => o.b === c.b).length;
      take(c, Infinity, reason || (c.pref ? "preferred" : sellers === 1 ? "only" : "cheapest"));
    }
  };
  // exporters may sell only part of their surplus to other nations (protectionist laws keep more at home)
  const capOffer = k => { const o = offer[k].slice(); for (const id of ids) if (k !== "food") o[id] *= econs[id].trade._open.outN; return o; };
  match("food", relief, reliefWant, "relief");
  for (const id of ids) want.food[id] = reliefWant[id];
  const foodOffer = offer.food.slice();
  match("food", foodOffer, want.food);
  const natLeft = {};
  for (const k of TRADE_LOAD_ORDER) {
    const o = capOffer(k), before = o.slice();
    const wn = want[k].map((v, id) => v * (econs[id] ? econs[id].trade._open.inN : 1)), wBefore = wn.slice();
    match(k, o, wn);
    for (const id of ids) { offer[k][id] -= before[id] - o[id]; want[k][id] -= wBefore[id] - wn[id]; }
    natLeft[k] = { o, wn };
  }
  for (const id of ids) offer.food[id] = foodOffer[id];
  natLeft.food = { o: foodOffer.slice(), wn: want.food.slice() };

  /* 4. The world beyond the map: what is still short is bought there, what is still spare is sold there,
     as far as harbors and trade partners reach it (the same limits as before nations traded with each other) */
  for (const id of ids) {
    const E = econs[id], T = E.trade;
    const via = T.mainPort !== null && T.mainPort !== undefined ? { city: T.mainPort } : T.transit !== null && T.transit !== undefined ? { nid: T.transit } : null;
    for (const k of TRADE_GOODS) {
      const P = k === "food" ? { demand: E.pop, supply: 0 } : (T.positions[k] || { demand: 0, supply: 0 });
      const wl = k === "food" ? want.food[id] : want[k][id];
      if (wl > 1e-4 && T.worldImportCapRaw > 0) {
        const q = Math.min(wl, Math.max(0, P.demand) * T.worldImportCapRaw);
        if (q > 1e-4) { flows.push({ s: -1, b: id, k, q, t: q * (SEA.tonsPerUnit[k] || 0), m: "world", d: 0, r: "cheapest", via }); if (k === "food") want.food[id] -= q; else want[k][id] -= q; }
      }
      const ol = offer[k][id];
      if (ol > 1e-4 && (T.worldExportCapRaw > 0 || k === "gold")) {
        const q = k === "gold" ? ol : Math.min(ol, Math.max(P.supply || 0, 0.5) * T.worldExportCapRaw);
        if (q > 1e-4) { flows.push({ s: id, b: -1, k, q, t: q * (SEA.tonsPerUnit[k] || 0), m: "world", d: 0, r: "cheapest", via }); offer[k][id] -= q; }
      }
    }
  }

  /* 5. Round and store; what nobody could sell or buy is kept so a new link can be valued */
  const out = [];
  for (const f of flows) {
    const q = sr(f.q, 4);
    if (q < 1e-4) continue;
    out.push({ ...f, q, t: sr(f.t, 3) });
  }
  for (const k of TRADE_GOODS) if (natLeft[k]) for (const id of ids) { offer[k][id] = Math.min(offer[k][id], natLeft[k].o[id]); want[k][id] = Math.min(want[k][id], natLeft[k].wn[id]); }
  const round = o => { const r = {}; for (const k in o) r[k] = o[k].map(v => sr(Math.max(0, v), 4)); return r; };
  const pairs = {};
  for (const f of out) if (f.s >= 0 || f.b >= 0) { const pk = `${f.s}>${f.b}`; pairs[pk] = (pairs[pk] || 0) + f.q * GOODS[f.k].price; }
  const hist = (old.hist || []).concat([{ turn: g.turn, v: Object.entries(pairs).map(([pk, v]) => { const [s, b] = pk.split(">").map(Number); return [s, b, sr(v, 3)]; }) }]).slice(-TRADE.histKeep);
  return { v: 1, turn: g.turn, flows: out, links, need: round(need), unsold: round(offer), unmet: round(want), hist };
}

/* ---------- News from the new contracts: only what matters to a nation (a key good, a real share of output) ---------- */
function tradeNews(w, g, old, book, econs) {
  const news = [];
  const P = PLAYER, E = econs[P];
  if (!E || !g.nations[P].alive) return news;
  const gdp = Math.max(1, E.gdp);
  const sum = (flows, pred) => { const r = {}; for (const f of flows) if (pred(f)) { const k = `${f.s}|${f.k}`; r[k] = (r[k] || 0) + f.q; } return r; };
  const before = sum(old.flows || [], f => f.b === P && f.s >= 0), after = sum(book.flows, f => f.b === P && f.s >= 0);
  const worth = (k, q) => q * GOODS[k].price * priceOf(g, k);
  const byPartner = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const [s, k] = key.split("|"); const sid = Number(s);
    const d = (after[key] || 0) - (before[key] || 0);
    const big = worth(k, Math.abs(d)) / gdp >= 0.005 || (TRADE.key.includes(k) && Math.abs(d) / Math.max(0.01, E.goods.demand[k] || E.pop) >= 0.2);
    if (!big) continue;
    (byPartner[sid] || (byPartner[sid] = [])).push({ k, d, q: after[key] || 0 });
  }
  for (const sid of Object.keys(byPartner).map(Number).sort((a, b) => a - b)) {
    const xs = byPartner[sid];
    const gained = xs.filter(x => x.d > 0), lost = xs.filter(x => x.d < 0);
    const name = nameOf(g, sid);
    if (gained.length) news.push({ text: `Our merchants now buy ${bJoin(gained.map(x => GOODS[x.k].label.toLowerCase()))} from the ${name}.`, tone: "good", nid: sid, minister: "economy" });
    if (lost.length) {
      const code = tradeBlocked(g, sid, P, lost[0].k);
      const why = code ? ` (${tradeBlockedText(g, code, sid, P, lost[0].k)})` : "";
      news.push({ text: `We buy less ${bJoin(lost.map(x => GOODS[x.k].label.toLowerCase()))} from the ${name}${why}.`, tone: lost.some(x => TRADE.key.includes(x.k)) ? "warn" : "neutral", nid: sid, minister: lost.some(x => x.k === "food") ? "agriculture" : "economy" });
    }
  }
  // famine relief reaching us, or our grain feeding a hungry neighbor
  for (const f of book.flows) if (f.r === "relief" && (f.b === P || f.s === P)) news.push({ text: f.b === P ? `The ${nameOf(g, f.s)} sells us grain while our harvest is short: enough for ${fmtPeople(f.q)} people.` : `Our farms sell grain to the hungry ${nameOf(g, f.b)}: enough for ${fmtPeople(f.q)} people.`, tone: "good", nid: f.b === P ? f.s : f.b, minister: "agriculture" });
  return news.slice(0, 4);
}

/* ---------- Reading the book: what a nation trades, with whom, and how much it depends on them ---------- */
/* Every partner and every good, as the book stands now (a contract an embargo or war has cut shows as blocked). */
function tradeOf(g, nid) {
  const ix = tradeIndex(g);
  const partners = {}, goods = {};
  const world = { buyV: 0, sellV: 0, open: false };
  const P = id => partners[id] || (partners[id] = { nid: id, sellV: 0, buyV: 0, sell: {}, buy: {}, mode: null, blocked: null });
  const need = k => (g.trade && g.trade.need && g.trade.need[k] ? g.trade.need[k][nid] || 0 : 0);
  for (const k of TRADE_GOODS) {
    const from = [], to = [];
    for (const f of (ix.into[nid] || {})[k] || []) {
      const code = tradeBlocked(g, f.s, nid, k), v = f.q * GOODS[k].price * priceOf(g, k);
      if (f.s < 0) { world.buyV += v; world.open = true; } else { const p = P(f.s); if (!code) { p.buyV += v; p.buy[k] = (p.buy[k] || 0) + f.q; } p.mode = f.m; if (code) p.blocked = code; }
      from.push({ nid: f.s, q: f.q, v, m: f.m, r: f.r, code, share: need(k) > 0 ? f.q / need(k) : 0 });
    }
    for (const f of (ix.outOf[nid] || {})[k] || []) {
      const code = tradeBlocked(g, nid, f.b, k), v = f.q * GOODS[k].price * priceOf(g, k);
      if (f.b < 0) { world.sellV += v; world.open = true; } else { const p = P(f.b); if (!code) { p.sellV += v; p.sell[k] = (p.sell[k] || 0) + f.q; } p.mode = f.m; if (code) p.blocked = code; }
      const theirNeed = f.b >= 0 && g.trade.need[k] ? g.trade.need[k][f.b] || 0 : 0;
      to.push({ nid: f.b, q: f.q, v, m: f.m, code, share: theirNeed > 0 ? f.q / theirNeed : 0 });
    }
    if (from.length || to.length) goods[k] = { from: from.sort((a, b) => b.q - a.q), to: to.sort((a, b) => b.q - a.q) };
  }
  return { partners: Object.values(partners).sort((a, b) => (b.sellV + b.buyV) - (a.sellV + a.buyV)), goods, world };
}
/* Trade between two nations, in both directions. */
function tradeWith(g, a, b) {
  const ix = tradeIndex(g);
  const side = (s, t) => {
    const o = {}; let v = 0;
    for (const k of TRADE_GOODS) for (const f of ((ix.outOf[s] || {})[k] || [])) {
      if (f.b !== t) continue;
      const need = g.trade.need[k] ? g.trade.need[k][t] || 0 : 0;
      const val = f.q * GOODS[k].price * priceOf(g, k);
      const code = tradeBlocked(g, s, t, k);
      o[k] = { q: f.q, v: val, shareOfNeed: need > 0 ? f.q / need : 0, blocked: code };
      if (!code) v += val;
    }
    return { o, v };
  };
  const A = side(a, b), B = side(b, a);
  const E = (g.trade && g.trade.embargoes || []).filter(e => (e.by === a && e.on === b) || (e.by === b && e.on === a));
  const promise = (g.trade && g.trade.promises || []).find(p => ((p.by === a && p.on === b) || (p.by === b && p.on === a)) && p.until > g.turn) || null;
  return { aSells: A.o, bSells: B.o, aSellsV: A.v, bSellsV: B.v, link: tradeLink(g, a, b), embargoes: E, promise };
}
/* Seller × buyer values, with the world as -1; contracts cut by an embargo or war are left out. */
function tradeMatrix(g, onlyK) {
  const M = {};
  for (const f of (g.trade && g.trade.flows) || []) {
    if (onlyK && f.k !== onlyK) continue;
    if (tradeBlocked(g, f.s, f.b, f.k)) continue;
    const v = f.q * GOODS[f.k].price * priceOf(g, f.k);
    const row = M[f.s] || (M[f.s] = {});
    const c = row[f.b] || (row[f.b] = { v: 0, goods: {} });
    c.v += v; c.goods[f.k] = (c.goods[f.k] || 0) + v;
  }
  return M;
}
/* How much of good k a nation gets from each seller, as a share of what it needs. */
function dependence(g, nid, k) {
  const ix = tradeIndex(g);
  const need = g.trade && g.trade.need && g.trade.need[k] ? g.trade.need[k][nid] || 0 : 0;
  const out = [];
  for (const f of ((ix.into[nid] || {})[k] || [])) if (f.s >= 0) out.push({ from: f.s, q: f.q, share: need > 0 ? Math.min(1, f.q / need) : 0 });
  return out.sort((a, b) => b.share - a.share);
}

/* Why merchants bought from whom: every seller we can reach, and the world, with the price at our border and
   why we did not buy more from it. The same table for buyers of our goods. */
function tradeOffers(w, g, nid, k) {
  const T = g.trade;
  if (!T) return { sellers: [], buyers: [] };
  const ix = tradeIndex(g), sellers = [], buyers = [];
  const bought = {}, sold = {};
  for (const f of ((ix.into[nid] || {})[k] || [])) bought[f.s] = (bought[f.s] || 0) + f.q;
  for (const f of ((ix.outOf[nid] || {})[k] || [])) sold[f.b] = (sold[f.b] || 0) + f.q;
  for (const n of liveNations(g)) {
    if (n.id === nid) continue;
    const L = tradeLink(g, nid, n.id);
    const code = tradeBlocked(g, n.id, nid, k), codeOut = tradeBlocked(g, nid, n.id, k);
    if (!L && !bought[n.id] && !sold[n.id]) continue;
    const pIn = L ? deliveredPrice(g, k, n.id, nid, L.m, L.d) : null;
    const offered = (T.unsold[k] ? T.unsold[k][n.id] || 0 : 0) + (bought[n.id] || 0);
    let whyNot = null;
    if (code) whyNot = tradeBlockedText(g, code, n.id, nid, k);
    else if (!L) whyNot = "no route between us";
    else if (offered <= 1e-4) whyNot = "they have none to sell";
    else if ((T.unsold[k] ? T.unsold[k][n.id] || 0 : 0) > 1e-4 && (T.unmet[k] ? T.unmet[k][nid] || 0 : 0) > 1e-4) whyNot = "the route is full";
    sellers.push({ nid: n.id, link: L ? L.m : null, d: L ? L.d : 0, price: pIn, offered, bought: bought[n.id] || 0, whyNot, preferred: (T.prefer || []).some(x => x.by === nid && x.k === k && x.from === n.id) });
    const wanted = (T.unmet[k] ? T.unmet[k][n.id] || 0 : 0) + (sold[n.id] || 0);
    let whyNotOut = null;
    if (codeOut) whyNotOut = tradeBlockedText(g, codeOut, nid, n.id, k);
    else if (!L) whyNotOut = "no route between us";
    else if (wanted <= 1e-4) whyNotOut = "they need none";
    buyers.push({ nid: n.id, link: L ? L.m : null, wanted, sold: sold[n.id] || 0, whyNot: whyNotOut });
  }
  const econ = computeEconomy(w, g, nid);
  const wp = deliveredPrice(g, k, -1, nid, "world", 0);
  sellers.push({ nid: -1, link: "world", d: 0, price: wp, offered: econ.trade.worldImportCapRaw > 0 ? Infinity : 0, bought: bought[-1] || 0, whyNot: econ.trade.worldImportCapRaw > 0 ? null : "the world market is closed to us: we need a harbor on the ocean or a trade partner who has one", preferred: false });
  buyers.push({ nid: -1, link: "world", wanted: econ.trade.worldExportCapRaw > 0 || k === "gold" ? Infinity : 0, sold: sold[-1] || 0, whyNot: econ.trade.worldExportCapRaw > 0 || k === "gold" ? null : "the world market is closed to us" });
  sellers.sort((a, b) => b.bought - a.bought || (a.price ? a.price.p : 99) - (b.price ? b.price.p : 99));
  buyers.sort((a, b) => b.sold - a.sold);
  return { sellers, buyers };
}

/* Where a nation's trade is at risk: a key good bought mostly from one nation, that nation's mood towards us, an
   embargo in force. Shown only when losing it would really hurt: half a percent of output, or a fifth of the need
   of a key good. `cheap` skips anything that would work out an economy. */
function tradeRisks(w, g, nid, econ, opts = {}) {
  const out = [];
  const T = g.trade;
  if (!T || !g.nations[nid] || !g.nations[nid].alive) return out;
  const gdp = Math.max(1, econ ? econ.gdp : (g.nations[nid].history.slice(-1)[0] || {}).gdp || 1);
  for (const k of TRADE_GOODS) {
    for (const d of dependence(g, nid, k)) {
      const v = d.q * GOODS[k].price * priceOf(g, k);
      const lossPct = v / gdp;
      const keyDrop = TRADE.key.includes(k) ? d.share : 0;
      if (lossPct < 0.005 && keyDrop < 0.2) continue;
      const code = tradeBlocked(g, d.from, nid, k);
      const op = opinionDetail(g, d.from, nid).value;
      const intel = nid === PLAYER && g.intel ? (g.intel[d.from] || {}).level || 0 : 0;
      let level = d.share >= 0.6 || keyDrop >= 0.5 ? 1 : 0;
      if (code || op <= -40 || intel >= 2) level = 2;
      const why = [];
      why.push(`${pct(d.share)} of our ${GOODS[k].label.toLowerCase()} comes from them`);
      if (code) why.push(`cut now: ${tradeBlockedText(g, code, d.from, nid, k)}`);
      if (op <= -20) why.push(`they are ${opinionLabel(op).toLowerCase()} towards us (${signed(op)})`);
      if (intel >= 2) why.push("our generals expect them to attack");
      const others = liveNations(g).filter(z => z.id !== nid && z.id !== d.from && tradeLink(g, nid, z.id) && (T.unsold[k] ? T.unsold[k][z.id] || 0 : 0) > 0.01).map(z => z.id);
      const worldOpen = (econ && econ.trade && econ.trade.worldImportCapRaw > 0) || (T.flows || []).some(f => f.s === -1 && f.b === nid);
      why.push(others.length ? `others could sell to us: ${bJoin(others.map(id => `the ${nameOf(g, id)}`))}` : worldOpen ? "the world market could make up part of it, at a higher price" : "nobody else we can reach sells it");
      out.push({ k, from: d.from, share: d.share, level, lossPct, keyDrop, text: `${GOODS[k].label}: ${pct(d.share)} from the ${nameOf(g, d.from)}`, why });
    }
  }
  return out.sort((a, b) => b.level - a.level || b.share - a.share);
}

/* Nations we cannot trade with yet, and what would open a route: a trade road, a harbor, a trade agreement. */
function tradeOpportunities(w, g, nid) {
  const out = [];
  const econ = computeEconomy(w, g, nid);
  const hasOcean = !!mainOceanPort(w, g, nid);
  for (const z of liveNations(g)) {
    if (z.id === nid) continue;
    const L = tradeLink(g, nid, z.id);
    const item = { nid: z.id, link: L ? L.m : null, gap: gap(w, g, nid, z.id), ideas: [] };
    if (atWar(g, nid, z.id)) { item.ideas.push({ kind: "war", text: "We are at war." }); out.push(item); continue; }
    if (!hasTreaty(g, nid, z.id, "trade")) item.ideas.push({ kind: "treaty", text: L ? "A trade agreement would end import taxes between us and bring their buyers into our market." : "A trade agreement would let roads cross their land and bring their buyers into our market." });
    if ((!L || L.m === "over") && item.gap <= BUILD.roadMaxReach * 1.4) {
      // a trade road needs a trade agreement; what it would cost once there is one
      const treaty = hasTreaty(g, nid, z.id, "trade") || hasTreaty(g, nid, z.id, "alliance");
      const q = bestTradeRoad(w, treaty ? g : hypothetical(g, { treaty: { type: "trade", a: nid, b: z.id } }), nid, z.id);
      if (q && q.ok) item.ideas.push({ kind: "road", text: `${treaty ? "" : "With a trade agreement, "}a trade road from ${q.from ? q.from.name : "our nearest town"} to ${q.to ? q.to.name : "their nearest town"} (${fmtMoney(q.cost)}, ${q.seasons} seasons) would carry ${TRADE.roadMt} million tons a year.`, quote: treaty ? q : null, needsTreaty: !treaty });
    }
    if (!hasOcean && mainOceanPort(w, g, z.id)) item.ideas.push({ kind: "port", text: "A harbor on the ocean would open the sea lane to them, and the world market." });
    out.push(item);
  }
  return { open: !!(econ.trade && econ.trade.open), worldOpen: !!(econ.trade && econ.trade.worldImportCapRaw > 0), list: out };
}

/* What another trade law would do: imports, exports, import taxes and the people's mood. */
function tradeLawPreview(w, g, nid, value) {
  const n = g.nations[nid];
  const base = computeEconomy(w, g, nid);
  const n2 = { ...n, laws: { ...n.laws, trade: value } };
  const g2 = { ...g, nations: g.nations.map(z => (z.id === nid ? n2 : z)) };
  const after = computeEconomyRaw(w, g2, nid);
  const L0 = TRADE_LAWS[n.laws.trade || "balanced"], L1 = TRADE_LAWS[value];
  return {
    dGdp: after.gdp - base.gdp, dImports: after.importBill - base.importBill, dExports: after.exportValue - base.exportValue,
    tariffsNow: base.trade.tariffBase * L0.tariff / 4, tariffsThen: after.trade.tariffBase * L1.tariff / 4,
    stab: L1.stab - L0.stab,
  };
}

/* ---------- Embargoes: one nation stops selling to, or buying from, another ---------- */
function embargoesBy(g, by, on) { return ((g.trade && g.trade.embargoes) || []).filter(e => e.by === by && (on === undefined || e.on === on)); }
function embargoesOn(g, on) { return ((g.trade && g.trade.embargoes) || []).filter(e => e.on === on); }
function embargoLabel(g, e) {
  const good = e.k === "all" ? null : GOODS[e.k].label.toLowerCase();
  if (e.k === "all") return e.dir === "buy" ? "Stopped buying anything from us" : e.dir === "sell" ? "Stopped selling us anything" : "Cut off all trade with us";
  return e.dir === "buy" ? `Stopped buying our ${good}` : e.dir === "sell" ? `Stopped selling us ${good}` : `Cut off all trade in ${good}`;
}
/* "stopped selling oil to", for news about a nation: the object (the target) follows. */
function embargoVerb(e) {
  const good = e.k === "all" ? null : GOODS[e.k].label.toLowerCase();
  if (e.k === "all") return e.dir === "buy" ? "stopped buying anything from" : e.dir === "sell" ? "stopped selling anything to" : "cut off all trade with";
  return e.dir === "buy" ? `stopped buying ${good} from` : e.dir === "sell" ? `stopped selling ${good} to` : `stopped all trade in ${good} with`;
}
/* What an embargo would do, worked out on a copy of the world: this season (no other sellers yet) and later (once
   merchants find others). For both sides: output, the goods that matter for armies and food, opinion. */
function embargoPreview(w, g, by, on, k, dir, food) {
  const e = { id: -1, by, on, k, dir, since: g.turn, why: "preview", hurt: 0, answers: null, food: !!food };
  const base = { by: computeEconomy(w, g, by), on: computeEconomy(w, g, on) };
  const h = hypothetical(g, { embargo: e, noReroute: true });   // this season: no other sellers found yet
  const now = { by: computeEconomyRaw(w, h, by), on: computeEconomyRaw(w, h, on) };
  const hl = hypothetical(g, { embargo: e });                    // later: merchants look for other sellers and buyers
  const later = { by: computeEconomyRaw(w, hl, by), on: computeEconomyRaw(w, hl, on) };
  const fuel = E => E.fuelSat ?? 1, arms = E => E.armsSat ?? 1, foodR = E => (E.pop > 0 ? 1 - E.famineShare : 1);
  const theirSat = {};
  for (const g2 of TRADE_GOODS) {
    if (g2 === "food") continue;
    const b0 = base.on.sat[g2] ?? 1, a0 = now.on.sat[g2] ?? 1;
    if (Math.abs(a0 - b0) > 0.01) theirSat[g2] = [b0, a0, later.on.sat[g2] ?? 1];
  }
  const lossThem = Math.max(0, base.on.gdp - now.on.gdp), lossUs = base.by.gdp - now.by.gdp;
  const keyDrop = Math.max(fuel(base.on) - fuel(now.on), arms(base.on) - arms(now.on), foodR(base.on) - foodR(now.on), 0);
  const hurt = sr(100 * lossThem / Math.max(1, base.on.gdp) + 6 * keyDrop, 2);
  const ev = -clamp(6 + 3 * hurt, 6, 20);
  const standing = -clamp(3 + 2 * hurt, 3, 15);
  const op0 = opinionDetail(g, on, by).value;
  const treaty = hasTreaty(g, by, on, "trade"), ally = hasTreaty(g, by, on, "alliance");
  const endsTreaty = (k === "all" || dir === "both") && (treaty || ally);
  const extra = !endsTreaty && treaty ? -5 : 0;
  const allyHit = ally ? (k === "all" ? -50 : -10) : 0;
  const promise = ((g.trade && g.trade.promises) || []).find(p => p.by === by && p.on === on && p.until > g.turn) || null;
  const op1 = clamp(op0 + ev + standing + extra + allyHit + (promise ? -50 : 0) + (endsTreaty && treaty ? -10 - 10 : 0), -100, 100);
  const lines = [];
  const money = x => `${x >= 0 ? "" : "−"}${fmtMoney(Math.abs(x))}`;
  lines.push({ label: `Our output a year`, value: money(-lossUs) });
  lines.push({ label: `Their output a year`, value: money(-lossThem) });
  for (const [g2, [b0, a0, l0]] of Object.entries(theirSat)) lines.push({ label: `Their ${GOODS[g2].label.toLowerCase()}: share of need met`, value: `${pct(b0)} → ${pct(a0)}${Math.abs(l0 - a0) > 0.02 ? ` (later ${pct(l0)})` : ""}` });
  if (fuel(base.on) - fuel(now.on) > 0.01) lines.push({ label: "Fuel for their army", value: `${pct(fuel(base.on))} → ${pct(fuel(now.on))}` });
  if (arms(base.on) - arms(now.on) > 0.01) lines.push({ label: "Metal and parts for their arms factories", value: `${pct(arms(base.on))} → ${pct(arms(now.on))}` });
  if (foodR(base.on) - foodR(now.on) > 0.01) lines.push({ label: "Their people fed", value: `${pct(foodR(base.on))} → ${pct(foodR(now.on))}` });
  lines.push({ label: "Their opinion of us", value: `${signed(op0)} ${opinionLabel(op0)} → ${signed(op1)} ${opinionLabel(op1)}` });
  const warWish = Math.round(Math.max(0, op0 - op1) / 5);
  if (warWish > 0) lines.push({ label: "Their wish for war with us", value: `+${warWish}` });
  if (endsTreaty) lines.push({ label: ally ? "Our alliance" : "Our trade agreement", value: ally ? "broken (every nation will see it)" : "ended" });
  if (promise) lines.push({ label: "Our promise not to do this", value: "broken (every nation will see it)" });
  return { lines, dGdpSelf: -lossUs, dGdpThem: -lossThem, theirSat, fuel: [fuel(base.on), fuel(now.on)], arms: [arms(base.on), arms(now.on)], food: [foodR(base.on), foodR(now.on)],
    hurt, keyDrop, lostSales: Math.max(0, base.by.exportValue - now.by.exportValue), opinion: { before: op0, after: op1, word: opinionLabel(op1) }, warWish, endsTreaty, breaksPromise: !!promise,
    later: { dGdpThem: later.on.gdp - base.on.gdp, dGdpSelf: later.by.gdp - base.by.gdp } };
}
/* Can `by` declare this embargo now? A reason if not. */
function embargoBlock(g, by, on, k, dir) {
  if (by === on) return "Not on ourselves.";
  const B = g.nations[by], O = g.nations[on];
  if (!B || !O || !B.alive || !O.alive) return "That nation is gone.";
  if (atWar(g, by, on)) return "We are at war: no trade passes between us anyway.";
  if (k !== "all" && !GOODS[k]) return "Unknown good.";
  if (embargoesBy(g, by, on).some(e => (e.k === k || e.k === "all") && (e.dir === dir || e.dir === "both"))) return "That embargo is already in force.";
  const last = ((g.trade && g.trade.lastBy) || {})[`${by}>${on}`];
  if (last !== undefined && g.turn - last < TRADE.cooldown && !embargoesBy(g, on, by).length) return `We declared an embargo on them less than two years ago (${seasonLabel(last)}).`;
  return null;
}
/* Declare an embargo (player, rivals, ministers and deals all come here). */
function declareEmbargo(w, g, by, on, k, dir, why, opts = {}) {
  const T = ensureTrade(g);
  const block = embargoBlock(g, by, on, k, dir);
  if (block) return { ok: false, reason: block };
  const pv = opts.preview || embargoPreview(w, g, by, on, k, dir, opts.food);
  const e = { id: T.nextId++, by, on, k, dir, since: g.turn, why: why || "choice", hurt: pv.hurt, answers: opts.answers ?? null, food: !!opts.food };
  T.embargoes.push(e);
  T.lastBy = { ...(T.lastBy || {}), [`${by}>${on}`]: g.turn };
  bumpWorld(g);
  const label = embargoLabel(g, e);
  addMod(g, on, by, `embargo_by_${by}`, label, -clamp(6 + 3 * pv.hurt, 6, 20), 1, -20);
  // a full embargo ends the trade agreement; on an ally it breaks the alliance
  const treaty = treatiesBetween(g, by, on).find(t => t.type === "trade");
  const ally = treatiesBetween(g, by, on).find(t => t.type === "alliance");
  if (k === "all" || dir === "both") { if (treaty) endTreaty(g, treaty, by); if (ally && k === "all") endTreaty(g, ally, by); }
  else if (treaty) addMod(g, on, by, "embargo_spirit", "Broke the spirit of our trade agreement", -5, 0.5, -10);
  if (ally && k !== "all") addMod(g, on, by, "embargo_ally", "Turned on an ally's trade", -10, 0.5, -20);
  // a promise made when paid to lift: breaking it is breaking a treaty
  const pr = (T.promises || []).find(p => p.by === by && p.on === on && p.until > g.turn);
  if (pr) {
    T.promises = T.promises.filter(p => p !== pr);
    endTreaty(g, { id: -1, type: "trade", a: by, b: on }, null);
    addMod(g, on, by, "broke_treaty", "Broke its promise to keep trading", -50, 1, -80);
    for (const z of liveNations(g)) if (z.id !== by && z.id !== on) addMod(g, z.id, by, "faithless", "Breaks its treaties", -15, 0.5, -30);
  }
  // their allies take it badly; a food embargo on the hungry shocks everyone
  for (const a of alliesOf(g, on)) if (a !== by) addMod(g, a, by, "embargoed_ally", "Embargoed our ally", -3, 0.5, -6);
  if (opts.food || k === "food") {
    const E = computeEconomy(w, g, on);
    if (E.famineShare > 0.02) for (const z of liveNations(g)) if (z.id !== by && z.id !== on) addMod(g, z.id, by, "starved", `Let the ${nameOf(g, on)} go hungry`, -6, 0.5, -12);
  }
  // carrying out a threat of embargo counts like carrying out any threat
  if (g.commitments.some(c => c.by === by && c.against === on)) fulfilCommitment(g, by, on);
  const text = `The ${nameOf(g, by)} ${embargoVerb(e)} the ${nameOf(g, on)}${e.food && e.k === "all" ? " (food included)" : ""}.`;
  remember(g, on, `${nameOf(g, by)}: ${label.toLowerCase()}.`);
  remember(g, by, `We placed an embargo on ${nameOf(g, on)}.`);
  addChronicle(g, text, by === PLAYER || on === PLAYER ? "warn" : "neutral", by === PLAYER ? PLAYER : on === PLAYER ? PLAYER : null);
  if (on === PLAYER && by !== PLAYER) {
    g.inbox.push({ id: g.nextId++, from: by, kind: "embargo", terms: [], threat: false, turn: g.turn, expires: g.turn + 2, status: "info", text: opts.letter || `${label}. ${why === "retaliation" ? "You started this." : why === "pressure" ? "Until our claim is settled, our merchants will not deal with yours." : "Our merchants have their orders."}`, reason: why });
    (g.trade.pendingDecisions || (g.trade.pendingDecisions = [])).push({ by, k, dir, id: e.id });
  }
  return { ok: true, e, text };
}
/* Lift an embargo. Goodwill only if it lasted at least a year. */
function liftEmbargo(w, g, id, by, opts = {}) {
  const T = ensureTrade(g);
  const e = T.embargoes.find(x => x.id === id);
  if (!e) return { ok: false, reason: "No such embargo." };
  if (by !== undefined && e.by !== by) return { ok: false, reason: "Only the nation that declared it can lift it." };
  T.embargoes = T.embargoes.filter(x => x !== e);
  bumpWorld(g);
  const r = rel(g, e.on, e.by);
  if (g.turn - e.since >= TRADE.minEmbargo || opts.paid) {
    addMod(g, e.on, e.by, "embargo_lifted", "Lifted its embargo on us", 3, 0.5, 6);
    for (const m of r.mods) if (m.key === `embargo_by_${e.by}`) m.value /= 2;
  }
  // a retaliation ends when what it answered ends
  for (const x of T.embargoes.filter(x => x.answers === e.id)) x.answers = null;
  if (opts.paid) T.promises = (T.promises || []).filter(p => !(p.by === e.by && p.on === e.on)).concat([{ by: e.by, on: e.on, until: g.turn + TRADE.promise }]);
  const text = `The ${nameOf(g, e.by)} lifted its embargo on the ${nameOf(g, e.on)} (${e.k === "all" ? "all trade" : GOODS[e.k].label.toLowerCase()}).`;
  remember(g, e.on, `${nameOf(g, e.by)} lifted its embargo on us.`);
  addChronicle(g, text, e.by === PLAYER || e.on === PLAYER ? "good" : "neutral", e.by === PLAYER || e.on === PLAYER ? PLAYER : null);
  return { ok: true, text, e };
}
function setPreferredSeller(g, by, k, from) {
  const T = ensureTrade(g);
  T.prefer = (T.prefer || []).filter(x => !(x.by === by && x.k === k));
  if (from !== null && from !== undefined && from >= 0) {
    if (T.prefer.filter(x => x.by === by).length >= 3) return { ok: false, reason: "At most three preferred sellers." };
    T.prefer.push({ by, k, from });
  }
  return { ok: true };
}

/* ---------- Food aid: grain from one nation's reserve to a hungry nation ---------- */
function foodAidQuote(w, g, from, to, months) {
  const F = g.nations[from], T = g.nations[to];
  if (!F || !T || !F.alive || !T.alive || from === to) return { ok: false, reason: "No such nation." };
  if (atWar(g, from, to)) return { ok: false, reason: "We are at war with them." };
  const L = tradeLink(g, from, to);
  const ef = computeEconomy(w, g, from), et = computeEconomy(w, g, to);
  const worldBoth = ef.trade.worldImportCapRaw > 0 && et.trade.worldImportCapRaw > 0;
  if (!L && !worldBoth) return { ok: false, reason: "There is no route for grain between us: no border, caravan road or sea lane." };
  const stock = (F.granary && F.granary.stock) || 0;
  const keep = ef.pop / 12;   // the giver keeps at least a month for itself
  const gapNow = Math.max(0, et.trade.foodGap) / 4 + Math.max(0, et.granary ? et.granary.short : 0);
  const want = et.pop / 12 * months;
  const q = Math.min(want, Math.max(0, stock - keep));
  if (q <= 0.001) return { ok: false, reason: `Our reserve is too small: we keep at least a month (${fmtPeople(keep)} people-years) for ourselves.` };
  const recent = (g.trade.aid || []).some(a => a.from === from && a.to === to && g.turn - a.turn < 4);
  const opinion = clamp(3 + 7 * q / Math.max(0.01, gapNow || want), 3, 10);
  return { ok: true, q, months: q / Math.max(1e-6, et.pop / 12), famine: et.famineShare, opinion: recent ? 0 : opinion, recent };
}
function sendFoodAid(w, g, from, to, months) {
  const qt = foodAidQuote(w, g, from, to, months);
  if (!qt.ok) return qt;
  const T = ensureTrade(g);
  const F = g.nations[from], R = g.nations[to];
  F.granary.stock -= qt.q;
  R.granary = R.granary || { stock: 0 };
  R.granary.stock += qt.q;
  if (qt.opinion > 0) addMod(g, to, from, "sent_aid", "Sent us aid when we needed it", qt.opinion, 0.25, 20);
  T.aid = (T.aid || []).concat([{ turn: g.turn, from, to, q: sr(qt.q, 4) }]).slice(-TRADE.aidKeep);
  bumpWorld(g);
  const text = `The ${nameOf(g, from)} sent grain to the ${nameOf(g, to)}: food for ${fmtPeople(qt.q * 12 / Math.max(1e-6, qt.months))} people for ${qt.months.toFixed(1)} months.`;
  remember(g, to, `${nameOf(g, from)} sent us grain when we were hungry.`);
  addChronicle(g, text, from === PLAYER || to === PLAYER ? "good" : "neutral", from === PLAYER || to === PLAYER ? PLAYER : null);
  return { ok: true, text, ...qt };
}

/* ---------- Dead nations: their contracts, embargoes and promises go with them ---------- */
function tradeForgetDead(g) {
  const T = g.trade;
  if (!T) return;
  const alive = id => id < 0 || (g.nations[id] && g.nations[id].alive);
  T.embargoes = (T.embargoes || []).filter(e => alive(e.by) && alive(e.on));
  T.promises = (T.promises || []).filter(p => alive(p.by) && alive(p.on));
  T.prefer = (T.prefer || []).filter(p => alive(p.by) && alive(p.from));
}

/* ---------- Inside a nation's economy: its links to other nations and to the world (read from the game only) ---------- */
function oceanHarborOf(w, g, nid) {
  return g.cities.some(c => c.owner === nid && c.port && !(g.occ && g.occ[c.cell] >= 0) && oceanPort(w, c) && (!g.sea || portUsableBy(w, g, c, nid)));
}
function tradeLinksOf(w, g, nid, TB, networks, regions, bEdges, roadsTo, cities, anyPort, WB, tradeLaw) {
  const capCity = cities.find(c => c.capital) || cities[0];
  const capOf = id => { const c = g.cities.find(x => x.owner === id && x.capital) || g.cities.find(x => x.owner === id); return c ? c.cell : null; };
  const landView = {};
  for (let o = 0; o < g.nations.length; o++) {
    if (o === nid || !g.nations[o] || !g.nations[o].alive) continue;
    const viaRoad = networks.some(net => net.touches.has(o)) && !bEdges[o] && !roadsTo[o];   // reached along roads through a partner's land
    if (!bEdges[o] && !roadsTo[o] && !viaRoad) continue;
    const oc = capOf(o);
    const cap = (bEdges[o] ? clamp(TRADE.borderMtPerEdge * bEdges[o], TRADE.borderMtMin, TRADE.borderMtMax) : 0) + TRADE.roadMt * (roadsTo[o] || (viaRoad ? 1 : 0));
    landView[o] = { cap, d: oc !== null ? dist(capCity.cell, oc) * 50 : 500, cross: null };
  }
  const ownOcean = networks.some(net => net.seaPort);
  const links = {};
  for (const o in landView) links[o] = { m: "land", cap: landView[o].cap, d: landView[o].d };
  for (const key in TB.links) {
    const [a, b] = key.split("-").map(Number);
    if (a !== nid && b !== nid) continue;
    const o = a === nid ? b : a;
    if (links[o]) continue;
    const L = TB.links[key];
    if (L.m === "sea" && !(ownOcean && oceanHarborOf(w, g, o))) continue;
    if (L.m === "land") continue;   // a border that no longer exists
    links[o] = { m: L.m, cap: L.cap[nid < o ? 0 : 1], d: L.d };
  }
  // a new harbor reaches every nation that has one (the distance is guessed until the next contracts are signed)
  if (ownOcean) for (let o = 0; o < g.nations.length; o++) {
    if (o === nid || links[o] || !g.nations[o] || !g.nations[o].alive || !oceanHarborOf(w, g, o)) continue;
    const oc = capOf(o);
    links[o] = { m: "sea", cap: 999, d: oc !== null ? dist(capCity.cell, oc) * 50 * 1.4 : 3000 };
  }
  const accessRaw = (anyPort ? 0.5 + WB.access : 0) + (networks.some(x => x.partners.length) ? 0.3 : 0);
  const capNet = networks.find(x => x.capital && x.seaPort) || networks.find(x => x.seaPort);
  const transitNet = networks.find(x => x.partners.length);
  return {
    landView, links, ownOcean,
    mainPort: capNet ? capNet.seaPort.id : null, transit: !capNet && transitNet ? transitNet.partners[0] : null,
    seaFracRaw: accessRaw > 0 ? clamp((anyPort ? 0.5 + WB.access : 0) / accessRaw, 0, 1) : 0,
    worldImportCapRaw: accessRaw * tradeLaw.imports, worldExportCapRaw: accessRaw * 0.8 * tradeLaw.exports,
  };
}
function emptyTradeEcon() {
  return { open: false, canBuy: {}, canSell: {}, links: {}, landView: {}, importsFrom: {}, exportsTo: {}, cut: {}, positions: {}, foodGap: 0, foodOffer: 0, foodRelief: 0,
    worldImportCapRaw: 0, worldExportCapRaw: 0, seaMtWanted: 0, seaMtIn: 0, importCost: 0, tariffBase: 0, transportCost: 0, premiumCost: 0, mainPort: null, transit: null };
}

/* ---------- Inside a nation's economy: settling one good against the book ----------
   Contracts to other nations are delivered first (a contract is a promise), then the home market, then what is still
   short is bought: from contracted sellers (a contract is delivered in full), then the world market within its
   limits. When things have changed since the contracts were signed (a new road or harbor, an embargo, a war),
   merchants also strike quick deals with sellers who have goods nobody bought and buyers nobody served, within the
   route's capacity (`reroute`). The same rule holds in the real game and in every world imagined to weigh a choice,
   so a choice is valued by what it changes and nothing else; a "this season" preview leaves the quick deals out. */
function tradeShareOf(g, id) { return g.sea && g.sea.trade && g.sea.trade[id] ? g.sea.trade[id].share ?? 1 : 1; }
function tradeFlowCheck(w, g, C, f, other) {
  let code = tradeBlocked(g, f.s, f.b, f.k);
  if (!code && f.m === "sea") {
    if (!(other in C.harbor)) C.harbor[other] = oceanHarborOf(w, g, other);
    if (!C.TRD.ownOcean || !C.harbor[other]) code = "port";
  }
  return { code, factor: f.m === "sea" ? Math.min(tradeShareOf(g, C.nid), tradeShareOf(g, other)) : 1 };
}
function tradeCostIn(g, C, k, s, q, m, d) {
  const base = GOODS[k].price * priceOf(g, k);
  C.importBase += q * base;
  const tons = q * (SEA.tonsPerUnit[k] || 0);
  if (m === "land") C.transport += tons * TRADE.landT * (d / 50) / 1000;
  else if (m === "over") C.transport += tons * TRADE.overT * (d / 50) / 1000;
  else if (m === "sea") { C.seaMt += tons; C.seaMtIn += tons; }
  if (s < 0) { C.premium += q * base * TRADE.worldPremium; C.worldIn[k] = (C.worldIn[k] || 0) + q; C.seaMt += tons * C.TRD.seaFracRaw; C.seaMtIn += tons * C.TRD.seaFracRaw; }
  if (s < 0 || !hasTreaty(g, s, C.nid, "trade")) C.tariffBase += q * base;
}
function tradeCostOut(C, k, b, q, m) {
  const tons = q * (SEA.tonsPerUnit[k] || 0);
  if (m === "sea") C.seaMt += tons;
  if (b < 0) C.seaMt += tons * C.TRD.seaFracRaw;
}
/* Linked nations with goods left over (sellers) or a want left over (buyers), cheapest first. */
function tradeRerouteList(w, g, C, k, pool, out) {
  const L = [];
  const arr = C.TB[pool] && C.TB[pool][k];
  if (!arr) return L;
  for (const o in C.TRD.links) {
    const id = Number(o), q = arr[id] || 0;
    if (q <= 1e-4) continue;
    const s = out ? C.nid : id, b = out ? id : C.nid;
    if (tradeBlocked(g, s, b, k)) continue;
    const link = C.TRD.links[o];
    if (link.m === "sea" && !(C.TRD.ownOcean && oceanHarborOf(w, g, id))) continue;
    const used = (C.ix.pairT[`${s}>${b}`] || 0) + (C.extraT[`${s}>${b}`] || 0);
    const tons = SEA.tonsPerUnit[k] || 0;
    const room = tons > 0 ? Math.max(0, link.cap - used) / tons : Infinity;
    if (room <= 1e-4) continue;
    L.push({ id, q: Math.min(q, room), m: link.m, d: link.d, p: deliveredPrice(g, k, s, b, link.m, link.d).p });
  }
  return L.sort((a, b) => a.p - b.p || a.id - b.id);
}
function tradeSettle(w, g, C, k) {
  const { demand, supply, imports, exports, sat } = C;
  const dem = demand[k], sup = supply[k];
  const pos = C.trade.positions[k] = { demand: dem, supply: sup, short: Math.max(0, dem - sup), surplus: Math.max(0, sup - dem) };
  const into = (C.ix.into[C.nid] || {})[k] || [], outOf = (C.ix.outOf[C.nid] || {})[k] || [];
  const to = [], from = [], cut = [];
  // 1. contracts to other nations come first
  let avail = sup, ex = 0;
  for (const f of outOf) {
    if (f.b < 0) continue;
    const chk = tradeFlowCheck(w, g, C, f, f.b);
    if (chk.code) { cut.push({ to: f.b, q: f.q, code: chk.code }); continue; }
    const q = Math.min(f.q * chk.factor, avail);
    if (q <= 1e-6) continue;
    avail -= q; ex += q; to.push({ to: f.b, q, m: f.m, r: f.r });
    tradeCostOut(C, k, f.b, q, f.m);
  }
  // 2. contracted purchases from other nations arrive as agreed (if we now need less, the rest is wasted, not refused)
  let im = 0, natIm = 0;
  for (const f of into) {
    if (f.s < 0) continue;
    const chk = tradeFlowCheck(w, g, C, f, f.s);
    if (chk.code) { cut.push({ from: f.s, q: f.q, code: chk.code }); continue; }
    const q = f.q * chk.factor;
    if (q <= 1e-6) continue;
    im += q; natIm += q; from.push({ from: f.s, q, m: f.m, r: f.r });
    tradeCostIn(g, C, k, f.s, q, f.m, f.d);
  }
  // 3. the world market: what is still short, within the harbors' and partners' reach this season
  const short = Math.max(0, dem - avail);
  let left = Math.max(0, short - im);
  const wBook = into.filter(f => f.s < 0).reduce((s2, f) => s2 + f.q, 0);
  const wCap = Math.max(0, dem * C.importCapShare);
  let wq = Math.min(wBook, left, wCap);
  if (wq > 1e-6) { im += wq; left -= wq; from.push({ from: -1, q: wq, m: "world", r: "cheapest" }); tradeCostIn(g, C, k, -1, wq, "world", 0); }
  // 4. things have changed since the contracts: other sellers with goods to spare, then more from the world
  if (C.reroute && left > 1e-4) {
    let natRoom = Math.max(0, short * C.open.inN - natIm);
    for (const x of tradeRerouteList(w, g, C, k, "unsold", false)) {
      if (left <= 1e-4 || natRoom <= 1e-4) break;
      const q = Math.min(x.q, left, natRoom);
      im += q; left -= q; natRoom -= q;
      C.extraT[`${x.id}>${C.nid}`] = (C.extraT[`${x.id}>${C.nid}`] || 0) + q * (SEA.tonsPerUnit[k] || 0);
      from.push({ from: x.id, q, m: x.m, r: "new" });
      tradeCostIn(g, C, k, x.id, q, x.m, x.d);
    }
    const more = Math.min(left, Math.max(0, wCap - wq));
    if (more > 1e-4) { im += more; left -= more; wq += more; from.push({ from: -1, q: more, m: "world", r: "new" }); tradeCostIn(g, C, k, -1, more, "world", 0); }
  }
  imports[k] = im;
  sat[k] = dem > 1e-6 ? Math.min(1, (avail + im) / dem) : 1;
  // 5. what is left after home demand is sold to the world (gold: the world's banks take it all)
  let surplus = Math.max(0, avail - dem);
  const wsBook = outOf.filter(f => f.b < 0).reduce((s2, f) => s2 + f.q, 0);
  const wsCap = k === "gold" ? Infinity : Math.max(sup, 0.5) * C.exportCapShare;
  let ws = k === "gold" ? surplus : Math.min(wsBook, surplus, wsCap);
  if (ws > 1e-6) { ex += ws; surplus -= ws; to.push({ to: -1, q: ws, m: "world" }); tradeCostOut(C, k, -1, ws, "world"); }
  if (C.reroute && surplus > 1e-4 && k !== "gold") {
    let natRoom = Math.max(0, pos.surplus * C.open.outN - (ex - ws));
    for (const x of tradeRerouteList(w, g, C, k, "unmet", true)) {
      if (surplus <= 1e-4 || natRoom <= 1e-4) break;
      const q = Math.min(x.q, surplus, natRoom);
      ex += q; surplus -= q; natRoom -= q;
      C.extraT[`${C.nid}>${x.id}`] = (C.extraT[`${C.nid}>${x.id}`] || 0) + q * (SEA.tonsPerUnit[k] || 0);
      to.push({ to: x.id, q, m: x.m, r: "new" });
      tradeCostOut(C, k, x.id, q, x.m);
    }
    const more = Math.min(surplus, Math.max(0, wsCap - ws));
    if (more > 1e-4) { ex += more; surplus -= more; to.push({ to: -1, q: more, m: "world", r: "new" }); tradeCostOut(C, k, -1, more, "world"); }
  }
  exports[k] = ex;
  if (from.length) C.trade.importsFrom[k] = from;
  if (to.length) C.trade.exportsTo[k] = to;
  if (cut.length) C.trade.cut[k] = cut;
  C.trade.canBuy[k] = from.length > 0 || wCap > 0 || Object.keys(C.TRD.links).length > 0;
  C.trade.canSell[k] = to.length > 0 || wsCap > 0 || Object.keys(C.TRD.links).length > 0;
}

/* ---------- Inside a nation's economy: grain. Hungry towns are fed by grain bought abroad before the reserve is
   opened; farms grow grain for export only as far as it is sold. Grain reaches a town over its border, by caravan
   (the capital), by sea (a harbor on the ocean), or from the world market (any harbor or a trade partner). ---------- */
function tradeFoodPlan(w, g, C, networks, resNet, foodprocWant, mech) {
  let gapAll = 0, offerAll = 0, reliefAll = 0;
  const caravans = Object.values(C.TRD.links).some(L => L.m === "over" || L.m === "sea");
  for (const net of networks) {
    net.foodBase = net.pop * 1.02 + (net.capital ? foodprocWant : 0);
    net.entry = net.touches.size > 0 || !!net.seaPort || net.port || net.partners.length > 0 || (net.capital && caravans);
    net.gap0 = Math.max(0, net.pop - net.food);
    const room = TRADE.foodExport * clamp(mech / 0.4, 0, 1) * net.pop;
    net.offer = net.entry ? Math.min(Math.max(0, net.food - net.foodBase), room) : 0;
    net.relief = net.entry ? Math.min(Math.max(0, net.food - net.foodBase - net.offer), TRADE.foodRelief * net.pop) : 0;
    if (net.entry) gapAll += net.gap0;
    offerAll += net.offer; reliefAll += net.relief;
    net.foodIn = 0; net.foodOut = 0;
  }
  C.trade.foodGap = gapAll; C.trade.foodOffer = offerAll; C.trade.foodRelief = reliefAll;
  const canEnter = (net, m, other) => m === "land" ? net.touches.has(other) : m === "over" ? net.capital : m === "sea" ? !!net.seaPort : (!!net.seaPort || net.port || net.partners.length > 0);
  const k = "food", into = (C.ix.into[C.nid] || {}).food || [], outOf = (C.ix.outOf[C.nid] || {}).food || [];
  const from = [], to = [], cut = [], src = [];
  for (const f of into) {
    if (f.s < 0) continue;
    const chk = tradeFlowCheck(w, g, C, f, f.s);
    if (chk.code) { cut.push({ from: f.s, q: f.q, code: chk.code }); continue; }
    src.push({ m: f.m, other: f.s, q: f.q * chk.factor, d: f.d, r: f.r });
  }
  const wBook = into.filter(f => f.s < 0).reduce((s, f) => s + f.q, 0);
  const wCap = Math.max(0, gapAll * C.importCapShare);
  if (wBook > 1e-4) src.push({ m: "world", other: -1, q: Math.min(wBook, wCap), d: 0, r: "cheapest" });
  const assign = list => {
    for (const net of networks.slice().sort((a, b) => (b.gap0 - b.foodIn) - (a.gap0 - a.foodIn))) {
      for (const x of list) {
        const want = net.gap0 - net.foodIn;
        if (want <= 1e-6) break;
        if (x.q - (x.used || 0) <= 1e-6 || !canEnter(net, x.m, x.other)) continue;
        const q = Math.min(x.q - (x.used || 0), want);
        x.used = (x.used || 0) + q; net.foodIn += q;
      }
    }
  };
  assign(src);
  // things changed since the contracts: grain other linked nations have left over, then the world
  let still = networks.reduce((s, net) => s + Math.max(0, net.gap0 - net.foodIn), 0);
  if (C.reroute && still > 1e-4) {
    const extra = [];
    for (const x of tradeRerouteList(w, g, C, k, "unsold", false)) extra.push({ m: x.m, other: x.id, q: x.q, d: x.d, r: "new" });
    const wUsed = src.filter(x => x.m === "world").reduce((s, x) => s + x.q, 0);
    if (wCap - wUsed > 1e-4) extra.push({ m: "world", other: -1, q: wCap - wUsed, d: 0, r: "new" });
    assign(extra);
    for (const x of extra) if ((x.used || 0) > 1e-6) { x.q = x.used; src.push(x); }
  }
  // what was contracted arrives even where no town is short: the capital's market takes it
  let foodIn = 0;
  for (const x of src) {
    const q = x.r === "new" ? x.used || 0 : x.q;
    if (q <= 1e-6) continue;
    const spare = q - (x.used || 0);
    if (spare > 1e-6 && resNet) resNet.foodIn += spare;
    foodIn += q;
    from.push({ from: x.other, q, m: x.m, r: x.r });
    tradeCostIn(g, C, k, x.other, q, x.m, x.d);
  }
  // grain going out: contracts first (only from towns with grain to spare and a way out), then the world
  let foodOut = 0;
  const giveOut = (q, m, other) => {
    let left = q;
    for (const net of networks) {
      if (left <= 1e-6) break;
      if (!canEnter(net, m, other)) continue;
      const room = net.offer + net.relief - net.foodOut;
      const x = Math.min(room, left);
      if (x > 1e-6) { net.foodOut += x; left -= x; }
    }
    return q - left;
  };
  for (const f of outOf) {
    if (f.b < 0) continue;
    const chk = tradeFlowCheck(w, g, C, f, f.b);
    if (chk.code) { cut.push({ to: f.b, q: f.q, code: chk.code }); continue; }
    const q = giveOut(f.q * chk.factor, f.m, f.b);
    if (q > 1e-6) { foodOut += q; to.push({ to: f.b, q, m: f.m, r: f.r }); tradeCostOut(C, k, f.b, q, f.m); }
  }
  const wsBook = outOf.filter(f => f.b < 0).reduce((s, f) => s + f.q, 0);
  if (wsBook > 1e-4) {
    const cap = Math.max(0.5, offerAll) * C.exportCapShare;
    const q = giveOut(Math.min(wsBook, cap), "world", -1);
    if (q > 1e-6) { foodOut += q; to.push({ to: -1, q, m: "world" }); tradeCostOut(C, k, -1, q, "world"); }
  }
  if (from.length) C.trade.importsFrom.food = from;
  if (to.length) C.trade.exportsTo.food = to;
  if (cut.length) C.trade.cut.food = cut;
  C.trade.canBuy.food = from.length > 0 || wCap > 0 || Object.keys(C.TRD.links).length > 0;
  C.trade.canSell.food = to.length > 0 || C.exportCapShare > 0 || Object.keys(C.TRD.links).length > 0;
  return { foodIn, foodOut };
}
