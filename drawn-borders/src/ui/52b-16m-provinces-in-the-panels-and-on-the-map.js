/* =====================================================================
   16m. Provinces in the panels and on the map (v38, part 1)
   The founding's second step (divide the country), the Provinces panel (key B) and its pen, thin province lines
   inside every country, province names when zoomed in, a mark on province capitals, and villages up close.
   The rules and numbers all live in engine 10u.
   ===================================================================== */
Object.assign(ICONS, { capitol: giSvg("lorc/capitol"), quill: giSvg("lorc/quill-ink") });
const PROV_TINTS = ["#e7c46a", "#7fc4d8", "#e08a7a", "#9ccf7c", "#c39be0", "#e3a95c", "#7fa6e6", "#d7d78a", "#8fd8b8", "#e6a0c4", "#b5b5b5", "#cfa77f"];
function provTint(p) { return PROV_TINTS[(p.id * 7) % PROV_TINTS.length]; }

/* ---------- The pen: draw around land, then choose what it becomes ---------- */
function provPenDone(path) {
  const inside = path.length >= 6 ? landCellsInsidePath(world, path).filter(c => game.owner[c] === PLAYER) : [];
  if (!inside.length) { ui.provDraw = null; flashHint("Draw around some of your own land."); return; }
  ui.provDraw = { cells: inside };
  ui.pending = null;
}
function provDrawTargets() {
  if (!ui.provDraw) return [];
  const ids = new Map();
  const set = new Set(ui.provDraw.cells);
  for (const c of ui.provDraw.cells) for (const [dx, dy] of DIRS4) {
    const x = cellX(c) + dx, y = cellY(c) + dy;
    if (!inBounds(x, y)) continue;
    const j = idx(x, y);
    if (set.has(j) || game.owner[j] !== PLAYER) continue;
    const p = provAt(game, j);
    if (p) ids.set(p.id, (ids.get(p.id) || 0) + 1);
  }
  for (const c of ui.provDraw.cells) { const p = provAt(game, c); if (p && !ids.has(p.id)) ids.set(p.id, 0); }
  return [...ids.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => provById(game, id)).filter(Boolean);
}
/* At the founding a change is made at once and costs nothing; later it is a project with a cost and a time. */
function provChange(op) {
  if (ui.phase === "provinces") {
    const plan = provincePlan(world, game, PLAYER, op);
    if (!plan.ok) { flashHint(plan.reason); return; }
    applyProvincePlan(game, PLAYER, plan);
    ui.provDraw = null;
    bumpMap();
    return;
  }
  const q = quoteProvince(world, game, PLAYER, op, economies()[PLAYER]);
  if (!q.ok) { flashHint(q.reason); return; }
  ui.pending = q;
  ui.provDraw = null;
}

