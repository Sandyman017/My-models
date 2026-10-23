/* =====================================================================
   17b. A world that moves: each season plays out on the map, and roads carry traffic between turns
   ===================================================================== */
const MOTION_KEY = "drawn-borders/motion";
const motion = { on: true, speed: 1, now: 0 };
function loadMotion() { try { return localStorage.getItem(MOTION_KEY) !== "off"; } catch (e) { return true; } }
function saveMotion() { try { localStorage.setItem(MOTION_KEY, motion.on ? "on" : "off"); } catch (e) { /* storage unavailable */ } }


/* What the map looked like before the season, so it can be replayed from there. */
function snapshotForPlayback(g) {
  return {
    owner: g.owner.slice(), occ: g.occ.slice(), roads: new Set(g.roads),
    cities: g.cities.map(c => ({ ...c, ind: { ...(c.ind || {}) } })),
    divisions: g.divisions.map(d => ({ ...d, path: [] })),
    sites: (g.sites || []).map(s => ({ ...s })),
    fleets: g.sea ? g.sea.fleets.map(f => ({ ...f, ships: f.ships.map(x => ({ ...x })) })) : [],
    turn: g.turn,
  };
}

/* Turn the recorded events and the before/after difference into a timeline in seconds. */
function buildPlayback(before, events, after) {
  const T0 = 0.3;
  const moves = events.filter(e => e.phase === "move");
  const moveSteps = moves.length ? Math.max(...moves.map(e => e.step)) + 1 : 0;
  const M = moveSteps ? clamp(0.5 + moveSteps * 0.24, 0.9, 2.6) : 0;
  const battles = events.filter(e => e.t === "battle");
  const battleSteps = events.filter(e => e.phase === "battle").reduce((m, e) => Math.max(m, e.step + 1), 0);
  const B = battleSteps ? clamp(0.5 + battleSteps * 0.5, 1, 3.4) : 0;
  const sweeps = events.filter(e => e.phase === "sweep");
  const S = sweeps.length ? clamp(0.4 + sweeps.length * 0.05, 0.6, 1.6) : 0;
  // building, read from the difference between before and after
  const builds = [];
  const newRoads = [...after.roads].filter(e => !before.roads.has(e));
  newRoads.forEach((e, k) => builds.push({ t: "road", edge: e, k }));
  for (const c of after.cities) {
    const old = before.cities.find(x => x.id === c.id);
    if (!old) { builds.push({ t: "town", city: c }); continue; }
    for (const k in c.ind || {}) if ((c.ind[k] || 0) > (old.ind[k] || 0)) builds.push({ t: "industry", city: c, kind: k });
    if (c.port && !old.port) builds.push({ t: "port", city: c });
  }
  for (const s of after.sites || []) {
    const old = (before.sites || []).find(x => x.id === s.id);
    if (!old || s.level > old.level) builds.push({ t: "site", site: { ...s }, isNew: !old });
    else if (s.smelter && !old.smelter) builds.push({ t: "site", site: { ...s }, isNew: false, smelter: true });
  }
  const migr = events.filter(e => e.phase === "migrate");
  const D = builds.length || migr.length ? 1.4 : 0.3;
  const seaEv = events.filter(e => e.phase === "sea");
  const SEAd = seaEv.length ? clamp(1.2 + seaEv.length * 0.12, 1.4, 2.6) : 0;
  const tSea = T0, tM = T0 + SEAd, tB = tM + M, tS = tB + B, tD = tS + S, end = tD + D + 0.6;
  const timed = [];
  for (const e of events) {
    let t0 = 0, dur = 0.3;
    if (e.phase === "move") { dur = M / moveSteps; t0 = tM + e.step * dur; dur *= 0.92; }
    else if (e.phase === "battle") {
      const slot = B / battleSteps;
      const start = tB + e.step * slot;
      if (e.t === "battle" || e.t === "engage") { t0 = start; dur = slot * 0.9; }
      else { t0 = start + slot * 0.62; dur = slot * 0.3; }
    } else if (e.phase === "sweep") { t0 = tS + (e.step / Math.max(1, sweeps.length)) * S * 0.9; dur = 0.25; }
    else if (e.phase === "sea") { const span = [[0, 0.45], [0.35, 0.85], [0.7, 1]][clamp(e.step || 0, 0, 2)]; t0 = tSea + span[0] * SEAd; dur = (span[1] - span[0]) * SEAd; }
    else if (e.phase === "migrate") { const k = migr.indexOf(e); t0 = tD + 0.05 + k * 0.08; dur = Math.max(0.8, D - 0.1 - k * 0.08); }
    timed.push({ ...e, t0, t1: t0 + dur });
  }
  builds.forEach(b => {
    let t0 = tD + 0.1;
    if (b.t === "road") t0 = tD + (b.k / Math.max(1, newRoads.length)) * D * 0.8;
    if (b.t === "town") t0 = tD + D * 0.35;
    if (b.t === "industry" || b.t === "port" || b.t === "site") t0 = tD + D * 0.55;
    timed.push({ ...b, t0, t1: t0 + 0.5 });
  });
  timed.sort((a, b) => a.t0 - b.t0);
  // each division's journey
  const segs = new Map();
  for (const e of timed) {
    if (e.t !== "move" && e.t !== "engage") continue;
    if (!segs.has(e.id)) segs.set(e.id, []);
    segs.get(e.id).push(e);
  }
  // divisions carried by sea vanish into the convoy and come ashore where it lands
  for (const e of timed) {
    if (e.t !== "voyage") continue;
    for (const id of e.ids) { if (!segs.has(id)) segs.set(id, []); segs.get(id).push({ t: "sail", id, to: e.ends[id], t0: e.t0, t1: e.t1 }); }
  }
  for (const list of segs.values()) list.sort((a, b) => a.t0 - b.t0);
  // the display world starts as the snapshot
  const display = {
    ...after, __display: true, ver: 1e6 + Math.floor(Math.random() * 1e6),
    owner: before.owner.slice(), occ: before.occ.slice(), roads: new Set(before.roads),
    cities: before.cities.map(c => ({ ...c, ind: { ...c.ind } })), battles: [], projects: after.projects,
    sites: (before.sites || []).filter(s => (after.sites || []).some(x => x.id === s.id)).map(s => ({ ...s, ...((after.sites || []).find(x => x.id === s.id)), level: s.level })),
    divisions: before.divisions.map(d => ({ ...d, _start: d.cell })),
    sea: after.sea ? { ...after.sea, fleets: (before.fleets || []).map(f => ({ ...f, ships: f.ships.map(x => ({ ...x })), _start: f.cell })) } : null,
  };
  if (display.sea) {
    const afterF = new Set((after.sea.fleets || []).map(f => f.id));
    const firstBattle = timed.find(e => e.t === "seabattle");
    for (const f of display.sea.fleets) if (!afterF.has(f.id)) f._dies = firstBattle ? firstBattle.t1 : tM;
    for (const f of after.sea.fleets || []) if (!display.sea.fleets.some(x => x.id === f.id)) {
      const first = timed.find(e => e.t === "fleet" && e.id === f.id);
      display.sea.fleets.push({ ...f, ships: f.ships.map(x => ({ ...x })), _start: first ? first.cells[0] : f.cell, _born: first ? first.t0 : tD + 0.3 });
    }
  }
  const afterIds = new Set(after.divisions.map(d => d.id));
  const beforeIds = new Set(before.divisions.map(d => d.id));
  for (const d of after.divisions) if (!beforeIds.has(d.id)) {
    const first = segs.get(d.id) && segs.get(d.id)[0];
    display.divisions.push({ ...d, path: [], cell: first ? first.from : d.cell, _start: first ? first.from : d.cell, _born: T0 * 0.6 });
  }
  for (const d of display.divisions) if (!afterIds.has(d.id)) {
    const death = timed.find(e => e.t === "destroy" && e.id === d.id);
    d._dies = death ? death.t0 : tS;
  }
  return { before, after, display, timed, segs, sea: seaPlaybackSegs(timed), applied: 0, t: 0, end, toasts: [], tB, tS, tD };
}

