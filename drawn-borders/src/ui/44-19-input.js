/* =====================================================================
   19. Input
   ===================================================================== */
function mapPx(e) {
  const rect = canvas.getBoundingClientRect();
  return { px: e.clientX - rect.left - view.ox, py: e.clientY - rect.top - view.oy };
}
function eventCell(e) {
  const { px, py } = mapPx(e);
  const x = px / view.cs, y = py / view.cs;
  return { x, y, cell: inBounds(Math.floor(x), Math.floor(y)) ? idx(Math.floor(x), Math.floor(y)) : -1 };
}

function cityNear(cell, nid) {
  if (cell < 0) return null;
  let best = null, bestD = 1.6;
  for (const c of game.cities) {
    if (nid !== undefined && c.owner !== nid) continue;
    const d = dist(c.cell, cell);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function accessRoadTarget(cell) {
  if (cell < 0 || game.owner[cell] !== PLAYER || game.cities.some(c => c.cell === cell)) return false;
  return !!(siteAt(cell) || knownDepositAt(cell) || !cityNear(cell));
}
function computeHoverQuote(cell) {
  if (ui.phase !== "play" || ui.pending || cell < 0) return null;
  if (ui.tool === "road" && ui.roadFrom) {
    const from = game.cities.find(c => c.id === ui.roadFrom);
    if (from && accessRoadTarget(cell)) return quoteAccessRoad(world, game, PLAYER, from, cell);
    const to = cityNear(cell);
    if (from && to && to.id !== from.id) return quoteRoad(world, game, PLAYER, from, to);
  } else if (ui.tool === "town") {
    return quoteTown(world, game, PLAYER, cell);
  }
  return null;
}

const quoteMemo = { key: "", value: null };
function onPointerMove(e) {
  if (ui.pan) {
    const dx = e.clientX - ui.pan.sx, dy = e.clientY - ui.pan.sy;
    if (ui.pan.moved || Math.hypot(dx, dy) > 5) {
      ui.pan.moved = true;
      canvas.style.cursor = "grabbing";
      view.ox = ui.pan.ox + dx; view.oy = ui.pan.oy + dy;
      clampCamera();
      document.getElementById("tooltip").hidden = true;
      scheduleMapRender();
    }
    return;
  }
  if (drawingPath) {
    const { x, y } = eventCell(e);
    const last = drawingPath[drawingPath.length - 1];
    if (Math.hypot(x - last[0], y - last[1]) > 0.35) { drawingPath.push([x, y]); scheduleMapRender(); }
    return;
  }
  const { cell } = eventCell(e);
  if (cell !== ui.hoverCell) {
    ui.hoverCell = cell;
    const key = `${cell}|${ui.tool}|${ui.roadFrom}|${mapVersion}|${!!ui.pending}`;
    if (quoteMemo.key !== key) { quoteMemo.value = computeHoverQuote(cell); quoteMemo.key = key; }
    ui.hoverQuote = quoteMemo.value;
    ui.fleetHover = game && ui.phase === "play" && !ui.box && ui.fleetSel.length ? hoverFleetRoute(cell) : null;
    ui.hoverPath = game && ui.phase === "play" && !ui.box && !ui.fleetHover ? hoverRoute(cell, e.shiftKey) : null;
    scheduleMapRender();
  }
  if (ui.press && ui.phase === "play") {
    const { px, py } = mapPx(e);
    if (ui.box || Math.hypot(px - ui.press.px, py - ui.press.py) > 6) {
      ui.box = { x0: ui.press.px, y0: ui.press.py, x1: px, y1: py };
      ui.hoverPath = null;
      scheduleMapRender();
      return;
    }
  }
  const lh = game && ui.phase === "play" && !ui.hoverQuote && !ui.dispatch ? tradeLaneAt(mapPx(e).px, mapPx(e).py) : null;
  if ((lh && lh.lane) !== (ui.tradeHover && ui.tradeHover.lane)) scheduleMapRender();
  ui.tradeHover = lh;
  const tip = document.getElementById("tooltip");
  const html = ui.dispatch ? "" : tooltipHtml(cell);
  tip.hidden = !html;
  if (html) {
    tip.innerHTML = html;
    const wrap = mapwrap.getBoundingClientRect();
    let left = e.clientX - wrap.left + 16, top = e.clientY - wrap.top + 16;
    if (left + 270 > wrap.width) left = e.clientX - wrap.left - 276;
    if (top + 120 > wrap.height) top = e.clientY - wrap.top - 110;
    tip.style.left = `${Math.max(4, left)}px`; tip.style.top = `${Math.max(4, top)}px`;
  }
}

function onPointerLeave() {
  ui.hoverCell = -1; ui.hoverQuote = null; ui.hoverPath = null; ui.fleetHover = null; ui.tradeHover = null;
  document.getElementById("tooltip").hidden = true;
  scheduleMapRender();
}

function onPointerDown(e) {
  if (e.button === 1 || e.button === 2) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    ui.pan = { sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy, moved: false, button: e.button, cell: eventCell(e).cell, shift: e.shiftKey };
    return;
  }
  if (ui.play) return;
  if (ui.phase === "provinces" || (ui.phase === "play" && ui.tool === "province" && !ui.dispatch && e.button === 0)) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = eventCell(e);
    drawingPath = [[x, y]];
    ui.provDraw = null;
    renderAll();
    return;
  }
  if (ui.phase === "draw") {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = eventCell(e);
    drawingPath = [[x, y]];
    ui.drawCells = null; ui.drawCellSet = null; ui.error = null; ui.note = null; ui.preview = null;
    renderAll();
    return;
  }
  if (ui.phase !== "play" || ui.dispatch) return;
  const { cell } = eventCell(e);
  if (cell < 0) return;
  if (e.button !== 0) return;
  if (ui.tool === "select") {
    canvas.setPointerCapture(e.pointerId);
    ui.press = { ...mapPx(e), cell, shift: e.shiftKey };
    return;
  } else if (ui.tool === "road") {
    const city = cityNear(cell, PLAYER);
    if (!ui.roadFrom) { if (city) ui.roadFrom = city.id; else flashHint("Start the road at one of your towns."); }
    else if (accessRoadTarget(cell)) {
      const q = quoteAccessRoad(world, game, PLAYER, game.cities.find(c => c.id === ui.roadFrom), cell);
      if (q.ok) { ui.pending = q; ui.tab = "realm"; } else flashHint(q.reason);
    } else {
      const target = cityNear(cell);
      if (target && target.id !== ui.roadFrom) {
        const q = quoteRoad(world, game, PLAYER, game.cities.find(c => c.id === ui.roadFrom), target);
        if (q.ok) { ui.pending = q; ui.tab = "realm"; } else flashHint(q.reason);
      }
    }
  } else if (ui.tool === "town") {
    const q = quoteTown(world, game, PLAYER, cell);
    if (q.ok) { ui.pending = q; ui.tab = "realm"; } else flashHint(q.reason);
  }
  renderAll();
}

