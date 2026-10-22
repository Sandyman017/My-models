/* =====================================================================
   10t. Rival trade minds: when a government cuts off another nation's trade, and when it lets it flow again.
        Every embargo a rival weighs starts from a real contract in the trade book (10s) and is scored with the
        same reasons and costs for everyone: the rules mind and Claude's mind see the same option, the player's
        early warning reads the same numbers, and the engine checks it again when it is carried out. Embargoes
        in force are reviewed each season by fixed rules. Also here: food aid from rival governments, what trade
        does to opinion, how exposed a nation is to another (for the Assembly and letters), and the trade lines
        of the briefs Claude reads.
   ===================================================================== */
const EMBARGO_AI = {
  cap: 10,              // an embargo is worth at most 10 points: it can come before a weak war, never before a peace offer
  minHurt: 0.3,         // it must cost the target at least 0.3% of its output a year...
  minDrop: 0.2,         // ...or 20 points of the fuel, arms or food it needs; otherwise it is only a gesture
  dependShare: 0.3,     // "we buy much of our oil from them": at least 30% of what we need
  material: 0.005,      // a flow matters when it is worth half a percent of output a year (or is a key good)
  liftAge: 4,           // a rival lifts an embargo at least a year old once its reasons are weak...
  liftCause: 2,         // ...below 2 points
  liftLoss: 3,          // or when it costs the rival itself 3 points more than its reasons are worth
  warnSelf: 2,          // the player hears when a rival weighs an embargo worth 2 points or more to it...
  warnEvery: 8,         // ...at most once in two years from each nation
  bully: 3,             // three embargoes of its own at once: "Bullies its trading partners"
  justHurt: 1.5,        // an embargo that cost 1.5% of output (or a key supply) is a just cause for war...
  justSeasons: 8,       // ...while it stands and for two years after it is lifted
  aidFamine: 0.02,      // rival governments send grain when 2% of a nation's people go hungry...
  aidMonths: 4,         // ...from a reserve of at least 4 months of their own food
  aidKeep: 3,           // and keep 3 months for themselves
  aidCooldown: 8,       // the same donor helps the same nation at most once in two years
  preferBand: 0.05,     // rivals buy from an ally or trade partner first when it is at most 5% dearer than the cheapest
};
const EMBARGO_AIMS = {   // the main reason a government gives for its own embargo (the code is stored on the entry as `why`)
  retaliation: "to answer their embargo",
  pressure: "to press our demands",
  threat: "to keep a dangerous neighbor from growing stronger",
  hostility: "out of old grudges",
  ally_war: "because they make war on our ally",
  war_goods: "because they sell war goods to our enemy",
};
/* ---------- What an embargo is for, in words ---------- */
/* A government's own words for its embargo on `on` ("to press our claim to Ostard"). */
function embargoAim(g, by, on, why) {
  const O = g.opening;
  if (why === "pressure" && O && O.by === by && on === PLAYER && O.stage !== "over") return `to press our claim to ${O.town}`;
  return EMBARGO_AIMS[why] || "our own choice";
}

/* Why `e.by` cut off `e.on`'s trade, as the nation it hurts hears it: a clause to follow a comma ("to press its claim
   to Ostard"). `you`: spoken to the player ("your army") rather than by its ministers ("our army"). */
function embargoWhyHeard(g, e, you) {
  const O = g.opening, our = you ? "your" : "our", we = you ? "you" : "we";
  switch (e.why) {
    case "retaliation": return `in answer to ${our} own embargo`;
    case "pressure": return O && O.by === e.by && e.on === PLAYER && O.stage !== "over" ? `to press its claim to ${O.town}` : `because ${we} refused its demands`;
    case "threat": return `because it fears ${our} army and will not help it grow`;
    case "hostility": return "out of old grudges";
    case "ally_war": { const a = alliesOf(g, e.by).find(z => atWar(g, z, e.on)); return a !== undefined ? `because ${we} are at war with its ally, the ${nameOf(g, a)}` : `because ${we} made war on its ally`; }
    case "war_goods": { const z = enemiesOf(g, e.by).find(id => id !== e.on); return `because ${we} sell war goods to its enemy${z !== undefined ? `, the ${nameOf(g, z)}` : ""}`; }
    default: return "";
  }
}

/* ---------- Reading the book (no economy worked out) ---------- */
/* The last output on record (a year): the scale for points without working out an economy. */
function lastRecordedGdp(g, nid, w) {
  const n = g.nations[nid];
  const h = n && n.history && n.history.length ? n.history[n.history.length - 1] : null;
  if (h && h.gdp > 0) return h.gdp;
  return w ? Math.max(1, computeEconomy(w, g, nid).gdp) : 1;
}
/* What s sells to b now, good by good (units a year), leaving out contracts a war or an embargo has cut. */
function tradeSells(g, s, b) {
  const out = {};
  const o = tradeIndex(g).outOf[s];
  if (!o) return out;
  for (const k in o) for (const f of o[k]) if (f.b === b && !tradeBlocked(g, s, b, k)) out[k] = (out[k] || 0) + f.q;
  return out;
}
function goodsWorth(g, k, q) { return q * GOODS[k].price * priceOf(g, k); }
function tradeGoodWord(k) { return k === "all" ? "goods" : GOODS[k].label.toLowerCase(); }
/* A reason inside a sentence: only its first letter goes small (names keep their capitals). */
function lcFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : ""; }
/* "oil and metals", or "all trade", for a list of embargoes. */
function embargoGoodsText(es) {
  if (es.some(e => e.k === "all")) return "all trade";
  return bJoin([...new Set(es.map(e => tradeGoodWord(e.k)))]);
}
/* How much X's trade hangs on T: the largest share of a need X buys from T (material goods only), and the value of
   X's sales to and purchases from T as shares of X's output. */
function tradeExposure(g, X, T) {
  const ex = { buy: null, sell: null, buyPct: 0, sellPct: 0, material: false };
  if (!g.trade || !g.trade.v || X === T) return ex;
  const gdp = Math.max(1, lastRecordedGdp(g, X));
  const need = g.trade.need || {};
  const buys = tradeSells(g, T, X), sells = tradeSells(g, X, T);
  for (const k of TRADE_GOODS) {
    if (buys[k]) {
      const v = goodsWorth(g, k, buys[k]), n = need[k] ? need[k][X] || 0 : 0;
      const share = n > 0 ? Math.min(1, buys[k] / n) : 0;
      ex.buyPct += v / gdp;
      if ((v / gdp >= EMBARGO_AI.material || TRADE.key.includes(k)) && (!ex.buy || share > ex.buy.share)) ex.buy = { k, share, v };
    }
    if (sells[k]) {
      const v = goodsWorth(g, k, sells[k]);
      ex.sellPct += v / gdp;
      if (!ex.sell || v > ex.sell.v) ex.sell = { k, v };
    }
  }
  ex.material = (!!ex.buy && ex.buy.share >= EMBARGO_AI.dependShare) || ex.sellPct >= EMBARGO_AI.material || ex.buyPct >= EMBARGO_AI.material;
  return ex;
}

