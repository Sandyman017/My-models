/* =====================================================================
   16g. The cabinet in the panels: the ministries, their ministers, talking to them, their orders
   ===================================================================== */
const MIN_ICON = { interior: "minInterior", economy: "minEconomy", agriculture: "minAgriculture", energy: "minEnergy", defence: "minDefence", foreign: "minForeign" };
const LIMIT_LABELS = ["Ask me first", "Small sums", "Medium sums", "Large sums"];

/* ---------- A portrait drawn from the minister's own seed: the same face every time ---------- */
function ministerPortrait(m, size = 56) {
  const r = mulberry32((m.face || 1) >>> 0);
  const skin = pick(r, ["#f1cba8", "#e2b08a", "#c98d66", "#a9714d", "#7e5036"]);
  const grey = m.age >= 58 ? 0.75 : m.age >= 48 ? 0.3 : 0;
  const hair = r() < grey ? pick(r, ["#b8b4ae", "#d6d3cf", "#8f8b86"]) : pick(r, ["#26190f", "#3f2a1a", "#6b4a2b", "#a07a4c", "#1c1c1c"]);
  const suit = pick(r, ["#2b3a4e", "#3a2e2a", "#2c3b32", "#463a58", "#33363b", "#5a2f2f"]);
  const tie = pick(r, ["#b8443a", "#c9a24a", "#3f6fa0", "#6d8f4e", "#7b4a8c"]);
  const f = m.sex === "f";
  const style = Math.floor(r() * 3);
  const glasses = r() < 0.28, beard = !f && r() < 0.22, moustache = !f && !beard && r() < 0.25;
  const id = `pc${m.id}x${(ministerPortrait.k = (ministerPortrait.k || 0) + 1)}`;
  const longHair = f ? `<path d="M15 26c0-11 6-18 13-18s13 7 13 18v14H15z" fill="${hair}"/>` : "";
  const top = f
    ? [`<path d="M17 25c1-9 6-14 11-14s10 5 11 14c-3-5-7-7-11-7s-8 2-11 7z" fill="${hair}"/>`, `<path d="M17 26c0-10 5-15 11-15s11 5 11 15c-2-6-7-9-11-9-5 0-8 4-11 9z" fill="${hair}"/>`, `<path d="M16 27c0-11 5-16 12-16 6 0 11 4 12 13-4-4-9-5-14-4-4 1-7 3-10 7z" fill="${hair}"/>`][style]
    : [`<path d="M18 24c0-8 4-12 10-12s10 4 10 12c-1-4-4-6-10-6s-9 2-10 6z" fill="${hair}"/>`, `<path d="M18 23c1-7 5-11 10-11 6 0 10 4 10 11-2-3-5-4-9-4-5 0-8 1-11 4z" fill="${hair}"/>`, `<path d="M18 26c0-2 1-4 2-5l1 5zM38 26c0-2-1-4-2-5l-1 5z" fill="${hair}"/>`][style];
  const face = `<ellipse cx="28" cy="27" rx="9.5" ry="11" fill="${skin}"/>
    <circle cx="24.5" cy="26" r="1.1" fill="#221a14"/><circle cx="31.5" cy="26" r="1.1" fill="#221a14"/>
    <path d="M25 32.5q3 1.8 6 0" stroke="#5a3a2a" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    ${beard ? `<path d="M19 29c1 8 5 10 9 10s8-2 9-10c-2 3-5 4-9 4s-7-1-9-4z" fill="${hair}"/>` : ""}
    ${moustache ? `<path d="M24.5 31c2-1 5-1 7 0-2 .8-5 .8-7 0z" fill="${hair}"/>` : ""}
    ${glasses ? `<g fill="none" stroke="#1b1b1b" stroke-width="0.9"><circle cx="24.5" cy="26" r="2.6"/><circle cx="31.5" cy="26" r="2.6"/><path d="M27.1 26h1.8"/></g>` : ""}`;
  const body = `<path d="M8 56c1-10 8-15 20-15s19 5 20 15z" fill="${suit}"/>
    <rect x="25" y="35" width="6" height="7" fill="${skin}"/>
    <path d="M23 41l5 7 5-7z" fill="#ece8e1"/>${f ? "" : `<path d="M27.2 42h1.6l1 7-1.8 2-1.8-2z" fill="${tie}"/>`}`;
  return `<svg class="portrait" width="${size}" height="${size}" viewBox="0 0 56 56" aria-hidden="true"><defs><clipPath id="${id}"><circle cx="28" cy="28" r="28"/></clipPath></defs>
    <g clip-path="url(#${id})"><rect width="56" height="56" fill="#26302b"/>${longHair}${body}${face}${top}</g></svg>`;
}
function starsHtml(skill) {
  return `<span class="stars" title="Skill ${skill} of 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= skill ? "on" : ""}">★</i>`).join("")}</span>`;
}
function loyaltyWord(v) { return v >= 75 ? "devoted" : v >= 55 ? "loyal" : v >= 35 ? "uneasy" : v >= 20 ? "resentful" : "about to quit"; }
function ministerEffectText(n, key) {
  const k = cabinetK(n, key), m = ministry(n, key).minister;
  const extra = [minHas(m, "popular") ? "popular: +1 stability" : "", minHas(m, "corrupt") ? "corrupt: −1% tax revenue" : ""].filter(Boolean);
  if (Math.abs(k) < 0.25) return `An average minister: ${hisHer(m)} skill brings no gain and no loss.${extra.length ? ` ${extra.join("; ").replace(/^./, c => c.toUpperCase())}.` : ""}`;
  const sgn = k > 0;
  const parts = [];
  if (key === "interior") parts.push(`${signed1(CAB.stab * k)} stability`);
  if (key === "economy") parts.push(`${sgn ? "+" : "−"}${(Math.abs(CAB.output * k) * 100).toFixed(1)}% output`);
  if (key === "agriculture") parts.push(`${sgn ? "+" : "−"}${(Math.abs(CAB.food * k) * 100).toFixed(1)}% food from the farms`);
  if (key === "energy") parts.push(`${sgn ? "+" : "−"}${pct(Math.abs(CAB.power * k))} electricity from the same power stations`);
  if (key === "defence") parts.push(`peacetime drill ${sgn ? "raises" : "only raises"} experience to ${pct(drillCapFor(n))}`);
  if (key === "foreign") parts.push(`other nations' opinion of you ${signed(Math.round(CAB.opinion * k))}`);
  return `${sgn ? "A capable minister" : "A weak minister"}: ${parts.concat(extra).join("; ")}.`;
}
function traitChips(m) { const gk = ministerGroup(m); return (gk ? `<span class="chip" style="border-color:${GROUPS[gk].color}" title="${escapeHtml(GROUPS[gk].who)}">From: ${escapeHtml(GROUPS[gk].label)}</span>` : "") + m.traits.map(t => `<span class="chip tone-neutral" title="${escapeHtml(MIN_TRAITS[t].note)}">${MIN_TRAITS[t].label}</span>`).join(""); }