function selectClick(press) {
  const hf = game.sea ? hitFleet(press.px, press.py) : null;
  if (hf && hf.owner === PLAYER && selectFleetsAt(hf, press.shift)) return;
  if (hf && hf.owner !== PLAYER) { ui.fleetSel = []; ui.selectedCity = null; ui.selectedCell = hf.cell; ui.tab = "selected"; return; }
  if (!press.shift) ui.fleetSel = [];
  const hit = hitUnit(press.px, press.py);
  if (hit && hit.owner === PLAYER) { selectStackAt(hit.cell, press.shift); return; }
  if (!press.shift) { ui.sel = []; ui.confirmDisband = false; }
  const hw = hitWork(press.px, press.py);
  if (hw && !press.shift) { ui.tab = "agenda"; return; }
  const hs = hitSite(press.px, press.py);
  if (hs) { ui.selectedCity = null; ui.selectedCell = hs.cell; if (!press.shift) ui.tab = "selected"; return; }
  let city = cityNear(press.cell);
  if (city && city.cell !== press.cell && (siteAt(press.cell) || knownDepositAt(press.cell))) city = null;
  ui.selectedCity = city ? city.id : null;
  ui.selectedCell = city ? -1 : press.cell;
  if (!press.shift) ui.tab = "selected";
}

