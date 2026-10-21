/* =====================================================================
   16j. Interest groups in the panels: who holds power, what they feel and why, what they demand
   ===================================================================== */
Object.assign(ICONS, { groups: giSvg("delapouite/meeple-group"), speaker: giSvg("delapouite/public-speaker") });
function groupIc(k) { return GROUPS[k] ? giSvg(GROUPS[k].icon) : ""; }
function groupTone(v) { return v >= GRP.happyAt ? "good" : v < GRP.angryAt ? "bad" : v < 45 ? "warn" : "neutral"; }
function groupColorOf(v) { return v >= GRP.happyAt ? "var(--good)" : v < GRP.angryAt ? "var(--bad)" : v < 45 ? "var(--warn)" : "var(--fg)"; }
function groupDeltaWords(d, min = 2) {
  return GROUP_ORDER.filter(k => Math.abs(d[k] || 0) >= min).sort((a, b) => Math.abs(d[b]) - Math.abs(d[a])).map(k => `${GROUPS[k].short} ${signed(d[k])}`).join(", ");
}
function groupSpark(h) {
  if (!h || h.length < 2) return "";
  const W = 120, H = 24;
  const pts = h.map((v, k) => `${(k / (h.length - 1) * W).toFixed(1)},${(H - v / 100 * H).toFixed(1)}`).join(" ");
  return `<svg class="grp-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/><polyline points="${pts}" fill="none" stroke="var(--gold)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
}
function groupDemandHtml(n, k) {
  const s = n.groups[k], D = s.demand;
  if (!D) return `<p class="muted small">No demand right now.${s.approval < 48 && game.turn - (s.lastDemand ?? -99) < GRP.demandAfter ? " They will ask for something soon if nothing changes." : ""}</p>`;
  const left = D.until - game.turn;
  let act = "";
  if (D.law) {
    const d = groupLawDelta(world, game, n, D.law, D.value);
    const others = groupDeltaWords(Object.fromEntries(GROUP_ORDER.filter(x => x !== k).map(x => [x, d[x]])));
    act = n.laws[D.law] === (D.law === "tax" ? Number(D.value) : D.value) ? "" : `<button class="btn" type="button" data-law="${D.law}" data-value="${D.value}">Do it: ${escapeHtml(LAW_NAMES[D.law])} → ${escapeHtml(lawValueLabel(D.law, D.law === "tax" ? Number(D.value) : D.value))}</button>
      <span class="small muted">${escapeHtml(lawEffectTextBase(D.law, D.law === "tax" ? Number(D.value) : D.value))}${others ? `. Others: ${escapeHtml(others)}` : ""}.</span>`;
  }
  return `<div class="grp-dem"><span class="eyebrow">${ICONS.speaker} They demand · ${left} season${left === 1 ? "" : "s"} left</span>
    <strong>${escapeHtml(D.label)}</strong>
    <span class="small muted">Do it in time: approval +${GRP.met} for ${GRP.modSeasons / 4} years. Ignore it: ${signed(GRP.broken)} for ${GRP.modSeasons / 4} years.</span>
    ${act}</div>`;
}
function groupCardHtml(n, k, S, ctx, econ) {
  const s = n.groups[k], G = GROUPS[k];
  const a = Math.round(s.approval), t = Math.round(s.target ?? a);
  const terms = groupTerms(world, game, n, econ, n.laws, k, ctx);
  const li = x => `<li><span>${escapeHtml(x.label)}</span><span class="num tone-${toneOf(x.value, 0.05)}">${signed1(x.value)}</span></li>`;
  const mins = MIN_ORDER.filter(key => ministryActive(n, key) && ministerGroup(n.cabinet.min[key].minister) === k).map(key => `${n.cabinet.min[key].minister.name} (${MINISTRIES[key].label})`);
  const stab = (s.share || 0) * (s.approval - 50) * GRP.stabK;
  return `<div class="block grp">
    <div class="grp-head"><span class="grp-ic" style="color:${G.color}">${groupIc(k)}</span>
      <span class="grp-name"><strong>${escapeHtml(G.label)}</strong><span class="sub">${escapeHtml(G.who)}</span></span>
      <span class="grp-pow"><span class="num">${pct(s.share)}</span><span class="sub">of the power</span></span></div>
    <div class="grp-ap"><span class="small">Approval <b class="num" style="color:${groupColorOf(a)}">${a}</b> · ${groupWord(a)}${t !== a ? ` · heading to ${t}` : ""}${Math.abs(stab) >= 0.3 ? ` · stability ${signed1(stab)}` : ""}</span>${groupSpark(s.hist)}</div>
    <div class="meter"><span style="width:${clamp(a, 0, 100)}%;background:${groupColorOf(a)}"></span><i style="left:calc(${clamp(t, 0, 100)}% - 1px)"></i></div>
    ${groupDemandHtml(n, k)}
    <details><summary>Why they feel this way</summary>${terms.length ? `<ul class="factors">${terms.map(li).join("")}</ul>` : `<p class="muted small">Nothing in particular: they wait and see.</p>`}<p class="muted small">They want: ${escapeHtml(G.wants)}</p></details>
    <details><summary>Where their power comes from</summary><ul class="factors">${S.pow[k].lines.map(l => `<li><span>${escapeHtml(l.label)}</span><span class="num">${l.pts > 0 ? "+" : "−"}${Math.abs(Math.round(l.pts))}</span></li>`).join("")}</ul></details>
    <p class="small"><span class="tone-good">Pleased:</span> ${escapeHtml(G.happy)} <span class="tone-bad">Angry:</span> ${escapeHtml(G.angry)}</p>
    ${mins.length ? `<p class="small muted">Their people in your government: ${escapeHtml(mins.join(", "))}.</p>` : ""}
  </div>`;
}
function groupsTabHtml() {
  const n = game.nations[PLAYER];
  if (!n.groups) ensureGroups(world, game, n);
  const econ = economies()[PLAYER];
  const S = groupShares(game, n, econ);
  const ctx = groupCtx(world, game, n, econ);
  const order = GROUP_ORDER.slice().sort((a, b) => n.groups[b].share - n.groups[a].share);
  const terms = groupStabilityTerms(game, n);
  const total = terms.reduce((s, t) => s + t.value, 0);
  const bar = `<div class="grp-bar">${order.map(k => `<span style="width:${(n.groups[k].share * 100).toFixed(1)}%;background:${GROUPS[k].color}" title="${escapeHtml(GROUPS[k].label)}: ${pct(n.groups[k].share)} of the power, approval ${Math.round(n.groups[k].approval)}"></span>`).join("")}</div>
    <div class="grp-legend">${order.map(k => `<span><i style="background:${GROUPS[k].color}"></i>${escapeHtml(GROUPS[k].label)} ${pct(n.groups[k].share)}</span>`).join("")}</div>`;
  const angry = order.filter(k => n.groups[k].approval < GRP.angryAt && n.groups[k].share >= 0.12);
  return `
    <div class="block">
      <span class="eyebrow">Who holds power in ${escapeHtml(n.name)}</span>
      ${bar}
      <p class="small">Together the groups move stability ${signed1(total)}.${angry.length ? ` <span class="tone-bad">${escapeHtml(angry.map(k => GROUPS[k].label).join(" and "))} ${angry.length > 1 || GROUPS[angry[0]].are === "are" ? "are" : "is"} angry: a crisis may come.</span>` : ""}</p>
      <p class="muted small">Power comes from what your nation is: factories and mines give the workers weight, trade and banks give business theirs, soldiers under arms give the generals theirs. Each group judges your laws and what happens; a powerful group that is pleased helps you, an angry one can strike, take its money abroad, block the roads, fill the squares, or plot against you. Changing a law shows who likes it (on the law's buttons). Ministers come from a group, and their group likes having them in the government.</p>
    </div>
    ${order.map(k => groupCardHtml(n, k, S, ctx, econ)).join("")}`;
}

/* ---------- Season report and news ---------- */
function groupsDispatchHtml(d) {
  const list = d.groups || [];
  if (!list.length) return "";
  return `<div class="block"><span class="eyebrow">Interest groups</span><ul class="news">${list.map(x => `<li><span class="dot" style="background:${x.tone === "good" ? "var(--good)" : x.tone === "bad" ? "var(--bad)" : "var(--gold)"}"></span><span>${escapeHtml(x.text)}</span></li>`).join("")}</ul></div>`;
}
/* ---------- Rival nations: who holds power there ---------- */
function rivalGroupsHtml(z) {
  if (!z.groups) return "";
  const order = GROUP_ORDER.slice().sort((a, b) => z.groups[b].share - z.groups[a].share);
  return `<div class="block" style="gap:4px"><span class="eyebrow">Who holds power there</span><ul class="factors">${order.map(k => `<li><span>${escapeHtml(GROUPS[k].label)} <span class="muted small">${pct(z.groups[k].share)} of the power</span></span><span class="num tone-${groupTone(z.groups[k].approval)}">${Math.round(z.groups[k].approval)} · ${groupWord(z.groups[k].approval)}</span></li>`).join("")}</ul></div>`;
}

Object.assign(ICONS, { toolbox: giSvg("delapouite/toolbox") });