function playbackToast(pb, cell, text, color) {
  pb.toasts.push({ cell, text, color, t0: pb.t });
}

/* Move the display world forward to the playback clock. */
function advancePlayback(pb) {
  const D = pb.display, A = pb.after;
  while (pb.applied < pb.timed.length && pb.timed[pb.applied].t0 <= pb.t) {
    const e = pb.timed[pb.applied++];
    if (e.t === "occ") {
      D.occ[e.cell] = e.occ; D.ver++;
      const city = A.cities.find(c => c.cell === e.cell);
      if (city) {
        const ctl = e.occ >= 0 ? e.occ : D.owner[e.cell];
        playbackToast(pb, e.cell, ctl === city.owner ? `${city.name} retaken` : `${city.name} falls`, NATION_COLORS[ctl] || "#fff");
      }
    } else if (e.t === "battle") {
      if (e.attacker === PLAYER || e.defender === PLAYER) {
        const weWon = (e.attacker === PLAYER) === e.won;
        playbackToast(pb, e.cell, weWon ? (e.attacker === PLAYER ? "Victory" : "Held") : (e.attacker === PLAYER ? "Repulsed" : "Driven out"), weWon ? "#8fdcaa" : "#ff8a6e");
      }
    } else if (e.t === "road") {
      D.roads.add(e.edge); D.ver++;
    } else if (e.t === "town") {
      const c = { ...e.city, ind: { ...(e.city.ind || {}) }, _born: pb.t };
      D.cities.push(c);
      for (let i = 0; i < N_CELLS; i++) if (A.owner[i] === c.owner && D.owner[i] !== c.owner && dist(i, c.cell) <= BUILD.townClaimRadius + 0.5) D.owner[i] = c.owner;
      D.ver++;
      playbackToast(pb, c.cell, `New town: ${c.name}`, NATION_COLORS[c.owner]);
    } else if (e.t === "industry") {
      const c = D.cities.find(x => x.id === e.city.id);
      if (c) { c.ind[e.kind] = e.city.ind[e.kind]; D.ver++; }
      if (e.city.owner === PLAYER || view.zoom > 1.6) playbackToast(pb, e.city.cell, `+ ${INDUSTRIES[e.kind].label}`, "#f3dc9a");
    } else if (e.t === "seabattle") {
      if (e.attacker === PLAYER || e.defender === PLAYER) { const weWon = (e.attacker === PLAYER) === e.won; playbackToast(pb, e.cell, weWon ? "Victory at sea" : "Defeat at sea", weWon ? "#8fdcaa" : "#ff8a6e"); }
    } else if (e.t === "voyage") {
      if (e.owner === PLAYER) playbackToast(pb, e.cells[0], e.back ? "Convoy turned back" : "Convoy sails", e.back ? "#ff8a6e" : "#bfe6fa");
    } else if (e.t === "port") {
      const c = D.cities.find(x => x.id === e.city.id);
      if (c) { c.port = true; D.ver++; }
    } else if (e.t === "site") {
      const k = D.sites.findIndex(x => x.id === e.site.id);
      if (k >= 0) D.sites[k] = e.site; else D.sites.push(e.site);
      const owner = A.owner[e.site.cell];
      if (owner === PLAYER || view.zoom > 1.6) playbackToast(pb, e.site.cell, e.isNew ? `+ ${SITE_KINDS[e.site.kind].label}` : e.smelter ? "+ Smelter" : `${e.site.name} grows`, "#f3dc9a");
    } else if (e.t === "migrate") {
      if (e.owner === PLAYER && e.people >= 0.02) playbackToast(pb, e.to, `+${fmtPeople(e.people)} newcomers`, "#f3dc9a");
    }
  }
  // armies: where each one is right now
  for (const d of D.divisions) {
    let cell = d._start, pos = null, moving = false, aboard = false;
    for (const s of pb.segs.get(d.id) || []) {
      if (pb.t >= s.t1) { if (s.t === "move" || s.t === "sail") cell = s.to; continue; }
      if (pb.t >= s.t0 && s.t === "sail") { aboard = true; break; }
      if (pb.t >= s.t0) {
        const p = (pb.t - s.t0) / Math.max(0.01, s.t1 - s.t0);
        const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const f = s.t === "engage" ? Math.sin(Math.PI * p) * 0.42 : ease;
        pos = [cellX(s.from) + 0.5 + (cellX(s.to) - cellX(s.from)) * f, cellY(s.from) + 0.5 + (cellY(s.to) - cellY(s.from)) * f];
        moving = true;
      }
      break;
    }
    d.cell = cell; d._pos = pos; d._moving = moving;
    d._alpha = aboard ? 0 : d._born !== undefined && pb.t < d._born + 0.4 ? clamp((pb.t - d._born) / 0.4, 0, 1) : d._dies !== undefined ? clamp(1 - (pb.t - d._dies) / 0.5, 0, 1) : 1;
  }
  advanceSeaPlayback(pb);
  D.divisions = D.divisions.filter(d => d._alpha > 0 || d._dies === undefined || pb.t < d._dies || (pb.segs.get(d.id) || []).some(s => s.t === "sail" && pb.t < s.t1));
}

