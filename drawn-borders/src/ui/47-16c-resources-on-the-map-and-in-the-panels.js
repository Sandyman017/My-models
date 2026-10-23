/* =====================================================================
   16c. Resources on the map and in the panels: deposits, sites, surveys, world prices
   ===================================================================== */
const SITE_COLORS = { mine: "#9db4c9", coalmine: "#3b3632", goldmine: "#e3be45", oilfield: "#5a4a6e", logging: "#6f8f45", fishing: "#4f9fcf" };
const RES_COLORS = { 1: "#a9c3dc", 2: "#b79a7a", 3: "#a77fd0", 4: "#e9c247" };
const SPARK_COLORS = { mine: "#a9c3dc", coalmine: "#b79a7a", goldmine: "#e9c247", oilfield: "#a77fd0", logging: "#8fb35a", fishing: "#6fb6e0" };
function articleFor(word) { return /^[aeiou]/i.test(word) ? "an" : "a"; }   // just the article: aAn() (10o) gives "an oil field"
const PRICE_COLORS = { timber: "#8fb35a", metals: "#9db4c9", coal: "#b79a7a", oil: "#a77fd0", gold: "#e3be45" };
const PRICE_LABELS = { timber: "Timber", metals: "Metals", coal: "Coal", oil: "Oil and gas", gold: "Gold" };

function hitSite(px, py) {
  const boxes = view.siteBoxes || [];
  for (let k = boxes.length - 1; k >= 0; k--) { const b = boxes[k]; if (Math.hypot(px - b.x, py - b.y) <= b.r + 3) return b; }
  return null;
}
function siteAt(cell) { return game ? game.sites.find(s => s.cell === cell) : null; }
function siteEcon(s) {
  const owner = game.owner[s.cell];
  if (owner < 0) return null;
  const e = economies()[owner];
  return e && e.sites ? e.sites.find(x => x.site.id === s.id) || null : null;
}
function knownDepositAt(cell) {
  if (!world.dep) return 0;
  const t = depositType(world, cell);
  if (!t) return 0;
  if (!game) return world.dep[cell] || 0;
  return knowsDeposit(world, game, PLAYER, cell) ? t : 0;
}
function reserveText(cell, t) {
  const left = game ? game.depLeft[cell] : world.depTotal[cell];
  if (game && knowsSize(world, game, PLAYER, cell)) return fmtAmount(t, left);
  const est = depositEstimate(world, game, cell);
  const used = game ? Math.max(0, world.depTotal[cell] - left) : 0;
  return `about ${fmtAmount(t, Math.max(0, est.low - used)).replace(/ .*/, "")}–${fmtAmount(t, Math.max(0, est.high - used))}`;
}
function yearsLeft(s, x) {
  const def = SITE_KINDS[s.kind];
  if (!def.res || !x || !(x.outUnits > 0)) return null;
  return game.depLeft[s.cell] / x.outUnits;
}

