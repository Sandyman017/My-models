/* =====================================================================
   16n. Villages in the panels and on the map
   Names of villages up close (sized by their people, ruins in grey, boom camps in gold), the hover card of any
   village or hamlet, the village page (its look, people, site, what it lives from, its land, its charter and its
   story), who lives where in a cell, the site report when you found a town, the villages of each province, the
   season's village news, and the Villages view of the countryside.
   ===================================================================== */
const VILLAGE_KIND_TEXT = {
  farm: "Its people farm the land around it and sell at the town's market.",
  mine: "Its people work at the mine next door; shops and inns live from the miners' pay.",
  fish: "Its people fish off the coast and sell the catch inland.",
  market: "Travellers and farmers come to its market; inns, smiths and shops live from them.",
};
const VILLAGE_STATUS = {
  boom: { label: "Boom", tone: "good", text: "A new mine has opened: fortune seekers pour in, and it grows fast." },
  bust: { label: "Bust", tone: "bad", text: "Its mine has closed. The miners are leaving; it will shrink until farming can feed what is left, or be abandoned." },
  fading: { label: "Emptying", tone: "warn", text: "Too few people are left on the land around it to keep a village going." },
  ruin: { label: "Ruins", tone: "bad", text: "Abandoned. Its roofs have fallen in and its fields are growing wild." },
};
const VILLAGE_PLAN_WHY = {
  cluster: "Open farmland in a temperate land: people gather close round the church and the green.",
  grove: "Wet, green land: houses shelter in small groups under shade and fruit trees.",
  line: "It follows the river or the road, as the best land and the traffic do.",
  compound: "Dry land: each family keeps its yard behind a mud wall, against the wind, the dust and wandering animals.",
  hill: "It stands on high ground, packed tight to be easy to defend.",
  harbor: "It lives from the sea, so it lines the shore.",
  camp: "It was built in a hurry for the miners, beside the pit.",
  market: "Roads meet here, so the village gathers round the market square.",
  scatter: "Few people on wide land: each farm stands in its own fields.",
  modern: "Close to a big town in a modern age: people who work in the town have moved here, and new streets have been built for them.",
};

/* ---------- Finding the village under the mouse ---------- */
/* The drawn village or hamlet nearest a map point (in cells), if the point is inside it or within a few pixels. */
function villageNearPoint(x, y, cs) {
  if (!game || !game.villages) return null;
  villageDrawList();
  const cell = inBounds(Math.floor(x), Math.floor(y)) ? idx(Math.floor(x), Math.floor(y)) : -1;
  if (cell < 0) return null;
  let best = null, bd = Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = cellX(cell) + dx, Y = cellY(cell) + dy;
    if (!inBounds(X, Y)) continue;
    for (const d of VDRAW.byCell.get(idx(X, Y)) || []) {
      const reach = Math.max(d.r * (d.plan === "line" || d.plan === "harbor" ? 1.9 : 1.15), 8 / cs);
      const dd = Math.hypot(d.x - x, d.y - y);
      if (dd < reach && dd < bd) { bd = dd; best = d; }
    }
  }
  return best;
}
function villageAtMouse() {
  if (!ui.hoverXY || view.cs < 26) return null;
  return villageNearPoint(ui.hoverXY.x, ui.hoverXY.y, view.cs);
}
function fmtVillPeople(pop) { const n = pop * 1e6; return fmtCount(n >= 1000 ? Math.round(n / 10) * 10 : Math.round(n)); }

/* Hover lines for the place under the mouse (or the cell's village). */
function villageTooltipLines(i) {
  if (!game || !game.villages) return "";
  const d = villageAtMouse();
  if (d && d.named) {
    const v = d.v, st = VILLAGE_STATUS[v.status];
    if (v.status === "ruin") return `<span class="tt-line">${escapeHtml(v.name)}: ruins of ${aAn(VILLAGE_PLANS[v.plan].label.toLowerCase())}, abandoned ${seasonLabel(v.ruinAt || 0)}</span>`;
    return `<span class="tt-line"><b>${escapeHtml(v.name)}</b>: ${villageSizeWord(v.pop)} of ${fmtVillPeople(v.pop)} people · ${escapeHtml(VILLAGE_PLANS[v.plan].label.toLowerCase())}</span>${st ? `<span class="tt-${st.tone === "good" ? "good" : "bad"}">${st.label}</span>` : ""}<span class="tt-line">Click for its page</span>`;
  }
  if (d && !d.named) return `<span class="tt-line">A hamlet of about ${fmtVillPeople(d.pop)} people (${escapeHtml(VILLAGE_PLANS[d.plan].label.toLowerCase())})</span>`;
  const v = villageAt(game, i);
  if (v && v.status !== "ruin" && game.owner[i] >= 0) return `<span class="tt-line">${escapeHtml(v.name)}: ${VILLAGE_KINDS[v.kind] ? VILLAGE_KINDS[v.kind].toLowerCase() : "village"} of about ${fmtVillPeople(v.pop)} people</span>`;
  return "";
}