/* ---------- Opinion: what trade adds to how one nation sees another (O(1): read from the book) ---------- */
/* Items for opinionDetail(from, to). `noEmbargo`: leave out embargoes (for "old grudges", which must not feed on them). */
function tradeOpinionItems(g, from, to, noEmbargo) {
  const items = [];
  const T = g.trade;
  if (!T || !T.v || from === to) return items;
  if (!noEmbargo) {
    // their embargoes on us, while they stand: one item for the pair, by how much they hurt
    const on = (T.embargoes || []).filter(e => e.by === to && e.on === from);
    if (on.length) items.push({ label: `Their embargo still stands (${embargoGoodsText(on)})`, value: -Math.round(clamp(3 + 2 * on.reduce((s, e) => s + (e.hurt || 0), 0), 3, 15)) });
    const started = (T.embargoes || []).filter(e => e.by === to && e.why !== "retaliation").length;
    if (started >= EMBARGO_AI.bully) items.push({ label: "Bullies its trading partners", value: -4 });
  }
  // what binds us: a need they fill, good customers, a government that buys from us first
  const ex = tradeExposure(g, from, to);
  if (ex.buy && ex.buy.share >= EMBARGO_AI.dependShare) items.push({ label: `We buy ${ex.buy.share >= 0.5 ? "most" : "much"} of our ${tradeGoodWord(ex.buy.k)} from them`, value: 3 });
  if (ex.sell && ex.sell.v / Math.max(1, lastRecordedGdp(g, from)) >= EMBARGO_AI.material) items.push({ label: `Good customers for our ${tradeGoodWord(ex.sell.k)}`, value: 2 });
  if ((T.prefer || []).some(p => p.by === to && p.from === from)) items.push({ label: "Buys from us first", value: 2 });
  return items;
}
/* Opinion-change keys that come from embargoes (left out of "old grudges"). */
function embargoModKey(key) { return /^embargo/.test(key) || key === "starved" || key === "paid_to_trade" || key === "threatened_trade"; }

/* ---------- Why a government would cut off a trade: reasons and costs, in points ----------
   Points are on the deal scale: 1 point ≈ 1% of the deciding nation's yearly output, a yearly flow counted over
   four years. `est` is what the embargo does: { hurt (their % of output lost + 6 × the largest drop in fuel, arms or
   food), keyDrop, armyDrop (fuel or arms), lossThem, lossUs ($ a year) }. */
function embargoPair(w, g, x, y) {
  const n = g.nations[x];
  const O = g.opening;
  return {
    x, y, n, per: personality(n), gdp: Math.max(1, lastRecordedGdp(g, x, w)),
    th: threatFrom(w, g, x, y),
    op: opinionDetail(g, x, y, { noEmbargo: true }).value,
    ally: alliesOf(g, x).find(a => atWar(g, a, y)),
    enemies: enemiesOf(g, x).filter(z => z !== y),
    // the opening claimant, once its demand for the town is refused (a refusal counts from the moment it is made)
    claim: !!(O && O.by === x && y === PLAYER && (["refused", "war"].includes(O.stage) || (O.stage === "demand" && g.commitments.some(c => c.by === x && c.against === y)))),
    demand: g.commitments.some(c => c.by === x && c.against === y),
    early: y === PLAYER && g.turn < OPENING.grace,
  };
}
/* x is y's main seller of good k. */
function mainSupplierOf(g, x, y, k) { const d = dependence(g, y, k); return !!(d.length && d[0].from === x); }
function embargoReasonLines(g, P, k, est, ctx = {}) {
  const lines = [];
  const add = (code, label, pts) => { if (pts >= 0.5) lines.push({ code, label, pts: Math.round(pts * 10) / 10 }); };
  const { x, y, per } = P;
  const flow = v => (100 * v * DIPLO.horizonYears) / P.gdp;
  const qualifies = est.hurt >= EMBARGO_AI.minHurt || est.keyDrop >= EMBARGO_AI.minDrop;
  // retaliation: their embargo on us, answered once; a retaliation is never answered again
  const orig = ctx.original;
  if (orig) add("retaliation", `${orig.k === "all" ? "They cut off all trade with us" : `They cut off our trade in ${embargoGoodsText([orig])}`}: we answer in kind`, Math.min(9, 5 + 0.5 * DIPLO.horizonYears * (orig.hurt || 0)));
  if (P.n.minor) return lines;                      // a small state only ever answers an embargo
  const pressure = () => {
    if ((P.claim || P.demand) && qualifies) add("pressure", P.claim ? `Pressure to give up ${g.opening.town}, which is rightfully ours` : `Pressure: they refused our demands`, 4 + 4 * Math.min(1, est.keyDrop + est.hurt / 2));
  };
  if (P.early && !ctx.inForce) { if (P.claim) pressure(); return lines; }   // a new nation's first years: only its claimant and answers
  if (P.enemies.length) {
    // at war: no new quarrels with third parties, except with those who arm our enemy (when we are their main seller)
    const z = P.enemies.find(e => TRADE.strategic.some(s => (tradeSells(g, y, e)[s] || 0) > 1e-4));
    if (z !== undefined && (ctx.inForce || mainSupplierOf(g, x, y, k))) add("war_goods", `They sell war goods to our enemy, the ${nameOf(g, z)}`, 4);
    if (!ctx.inForce) return lines;
  }
  pressure();
  const army = est.armyDrop || 0;
  if (army > 0 && P.th > 0) add("threat", `Their army would lose fuel or weapons (${pct(army)} of what it needs)`, 8 * army * Math.min(1, P.th) * per.aggression);
  if (P.th > 0.3 && est.lossThem > 0) add("threat", `It weakens a dangerous neighbor (their output −${fmtMoney(est.lossThem)} a year)`, flow(est.lossThem) * (P.th - 0.3) * per.aggression);
  if (P.op < -40) add("hostility", `Old grudges (our opinion of them ${signed(P.op)}, not counting embargoes)`, Math.min(6, (-P.op - 40) / 5));
  if (P.ally !== undefined && (k === "all" || TRADE.strategic.includes(k))) add("ally_war", `They make war on our ally, the ${nameOf(g, P.ally)}`, 5);
  return lines;
}
function embargoCostLines(g, P, est) {
  const lines = [];
  const add = (label, pts) => { if (pts <= -0.5) lines.push({ code: "cost", label, pts: Math.round(pts * 10) / 10 }); };
  const { x, y, per } = P;
  if (est.lossUs > 0) add(`We would lose sales: ${fmtMoney(est.lossUs)} of output a year`, -(100 * est.lossUs * DIPLO.horizonYears) / P.gdp * per.tradeWeight);
  const ev = clamp(6 + 3 * est.hurt, 6, 20);
  add(`They will resent it (their opinion of us −${Math.round(ev)})`, -ev / 8);
  add("Caution about a new quarrel", -1.5 * per.caution);
  if (hasTrait(P.n, "honorable")) add("Our leader keeps faith with trading partners", -2);
  if (armyPower(g, y) > 1.5 * armyPower(g, x)) add("They are much stronger than us", -3);
  if (hasTreaty(g, x, y, "trade")) add("Our trade agreement with them", -4);
  return lines;
}
function embargoPtsSum(lines) { return lines.reduce((s, l) => s + l.pts, 0); }
function embargoMainWhy(lines) { const top = lines.filter(l => l.code !== "cost").sort((a, b) => b.pts - a.pts)[0]; return top ? top.code : "choice"; }

