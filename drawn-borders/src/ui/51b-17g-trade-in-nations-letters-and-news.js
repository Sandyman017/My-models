/* =====================================================================
   17g. Trade in the Nations panel, the letters and the season's news: what each rival sells us and buys from us,
        embargoes on the rival card, "lift the embargo" in letters, and the merchants' news in the season report.
   ===================================================================== */
/* The short line on a nation's row: the trade that ties us most ("sells us 70% of our oil"). */
function tradeRowNote(nid) {
  if (!tradeBookReady()) return "";
  const W = tradeWith(game, PLAYER, nid);
  const top = o => Object.entries(o).filter(([, x]) => !x.blocked && x.shareOfNeed >= 0.3).sort((a, b) => b[1].shareOfNeed - a[1].shareOfNeed)[0];
  const ours = top(W.bSells), theirs = top(W.aSells);
  if (ours && (!theirs || ours[1].shareOfNeed >= theirs[1].shareOfNeed)) return `sells us ${pct(Math.min(1, ours[1].shareOfNeed))} of our ${goodWord(ours[0])}`;
  if (theirs) return `buys ${pct(Math.min(1, theirs[1].shareOfNeed))} of its ${goodWord(theirs[0])} from us`;
  return W.aSellsV + W.bSellsV > 0.05 ? "trades with us" : "";
}
function tradeRowEmbargo(nid) { return tradeBookReady() && (embargoesBy(game, PLAYER, nid).length > 0 || embargoesBy(game, nid, PLAYER).length > 0); }

/* The rival card: trade both ways, the route, embargoes, and the buttons to cut or restore it. */
function rivalTradeHtml(n) {
  if (!tradeBookReady()) return "";
  const W = tradeWith(game, PLAYER, n.id), econ = economies()[PLAYER];
  const line = (k, x, weSell) => `<li><span>${GOODS[k].label}${x.blocked ? ` <span class="tone-bad small">cut</span>` : ""}<span class="muted small"> · ${pct(Math.min(1, x.shareOfNeed))} of ${weSell ? "their" : "our"} need</span></span><span class="num">${fmtMoneyFine(x.v)}</span></li>`;
  const sells = Object.entries(W.bSells).sort((a, b) => b[1].v - a[1].v).slice(0, 4).map(([k, x]) => line(k, x, false)).join("");
  const buys = Object.entries(W.aSells).sort((a, b) => b[1].v - a[1].v).slice(0, 4).map(([k, x]) => line(k, x, true)).join("");
  const L = tradeLinkOf(econ, n.id);
  const ours = embargoesBy(game, PLAYER, n.id), theirs = embargoesBy(game, n.id, PLAYER);
  const emb = ours.map(e => `<li><span>We ${escapeHtml(embargoVerb(e))} them<span class="muted small"> · since ${seasonLabel(e.since)}</span></span><button class="btn small" type="button" data-action="trade-lift-open" data-id="${e.id}">Lift…</button></li>`)
    .concat(theirs.map(e => { const why = embargoWhyHeard(game, e, true); return `<li><span class="tone-bad">${escapeHtml(embargoLabel(game, e))}</span><span class="muted small">since ${seasonLabel(e.since)}${why ? `, ${escapeHtml(why)}` : ""}</span></li>`; })).join("");
  const war = atWar(game, PLAYER, n.id);
  return `<div class="block" style="gap:6px"><span class="eyebrow">Trade with you · a year</span>
    <p class="small muted">${L ? `Route: ${escapeHtml(tradeRouteWord(L))}.` : "No route between us: no shared border, caravan road or sea lane."}${W.promise ? ` ${W.promise.by === PLAYER ? "We" : "They"} promised not to embargo ${W.promise.by === PLAYER ? "them" : "us"} until ${seasonLabel(W.promise.until)}.` : ""}</p>
    ${sells ? `<span class="small">They sell us</span><ul class="factors">${sells}</ul>` : ""}
    ${buys ? `<span class="small">They buy from us</span><ul class="factors">${buys}</ul>` : ""}
    ${!sells && !buys && L ? `<p class="small muted">No contracts between us this season.</p>` : ""}
    ${emb ? `<ul class="factors">${emb}</ul>` : ""}
    <div class="trade-btns">
      ${war ? "" : `<button class="btn small danger" type="button" data-action="trade-embargo-open" data-nid="${n.id}">Embargo…</button>`}
      ${theirs.length ? `<button class="btn small" type="button" data-action="trade-ask-lift" data-nid="${n.id}">Ask them to lift</button>` : ""}
      <button class="btn small" type="button" data-action="trade-open" data-nid="${n.id}">In the Trade panel</button>
    </div>
  </div>`;
}