/* ---------- The founding's second step ---------- */
function foundingProvincesHtml() {
  const econ = computeEconomy(world, game, PLAYER);
  const st = provinceStats(world, game, PLAYER, econ);
  const rows = st.map(s => provFoundingRowHtml(s)).join("");
  return `<div class="side-body">
    <div class="block">
      <span class="eyebrow">Founding · step 2 of 2</span>
      <h2 class="side-title">Divide your country into provinces</h2>
      <p class="small">Like the states of a country: each province has a capital and its own towns and villages. A province with no town yet is a territory, run from the national capital, until a town grows there.</p>
      <p class="small"><b>Draw on the map</b> around some land to make it a province, or let the game divide it. You can change them later (that costs money and time, as in real life).</p>
    </div>
    ${ui.provDraw ? provDrawCardHtml() : ""}
    <div class="actions">
      <button class="btn" type="button" data-action="prov-auto">Divide it for me</button>
      <span class="muted small">or into</span>
      ${[1, 2, 3, 4, 5].map(k => `<button class="btn small" type="button" data-action="prov-auto" data-k="${k}" title="${k === 1 ? "The whole country as one province" : `${k} provinces of about the same size`}">${k}</button>`).join("")}
    </div>
    <div class="actions"><button class="btn primary" type="button" data-action="prov-start">Start with these provinces</button></div>
    <div class="block"><span class="eyebrow">${st.length} province${st.length > 1 ? "s" : ""} · click a name to change it</span><div class="prov-list">${rows}</div></div>
    <p class="muted small">Province capitals govern their province: more public jobs, more loyal and prouder people, and if the national capital ever falls, the government carries on from the biggest one. Their offices cost a little upkeep.</p>
  </div>`;
}
function provFoundingRowHtml(s) {
  const p = s.p;
  const capOpts = s.towns.map(t => `<option value="${t.id}" ${s.capital && s.capital.id === t.id ? "selected" : ""}>${escapeHtml(t.name)}${t.capital ? " (national capital)" : ""}</option>`).join("");
  return `<div class="prov-row">
    <span class="prov-sw" style="background:${provTint(p)}"></span>
    <input class="prov-name" type="text" maxlength="32" data-prov-name="${p.id}" value="${escapeHtml(p.name)}" aria-label="Province name">
    <span class="prov-cap"><span class="muted small">${fmtArea(s.cells)} · ${fmtPop(s.pop)}</span> · ${s.towns.length ? `Capital <select data-prov-cap="${p.id}">${s.capital ? "" : `<option value="" selected>none yet</option>`}${capOpts}</select>` : `<span class="tone-warn small">Territory: no town yet</span>`}</span>
  </div>`;
}
function provDrawCardHtml() {
  const cells = ui.provDraw.cells;
  const pop = cells.reduce((s, c) => s + game.pop[c], 0);
  const towns = game.cities.filter(c => c.owner === PLAYER && cells.includes(c.cell));
  const targets = provDrawTargets();
  return `<div class="confirm">
    <span class="eyebrow">The land you drew</span>
    <p class="small">${fmtArea(cells.length)} · ${fmtPop(pop)}${towns.length ? ` · ${towns.map(t => escapeHtml(t.name)).join(", ")}` : " · no town"}</p>
    <div class="actions">
      <button class="btn primary" type="button" data-action="prov-draw-new" ${cells.length < PROV.minCells ? "disabled" : ""}>Make it a new province</button>
      ${targets.map(p => `<button class="btn" type="button" data-action="prov-draw-to" data-pid="${p.id}">Add it to ${escapeHtml(p.name)}</button>`).join("")}
      <button class="btn" type="button" data-action="prov-draw-cancel">Cancel</button>
    </div>
    ${cells.length < PROV.minCells ? `<p class="muted small">A new province needs at least ${fmtArea(PROV.minCells)}.</p>` : ""}
  </div>`;
}
/* Bring the new country into view for its division, and back out when time starts. */
function provFocusOwnLand() {
  let x0 = GRID_W, x1 = 0, y0 = GRID_H, y1 = 0;
  for (let i = 0; i < N_CELLS; i++) if (game.owner[i] === PLAYER) { x0 = Math.min(x0, cellX(i)); x1 = Math.max(x1, cellX(i)); y0 = Math.min(y0, cellY(i)); y1 = Math.max(y1, cellY(i)); }
  if (x1 < x0) return;
  const free = Math.max(200, view.vw - 440);   // the sidebar covers the right side
  const z = clamp(Math.min(free / ((x1 - x0 + 4) * view.base), view.vh / ((y1 - y0 + 4) * view.base)), 1, 3.5);
  view.zoom = z; view.cs = view.base * z;
  view.ox = free / 2 - ((x0 + x1) / 2 + 0.5) * view.cs; view.oy = view.vh / 2 - ((y0 + y1) / 2 + 0.5) * view.cs;
  clampCamera(); updateZoomBox(); scheduleMapRender();
}
function startWithProvinces() {
  ui.phase = "play"; ui.tab = null; ui.tool = "select"; ui.provDraw = null;
  zoomFit();
  const name = game.nations[PLAYER].name;
  const cap = game.cities.find(c => c.owner === PLAYER && c.capital).cell;
  const rivals = game.nations.filter(n => !n.isPlayer).map(n => {
    const rc = game.cities.find(c => c.owner === n.id && c.capital);
    return `the ${n.name} to the ${directionWord(cap, rc.cell)}`;
  });
  addChronicle(game, `${name} is founded. Its neighbors: ${bJoin(rivals)}.`, "neutral", PLAYER);
  const list = provList(game, PLAYER);
  addChronicle(game, list.length > 1 ? `${name} is divided into ${list.length} provinces: ${bJoin(list.map(p => p.name))}.` : `${name} is governed as one province.`, "neutral", PLAYER);
  bumpMap();
  startDeliberation();
}