/* A quick estimate of cutting good k that x sells to y (only the two economies, which a menu has worked out already). */
function embargoEstimate(w, g, x, y, k) {
  const q = tradeSells(g, x, y)[k] || 0;
  const E = computeEconomy(w, g, y);
  const need = g.trade.need[k] ? g.trade.need[k][y] || 0 : 0;
  const share = need > 0 ? Math.min(1, q / need) : 0;
  const v = goodsWorth(g, k, q);
  let armyDrop = 0, foodDrop = 0;
  if (k === "food") foodDrop = Math.min(1, q / Math.max(0.001, E.pop));
  else {
    const sat = { ...E.sat };
    sat[k] = Math.max(0, (sat[k] ?? 1) - share);
    const arms0 = E.armsSat ?? 1, fuel0 = E.fuelSat ?? 1;
    const arms1 = Math.min(sat.metals ?? 1, ((sat.machinery ?? 1) + (sat.chemicals ?? 1)) / 2);
    const fuel1 = k === "oil" ? Math.min(fuel0, Math.min(1, sat.oil ?? 1)) : fuel0;
    armyDrop = Math.max(0, arms0 - Math.min(arms0, arms1), fuel0 - fuel1);
  }
  const keyDrop = Math.max(armyDrop, foodDrop);
  const X = computeEconomy(w, g, x);
  return { q, share, hurt: 100 * v / Math.max(1, E.gdp) + 6 * keyDrop, keyDrop, armyDrop, lossThem: v, lossUs: v * (X.trade && X.trade.worldExportCapRaw > 0 ? 0.5 : 1) };
}
/* The same numbers from a full preview (two worlds worked out: this season, and once merchants find others). */
function estFromPreview(pv, q) {
  return {
    q, hurt: pv.hurt, keyDrop: pv.keyDrop,
    armyDrop: Math.max(0, pv.fuel[0] - pv.fuel[1], pv.arms[0] - pv.arms[1]),
    lossThem: Math.max(0, -pv.dGdpThem),
    lossUs: Math.max(0, -(pv.dGdpSelf + pv.later.dGdpSelf) / 2),
  };
}

/* ---------- The options a rival weighs (diplomacy menu) ---------- */
/* At most one embargo (the best, checked with a full preview), and lifting its own embargoes (for Claude's minds:
   the rules mind lifts them in the season's review). */
function rivalEmbargoOptions(w, g, n) {
  const out = [];
  const T = g.trade;
  if (!T || !T.v || n.isPlayer || !n.alive) return out;
  const x = n.id;
  const cands = [];
  for (const z of liveNations(g)) {
    const y = z.id;
    if (y === x || atWar(g, x, y) || hasTreaty(g, x, y, "alliance")) continue;          // never on allies
    if ((T.promises || []).some(p => p.by === x && p.on === y && p.until > g.turn)) continue;   // paid to lift: a promise
    const sells = tradeSells(g, x, y);
    const goods = TRADE_GOODS.filter(k => (sells[k] || 0) > 1e-4);
    if (!goods.length) continue;
    // their embargo on us that we have not answered yet (and that is not itself an answer)
    const orig = (T.embargoes || []).find(e => e.by === y && e.on === x && e.why !== "retaliation" && !e.answered) || null;
    let P = null;
    for (const k of goods) {
      if (k === "food" && !(orig && embargoCovers(orig, "food"))) continue;   // food only to answer a food embargo
      if (embargoBlock(g, x, y, k, "sell")) continue;
      const est = embargoEstimate(w, g, x, y, k);
      if (est.hurt < EMBARGO_AI.minHurt && est.keyDrop < EMBARGO_AI.minDrop) continue;
      P = P || embargoPair(w, g, x, y);
      const reasons = embargoReasonLines(g, P, k, est, { original: orig });
      if (!reasons.length) continue;
      cands.push({ y, k, est, orig, self: embargoPtsSum(reasons) + embargoPtsSum(embargoCostLines(g, P, est)) });
    }
  }
  if (cands.length) {
    cands.sort((a, b) => b.self - a.self || a.y - b.y || TRADE_GOODS.indexOf(a.k) - TRADE_GOODS.indexOf(b.k));
    const c = cands[0];
    const pv = embargoPreview(w, g, x, c.y, c.k, "sell", c.k === "food");
    const est = estFromPreview(pv, c.est.q);
    if (est.hurt >= EMBARGO_AI.minHurt || est.keyDrop >= EMBARGO_AI.minDrop) {
      const P = embargoPair(w, g, x, c.y);
      const reasons = embargoReasonLines(g, P, c.k, est, { original: c.orig });
      const costs = embargoCostLines(g, P, est);
      const self = Math.min(EMBARGO_AI.cap, embargoPtsSum(reasons) + embargoPtsSum(costs));
      if (reasons.length && self >= 1) {
        const why = embargoMainWhy(reasons);
        out.push({ kind: "embargo", target: c.y, good: c.k, dir: "sell", food: c.k === "food", why, answers: c.orig ? c.orig.id : null, terms: [], threat: false,
          self: Math.round(self), other: 0, likely: "it takes effect at once",
          label: `Stop selling ${tradeGoodWord(c.k)} to the ${nameOf(g, c.y)} (${embargoAim(g, x, c.y, why)})`,
          lines: [...reasons, ...costs, ...pv.lines.filter(l => /^Their|^Fuel|^Metal/.test(l.label)).slice(0, 5).map(l => ({ code: "info", label: `${l.label}: ${l.value}`, pts: 0 }))],
          est: { q: est.q, hurt: sr(est.hurt, 2), keyDrop: sr(est.keyDrop, 3), armyDrop: sr(est.armyDrop, 3), lossThem: sr(est.lossThem, 3), lossUs: sr(est.lossUs, 3) } });
      }
    }
  }
  // lifting our own: worth it when its reasons are gone, or what it costs us outweighs them
  const per = personality(n), gdp = Math.max(1, lastRecordedGdp(g, x, w));
  for (const e of embargoesBy(g, x)) {
    const c = embargoCause(w, g, e);
    const gain = (100 * (e.cost || 0) * DIPLO.horizonYears) / gdp * per.tradeWeight;
    const gone = c.ended || c.score < EMBARGO_AI.liftCause;
    const self = gone ? Math.max(4, gain) : gain - c.score;
    if (self < 1) continue;
    const young = g.turn - e.since < TRADE.minEmbargo;
    const lines = [];
    if (gain >= 0.5) lines.push({ code: "gain", label: `Our merchants could sell to them again (${fmtMoney(e.cost)} of output a year)`, pts: Math.round(gain * 10) / 10 });
    if (gone) lines.push({ code: "gone", label: c.ended ? `Its reason is gone: ${c.text}` : "Its reasons have faded", pts: Math.round((self - gain) * 10) / 10 });
    else if (c.score > 0) lines.push({ code: "cause", label: `It still serves a purpose: ${c.lines[0] ? lcFirst(c.lines[0].label) : "pressure on them"}`, pts: -Math.round(c.score * 10) / 10 });
    out.push({ kind: "lift_embargo_self", target: e.on, embargoId: e.id, good: e.k, terms: [], threat: false, self: Math.round(Math.min(EMBARGO_AI.cap, self)), other: 0,
      likely: young ? "no goodwill: it began less than a year ago" : "they will welcome it",
      label: `Lift our embargo on the ${nameOf(g, e.on)} (${embargoGoodsText([e])})`, lines });
  }
  return out;
}
/* A victim asks to have an embargo lifted: both ways if it answered with one of its own, with money if that is
   what it takes (and still worth it to us). */
