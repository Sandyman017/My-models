/* =====================================================================
   16l. Trade in the panels: the Trade panel (what we sell and buy, to and from whom, why that seller, where we
        hang on one nation, embargoes, grain and aid, routes still to open), and trade in the Economy panel, the
        food card and the top bar. The panel only formats what the merchants' book (10s) and the economy say.
   ===================================================================== */
// worked out once per map version and season: seller tables, previews and route ideas cost a few economies each
const TRADE_UI_MEMO = { stamp: "", g: null, m: new Map() };
function tradeMemo(key, fn) {
  const stamp = `${mapVersion}|${game.ver || 0}|${game.turn}`;
  if (TRADE_UI_MEMO.stamp !== stamp || TRADE_UI_MEMO.g !== game) { TRADE_UI_MEMO.stamp = stamp; TRADE_UI_MEMO.g = game; TRADE_UI_MEMO.m.clear(); }
  if (!TRADE_UI_MEMO.m.has(key)) TRADE_UI_MEMO.m.set(key, withEconMemo(game, fn));
  return TRADE_UI_MEMO.m.get(key);
}
function tradeMemoClear() { TRADE_UI_MEMO.stamp = ""; }
function tradeBookReady() { return !!(game && game.trade && game.trade.v); }

/* ---------- Small words ---------- */
// how goods travel between us and another nation, from the link the merchants use
function tradeRouteWord(L) {
  if (!L) return "no route";
  const cap = Array.isArray(L.cap) ? Math.max(...L.cap) : L.cap;
  if (L.m === "land") return cap >= TRADE.roadMt ? "by road across the border" : "across the border";
  if (L.m === "over") return "caravans across wild land";
  if (L.m === "sea") return `by sea, ${Math.round(L.d).toLocaleString("en-US")} km`;
  return "the world market";
}
function tradeLinkOf(econ, id) { return (econ.trade.links && econ.trade.links[id]) || tradeLink(game, PLAYER, id); }
function tradeWho(id) { return id < 0 ? "World" : nameOf(game, id); }
// "Velmar 60%, World 40%": who a good comes from (or goes to), largest first
function tradeWhoShort(list, key, total, max = 2) {
  const by = new Map();
  for (const x of list || []) by.set(x[key], (by.get(x[key]) || 0) + x.q);
  const rows = [...by.entries()].filter(([, q]) => q > 1e-4).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const tot = total > 0 ? total : rows.reduce((s, r) => s + r[1], 0);
  const shown = rows.slice(0, max).map(([id, q]) => `${tradeWho(id)} ${pct(Math.min(1, q / Math.max(1e-6, tot)))}`);
  return shown.join(", ") + (rows.length > max ? ` +${rows.length - max}` : "");
}
// the goods in a {good: amount} list, by value: "metals, oil"
function tradeGoodsWords(o, max = 2) {
  const ks = Object.keys(o).filter(k => o[k] > 1e-4).sort((a, b) => goodWorth(game, b, o[b]) - goodWorth(game, a, o[a]));
  return ks.slice(0, max).map(goodWord).join(", ") + (ks.length > max ? ` +${ks.length - max}` : "");
}

/* ---------- The Trade panel ---------- */
function tradeTabHtml() {
  if (!tradeBookReady()) return `<p class="muted">The merchants sign their first contracts when the first season ends.</p>`;
  const econ = economies()[PLAYER];
  return tradeEmbargoFlowHtml() + tradeTilesHtml(econ) + tradeRisksHtml(econ) + tradePartnersHtml(econ) + tradeGoodsHtml(econ)
    + tradeEmbargoesHtml() + tradeFoodHtml(econ) + tradeOpeningHtml() + tradePolicyHtml();
}

function tradeTilesHtml(econ) {
  const T = econ.trade, of = tradeOf(game, PLAYER);
  const live = of.partners.filter(p => p.sellV + p.buyV > 0.0005);
  const bal = econ.exportValue - econ.importBill;
  const costs = (T.transportCost || 0) + (T.premiumCost || 0) + (econ.freightFees || 0);
  const linked = Object.keys(T.links || {}).length;
  const world = T.worldImportCapRaw > 0;
  return `<div class="stats-grid">
      <div class="stat-cell"><span class="k">Imports</span><span class="v">${fmtMoney(econ.importBill)}</span><span class="muted small">a year, at world prices</span></div>
      <div class="stat-cell"><span class="k">Exports</span><span class="v">${fmtMoney(econ.exportValue)}</span><span class="muted small">a year</span></div>
      <div class="stat-cell"><span class="k">Trade balance</span><span class="v tone-${toneOf(bal, 0.05)}">${fmtSignedMoney(bal)}</span><span class="muted small">exports minus imports</span></div>
      <div class="stat-cell"><span class="k">Getting goods here</span><span class="v">${fmtMoneyFine(costs)}</span><span class="muted small">transport, middlemen, foreign ships · a year</span></div>
    </div>
    <p class="muted small">We trade with ${live.length ? `${live.length} nation${live.length > 1 ? "s" : ""}` : "no nation yet"}; our merchants can reach ${linked} · the world market beyond the map is <span class="tone-${world ? "good" : "warn"}">${world ? "open" : "closed"}</span> to us${world ? "" : " (it needs a harbor on the ocean, or a trade partner who has one)"}.</p>`;
}

/* Where losing one seller would hurt: the engine's own list (10s tradeRisks). */
function tradeRisksHtml(econ) {
  const risks = tradeRisks(world, game, PLAYER, econ, { cheap: true }).slice(0, 4);
  if (!risks.length) return "";
  const rows = risks.map(r => `<div class="row"><span><span class="tone-${r.level >= 2 ? "bad" : r.level ? "warn" : "neutral"}">${escapeHtml(r.text)}</span><span class="sub">${escapeHtml(capFirstLetter(r.why.join("; ")))}</span></span><span class="num">${fmtMoneyFine(r.lossPct * Math.max(1, econ.gdp))}</span></div>`).join("");
  return `<div class="block"><span class="eyebrow">Where we depend on one nation</span><div class="rows">${rows}</div></div>`;
}