/* Battle smoke and fire while a battle is fought; floating notes for what changed. */
function drawPlaybackEffects(c, cs, pb) {
  drawSeaPlayback(c, cs, pb);
  drawMigrations(c, cs, pb);
  for (const e of pb.timed) {
    if (e.t !== "battle" || pb.t < e.t0 || pb.t > e.t1 + 0.6) continue;
    const [x, y] = cellCenter(e.cell, cs);
    const p = clamp((pb.t - e.t0) / Math.max(0.01, e.t1 - e.t0), 0, 1.6);
    const fade = p > 1 ? 1 - (p - 1) / 0.6 : 1;
    c.save();
    const glow = c.createRadialGradient(x, y, 0, x, y, cs * 1.2);
    const pulse = 0.55 + 0.45 * Math.sin(p * 18);
    glow.addColorStop(0, `rgba(255,220,140,${0.75 * pulse * fade})`); glow.addColorStop(0.4, `rgba(255,110,50,${0.4 * fade})`); glow.addColorStop(1, "rgba(60,40,30,0)");
    c.fillStyle = glow; c.beginPath(); c.arc(x, y, cs * 1.2, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.8 * fade;
    for (let k = 0; k < 3; k++) {
      const r = cs * (0.35 + ((p * 2 + k / 3) % 1) * 0.9);
      c.strokeStyle = k % 2 ? "#ffcf7a" : "#ff6a3d"; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    }
    for (let k = 0; k < 9; k++) {
      const a = hash2(e.cell, k, 11) * Math.PI * 2 + p * 3, rr = cs * (0.2 + 0.5 * ((p * 1.7 + hash2(k, e.cell, 5)) % 1));
      c.fillStyle = k % 3 ? "rgba(255,190,90,0.9)" : "rgba(80,70,60,0.7)";
      c.beginPath(); c.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, Math.max(1.5, cs * 0.07), 0, Math.PI * 2); c.fill();
    }
    c.restore();
    if (p >= 0.6) {
      const col = !(e.attacker === PLAYER || e.defender === PLAYER) ? "#f4e9d2" : ((e.attacker === PLAYER) === e.won ? "#8fdcaa" : "#ff8a6e");
      c.globalAlpha = fade;
      drawBurst(c, x + cs * 0.62, y - cs * 0.62, Math.max(5, cs * 0.42), col);
      c.globalAlpha = 1;
    }
  }
  for (const n of pb.toasts) {
    const age = pb.t - n.t0;
    if (age > 2.2) continue;
    const [x, y] = cellCenter(n.cell, cs);
    const a = age < 0.25 ? age / 0.25 : age > 1.6 ? 1 - (age - 1.6) / 0.6 : 1;
    c.save();
    c.globalAlpha = a;
    c.font = `700 ${Math.round(clamp(cs * 0.85, 12, 18))}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
    c.textAlign = "center"; c.textBaseline = "middle";
    const yy = y - cs * 1.4 - age * cs * 0.6;
    c.lineWidth = 4; c.strokeStyle = "rgba(10,8,6,0.9)"; c.strokeText(n.text, x, yy);
    c.fillStyle = n.color; c.fillText(n.text, x, yy);
    c.restore();
  }
}

/* ---------- Playback control ---------- */
function startPlayback(before, events, dispatch) {
  ui.play = buildPlayback(before, events, game);
  ui.play.dispatch = dispatch;
  ui.play.last = performance.now();
  ui.lastPlayback = { before, events };
  document.getElementById("tooltip").hidden = true;
  renderOverlays();
}
function finishPlayback() {
  const pb = ui.play;
  if (!pb) return;
  ui.play = null;
  shapeCache.key = "";
  view.staticKey = "";
  seasonShown(pb.dispatch);
}
function replayLastSeason() {
  const lp = ui.lastPlayback;
  if (!lp || !ui.dispatch) return;
  const d = ui.dispatch;
  ui.dispatch = null;
  startPlayback(lp.before, lp.events, d);
}
function playbarHtml() {
  const pb = ui.play;
  return `<span class="playbar-label">${escapeHtml(seasonLabel(pb.before.turn))} unfolds</span>
    <span class="playbar-track"><span id="playbar-fill" style="width:${(pb.t / pb.end) * 100}%"></span></span>
    <button type="button" data-action="play-speed" class="${motion.speed > 1 ? "on" : ""}" title="Play faster">2×</button>
    <button type="button" data-action="play-skip" title="Skip to the end of the season (Space)">Skip ▸▸</button>`;
}

/* ---------- Traffic on the roads, smoke from the chimneys ---------- */
function trafficEdges() {
  const sh = buildShapes();
  if (sh.traffic) return sh.traffic;
  const out = [];
  for (const k of game.roads) {
    const [a, b] = edgeEnds(k);
    const oa = game.owner[a], ob = game.owner[b];
    const occupied = game.occ[a] >= 0 || game.occ[b] >= 0;
    if (occupied) continue;
    if (oa !== ob && oa >= 0 && ob >= 0 && !tradePairTrades(oa, ob)) continue;   // a road across a border has carts only while the two trade
    const trade = oa !== ob || oa < 0;
    const lanes = trade ? 2 : 1;
    for (let l = 0; l < lanes; l++) out.push({ a, b, trade, phase: hash2(a, b + l * 7, 3), speed: 0.18 + 0.12 * hash2(b, a, 9), dir: hash2(a + l, b, 5) < 0.5 });
  }
  sh.traffic = out;
  return out;
}
function drawTraffic(c, cs, now) {
  if (cs < 10 || !game.roads.size) return;
  const r = clamp(cs * 0.075, 1.1, 2.6);
  for (const e of trafficEdges()) {
    let p = (now / 1000 * e.speed + e.phase) % 1;
    if (e.dir) p = 1 - p;
    const x = (cellX(e.a) + 0.5 + (cellX(e.b) - cellX(e.a)) * p) * cs, y = (cellY(e.a) + 0.5 + (cellY(e.b) - cellY(e.a)) * p) * cs;
    c.fillStyle = e.trade ? "#ffd36b" : "rgba(255,248,230,0.9)";
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
}

let ambientLast = 0;
function animationLoop(now) {
  requestAnimationFrame(animationLoop);
  motion.now = now;
  rtTick(now);
  if (ui.play) {
    const dt = Math.min(0.1, (now - ui.play.last) / 1000);
    ui.play.last = now;
    ui.play.t += dt * motion.speed;
    advancePlayback(ui.play);
    const fill = document.getElementById("playbar-fill");
    if (fill) fill.style.width = `${Math.min(100, (ui.play.t / ui.play.end) * 100)}%`;
    renderMap();
    if (ui.play.t >= ui.play.end) finishPlayback();
    return;
  }
  if (!motion.on || document.hidden || !game || ui.phase === "draw" || now - ambientLast < 33) return;
  ambientLast = now;
  renderMap();
}