/* ---------- The Provinces panel ---------- */
function provincesTabHtml() {
  const econ = economies()[PLAYER];
  const st = provinceStats(world, game, PLAYER, econ);
  const busy = game.projects.filter(p => p.kind === "province" && p.nid === PLAYER);
  const seats = provSeatsOf(game, PLAYER);
  const upkeep = econ.regions.reduce((s, r) => s + (r.cm.seat && r.cm.focus !== "seat" ? focusUpkeepCost("seat", r) : 0), 0);
  const tot = st.reduce((a, s) => ({ pop: a.pop + s.pop, gdp: a.gdp + s.gdp }), { pop: 0, gdp: 0 });
  const growthTxt = g => (g === null || g === undefined ? "—" : `<span class="tone-${g > 0.002 ? "good" : g < -0.002 ? "bad" : "neutral"}">${signedPct(g, 1)}</span>`);
  const cards = st.map(s => {
    const p = s.p, open = ui.openProv === p.id;
    const share = tot.pop > 0 ? s.pop / tot.pop : 0;
    const vill = (game.villages || []).filter(v => game.owner[v.cell] === PLAYER && game.prov[v.cell] === p.id).sort((a, b) => b.pop - a.pop);
    const neigh = provNeighbors(p);
    const info = provinceNeeds(world, game, p, econ);
    const head = `<div class="prov-head">
        <span class="prov-sw" style="background:${provTint(p)}"></span>
        <button class="linkbtn prov-title" type="button" data-action="prov-open" data-pid="${p.id}">${escapeHtml(p.name)}</button>
        <span class="muted small">${s.capital ? `${s.capital.capital ? "★ " : ""}${escapeHtml(s.capital.name)}` : `<span class="tone-warn">Territory</span>`}</span>
      </div>
      <div class="prov-figs small">
        <span title="People living in the province, and its share of the nation">${fmtPop(s.pop)} <span class="muted">(${pct(share)})</span></span>
        <span title="Output a year: each town's output shared among the provinces its land lies in, by where its people live">${fmtMoney(s.gdp)}/yr</span>
        <span title="Output per person a year">$${s.perK.toFixed(1)}k each</span>
        <span title="People now against a year ago">${growthTxt(s.growth)}</span>
      </div>
      ${provMoneyHtml(p, info)}`;
    if (!open) return `<div class="prov-card">${head}</div>`;
    const towns = s.towns.map(t => {
      const r = econ.regions.find(x => x.city.id === t.id);
      const pop = r ? r.pop : t.pop || 0;
      return `<li><span><button class="linkbtn" type="button" data-city-pick="${t.id}">${escapeHtml(t.name)}</button>${t.capital ? " · national capital" : s.capital && s.capital.id === t.id ? " · province capital" : ""}</span><span class="num">${escapeHtml(cityTier(pop).label)} · ${fmtPop(pop)}</span></li>`;
    }).join("");
    const capChoice = s.towns.length ? `<label class="small">Capital <select data-prov-cap="${p.id}">${s.capital ? "" : `<option value="" selected>none yet (a territory)</option>`}${s.towns.map(t => `<option value="${t.id}" ${s.capital && s.capital.id === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}</select></label>` : "";
    return `<div class="prov-card open">${head}
      <div class="prov-body">
        <label class="small">Name <input class="prov-name" type="text" maxlength="32" data-prov-name="${p.id}" value="${escapeHtml(p.name)}"></label>
        <p class="muted small">${fmtArea(s.cells)} · made ${p.made ? seasonLabel(p.made) : "at the founding"}${s.territory ? ` · a territory: run from ${escapeHtml((game.cities.find(c => c.owner === PLAYER && c.capital) || { name: "the capital" }).name)}${s.towns.length ? ". A town has grown here: choose it as the capital to make this a full province" : " until a town grows here"}` : ""}.</p>
        ${towns ? `<span class="eyebrow">Towns and cities</span><ul class="factors">${towns}</ul>` : `<p class="small muted">No town yet.</p>`}
        ${provNeedsHtml(p, info)}
        <span class="eyebrow">Villages · ${vill.length}</span>
        <p class="small">${vill.length ? `${vill.slice(0, 6).map(v => `${escapeHtml(v.name)} <span class="muted">(${fmtCount(Math.round(v.pop * 1e6 / 100) * 100)})</span>`).join(", ")}${vill.length > 6 ? ` and ${vill.length - 6} more` : ""}. Zoom in on the map to see them.` : "No villages: too few people live off the land here."}</p>
        <div class="actions">${capChoice}${neigh.length ? `<label class="small">Join it to <select data-prov-join="${p.id}"><option value="" selected>…</option>${neigh.map(q => `<option value="${q.id}">${escapeHtml(q.name)}</option>`).join("")}</select></label>` : ""}
          <button class="btn small" type="button" data-action="prov-center" data-pid="${p.id}">Show on the map</button></div>
      </div></div>`;
  }).join("");
  return `
    <div class="block">
      <p class="small">${st.length} province${st.length > 1 ? "s" : ""}${seats.length ? ` · ${seats.length} province capital${seats.length > 1 ? "s" : ""} besides the national capital` : ""}${st.some(s => s.territory) ? ` · ${st.filter(s => s.territory).length} territor${st.filter(s => s.territory).length > 1 ? "ies" : "y"}` : ""}.${upkeep > 0.0005 ? ` Their governments' offices cost ${fmtMoneyFine(upkeep)} a season.` : ""}${(econ.provGrants || 0) > 0.0005 ? ` Money for the provinces: ${fmtMoneyFine(econ.provGrants)} a season, spent by their governors.` : ""}</p>
      <div class="actions"><button class="btn ${ui.tool === "province" ? "primary" : ""}" type="button" data-action="prov-pen">${ICONS.quill} ${ui.tool === "province" ? "Drawing: draw around land on the map" : "Redraw with the pen"}</button></div>
      ${busy.length ? `<p class="notice info">Under way: ${busy.map(b => `${escapeHtml(b.label)} (${b.seasons - b.progress} season${b.seasons - b.progress > 1 ? "s" : ""} left)`).join("; ")}.</p>` : ""}
    </div>
    ${ui.provDraw ? provDrawCardHtml() : ""}
    ${provNeedsReportHtml(st, econ)}
    <div class="prov-cards">${cards}</div>
    <p class="muted small">Province capitals (not the national capital) have a governor's offices: 1.5% more public jobs there, people who come to feel at home faster (+1.5 loyalty a season) and are prouder (+${FOCI.seat.mood} mood). Each eases governing a large country (up to ${PROV.seatEaseMax}). If the national capital falls, the government carries on from the biggest one. Upkeep: ${(FOCI.seat.upkeep * 100).toFixed(1)}% of its town's output a season. A new province costs its capital's offices (${pct(PROV.newShare)} of that town's output) and about ${PROV.newSeasons} seasons; joining or moving land takes a season.</p>`;
}
function provNeighbors(p) {
  const ids = new Set();
  for (let i = 0; i < N_CELLS; i++) {
    if (game.prov[i] !== p.id || game.owner[i] !== p.owner) continue;
    for (const [dx, dy] of DIRS4) {
      const x = cellX(i) + dx, y = cellY(i) + dy;
      if (!inBounds(x, y)) continue;
      const j = idx(x, y);
      if (game.owner[j] === p.owner && game.prov[j] !== p.id && game.prov[j] >= 0) ids.add(game.prov[j]);
    }
  }
  return [...ids].map(id => provById(game, id)).filter(Boolean);
}
function provConfirmLines(q) {
  const lines = provPlanLines(game, q.plan).map(escapeHtml);
  if (q.op.t === "capital") {
    const c = cityById(q.op.cityId);
    lines.unshift(`${escapeHtml(c ? c.name : "The town")} gets the governor's offices: more public jobs, loyalty and pride there${provCapital(game, provById(game, q.op.pid)) ? "; the old capital loses them" : ". The territory becomes a full province"}`);
  }
  lines.push(`Ready in ${q.seasons} season${q.seasons > 1 ? "s" : ""}; until then nothing changes`);
  return lines;
}