/* ---------- The panel ---------- */
function cabinetBadge() {
  const n = game && game.nations[PLAYER];
  if (!n || !n.cabinet) return 0;
  let k = 0;
  const econ = economies()[PLAYER];
  for (const key of MIN_ORDER) {
    const M = n.cabinet.min[key];
    if (!M || M.pending) continue;
    if (!M.minister) { k++; continue; }
    if ((M.seen ?? -1) < game.turn && ministryConcern(world, game, n, econ, key).level >= 2) k++;
  }
  return k;
}
function cabinetTabHtml() {
  if (ui.ministry && MINISTRIES[ui.ministry]) return ministryPageHtml(ui.ministry);
  const n = game.nations[PLAYER], econ = economies()[PLAYER];
  const est = establishCost(econ), up = ministryUpkeep(econ);
  const rows = MIN_ORDER.map(key => {
    const D = MINISTRIES[key], M = ministry(n, key);
    let who, note = "";
    if (!M) { who = `<span class="muted">Not established</span>`; note = `<span class="muted small">Establish: ${fmtMoney(est)}, then ${fmtMoneyFine(up)} a season</span>`; }
    else if (M.pending) who = `<span class="muted">${escapeHtml(M.minister.name)} · opens next season</span>`;
    else if (!M.minister) { who = `<span class="tone-bad">No minister: appoint one</span>`; }
    else {
      const c = ministryConcern(world, game, n, econ, key);
      who = `<span>${escapeHtml(M.minister.name)} ${starsHtml(M.minister.skill)}</span>`;
      note = `<span class="small ${c.level >= 2 ? "tone-warn" : "muted"}">${escapeHtml(c.text)}</span>`;
    }
    const alert = M && !M.pending && (!M.minister || ((M.seen ?? -1) < game.turn && ministryConcern(world, game, n, econ, key).level >= 2));
    return `<button class="min-row" type="button" data-action="min-open" data-key="${key}">
      <span class="min-ico">${ICONS[MIN_ICON[key]]}${alert ? `<span class="dot-alert"></span>` : ""}</span>
      <span class="min-txt"><strong>${D.label}</strong>${who}${note}</span>
      ${M && M.minister && !M.pending ? ministerPortrait(M.minister, 38) : ""}
    </button>`;
  }).join("");
  return `<div class="block"><p class="small muted">Each ministry has a minister you can talk to and give orders. A good minister makes the area better; a weak one makes it worse. Ministries cost ${fmtMoneyFine(up)} a season each.</p></div>
    <div class="min-list">${rows}</div>
    ${meetingHtml()}
    ${briefingHtml()}`;
}