/* ---------- Drawing: icons for sites, rings for deposits, labels in the resources view ---------- */
const SITE_GLYPHS = { mine: "lorc/mining", coalmine: "delapouite/mine-wagon", goldmine: "willdabeast/gold-bar", oilfield: "delapouite/oil-pump", logging: "skoll/logging", fishing: "delapouite/fishing" };
const DEP_GLYPHS = { 1: "faithtoken/ore", 2: "lorc/rock", 3: "lorc/drop", 4: "delapouite/gold-nuggets" };
function siteGlyph(c, kind, x, y, s, color) {
  if (SITE_GLYPHS[kind]) giDraw(c, SITE_GLYPHS[kind], x, y, s * 2.15, color);
}
function drawSites(c, cs) {
  view.siteBoxes = [];
  if (!game || !game.sites) return;
  const rv = ui.resView;
  if (cs < 9 && !rv) return;
  const r = rv ? clamp(cs * 0.3, 7, 13) : clamp(cs * 0.2, 4.5, 11);
  const labels = [];
  for (const s of game.sites) {
    const [x0, y0] = cellCenter(s.cell, cs);
    const onTown = game.cities.some(t => t.cell === s.cell);
    const x = x0 + (onTown ? r * 1.6 : 0), y = y0 + (onTown ? r * 1.2 : 0);
    if (x < -20 - view.ox || y < -20 - view.oy || x > view.vw - view.ox + 20 || y > view.vh - view.oy + 20) continue;
    view.siteBoxes.push({ id: s.id, cell: s.cell, x, y, r });
    const owner = game.owner[s.cell];
    const dead = s.exhausted;
    c.globalAlpha = dead ? 0.55 : s.paused ? 0.7 : 1;
    c.fillStyle = "rgba(12,10,8,0.85)";
    c.beginPath(); c.arc(x, y, r + 1.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = dead ? "#55524c" : SITE_COLORS[s.kind];
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    if (owner >= 0) { c.strokeStyle = NATION_COLORS[owner]; c.lineWidth = Math.max(1.5, r * 0.22); c.beginPath(); c.arc(x, y, r + 1.5, 0, Math.PI * 2); c.stroke(); }
    const dark = ["goldmine", "mine", "logging", "fishing"].includes(s.kind) && !dead;
    siteGlyph(c, s.kind, x, y, r * 0.62, dark ? "#16130f" : "#f3efe6");
    if (s.smelter && !dead) drawSmelterMark(c, x, y, r, cs);
    c.globalAlpha = 1;
    // what is left: a small bar under the icon
    const def = SITE_KINDS[s.kind];
    let frac = null;
    if (def.res) frac = game.depLeft[s.cell] / Math.max(0.001, world.depTotal[s.cell]);
    else if (def.renew === "forest") frac = forestStock(world, game, s.cell).share;
    else if (def.renew === "fish") frac = fishStock(world, game, s.cell).share;
    if (frac !== null && (rv || cs >= 20) && !dead) {
      const bw = r * 2, by = y + r + 3;
      c.fillStyle = "rgba(10,9,8,0.85)"; c.fillRect(x - bw / 2 - 1, by - 1, bw + 2, 4);
      c.fillStyle = frac > 0.5 ? "#6fc28c" : frac > 0.25 ? "#e4b14d" : "#ef7c68"; c.fillRect(x - bw / 2, by, bw * clamp(frac, 0, 1), 2);
    }
    if (s.paused && !dead) { c.fillStyle = "#f3efe6"; c.fillRect(x + r * 0.55, y - r - 2, 2, 6); c.fillRect(x + r * 0.55 + 3.5, y - r - 2, 2, 6); }
    if (dead) { c.strokeStyle = "#ef7c68"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x - r * 0.6, y - r * 0.6); c.lineTo(x + r * 0.6, y + r * 0.6); c.stroke(); }
    if (ui.selectedCell === s.cell || (!onTown && (cs >= 34 || (rv && (owner === PLAYER || cs >= 22))))) {
      const lbl = `${s.name}${s.level > 1 ? ` · ${s.level}` : ""}`;
      labels.push({ lbl, x, y, id: s.id, sel: ui.selectedCell === s.cell, dead });
    }
    if (ui.selectedCell === s.cell) { c.strokeStyle = "#dcb85e"; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 5, 0, Math.PI * 2); c.stroke(); }
  }
  // names last, so none sits on another site's icon or name
  const fs = clamp(cs * 0.45, 10.5, 13);
  const taken = view.siteBoxes.map(b => ({ id: b.id, x0: b.x - b.r - 1, y0: b.y - b.r - 1, x1: b.x + b.r + 1, y1: b.y + b.r + 1 }));
  c.font = `600 ${fs}px "IBM Plex Sans", system-ui, sans-serif`;
  labels.sort((a, b) => b.sel - a.sel);
  for (const L of labels) {
    const box = { id: -1, x0: L.x + r + 3, y0: L.y - fs / 2 - 1, x1: L.x + r + 7 + c.measureText(L.lbl).width, y1: L.y + fs / 2 + 1 };
    if (!L.sel && taken.some(b => b.id !== L.id && b.x0 < box.x1 && b.x1 > box.x0 && b.y0 < box.y1 && b.y1 > box.y0)) continue;
    taken.push(box);
    drawPlaceLabel(c, L.lbl, L.x + r + 5, L.y - 1, fs, 600, L.dead ? 0.6 : 0.95);
    c.font = `600 ${fs}px "IBM Plex Sans", system-ui, sans-serif`;
  }
}
/* Deposits that sit side by side form one field: worked out once per season, drawn as a shaded patch
   with a single label, like a geological map. Single cells get a small dot when zoomed in, so they can be clicked. */