/* ---------- Actions and inputs ---------- */
Object.assign(ACTIONS, {
  "prov-auto": el => {
    const k = el.dataset.k ? Number(el.dataset.k) : null;
    let area = 0;
    for (let i = 0; i < N_CELLS; i++) if (game.owner[i] === PLAYER) area++;
    autoDivide(world, game, PLAYER, k || autoProvinceCount(area));
    bumpWorld(game); ui.provDraw = null; bumpMap();
  },
  "prov-start": () => startWithProvinces(),
  "prov-draw-new": () => { if (ui.provDraw) provChange({ t: "draw", cells: ui.provDraw.cells, to: null }); },
  "prov-draw-to": el => { if (ui.provDraw) provChange({ t: "draw", cells: ui.provDraw.cells, to: Number(el.dataset.pid) }); },
  "prov-draw-cancel": () => { ui.provDraw = null; },
  "prov-pen": () => { if (ui.tool === "province") setTool("select"); else { setTool("province"); ui.tab = "provinces"; } },
  "prov-open": el => { const id = Number(el.dataset.pid); ui.openProv = ui.openProv === id ? null : id; },
  "prov-center": el => { const p = provById(game, Number(el.dataset.pid)); if (!p) return; const c = provCapital(game, p); const cells = provCells(game, p); centerOnCell(c ? c.cell : cells[Math.floor(cells.length / 2)], Math.max(view.zoom, 2)); },
});
function onProvinceInput(e) {
  const t = e.target;
  if (!game || !t || !t.dataset) return;
  if (t.dataset.provName !== undefined && e.type === "change") {
    if (!renameProvince(game, PLAYER, Number(t.dataset.provName), t.value)) flashHint("Give it a name no other province of yours has.");
    bumpWorld(game); bumpMap(); saveGame(); renderAll();
  } else if (t.dataset.provCap !== undefined && e.type === "change" && t.value) {
    provChange({ t: "capital", pid: Number(t.dataset.provCap), cityId: Number(t.value) });
    if (ui.phase === "play") ui.tab = "provinces";
    saveGame(); renderAll();
  } else if (t.dataset.provJoin !== undefined && e.type === "change" && t.value) {
    provChange({ t: "join", from: Number(t.dataset.provJoin), into: Number(t.value) });
    saveGame(); renderAll();
  }
}
document.getElementById("sidebar").addEventListener("change", onProvinceInput);
document.getElementById("sidebar").addEventListener("keydown", e => { if (e.target && e.target.dataset && e.target.dataset.provName !== undefined && e.key === "Enter") e.target.blur(); });