function onPointerUp() {
  if (ui.pan) {
    const pan = ui.pan;
    ui.pan = null;
    canvas.style.cursor = "";
    if (!pan.moved && pan.button === 2 && ui.phase === "play" && !ui.dispatch && pan.cell >= 0) {
      if (ui.fleetSel.length) { orderFleets(pan.cell); saveGame(); renderAll(); }
      else if (ui.sel.length) { orderMove(pan.cell, pan.shift); saveGame(); renderAll(); }
    }
    return;
  }
  if (ui.press) {
    const press = ui.press;
    ui.press = null;
    if (ui.box) { boxSelect(ui.box, press.shift); ui.box = null; }
    else selectClick(press);
    renderAll();
    return;
  }
  if (!drawingPath) return;
  const path = drawingPath;
  drawingPath = null;
  if (ui.phase !== "draw") { provPenDone(path); renderAll(); return; }
  applyClaimResult(claimFromPath(world, path));
  saveGame();
  renderAll();
}

let hintTimer = null;
function flashHint(text) {
  clearTimeout(hintTimer);
  setTimeout(() => {
    const hint = document.getElementById("map-hint");
    hint.hidden = false; hint.textContent = text;
  }, 0);
  hintTimer = setTimeout(() => renderOverlays(), 2800);
}

function applyClaimResult(res) {
  if (res.ok) {
    ui.drawCells = res.cells;
    ui.drawCellSet = new Set(res.cells);
    ui.error = null;
    ui.note = res.droppedCells > 0 ? `${fmtArea(res.droppedCells)} of land was cut off from the rest of your borders, so it was left out.` : null;
    if (!ui.name) ui.name = PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
    ui.preview = foundingPreview(res.cells);
  } else {
    ui.drawCells = null; ui.drawCellSet = null; ui.preview = null;
    ui.error = res.error; ui.note = null;
  }
}

function sampleShape() {
  const rng = mulberry32(Date.now() & 0xffffffff);
  for (let tries = 0; tries < 400; tries++) {
    const cx = 8 + rng() * (GRID_W - 16), cy = 7 + rng() * (GRID_H - 14);
    const rx = 6 + rng() * 4, ry = 4.5 + rng() * 3;
    const pts = [];
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2, wobble = 0.82 + 0.36 * rng();
      pts.push([cx + Math.cos(a) * rx * wobble, cy + Math.sin(a) * ry * wobble]);
    }
    const res = claimFromPath(world, pts);
    if (res.ok && res.droppedCells < 4 && res.cells.length >= 70) return res;
  }
  return { ok: false, error: "Couldn't find a good sample spot on this world. Draw by hand or try a new world." };
}

/* --- Actions --- */
function newWorld(seed) {
  ui.seed = seed;
  world = generateWorld(seed);
  resetTerrain(world);
  ui.drawCells = null; ui.drawCellSet = null; ui.preview = null; ui.error = null; ui.note = null;
}

function foundNation() {
  const name = cleanName(ui.name);
  game = setupGame(world, ui.drawCells, name, ui.seed);
  ui.gameId = newGameId();
  // the second step of the founding: divide the country into provinces (16m); time starts after it
  ui.phase = "provinces"; ui.tab = null; ui.tool = "select"; ui.provDraw = null;
  bumpMap();
  provFocusOwnLand();
}