function pushLiftAsk(out, g, w, x, y) {
  const mutual = embargoesBy(g, x, y).length > 0;
  const terms = [mutual ? { type: "lift_embargo", by: "both" } : { type: "lift_embargo", by: y, on: x }];
  const before = out.length;
  pushDeal(out, g, w, x, y, terms, "lift_embargo", false);
  if (out.length > before) return;
  const asked = g.nations[x].lastAsked || {};
  if (asked[`lift_embargo:${y}`] !== undefined && g.turn - asked[`lift_embargo:${y}`] < 6) return;
  if (validateDeal(g, w, x, y, terms)) return;
  const theirs = evaluateDeal(g, w, y, x, terms, { noCounter: true });
  if (theirs.points >= 0 || theirs.points < -2 * DIPLO.counterGap) return;
  const gdpY = Math.max(1, computeEconomy(w, g, y).gdp);
  const amount = Math.max(0.5, Math.ceil(((-theirs.points + 1) * gdpY / 100) * 2) / 2);
  if (amount > 0.5 * Math.max(0, g.nations[x].treasury)) return;
  pushDeal(out, g, w, x, y, terms.concat([{ type: "payment", from: x, amount }]), "lift_embargo", false);
}

/* ---------- The reasons behind an embargo in force (for the review, lifting and deals) ---------- */
/* { score, lines, ended, text }: `ended` when what it was for is over (the embargo it answered was lifted, the claim
   was settled, the war it was about ended). `opts.ignoreAnswers`: in a deal where the other side lifts too. */
function embargoCause(w, g, e, opts = {}) {
  const T = g.trade;
  const n = g.nations[e.by];
  if (!n || !n.alive || !g.nations[e.on] || !g.nations[e.on].alive) return { score: 0, lines: [], ended: true, text: "that nation is gone" };
  let orig = null;
  if (e.why === "retaliation") {
    orig = e.answers !== null && e.answers !== undefined ? (T.embargoes || []).find(x => x.id === e.answers) || null : null;
    if (!orig || opts.ignoreAnswers) return { score: 0, lines: [], ended: true, text: "the embargo it answered has been lifted" };
  }
  const est = { hurt: e.hurt || 0, keyDrop: e.keyDrop ?? (e.hurt || 0) / 6, armyDrop: e.armyDrop ?? 0, lossThem: e.lossThem ?? 0, lossUs: 0 };
  const P = embargoPair(w, g, e.by, e.on);
  const lines = embargoReasonLines(g, P, e.k, est, { original: orig, inForce: true });
  const score = Math.min(EMBARGO_AI.cap, embargoPtsSum(lines));
  const has = code => lines.some(l => l.code === code);
  const endText = { pressure: g.opening && g.opening.by === e.by ? "the claim is settled" : "the quarrel over the refused demands is over", ally_war: "the war it was about is over", war_goods: "the trade in war goods it was about has stopped" };
  const ended = !!endText[e.why] && !has(e.why);
  return { score, lines, ended, text: ended ? endText[e.why] : "" };
}