/* ---------- On the map ---------- */
/* Province lines run only between two provinces of the same nation (never along a coast or a national border). */
function buildProvinceShapes(sh) {
  sh.provs = [];
  sh.provFill = [];
  sh.provLabels = [];
  if (!game || !game.prov || !game.provinces) return;
  const P = game.prov, O = game.owner;
  const live = new Map(game.provinces.map(p => [p.id, p]));
  const pidAt = (x, y) => { if (!inBounds(x, y)) return -1; const i = idx(x, y); const p = live.get(P[i]); return p && p.owner === O[i] ? p.id : -1; };
  const sameNation = (x, y) => {
    const o = inBounds(x, y) ? O[idx(x, y)] : -1;
    if (o < 0 || !isLand(world, idx(x, y))) return -2;
    return o;
  };
  for (const p of game.provinces) {
    if (!(game.nations[p.owner] && game.nations[p.owner].alive)) continue;
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < N_CELLS; i++) if (P[i] === p.id && O[i] === p.owner) { sx += cellX(i) + 0.5; sy += cellY(i) + 0.5; n++; }
    if (!n) continue;
    const keep = (x, y) => { const a = sameNation(x, y); return a >= 0 && a === sameNation(x + 1, y) && a === sameNation(x, y + 1) && a === sameNation(x + 1, y + 1); };
    sh.provs.push({ p, path: linesToPath(contourLines((x, y) => pidAt(x, y) === p.id, keep), 2) });
    if (p.owner === PLAYER) sh.provFill.push({ p, path: linesToPath(contourLines((x, y) => pidAt(x, y) === p.id || (inBounds(x, y) && !isLand(world, idx(x, y)) && DIRS8.some(([dx, dy]) => pidAt(x + dx, y + dy) === p.id))), 2) });
    // the label sits on the province cell nearest its middle, away from towns (their names come first)
    const mx = sx / n, my = sy / n;
    const nearTown = i => game.cities.some(c => Math.abs(cellX(c.cell) - cellX(i)) <= 2 && Math.abs(cellY(c.cell) - cellY(i)) <= 1);
    let best = -1, bd = Infinity;
    for (let i = 0; i < N_CELLS; i++) if (P[i] === p.id && O[i] === p.owner) { const d = Math.hypot(cellX(i) + 0.5 - mx, cellY(i) + 0.5 - my) + (nearTown(i) ? 4 : 0); if (d < bd) { bd = d; best = i; } }
    sh.provLabels.push({ p, x: cellX(best) + 0.5, y: cellY(best) + 0.5, n });
  }
}
function provShowTints() { return ui.phase === "provinces" || (ui.phase === "play" && (ui.tab === "provinces" || ui.tool === "province")); }
function drawProvinceLines(o, cs) {
  const sh = buildShapes();
  if (!sh.provs || !sh.provs.length) return;
  const px = v => v / cs;
  if (provShowTints()) for (const { p, path } of sh.provFill) { o.fillStyle = rgba(provTint(p), ui.openProv === p.id ? 0.42 : 0.26); o.fill(path, "evenodd"); }
  o.setLineDash([px(clamp(cs * 0.3, 3, 9)), px(clamp(cs * 0.2, 2, 6))]);
  for (const { p, path } of sh.provs) {
    o.strokeStyle = "rgba(10,10,10,0.35)"; o.lineWidth = px(clamp(cs * 0.09, 1.6, 3)); o.stroke(path);
    o.strokeStyle = rgba(provShowTints() && p.owner === PLAYER ? "#f6edd2" : NATION_COLORS[p.owner], provShowTints() && p.owner === PLAYER ? 0.9 : 0.75);
    o.lineWidth = px(clamp(cs * 0.045, 0.9, 1.6)); o.stroke(path);
  }
  o.setLineDash([]);
}
function drawProvinceLabels(c, cs) {
  const sh = buildShapes();
  if (!sh.provLabels || !sh.provLabels.length) return;
  const tint = provShowTints();
  const az = smooth01(1.45, 1.9, view.zoom) * (1 - 0.6 * smooth01(3.5, 5, view.zoom));
  const taken = (view.townBoxes || []).concat((view.siteBoxes || []).map(b => ({ x0: b.x - b.r, x1: b.x + b.r + 110, y0: b.y - b.r, y1: b.y + b.r })));   // mines and camps with their names
  view.provBoxes = [];
  const hit = b => taken.some(p => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
  for (const l of sh.provLabels.slice().sort((a, b) => b.n - a.n)) {
    const mineTint = tint && l.p.owner === PLAYER;
    const a = mineTint ? 0.95 : az;
    if (a < 0.03 || (!mineTint && l.n < 5)) continue;
    const size = clamp(Math.sqrt(l.n) * cs * (mineTint ? 0.075 : 0.06), 10, mineTint ? 22 : 18);
    const text = l.p.name.toUpperCase(), terr = isTerritory(game, l.p) && (mineTint || cs >= 24);
    c.font = `700 ${size}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
    const half = (c.measureText(text).width + text.length * size * 0.18) / 2;
    // the middle of the province, or a little above or below it when a town's name is there
    let at = null;
    for (const dy of [0, 1.1, -1.1, 2.2, -2.2]) {
      const y = (l.y + dy) * cs, b = { x0: l.x * cs - half, x1: l.x * cs + half, y0: y - size * 0.6, y1: y + size * (terr ? 1.3 : 0.6) };
      if (!hit(b)) { at = { y, b }; break; }
    }
    if (!at) { if (!mineTint) continue; const y = l.y * cs; at = { y, b: { x0: l.x * cs - half, x1: l.x * cs + half, y0: y - size * 0.6, y1: y + size * 0.6 } }; }
    taken.push(at.b); view.provBoxes.push(at.b);
    drawLabel(c, text, l.x * cs, at.y, size, 700, a * (mineTint ? 0.85 : l.p.owner === PLAYER ? 0.6 : 0.45), size * 0.18);
    if (terr) drawLabel(c, "territory", l.x * cs, at.y + size * 0.95, size * 0.62, 600, a * 0.6, 1);
  }
}
function drawProvinceCapitalMark(c, city, x, y, rad) {
  if (!provSeat(game, city)) return;
  c.strokeStyle = "rgba(12,10,8,0.9)"; c.lineWidth = 4.2;
  c.beginPath(); c.arc(x, y, rad + 2.4, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = "#f0d58a"; c.lineWidth = 2;
  c.beginPath(); c.arc(x, y, rad + 2.4, 0, Math.PI * 2); c.stroke();
}
function drawVillages(c, cs) {
  if (!game.villages || cs < 26) return;
  const a = smooth01(26, 36, cs);
  const named = cs >= 46;
  const placed = (view.townBoxes || []).concat(view.provBoxes || []);
  const x0 = -view.ox / cs - 1, y0 = -view.oy / cs - 1, x1 = x0 + view.vw / cs + 2, y1 = y0 + view.vh / cs + 2;
  for (const v of game.villages) {
    const vx = cellX(v.cell) + 0.3 + 0.4 * hash2(v.cell, 1, 31), vy = cellY(v.cell) + 0.3 + 0.4 * hash2(v.cell, 2, 31);
    if (vx < x0 || vx > x1 || vy < y0 || vy > y1 || game.owner[v.cell] < 0) continue;
    const x = vx * cs, y = vy * cs, r = clamp(1.2 + v.pop * 80, 1.6, 2.8);
    c.globalAlpha = a;
    c.fillStyle = "#efe6cf"; c.strokeStyle = "rgba(12,10,8,0.85)"; c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.globalAlpha = 1;
    if (!named) continue;
    const size = clamp(cs * 0.2, 9.5, 12);
    c.font = `italic 500 ${size}px "IBM Plex Sans", system-ui, sans-serif`;
    const tw = c.measureText(v.name).width;
    const box = { x0: x + r + 2, x1: x + r + 4 + tw, y0: y - size * 0.6, y1: y + size * 0.6 };
    if (placed.some(p => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
    placed.push(box);
    c.font = `italic 500 ${size}px "IBM Plex Sans", system-ui, sans-serif`;
    c.textAlign = "left"; c.textBaseline = "middle"; c.lineJoin = "round";
    c.globalAlpha = a * 0.92;
    c.lineWidth = 2.6; c.strokeStyle = "rgba(10,9,8,0.75)"; c.strokeText(v.name, x + r + 3, y);
    c.fillStyle = "#efe8d6"; c.fillText(v.name, x + r + 3, y);
    c.globalAlpha = 1;
  }
}
function drawProvincePreview(c, cs) {
  let cells = null, color = "rgba(220,184,94,0.36)";
  if (ui.provDraw) cells = ui.provDraw.cells;
  else if (ui.pending && ui.pending.kind === "province" && ui.pending.plan) cells = ui.pending.plan.moved;
  if (!cells || !cells.length) return;
  c.fillStyle = color;
  for (const i of cells) c.fillRect(cellX(i) * cs, cellY(i) * cs, cs + 0.5, cs + 0.5);
}
/* The province (and village) of a cell, for the map's hover card. */
function provTooltipLines(i) {
  if (!game || !game.prov) return "";
  const p = provAt(game, i);
  const v = villageAt(game, i);
  let out = "";
  if (v && game.owner[i] >= 0) out += `<span class="tt-line">${escapeHtml(v.name)}: ${VILLAGE_KINDS[v.kind].toLowerCase()} of about ${fmtCount(Math.round(v.pop * 1e6 / 100) * 100)} people</span>`;
  if (p) out += `<span class="tt-line">${isTerritory(game, p) ? "Territory" : "Province"}: ${escapeHtml(p.name)}</span>`;
  return out;
}

/* ---------- Money for each province, governors and the needs report (Part 2, engine 10v) ---------- */
function provMoneyHtml(p, info) {
  const lv = provFundIndex(p);
  if (!info.regs.length) return `<p class="muted small">No town of its own yet, so no money to spend: its people are counted in a town of another province.</p>`;
  return `<div class="prov-money"><span class="small muted">${p.gov ? `Governor ${escapeHtml(p.gov.name)}` : "Run by the Interior ministry"} · money a season</span>
    <span class="seg">${PGOV.levels.map((L, k) => `<button class="btn small ${k === lv ? "on" : ""}" type="button" data-action="prov-fund" data-pid="${p.id}" data-k="${k}" title="${L.label}: ${(L.share * 100).toFixed(1)}% of the province's output a year, every season">${L.label}${k ? ` ${fmtMoneyFine(provGrantOf(info.gdp, k))}` : ""}</button>`).join("")}</span></div>`;
}
function provNeedsHtml(p, info) {
  const last = (p.govLog || []).slice(-1)[0];
  const needs = info.needs.filter(x => x.key !== "dev");
  return `<span class="eyebrow">What it needs</span>
    <ul class="factors">${needs.length ? needs.map(x => `<li><span><b>${escapeHtml(x.label)}</b>: ${escapeHtml(x.text)}<span class="sub">${x.money ? `Its money pays for ${escapeHtml(x.who)}` : `Money from the province can't fix this: ${escapeHtml(x.who)}`}</span></span></li>`).join("") : `<li><span>Nothing pressing: its money goes to local roads and markets (a little more output).</span></li>`}</ul>
    ${last && last.spent > 0.0005 ? `<p class="small">Last season ${escapeHtml(governorTitle(game, p))} spent ${fmtMoneyFine(last.spent)}: ${last.items.map(i => `${escapeHtml(i.label)} (${fmtMoneyFine(i.money)}: ${escapeHtml(i.text)})`).join("; ")}.</p>` : ""}`;
}
/* Which provinces need money most, from their numbers; and what only the national government can fix. */
function provNeedsReportHtml(st, econ) {
  const rows = [];
  for (const s of st) {
    const info = provinceNeeds(world, game, s.p, econ);
    for (const x of info.needs) if (x.key !== "dev") rows.push({ p: s.p, x, lv: provFundIndex(s.p) });
  }
  if (!rows.length) return `<div class="block"><span class="eyebrow">Needs report</span><p class="small muted">No province has a pressing need. Their money goes to local roads and markets.</p></div>`;
  rows.sort((a, b) => (b.x.money ? 1 : 0) - (a.x.money ? 1 : 0) || b.x.weight - a.x.weight);
  return `<div class="block"><span class="eyebrow">Needs report</span><ul class="factors">${rows.slice(0, 6).map(({ p, x, lv }) => `<li><span><b>${escapeHtml(p.name)}</b> · ${escapeHtml(x.label)}: ${escapeHtml(x.text)}<span class="sub">${x.money ? (lv >= 2 ? `Money ${PGOV.levels[lv].label.toLowerCase()}: its governor pays for ${escapeHtml(x.who)}` : `Money ${PGOV.levels[lv].label.toLowerCase()}: more would pay for ${escapeHtml(x.who)}`) : `Needs ${escapeHtml(x.who)}`}</span></span></li>`).join("")}</ul></div>`;
}
function provincesDispatchHtml(d) {
  const list = d.provinces || [];
  if (!list.length) return "";
  return `<div class="block"><span class="eyebrow">Provinces</span><ul class="news">${list.slice(0, 6).map(x => `<li><span class="dot" style="background:var(--gold)"></span><span>${escapeHtml(x.text)}${x.why ? `<span class="why">${escapeHtml(x.why)}</span>` : ""}</span></li>`).join("")}</ul></div>`;
}
Object.assign(ACTIONS, {
  "prov-fund": el => { const p = provById(game, Number(el.dataset.pid)); const k = Number(el.dataset.k); if (p && p.owner === PLAYER && PGOV.levels[k]) { p.fund = k; bumpMap(); } },
});