const DEP_CLUSTERS = { key: "", list: [] };
function depositClusters() {
  const key = game ? `${game.turn}|${game.sites.length}|${game.projects.length}` : `f|${world.seed}|${ui.drawCells ? ui.drawCells.length + ":" + ui.drawCells[0] : 0}`;
  if (DEP_CLUSTERS.key === key) return DEP_CLUSTERS;
  const at = new Int32Array(N_CELLS).fill(-1), list = [];
  const live = i => { const t = knownDepositAt(i); return t && (!game || game.depLeft[i] > 0.01) ? t : 0; };
  for (let i = 0; i < N_CELLS; i++) {
    if (at[i] >= 0) continue;
    const t = live(i);
    if (!t) continue;
    const cl = { type: t, cells: [], id: list.length };
    const stack = [i]; at[i] = cl.id;
    while (stack.length) {
      const c = stack.pop(); cl.cells.push(c);
      const x = cellX(c), y = cellY(c);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const j = idx(nx, ny);
        if (at[j] >= 0 || live(j) !== t || (game ? game.owner[j] !== game.owner[i] : !!(ui.drawCellSet && ui.drawCellSet.has(j)) !== !!(ui.drawCellSet && ui.drawCellSet.has(i)))) continue;
        at[j] = cl.id; stack.push(j);
      }
    }
    let mx = 0, my = 0;
    for (const c of cl.cells) { mx += cellX(c); my += cellY(c); }
    mx /= cl.cells.length; my /= cl.cells.length;
    cl.anchor = cl.cells.reduce((b, c) => Math.hypot(cellX(c) - mx, cellY(c) - my) < Math.hypot(cellX(b) - mx, cellY(b) - my) ? c : b);
    cl.mine = game ? cl.cells.some(c => game.owner[c] === PLAYER) : !!(ui.drawCellSet && cl.cells.some(c => ui.drawCellSet.has(c)));
    list.push(cl);
  }
  DEP_CLUSTERS.key = key; DEP_CLUSTERS.list = list;
  return DEP_CLUSTERS;
}
function clusterReserveText(cl) {
  let lo = 0, hi = 0, exact = true;
  for (const c of cl.cells) {
    const left = game ? game.depLeft[c] : world.depTotal[c];
    if (game && knowsSize(world, game, PLAYER, c)) { lo += left; hi += left; continue; }
    exact = false;
    const est = depositEstimate(world, game, c), used = game ? Math.max(0, world.depTotal[c] - left) : 0;
    lo += Math.max(0, est.low - used); hi += Math.max(0, est.high - used);
  }
  return exact ? fmtAmount(cl.type, lo) : `about ${fmtAmount(cl.type, lo).replace(/ .*/, "")}–${fmtAmount(cl.type, hi)}`;
}
function drawKnownDeposits(c, cs) {
  if (!world.dep) return;
  const rv = ui.resView || !game;
  if (!game && cs < 9) return;
  const near = cs >= 30;
  if (!rv && !near) return;
  const C = depositClusters();
  const inView = (x, y, m) => !(x < -m - view.ox || y < -m - view.oy || x > view.vw - view.ox + m || y > view.vh - view.oy + m);
  if (rv) {
    // the fields, painted on their own layer so overlapping circles merge into one clean shape with one outline
    const dpr = view.dpr;
    const off = view.depCanvas || (view.depCanvas = document.createElement("canvas"));
    if (off.width !== canvas.width || off.height !== canvas.height) { off.width = canvas.width; off.height = canvas.height; }
    const o = off.getContext("2d");
    o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, off.width, off.height);
    o.setTransform(dpr, 0, 0, dpr, view.ox * dpr, view.oy * dpr);
    const R = cs * 0.74, R2 = R - clamp(cs * 0.05, 1.2, 2.6);
    for (const t of [1, 2, 3, 4]) {
      const outer = new Path2D(), inner = new Path2D();
      let any = false;
      for (const cl of C.list) {
        if (cl.type !== t) continue;
        for (const i of cl.cells) {
          const [x, y] = cellCenter(i, cs);
          if (!inView(x, y, R + 4)) continue;
          any = true;
          outer.moveTo(x + R, y); outer.arc(x, y, R, 0, Math.PI * 2);
          inner.moveTo(x + R2, y); inner.arc(x, y, R2, 0, Math.PI * 2);
        }
      }
      if (!any) continue;
      o.globalCompositeOperation = "source-over"; o.globalAlpha = 1; o.fillStyle = RES_COLORS[t]; o.fill(outer);
      o.globalCompositeOperation = "destination-out"; o.fill(inner);
      o.globalCompositeOperation = "source-over"; o.globalAlpha = 0.3; o.fill(inner);
      o.globalAlpha = 1;
    }
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 0.92; c.drawImage(off, 0, 0); c.restore();
  }
  if (near) {
    // each known deposit: a small drawing of what lies there (ore, coal, oil and gas, gold) in its colour
    const sz = clamp(cs * 0.21, 9, 15);
    c.globalAlpha = 0.9;
    for (const cl of C.list) for (const i of cl.cells) {
      if (game && siteAt(i)) continue;
      const [x, y] = cellCenter(i, cs);
      if (!inView(x, y, 20)) continue;
      giDraw(c, DEP_GLYPHS[cl.type], x, y, sz, RES_COLORS[cl.type], "rgba(12,10,8,0.85)", 2.2);
      if (game && world.hid[i]) { c.strokeStyle = RES_COLORS[cl.type]; c.lineWidth = 1.3; c.beginPath(); c.arc(x, y, sz * 0.75, 0, Math.PI * 2); c.stroke(); }
    }
    c.globalAlpha = 1;
  }
  const sel = ui.selectedCell;
  if (sel >= 0 && knownDepositAt(sel) && !(game && siteAt(sel))) {
    const [x, y] = cellCenter(sel, cs);
    c.strokeStyle = "#dcb85e"; c.lineWidth = 2; c.beginPath(); c.arc(x, y, clamp(cs * 0.3, 6, 16), 0, Math.PI * 2); c.stroke();
  }
  if (rv && cs >= 10) {
    // one label per field, biggest and your own first, never on top of each other
    // keep clear of town names and site icons (positions from the last frame are close enough)
    const placed = (view.siteBoxes || []).map(b => ({ x0: b.x - b.r - 2, y0: b.y - b.r - 2, x1: b.x + b.r + 2, y1: b.y + b.r + 2 }));
    if (game) for (const t of game.cities) { const [x, y] = cellCenter(t.cell, cs); placed.push({ x0: x - 8, y0: y - 9, x1: x + (t.capital ? 90 : 64), y1: y + 9 }); }
    const fs = clamp(cs * 0.42, 10, 12.5);
    const order = C.list.filter(cl => cl.mine || cs >= 22).sort((a, b) => (b.mine - a.mine) || (b.cells.length - a.cells.length));
    for (const cl of order) {
      const [x, y] = cellCenter(cl.anchor, cs);
      if (!inView(x, y, 0)) continue;
      const text = `${RES[cl.type].label} · ${clusterReserveText(cl)}${cl.cells.length > 1 ? ` · ${cl.cells.length} deposits` : ""}`;
      c.font = `600 ${fs}px "IBM Plex Sans", system-ui, sans-serif`;
      const w = c.measureText(text).width + 6, h = fs + 5;
      const box = { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
      if (placed.some(b => b.x0 < box.x1 && b.x1 > box.x0 && b.y0 < box.y1 && b.y1 > box.y0)) continue;
      placed.push(box);
      drawPlaceLabel(c, text, x - w / 2 + 3, y, fs, 600, cl.mine ? 0.95 : 0.75);
    }
  }
}
function drawResourceViewShade(c) {
  if (!ui.resView) return;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = "rgba(6,10,9,0.38)";
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.restore();
}