function ministryPageHtml(key) {
  const g = game, n = g.nations[PLAYER], econ = economies()[PLAYER];
  const D = MINISTRIES[key], M = ministry(n, key);
  const back = `<button class="btn" type="button" data-action="min-back" style="justify-self:start">← All ministries</button>`;
  const head = `<div class="min-head"><span class="min-ico big">${ICONS[MIN_ICON[key]]}</span><div><span class="eyebrow">Ministry</span><h3>${D.label}</h3><p class="small muted">Looks after ${escapeHtml(D.looks)}.</p></div></div>`;
  if (!M) {
    const cost = establishCost(econ);
    const af = canAfford(n, econ.gdp, cost);
    const cands = candidatesFor(g, n, key);
    return `${back}${head}
      <div class="block"><span class="eyebrow">Establish this ministry</span>
        <p class="small">Costs ${fmtMoney(cost)} now and ${fmtMoneyFine(ministryUpkeep(econ))} a season. It opens next season. Choose who will lead it:</p>
        ${af.ok ? "" : `<p class="notice">${escapeHtml(af.reason)}</p>`}
        ${cands.map(m => candidateCardHtml(m, `<button class="btn primary" type="button" data-action="min-establish" data-key="${key}" data-id="${m.id}" ${af.ok ? "" : "disabled"}>Establish with ${escapeHtml(m.name.split(" ")[0])}</button>`)).join("")}
      </div>`;
  }
  if (M.pending) return `${back}${head}<div class="block">${ministerCardHtml(M.minister, key)}<p class="notice info">The ministry opens next season. ${escapeHtml(M.minister.name)} will take office then.</p></div>`;
  if (!M.minister) {
    const cands = candidatesFor(g, n, key);
    return `${back}${head}<div class="block"><span class="eyebrow">Appoint a minister</span><p class="small">The ministry has no minister. Until you appoint one it gives no advice and carries out no orders.</p>
      ${cands.map(m => candidateCardHtml(m, `<button class="btn primary" type="button" data-action="min-appoint" data-key="${key}" data-id="${m.id}">Appoint ${escapeHtml(m.name.split(" ")[0])}</button>`)).join("")}</div>`;
  }
  M.seen = g.turn;
  const m = M.minister;
  const c = ministryConcern(world, g, n, econ, key);
  const orders = ui.minOrders && ui.minOrders.key === key && ui.minOrders.stamp === ordersStamp() ? ui.minOrders.list : (ui.minOrders = { key, stamp: ordersStamp(), list: ministryOrders(world, g, PLAYER, key) }).list;
  const recs = recommendedOrders(orders);
  const log = M.log.slice(0, 4).map(x => `<li><span class="muted small">${escapeHtml(seasonLabel(x.turn))}</span> ${escapeHtml(x.text)}</li>`).join("");
  const dismissAsk = ui.minDismiss === key
    ? `<div class="confirm"><p>Dismiss ${escapeHtml(m.name)}? It costs ${dismissCost(m)} stability${minHas(m, "popular") ? " (a popular minister)" : ""}, and your other ministers grow a little less loyal.</p><div class="actions"><button class="btn danger" type="button" data-action="min-dismiss-now" data-key="${key}">Dismiss</button><button class="btn" type="button" data-action="min-dismiss-cancel">Keep</button></div></div>`
    : "";
  return `${back}${head}
    <div class="block">${ministerCardHtml(m, key)}
      <p class="small">${escapeHtml(ministerEffectText(n, key))}</p>
      <div class="actions"><button class="btn" type="button" data-action="min-dismiss" data-key="${key}">Dismiss</button></div>${dismissAsk}
    </div>
    <div class="block"><span class="eyebrow">${escapeHtml(m.name.split(" ")[0])} says</span><p class="${c.level >= 2 ? "notice" : "small"}">${escapeHtml(c.text)}</p>
      ${recs.length ? `<p class="small muted">Advice: ${recs.map(o => escapeHtml(o.label.charAt(0).toLowerCase() + o.label.slice(1))).join("; ")}.</p>` : ""}</div>
    ${chatHtml(key, M, m, orders)}
    ${ministryReportHtml(key, m)}
    ${ordersHtml(key, orders, m)}
    <div class="block"><span class="eyebrow">Working on ${hisHer(m)} own</span>
      <label class="check"><input type="checkbox" id="min-auto" data-key="${key}" ${M.auto ? "checked" : ""}> Let ${escapeHtml(m.name.split(" ")[0])} act on ${hisHer(m)} own each season</label>
      <label class="small muted" for="min-limit">Spending allowed each season without asking</label>
      <select id="min-limit" data-key="${key}" ${M.auto ? "" : "disabled"}>${[1, 2, 3].map(i => `<option value="${i}" ${M.limit === i ? "selected" : ""}>${LIMIT_LABELS[i]}: up to ${fmtMoney(CAB.limits[i] * econ.gdp)}</option>`).join("")}</select>
      <p class="small muted">${heShe(m).charAt(0).toUpperCase() + heShe(m).slice(1)} only starts projects and measures ${heShe(m)} would advise, and never changes a law, proposes a treaty, starts or ends an embargo, or sends food aid without you.</p>
    </div>
    ${log ? `<div class="block"><span class="eyebrow">Recent work</span><ul class="news">${log}</ul></div>` : ""}`;
}
// what the orders depend on: when one of these changes, the menu is worked out again (trade: embargoes, preferred sellers, aid)
function ordersStamp() { const n = game.nations[PLAYER], T = game.trade; return `${game.turn}|${game.projects.length}|${Math.round(n.treasury * 10)}|${JSON.stringify(n.laws)}|${(n.mods || []).length}|${game.letters.length}|${game.divisions.length}|${mapVersion}|${T ? `${T.turn}:${T.nextId}:${(T.embargoes || []).length}:${JSON.stringify(T.prefer || [])}:${(T.aid || []).length}` : ""}`; }
function ministerCardHtml(m, key) {
  return `<div class="minister">${ministerPortrait(m, 64)}<div class="who">
    <strong>${escapeHtml(m.name)}</strong><span class="small muted">${escapeHtml(MINISTRIES[key].title)} · age ${m.age}${m.since <= game.turn ? ` · since ${escapeHtml(seasonLabel(m.since))}` : ""}</span>
    <span class="small">Skill ${starsHtml(m.skill)}</span>
    <span class="small">Loyalty <span class="loyal-bar"><i style="width:${Math.round(m.loyalty)}%;background:${m.loyalty >= 55 ? "var(--good)" : m.loyalty >= 30 ? "var(--warn)" : "var(--bad)"}"></i></span> ${loyaltyWord(m.loyalty)}</span>
    <div class="chips">${traitChips(m)}</div></div></div>`;
}
function candidateCardHtml(m, button) {
  return `<div class="cand">${ministerPortrait(m, 48)}<div class="who"><strong>${escapeHtml(m.name)}</strong><span class="small muted">Age ${m.age} · skill ${starsHtml(m.skill)}</span>
    <span class="small">${m.traits.map(t => `<b>${MIN_TRAITS[t].label}</b>: ${escapeHtml(MIN_TRAITS[t].note)}`).join(". ")}.</span>${button}</div></div>`;
}
function orderRowHtml(key, o) {
  return `<div class="order ${o.objection ? "objected" : ""}"><div class="o-txt"><strong>${escapeHtml(o.label)}</strong>
      <span class="small muted">${escapeHtml(o.lines.concat(o.lines2 || []).join(" · "))}</span>
      ${o.blocked ? `<span class="small tone-bad">${escapeHtml(o.blocked)}</span>` : o.objection ? `<span class="small tone-warn">The minister objects: ${escapeHtml(o.objection.charAt(0).toLowerCase() + o.objection.slice(1))}</span>` : ""}</div>
    <button class="btn ${o.objection || o.blocked ? "" : "primary"}" type="button" data-action="min-order" data-key="${key}" data-id="${escapeHtml(o.id)}" ${o.blocked ? "disabled" : ""}>${o.objection ? "Order anyway" : "Order"}</button></div>`;
}
function ordersHtml(key, orders, m) {
  if (!orders.length) return `<div class="block"><span class="eyebrow">Orders</span><p class="small muted">Nothing to order right now.</p></div>`;
  const groups = {};
  for (const o of orders) (groups[o.group] = groups[o.group] || []).push(o);
  const open = ui.minGroup || {};
  return `<div class="block"><span class="eyebrow">Orders you can give</span>
    ${Object.keys(groups).map(gname => `<details class="ogroup" ${open[`${key}:${gname}`] !== false ? "open" : ""} data-group="${key}:${escapeHtml(gname)}"><summary>${escapeHtml(gname)} <span class="muted small">${groups[gname].length}</span></summary>${groups[gname].map(o => orderRowHtml(key, o)).join("")}</details>`).join("")}
  </div>`;
}

/* ---------- Talking to a minister ---------- */
function giveMinisterOrder(key, id, msgIndex) {
  const g = game, n = g.nations[PLAYER], M = ministry(n, key);
  if (!M || !M.minister) return;
  const r = executeOrder(world, g, PLAYER, key, id, "you");
  if (msgIndex !== undefined && M.chat[msgIndex] && M.chat[msgIndex].order) {
    M.chat[msgIndex].order.status = r.ok ? "done" : "failed";
    if (!r.ok) M.chat[msgIndex].order.note = r.text;
  }
  if (r.ok) {
    const m = M.minister;
    M.chat.push({ who: "min", text: r.overruled ? `As you wish. ${r.text}` : `Done. ${r.text}`, turn: g.turn });
    if (m && r.overruled && m.loyalty < 40) M.chat.push({ who: "min", text: m.loyalty < 25 ? "You do not listen to me. I am thinking about my future in this government." : "I will do my duty, but I hope you will listen next time.", turn: g.turn });
  } else flashHint(r.text);
  ui.minOrders = null;
  bumpMap();
}


