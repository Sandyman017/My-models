/* =====================================================================
   16e. The navy in the panels and on the map: fleets, harbors and shipyards, convoys, the sea zones
   ===================================================================== */
const SHIP_ICON = { freighter: "delapouite/cargo-ship", destroyer: "cathelineau/cruiser", cruiser: "cathelineau/battleship" };
function shipIc(type) { return `<span class="ship-ic" title="${SHIP_TYPES[type].label}">${giSvg(SHIP_ICON[type])}</span>`; }
function fmtMoneyFine(b) {
  const a = Math.abs(b);
  if (a > 0 && a < 1) return `${b < 0 ? "−" : ""}$${a < 0.01 ? (a * 1000).toFixed(1) : Math.round(a * 1000)}M`;
  return fmtMoney(b);
}
function nOf(n, one, many) { return `${fmtCount(n)} ${n === 1 ? one : many || `${one}s`}`; }
function shipsText(c) {
  const parts = [];
  if (c.cruiser) parts.push(nOf(c.cruiser, "cruiser"));
  if (c.destroyer) parts.push(nOf(c.destroyer, "destroyer"));
  if (c.freighter) parts.push(nOf(c.freighter, "freighter"));
  return parts.join(", ") || "no ships";
}
function cityById(id) { return game.cities.find(c => c.id === id) || null; }

/* ---------- Fleets you have selected ---------- */
function selectedFleets() {
  if (!game || !game.sea) { ui.fleetSel = []; return []; }
  const ids = ui.fleetSel || [];
  const out = ids.map(id => game.sea.fleets.find(f => f.id === id && f.owner === PLAYER && f.ships.length)).filter(Boolean);
  if (out.length !== ids.length) ui.fleetSel = out.map(f => f.id);
  return out;
}
function fleetWhere(f) {
  if (f.port !== null && f.port !== undefined) { const c = cityById(f.port); return c ? `in port at ${c.name}` : "in port"; }
  return f.zone >= 0 ? `in the ${zoneName(world, f.zone)}` : "at sea";
}
function fleetOrderCell(f) {
  if (f.destPort) { const c = cityById(f.destPort); return c ? portSeaCell(world, c.cell) : -1; }
  return f.dest !== null && f.dest !== undefined ? f.dest : -1;
}
function fleetStatus(f) {
  if (f.destPort) { const c = cityById(f.destPort); return { text: `Ordered back to port at ${c ? c.name : "home"} · sails when the season ends`, tone: "neutral" }; }
  if (f.dest !== null && f.dest !== undefined) return { text: `Ordered to the ${zoneName(world, zoneOf(world, f.dest))} to ${(f.nextMission || "patrol") === "raid" ? "raid enemy shipping" : "patrol"} · sails when the season ends`, tone: "neutral" };
  const hp = f.ships.reduce((s, x) => s + x.hp, 0) / Math.max(1, f.ships.length);
  if (f.port !== null && f.port !== undefined) return { text: `${fleetWhere(f).replace(/^./, ch => ch.toUpperCase())}${hp < 0.98 ? " · repairing" : ""}`, tone: hp < 0.6 ? "warn" : "neutral" };
  if (f.mission === "raid") return { text: `Raiding enemy merchant ships ${fleetWhere(f)}`, tone: "neutral" };
  return { text: `Patrolling ${fleetWhere(f).replace(/^in /, "")}`, tone: "neutral" };
}

/* ---------- Orders: right-click the sea to sail there, or one of your ports to dock ---------- */
function fleetTargetAt(cell) {
  if (cell < 0) return null;
  const fs = selectedFleets();
  if (!fs.length) return null;
  const near = cityNear(cell);
  if (near && fleetCanDock(world, game, fs[0], near) && (!isOcean(world, cell) || dist(near.cell, cell) <= 1.5)) return { port: near, cell: portSeaCell(world, near.cell) };
  if (isOcean(world, cell)) return { cell };
  return null;
}
function hoverFleetRoute(cell) {
  const fs = selectedFleets();
  if (!fs.length || cell < 0 || ui.tool !== "select") return null;
  const t = fleetTargetAt(cell);
  if (!t) return { cells: null, bad: true, text: world.terrain[cell] === T.SEA ? "A lake: ships from the open sea can't reach it" : "Fleets sail on the open sea: right-click the sea, or one of your ports to dock" };
  const f = fs[0];
  if (t.port && f.port === t.port.id) return { cells: null, text: `Right-click to keep the fleet in port at ${t.port.name}` };
  const p = seaPath(world, f.cell, t.cell);
  if (!p) return { cells: null, bad: true, text: "No way by sea from here" };
  const days = Math.max(1, Math.round(p.km / (Math.min(...f.ships.map(s => SHIP_TYPES[s.type].knots)) * 1.852 * 24)));
  const zp = zonePowers(game, zoneOf(world, t.cell), PLAYER);
  const danger = zp.foe > 0 ? ` · enemy warships there (strength ${Math.round(zp.foe * 10)} against your ${Math.round(fs.reduce((s, x) => s + fleetPower(x), 0) * 10)})` : "";
  return {
    cells: p.cells, bad: false, attack: zp.foe > 0,
    text: t.port ? `Right-click to sail to ${t.port.name} and stay in port · ${fmtCount(p.km)} km, ${days} day${days > 1 ? "s" : ""}`
      : `Right-click to sail to the ${zoneName(world, zoneOf(world, t.cell))} and ${f.mission === "raid" ? "raid" : "patrol"} · ${fmtCount(p.km)} km, ${days} day${days > 1 ? "s" : ""}${danger}`,
  };
}
function orderFleets(cell) {
  const fs = selectedFleets();
  if (!fs.length) return;
  const t = fleetTargetAt(cell);
  if (!t) { flashHint("Fleets sail on the open sea: right-click the sea, or one of your ports to dock."); return; }
  for (const f of fs) {
    f.auto = false;
    if (t.port) {
      if (f.port === t.port.id) { f.dest = null; f.destPort = null; continue; }
      f.destPort = t.port.id; f.dest = null;
    } else { f.dest = t.cell; f.destPort = null; f.nextMission = f.nextMission || (f.mission === "raid" ? "raid" : "patrol"); }
  }
  ui.fleetHover = null;
  const names = fs.length === 1 ? `The ${fs[0].name}` : `${fs.length} fleets`;
  flashHint(t.port ? `${names} will sail to ${t.port.name} when the season ends.` : `${names} will sail to the ${zoneName(world, zoneOf(world, t.cell))} when the season ends.`);
}
function selectFleetsAt(box, add) {
  const ids = box.ids.filter(id => game.sea.fleets.some(f => f.id === id && f.owner === PLAYER));
  if (!ids.length) return false;
  const cur = ui.fleetSel || [];
  ui.fleetSel = add ? (ids.every(id => cur.includes(id)) ? cur.filter(id => !ids.includes(id)) : [...new Set([...cur, ...ids])]) : ids;
  ui.sel = []; ui.confirmDisband = false;
  ui.tab = "navy";
  return true;
}
function hitFleet(px, py) {
  const boxes = view.fleetBoxes || [];
  for (let k = boxes.length - 1; k >= 0; k--) {
    const b = boxes[k];
    if (px >= b.x - 2 && px <= b.x + b.w + 2 && py >= b.y - 2 && py <= b.y + b.h + 2) return b;
  }
  return null;
}