/* ---------- Panels ---------- */
function paceSegHtml(s) {
  const def = SITE_KINDS[s.kind];
  const cur = s.pace || "normal";
  const notes = def.res
    ? { slow: "Fewer workers, slower digging: the deposit lasts longer.", normal: "A steady pace.", fast: "More workers and long shifts: more output now, the deposit runs out sooner." }
    : def.renew === "forest"
      ? { slow: "Only cut what grows back each year. The forest lasts forever.", normal: "Cut a little more than grows back.", fast: "Clear-cut: lots of timber now. Cleared land turns into open farmland." }
      : { slow: "Only catch what the fish replace each year.", normal: "Fish freely; stocks fall slowly if the harbor is big.", fast: "Catch everything you can. Stocks may collapse." };
  return `<div class="seg three" role="group" aria-label="Pace">${PACE_KEYS.map((k, i) => `<button type="button" class="${cur === k ? "on" : ""}" data-action="site-pace" data-id="${s.id}" data-v="${k}" aria-pressed="${cur === k}" ${k === "fast" && def.res && modFlag(game.nations[PLAYER], "noFast") ? 'disabled title="Banned by the mine safety law"' : ""}><span>${def.paces[i]}</span><small>${k === "slow" ? `${Math.round(PACES[k].out * 100)}% output` : k === "fast" ? `${Math.round(PACES[k].out * 100)}% output` : "100%"}</small></button>`).join("")}</div>
    <p class="muted small">${notes[cur]}</p>`;
}
function reserveBlockHtml(s, x) {
  const def = SITE_KINDS[s.kind];
  if (def.res) {
    const total = world.depTotal[s.cell], left = game.depLeft[s.cell];
    const frac = left / Math.max(0.001, total);
    const yl = yearsLeft(s, x);
    return `<div class="block">
      <span class="eyebrow">Reserves</span>
      <div class="reserve"><span style="width:${clamp(frac * 100, 0, 100)}%;background:${frac > 0.5 ? "var(--good)" : frac > 0.25 ? "var(--warn)" : "var(--bad)"}"></span></div>
      <div class="row"><span>${fmtAmount(def.res, left)} left</span><span class="num">${pct(frac)} of the ${fmtAmount(def.res, total).replace(/ .*/, "")} found</span></div>
      ${yl !== null ? `<div class="row"><span>At this pace it lasts</span><span class="num">${yl > 99 ? "a century or more" : `about ${Math.max(1, Math.round(yl))} year${Math.round(yl) === 1 ? "" : "s"}`}</span></div>` : ""}
      <div class="row"><span>Quality</span><span>${escapeHtml(RES[def.res].gradeText(world.depGrade[s.cell]))}</span></div>
      ${x && x.depletion !== undefined && x.depletion < 0.99 ? `<p class="notice">The easy ${def.res === 3 ? "oil has been pumped" : "ore has been dug"}: each worker now gets ${pct(x.depletion)} of what they did at first.</p>` : ""}
      <p class="muted small">Mined so far: ${fmtAmount(def.res, s.extracted || 0)} since ${seasonLabel(s.opened)}.</p>
    </div>`;
  }
  if (def.renew === "forest") {
    const st = forestStock(world, game, s.cell);
    const grow = regrowthOf(world, game, s) * 4;
    return `<div class="block">
      <span class="eyebrow">The forest</span>
      <div class="reserve"><span style="width:${clamp(st.share * 100, 0, 100)}%;background:${st.share > 0.5 ? "var(--good)" : st.share > 0.25 ? "var(--warn)" : "var(--bad)"}"></span></div>
      <div class="row"><span>Standing timber</span><span class="num">${(st.held * 5).toFixed(0)}M m³ · ${pct(st.share)}</span></div>
      <div class="row"><span>Grows back</span><span class="num">${(grow * 5).toFixed(1)}M m³ a year</span></div>
      <div class="row"><span>Cut</span><span class="num">${((x && x.outUnits) || 0) * 5 > 0 ? `${(((x && x.outUnits) || 0) * 5).toFixed(1)}M m³ a year` : "nothing"}</span></div>
      <p class="muted small">${(x && x.outUnits || 0) > grow * 1.05 ? "You cut more than grows back. The forest is shrinking; stretches cut bare turn into open land." : "The forest can keep up with this."}</p>
    </div>`;
  }
  const st = fishStock(world, game, s.cell);
  const grow = regrowthOf(world, game, s);
  return `<div class="block">
    <span class="eyebrow">Fishing grounds</span>
    <div class="reserve"><span style="width:${clamp(st.share * 100, 0, 100)}%;background:${st.share > 0.5 ? "var(--good)" : st.share > 0.25 ? "var(--warn)" : "var(--bad)"}"></span></div>
    <div class="row"><span>Fish in these waters</span><span class="num">${pct(st.share)} of a healthy stock</span></div>
    <div class="row"><span>The sea replaces</span><span class="num">enough for ${fmtPop(grow)} people a year</span></div>
    <p class="muted small">${(x && x.outUnits || 0) > grow * 1.05 ? "You catch more than the fish replace. Stocks are falling." : "Stocks can keep up with this catch."}</p>
  </div>`;
}
function siteDetailHtml(s) {
  const def = SITE_KINDS[s.kind], ind = INDUSTRIES[s.kind];
  const owner = game.owner[s.cell];
  const mine = owner === PLAYER;
  const x = siteEcon(s);
  const occupied = game.occ[s.cell] >= 0;
  const oecon = owner >= 0 ? economies()[owner] : null;
  const unsold = x && x.outUnits > 0 && def.good !== "food" && oecon && oecon.goods.util ? 1 - (oecon.goods.util[def.good] ?? 1) : 0;
  const statusText = s.exhausted ? ["bad", "Worked out"] : occupied ? ["bad", `Occupied by the ${nameOf(game, game.occ[s.cell])}`] : s.paused ? ["warn", "Paused"]
    : !x ? ["bad", "Not working"] : x.status === "blockaded" ? ["bad", "Blockaded: enemy warships keep the boats in harbor"] : x.status === "no road" ? ["bad", "No road to a town"] : (x.fill ?? 1) < 0.9 ? ["warn", `Short of ${lackWord(x)}`] : (x.isoFixed ?? 1) < 1 ? ["warn", "Its road doesn't reach the capital's network"] : unsold > 0.1 ? ["warn", `Working, but ${pct(unsold)} of it can't be sold`] : ["good", "Working"];
  const near = x && x.townId ? game.cities.find(c => c.id === x.townId) : nearestCity(game, s.cell, owner);
  const need = x ? s.level * ind.workers * (x.wmult || 1) : 0;
  const price = def.good !== "food" ? priceOf(game, def.good) : null;
  const hist = (s.hist || []).filter(v => v !== undefined);
  const spark = hist.length > 2 ? sparkline(hist, SPARK_COLORS[s.kind], 120, 28) : "";
  const maxL = siteMaxLevel(world, s);
  const exp = mine && !s.exhausted ? quoteSiteExpand(world, game, PLAYER, s) : null;
  const controls = mine && !s.exhausted ? `<div class="block">
      <span class="eyebrow">How hard to work it</span>
      ${paceSegHtml(s)}
      <div class="actions">
        ${s.pausedUntil !== undefined && s.pausedUntil > game.turn ? `<button class="btn" type="button" disabled>Stopped until ${seasonLabel(s.pausedUntil)}</button>` : `<button class="btn" type="button" data-action="site-pause" data-id="${s.id}">${s.paused ? "Resume work" : "Pause work"}</button>`}
        ${exp && exp.ok ? `<button class="btn primary" type="button" data-action="site-expand" data-id="${s.id}">Expand to level ${s.level + 1} · ${fmtMoney(exp.cost)}</button>` : ""}
      </div>
      ${exp && !exp.ok ? `<p class="muted small">${escapeHtml(exp.reason)}</p>` : ""}
      ${s.paused ? `<p class="muted small">Paused: the workers have gone back to town and nothing is dug. Useful when prices are low.</p>` : ""}
    </div>` : mine && s.exhausted ? `<div class="actions"><button class="btn" type="button" data-action="site-remove" data-id="${s.id}">Clear the old workings</button></div>` : "";
  const roadFix = mine && x && x.status === "no road" ? (() => { const q = bestAccessRoad(world, game, PLAYER, s.cell, economies()[PLAYER]); return q.ok ? `<div class="actions"><button class="btn primary" type="button" data-action="site-road" data-cell="${s.cell}">Build a road here from ${escapeHtml(q.from.name)} · ${fmtMoney(q.cost)}</button></div>` : `<p class="muted small">${escapeHtml(q.reason)}</p>`; })() : "";
  return `<div class="block">
      <span class="eyebrow" style="color:${owner >= 0 ? NATION_COLORS[owner] : "var(--muted)"}">${owner >= 0 ? escapeHtml(game.nations[owner].name) : "Wild land"} · ${def.label}</span>
      <h2 class="side-title">${escapeHtml(s.name)}</h2>
      <span class="small tone-${statusText[0]}">${escapeHtml(statusText[1])}</span>
    </div>
    <div class="stats-grid">
      <div class="stat-cell"><span class="k">Output</span><span class="v small-v">${x && x.outUnits > 0 ? escapeHtml(fmtSiteOutput(s.kind, x.outUnits)) : "nothing"}</span>${spark}</div>
      <div class="stat-cell"><span class="k">Worth</span><span class="v">${fmtMoney(x ? x.va || 0 : 0)}/yr</span><span class="muted small">${x && x.haulCost > 0.05 ? `after ${fmtMoney(x.haulCost)} hauling` : "after hauling"}</span></div>
      <div class="stat-cell"><span class="k">Workers</span><span class="v">${fmtWorkers(x ? x.workers || 0 : 0)}</span><span class="muted small">${need ? `of ${fmtWorkers(need)} needed` : ""}${near ? ` · from ${escapeHtml(near.name)}` : ""}</span></div>
      <div class="stat-cell"><span class="k">Size</span><span class="v">Level ${s.level}</span><span class="muted small">largest possible: ${maxL}</span></div>
    </div>
    ${unsold > 0.1 ? `<p class="notice">Your nation already has all the ${GOODS[def.good].label.toLowerCase()} it can use, and ${oecon.access > 0 ? "your ports and trade partners can't take more" : "it has no port or trade partner to sell the rest abroad"}. Unsold output earns nothing. ${oecon.access > 0 ? "Build factories that use it, or" : "Build a port, sign a trade agreement, or"} set a careful pace to save the deposit for later.</p>` : ""}
    ${reserveBlockHtml(s, x)}
    ${smelterBlockHtml(s, x, mine)}
    ${x && x.dist !== null && x.dist !== undefined ? `<p class="muted small">Hauled ${x.dist} road ${x.dist === 1 ? "stretch" : "stretches"} to ${escapeHtml(near ? near.name : "town")}.${price !== null ? ` World ${PRICE_LABELS[def.good].toLowerCase()} price: ${price.toFixed(2)}× normal.` : ""}</p>` : ""}
    ${roadFix}
    ${controls}`;
}
function depositDetailHtml(i, t) {
  const owner = game.owner[i];
  const mine = owner === PLAYER;
  const kind = RES[t].site, def = SITE_KINDS[kind], ind = INDUSTRIES[kind];
  const near = nearestCity(game, i, owner >= 0 ? owner : undefined);
  const knowSize = knowsSize(world, game, PLAYER, i);
  const perLevel = ind.out[def.good] * (knowSize ? world.depGrade[i] : 1);
  const econ = economies()[PLAYER];
  let actions = "";
  if (mine) {
    const reach = econ.reach && econ.reach.get(i);
    const q = quoteSite(world, game, PLAYER, i, kind, econ);
    if (q.ok) actions += `<button class="btn primary" type="button" data-action="site-build" data-cell="${i}" data-kind="${kind}">Open ${articleFor(def.label)} ${def.label.toLowerCase()} · ${fmtMoney(q.cost)}</button>`;
    else if (!reach) {
      const qr = bestAccessRoad(world, game, PLAYER, i, econ);
      actions += qr.ok ? `<button class="btn primary" type="button" data-action="site-road" data-cell="${i}">Build a road here from ${escapeHtml(qr.from.name)} · ${fmtMoney(qr.cost)}</button>` : `<p class="muted small">${escapeHtml(qr.reason)}</p>`;
    } else actions += `<p class="muted small">${escapeHtml(q.reason)}</p>`;
    if (!knowSize) { const qs = quoteSurvey(world, game, PLAYER, i); if (qs.ok) actions += `<button class="btn" type="button" data-action="survey" data-cell="${i}">Survey this area · ${fmtMoney(qs.cost)}</button>`; }
  }
  return `<div class="block">
      <span class="eyebrow" style="color:${owner >= 0 ? NATION_COLORS[owner] : "var(--muted)"}">${owner >= 0 ? escapeHtml(game.nations[owner].name) : "Wild land"} · deposit${world.hid[i] ? " · found by survey" : ""}</span>
      <h2 class="side-title">${RES[t].label}${near ? ` near ${escapeHtml(near.name)}` : ""}</h2>
    </div>
    <div class="block">
      <span class="eyebrow">What is down there</span>
      <div class="row"><span>${knowSize ? "Reserves" : "Estimated reserves"}</span><span class="num">${escapeHtml(reserveText(i, t))}</span></div>
      <div class="row"><span>Quality</span><span>${knowSize ? escapeHtml(RES[t].gradeText(world.depGrade[i])) : "unknown until surveyed"}</span></div>
      <div class="row"><span>Ground</span><span>${TERRAIN[world.terrain[i]].name.toLowerCase()}${(DIFFICULTY[world.terrain[i]] || 1) > 1.2 ? " (costly to dig)" : ""}</span></div>
      ${!knowSize ? `<p class="muted small">A surface guess. A survey measures it exactly and may find more deposits nearby.</p>` : ""}
    </div>
    <div class="block">
      <span class="eyebrow">${articleFor(def.label) === "an" ? "An" : "A"} ${def.label.toLowerCase()} here</span>
      <p class="small">${escapeHtml(ind.does)} Each level employs ${fmtWorkers(ind.workers * (0.85 + 0.15 * (DIFFICULTY[world.terrain[i]] || 1)))} workers and produces about ${escapeHtml(fmtSiteOutput(kind, perLevel))}. It can grow to level ${clamp(1 + Math.floor(world.depTotal[i] / RES[t].perLevel), 1, def.maxLevel)}.</p>
      ${mine ? "" : owner >= 0 ? `<p class="muted small">It belongs to the ${escapeHtml(game.nations[owner].name)}.</p>` : `<p class="muted small">Wild land. Found a town nearby to claim it.</p>`}
    </div>
    ${actions ? `<div class="actions">${actions}</div>` : ""}`;
}
function landResourceHtml(i) {
  // forest or coast without a site: offer a camp or a harbor; any own land: offer a survey
  if (!game || game.owner[i] !== PLAYER) return "";
  const econ = economies()[PLAYER];
  const parts = [];
  if (world.terrain[i] === T.FOREST) {
    const st = forestStock(world, game, i);
    const q = quoteSite(world, game, PLAYER, i, "logging", econ);
    parts.push(`<div class="row"><span>Standing timber around here</span><span class="num">${(st.held * 5).toFixed(0)}M m³ · ${pct(st.share)}</span></div>`);
    if (q.ok) parts.push(`<div class="actions"><button class="btn" type="button" data-action="site-build" data-cell="${i}" data-kind="logging">Open a logging camp · ${fmtMoney(q.cost)}</button></div>`);
    else if (/No road/.test(q.reason)) { const qr = bestAccessRoad(world, game, PLAYER, i, econ); if (qr.ok) parts.push(`<div class="actions"><button class="btn" type="button" data-action="site-road" data-cell="${i}">Build a road here from ${escapeHtml(qr.from.name)} · ${fmtMoney(qr.cost)}</button></div>`); }
    else parts.push(`<p class="muted small">${escapeHtml(q.reason)}</p>`);
  }
  if (world.coastal[i] && fishStock(world, game, i).cap >= 3) {
    const st = fishStock(world, game, i);
    const q = quoteSite(world, game, PLAYER, i, "fishing", econ);
    parts.push(`<div class="row"><span>Fish in nearby waters</span><span class="num">${pct(st.share)} of a healthy stock</span></div>`);
    if (q.ok) parts.push(`<div class="actions"><button class="btn" type="button" data-action="site-build" data-cell="${i}" data-kind="fishing">Open a fishing harbor · ${fmtMoney(q.cost)}</button></div>`);
    else if (/No road/.test(q.reason)) { const qr = bestAccessRoad(world, game, PLAYER, i, econ); if (qr.ok) parts.push(`<div class="actions"><button class="btn" type="button" data-action="site-road" data-cell="${i}">Build a road here from ${escapeHtml(qr.from.name)} · ${fmtMoney(qr.cost)}</button></div>`); }
    else parts.push(`<p class="muted small">${escapeHtml(q.reason)}</p>`);
  }
  const qs = quoteSurvey(world, game, PLAYER, i);
  parts.push(qs.ok ? `<div class="actions"><button class="btn" type="button" data-action="survey" data-cell="${i}">Survey for hidden deposits · ${fmtMoney(qs.cost)}</button></div>` : `<p class="muted small">${escapeHtml(qs.reason)}</p>`);
  return `<div class="block"><span class="eyebrow">Resources here</span>${parts.join("")}</div>`;
}