/* ---------- Carrying out a chosen option (checked again: menus are made before the player moves) ---------- */
function executeRivalEmbargo(g, w, n, o, why, letterText, dispatch, say) {
  const x = n.id, y = o.target, T = g.trade;
  if (!T || !T.v || embargoBlock(g, x, y, o.good, o.dir) || hasTreaty(g, x, y, "alliance")) return false;
  const q = tradeSells(g, x, y)[o.good] || 0;
  if (q <= 1e-4 || q < 0.5 * ((o.est && o.est.q) || 0)) return false;          // most of that trade is gone already
  let orig = null;
  if (o.answers !== null && o.answers !== undefined) {
    orig = T.embargoes.find(e => e.id === o.answers && !e.answered) || null;
    if (!orig) return false;                                                    // what it answered was lifted
  }
  const pv = embargoPreview(w, g, x, y, o.good, o.dir, o.food);
  const est = estFromPreview(pv, q);
  if (est.hurt < EMBARGO_AI.minHurt && est.keyDrop < EMBARGO_AI.minDrop) return false;
  const reasons = embargoReasonLines(g, embargoPair(w, g, x, y), o.good, est, { original: orig });
  if (embargoPtsSum(reasons) < EMBARGO_AI.liftCause) return false;                     // the cause no longer stands
  const code = embargoMainWhy(reasons);
  const r = declareEmbargo(w, g, x, y, o.good, o.dir, code, { preview: pv, answers: orig ? orig.id : null, food: !!o.food, letter: letterText || templateLetter(g, n, { ...o, why: code }) });
  if (!r.ok) return false;
  Object.assign(r.e, { keyDrop: sr(est.keyDrop, 3), armyDrop: sr(est.armyDrop, 3), lossThem: sr(est.lossThem, 3), cost: sr(est.lossUs, 3) });
  if (orig) orig.answered = r.e.id;
  const top = reasons.slice().sort((a, b) => b.pts - a.pts)[0];
  if (y === PLAYER) {
    const heard = embargoWhyHeard(g, r.e);
    const it = g.inbox[g.inbox.length - 1];
    if (it && it.kind === "embargo" && it.from === x) { it.why = code; it.reason = heard; }
    const key = o.good === "all" || TRADE.key.includes(o.good);
    dispatch.trade.push({ text: `The ${n.name} ${embargoVerb(r.e)} us${heard ? `, ${heard}` : ""}. Our merchants are looking for other sellers.`, tone: key ? "bad" : "warn", nid: x, minister: o.good === "food" ? "agriculture" : "economy", pause: key, key });
  }
  say(`${embargoVerb(r.e).replace(/^./, ch => ch.toUpperCase())} the ${nameOf(g, y)}.`, why || (top ? top.label : ""));
  return true;
}
function executeRivalLift(g, w, n, o, why, dispatch, say) {
  const e = ((g.trade && g.trade.embargoes) || []).find(x => x.id === o.embargoId && x.by === n.id);
  if (!e) return false;
  return liftWithAnswers(w, g, e, why || "", dispatch, say);
}
/* Lift an embargo, and with it the rivals' embargoes that answered it (a retaliation ends with what it answered). */
function liftWithAnswers(w, g, e, why, dispatch, say, opts = {}) {
  const T = g.trade;
  const answering = T.embargoes.filter(x => x.answers === e.id && x.by !== e.by);
  const r = liftEmbargo(w, g, e.id, e.by, opts);
  if (!r.ok) return false;
  tellLift(g, e, why, dispatch, say);
  for (const a of answering) {
    if (!T.embargoes.includes(a)) continue;
    if (g.nations[a.by].isPlayer) {
      if (dispatch) dispatch.trade.push({ text: `The ${nameOf(g, e.by)} lifted its embargo on us. Ours, which answered it (${embargoGoodsText([a])}), still stands: you can lift it in the Trade panel.`, tone: "neutral", nid: e.by, minister: "economy" });
      continue;
    }
    const r2 = liftEmbargo(w, g, a.id, a.by);
    if (r2.ok) tellLift(g, a, "the embargo it answered has been lifted", dispatch, null);
  }
  return true;
}
function tellLift(g, e, why, dispatch, say) {
  const goods = embargoGoodsText([e]);
  if (e.by !== PLAYER) remember(g, e.by, `We lifted our embargo on the ${nameOf(g, e.on)} (${goods})${why ? `: ${why}` : ""}.`);
  if (!dispatch) return;
  if (e.on === PLAYER) dispatch.trade.push({ text: `The ${nameOf(g, e.by)} lifted its embargo on us (${goods})${why ? `: ${why}` : ""}. Our merchants can trade with them again.`, tone: "good", nid: e.by, minister: e.k === "food" ? "agriculture" : "economy" });
  const text = `Lifted its embargo on the ${nameOf(g, e.on)} (${goods}).`;
  const cap = why ? why.charAt(0).toUpperCase() + why.slice(1) + "." : null;
  if (say) say(text, cap);
  else if (e.by !== PLAYER) { dispatch.abroad.push({ nid: e.by, text, why: cap }); noteFor(g.nations[e.by], g, text, cap); }
}

/* ---------- The season's review: embargoes rivals keep or lift, by fixed rules (no chance) ----------
   Start of the season, before the rivals act. A rival lifts when the embargo is at least a year old and its
   reasons are weak, when it costs the rival more than its reasons are worth, or when what it was for is over. */
function reviewEmbargoes(w, g, dispatch) {
  const T = g.trade;
  if (!T || !T.v || !(T.embargoes || []).length) return;
  for (let pass = 0; pass < 3; pass++) {
    let lifted = false;
    for (const e of T.embargoes.slice().sort((a, b) => a.id - b.id)) {
      if (!T.embargoes.includes(e)) continue;
      const n = g.nations[e.by];
      if (!n || !n.alive || n.isPlayer) continue;
      const c = embargoCause(w, g, e);
      const age = g.turn - e.since;
      const lossPts = (100 * (e.cost || 0) * DIPLO.horizonYears) / Math.max(1, lastRecordedGdp(g, e.by)) * personality(n).tradeWeight;
      let why = null;
      if (c.ended) why = c.text;
      else if (age >= EMBARGO_AI.liftAge && c.score < EMBARGO_AI.liftCause) why = "its reasons have faded";
      else if (lossPts > c.score + EMBARGO_AI.liftLoss) why = `the lost sales cost more than it was worth (${fmtMoney(e.cost)} a year)`;
      if (!why) continue;
      if (liftWithAnswers(w, g, e, why, dispatch, null)) lifted = true;
    }
    if (!lifted) break;
  }
}
/* Before the contracts are signed again: what each new embargo cut, read from the contracts it stopped (the
   victim's purchases `in` and sales `out`, units a year). Kept on the entry to judge it later. */
function noteEmbargoCuts(g) {
  const T = g.trade;
  if (!T || !T.v) return;
  for (const e of T.embargoes || []) {
    if (e.q0) continue;
    const q0 = { in: {}, out: {} };
    for (const f of T.flows || []) {
      if (f.s === e.by && f.b === e.on && e.dir !== "buy" && embargoCovers(e, f.k)) q0.in[f.k] = sr((q0.in[f.k] || 0) + f.q, 4);
      if (f.s === e.on && f.b === e.by && e.dir !== "sell" && embargoCovers(e, f.k)) q0.out[f.k] = sr((q0.out[f.k] || 0) + f.q, 4);
    }
    e.q0 = q0;
    if (e.hurt0 === undefined) e.hurt0 = e.hurt || 0;
  }
}
/* After the contracts are signed: how much each embargo still hurts. The target's share of what it cut that it still
   cannot buy (or sell) anywhere else scales the hurt measured when it was declared; what the nation that keeps it
   cannot sell elsewhere is its own cost. */