/* ---------- Names on the map ---------- */
function drawVillageNames(c, cs) {
  if (!game.villages || cs < 26) return;
  const list = villageDrawList().filter(d => d.named);
  const a = smooth01(26, 36, cs);
  const named = cs >= 46;
  const placed = (view.townBoxes || []).concat(view.provBoxes || []);
  const x0 = -view.ox / cs - 1, y0 = -view.oy / cs - 1, x1 = x0 + view.vw / cs + 2, y1 = y0 + view.vh / cs + 2;
  const drawn = cs * VIL.grid > 14;   // the painter shows the village itself: no dot needed
  for (const d of list.sort((p, q) => q.pop - p.pop)) {
    const v = d.v;
    if (d.x < x0 || d.x > x1 || d.y < y0 || d.y > y1) continue;
    if (game.owner[v.cell] < 0 && v.status !== "ruin") continue;
    const x = d.x * cs, y = d.y * cs;
    const ruin = v.status === "ruin", boom = v.status === "boom";
    const r = drawn ? Math.max(3, d.r * cs * 0.6) : clamp(1.2 + v.pop * 200, 1.6, 3.4);
    c.globalAlpha = a;
    if (!drawn) {
      c.fillStyle = ruin ? "#9a958a" : boom ? "#f0d58a" : "#efe6cf"; c.strokeStyle = "rgba(12,10,8,0.85)"; c.lineWidth = 1;
      c.beginPath();
      if (v.kind === "market" && !ruin) c.rect(x - r, y - r, r * 2, r * 2); else c.arc(x, y, r, 0, Math.PI * 2);
      c.fill(); c.stroke();
    }
    c.globalAlpha = 1;
    if (!named) continue;
    const big = v.pop >= 0.005;
    const size = clamp(cs * (big ? 0.22 : 0.19), 9.5, big ? 13.5 : 12) * (ruin ? 0.92 : 1);
    const label = ruin ? `${v.name} (ruins)` : drawn && cs > 400 ? `${v.name} · ${fmtVillPeople(v.pop)}` : v.name;
    c.font = `italic ${big ? 600 : 500} ${size}px "IBM Plex Sans", system-ui, sans-serif`;
    const tw = c.measureText(label).width;
    const lx = drawn ? x - tw / 2 : x + r + 3, ly = drawn ? y - r - size * 0.9 : y;
    const box = { x0: lx - 1, x1: lx + tw + 1, y0: ly - size * 0.6, y1: ly + size * 0.6 };
    if (placed.some(p => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
    placed.push(box);
    c.textAlign = "left"; c.textBaseline = "middle"; c.lineJoin = "round";
    c.globalAlpha = a * (ruin ? 0.7 : 0.94);
    c.lineWidth = 2.6; c.strokeStyle = "rgba(10,9,8,0.75)"; c.strokeText(label, lx, ly);
    c.fillStyle = ruin ? "#b9b4a8" : boom ? "#f0d58a" : ui.selectedVillage === v.id ? "#f0d58a" : "#efe8d6"; c.fillText(label, lx, ly);
    c.globalAlpha = 1;
  }
}

/* ---------- The village page ---------- */
function villageTrendSvg(v) {
  const h = (v.hist || []).slice(-40);
  if (h.length < 2) return "";
  const W = 220, H = 34, lo = Math.min(...h) * 0.97, hi = Math.max(...h) * 1.03, span = Math.max(1, hi - lo);
  const pts = h.map((x, k) => `${(k / (h.length - 1) * W).toFixed(1)},${(H - (x - lo) / span * H).toFixed(1)}`).join(" ");
  const first = h[0], last = h[h.length - 1];
  const yrs = Math.max(1, Math.round((h.length - 1) / 4));
  return `<div class="cf-trend"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--gold)" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>
    <span class="muted small">${h.length - 1} season${h.length > 2 ? "s" : ""} (${yrs} year${yrs > 1 ? "s" : ""}): ${fmtCount(first)} → ${fmtCount(last)} people (${last >= first ? "+" : "−"}${pct(Math.abs(last / Math.max(1, first) - 1))})</span></div>`;
}
function siteLinesHtml(rep) {
  return `<ul class="factors">${rep.lines.map(l => `<li><span><b class="tone-${l.tone}">${escapeHtml(l.label)}</b>: ${escapeHtml(l.text)}${l.fx.length ? `<span class="sub">${escapeHtml(l.fx.join(" · "))}</span>` : ""}</span></li>`).join("") || `<li><span class="muted">Nothing special: open country.</span></li>`}</ul>`;
}
function villageDetailHtml(v) {
  const own = game.owner[v.cell];
  const n = own >= 0 ? game.nations[own] : null;
  const p = provAt(game, v.cell);
  const ruin = v.status === "ruin";
  const st = VILLAGE_STATUS[v.status];
  const econ = own >= 0 ? economies()[own] : null;
  const T = ruin || own < 0 ? null : villageTarget(world, game, v, econ);
  const rep = siteReport(world, game, v.cell, own >= 0 ? own : undefined);
  const town = own >= 0 ? nearestCity(game, v.cell, own) : null;
  const h = v.hist || [];
  const yearAgo = h.length >= 5 ? h[h.length - 5] : null;
  const head = `<div class="block">
      <span class="eyebrow" ${n ? `style="color:${n.color}"` : ""}>${n ? escapeHtml(n.name) : "Wild land"}${p ? ` · ${escapeHtml(p.name)}` : ""}</span>
      <h2 class="side-title">${escapeHtml(v.name)}</h2>
      <p class="muted small">${ruin ? `Ruins of ${aAn(VILLAGE_PLANS[v.plan].label.toLowerCase())}` : `${villageSizeWord(v.pop).replace(/^./, s => s.toUpperCase())} · ${escapeHtml(VILLAGE_PLANS[v.plan].label)} · ${escapeHtml(VILLAGE_KINDS[v.kind] || "Village")}`} · ${v.born > 0 ? `grew up in ${seasonLabel(v.born)}` : `about ${Math.round(villageAge(world, game, v))} years old`}</p>
    </div>`;
  const status = st ? `<p class="notice ${st.tone === "good" ? "info" : ""}">${escapeHtml(st.text)}${ruin && v.ruinAt !== undefined ? ` Abandoned in ${seasonLabel(v.ruinAt)}; at its height ${fmtVillPeople(v.peak || 0)} people lived here.` : ""}</p>` : "";
  const occ = game.occ && game.occ[v.cell] >= 0 ? `<p class="notice">Occupied by the ${escapeHtml(nameOf(game, game.occ[v.cell]))}.</p>` : "";
  const figs = ruin ? "" : `<div class="stats-grid">
      <div class="stat-cell"><span class="k">People</span><span class="v">${fmtVillPeople(v.pop)}</span></div>
      <div class="stat-cell"><span class="k">A year ago</span><span class="v">${yearAgo ? fmtCount(yearAgo) : "—"}</span></div>
      <div class="stat-cell" title="The size its site and fortunes allow now; it moves a little toward it every season"><span class="k">Heading for</span><span class="v tone-${T && T.target > v.pop * 1.01 ? "good" : T && T.target < v.pop * 0.99 ? "bad" : "neutral"}">${T ? fmtVillPeople(T.target) : "—"}</span></div>
      <div class="stat-cell"><span class="k">Most ever</span><span class="v">${fmtVillPeople(v.peak || v.pop)}</span></div>
    </div>`;
  const why = T && T.why.length ? `<span class="eyebrow">Why it is growing or shrinking</span><ul class="factors">${T.why.map(x => `<li><span>${escapeHtml(x.label)}</span><span class="num ${x.v === null ? "" : x.v >= 0 ? "tone-good" : "tone-bad"}">${x.v === null ? "" : signedPct(x.v, 0)}</span></li>`).join("")}</ul>` : "";
  const look = `<div class="block"><span class="eyebrow">How it looks</span>
      <p class="small"><b>${escapeHtml(VILLAGE_PLANS[v.plan].label)}.</b> ${escapeHtml(VILLAGE_PLANS[v.plan].text)}</p>
      <p class="muted small">Why: ${escapeHtml((VILLAGE_PLAN_WHY[v.plan] || "").replace(/^./, c => c.toLowerCase()))}</p></div>`;
  const live = ruin ? "" : `<div class="block"><span class="eyebrow">What its people live from</span><p class="small">${escapeHtml(VILLAGE_KIND_TEXT[v.kind] || VILLAGE_KIND_TEXT.farm)}${town ? ` Its town is ${escapeHtml(town.name)}, ${Math.round(dist(town.cell, v.cell) * 50)} km away.` : ""}</p></div>`;
  const site = `<div class="block"><span class="eyebrow">Its site · ${rep.score}, ${escapeHtml(rep.word)}</span>${siteLinesHtml(rep)}</div>`;
  const cs = cellSettlement(world, game, v.cell);
  const land = `<div class="block"><span class="eyebrow">Who lives on its land</span>
      <p class="small">Of the ${fmtPeople(cs.P)} people of this ${fmtArea(1)}: ${fmtVillPeople(cs.inVillage)} in ${escapeHtml(v.name)}, ${fmtPeople(cs.inHamlets)} in ${cs.hamlets.length} hamlet${cs.hamlets.length === 1 ? "" : "s"}, and ${fmtPeople(cs.onFarms)} on farms and in farmsteads.${town ? ` All of them count among the people of ${escapeHtml(town.name)}'s district.` : ""}</p></div>`;
  let charter = "";
  if (!ruin && own === PLAYER) {
    const ch = charterCheck(world, game, v);
    const asked = v.charter && v.charter.refused ? ` It asked in ${seasonLabel(v.charter.refused)} and was told to wait; it may ask again in ${seasonLabel(v.charter.refused + VIL.charterAgain)}.` : "";
    charter = `<div class="block"><span class="eyebrow">A town charter</span>
      <p class="small">${ch.ok ? `${escapeHtml(v.name)} is big enough and well placed to ask for a town charter; it will ask when the time comes (one village at a time, every ${VIL.charterCool / 4} years at most).` : `To ask for a town charter it needs ${fmtCount(VIL.charterPop * 1e6)} people, a site of ${VIL.charterScore} or better, a road, and no town within ${BUILD.townMinSpacing} cells.`}${asked}</p>
      ${ch.ok ? "" : `<ul class="factors">${ch.why.map(x => `<li><span class="muted">${escapeHtml(x)}</span></li>`).join("")}</ul>`}</div>`;
  }
  let works = "";
  if (own === PLAYER) {
    const done = Object.keys(v.works || {}).filter(k => VILLAGE_WORKS[k]);
    const opts = VILLAGE_WORK_ORDER.map(k => ({ k, ch: villageWorkCheck(world, game, PLAYER, v, k) })).filter(x => x.ch.ok);
    if (done.length || opts.length) works = `<div class="block"><span class="eyebrow">What you can do here</span>
      ${done.length ? `<p class="small">Done: ${done.map(k => `${escapeHtml(VILLAGE_WORKS[k].done)} (${seasonLabel(v.works[k])})`).join(", ")}.</p>` : ""}
      ${opts.map(x => `<p class="small"><b>${escapeHtml(VILLAGE_WORKS[x.k].label)}</b>: ${escapeHtml(VILLAGE_WORKS[x.k].text)}</p>
        <div class="actions"><button class="btn small" type="button" data-action="village-work" data-vid="${v.id}" data-k="${x.k}">${escapeHtml(VILLAGE_WORKS[x.k].label)} · ${fmtMoneyFine(x.ch.cost)}</button></div>`).join("")}
      ${!roadSites(world, game).deg[v.cell] && v.status !== "ruin" ? `<div class="actions"><button class="btn small" type="button" data-action="village-road" data-vid="${v.id}">Build a road to ${escapeHtml(v.name)}</button></div><p class="muted small">A road lets it grow (+12%), opens it to traders and is needed for a town charter.</p>` : ""}
    </div>`;
  }
  // its neighbours: the villages around it, how far, and whether a road joins them
  const nb = (game.villages || []).filter(x => x !== v && x.status !== "ruin" && dist(x.cell, v.cell) <= 2.3).sort((a, b) => dist(a.cell, v.cell) - dist(b.cell, v.cell)).slice(0, 5);
  const neighbours = nb.length ? `<div class="block"><span class="eyebrow">Its neighbours</span><ul class="factors">${nb.map(x => `<li><span><button class="linkbtn" type="button" data-action="village-pick" data-vid="${x.id}">${escapeHtml(x.name)}</button> <span class="muted small">${escapeHtml(VILLAGE_PLANS[x.plan].label.toLowerCase())}${game.owner[x.cell] !== own && game.owner[x.cell] >= 0 ? ` · the ${escapeHtml(nameOf(game, game.owner[x.cell]))}` : ""}</span></span><span class="num">${Math.round(dist(x.cell, v.cell) * 50)} km · ${fmtVillPeople(x.pop)}</span></li>`).join("")}</ul></div>` : "";
  const story = `<details class="block cf-hist" open><summary>The story of ${escapeHtml(v.name)}</summary>
      ${villageTrendSvg(v)}
      ${(v.log || []).length ? `<ul class="news">${v.log.map(x => `<li><span class="dot" style="background:${x.tone === "good" ? "var(--good)" : x.tone === "bad" ? "var(--bad)" : x.tone === "warn" ? "var(--warn)" : "var(--muted)"}"></span><span><span class="num muted small">${seasonLabel(x.t)}</span><br>${escapeHtml(x.text)}</span></li>`).join("")}</ul>` : ""}
    </details>`;
  const actions = `<div class="actions"><button class="btn small" type="button" data-action="village-look" data-vid="${v.id}">See it up close</button>${town ? `<button class="btn small" type="button" data-city-pick="${town.id}">${escapeHtml(town.name)}</button>` : ""}${n && own !== PLAYER && n.alive ? `<button class="btn small" type="button" data-action="nation-view" data-nid="${own}">About the ${escapeHtml(n.name)}</button>` : ""}</div>`;
  return `${head}${status}${occ}${figs}${ruin ? "" : `<div class="block">${why}</div>`}${look}${live}${site}${land}${charter}${works}${neighbours}${story}${actions}`;
}
/* Who lives where in a cell, for the land's own page. */
function cellSettlementHtml(i) {
  if (!game || !isLand(world, i) || game.cities.some(c => c.cell === i)) return "";
  const cs = cellSettlement(world, game, i);
  if (cs.P < 0.005) return "";
  const v = villageAt(game, i);
  const rep = siteReport(world, game, i, game.owner[i] >= 0 ? game.owner[i] : undefined);
  return `<div class="block"><span class="eyebrow">Who lives here</span>
    <p class="small">${fmtPeople(cs.P)} people: ${cs.village ? `${fmtVillPeople(cs.inVillage)} in the village of <button class="linkbtn" type="button" data-action="village-pick" data-vid="${cs.village.id}">${escapeHtml(cs.village.name)}</button>, ` : ""}${fmtPeople(cs.inHamlets)} in ${cs.hamlets.length} hamlet${cs.hamlets.length === 1 ? "" : "s"} (${escapeHtml(VILLAGE_PLANS[cs.plan].label.toLowerCase())}), and ${fmtPeople(cs.onFarms)} on farms.${v && v.status === "ruin" ? ` The ruins of ${escapeHtml(v.name)} stand here.` : ""}</p></div>
    <div class="block"><span class="eyebrow">The site · ${rep.score}, ${escapeHtml(rep.word)}</span>${siteLinesHtml(rep)}</div>`;
}
/* The site report on the card for a new town. */
function townSiteReportHtml(q) {
  const rep = siteReport(world, game, q.site, PLAYER);
  return `<div class="block"><span class="eyebrow">Its site · ${rep.score}, ${escapeHtml(rep.word)}</span>
    <p class="small">A town here would grow ${rep.townGrow >= 0 ? "+" : ""}${(rep.townGrow * 400).toFixed(2)}% a year faster from its site${rep.def > 0 ? `, and its defenders fight ${pct(rep.def)} harder` : ""}.</p>
    ${siteLinesHtml(rep)}
    ${rep.notes.length ? `<p class="muted small">${rep.notes.map(escapeHtml).join(" ")}</p>` : ""}</div>`;
}

/* ---------- The villages of a town's district (on the town's page) ---------- */
function townVillagesHtml(city, r) {
  if (!r || !game.villages) return "";
  const cells = new Set(r.cells);
  const vs = game.villages.filter(v => cells.has(v.cell));
  const live = vs.filter(v => v.status !== "ruin").sort((a, b) => b.pop - a.pop);
  if (!vs.length) return "";
  let inH = 0, nH = 0;
  for (const c of r.cells) { if (c === city.cell) continue; const hs = hamletsOf(world, game, c); nH += hs.length; for (const h of hs) inH += h.pop; }
  const inV = live.reduce((s, v) => s + v.pop, 0);
  return `<div class="block"><span class="eyebrow">Its countryside · ${live.length} village${live.length === 1 ? "" : "s"}</span>
    <p class="small">${fmtPeople(inV)} people live in its villages and ${fmtPeople(inH)} in ${fmtCount(nH)} hamlets; the rest of its ${fmtPop(r.pop)} live in the town and on the farms.${vs.length > live.length ? ` ${vs.length - live.length} village${vs.length - live.length > 1 ? "s lie" : " lies"} in ruins.` : ""}</p>
    <ul class="factors">${live.slice(0, 6).map(v => `<li><span><button class="linkbtn" type="button" data-action="village-pick" data-vid="${v.id}">${escapeHtml(v.name)}</button> <span class="muted small">${escapeHtml(VILLAGE_PLANS[v.plan].label.toLowerCase())}${VILLAGE_STATUS[v.status] ? ` · ${VILLAGE_STATUS[v.status].label.toLowerCase()}` : ""}</span></span><span class="num">${fmtVillPeople(v.pop)}</span></li>`).join("")}</ul></div>`;
}

/* ---------- The villages of a province, and of the nation ---------- */
function provinceVillagesHtml(p) {
  const vs = (game.villages || []).filter(v => game.owner[v.cell] === PLAYER && game.prov[v.cell] === p.id);
  const live = vs.filter(v => v.status !== "ruin").sort((a, b) => b.pop - a.pop);
  const ruins = vs.length - live.length;
  if (!vs.length) return `<span class="eyebrow">Villages</span><p class="small muted">No villages yet: too few people live on its land.</p>`;
  const people = live.reduce((s, v) => s + v.pop, 0);
  const kinds = Object.entries(live.reduce((m, v) => (m[v.kind] = (m[v.kind] || 0) + 1, m), {})).map(([k, c]) => `${c} ${(VILLAGE_KINDS[k] || k).toLowerCase()}${c > 1 ? "s" : ""}`).join(", ");
  return `<span class="eyebrow">Villages · ${live.length}${ruins ? ` · ${ruins} in ruins` : ""}</span>
    <p class="small">${fmtPeople(people)} people live in its villages (${escapeHtml(kinds)}).</p>
    <ul class="factors">${live.slice(0, 8).map(v => `<li><span><button class="linkbtn" type="button" data-action="village-pick" data-vid="${v.id}">${escapeHtml(v.name)}</button> <span class="muted small">${escapeHtml(VILLAGE_PLANS[v.plan].label.toLowerCase())}${VILLAGE_STATUS[v.status] ? ` · ${VILLAGE_STATUS[v.status].label.toLowerCase()}` : ""}</span></span><span class="num">${fmtVillPeople(v.pop)}</span></li>`).join("")}</ul>
    ${live.length > 8 ? `<p class="muted small">And ${live.length - 8} more. Zoom in on the map to see them.</p>` : ""}`;
}
function countrysideHtml() {
  const s = villageStats(world, game, PLAYER);
  if (!s.count && !s.ruins) return "";
  const ready = s.ready.filter(r => r.check.ok);
  return `<div class="block"><span class="eyebrow">The countryside</span>
    <p class="small">${s.count} village${s.count === 1 ? "" : "s"} with ${fmtPeople(s.people)} people · ${s.growing} growing, ${s.shrinking} shrinking${s.markets.length ? ` · ${s.markets.length} market village${s.markets.length > 1 ? "s" : ""}` : ""}${s.booms.length ? ` · <span class="tone-good">${s.booms.length} boom camp${s.booms.length > 1 ? "s" : ""}</span>` : ""}${s.ruins ? ` · ${s.ruins} in ruins` : ""}${s.chartered.length ? ` · ${s.chartered.length} granted a town charter` : ""}.</p>
    ${ready.length ? `<p class="small">Ready to ask for a town charter: ${ready.slice(0, 4).map(r => `<button class="linkbtn" type="button" data-action="village-pick" data-vid="${r.v.id}">${escapeHtml(r.v.name)}</button>`).join(", ")}.</p>` : ""}</div>`;
}
/* The season report's village news. */
function villagesDispatchHtml(d) {
  const list = (d.villages || []).slice(0, 9);
  if (!list.length) return "";
  return `<div class="block"><span class="eyebrow">Villages</span><ul class="news">${list.map(x => `<li><span class="dot" style="background:${x.tone === "good" ? "var(--good)" : x.tone === "bad" ? "var(--bad)" : x.tone === "warn" ? "var(--warn)" : "var(--muted)"}"></span><span>${escapeHtml(x.text)}</span></li>`).join("")}</ul>${(d.villages || []).length > 8 ? `<p class="muted small">And ${(d.villages || []).length - 8} more.</p>` : ""}</div>`;
}

/* ---------- Clicks ---------- */
function lookAtVillage(v, mpp) {
  const s = villageSpot(v);
  const z = clamp(50000 / (mpp || 4) / view.base, ZOOM.min, ZOOM.max);
  view.zoom = z; view.cs = view.base * z;
  view.ox = view.vw / 2 - s.x * view.cs; view.oy = view.vh / 2 - s.y * view.cs;
  clampCamera(); updateZoomBox(); scheduleMapRender();
}
function selectVillage(id) { ui.selectedVillage = id; ui.selectedCity = null; ui.selectedCell = -1; ui.tab = "selected"; }
Object.assign(ACTIONS, {
  "village-pick": el => { const v = villageById(game, Number(el.dataset.vid)); if (!v) return; selectVillage(v.id); centerOnCell(v.cell, Math.max(view.zoom, 3)); },
  "village-work": el => {
    const v = villageById(game, Number(el.dataset.vid));
    if (!v) return;
    const r = orderVillageWork(world, game, PLAYER, v.id, el.dataset.k);
    if (!r.ok) { flashHint(r.reason); return; }
    addChronicle(game, r.text, "good", PLAYER);
    VDRAW.key = null; bumpMap(); saveGame();
  },
  "village-road": el => {
    const v = villageById(game, Number(el.dataset.vid));
    if (!v) return;
    const q = bestAccessRoad(world, game, PLAYER, v.cell, economies()[PLAYER]);
    if (q && q.ok) { ui.pending = q; ui.tab = "realm"; } else flashHint((q && q.reason) || "No road through your own land reaches it.");
  },
  "village-look": el => { const v = villageById(game, Number(el.dataset.vid)); if (!v) return; lookAtVillage(v, Math.max(1.5, villageRadius(v.pop, v.plan) * 50000 / 160)); },
});

/* ---------- Statistics: the Villages view ---------- */
function statsVillagesHtml() {
  const g = game, nid = PLAYER;
  const s = villageStats(world, g, nid);
  // who lives where, over all of the nation's land outside the towns' own squares
  let P = 0, inV = 0, inH = 0, nH = 0;
  for (let i = 0; i < N_CELLS; i++) {
    if (g.owner[i] !== nid) continue;
    const cs = cellSettlement(world, g, i);
    if (cs.town) continue;
    P += cs.P; inV += cs.inVillage; inH += cs.inHamlets; nH += cs.hamlets.length;
  }
  const farms = Math.max(0, P - inV - inH);
  const share = x => (P > 0 ? x / P : 0);
  const bar = [["In villages", inV, "var(--gold)"], ["In hamlets", inH, "#8fae6b"], ["On farms", farms, "#6b7f9e"]];
  const live = g.villages.filter(v => g.owner[v.cell] === nid && v.status !== "ruin").sort((a, b) => b.pop - a.pop);
  const growth = v => { const h = v.hist || []; const a = h.length >= 5 ? h[h.length - 5] : null; return a ? v.pop * 1e6 / a - 1 : null; };
  const looks = VILLAGE_PLAN_ORDER.filter(k => s.byPlan[k]).map(k => `<li><span>${escapeHtml(VILLAGE_PLANS[k].label)}</span><b class="num">${s.byPlan[k]}</b></li>`).join("");
  const table = `<div class="st-tablewrap"><table class="st-table compact"><thead><tr><th class="l">Village</th><th class="l">Province</th><th>People</th><th>A year</th><th class="l">Look</th><th class="l">Lives from</th><th>Site</th><th class="l">Now</th></tr></thead>
    <tbody>${live.slice(0, 80).map(v => {
      const gr = growth(v), p = provAt(g, v.cell), st = VILLAGE_STATUS[v.status];
      return `<tr><td class="l"><button class="linkbtn" type="button" data-action="village-stat" data-vid="${v.id}">${escapeHtml(v.name)}</button></td><td class="l">${p ? escapeHtml(p.name) : "—"}</td><td>${fmtVillPeople(v.pop)}</td><td class="${gr === null ? "" : gr > 0.005 ? "tone-good" : gr < -0.005 ? "tone-bad" : ""}">${gr === null ? "—" : signedPct(gr, 1)}</td><td class="l">${escapeHtml(VILLAGE_PLANS[v.plan].label)}</td><td class="l">${escapeHtml((VILLAGE_KINDS[v.kind] || "").replace(" village", "").toLowerCase())}</td><td>${siteScore(siteFeatures(world, g, v.cell, nid))}</td><td class="l ${st ? `tone-${st.tone}` : ""}">${st ? st.label : ""}</td></tr>`;
    }).join("")}</tbody></table></div>${live.length > 80 ? `<p class="muted small">The 80 biggest of ${live.length}.</p>` : ""}`;
  const M = villMeta(g);
  const ruins = g.villages.filter(v => g.owner[v.cell] === nid && v.status === "ruin").sort((a, b) => (b.ruinAt || 0) - (a.ruinAt || 0));
  const lost = `<ul class="news">${ruins.slice(0, 10).map(v => `<li><span class="dot" style="background:var(--bad)"></span><span><b>${escapeHtml(v.name)}</b> · abandoned ${seasonLabel(v.ruinAt || 0)} · ${fmtVillPeople(v.peak || 0)} people at its height</span></li>`).join("")}${s.chartered.map(c => `<li><span class="dot" style="background:var(--good)"></span><span><b>${escapeHtml(c.name)}</b> · became a town ${seasonLabel(c.turn)}, with ${fmtVillPeople(c.pop)} people</span></li>`).join("")}</ul>`;
  const world_ = liveNations(g).map(n => { const t = villageStats(world, g, n.id); return { n, t }; }).sort((a, b) => b.t.people - a.t.people);
  const worldTable = `<div class="st-tablewrap"><table class="st-table compact"><thead><tr><th class="l">Nation</th><th>Villages</th><th>People in them</th><th>Biggest</th><th>Ruins</th><th>Charters</th></tr></thead><tbody>${world_.map(({ n, t }) => `<tr><td class="l"><i class="sw" style="background:${n.color}"></i> ${escapeHtml(n.name)}</td><td>${t.count}</td><td>${fmtPeople(t.people)}</td><td>${t.biggest[0] ? `${escapeHtml(t.biggest[0].name)} (${fmtVillPeople(t.biggest[0].pop)})` : "—"}</td><td>${t.ruins}</td><td>${t.chartered.length}</td></tr>`).join("")}</tbody></table></div>`;
  void M;
  return `<div class="st-grid">
    ${card("Who lives where", `<div class="st-share">${bar.map(([l, v, c]) => `<div class="st-share-row"><span>${l}</span><span class="st-share-bar"><i style="width:${(share(v) * 100).toFixed(1)}%;background:${c}"></i></span><b class="num">${fmtPeople(v)} · ${pct(share(v))}</b></div>`).join("")}</div>
      <p class="muted small">Your land outside the towns' own squares: ${fmtPeople(P)} people. ${s.count} villages and ${fmtCount(nH)} hamlets. Everyone here also counts among the people of the nearest town's district.</p>`, { note: "the countryside" })}
    ${card("Looks", `<ul class="st-pills">${looks}</ul><p class="muted small">Chosen by each village's climate, its site, what it lives from and the age: walled yards in dry lands, villages under trees in wet ones, street villages along rivers and roads, modern streets near big cities.</p>`)}
    ${card("Growing and shrinking", `<p class="small">${s.growing} growing, ${s.shrinking} shrinking over the last year · ${s.markets.length} market village${s.markets.length === 1 ? "" : "s"} · ${s.booms.length} boom camp${s.booms.length === 1 ? "" : "s"}</p>${lost}`)}
    ${card("Every village", table, { wide: true, note: "biggest first" })}
    ${card("The world's villages", worldTable, { wide: true })}
  </div>`;
}
Object.assign(ACTIONS, {
  "village-stat": el => { const v = villageById(game, Number(el.dataset.vid)); if (!v) return; ui.stats = null; selectVillage(v.id); centerOnCell(v.cell, Math.max(view.zoom, 3)); },
});