/* The Economy panel: every site at a glance, and the world prices that decide what they earn. */
function resourcesPanelHtml(econ) {
  const mine = (econ.sites || []).slice().sort((a, b) => (b.va || 0) - (a.va || 0));
  const unworked = (() => { let n = 0; for (let i = 0; i < N_CELLS; i++) if (game.owner[i] === PLAYER && knownDepositAt(i) && !siteAt(i) && game.depLeft[i] > 0.5) n++; return n; })();
  const rows = mine.map(x => {
    const s = x.site, def = SITE_KINDS[s.kind];
    let frac = def.res ? game.depLeft[s.cell] / Math.max(0.001, world.depTotal[s.cell]) : x.stock ?? null;
    const yl = yearsLeft(s, x);
    const uns = x.outUnits > 0 && def.good !== "food" && econ.goods.util ? 1 - (econ.goods.util[def.good] ?? 1) : 0;
    const st = s.exhausted ? `<span class="tone-bad">worked out</span>` : s.paused ? `<span class="tone-warn">paused</span>` : x.status === "no road" ? `<span class="tone-bad">no road</span>` : (x.fill ?? 1) < 0.9 ? `<span class="tone-warn">short of ${lackWord(x)}</span>` : uns > 0.1 ? `<span class="tone-warn">${pct(uns)} unsold</span>` : yl !== null ? `${Math.round(yl)} yrs left` : frac !== null ? `${pct(frac)} stock` : "";
    return `<li><button type="button" class="site-row" data-action="site-focus" data-id="${s.id}"><i class="sw" style="background:${SITE_COLORS[s.kind]}"></i><span class="nm">${escapeHtml(s.name)}${s.level > 1 ? ` · ${s.level}` : ""}${s.smelter ? " · smelter" : ""}</span><span class="num">${fmtMoney(x.va || 0)}</span><span class="small muted">${st}</span>${frac !== null ? `<span class="mini-res"><span style="width:${clamp(frac * 100, 0, 100)}%;background:${frac > 0.5 ? "var(--good)" : frac > 0.25 ? "var(--warn)" : "var(--bad)"}"></span></span>` : "<span></span>"}</button></li>`;
  }).join("");
  const hist = game.priceHist || [];
  const prices = TRADED.map(k => {
    const p = priceOf(game, k), ago = hist.length > 4 ? hist[hist.length - 5][k] : p;
    const ch = ago ? p / ago - 1 : 0;
    const spark = hist.length > 2 ? sparkline(hist.slice(-40).map(h => h[k]), PRICE_COLORS[k], 90, 22) : "";
    return `<li><span>${PRICE_LABELS[k]}</span><span class="num">${p.toFixed(2)}×</span><span class="small tone-${toneOf(ch, 0.01)}">${ch > 0.01 ? "▲" : ch < -0.01 ? "▼" : "•"} ${signedPct(ch, 0)}</span>${spark}</li>`;
  }).join("");
  return `<div class="block">
      <span class="eyebrow">Mines, fields, camps and harbors · <button class="linkbtn" type="button" data-action="res-view">${ui.resView ? "hide on map" : "show on map (E)"}</button></span>
      ${rows ? `<ul class="site-list">${rows}</ul>` : `<p class="muted small">You work no deposits, forests or fishing grounds yet.</p>`}
      <p class="muted small">${unworked ? `${unworked} known deposit${unworked > 1 ? "s" : ""} in your land ${unworked > 1 ? "are" : "is"} not worked yet. ` : ""}Click a deposit on the map to see how much is there. Sites need a road to a town; survey your land to find hidden deposits.</p>
    </div>
    <div class="block">
      <span class="eyebrow">World prices · 1.00 is normal</span>
      <ul class="price-list">${prices}</ul>
      <p class="muted small">Prices rise when the world wants more than it digs, cuts and pumps, and fall when there is too much. They decide what your sites earn and what imports cost.</p>
    </div>`;
}