function setLaw(law, value) {
  const n = game.nations[PLAYER];
  n.laws = { ...n.laws, [law]: law === "tax" ? Number(value) : value };
}

function quoteForCity(kind, cityId) {
  const city = game.cities.find(c => c.id === Number(cityId));
  if (!city) return;
  const q = kind === "port" ? quotePort(world, game, PLAYER, city) : quoteIrrigation(world, game, PLAYER, city);
  if (q.ok) { ui.pending = q; } else flashHint(q.reason);
}

function confirmBuild() {
  const q = ui.pending;
  if (!q) return;
  if (!canAfford(game.nations[PLAYER], economies()[PLAYER].gdp, q.cost).ok) return;
  orderProject(game, q, null);
  addChronicle(game, `You began work on ${q.label.charAt(0).toLowerCase()}${q.label.slice(1)} (${fmtMoney(q.cost)}).`, "neutral", PLAYER);
  ui.pending = null; ui.roadFrom = null;
  bumpMap();
}

async function endSeason() {
  if (ui.phase !== "play" || ui.dispatch || ui.ending || ui.play) return;
  ui.ending = true;
  RT.t = 0;
  startDeliberation();
  const d = deliberation;
  // never wait: if Claude has not answered for the rivals yet, their built-in rules decide this season
  if (d.status === "thinking") { if (d.controller) d.controller.abort(); d.status = "done"; }
  ui.seasonBefore = seasonBefore();
  if (!game || game !== d.gameRef || ui.phase !== "play") { ui.ending = false; renderAll(); return; }
  ui.pending = null; ui.roadFrom = null; ui.hoverQuote = null; ui.confirmWar = null; ui.confirmCancel = null; ui.compose = null;
  ui.hoverPath = null; ui.confirmDisband = false; ui.fleetHover = null;
  const before = motion.on ? snapshotForPlayback(game) : null;
  REC = before ? { events: [], phase: "pre", step: 0, sweep: 0 } : null;
  let dispatch;
  const backup = JSON.stringify(snapshot());
  try { dispatch = runSeason(world, game, { menus: d.menus, orders: d.orders }); }
  catch (err) {
    REC = null;
    try { console.error("Drawn Borders: the season could not be ended:", err); } catch (e) { /* no console */ }
    restore(JSON.parse(backup));
    ui.ending = false; ui.dispatch = null; ui.play = null;
    bumpMap(); renderAll();
    flashHint("Something went wrong while the season was ending, so the game went back to the start of the season. Changing your orders may help. Your save is safe.");
    startDeliberation();
    return;
  }
  finally { var events = REC ? REC.events : []; REC = null; }
  try { seasonPeopleNews(world, game, dispatch); } catch (err) { /* the news can wait */ }
  draftAssembly(game);
  if (before) startPlayback(before, events, dispatch); else { ui.lastPlayback = null; seasonShown(dispatch); }
  selectedDivs();
  bumpMap();
  const pn = game.nations[PLAYER];
  if (!pn.alive || pn.stability <= 0.5) {
    ui.phase = "collapsed";
    addChronicle(game, pn.alive ? `The government of ${pn.name} collapsed.` : `${pn.name} was conquered.`, "bad", PLAYER);
  }
  ui.ending = false;
  saveGame();
  seasonCheckpoint();
  renderAll();
  startDeliberation();
}

function startOver() {
  // the game you leave is not deleted: the next autosave keeps it as an "Earlier game"
  ui.gameId = null;
  if (deliberation && deliberation.controller) deliberation.controller.abort();
  deliberation = null;
  game = null;
  ui.phase = "draw"; ui.name = ""; ui.confirmRestart = false; ui.dispatch = null; ui.pending = null;
  ui.selectedCity = null; ui.selectedCell = -1; ui.tool = "select"; ui.sel = [];
  newWorld(randomSeed());
  bumpMap();
}