/* ---------- Letters: lifting embargoes ---------- */
// the composer's lift terms, offered only when such an embargo stands
function liftTermOptions(g, to) {
  if (!g.trade || atWar(g, PLAYER, to)) return [];
  const them = embargoesBy(g, to, PLAYER).length > 0, us = embargoesBy(g, PLAYER, to).length > 0;
  const out = [];
  if (them) out.push(["lift_them", "They lift their embargo on us"]);
  if (us) out.push(["lift_us", "We lift our embargo on them"]);
  if (them && us) out.push(["lift_both", "Both lift their embargoes"]);
  return out;
}
function readLiftTerm(c) {
  if (c.termType === "lift_both") return { type: "lift_embargo", by: "both" };
  return c.termType === "lift_us" ? { type: "lift_embargo", by: PLAYER, on: c.to } : { type: "lift_embargo", by: c.to, on: PLAYER };
}
/* What a lift in a proposal would do for us, worked out on a copy of the world where the embargo is gone. */
function liftImpactLines(g, w, t, other, terms) {
  const lines = [];
  const base = computeEconomy(w, g, PLAYER);
  for (const L of t.by === "both" ? [other, PLAYER] : [t.by]) {
    const V = L === PLAYER ? other : PLAYER;
    const es = embargoesBy(g, L, V);
    if (!es.length) continue;
    const d = computeEconomy(w, hypothetical(g, { lift: { by: L, on: V } }), PLAYER).gdp - base.gdp;
    const paid = terms.some(x => (x.type === "payment" || x.type === "tribute") && x.from === V);
    const money = Math.abs(d) >= 0.0005 ? `: your output ${fmtSignedMoneyFine(d)} a year as trade resumes` : "";
    if (L === PLAYER) lines.push(`You lift your embargo on them (${embargoGoodsText(es)})${money}${paid ? `. As they pay for it, you promise not to bring it back for ${TRADE.promise / 4} years` : ""}`);
    else lines.push(`Their embargo on you ends (${embargoGoodsText(es)})${money}${paid ? `. As you pay for it, they promise not to bring it back for ${TRADE.promise / 4} years` : ""}`);
  }
  return lines;
}

/* ---------- The season report: the merchants' news, under the minister who reports it ---------- */
function tradeDispatchHtml(d) {
  const list = d.trade || [];
  if (!list.length) return "";
  const n = game.nations[PLAYER];
  const dot = t => (t === "good" ? "var(--good)" : t === "bad" ? "var(--bad)" : t === "warn" ? "var(--warn)" : "var(--muted)");
  const rows = list.map(x => {
    const M = x.minister && ministryActive(n, x.minister) ? ministry(n, x.minister).minister : null;
    return `<li><span class="dot" style="background:${dot(x.tone)}"></span><span>${M ? `<span class="who">${escapeHtml(M.name)} (${escapeHtml(MINISTRIES[x.minister].label)}):</span> ` : ""}${escapeHtml(x.text)}</span></li>`;
  }).join("");
  return `<div class="block"><span class="eyebrow">Trade</span><ul class="news">${rows}</ul>
    <div class="actions"><button class="btn" type="button" data-action="trade-open">Open the Trade panel</button></div></div>`;
}

Object.assign(ACTIONS, {
  "trade-open": el => { ui.dispatch = null; ui.tab = "trade"; if (el && el.dataset && el.dataset.nid !== undefined) { ui.tradeOpen = Number(el.dataset.nid); ui.tradeStress = null; } },
  "trade-lift-open": el => { ui.tab = "trade"; ui.tradeLift = Number(el.dataset.id); },
});