/* ---------- Troops by sea: when the sea is the better way, and what the order will do ---------- */
function canShipTroops() { return game.cities.some(c => c.owner === PLAYER && oceanPort(world, c)); }
function seaRouteChoice(divs, target, land, force) {
  if (!divs.length || target < 0 || !isLand(world, target) || !canShipTroops()) return null;
  const lead = divs.find(d => !d.training) || divs[0];
  if (land && land.seasons <= 1 && !force) return null;
  const city = game.cities.find(c => c.cell === target);
  if (!(city && city.port) && beachSeaCell(world, target) < 0) return null;
  const plan = seaMovePlan(world, game, divs, target);
  if (!plan.ok) return land && !force ? null : { fail: plan.reason };
  const landSeasons = land ? land.seasons + (lead.training || 0) : Infinity;
  if (!force && plan.seasons >= landSeasons) return null;
  return { plan, land };
}
function seaHoverText(plan, land) {
  const t = plan.kind === "port" ? plan.destCity.name : placeNameW(world, game, plan.target);
  const what = plan.kind === "port" ? `ship them to ${t}` : plan.defenders ? `land at ${t} against ${plan.defenders} enemy division${plan.defenders > 1 ? "s" : ""}` : `land at ${t}`;
  const via = plan.landSeasons > 0 ? `march to ${plan.embark.name}, ` : "";
  const ships = plan.enough ? `${plan.freighters} freighters` : `${plan.freighters} freighters (you have ${plan.have} free: they would wait in port)`;
  const danger = plan.threats.length ? ` · enemy warships in the ${plan.threats.map(x => x.name).join(" and the ")}${plan.threats.some(x => x.hostile) ? " hold the way" : ""}` : "";
  const wave = plan.kind === "beach" && plan.count > MIL.maxStack ? ` · ${MIL.maxStack} land this season, the rest with the next convoy` : "";
  const alt = land ? ` · by land ${land.seasons} season${land.seasons > 1 ? "s" : ""}` : "";
  return `Right-click to ${what} by sea: ${via}${ships}, ${fmtDays(plan.days)} afloat · ${plan.seasons} season${plan.seasons > 1 ? "s" : ""}${alt}${wave}${danger}`;
}
function voyageStatus(d) {
  const v = d.voyage;
  if (!v) return null;
  const port = cityById(v.embark);
  const to = v.kind === "port" ? (game.cities.find(c => c.cell === v.to) || { name: "port" }).name : placeNameW(world, game, v.to);
  if (v.loading) return { text: `Boarding ships at ${port ? port.name : "port"} · lands at ${to} next season`, tone: "neutral" };
  if (port && dist(d.cell, port.cell) <= 1.5) return { text: `Waiting to sail from ${port.name} to ${to} · sails when the season ends`, tone: "neutral" };
  return { text: `Marching to ${port ? port.name : "port"} to board ships for ${to}`, tone: "neutral" };
}
function voyageSeaCells(d) {
  const v = d.voyage;
  if (!v) return null;
  const port = cityById(v.embark);
  if (!port) return null;
  const from = portSeaCell(world, port.cell);
  const city = game.cities.find(c => c.cell === v.to);
  const to = v.kind === "port" && city ? portSeaCell(world, city.cell) : beachSeaCell(world, v.to);
  if (from < 0 || to < 0) return null;
  const p = seaPath(world, from, to);
  return p ? p.cells : null;
}