const ACTIONS = {
  sample: () => applyClaimResult(sampleShape()),
  "new-world": () => newWorld(randomSeed()),
  found: () => { if (ui.drawCells) foundNation(); },
  redraw: () => { ui.drawCells = null; ui.drawCellSet = null; ui.preview = null; },
  "end-season": () => endSeason(),
  "close-dispatch": () => { ui.dispatch = null; autoOpenDecision(); },
  "confirm-build": () => confirmBuild(),
  "cancel-build": () => { ui.pending = null; },
  "road-from": el => { ui.tool = "road"; ui.roadFrom = Number(el.dataset.city); ui.pending = null; },
  "quote-port": el => quoteForCity("port", el.dataset.city),
  "quote-irrigation": el => quoteForCity("irrigation", el.dataset.city),
  "quote-focus": el => {
    const city = game.cities.find(c => c.id === Number(el.dataset.city));
    if (!city) return;
    const q = quoteFocus(world, game, PLAYER, city, el.dataset.focus);
    if (q.ok) ui.pending = q; else flashHint(q.reason);
  },
  "quote-capital": el => {
    const city = game.cities.find(c => c.id === Number(el.dataset.city));
    if (!city) return;
    const q = quoteCapitalMove(world, game, PLAYER, city);
    if (q.ok) ui.pending = q; else flashHint(q.reason);
  },
  "restart-ask": () => { ui.confirmRestart = true; },
  "restart-cancel": () => { ui.confirmRestart = false; },
  "restart-now": () => startOver(),
  "open-letters": () => { ui.dispatch = null; ui.tab = "letters"; },
  compose: el => {
    const first = liveNations(game).find(n => !n.isPlayer);
    if (!first) return;
    ui.compose = newComposer(el.dataset.nid ? Number(el.dataset.nid) : first.id);
    ui.composeDirty = true;
  },
  "compose-close": () => { ui.compose = null; },
  "term-add": () => {
    const c = ui.compose;
    const t = readComposerTerm(c);
    if (!t) c.error = "Choose a town first.";
    else {
      const next = c.terms.concat([t]);
      const err = validateDeal(game, world, PLAYER, c.to, next);
      if (err) c.error = err; else { c.terms = next; c.error = null; }
    }
    ui.composeDirty = true;
  },
  "term-remove": el => { ui.compose.terms.splice(Number(el.dataset.i), 1); ui.compose.error = null; ui.composeDirty = true; },
  "send-letter": () => { sendLetter(); },
  "envoy-accept": el => answerEnvoy(Number(el.dataset.id), true),
  "envoy-decline": el => answerEnvoy(Number(el.dataset.id), false),
  "envoy-reply": el => {
    const it = game.inbox.find(x => x.id === Number(el.dataset.id));
    if (!it) return;
    ui.compose = newComposer(it.from, it.terms.filter(t => !validateDeal(game, world, PLAYER, it.from, [t])));
    ui.composeDirty = true;
  },
  "accept-counter": el => acceptCounterOffer(Number(el.dataset.id)),
  "declare-war-ask": el => { ui.confirmWar = Number(el.dataset.nid); },
  panel: el => { const p = el.dataset.p; ui.tab = ui.tab === p ? null : p; },
  "panel-close": () => { ui.tab = null; },
  "nation-view": el => { ui.openNation = Number(el.dataset.nid); ui.tab = "nations"; },
  "nation-open": el => { const id = Number(el.dataset.nid); ui.openNation = ui.openNation === id ? null : id; },
  "declare-war": el => playerDeclareWar(Number(el.dataset.nid)),
  "declare-war-cancel": () => { ui.confirmWar = null; },
  "cancel-treaty": el => { ui.confirmCancel = Number(el.dataset.id); },
  "cancel-treaty-confirm": el => playerCancelTreaty(Number(el.dataset.id)),
  "cancel-treaty-abort": () => { ui.confirmCancel = null; },
  minds: el => {
    ui.minds = el.dataset.value === "rules" ? "rules" : "claude";
    saveMindsSetting(ui.minds);
    ui.mindsNote = null;
    if (deliberation && deliberation.controller) deliberation.controller.abort();
    deliberation = null;
    startDeliberation();
  },
  "clear-sel": () => { ui.sel = []; ui.confirmDisband = false; },
  "halt-sel": () => haltSel(),
  "auto-sel": () => setSelAuto(true),
  "manual-sel": () => setSelAuto(false),
  "disband-ask": () => { ui.confirmDisband = true; },
  "disband-sel": () => disbandSel(),
  "select-div": el => { ui.sel = [Number(el.dataset.id)]; ui.confirmDisband = false; ui.fleetSel = []; },
  raise: el => playerRaise(el.dataset.type),
  stance: el => { game.nations[PLAYER].warPlan = { stance: el.dataset.value === "offensive" ? "offensive" : "defensive" }; },
  "all-auto": () => { game.divisions.forEach(d => { if (d.owner === PLAYER && !d.auto) { d.auto = true; d.path = []; } }); },
  "all-manual": () => { game.divisions.forEach(d => { if (d.owner === PLAYER) d.auto = false; }); },
  prio: el => {
    const n = game.nations[PLAYER];
    if (EQUIP[el.dataset.k] && PRIORITY[el.dataset.value] !== undefined) n.prod = { ...n.prod, [el.dataset.k]: el.dataset.value };
  },
  "air-mission": el => {
    const a = game.airwings.find(x => x.id === Number(el.dataset.id) && x.owner === PLAYER);
    if (a) a.mission = el.dataset.value === "reserve" ? "reserve" : "support";
  },
  "quote-industry": el => {
    const city = game.cities.find(c => c.id === Number(el.dataset.city));
    if (!city) return;
    const q = quoteIndustry(world, game, PLAYER, city, el.dataset.kind);
    if (q.ok) ui.pending = q; else flashHint(q.reason);
  },
  research: el => {
    const n = game.nations[PLAYER];
    if (!TECHS[el.dataset.tech] || !techAvailable(n, el.dataset.tech)) return;
    n.research = n.research || { target: null, progress: 0 };
    if (n.research.target && n.research.target !== el.dataset.tech) n.research.progress *= 0.5;   // half the work on the old project carries over
    n.research.queue = [el.dataset.tech];
    n.research.target = el.dataset.tech;
    n.research.auto = false;
  },
  "play-skip": () => { if (ui.play) ui.play.t = ui.play.end; },
  "play-speed": () => { motion.speed = motion.speed > 1 ? 1 : 2.5; },
  replay: () => replayLastSeason(),
  "motion-toggle": () => { motion.on = !motion.on; saveMotion(); },
  "zoom-in": () => zoomStep(1),
  "zoom-out": () => zoomStep(-1),
  "zoom-fit": () => zoomFit(),
  "skip-wait": () => {
    if (deliberation && deliberation.controller) deliberation.controller.abort();
    if (ui.skipWait) ui.skipWait();
  },
};

function answerEnvoy(id, accept) {
  const it = game.inbox.find(x => x.id === id);
  if (!it || it.status !== "open") return;
  const res = respondToEnvoy(game, world, it, accept);
  if (!res.ok) { flashHint(res.reason); return; }
  const from = nameOf(game, it.from);
  const what = it.kind === "call" ? (accept ? `You joined the ${from} in its war.` : `You refused to join the ${from}'s war.`)
    : `You ${accept ? "accepted" : "declined"} the ${from}'s ${it.threat ? "demand" : "proposal"}: ${termsText(game, it.terms)}.`;
  addChronicle(game, what, accept ? "neutral" : it.threat || it.kind === "call" ? "warn" : "neutral", PLAYER);
  bumpMap();
}

function setTool(tool) { ui.tool = tool; ui.roadFrom = null; ui.hoverQuote = null; ui.pending = null; ui.provDraw = null; quoteMemo.key = ""; }