function refreshEmbargoes(w, g) {
  const T = g.trade;
  if (!T || !T.v || !(T.embargoes || []).length) return;
  const left = (pool, k, id) => (T[pool] && T[pool][k] ? T[pool][k][id] || 0 : 0);
  for (const e of T.embargoes) {
    if (!e.q0 || !g.nations[e.by].alive || !g.nations[e.on].alive || atWar(g, e.by, e.on)) continue;
    let cut = 0, still = 0, cost = 0;
    for (const [k, q] of Object.entries(e.q0.in)) {
      const v = goodsWorth(g, k, q);
      cut += v; still += v * Math.min(1, left("unmet", k, e.on) / Math.max(1e-6, q));
      cost += goodsWorth(g, k, Math.min(q, left("unsold", k, e.by)));
    }
    for (const [k, q] of Object.entries(e.q0.out)) {
      const v = goodsWorth(g, k, q);
      cut += v; still += v * Math.min(1, left("unsold", k, e.on) / Math.max(1e-6, q));
      cost += goodsWorth(g, k, Math.min(q, left("unmet", k, e.by)));
    }
    if (cut <= 1e-6) continue;
    const f = still / cut, h0 = e.hurt0 ?? e.hurt ?? 0;
    e.hurt = sr(h0 * f, 2);
    if (e.kd0 === undefined) { e.kd0 = e.keyDrop ?? h0 / 6; e.ad0 = e.armyDrop ?? 0; e.lt0 = e.lossThem ?? 0; }
    e.keyDrop = sr(e.kd0 * f, 3); e.armyDrop = sr(e.ad0 * f, 3); e.lossThem = sr(e.lt0 * f, 3);
    e.cost = sr(cost, 3);
  }
}

/* ---------- Rivals buy from friends first (the same preferred-seller choice the player has) ---------- */
function rivalPreferredSellers(w, g) {
  const T = g.trade;
  if (!T || !T.v) return;
  const ix = tradeIndex(g);
  for (const n of liveNations(g)) {
    if (n.isPlayer) continue;
    const b = n.id;
    const friend = s => g.nations[s] && g.nations[s].alive && (hasTreaty(g, b, s, "alliance") || hasTreaty(g, b, s, "trade"));
    for (const p of (T.prefer || []).filter(p => p.by === b)) if (!friend(p.from) || tradeBlocked(g, p.from, b, p.k)) setPreferredSeller(g, b, p.k, null);
    for (const k of TRADE_LOAD_ORDER) {
      if (T.prefer.filter(p => p.by === b).length >= 3) break;
      if (T.prefer.some(p => p.by === b && p.k === k)) continue;
      const flows = ((ix.into[b] || {})[k] || []).filter(f => f.s >= 0 && !tradeBlocked(g, f.s, b, k));
      if (!flows.length) continue;
      const price = s => { const L = tradeLink(g, s, b); return L ? deliveredPrice(g, k, s, b, L.m, L.d).p : Infinity; };
      const cheapest = Math.min(...flows.map(f => price(f.s)));
      // a friend with goods to spare (or already selling to us, though not most of it) within 5% of the cheapest
      const main = flows.slice().sort((a, c) => c.q - a.q || a.s - c.s)[0].s;
      const pick = liveNations(g).filter(z => z.id !== b && z.id !== main && friend(z.id) && tradeLink(g, z.id, b) && !tradeBlocked(g, z.id, b, k)
        && ((T.unsold[k] ? T.unsold[k][z.id] || 0 : 0) > 0.01 || flows.some(f => f.s === z.id)) && price(z.id) <= cheapest * (1 + EMBARGO_AI.preferBand))
        .sort((a, c) => price(a.id) - price(c.id) || a.id - c.id)[0];
      if (pick) setPreferredSeller(g, b, k, pick.id);
    }
  }
}

/* ---------- Early warning: the player hears when a rival weighs cutting off its trade ---------- */
function tradeEarlyWarning(w, g, n, menu, orders, dispatch) {
  const T = g.trade;
  if (!T || !T.v || !menu || !g.nations[PLAYER].alive) return;
  const o = (menu.diplomacy || []).filter(d => d.kind === "embargo" && d.target === PLAYER && d.self >= EMBARGO_AI.warnSelf).sort((a, b) => b.self - a.self)[0];
  if (!o) return;
  if (embargoesBy(g, n.id, PLAYER).some(e => e.since === g.turn)) return;      // it went ahead: the letter says so
  const warned = T.warned || (T.warned = {});
  if (warned[n.id] !== undefined && g.turn - warned[n.id] < EMBARGO_AI.warnEvery) return;
  warned[n.id] = g.turn;
  const heard = embargoWhyHeard(g, { why: o.why, by: n.id, on: PLAYER }, true);
  const d = dependence(g, PLAYER, o.good).find(x => x.from === n.id);
  dispatch.warnings.push(`The ${n.name}'s merchants talk of cutting off your ${tradeGoodWord(o.good)}${heard ? `, ${heard}` : ""}.${d ? ` ${pct(d.share)} of your ${tradeGoodWord(o.good)} comes from them.` : ""} Other sellers, a trade road or a harbor would make you less dependent.`);
}

/* ---------- Food aid from rival governments, after the contracts are signed ----------
   A nation where more than 2% go hungry gets grain from the richest government that can reach it, thinks well of it
   (or is its ally or trade partner) and has 4 months of food in store. Enough for one season of the shortfall. */