/* Every nation we trade with or can reach, and the world: what goes each way, a year. Click one for the goods. */
function tradePartnersHtml(econ) {
  const of = tradeOf(game, PLAYER), T = econ.trade;
  const ids = new Set(of.partners.map(p => p.nid));
  for (const o of Object.keys(T.links || {})) ids.add(Number(o));
  const byId = Object.fromEntries(of.partners.map(p => [p.nid, p]));
  const list = [...ids].filter(id => game.nations[id] && game.nations[id].alive && id !== PLAYER)
    .sort((a, b) => ((byId[b] ? byId[b].sellV + byId[b].buyV : 0) - (byId[a] ? byId[a].sellV + byId[a].buyV : 0)) || a - b);
  if (ui.tradeOpen != null && ui.tradeOpen >= 0 && !list.includes(ui.tradeOpen)) ui.tradeOpen = null;
  const row = id => {
    const p = byId[id] || { sellV: 0, buyV: 0, sell: {}, buy: {} }, z = game.nations[id], open = ui.tradeOpen === id;
    const tags = [];
    if (atWar(game, PLAYER, id)) tags.push(`<span class="tone-bad">at war</span>`);
    if (embargoesBy(game, PLAYER, id).length || embargoesBy(game, id, PLAYER).length) tags.push(`<span class="tone-bad">embargo</span>`);
    if (hasTreaty(game, PLAYER, id, "trade")) tags.push(`<span class="tone-good">trade agreement</span>`);
    return `<button class="trade-row ${open ? "on" : ""}" type="button" data-action="trade-partner" data-nid="${id}" aria-expanded="${open}" style="--c:${z.color}">
      <span class="swatch"></span>
      <span class="tr-main"><strong>${escapeHtml(z.name)}</strong><span class="muted small">${escapeHtml(tradeRouteWord(tradeLinkOf(econ, id)))}${tags.length ? ` · ${tags.join(" · ")}` : ""}</span></span>
      <span class="tr-num">${p.sellV > 0.0005 ? `<span class="num">${fmtMoneyFine(p.sellV)}</span><span class="small muted">${escapeHtml(tradeGoodsWords(p.sell))}</span>` : `<span class="muted">—</span>`}</span>
      <span class="tr-num">${p.buyV > 0.0005 ? `<span class="num">${fmtMoneyFine(p.buyV)}</span><span class="small muted">${escapeHtml(tradeGoodsWords(p.buy))}</span>` : `<span class="muted">—</span>`}</span>
    </button>${open ? tradePartnerHtml(id, econ) : ""}`;
  };
  const W = of.world, wOpen = T.worldImportCapRaw > 0 || W.open;
  const wSell = {}, wBuy = {};
  for (const k in of.goods) { for (const x of of.goods[k].to) if (x.nid < 0) wSell[k] = (wSell[k] || 0) + x.q; for (const x of of.goods[k].from) if (x.nid < 0) wBuy[k] = (wBuy[k] || 0) + x.q; }
  const via = T.mainPort !== null && T.mainPort !== undefined ? cityById(T.mainPort) : null;
  const worldRow = `<div class="trade-row world" style="--c:#8f9a93">
      <span class="swatch"></span>
      <span class="tr-main"><strong>The world beyond the map</strong><span class="muted small">${wOpen ? (via ? `through our harbor at ${escapeHtml(via.name)}` : T.transit !== null && T.transit !== undefined ? `through the ${escapeHtml(nameOf(game, T.transit))}'s harbors` : "open") : "closed to us"} · middlemen take ${pct(TRADE.worldPremium)}</span></span>
      <span class="tr-num">${W.sellV > 0.0005 ? `<span class="num">${fmtMoneyFine(W.sellV)}</span><span class="small muted">${escapeHtml(tradeGoodsWords(wSell))}</span>` : `<span class="muted">—</span>`}</span>
      <span class="tr-num">${W.buyV > 0.0005 ? `<span class="num">${fmtMoneyFine(W.buyV)}</span><span class="small muted">${escapeHtml(tradeGoodsWords(wBuy))}</span>` : `<span class="muted">—</span>`}</span>
    </div>`;
  return `<div class="block">
    <span class="eyebrow">Partners · a year</span>
    <div class="trade-head"><span></span><span>Nation and route</span><span>We sell</span><span>We buy</span></div>
    <div class="trade-list">${list.map(row).join("")}${worldRow}</div>
    ${list.length ? "" : `<p class="muted small">No other nation can reach us yet: no shared border, no caravan route across wild land, and no sea lane between our harbors and theirs.</p>`}
  </div>`;
}

/* One partner opened: each good both ways with the share of the buyer's need, our promises, and two stress tests. */
function tradePartnerHtml(id, econ) {
  const W = tradeWith(game, PLAYER, id), name = nameOf(game, id);
  const line = (k, x, weSell) => `<div class="row"><span>${weSell ? "We sell them" : "They sell us"} ${escapeHtml(goodWord(k))}<span class="sub">${x.blocked ? `<span class="tone-bad">cut: ${escapeHtml(tradeBlockedText(game, x.blocked, weSell ? PLAYER : id, weSell ? id : PLAYER, k))}</span>` : `${pct(x.shareOfNeed)} of ${weSell ? "their" : "our"} need`}</span></span><span class="num">${fmtMoneyFine(x.v)}</span></div>`;
  const rows = Object.entries(W.aSells).sort((a, b) => b[1].v - a[1].v).map(([k, x]) => line(k, x, true))
    .concat(Object.entries(W.bSells).sort((a, b) => b[1].v - a[1].v).map(([k, x]) => line(k, x, false)));
  const notes = [];
  if (W.promise) notes.push(W.promise.by === PLAYER ? `We promised not to embargo them until ${seasonLabel(W.promise.until)}.` : `They promised not to embargo us until ${seasonLabel(W.promise.until)}.`);
  for (const e of W.embargoes) notes.push(e.by === PLAYER ? `We ${embargoVerb(e)} them (since ${seasonLabel(e.since)}).` : `${embargoLabel(game, e)} (since ${seasonLabel(e.since)}).`);
  const L = tradeLinkOf(econ, id);
  if (L) notes.push(`Route: ${tradeRouteWord(L)}${L.m === "land" || L.m === "over" ? `, up to ${fmtNum(Array.isArray(L.cap) ? L.cap[PLAYER < id ? 0 : 1] : L.cap)} million tons a year` : ""}.`);
  const st = ui.tradeStress && ui.tradeStress.nid === id ? tradeStressHtml(id, ui.tradeStress.dir) : "";
  const war = atWar(game, PLAYER, id);
  return `<div class="trade-card" style="--c:${game.nations[id].color}">
    ${rows.length ? `<div class="rows">${rows.join("")}</div>` : `<p class="muted small">No contracts between us this season.</p>`}
    ${notes.map(t => `<p class="small muted">${escapeHtml(t)}</p>`).join("")}
    ${war ? "" : `<div class="trade-btns">
      <button class="btn small ${ui.tradeStress && ui.tradeStress.nid === id && ui.tradeStress.dir === "sell" ? "on" : ""}" type="button" data-action="trade-stress" data-nid="${id}" data-dir="sell">If they stopped selling to us</button>
      <button class="btn small ${ui.tradeStress && ui.tradeStress.nid === id && ui.tradeStress.dir === "buy" ? "on" : ""}" type="button" data-action="trade-stress" data-nid="${id}" data-dir="buy">If they stopped buying from us</button>
    </div>`}
    ${st}
    <div class="trade-btns">
      ${war ? "" : `<button class="btn small danger" type="button" data-action="trade-embargo-open" data-nid="${id}">Embargo…</button>`}
      ${embargoesBy(game, id, PLAYER).length ? `<button class="btn small" type="button" data-action="trade-ask-lift" data-nid="${id}">Ask them to lift</button>` : ""}
      <button class="btn small" type="button" data-action="nation-view" data-nid="${id}">The ${escapeHtml(name)}</button>
    </div>
  </div>`;
}

/* What it would do to us if this nation cut us off (food included), worked out only when asked. */
function tradeStressHtml(id, dir) {
  const pv = tradeMemo(`stress|${id}|${dir}`, () => embargoPreview(world, game, id, PLAYER, "all", dir, true));
  const money = x => (Math.abs(x) < 0.0005 ? "no change" : fmtSignedMoneyFine(x));
  const rows = [`<div class="row"><span>Our output a year<span class="sub">at once · once our merchants find others</span></span><span class="num tone-${toneOf(pv.dGdpThem, 0.0005)}">${money(pv.dGdpThem)} · ${money(pv.later.dGdpThem)}</span></div>`];
  for (const [k, [b0, a0, l0]] of Object.entries(pv.theirSat)) rows.push(`<div class="row"><span>Our ${escapeHtml(goodWord(k))}: share of need met</span><span class="num tone-${a0 < b0 - 0.05 ? "bad" : "neutral"}">${pct(b0)} → ${pct(a0)}${Math.abs(l0 - a0) > 0.02 ? ` (later ${pct(l0)})` : ""}</span></div>`);
  if (pv.fuel[0] - pv.fuel[1] > 0.01) rows.push(`<div class="row"><span>Fuel for our army</span><span class="num tone-bad">${pct(pv.fuel[0])} → ${pct(pv.fuel[1])}</span></div>`);
  if (pv.arms[0] - pv.arms[1] > 0.01) rows.push(`<div class="row"><span>Metal and parts for our arms factories</span><span class="num tone-bad">${pct(pv.arms[0])} → ${pct(pv.arms[1])}</span></div>`);
  if (pv.food[0] - pv.food[1] > 0.01) rows.push(`<div class="row"><span>Our people fed</span><span class="num tone-bad">${pct(pv.food[0])} → ${pct(pv.food[1])}</span></div>`);
  const nothing = rows.length === 1 && Math.abs(pv.dGdpThem) < 0.0005;
  return `<div class="trade-stress"><span class="eyebrow">${dir === "sell" ? "If they stopped selling us anything" : "If they stopped buying anything from us"}</span>
    ${nothing ? `<p class="small muted">Almost nothing would change: we hardly depend on them.</p>` : `<div class="rows">${rows.join("")}</div>`}</div>`;
}

/* Goods: who we buy each from and sell it to. Click a good for every seller and buyer we can reach, and why. */
function tradeGoodsHtml(econ) {
  const T = econ.trade, G = econ.goods;
  const ks = TRADE_GOODS.filter(k => (G.demand[k] || 0) > 0.02 || (G.supply[k] || 0) > 0.02 || (G.imports[k] || 0) > 0.01 || (G.exports[k] || 0) > 0.01);
  if (ui.tradeGood && !ks.includes(ui.tradeGood)) ui.tradeGood = null;
  const rows = ks.map(k => {
    const im = G.imports[k] || 0, ex = G.exports[k] || 0, open = ui.tradeGood === k;
    const st = goodStatus(econ, k), cut = (T.cut && T.cut[k]) || [];
    return `<tr class="trade-good ${open ? "on" : ""}" data-action="trade-good" data-k="${k}" title="Who sells it to us and why">
      <td>${GOODS[k].label}${cut.length ? `<span class="sub tone-bad">${cut.length} contract${cut.length > 1 ? "s" : ""} cut</span>` : ""}</td>
      <td class="small">${im > 0.01 ? `<span class="num">${fmtMoneyFine(goodWorth(game, k, im))}</span><span class="sub">${escapeHtml(tradeWhoShort(T.importsFrom[k], "from", im))}</span>` : (econ.sat[k] ?? 1) < 0.95 ? `<span class="tone-bad">Nobody could sell us</span>` : "—"}</td>
      <td class="small">${ex > 0.01 ? `<span class="num">${fmtMoneyFine(goodWorth(game, k, ex))}</span><span class="sub">${escapeHtml(tradeWhoShort(T.exportsTo[k], "to", ex))}</span>` : "—"}</td>
      <td class="small tone-${st.tone}">${st.text}</td></tr>${open ? `<tr class="trade-why"><td colspan="4">${tradeGoodDetailHtml(k, econ)}</td></tr>` : ""}`;
  }).join("");
  return `<div class="block">
    <span class="eyebrow">Goods · a year</span>
    <table class="regions goods trade-goods"><thead><tr><th>Good</th><th>We buy</th><th>We sell</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted small">Click a good to see every seller we can reach, the price at our border, and why our merchants chose whom they did.</p>
  </div>`;
}

/* One good opened: the engine's seller and buyer tables (10s tradeOffers). */
function tradeGoodDetailHtml(k, econ) {
  const off = tradeMemo(`offers|${k}`, () => tradeOffers(world, game, PLAYER, k));
  const worth = q => fmtMoneyFine(goodWorth(game, k, q));
  const nm = id => (id < 0 ? "World market" : escapeHtml(nameOf(game, id)));
  const sellers = off.sellers.filter(s => s.nid < 0 || s.price || s.bought > 0).map(s => {
    const p = s.price ? `<span class="trade-price" tabindex="0" data-why="trade" data-k="${k}" data-s="${s.nid}" data-m="${s.link}" data-d="${s.d}">${pct(s.price.p / Math.max(1e-6, s.price.base))}</span>` : "—";
    const star = s.nid >= 0 && (s.preferred || (s.price && !tradeBlocked(game, s.nid, PLAYER, k)))
      ? `<button class="trade-star ${s.preferred ? "on" : ""}" type="button" data-action="trade-prefer" data-k="${k}" data-nid="${s.preferred ? -1 : s.nid}" title="${s.preferred ? "Our preferred seller: click to stop preferring them" : `Prefer them: our merchants count their price ${pct(TRADE.prefer)} lower`}" aria-pressed="${s.preferred}">★</button>` : "";
    return `<tr><td>${star}${nm(s.nid)}</td><td class="num">${p}</td><td class="num">${s.bought > 1e-4 ? worth(s.bought) : "—"}</td><td class="small muted">${escapeHtml(s.whyNot || "")}</td></tr>`;
  }).join("");
  const buyers = off.buyers.filter(b => b.nid < 0 ? b.sold > 1e-4 || b.wanted > 0 : b.link || b.sold > 0).map(b =>
    `<tr><td>${nm(b.nid)}</td><td class="num">${b.sold > 1e-4 ? worth(b.sold) : "—"}</td><td class="small muted" colspan="2">${escapeHtml(b.whyNot || "")}</td></tr>`).join("");
  const notes = [];
  if ((econ.sat[k] ?? 1) < 0.95) notes.push(`<span class="tone-bad">Nobody could sell us enough: only ${pct(econ.sat[k])} of our need is met${escapeHtml(shortWhy(game, econ, k, PLAYER))}.</span>`);
  if (k !== "food" && (econ.goods.util[k] ?? 1) < 0.9) notes.push(`<span class="tone-warn">Nobody bought ${pct(1 - econ.goods.util[k])} of what we make.</span>`);
  for (const x of (econ.trade.cut && econ.trade.cut[k]) || []) notes.push(`<span class="tone-bad">${x.from !== undefined ? `Cut: ${worth(x.q)} we bought from ${escapeHtml(whoName(game, x.from))} (${escapeHtml(tradeBlockedText(game, x.code, x.from, PLAYER, k))})` : `Cut: ${worth(x.q)} we sold to ${escapeHtml(whoName(game, x.to))} (${escapeHtml(tradeBlockedText(game, x.code, PLAYER, x.to, k))})`}</span>`);
  return `<div class="trade-detail">
    <table class="regions"><thead><tr><th>Seller</th><th class="num" title="As a share of the world price: hover a number for what makes it">Price here</th><th class="num">We buy</th><th>Why not more</th></tr></thead><tbody>${sellers}</tbody></table>
    ${buyers ? `<table class="regions"><thead><tr><th>Buyer</th><th class="num">They buy</th><th colspan="2">Why not more</th></tr></thead><tbody>${buyers}</tbody></table>` : ""}
    ${notes.map(t => `<p class="small">${t}</p>`).join("")}
    <p class="muted small">Merchants buy from the cheapest seller they can reach, at the price at our border: the world price, transport, our import tax (none with a trade agreement) and, from beyond the map, the middlemen's cut. They keep last season's seller unless another is ${pct(TRADE.renewBand)} cheaper. ★ marks a preferred seller (at most three).</p>
  </div>`;
}

/* Embargoes in force, ours and theirs, and the button that starts a new one. */
function tradeEmbargoesHtml() {
  const ours = embargoesBy(game, PLAYER), theirs = embargoesOn(game, PLAYER);
  const ourRows = ours.map(e => {
    const early = game.turn - e.since < TRADE.minEmbargo;
    const ask = ui.tradeLift === e.id;
    return `<div class="row"><span>We ${escapeHtml(embargoVerb(e))} the ${escapeHtml(nameOf(game, e.on))}${e.food && e.k === "all" ? " (food too)" : ""}<span class="sub">since ${seasonLabel(e.since)}</span>
      ${ask ? `<span class="sub ${early ? "tone-warn" : ""}">${early ? `It began less than a year ago: lifting it now earns no goodwill.` : `Lifting it softens their anger and earns a little goodwill.`}</span><span class="trade-btns"><button class="btn small primary" type="button" data-action="trade-lift" data-id="${e.id}">Lift it</button><button class="btn small" type="button" data-action="trade-lift-cancel">Keep it</button></span>` : ""}</span>
      ${ask ? "" : `<button class="chip-x" type="button" data-action="trade-lift-ask" data-id="${e.id}" title="Lift this embargo" aria-label="Lift this embargo">×</button>`}</div>`;
  }).join("");
  const theirRows = theirs.map(e => {
    const why = typeof embargoWhyHeard === "function" ? embargoWhyHeard(game, e, true) : "";
    return `<div class="row"><span>The ${escapeHtml(nameOf(game, e.by))}: ${escapeHtml(embargoLabel(game, e).toLowerCase())}<span class="sub">since ${seasonLabel(e.since)}${why ? `, ${escapeHtml(why)}` : ""}</span></span><button class="btn small" type="button" data-action="trade-ask-lift" data-nid="${e.by}">Ask them to lift</button></div>`;
  }).join("");
  const sanc = ((game.assembly && game.assembly.sanctions) || []).filter(s => s.until > game.turn && (s.target === PLAYER || s.by.includes(PLAYER)));
  const sancRows = sanc.map(s => `<div class="row"><span>${s.target === PLAYER ? "World Assembly sanctions on us" : `We keep the World Assembly's sanctions on the ${escapeHtml(nameOf(game, s.target))}`}<span class="sub">until ${seasonLabel(s.until)}</span></span><span class="num tone-${s.target === PLAYER ? "bad" : "neutral"}">no trade</span></div>`).join("");
  return `<div class="block">
    <span class="eyebrow">Embargoes</span>
    ${ourRows || theirRows || sancRows ? `<div class="rows">${ourRows}${theirRows}${sancRows}</div>` : `<p class="muted small">No embargoes: our merchants may trade with every nation at peace with us.</p>`}
    ${ui.tradeEmb ? "" : `<div class="trade-btns"><button class="btn small danger" type="button" data-action="trade-embargo-open">New embargo…</button></div>`}
  </div>`;
}

/* ---------- The embargo flow: whom, what, which way; then what it would do, before it is declared ---------- */
function openEmbargoFlow(nid) {
  const first = liveNations(game).find(z => z.id !== PLAYER && !atWar(game, PLAYER, z.id));
  const id = nid !== undefined && nid !== null && game.nations[nid] && game.nations[nid].alive && nid !== PLAYER ? nid : first ? first.id : null;
  if (id === null) { flashHint("There is no nation at peace with us to embargo."); return; }
  ui.tradeEmb = { nid: id, k: "all", dir: "sell", food: false };
  ui.tab = "trade";
}
function tradeEmbargoFlowHtml() {
  const F = ui.tradeEmb;
  if (!F) return "";
  if (!game.nations[F.nid] || !game.nations[F.nid].alive) { ui.tradeEmb = null; return ""; }
  const chip = (field, value, label, on) => `<button class="seg-chip ${on ? "on" : ""}" type="button" data-action="trade-emb-set" data-f="${field}" data-v="${value}" aria-pressed="${on}">${label}</button>`;
  // nations we trade with most first
  const vol = id => { const W2 = tradeWith(game, PLAYER, id); return W2.aSellsV + W2.bSellsV; };
  const others = liveNations(game).filter(z => z.id !== PLAYER && !atWar(game, PLAYER, z.id)).map(z => ({ z, v: vol(z.id) })).sort((a, b) => b.v - a.v || a.z.id - b.z.id).map(x => x.z);
  const W = tradeWith(game, PLAYER, F.nid);
  const traded = new Set([...Object.keys(W.aSells), ...Object.keys(W.bSells)]);
  const goods = ["all"].concat(TRADE_GOODS.filter(k => traded.has(k)), TRADE_GOODS.filter(k => !traded.has(k)));
  const block = embargoBlock(game, PLAYER, F.nid, F.k, F.dir);
  let preview = "";
  if (!block) {
    const pv = tradeMemo(`emb|${F.nid}|${F.k}|${F.dir}|${F.food ? 1 : 0}`, () => embargoPreview(world, game, PLAYER, F.nid, F.k, F.dir, F.food));
    const rows = pv.lines.map(l => `<div class="row"><span>${escapeHtml(l.label)}</span><span class="num">${escapeHtml(l.value)}</span></div>`);
    if (Math.abs(pv.later.dGdpThem) > 0.0005) rows.splice(2, 0, `<div class="row"><span>Their output, once their merchants find other ${F.dir === "buy" ? "buyers" : "sellers"}</span><span class="num">${fmtSignedMoneyFine(pv.later.dGdpThem)}</span></div>`);
    if (pv.lostSales > 0.0005) rows.push(`<div class="row"><span>Sales our merchants lose</span><span class="num tone-bad">${fmtMoneyFine(-pv.lostSales)} a year</span></div>`);
    preview = `<div class="rows">${rows.join("")}</div>${pv.breaksPromise || pv.endsTreaty ? `<p class="bad">${pv.breaksPromise ? "We promised not to do this: every nation will see us break our word." : pv.endsTreaty ? "This ends our treaty with them." : ""}</p>` : ""}`;
  }
  return `<div class="confirm trade-emb">
    <h3>Embargo on the ${escapeHtml(nameOf(game, F.nid))}</h3>
    <div class="emb-step"><span class="k">On</span><span class="emb-chips">${others.map(z => chip("nid", z.id, escapeHtml(z.name), z.id === F.nid)).join("")}</span></div>
    <div class="emb-step"><span class="k">What</span><span class="emb-chips">${goods.map(k => chip("k", k, k === "all" ? "All trade" : `${GOODS[k].label}${traded.has(k) ? " •" : ""}`, F.k === k)).join("")}</span></div>
    <div class="emb-step"><span class="k">Which way</span><span class="emb-chips">${chip("dir", "sell", "Stop selling to them", F.dir === "sell")}${chip("dir", "buy", "Stop buying from them", F.dir === "buy")}${chip("dir", "both", "Both", F.dir === "both")}</span></div>
    ${F.k === "all" ? `<div class="emb-step"><span class="k">Food</span><span class="emb-chips">${chip("food", F.food ? 0 : 1, F.food ? "Food too (grain stops as well)" : "Not food (grain still flows)", F.food)}</span></div>` : ""}
    <p class="muted small">• marks goods we trade with them now. The merchants obey at once; finding other ${F.dir === "buy" ? "buyers" : "sellers"} takes them until next season.</p>
    ${block ? `<p class="bad">${escapeHtml(block)}</p>` : preview}
    <div class="actions"><button class="btn danger" type="button" data-action="trade-emb-declare" ${block ? "disabled" : ""}>Declare the embargo</button><button class="btn" type="button" data-action="trade-emb-cancel">Cancel</button></div>
  </div>`;
}

/* ---------- Grain: bought and sold abroad, famine relief, and aid from our reserve ---------- */
function tradeFoodHtml(econ) {
  const T = econ.trade;
  const fin = econ.foodIn || 0, fout = econ.foodOut || 0;
  const rows = [];
  if (fin > 0.001) rows.push(`<div class="row"><span>Grain bought abroad<span class="sub">${escapeHtml(tradeWhoShort(T.importsFrom.food, "from", fin, 3))}</span></span><span class="num">${fmtPeople(fin)} fed a year</span></div>`);
  if (fout > 0.001) rows.push(`<div class="row"><span>Grain sold abroad<span class="sub">${escapeHtml(tradeWhoShort(T.exportsTo.food, "to", fout, 3))}</span></span><span class="num">${fmtPeople(fout)} fed a year</span></div>`);
  for (const f of game.trade.flows) if (f.k === "food" && f.r === "relief" && (f.s === PLAYER || f.b === PLAYER) && !tradeBlocked(game, f.s, f.b, "food"))
    rows.push(`<div class="row"><span>${f.s === PLAYER ? `Famine relief to the ${escapeHtml(nameOf(game, f.b))}` : `Famine relief from the ${escapeHtml(nameOf(game, f.s))}`}<span class="sub">sold only to the hungry, from farms that grow a little more</span></span><span class="num tone-good">${fmtPeople(f.q)} fed</span></div>`);
  if (T.foodGap > 0.001 && fin < T.foodGap - 0.001) rows.push(`<div class="row"><span>Still short after imports<span class="sub">${escapeHtml(capFirstLetter(shortWhy(game, econ, "food", PLAYER).replace(/^ \(|\)$/g, "")) || "towns no grain can reach")}</span></span><span class="num tone-bad">${fmtPeople(T.foodGap - fin)}</span></div>`);
  if (T.foodOffer > 0.001 && fout < T.foodOffer - 0.001) rows.push(`<div class="row"><span>Our farms could sell more<span class="sub">nobody we can reach needs it this season</span></span><span class="num">${fmtPeople(T.foodOffer - fout)} fed</span></div>`);
  const hungry = liveNations(game).filter(z => z.id !== PLAYER && (economies()[z.id] || {}).famineShare > 0.02);
  const aidRows = hungry.map(z => {
    const e = economies()[z.id];
    return `<div class="row"><span>The ${escapeHtml(z.name)}<span class="sub">${pct(e.famineShare)} of their people go hungry</span></span><button class="btn small" type="button" data-action="trade-aid-ask" data-nid="${z.id}">Send grain…</button></div>`;
  }).join("");
  const recent = (game.trade.aid || []).filter(a => (a.from === PLAYER || a.to === PLAYER) && game.turn - a.turn < 8).slice(-3).reverse()
    .map(a => `<p class="small muted">${seasonLabel(a.turn)}: ${a.from === PLAYER ? `we sent grain to the ${escapeHtml(nameOf(game, a.to))}` : `the ${escapeHtml(nameOf(game, a.from))} sent us grain`} (food for ${fmtPeople(a.q * 12)} people for a month).</p>`).join("");
  return `<div class="block">
    <span class="eyebrow">Grain and aid</span>
    ${tradeAidCardHtml()}
    ${rows.length ? `<div class="rows">${rows.join("")}</div>` : `<p class="muted small">No grain crosses our borders: our farms feed our people${econ.famineShare > 0.01 ? ", except where no grain can reach" : ""}.</p>`}
    ${aidRows ? `<span class="eyebrow">Hungry nations</span><div class="rows">${aidRows}</div>` : ""}
    ${recent}
    <p class="muted small">Grain bought abroad feeds hungry towns before the reserve is opened. Farms grow grain for sale only with machinery, up to ${pct(TRADE.foodExport)} more than their own people eat.</p>
  </div>`;
}
function tradeAidCardHtml() {
  const A = ui.tradeAid;
  if (!A) return "";
  if (!game.nations[A.nid] || !game.nations[A.nid].alive) { ui.tradeAid = null; return ""; }
  const n = game.nations[PLAYER], econ = economies()[PLAYER];
  const qt = tradeMemo(`aid|${A.nid}|${A.months}`, () => foodAidQuote(world, game, PLAYER, A.nid, A.months));
  const chip = m => `<button class="seg-chip ${A.months === m ? "on" : ""}" type="button" data-action="trade-aid-months" data-v="${m}" aria-pressed="${A.months === m}">${m} month${m > 1 ? "s" : ""}</button>`;
  const stock = (n.granary && n.granary.stock) || 0;
  const body = qt.ok
    ? `<div class="rows">
        <div class="row"><span>Grain we send<span class="sub">from our reserve</span></span><span class="num">food for all their people for ${qt.months.toFixed(1)} months</span></div>
        <div class="row"><span>Our reserve</span><span class="num">${fmtNum(monthsOfFood(stock, econ.pop))} → ${fmtNum(monthsOfFood(stock - qt.q, econ.pop))} months</span></div>
        <div class="row"><span>Their opinion of us</span><span class="num tone-${qt.opinion > 0 ? "good" : "neutral"}">${qt.opinion > 0 ? signed(qt.opinion) : "no change: we sent grain less than a year ago"}</span></div>
      </div>`
    : `<p class="bad">${escapeHtml(qt.reason)}</p>`;
  return `<div class="confirm">
    <h3>Grain for the ${escapeHtml(nameOf(game, A.nid))}</h3>
    <div class="emb-chips">${[1, 3, 6].map(chip).join("")}</div>
    ${body}
    <div class="actions"><button class="btn primary" type="button" data-action="trade-aid-send" ${qt.ok ? "" : "disabled"}>Send it</button><button class="btn" type="button" data-action="trade-aid-cancel">Cancel</button></div>
  </div>`;
}

/* ---------- Routes still to open: nations we cannot trade with yet, and what would open the way ---------- */
function tradeOpeningHtml() {
  const op = tradeMemo("opportunities", () => tradeOpportunities(world, game, PLAYER));
  // nations a road or a harbor could open first, then the nearest
  const rank = x => (x.ideas.some(i => i.kind === "road" || i.kind === "port") ? 0 : 1);
  const all = op.list.filter(x => (!x.link || x.link === "over") && x.ideas.some(i => i.kind !== "war")).sort((a, b) => rank(a) - rank(b) || a.gap - b.gap || a.nid - b.nid);
  if (!all.length) return "";
  const items = ui.tradeIdeasAll ? all : all.slice(0, 2);
  const rows = items.map(x => {
    const ideas = x.ideas.filter(i => i.kind !== "war").map(i => `<li>${escapeHtml(i.text)}${i.kind === "road" && i.quote ? ` <button class="btn small" type="button" data-action="trade-plan-road" data-nid="${x.nid}">Plan it</button>` : ""}${i.kind === "treaty" ? ` <button class="btn small" type="button" data-action="compose" data-nid="${x.nid}">Write to them</button>` : ""}</li>`).join("");
    return `<div class="trade-idea" style="--c:${game.nations[x.nid].color}"><strong>${escapeHtml(nameOf(game, x.nid))}</strong><span class="muted small"> · ${x.link === "over" ? "caravans only" : "no route yet"}</span><ul>${ideas}</ul></div>`;
  }).join("");
  return `<div class="block"><span class="eyebrow">Opening trade · nations we cannot reach yet</span>${rows}
    ${all.length > 2 ? `<div class="trade-btns"><button class="linkbtn" type="button" data-action="trade-ideas">${ui.tradeIdeasAll ? "Show fewer" : `Show ${all.length - 2} more`}</button></div>` : ""}</div>`;
}

/* ---------- The trade law, preferred sellers, and the trade lanes on the map ---------- */
function tradePolicyHtml() {
  const pref = (game.trade.prefer || []).filter(p => p.by === PLAYER && game.nations[p.from] && game.nations[p.from].alive);
  return `<div class="block">
    <span class="eyebrow">Trade policy · takes effect when the season ends</span>
    ${lawHtml("trade", "Trade law", TRADE_ORDER.map(k => ({ value: k, label: TRADE_LAWS[k].label.replace(" trade", ""), sub: `import tax ${pct(TRADE_LAWS[k].tariff)}` })))}
    <p class="muted small">Protection keeps half of each shortage for our own makers to fill and sells less abroad; free trade lets merchants buy and sell all they can. Nations with a trade agreement pay no import tax to each other.</p>
    ${pref.length ? `<div class="chips">${pref.map(p => `<span class="chip">★ ${escapeHtml(GOODS[p.k].label)} from the ${escapeHtml(nameOf(game, p.from))}<button class="chip-x" type="button" data-action="trade-prefer" data-k="${p.k}" data-nid="-1" aria-label="Stop preferring them">×</button></span>`).join("")}</div>` : ""}
    <div class="emb-chips"><button class="seg-chip ${ui.tradeMap ? "on" : ""}" type="button" data-action="trade-map" aria-pressed="${!!ui.tradeMap}">${ui.tradeMap ? "✓ " : ""}Show trade lanes on the map</button></div>
  </div>`;
}

/* What another trade law would do, from the engine's preview (10s tradeLawPreview); used by the law buttons. */
function tradeLawText(now, value, current) {
  const T = now.econ.trade;
  const tax = x => (x >= 0.0005 ? `import tax ${fmtMoneyFine(x)} a season` : "no import tax collected");
  if (current) return T && T.open ? capFirstLetter(tax(now.budget.tariffs)) : "No trade route yet: no border, harbor or trade partner";
  const pv = tradeMemo(`law|${value}`, () => tradeLawPreview(world, game, PLAYER, value));
  const alt = forecast(world, game, PLAYER, { ...game.nations[PLAYER].laws, trade: value });
  const bits = [];
  if (Math.abs(pv.dImports) >= 0.0005) bits.push(`imports ${fmtSignedMoneyFine(pv.dImports)} a year`);
  if (Math.abs(pv.dExports) >= 0.0005) bits.push(`exports ${fmtSignedMoneyFine(pv.dExports)}`);
  if (Math.abs(pv.dGdp) >= 0.0005) bits.push(`output ${fmtSignedMoneyFine(pv.dGdp)}`);
  bits.push(tax(pv.tariffsThen));
  bits.push(`stability ${signed1(alt.target - now.target)}`);
  return `If chosen: ${bits.join(", ")}. Contracts change when merchants next sign`;
}

/* ---------- The price at our border, as a "why" card ---------- */
function whyTrade(target) {
  const k = target.dataset.k, s = Number(target.dataset.s), m = target.dataset.m, d = Number(target.dataset.d) || 0;
  if (!GOODS[k]) return "";
  const dp = deliveredPrice(game, k, s, PLAYER, m, d);
  const rows = dp.why.map((x, i) => ({ label: x.label, value: i === 0 ? "100%" : x.value > 0 ? `+${pct(x.value / dp.base)}` : "±0%", tone: i > 0 && x.value > 0 ? "warn" : "" }));
  rows.push({ label: "Price at our border", value: pct(dp.p / dp.base), total: true });
  return whyCard(`${GOODS[k].label} from ${s < 0 ? "the world market" : `the ${nameOf(game, s)}`}`, `${pct(dp.p / dp.base)} of the world price`, rows,
    `Merchants buy from the cheapest seller they can reach; a preferred seller counts ${pct(TRADE.prefer)} cheaper, and a nation they hate ${pct(TRADE.dislike)} dearer.`);
}
WHY.trade = whyTrade;

/* ---------- Actions ---------- */
Object.assign(ACTIONS, {
  "trade-partner": el => { const id = Number(el.dataset.nid); ui.tradeOpen = ui.tradeOpen === id ? null : id; ui.tradeStress = null; },
  "trade-stress": el => { const id = Number(el.dataset.nid), dir = el.dataset.dir; ui.tradeStress = ui.tradeStress && ui.tradeStress.nid === id && ui.tradeStress.dir === dir ? null : { nid: id, dir }; },
  "trade-good": el => { ui.tradeGood = ui.tradeGood === el.dataset.k ? null : el.dataset.k; },
  "trade-prefer": el => {
    const r = setPreferredSeller(game, PLAYER, el.dataset.k, Number(el.dataset.nid));
    if (!r.ok) { flashHint(r.reason); return; }
    tradeMemoClear();
    if (Number(el.dataset.nid) >= 0) flashHint(`Our merchants will turn to the ${nameOf(game, Number(el.dataset.nid))} for ${goodWord(el.dataset.k)} when they sign next season's contracts.`);
  },
  "trade-embargo-open": el => openEmbargoFlow(el.dataset.nid !== undefined ? Number(el.dataset.nid) : ui.tradeOpen),
  "trade-emb-set": el => {
    const F = ui.tradeEmb;
    if (!F) return;
    const f = el.dataset.f, v = el.dataset.v;
    if (f === "nid") F.nid = Number(v);
    else if (f === "k") { F.k = v; if (v !== "all") F.food = false; }
    else if (f === "dir") F.dir = v;
    else if (f === "food") F.food = v === "1";
  },
  "trade-emb-cancel": () => { ui.tradeEmb = null; },
  "trade-emb-declare": () => {
    const F = ui.tradeEmb;
    if (!F) return;
    const pv = tradeMemo(`emb|${F.nid}|${F.k}|${F.dir}|${F.food ? 1 : 0}`, () => embargoPreview(world, game, PLAYER, F.nid, F.k, F.dir, F.food));
    const r = declareEmbargo(world, game, PLAYER, F.nid, F.k, F.dir, "choice", { preview: pv, food: F.food });
    if (!r.ok) { flashHint(r.reason); return; }
    ui.tradeEmb = null;
    flashHint(r.text);
    bumpMap();
  },
  "trade-lift-ask": el => { ui.tradeLift = Number(el.dataset.id); },
  "trade-lift-cancel": () => { ui.tradeLift = null; },
  "trade-lift": el => {
    const r = liftEmbargo(world, game, Number(el.dataset.id), PLAYER);
    ui.tradeLift = null;
    if (!r.ok) { flashHint(r.reason); return; }
    flashHint(r.text);
    bumpMap();
  },
  "trade-ask-lift": el => {
    const id = Number(el.dataset.nid);
    ui.compose = newComposer(id, [{ type: "lift_embargo", by: id, on: PLAYER }].filter(t => !validateDeal(game, world, PLAYER, id, [t])));
    ui.composeDirty = true;
  },
  "trade-aid-ask": el => { ui.tradeAid = { nid: Number(el.dataset.nid), months: 3 }; },
  "trade-aid-months": el => { if (ui.tradeAid) ui.tradeAid.months = Number(el.dataset.v); },
  "trade-aid-cancel": () => { ui.tradeAid = null; },
  "trade-aid-send": () => {
    const A = ui.tradeAid;
    if (!A) return;
    const r = sendFoodAid(world, game, PLAYER, A.nid, A.months);
    ui.tradeAid = null;
    if (!r.ok) { flashHint(r.reason); return; }
    flashHint(r.text);
    bumpMap();
  },
  "trade-plan-road": el => {
    const q = bestTradeRoad(world, game, PLAYER, Number(el.dataset.nid));
    if (q && q.ok) { ui.pending = q; } else flashHint((q && q.reason) || "No trade road can be built to them from here yet.");
  },
  "trade-map": () => { ui.tradeMap = !ui.tradeMap; },
  "trade-ideas": () => { ui.tradeIdeasAll = !ui.tradeIdeasAll; },
  "trade-lanes-show": () => { ui.tradeMap = true; },
});

/* The Economy panel's line on trade: how many nations our merchants reach, and whether the world market is open. */
function tradeAccessShort(econ) {
  const T = econ.trade || {}, n = Object.keys(T.links || {}).length, world = T.worldImportCapRaw > 0;
  return `${n ? `Your merchants reach ${n} nation${n > 1 ? "s" : ""} by land or sea` : "No other nation can reach you yet"}; the world market beyond the map is ${world ? "open to you" : "closed (it needs a harbor on the ocean, or a trade partner who has one)"}.`;
}