/* The resource lines a town shows: what is worked and found around it. */
function townSitesHtml(city) {
  const owner = city.owner;
  const near = game.sites.filter(s => g_ownerNearest(s.cell, owner) === city.id);
  const deps = [];
  for (let i = 0; i < N_CELLS; i++) if (game.owner[i] === owner && knownDepositAt(i) && !siteAt(i) && game.depLeft[i] > 0.5 && g_ownerNearest(i, owner) === city.id) deps.push(i);
  if (!near.length && !deps.length) return "";
  const rows = near.map(s => `<li><button class="linkbtn" type="button" data-action="site-focus" data-id="${s.id}">${escapeHtml(s.name)}</button><span class="muted small">${s.exhausted ? "worked out" : s.paused ? "paused" : `level ${s.level}`}</span></li>`)
    .concat(deps.slice(0, 6).map(i => `<li><button class="linkbtn" type="button" data-action="cell-focus" data-cell="${i}">${RES[depositType(world, i)].label} deposit</button><span class="muted small">${escapeHtml(reserveText(i, depositType(world, i)))} · not worked</span></li>`));
  return `<div class="block"><span class="eyebrow">Around ${escapeHtml(city.name)}</span><ul class="factors town-sites">${rows.join("")}</ul></div>`;
}
function g_ownerNearest(cell, owner) {
  const c = nearestCity(game, cell, owner);
  return c ? c.id : null;
}