function rivalFoodAid(w, g, dispatch) {
  const T = g.trade;
  if (!T || !T.v) return;
  withEconMemo(g, () => rivalFoodAidRaw(w, g, dispatch, T));
}
function rivalFoodAidRaw(w, g, dispatch, T) {
  const hungry = [];
  for (const v of liveNations(g)) { const E = computeEconomy(w, g, v.id); if (E.famineShare > EMBARGO_AI.aidFamine) hungry.push({ v, E }); }
  for (const { v, E } of hungry) {
    const donors = [];
    for (const d of liveNations(g)) {
      if (d.isPlayer || d.id === v.id || atWar(g, d.id, v.id)) continue;
      if ((T.aid || []).some(a => a.from === d.id && a.to === v.id && g.turn - a.turn < EMBARGO_AI.aidCooldown)) continue;
      if (embargoesBy(g, d.id, v.id).some(e => embargoCovers(e, "food"))) continue;
      const friendly = opinionDetail(g, d.id, v.id).value >= 0 || hasTreaty(g, d.id, v.id, "alliance") || hasTreaty(g, d.id, v.id, "trade") || tradeExposure(g, d.id, v.id).material;
      if (!friendly) continue;
      const dPop = (d.history.slice(-1)[0] || {}).pop || 0;
      const stock = (d.granary && d.granary.stock) || 0;
      if (monthsOfFood(stock, dPop) < EMBARGO_AI.aidMonths) continue;
      donors.push({ d, gdp: lastRecordedGdp(g, d.id), spare: stock - EMBARGO_AI.aidKeep * dPop / 12 });
    }
    donors.sort((a, b) => b.gdp - a.gdp || a.d.id - b.d.id);
    for (const x of donors) {
      const months = Math.min(3 * E.famineShare, x.spare / Math.max(1e-6, E.pop / 12));
      if (months <= 0.01) continue;
      const qt = foodAidQuote(w, g, x.d.id, v.id, months);
      if (!qt.ok) continue;
      const r = sendFoodAid(w, g, x.d.id, v.id, months);
      if (!r.ok) continue;
      remember(g, x.d.id, `We sent grain to the hungry ${v.name}.`);
      const text = `Sent grain to the hungry ${v.name}: food for ${fmtPeople(r.q * 12 / Math.max(1e-6, r.months))} people for ${r.months.toFixed(1)} months.`;
      if (v.isPlayer) dispatch.trade.push({ text: `The ${x.d.name} sent us grain while our people go hungry: food for ${fmtPeople(r.q * 12 / Math.max(1e-6, r.months))} people for ${r.months.toFixed(1)} months, into our reserve.`, tone: "good", nid: x.d.id, minister: "agriculture" });
      dispatch.abroad.push({ nid: x.d.id, text, why: `${pct(E.famineShare)} of their people do not have enough food.` });
      noteFor(x.d, g, text, null);
      break;
    }
  }
}

/* ---------- Comparing an imagined world with the real one ---------- */
/* The economy an imagined world (`hypothetical`) is measured against: the real one, unless imagined worlds settle trade
   by a different rule than the real game (merchants finding new sellers), in which case a copy imagined with no change,
   so that only the change itself is valued. */
function econBaseFor(w, g, nid, econ) {
  const h0 = hypothetical(g, {});
  if (!!h0.reroute === !!g.reroute && !!h0.noReroute === !!g.noReroute) return econ || computeEconomy(w, g, nid);
  return computeEconomy(w, h0, nid);
}

/* ---------- War and trade: what a war would cost in trade, and when an embargo is a just cause ---------- */
/* Output x would lose a year if all trade with y stopped (once its merchants have found other sellers), or null when
   there is no trade book yet (the old flat cost of a trade agreement applies then). A war also ends every treaty, so a
   trade agreement's buyers leave the market with it. */
function warTradeLoss(w, g, x, y, econX) {
  const T = g.trade;
  if (!T || !T.v) return null;
  const ix = tradeIndex(g);
  const treaty = hasTreaty(g, x, y, "trade");
  if (!treaty && !((ix.pairV[`${x}>${y}`] || 0) + (ix.pairV[`${y}>${x}`] || 0) > 0)) return 0;
  const h = hypothetical(g, { embargo: { id: -1, by: x, on: y, k: "all", dir: "both", food: true, since: g.turn, why: "war", hurt: 0, answers: null } });
  if (treaty) h.treaties = g.treaties.filter(t => !(t.type === "trade" && ((t.a === x && t.b === y) || (t.a === y && t.b === x))));
  return Math.max(0, econBaseFor(w, g, x, econX).gdp - computeEconomy(w, h, x).gdp);
}
/* y's embargo on x as a cause for war: food cut off while x is hungry (strong), or trade strangled (a real share of
   x's output or a key supply), while it stands or for two years after. */
function strangledTrade(g, x, y, w) {
  const T = g.trade;
  if (!T || !T.v) return null;
  let hurt = 0, food = false;
  for (const e of T.embargoes || []) if (e.by === y && e.on === x) { hurt = Math.max(hurt, e.hurt || 0); if (embargoCovers(e, "food")) food = true; }
  for (const e of T.ended || []) if (e.by === y && e.on === x && g.turn - e.turn <= EMBARGO_AI.justSeasons) hurt = Math.max(hurt, e.hurt || 0);
  if (food && w && computeEconomy(w, g, x).famineShare > EMBARGO_AI.aidFamine) return { food: true, hurt };
  return hurt >= EMBARGO_AI.justHurt ? { food: false, hurt } : null;
}

/* ---------- Letters: what a threat to cut off trade could cost them ---------- */
/* How much E stands to lose if P cut off trade: the share of a key need P fills (or of good k, when the letter names
   one), and E's sales to P against its output. strength 0..1. */
function tradeLeverage(g, E, P, k) {
  const ex = tradeExposure(g, E, P);
  let share = ex.buy ? ex.buy.share : 0, good = ex.buy ? ex.buy.k : null;
  if (k && GOODS[k] && g.trade && g.trade.need && g.trade.need[k]) {
    const q = tradeSells(g, P, E)[k] || 0, need = g.trade.need[k][E] || 0;
    if (need > 0 && q > 0) { share = Math.min(1, q / need); good = k; }
  }
  const sales = ex.sellPct / 0.03;
  const strength = clamp(Math.max(share, sales), 0, 1);
  const byShare = share >= sales && good;
  return { strength, k: good,
    why: byShare ? `they buy ${pct(share)} of their ${tradeGoodWord(good)} from you` : `they sell you goods worth ${pct1(ex.sellPct)} of their output`,
    whyUs: byShare ? `we buy ${pct(share)} of our ${tradeGoodWord(good)} from you` : `we sell you goods worth ${pct1(ex.sellPct)} of our output` };
}
/* A good named in a letter ("your oil", "grain"), or null. */
function goodInText(t) {
  const words = [["food", /\b(food|grain|wheat|bread|harvests?)\b/], ["oil", /\b(oil|gas|petrol|fuel)\b/], ["metals", /\b(metals?|iron|steel|copper)\b/], ["coal", /\bcoal\b/], ["timber", /\b(timber|wood|lumber)\b/],
    ["gold", /\bgold\b/], ["machinery", /\b(machinery|machines|tools)\b/], ["chemicals", /\bchemicals?\b/], ["electronics", /\belectronics\b/], ["goods", /\bconsumer goods\b/]];
  for (const [k, re] of words) if (re.test(t)) return k;
  return null;
}