/* ---------- The fleets on the map ---------- */
function drawFleets(c, cs) {
  view.fleetBoxes = [];
  const S = game.sea;
  if (!S || !S.fleets || !S.fleets.length) return;
  const sel = new Set(ui.fleetSel || []);
  const groups = new Map();
  for (const f of S.fleets) {
    if (!f.ships.length || f.cell < 0) continue;
    const key = f._moving ? `m${f.id}` : `${f.cell}|${f.owner}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const calm = cs < 16 && !ui.play;
  const w = Math.round(clamp(cs * 1.34, 19, 42)), h = Math.round(clamp(cs * 0.84, 12, 25));
  // a fleet in harbor is drawn a little out to sea, clear of the town
  const anchorAt = f => {
    const c = f.port !== null && f.port !== undefined ? cityById(f.port) : null;
    if (!c) return cellCenter(f.cell, cs);
    const dx = cellX(f.cell) - cellX(c.cell), dy = cellY(f.cell) - cellY(c.cell), l = Math.hypot(dx, dy) || 1;
    const [x0, y0] = cellCenter(f.cell, cs);
    return [x0 + (dx / l) * cs * 0.55, y0 + (dy / l) * cs * 0.55];
  };
  for (const list of groups.values()) {
    const owner = list[0].owner;
    const selected = list.some(f => sel.has(f.id));
    if (calm && owner !== PLAYER && !enemiesOf(game, owner).length && !selected) continue;
    const pos = list[0]._pos;
    const [ax, ay] = pos ? [pos[0] * cs, pos[1] * cs] : anchorAt(list[0]);
    const x = Math.round(ax - w / 2), y = Math.round(ay - h / 2);
    const ships = list.flatMap(f => f.ships);
    const heavy = ships.some(s => s.type === "cruiser");
    const docked = !pos && list.every(f => f.port !== null && f.port !== undefined);
    const fade = Math.min(...list.map(f => f._alpha ?? 1));
    if (fade <= 0.01) continue;
    c.globalAlpha = fade;
    c.fillStyle = "rgba(2,8,14,0.55)"; c.fillRect(x + 1.5, y + 2, w, h + 4);
    c.fillStyle = cssRgb(mix(hexToRgb(NATION_COLORS[owner]), [8, 24, 38], 0.45));
    c.fillRect(x, y, w, h);
    giDraw(c, SHIP_ICON[heavy ? "cruiser" : "destroyer"], x + h * 0.62 + 1, y + h / 2, h * 1.08, "#f4f0e6");
    c.fillStyle = "#fbf6ea";
    c.font = `600 ${Math.round(Math.max(8, h * 0.7))}px "IBM Plex Mono", monospace`;
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(String(ships.length), x + h * 1.24 + (w - h * 1.24) / 2, y + h / 2 + 0.5);
    const hp = ships.reduce((s, z) => s + z.hp, 0) / ships.length, org = list.reduce((s, f) => s + f.org, 0) / list.length;
    c.fillStyle = "rgba(8,6,4,0.85)"; c.fillRect(x, y + h, w, 3);
    c.fillStyle = org > 0.6 ? "#6fc28c" : org > 0.3 ? "#e4b14d" : "#ef7c68";
    c.fillRect(x, y + h + 0.5, w * clamp(hp, 0, 1), 2.5);
    // a pale rim tells ships from armies
    c.lineWidth = 1; c.strokeStyle = "rgba(196,226,242,0.95)";
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h + 2);
    if (docked) giDraw(c, "lorc/anchor", x + w, y, Math.max(9, h * 0.62), "#d5ecf6", "#0e1a22", 2);
    else if (list.some(f => f.mission === "raid")) { c.fillStyle = "#ff8a5c"; c.strokeStyle = "#1a0d0a"; c.beginPath(); c.moveTo(x + w - 7, y - 3); c.lineTo(x + w + 3, y - 3); c.lineTo(x + w - 2, y + 6); c.closePath(); c.fill(); c.stroke(); }
    c.globalAlpha = 1;
    if (selected && !ui.play) {
      c.strokeStyle = "#dcb85e"; c.lineWidth = 2; c.strokeRect(x - 1.5, y - 1.5, w + 3, h + 7);
      c.strokeStyle = "rgba(220,184,94,0.3)"; c.lineWidth = 4; c.strokeRect(x - 4, y - 4, w + 8, h + 12);
    }
    view.fleetBoxes.push({ x, y, w, h: h + 3, cell: list[0].cell, owner, ids: list.map(f => f.id) });
  }
}
function drawFleetRoutes(c, cs) {
  const S = game.sea;
  if (S && !ui.play) {
    const sel = new Set(ui.fleetSel || []);
    for (const f of S.fleets) {
      if (f.owner !== PLAYER || !f.ships.length) continue;
      const to = fleetOrderCell(f);
      if (to < 0 || to === f.cell) continue;
      const p = seaPath(world, f.cell, to);
      if (!p || p.cells.length < 2) continue;
      const on = sel.has(f.id);
      drawRoute(c, cs, p.cells, on ? "#9fd3ee" : "rgba(170,215,240,0.5)", on ? 2.6 : 1.6, [7, 5]);
    }
  }
  const hf = ui.fleetHover;
  if (hf && hf.cells && hf.cells.length > 1 && !ui.play) {
    drawRoute(c, cs, hf.cells, "rgba(4,12,20,0.75)", 4.5, [4, 4]);
    drawRoute(c, cs, hf.cells, hf.attack ? "#ff8a5c" : "#bfe6fa", 2.4, [4, 4]);
  }
}

/* ---------- The sea zones: their borders and names, and who holds them ---------- */
function seaZoneShapes(w) {
  const G = seaGeo(w);
  if (G.shapes) return G.shapes;
  const border = new Path2D();
  const fills = G.zones.map(() => new Path2D());
  for (let i = 0; i < N_CELLS; i++) {
    const z = G.zone[i];
    if (z < 0) continue;
    const x = cellX(i), y = cellY(i);
    fills[z].rect(x, y, 1, 1);
    if (x + 1 < GRID_W) { const o = G.zone[idx(x + 1, y)]; if (o >= 0 && o !== z) { border.moveTo(x + 1, y); border.lineTo(x + 1, y + 1); } }
    if (y + 1 < GRID_H) { const o = G.zone[idx(x, y + 1)]; if (o >= 0 && o !== z) { border.moveTo(x, y + 1); border.lineTo(x + 1, y + 1); } }
  }
  G.shapes = { border, fills };
  return G.shapes;
}
function seaZonesShown() { return ui.phase === "play" && !ui.play && (ui.tab === "navy" || (ui.fleetSel && ui.fleetSel.length > 0) || (ui.tab === "selected" && ui.selectedCell >= 0 && isOcean(world, ui.selectedCell))); }
function zoneControlText(z, nid = PLAYER) {
  const S = game.sea;
  const pres = S && S.presence ? S.presence[z] || [] : [];
  if (!pres.length) return { text: "no warships at sea", tone: "neutral", who: -1 };
  const top = pres.slice().sort((a, b) => b.power - a.power)[0];
  const foes = pres.filter(p => p.nid !== nid && atWar(game, p.nid, nid));
  if (top.nid === nid || alliesOf(game, nid).includes(top.nid)) return { text: top.nid === nid ? (foes.length ? "yours, contested" : "yours") : `held by your ally the ${nameOf(game, top.nid)}`, tone: "good", who: top.nid };
  return { text: `held by the ${nameOf(game, top.nid)}`, tone: atWar(game, top.nid, nid) ? "bad" : "neutral", who: top.nid };
}
function drawSeaZones(c, cs) {
  if (!seaZonesShown()) return;
  const G = seaGeo(world), sh = seaZoneShapes(world);
  const S = game.sea;
  c.save();
  c.scale(cs, cs);
  if (S && S.ctl) for (const z in S.ctl) {
    const nid = S.ctl[z];
    if (!sh.fills[z] || nid === undefined || !game.nations[nid]) continue;
    c.fillStyle = rgba(NATION_COLORS[nid], atWar(game, nid, PLAYER) ? 0.16 : 0.1);
    c.fill(sh.fills[z]);
  }
  c.strokeStyle = "rgba(200,228,240,0.42)"; c.lineWidth = 1.3 / cs; c.setLineDash([5 / cs, 4 / cs]);
  c.stroke(sh.border);
  c.setLineDash([]);
  c.restore();
  const size = Math.round(clamp(cs * 0.62, 10, 15));
  for (const Z of G.zones) {
    if (Z.label < 0) continue;
    const [x, y] = cellCenter(Z.label, cs);
    c.font = `italic 600 ${size}px "IBM Plex Sans", system-ui, sans-serif`;
    c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round";
    c.lineWidth = 3; c.strokeStyle = "rgba(4,14,24,0.85)"; c.strokeText(Z.name, x, y);
    c.fillStyle = "rgba(214,236,246,0.92)"; c.fillText(Z.name, x, y);
    const ct = zoneControlText(Z.id);
    if (ct.who >= 0) {
      c.font = `500 ${Math.max(9, size - 3)}px "IBM Plex Sans", system-ui, sans-serif`;
      c.strokeText(ct.text, x, y + size * 1.05);
      c.fillStyle = ct.tone === "bad" ? "#ff9c84" : ct.tone === "good" ? "#9fe0b0" : "rgba(214,236,246,0.8)";
      c.fillText(ct.text, x, y + size * 1.05);
    }
  }
}
/* Ports under blockade get a red ring; shipyards a crane; naval bases a gold rim. */
function drawPortMarks(c, cs, city, x, y, rad) {
  if (!city.port || cs < 14) return;
  const lvl = portLevel(city);
  const s = clamp(cs * 0.45, 7, 14);
  const ax = x - rad - clamp(cs * 0.3, 6, 12), ay = y + rad + 2;
  if (lvl >= 3) { c.strokeStyle = "#dcb85e"; c.lineWidth = 1.6; c.beginPath(); c.arc(ax, ay, s * 0.78, 0, Math.PI * 2); c.stroke(); }
  if (lvl >= 2) giDraw(c, "delapouite/crane", ax - s * 1.05, ay - s * 0.1, s * 0.95, "#e6dcc6", "#14100c", 2);
  if (game.sea && game.sea.blockaded && game.sea.blockaded.includes(city.id)) {
    c.strokeStyle = "#ef7c68"; c.lineWidth = 2; c.setLineDash([3, 2]);
    c.beginPath(); c.arc(ax, ay, s * 0.95, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  }
}

/* ---------- Tooltips and the Inspect panel for the sea ---------- */
function seaTooltipHtml(i) {
  const G = seaGeo(world);
  const order = ui.fleetHover && ui.fleetHover.text ? `<span class="${ui.fleetHover.bad ? "tt-bad" : "tt-good"}">${escapeHtml(ui.fleetHover.text)}</span>`
    : ui.hoverPath && ui.hoverPath.text ? `<span class="${ui.hoverPath.bad ? "tt-bad" : "tt-good"}">${escapeHtml(ui.hoverPath.text)}</span>` : "";
  if (!G.ocean[i]) return `<strong>Lake</strong><span class="tt-line">Closed water: no ship from the open sea can reach it</span>${order}`;
  const z = G.zone[i];
  if (!game) return `<strong>${escapeHtml(zoneName(world, z))}</strong>`;
  const ct = zoneControlText(z);
  const here = game.sea ? game.sea.fleets.filter(f => f.cell === i && f.ships.length) : [];
  const rows = here.map(f => `<span class="tt-line" style="color:${NATION_COLORS[f.owner]}">${escapeHtml(f.owner === PLAYER ? f.name : `The ${nameOf(game, f.owner)}'s ${f.name}`)} · ${escapeHtml(shipsText(fleetCounts(f)))}</span>`).join("");
  return `<strong>${escapeHtml(zoneName(world, z))}</strong><span class="${ct.tone === "bad" ? "tt-bad" : "tt-line"}">${escapeHtml(ct.text.replace(/^./, ch => ch.toUpperCase()))}</span>${rows}${order}`;
}
function seaCellHtml(i) {
  const G = seaGeo(world);
  if (!G.ocean[i]) return `<div class="block"><span class="eyebrow">Water</span><h2 class="side-title">A lake</h2></div><p class="muted small">Closed water, cut off from the open sea. Towns on its shore can fish it, but no ship from the sea can reach them, so they can't have a sea harbor.</p>`;
  const z = G.zone[i], Z = G.zones[z];
  const S = game.sea;
  const ct = zoneControlText(z);
  const pres = S && S.presence ? (S.presence[z] || []).slice().sort((a, b) => b.power - a.power) : [];
  const ports = game.cities.filter(c => c.port && oceanPort(world, c) && portZoneOf(world, c) === z);
  const neighbours = Z.adj.map(o => zoneName(world, o));
  return `<div class="block"><span class="eyebrow">Sea zone</span><h2 class="side-title">${escapeHtml(Z.name)}</h2></div>
    <p class="small tone-${ct.tone}">${escapeHtml(ct.text.replace(/^./, ch => ch.toUpperCase()))}.</p>
    ${pres.length ? `<div class="block"><span class="eyebrow">Warships at sea here</span><ul class="factors">${pres.map(p => `<li><span style="color:${NATION_COLORS[p.nid]}">The ${escapeHtml(nameOf(game, p.nid))}</span><span class="num">strength ${Math.round(p.power * 10)}</span></li>`).join("")}</ul></div>` : ""}
    <div class="block"><span class="eyebrow">Harbors on this sea</span>${ports.length ? `<ul class="factors">${ports.map(c => `<li><span><button class="linkbtn" type="button" data-city-pick="${c.id}">${escapeHtml(c.name)}</button> <span class="muted small">${escapeHtml(nameOf(game, c.owner))}</span></span><span class="num small">${PORT_LEVELS[portLevel(c)].label}${S && S.blockaded && S.blockaded.includes(c.id) ? ' · <span class="tone-bad">blockaded</span>' : ""}</span></li>`).join("")}</ul>` : `<p class="muted small">None yet.</p>`}</div>
    <p class="muted small">${Z.cells} cells of open water, about ${fmtCount(Z.cells * KM2_PER_CELL)} km². Borders the ${escapeHtml(neighbours.join(", the ")) || "open ocean"}.</p>
    <p class="muted small">The strongest fleet at sea in a zone holds it. A harbor whose waters an enemy holds is blockaded: no trade, no fishing, no ships in or out. Enemy warships also sink freighters that sail through.</p>`;
}

/* ---------- The Navy panel ---------- */
function fleetCardHtml(f) {
  const st = fleetStatus(f);
  const hpAvg = f.ships.reduce((s, x) => s + x.hp, 0) / f.ships.length;
  const rows = f.ships.slice().sort((a, b) => SHIP_TYPES[b.type].attack - SHIP_TYPES[a.type].attack).map(s => {
    const col = s.hp > 0.7 ? "var(--good)" : s.hp > 0.4 ? "var(--warn)" : "var(--bad)";
    return `<div class="ship-row">${shipIc(s.type)}<span>${escapeHtml(s.name)} <span class="muted small">${SHIP_TYPES[s.type].label.toLowerCase()}</span></span><span class="hp"><span style="width:${Math.round(s.hp * 100)}%;background:${col}"></span></span><span class="num small">${pct(s.hp)}</span></div>`;
  }).join("");
  return `<div class="unit-card fleet-card">
    <div class="unit-head">${shipIc(f.ships.some(s => s.type === "cruiser") ? "cruiser" : "destroyer")}<strong>${escapeHtml(f.name)}</strong><span class="muted small">${escapeHtml(shipsText(fleetCounts(f)))}</span></div>
    ${gaugeHtml("Hulls", hpAvg, pct(hpAvg))}
    ${gaugeHtml("Readiness", f.org, pct(f.org))}
    <div class="ship-list">${rows}</div>
    <p class="small tone-${st.tone}">${escapeHtml(st.text)} · ${f.auto ? "under the admirals" : "under your orders"} · strength ${Math.round(fleetPower(f) * 10)}</p>
  </div>`;
}
function fleetSelectionHtml() {
  const fs = selectedFleets();
  if (!fs.length) return "";
  const atSea = fs.some(f => f.port === null);
  const mission = fs.every(f => (f.nextMission || f.mission) === "raid") ? "raid" : "patrol";
  const btn = (v, l, sub) => `<button type="button" data-action="fleet-mission" data-value="${v}" class="${mission === v ? "on" : ""}" aria-pressed="${mission === v}">${l}<small>${sub}</small></button>`;
  const anyAuto = fs.some(f => f.auto), anyManual = fs.some(f => !f.auto);
  const place = new Set(fs.map(f => (f.port !== null ? `p${f.port}` : `c${f.cell}`)));
  const types = fs.flatMap(f => f.ships.map(s => s.type));
  const canSplit = fs.length === 1 && types.includes("destroyer") && types.includes("cruiser");
  return `<div class="block selection">
    <div class="law-head"><span class="eyebrow">Selected · ${fs.length === 1 ? "1 fleet" : `${fs.length} fleets`}</span><button class="linkbtn" type="button" data-action="fleet-clear">Clear</button></div>
    <p class="small">Right-click the sea to send ${fs.length > 1 ? "them" : "it"} there, or one of your ports to dock. Fleets sail when the season ends and can reach any sea in one season.</p>
    ${fs.map(fleetCardHtml).join("")}
    <div class="law"><div class="law-head"><strong>Mission at sea</strong></div>
      <div class="seg" style="grid-template-columns:repeat(2,minmax(0,1fr))">${btn("patrol", "Patrol", "hold the sea, guard convoys, blockade")}${btn("raid", "Raid shipping", "sink merchant ships, slip away from big fleets")}</div></div>
    <div class="actions">
      <button class="btn" type="button" data-action="fleet-home">${atSea ? "Return to port" : "Stay in port"}</button>
      ${anyManual ? `<button class="btn" type="button" data-action="fleet-auto">Hand to the admirals</button>` : ""}
      ${anyAuto ? `<button class="btn" type="button" data-action="fleet-manual">Take command</button>` : ""}
      ${fs.length > 1 && place.size === 1 ? `<button class="btn" type="button" data-action="fleet-merge">Join into one fleet</button>` : ""}
      ${canSplit ? `<button class="btn" type="button" data-action="fleet-split" data-type="destroyer">Detach the destroyers</button>` : ""}
    </div>
  </div>`;
}
function noHarborHtml() {
  const mine = game.cities.filter(c => c.owner === PLAYER && game.occ[c.cell] < 0);
  const sea = mine.filter(c => portSeaCell(world, c.cell) >= 0 && !c.port);
  const lake = mine.filter(c => world.coastal[c.cell] && portSeaCell(world, c.cell) < 0);
  const busy = game.projects.filter(p => p.nid === PLAYER && p.kind === "port");
  return `<div class="block"><span class="eyebrow">No harbor on the open sea</span>
      <p class="small">Every ship starts at a harbor. A <strong>harbor</strong> (${fmtMoney(PORT_LEVELS[1].costB)}, 1 season) opens sea trade and the world market for every town on its road network, lets fishing fleets work, and lets you buy freighters abroad. Enlarged into a <strong>port and shipyard</strong> it builds freighters and destroyers; a <strong>naval base</strong> builds cruisers.</p>
      ${busy.length ? `<p class="small tone-good">${escapeHtml(busy.map(p => p.label).join(", "))}: being built.</p>` : ""}
      ${sea.length ? `<div class="build-list">${sea.map(c => `<button class="build-opt" type="button" data-action="quote-port" data-city="${c.id}"><span><strong>Harbor at ${escapeHtml(c.name)}</strong><span class="sub">On the ${escapeHtml(zoneName(world, zoneOf(world, portSeaCell(world, c.cell))))}</span></span><span class="num">${fmtMoney(BUILD.portB)}</span></button>`).join("")}</div>`
        : `<p class="muted small">${lake.length ? `${lake.map(c => escapeHtml(c.name)).join(", ")} ${lake.length > 1 ? "lie" : "lies"} on a lake, which ships from the sea can't reach. ` : ""}None of your towns stands on the open sea. Found a town on a coast near your border (the house tool), or take one in war, and it can have a harbor.</p>`}
    </div>`;
}
function navyTabHtml() {
  const g = game, n = g.nations[PLAYER];
  const S = g.sea;
  const econ = economies()[PLAYER];
  const sel = fleetSelectionHtml();
  const ports = g.cities.filter(c => c.owner === PLAYER && c.port && oceanPort(world, c));
  const fleets = fleetsOf(g, PLAYER);
  if (!ports.length && !fleets.length && !(n.freighters > 0)) return sel + noHarborHtml();
  const counts = navyCounts(g, PLAYER), order = shipsOnOrder(g, PLAYER);
  const T = S && S.trade ? S.trade[PLAYER] : null;
  const upkeep = navyUpkeep(g, PLAYER);
  const orderTxt = SHIP_ORDER.filter(t => order[t]).map(t => nOf(order[t], SHIP_TYPES[t].label.toLowerCase())).join(", ");
  const free = freeFreighters(g, PLAYER);
  const usable = ports.filter(c => portUsableBy(world, g, c, PLAYER));
  const overview = `<div class="stats-grid">
      <div class="stat-cell"><span class="k">Warships</span><span class="v">${counts.cruiser + counts.destroyer}</span><span class="muted small">${nOf(counts.cruiser, "cruiser")} · ${nOf(counts.destroyer, "destroyer")}</span></div>
      <div class="stat-cell"><span class="k">Freighters</span><span class="v">${counts.freighter}</span><span class="muted small">${usable.length ? `${free} free for troops this season` : ports.length ? "every harbor is blockaded" : "no harbor to sail from"}</span></div>
      <div class="stat-cell"><span class="k">Sea trade</span><span class="v">${T && T.mt > 0.05 ? `${pct(T.share)}` : "–"}</span><span class="muted small">${T && T.mt > 0.05 ? `of ${fmtNum(T.mt)} Mt a year gets through` : ports.length && !usable.length ? "stopped by the blockade" : T ? "none last season" : "counted at the end of each season"}</span></div>
      <div class="stat-cell"><span class="k">Upkeep</span><span class="v">${fmtMoneyFine(upkeep)}</span><span class="muted small">a season${orderTxt ? ` · on order: ${escapeHtml(orderTxt)}` : ""}</span></div>
    </div>`;
  const stance = n.navyStance || "defensive";
  const opt = (v, label, sub) => `<button type="button" data-action="navy-stance" data-value="${v}" class="${stance === v ? "on" : ""}" aria-pressed="${stance === v}">${label}<small>${sub}</small></button>`;
  const autoN = fleets.filter(f => f.auto).length;
  const staff = fleets.length ? `<div class="block"><span class="eyebrow">Admiralty</span><div class="law">
      <div class="law-head"><strong>Admirals' orders</strong><span class="law-effect">${autoN} of ${fleets.length} fleet${fleets.length > 1 ? "s" : ""} under the admirals</span></div>
      <div class="seg" style="grid-template-columns:repeat(2,minmax(0,1fr))">${opt("defensive", "Guard our waters", "convoys and ports first")}${opt("offensive", "Seek battle", "blockade, raid their trade")}</div>
      <p class="muted small">In peace the admirals keep the ships in harbor. In war they escort your convoys and guard your ports; told to seek battle, and strong enough, they blockade the enemy's main port and send destroyers to sink its merchant ships. A much weaker fleet stays in harbor, where it still ties the enemy down.</p>
      <div class="actions"><button class="btn" type="button" data-action="navy-all-auto" ${autoN === fleets.length ? "disabled" : ""}>Give all to the admirals</button><button class="btn" type="button" data-action="navy-all-manual" ${autoN === 0 ? "disabled" : ""}>Take command of all</button></div>
    </div></div>` : "";
  const fsel = new Set(ui.fleetSel || []);
  const fleetRows = fleets.map(f => { const st = fleetStatus(f); return `<tr data-action="fleet-select" data-id="${f.id}" class="${fsel.has(f.id) ? "sel" : ""}"><td>${shipIc(f.ships.some(s => s.type === "cruiser") ? "cruiser" : "destroyer")}${escapeHtml(f.name)}${f.auto ? "" : ' <span class="tone-warn small" title="Under your orders">●</span>'}</td><td class="small">${escapeHtml(shipsText(fleetCounts(f)))}<span class="muted"> · ${Math.round(fleetPower(f) * 10)}</span></td><td class="small tone-${st.tone}">${escapeHtml(st.text.split(" · ")[0])}</td></tr>`; }).join("");
  const fleetList = `<div class="block"><span class="eyebrow">Fleets · ${fleets.length}</span>
      ${fleets.length ? `<table class="regions divlist"><thead><tr><th>Fleet</th><th>Ships · strength</th><th>Where</th></tr></thead><tbody>${fleetRows}</tbody></table><p class="muted small">Click a row or a fleet on the map to select it. New warships join a fleet in the harbor that launched them.</p>`
        : `<p class="muted small">No warships yet. Destroyers and cruisers are built at your shipyards, below.</p>`}</div>`;
  // the merchant fleet: what keeps the nation together across water
  const links = econ.seaLinks || [];
  const linkF = links.reduce((s, l) => s + l.freighters, 0);
  const supply = S && S.supplyNeed ? S.supplyNeed[PLAYER] || 0 : 0;
  const voyages = voyageFreighters(g, PLAYER);
  const settlers = g.projects.filter(p => p.kind === "town" && p.nid === PLAYER && p.overseas).length * SEA.settlerFreighters;
  const bought = boughtThisSeason(g, PLAYER), canBuy = Math.max(0, SEA.buyPerSeason - bought);
  const buyBtn = k => `<button class="btn" type="button" data-action="buy-ships" data-type="freighter" data-count="${k}" ${canBuy >= k && ports.length ? "" : "disabled"}>Buy ${k} · ${fmtMoneyFine(SEA.buyFreighterB * k)}</button>`;
  const use = [];
  if (links.length) use.push(`<li><span>Joining ${escapeHtml(links.flatMap(l => l.towns.map(id => (cityById(id) || {}).name)).filter(Boolean).join(", "))} to your market by sea</span><span class="num">${linkF}</span></li>`);
  if (supply) use.push(`<li><span>Supplying divisions overseas${S.supplyOk && S.supplyOk[PLAYER] === false ? ' <span class="tone-bad">(too few)</span>' : ""}</span><span class="num">${supply}</span></li>`);
  if (voyages) use.push(`<li><span>Convoys sailing this season</span><span class="num">${voyages}</span></li>`);
  if (settlers) use.push(`<li><span>Carrying settlers</span><span class="num">${settlers}</span></li>`);
  if (T && T.tradeF) use.push(`<li><span>Carrying your trade (${fmtNum(T.own)} Mt a year)</span><span class="num">${T.tradeF}</span></li>`);
  const merchant = `<div class="block"><span class="eyebrow">Merchant fleet · ${counts.freighter} freighter${counts.freighter === 1 ? "" : "s"}</span>
      ${use.length ? `<ul class="factors">${use.join("")}</ul>` : ""}
      <p class="muted small">A freighter carries 10,000 tons, about 2,000 soldiers with their weapons. A division of 15,000 infantry needs 8 freighters to reach a port, about 14 to land on a beach. Each cut-off town of a million people needs 4 to share your market. Freighters left over carry your trade (${fmtNum(SEA.tradeMtPerFreighter)} Mt a year each), so you pay foreign shipowners less, and keep trading when war keeps their ships away.</p>
      <div class="actions">${buyBtn(1)}${buyBtn(3)}${buyBtn(6)}</div>
      <p class="muted small">Second-hand freighters from shipowners abroad: ${fmtMoneyFine(SEA.buyFreighterB)} each, delivered next season, at most ${SEA.buyPerSeason} a season${bought ? ` (${bought} bought this season)` : ""}. New ones from your own yards cost ${fmtMoneyFine(SHIP_TYPES.freighter.costB)}.</p>
    </div>`;
  // shipyards
  const yards = ports.filter(c => portLevel(c) >= 2 && g.occ[c.cell] < 0);
  const yardHtml = c => {
    const used = slipsInUse(g, c), total = yardSlips(c);
    const onWays = g.projects.filter(p => p.kind === "ships" && p.cityId === c.id && p.seller === undefined);
    const b = (type, count) => {
      const t = SHIP_TYPES[type];
      if (portLevel(c) < t.yard) return "";
      const ok = total - used >= count;
      return `<button class="build-opt" type="button" data-action="build-ship" data-city="${c.id}" data-type="${type}" data-count="${count}" ${ok ? "" : "disabled"}><span>${shipIc(type)}<strong>${count > 1 ? `${count} ${t.plural.toLowerCase()}` : t.label}</strong><span class="sub">${escapeHtml(t.does)} ${t.seasons} season${t.seasons > 1 ? "s" : ""}.</span></span><span class="num">${fmtMoneyFine(t.costB * count)}</span></button>`;
    };
    const free = total - used;
    return `<div class="yard"><div class="law-head"><strong>${escapeHtml(c.name)}</strong><span class="law-effect">${PORT_LEVELS[portLevel(c)].label} · ${used} of ${total} slipways busy</span></div>
      ${onWays.length ? `<ul class="factors">${onWays.map(p => `<li><span>${escapeHtml(p.label.replace(/ from the yard at .*$/, ""))}</span><span class="num muted">${p.seasons - p.progress} season${p.seasons - p.progress > 1 ? "s" : ""} left</span></li>`).join("")}</ul>` : ""}
      <div class="build-list">${b("freighter", 1)}${free >= 4 ? b("freighter", 4) : ""}${b("destroyer", 1)}${b("cruiser", 1)}</div></div>`;
  };
  const yardsBlock = `<div class="block"><span class="eyebrow">Shipyards</span>
      ${yards.length ? yards.map(yardHtml).join("") : `<p class="muted small">None of your harbors has a shipyard yet. Enlarge one into a port and shipyard (below, ${fmtMoney(PORT_LEVELS[2].costB)}, 2 seasons): its four slipways build freighters and destroyers. A naval base has eight, and builds cruisers.</p>`}
    </div>`;
  // warships from a friendly nation's yards
  const sellers = liveNations(g).filter(z => z.id !== PLAYER && (hasTreaty(g, PLAYER, z.id, "trade") || hasTreaty(g, PLAYER, z.id, "alliance")));
  const buyWar = sellers.map(z => {
    const opts = WARSHIPS.map(t => quoteBuyShips(world, g, PLAYER, t, 1, z.id)).filter(q => q.ok);
    if (!opts.length) return "";
    return `<li><span>The ${escapeHtml(z.name)}</span><span class="chips">${opts.map(q => `<button class="btn" type="button" data-action="buy-ships" data-type="${q.ship}" data-count="1" data-seller="${z.id}">${SHIP_TYPES[q.ship].label} · ${fmtMoneyFine(q.cost)}</button>`).join("")}</span></li>`;
  }).filter(Boolean);
  const buyWarHtml = `<details class="block"><summary class="eyebrow">Buy warships abroad</summary>
      ${buyWar.length ? `<ul class="factors">${buyWar.join("")}</ul>` : `<p class="muted small">No nation sells you warships now. Trade partners and allies with their own yards will, for ${pct(SEA.buyWarshipMult - 1)} more than they cost to build; the money goes to them, and the ship takes as long to build as at home.</p>`}
    </details>`;
  // harbors
  const portRows = ports.map(c => {
    const P = portSpec(c), lvl = portLevel(c);
    const bl = S && S.blockaded && S.blockaded.includes(c.id);
    const busy = g.projects.find(p => p.kind === "portup" && p.cityId === c.id);
    const next = lvl < 3 ? PORT_LEVELS[lvl + 1] : null;
    return `<li><span><button class="linkbtn" type="button" data-city-pick="${c.id}">${escapeHtml(c.name)}</button> · ${P.label}<span class="sub">${escapeHtml(zoneName(world, portZoneOf(world, c)))} · ${P.berths} berths · ${P.tradeMt} Mt a year${P.slips ? ` · ${P.slips} slipways` : ""}${bl ? ' · <span class="tone-bad">blockaded</span>' : ""}</span></span>
      <span>${busy ? `<span class="muted small">enlarging · ${busy.seasons - busy.progress} season${busy.seasons - busy.progress > 1 ? "s" : ""}</span>` : next ? `<button class="btn" type="button" data-action="quote-portup" data-city="${c.id}">${next.label} · ${fmtMoney(next.costB)}</button>` : ""}</span></li>`;
  }).join("");
  const more = g.cities.filter(c => c.owner === PLAYER && !c.port && portSeaCell(world, c.cell) >= 0 && g.occ[c.cell] < 0);
  const portsBlock = `<div class="block"><span class="eyebrow">Harbors</span>
      ${ports.length ? `<ul class="factors port-list">${portRows}</ul>` : ""}
      ${more.length ? `<p class="muted small">Could have a harbor: ${more.map(c => `<button class="linkbtn" type="button" data-action="quote-port" data-city="${c.id}">${escapeHtml(c.name)}</button>`).join(", ")} (${fmtMoney(BUILD.portB)} each).</p>` : ""}
      ${T && T.limit === "ports" ? `<p class="small tone-warn">Your harbors are full: they can handle ${fmtNum(T.cap)} Mt a year, and your trade needs ${fmtNum(T.mt)}. Enlarge one, or build another.</p>` : ""}
    </div>`;
  // the waters around you
  const zones = [...new Set(ports.map(c => portZoneOf(world, c)).concat(fleets.map(f => f.zone)).filter(z => z >= 0))];
  const zoneRows = zones.map(z => { const ct = zoneControlText(z); return `<li><span>${escapeHtml(zoneName(world, z))}</span><span class="num small tone-${ct.tone}">${escapeHtml(ct.text)}</span></li>`; }).join("");
  const zonesBlock = zones.length ? `<div class="block"><span class="eyebrow">Your waters</span><ul class="factors">${zoneRows}</ul>
      <p class="muted small">The strongest fleet at sea in a zone holds it. An enemy holding the waters of your harbor blockades it: no trade, no fishing, no ship in or out. While the Navy panel is open, the map shows the zones and who holds them.</p></div>` : "";
  const reports = (S && S.seaBattles ? S.seaBattles : []).filter(r => r.attacker === PLAYER || r.defender === PLAYER);
  const lost = S && S.losses ? S.losses[PLAYER] : null;
  const battles = reports.length || lost ? `<div class="block"><span class="eyebrow">Last season at sea</span>
      ${lost ? `<p class="small tone-bad">Raiders sank ${nOf(lost.freighters, "freighter")}: ${escapeHtml(lost.where.map(x => `${x.lost} in the ${zoneName(world, x.z)}`).join(", "))}. Destroyers on patrol there escort your merchant ships.</p>` : ""}
      ${reports.map(r => seaBattleReportHtml(r)).join("")}</div>` : "";
  return sel + overview + staff + fleetList + merchant + yardsBlock + buyWarHtml + portsBlock + zonesBlock + battles;
}

/* ---------- A town's harbor, shipyard and river wharf (Inspect panel) ---------- */
function portSectionHtml(city) {
  const mine = city.owner === PLAYER;
  const lvl = portLevel(city);
  const seaCell = portSeaCell(world, city.cell);
  const wc = wharfCell(world, city.cell);
  if (!lvl && seaCell < 0 && wc < 0 && !world.coastal[city.cell]) return "";
  const S = game.sea;
  const lines = [], buttons = [];
  const busy = kind => game.projects.find(p => p.cityId === city.id && p.kind === kind);
  if (lvl && seaCell >= 0) {
    const P = PORT_LEVELS[lvl];
    const bl = S && S.blockaded && S.blockaded.includes(city.id);
    lines.push(`<strong>${P.label}</strong> on the ${escapeHtml(zoneName(world, zoneOf(world, seaCell)))}: room for ${P.tradeMt} Mt of trade a year; ${P.berths} berths where troopships load ${fmtCount(P.berths * SEA.berthTonsDay)} tons of soldiers and military cargo a day${P.slips ? `; ${P.slips} slipways (${slipsInUse(game, city)} busy)` : ""}.`);
    if (bl) lines.push(`<span class="tone-bad">Blockaded by the ${escapeHtml(nameOf(game, S.blockadedBy ? S.blockadedBy[city.id] : -1))}: no ship gets in or out, and its trade and fishing have stopped.</span>`);
    const docked = S ? S.fleets.filter(f => f.port === city.id && f.ships.length) : [];
    if (docked.length) lines.push(`In port: ${docked.map(f => `${escapeHtml(f.owner === PLAYER ? f.name : `the ${nameOf(game, f.owner)}'s ${f.name}`)} (${escapeHtml(shipsText(fleetCounts(f)))})`).join("; ")}.`);
    if (mine && lvl < 3) {
      const next = PORT_LEVELS[lvl + 1], b = busy("portup");
      buttons.push(b ? `<span class="muted small">Becoming a ${next.label.toLowerCase()}: ${b.seasons - b.progress} season${b.seasons - b.progress > 1 ? "s" : ""} left.</span>` : `<button class="btn" type="button" data-action="quote-portup" data-city="${city.id}">Enlarge to ${next.label.toLowerCase()} · ${fmtMoney(next.costB)}</button>`);
    }
    if (mine && lvl >= 2) buttons.push(`<button class="btn" type="button" data-action="panel-open" data-p="navy">Build ships</button>`);
  } else if (lvl) {
    lines.push("A harbor on a lake: fishing boats and barges, but ships from the open sea can't reach it.");
  } else if (seaCell >= 0) {
    lines.push(`On the open sea (the ${escapeHtml(zoneName(world, zoneOf(world, seaCell)))}). A harbor would open sea trade and the world market for every town on its road network, let you buy freighters abroad, and later grow into a shipyard.`);
    if (mine) { const b = busy("port"); buttons.push(b ? `<span class="muted small">Harbor being built.</span>` : `<button class="btn" type="button" data-action="quote-port" data-city="${city.id}">Harbor · ${fmtMoney(BUILD.portB)}</button>`); }
  } else if (world.coastal[city.cell]) {
    lines.push("On the shore of a lake. Ships from the open sea can't reach it, so it can't have a sea harbor.");
  }
  if (wc >= 0) {
    const name = riverSystemName(world, wc);
    if (city.wharf) lines.push(`A river wharf on ${escapeHtml(name)}: barges link it with every town that has a wharf on the same river, as if they were joined by road.`);
    else {
      lines.push(`On ${escapeHtml(name)}, a river big enough for barges. A wharf (${fmtMoney(SEA.wharfB)}) would join it to other towns with a wharf on the same river, like a road.`);
      if (mine) { const b = busy("wharf"); buttons.push(b ? `<span class="muted small">Wharf being built.</span>` : `<button class="btn" type="button" data-action="quote-wharf" data-city="${city.id}">River wharf · ${fmtMoney(SEA.wharfB)}</button>`); }
    }
  }
  if (!lines.length && !buttons.length) return "";
  return `<div class="block"><span class="eyebrow">Harbor and river</span>${lines.map(l => `<p class="small">${l}</p>`).join("")}${buttons.length ? `<div class="actions">${buttons.join("")}</div>` : ""}</div>`;
}

/* ---------- Sea battles explained, in the dispatch and the Navy panel ---------- */
function seaBattleReportHtml(r, open = false) {
  const g = game;
  const weA = r.attacker === PLAYER || (r.defender !== PLAYER && sameSideAs(g, PLAYER, r.attacker));
  const involved = r.attacker === PLAYER || r.defender === PLAYER || sameSideAs(g, PLAYER, r.attacker) || sameSideAs(g, PLAYER, r.defender);
  const weWon = weA ? r.won : !r.won;
  const winner = r.won ? r.attacker : r.defender, loser = r.won ? r.defender : r.attacker;
  const title = involved ? (weWon ? `Victory in the ${r.zoneName}` : `Defeat in the ${r.zoneName}`) : `The ${nameOf(g, winner)} beat the ${nameOf(g, loser)} in the ${r.zoneName}`;
  const side = c => [c.cruiser ? nOf(c.cruiser, "cruiser") : "", c.destroyer ? nOf(c.destroyer, "destroyer") : ""].filter(Boolean).join(" and ") || "no warships";
  const lines = r.lines.map(l => {
    const helpsA = (l.side === "a") === (l.mult >= 1);
    const tone = !involved ? "neutral" : helpsA === weA ? "good" : "bad";
    return `<li><span>${escapeHtml(l.label)}</span><span class="num tone-${tone}">${l.side === "a" ? "attack" : "defense"} ×${l.mult.toFixed(2)}</span></li>`;
  }).join("");
  const lostList = nid => {
    const s = (r.sunk && r.sunk[nid]) || [], d = (r.damaged && r.damaged[nid]) || [];
    const parts = [];
    if (s.length) parts.push(`sunk: ${s.map(x => `the ${SHIP_TYPES[x.type].label.toLowerCase()} ${x.name}`).join(", ")}`);
    if (d.length) parts.push(`damaged: ${d.map(x => `${x.name} (${pct(x.hp)})`).join(", ")}`);
    return parts.join("; ") || "no ship lost";
  };
  return `<details class="battle ${involved ? (weWon ? "won" : "lost") : ""}" ${open ? "open" : ""}>
    <summary><strong>${escapeHtml(title)}</strong><span class="muted small"> · ${seasonLabel(r.turn ?? g.turn - 1)}</span></summary>
    <div class="battle-body">
      <p class="small"><span style="color:${NATION_COLORS[r.attacker]}">The ${escapeHtml(nameOf(g, r.attacker))}</span> (${escapeHtml(r.attFleets.join(", "))}): ${side(r.aShips)}<br><span style="color:${NATION_COLORS[r.defender]}">The ${escapeHtml(nameOf(g, r.defender))}</span> (${escapeHtml(r.defFleets.join(", "))}): ${side(r.bShips)}</p>
      <p class="small">Strength ${fmtCount(r.attPower)} against ${fmtCount(r.defPower)} after all factors: ${r.ratio.toFixed(2)} to 1. At sea the stronger side wins the day; guns and torpedoes hurt both sides, the loser more, and the loser's ships run for home.</p>
      ${lines ? `<ul class="factors">${lines}</ul>` : ""}
      <p class="small">The ${escapeHtml(nameOf(g, r.attacker))}: ${escapeHtml(lostList(r.attacker))}.<br>The ${escapeHtml(nameOf(g, r.defender))}: ${escapeHtml(lostList(r.defender))}.${r.retreated && r.retreated.length ? `<br>Withdrew: ${escapeHtml(r.retreated.join(", "))}.` : ""}</p>
    </div></details>`;
}
function seaDispatchHtml(d) {
  const news = d.sea || [], battles = d.seaBattles || [];
  if (!news.length && !battles.length) return "";
  const dot = x => (x.tone === "good" ? "var(--good)" : x.tone === "bad" ? "var(--bad)" : x.tone === "warn" ? "var(--warn)" : "#7fb6d6");
  return `<div class="block"><span class="eyebrow">At sea</span>
    ${news.length ? `<ul class="news">${news.map(x => `<li><span class="dot" style="background:${dot(x)}"></span><span>${escapeHtml(x.text)}</span></li>`).join("")}</ul>` : ""}
    ${battles.slice(0, 4).map(r => seaBattleReportHtml(r)).join("")}
  </div>`;
}

/* ---------- Sea trade in the Economy panel ---------- */
function seaTradeHtml(econ) {
  const g = game, S = g.sea;
  const T = S && S.trade ? S.trade[PLAYER] : null;
  const ports = g.cities.filter(c => c.owner === PLAYER && c.port && oceanPort(world, c));
  const river = econ.byRiver ? [...econ.byRiver].map(id => (cityById(id) || {}).name).filter(Boolean) : [];
  const links = econ.seaLinks || [];
  if (!ports.length && !river.length) return "";
  const rows = [];
  if (T && T.mt > 0.05) {
    rows.push(`<div class="row"><span>Trade by sea<span class="sub">Imports and exports through your harbors</span></span><span class="num">${fmtNum(T.mt)} Mt a year</span></div>`);
    rows.push(`<div class="row"><span>Room in your harbors</span><span class="num ${T.cap < T.mt ? "tone-warn" : ""}">${fmtNum(T.cap)} Mt</span></div>`);
    rows.push(`<div class="row"><span>Carried by your own freighters<span class="sub">They earn ${fmtMoneyFine(T.income)} a year in freight</span></span><span class="num">${fmtNum(Math.min(T.own, T.carry))} Mt</span></div>`);
    rows.push(`<div class="row"><span>Carried by foreign ships<span class="sub">${T.war ? "Enemy warships keep most foreign ships away: freight costs three times as much" : `Freight at $${SEA.freightRate} a ton`}</span></span><span class="num">${fmtNum(Math.max(0, T.carry - T.own))} Mt · ${fmtMoneyFine(-T.fees)}</span></div>`);
    rows.push(`<div class="row total"><span>Gets through</span><span class="num tone-${T.share >= 0.97 ? "good" : "bad"}">${pct(T.share)}</span></div>`);
  }
  const why = !T || T.mt <= 0.05 ? "" : T.limit === "ports" ? "Your harbors are full. Enlarge one (a port handles 50 Mt a year, a naval base 80) or build another."
    : T.limit === "ships" ? "Not enough ships: in war most foreign shipowners stay away, so only your own freighters keep the trade going." : "";
  return `<div class="block"><span class="eyebrow">Sea trade and shipping</span>
    ${rows.length ? `<div class="rows">${rows.join("")}</div>` : `<p class="muted small">Your harbors open the world market: what you can't make you can import, what you can't use you can sell.</p>`}
    ${why ? `<p class="small tone-warn">${escapeHtml(why)}</p>` : ""}
    ${links.length ? `<p class="small">Joined to your market by sea: ${escapeHtml(links.flatMap(l => l.towns.map(id => (cityById(id) || {}).name)).filter(Boolean).join(", "))} (${links.reduce((s, l) => s + l.freighters, 0)} freighters on the run).</p>` : ""}
    ${river.length ? `<p class="small">Joined by barges on the rivers: ${escapeHtml(river.join(", "))}.</p>` : ""}
    <p class="muted small">Goods weigh what they weigh: a million people's food is about a million tons a year, coal four tons a unit, electronics almost nothing. Ships and port room are counted in those tons.</p>
  </div>`;
}

/* ---------- The sea in the season playback ---------- */
function seaPlaybackSegs(timed) {
  const fleetSegs = new Map(), sail = [];
  for (const e of timed) {
    if (e.t === "fleet") { if (!fleetSegs.has(e.id)) fleetSegs.set(e.id, []); fleetSegs.get(e.id).push(e); }
    if (e.t === "voyage") sail.push(e);
  }
  return { fleetSegs, sail };
}
function pathPoint(cells, f) {
  if (!cells || !cells.length) return null;
  const k = clamp(f, 0, 1) * (cells.length - 1);
  const i = Math.min(cells.length - 2, Math.floor(k));
  if (cells.length === 1) return [cellX(cells[0]) + 0.5, cellY(cells[0]) + 0.5];
  const a = cells[i], b = cells[i + 1], t = k - i;
  return [cellX(a) + 0.5 + (cellX(b) - cellX(a)) * t, cellY(a) + 0.5 + (cellY(b) - cellY(a)) * t];
}
function advanceSeaPlayback(pb) {
  const D = pb.display;
  if (!D.sea || !D.sea.fleets) return;
  for (const f of D.sea.fleets) {
    let cell = f._start, pos = null, moving = false;
    for (const s of pb.sea.fleetSegs.get(f.id) || []) {
      if (pb.t >= s.t1) { cell = s.cells[s.cells.length - 1]; continue; }
      if (pb.t >= s.t0) { const p = (pb.t - s.t0) / Math.max(0.01, s.t1 - s.t0); pos = pathPoint(s.cells, p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2); moving = true; }
      break;
    }
    f.cell = cell; f._pos = pos; f._moving = moving;
    f._alpha = f._born !== undefined ? clamp((pb.t - f._born) / 0.4, 0, 1) : f._dies !== undefined ? clamp(1 - (pb.t - f._dies) / 0.5, 0, 1) : 1;
  }
}
function drawSeaPlayback(c, cs, pb) {
  for (const e of pb.timed) {
    if (e.t === "voyage" && pb.t >= e.t0 && pb.t <= e.t1 + 0.2) {
      const p = clamp((pb.t - e.t0) / Math.max(0.01, e.t1 - e.t0), 0, 1);
      const pt = pathPoint(e.cells, p);
      if (!pt) continue;
      const s = clamp(cs * 1.2, 14, 30);
      c.save();
      c.globalAlpha = p > 0.98 ? clamp(1 - (pb.t - e.t1) / 0.2, 0, 1) : 1;
      c.fillStyle = rgba(NATION_COLORS[e.owner], 0.35);
      c.beginPath(); c.arc(pt[0] * cs, pt[1] * cs, s * 0.62, 0, Math.PI * 2); c.fill();
      giDraw(c, SHIP_ICON.freighter, pt[0] * cs, pt[1] * cs, s, "#f4f0e6", "#0b1620", 2.2);
      c.restore();
    }
    if (e.t === "seabattle" && pb.t >= e.t0 && pb.t <= e.t1 + 0.6) {
      const [x, y] = cellCenter(e.cell, cs);
      const p = clamp((pb.t - e.t0) / Math.max(0.01, e.t1 - e.t0), 0, 1.6);
      const fade = p > 1 ? 1 - (p - 1) / 0.6 : 1;
      c.save();
      c.globalAlpha = 0.85 * fade;
      for (let k = 0; k < 3; k++) {
        const r = cs * (0.3 + ((p * 1.6 + k / 3) % 1) * 1.1);
        c.strokeStyle = k % 2 ? "#cfeaf6" : "#ffcf7a"; c.lineWidth = 2;
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
      }
      giDraw(c, "lorc/water-splash", x + cs * 0.75, y - cs * 0.75, clamp(cs * 0.9, 12, 28), "#e8f5fb", "#0b1620", 2);
      c.restore();
    }
  }
}

/* ---------- War at sea in the Statistics window ---------- */
function seaWarStatsHtml(g) {
  const log = (g.stats.seaLog || []).slice().reverse().slice(0, 24);
  const rows = liveNations(g).map(n => ({ n, s: natStats(g, n.id), c: navyCounts(g, n.id) }))
    .filter(x => x.c.cruiser + x.c.destroyer + x.c.freighter > 0 || x.s.seaBattles || x.s.freightersLost || x.s.freightersSunk)
    .sort((a, b) => navyPower(g, b.n.id) - navyPower(g, a.n.id));
  const table = rows.length ? `<div class="st-tablewrap"><table class="st-table compact"><thead><tr><th class="l">Nation</th><th>Cruisers</th><th>Destroyers</th><th>Freighters</th><th>Harbors</th><th>Sea battles</th><th>Ships sunk</th><th>Ships lost</th><th>Freighters sunk</th><th>Freighters lost</th></tr></thead><tbody>${rows.map(x => `<tr class="${x.n.isPlayer ? "me" : ""}"><td class="l">${swatch(x.n)}${escapeHtml(x.n.name)}</td><td>${x.c.cruiser}</td><td>${x.c.destroyer}</td><td>${x.c.freighter}</td><td>${g.cities.filter(c => c.owner === x.n.id && c.port).length}</td><td>${x.s.seaBattles || 0}</td><td>${x.s.shipsSunk || 0}</td><td>${x.s.shipsLost || 0}</td><td>${x.s.freightersSunk || 0}</td><td>${x.s.freightersLost || 0}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="muted small">No nation has put to sea yet.</p>`;
  const list = log.length ? `<div class="st-tablewrap"><table class="st-table compact"><thead><tr><th class="l">Season</th><th class="l">Where</th><th class="l">Sailed in</th><th class="l">Met by</th><th class="l">Result</th><th>Ratio</th><th>Ships sunk</th></tr></thead><tbody>${log.map(r => `<tr><td class="l">${seasonLabel(r.turn)}</td><td class="l">${escapeHtml(r.place)}</td><td class="l">${swatch(g.nations[r.a])}${escapeHtml(nameOf(g, r.a))}</td><td class="l">${swatch(g.nations[r.d])}${escapeHtml(nameOf(g, r.d))}</td><td class="l">${r.won ? "won" : "beaten off"}</td><td>${r.ratio}×</td><td>${r.sa} · ${r.sd}</td></tr>`).join("")}</tbody></table></div>` : "";
  return card("Navies and the war at sea", table + list, { wide: true, note: "ships sunk: attacker's · defender's" });
}

/* ---------- What the Navy buttons do ---------- */
const NAVY_ACTIONS = {
  "quote-portup": el => {
    const c = cityById(Number(el.dataset.city));
    if (!c) return;
    const q = quotePortUp(world, game, PLAYER, c);
    if (q.ok) ui.pending = q; else flashHint(q.reason);
  },
  "quote-wharf": el => {
    const c = cityById(Number(el.dataset.city));
    if (!c) return;
    const q = quoteWharf(world, game, PLAYER, c);
    if (q.ok) ui.pending = q; else flashHint(q.reason);
  },
  "build-ship": el => {
    const c = cityById(Number(el.dataset.city));
    if (!c || !SHIP_TYPES[el.dataset.type]) return;
    const q = quoteShips(world, game, PLAYER, c, el.dataset.type, Number(el.dataset.count) || 1);
    if (q.ok) ui.pending = q; else flashHint(q.reason);
  },
  "buy-ships": el => {
    if (!SHIP_TYPES[el.dataset.type]) return;
    const seller = el.dataset.seller !== undefined ? Number(el.dataset.seller) : -1;
    const q = quoteBuyShips(world, game, PLAYER, el.dataset.type, Number(el.dataset.count) || 1, seller);
    if (q.ok) ui.pending = q; else flashHint(q.reason);
  },
  "fleet-select": el => { ui.fleetSel = [Number(el.dataset.id)]; ui.sel = []; ui.confirmDisband = false; },
  "fleet-clear": () => { ui.fleetSel = []; ui.fleetHover = null; },
  "fleet-mission": el => {
    const v = el.dataset.value === "raid" ? "raid" : "patrol";
    for (const f of selectedFleets()) {
      f.auto = false;
      f.nextMission = v;
      if (f.port === null && (f.dest === null || f.dest === undefined) && !f.destPort) f.mission = v;
    }
  },
  "fleet-home": () => {
    for (const f of selectedFleets()) {
      f.auto = false;
      if (f.port !== null) { f.dest = null; f.destPort = null; continue; }
      const damaged = f.ships.some(s => s.hp < 0.9);
      const to = (damaged && nearestFleetPort(world, game, f, true)) || nearestFleetPort(world, game, f);
      if (to) { f.destPort = to.id; f.dest = null; } else flashHint(`The ${f.name} has no harbor left to go to.`);
    }
  },
  "fleet-auto": () => { for (const f of selectedFleets()) { f.auto = true; f.dest = null; f.destPort = null; f.nextMission = null; } },
  "fleet-manual": () => { for (const f of selectedFleets()) f.auto = false; },
  "fleet-merge": () => {
    const fs = selectedFleets();
    if (fs.length < 2) return;
    fs.sort((a, b) => b.ships.length - a.ships.length);
    mergeFleets(game, fs[0], fs.slice(1));
    fs[0].auto = false;
    ui.fleetSel = [fs[0].id];
  },
  "fleet-split": el => {
    const f = selectedFleets()[0];
    if (!f || !SHIP_TYPES[el.dataset.type]) return;
    const nf = splitFleet(world, game, f, el.dataset.type, f.ships.filter(s => s.type === el.dataset.type).length);
    if (nf) { nf.auto = false; f.auto = false; ui.fleetSel = [nf.id]; }
  },
  "navy-stance": el => { game.nations[PLAYER].navyStance = el.dataset.value === "offensive" ? "offensive" : "defensive"; },
  "navy-all-auto": () => { for (const f of fleetsOf(game, PLAYER)) { f.auto = true; f.dest = null; f.destPort = null; f.nextMission = null; } },
  "navy-all-manual": () => { for (const f of fleetsOf(game, PLAYER)) f.auto = false; },
};