/* ---------- Actions ---------- */
const RES_ACTIONS = {
  "site-build": el => { const q = quoteSite(world, game, PLAYER, Number(el.dataset.cell), el.dataset.kind); if (q.ok) ui.pending = q; else flashHint(q.reason); },
  "site-expand": el => { const s = game.sites.find(x => x.id === Number(el.dataset.id)); const q = s && quoteSiteExpand(world, game, PLAYER, s); if (q && q.ok) ui.pending = q; else if (q) flashHint(q.reason); },
  "site-road": el => { const q = bestAccessRoad(world, game, PLAYER, Number(el.dataset.cell), economies()[PLAYER]); if (q.ok) ui.pending = q; else flashHint(q.reason); },
  survey: el => { const q = quoteSurvey(world, game, PLAYER, Number(el.dataset.cell)); if (q.ok) ui.pending = q; else flashHint(q.reason); },
  "site-pace": el => { const s = game.sites.find(x => x.id === Number(el.dataset.id)); if (s && el.dataset.v === "fast" && SITE_KINDS[s.kind].res && modFlag(game.nations[PLAYER], "noFast")) { flashHint("The mine safety law bans intensive mining for now."); return; } if (s && game.owner[s.cell] === PLAYER) { s.pace = el.dataset.v; bumpMap(); } },
  "site-pause": el => { const s = game.sites.find(x => x.id === Number(el.dataset.id)); if (s && s.pausedUntil !== undefined && s.pausedUntil > game.turn) { flashHint(`Work there is stopped until ${seasonLabel(s.pausedUntil)}.`); return; } if (s && game.owner[s.cell] === PLAYER) { s.paused = !s.paused; bumpMap(); } },
  "site-remove": el => { const id = Number(el.dataset.id); game.sites = game.sites.filter(x => !(x.id === id && x.exhausted && game.owner[x.cell] === PLAYER)); ui.selectedCell = -1; bumpMap(); },
  "site-focus": el => { const s = game.sites.find(x => x.id === Number(el.dataset.id)); if (s) { ui.selectedCity = null; ui.selectedCell = s.cell; ui.tab = "selected"; centerOnCell(s.cell, Math.max(view.zoom, 2.2)); } },
  "cell-focus": el => { const c = Number(el.dataset.cell); ui.selectedCity = null; ui.selectedCell = c; ui.tab = "selected"; centerOnCell(c, Math.max(view.zoom, 2.2)); },
  "res-view": () => { ui.resView = !ui.resView; },
};
Object.assign(ACTIONS, RES_ACTIONS);