/* ---------- Briefs for Claude: one line of trade per nation, and per pair ---------- */
function tradeBrief(g, n, econ) {
  const T = g.trade;
  if (!T || !T.v) return "Trade: no contracts yet.";
  const tr = tradeOf(g, n.id);
  const who = id => (id < 0 ? "the world market" : `the ${nameOf(g, id)}`);
  const val = x => x.v || 0;
  // the goods worth most, each with its two main sellers and buyers, grouped by partner
  const goods = Object.entries(tr.goods).map(([k, G]) => ({ k, G, v: G.from.reduce((s, f) => s + (f.code ? 0 : val(f)), 0) + G.to.reduce((s, f) => s + (f.code ? 0 : val(f)), 0) })).sort((a, b) => b.v - a.v).slice(0, 6);
  const buys = new Map(), sells = new Map();
  const put = (m, id, text) => { if (!m.has(id)) m.set(id, []); m.get(id).push(text); };
  for (const { k, G } of goods) {
    for (const f of G.from.filter(f => !f.code).slice(0, 2)) put(buys, f.nid, `${tradeGoodWord(k)}${f.share >= 0.05 ? ` (${pct(f.share)} of our need)` : ""}`);
    for (const f of G.to.filter(f => !f.code).slice(0, 2)) put(sells, f.nid, tradeGoodWord(k));
  }
  const list = m => [...m].map(([id, gs]) => `${bJoin(gs)} ${m === buys ? "from" : "to"} ${who(id)}`).join("; ");
  const on = embargoesOn(g, n.id).map(e => `the ${nameOf(g, e.by)} ${embargoVerb(e)} us since ${seasonLabel(e.since)}`);
  const by = embargoesBy(g, n.id).map(e => `we ${embargoVerb(e)} the ${nameOf(g, e.on)} since ${seasonLabel(e.since)} (${embargoAim(g, n.id, e.on, e.why)})`);
  const closed = econ && econ.trade && !(econ.trade.worldImportCapRaw > 0);
  return `Trade (a year): we buy ${list(buys) || "nothing from abroad"}; we sell ${list(sells) || "nothing abroad"}${closed ? `; the world market beyond the map is closed to us${tr.goods.gold && tr.goods.gold.to.some(f => f.nid < 0) ? ", except for gold (its banks buy all we mine)" : ""}: we have no harbor on the ocean, and no trade partner with one` : ""}${on.length ? `. Embargoes on us: ${on.join("; ")}` : ""}${by.length ? `. Our embargoes: ${by.join("; ")}` : ""}.`;
}
function tradeRelationBrief(g, a, b) {
  const T = g.trade;
  if (!T || !T.v) return "";
  const t = tradeWith(g, a, b);
  const part = (o, whose) => Object.entries(o).filter(([, x]) => !x.blocked && x.v >= 0.05).sort((p, q) => q[1].v - p[1].v).slice(0, 3).map(([k, x]) => `${tradeGoodWord(k)} ${fmtMoney(x.v)}${x.shareOfNeed >= 0.05 ? ` (${pct(x.shareOfNeed)} of ${whose} need)` : ""}`);
  const weSell = part(t.aSells, "their"), weBuy = part(t.bSells, "our");
  const emb = t.embargoes.map(e => (e.by === a ? `our embargo: we ${embargoVerb(e)} them` : `their embargo: they ${embargoVerb(e)} us`));
  const link = t.link ? { land: "across our border", over: "by caravan across wild land", sea: `by sea, ${Math.round(t.link.d).toLocaleString("en-US")} km` }[t.link.m] : null;
  if (!weSell.length && !weBuy.length && !emb.length) return link ? `; trade: none yet, though goods could pass ${link}` : "";
  return `; trade a year${link ? ` (${link})` : ""}: we sell them ${weSell.join(", ") || "nothing"}, we buy from them ${weBuy.join(", ") || "nothing"}${emb.length ? `; ${emb.join("; ")}` : ""}${t.promise ? `; the ${nameOf(g, t.promise.by)} was paid to lift an embargo on the ${nameOf(g, t.promise.on)} and promised not to bring it back before ${seasonLabel(t.promise.until)}` : ""}`;
}
/* For the letter analyst: who each nation trades with and its embargoes, so claims of dependence can be checked. */
function tradeFacts(g, nid) {
  const T = g.trade;
  if (!T || !T.v) return "";
  const tr = tradeOf(g, nid);
  const ps = tr.partners.filter(p => !p.blocked && p.sellV + p.buyV > 0.01).slice(0, 3).map(p => `${nameOf(g, p.nid)} (sells them ${bJoin(Object.keys(p.sell).map(tradeGoodWord)) || "nothing"}, buys ${bJoin(Object.keys(p.buy).map(tradeGoodWord)) || "nothing"})`);
  const emb = embargoesBy(g, nid).map(e => `${embargoVerb(e)} ${nameOf(g, e.on)}`);
  return `${ps.length ? `, trades with ${ps.join(", ")}` : ""}${emb.length ? `, has ${emb.join(" and ")}` : ""}`;
}

/* ---------- The World Assembly: hunger as a weapon, and a nation that bullies its partners ---------- */
function tradeTopicCandidates(w, g, ready, recent) {
  const T = g.trade;
  const out = [];
  if (!T || !T.v) return out;
  for (const e of T.embargoes || []) {
    if (!embargoCovers(e, "food") || !g.nations[e.on].alive || !g.nations[e.by].alive) continue;
    if (recent("condemn", t => t.target === e.by) || computeEconomy(w, g, e.on).famineShare <= EMBARGO_AI.aidFamine) continue;
    const authors = [e.on, ...alliesOf(g, e.on)].filter(id => id !== e.by && ready(id));
    if (authors.length) out.push({ score: 2.5, spec: { kind: "condemn", author: authors[0], target: e.by, why: "starve" } });
  }
  for (const z of liveNations(g)) {
    const mine = (T.embargoes || []).filter(e => e.by === z.id && e.why !== "retaliation");
    if (mine.length < EMBARGO_AI.bully || recent("condemn", t => t.target === z.id)) continue;
    const author = mine.map(e => e.on).sort((a, b) => a - b).find(id => ready(id));
    if (author !== undefined) out.push({ score: 1.5, spec: { kind: "condemn", author, target: z.id, why: "bully" } });
  }
  return out;
}
