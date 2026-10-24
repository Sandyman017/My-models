/* =====================================================================
   20b. Saved games: in your Claude account, in this browser, and as files
   - Every action is saved in this browser at once (the autosave).
   - At the end of every season the game is also saved in your Claude account, when the game runs inside
     Claude, together with the season before it; so a new version, another browser or another computer
     never loses it.
   - Named saves (up to 10) can be made, loaded and deleted; any save can be exported as a file and loaded back.
   - Nothing is ever thrown away: a save that cannot be opened is kept aside, and starting a new game or
     loading another one keeps the game you leave in the list ("Earlier game", "Before loading").
   ===================================================================== */
Object.assign(ICONS, { save: giSvg("delapouite/save"), cloud: giSvg("delapouite/cloud-upload") });
const SAVE_FORMAT = "drawn-borders-save";
const SAVE_VERSION = 6;                         // version 5 saves (before version 18 of the game) load as they are
const GAME_BUILD = 39.2;
const LOCAL_KEYS = { auto: SAVE_KEY, earlier: "drawn-borders/save-earlier-raw", rescued: "drawn-borders/save-rescued", slots: "drawn-borders/slots", slot: "drawn-borders/slot/" };
const SAVE_LIMITS = { named: 10, earlier: 3, chunk: 200000 };
const SAVES = {
  cloud: null, uid: null,          // the account store, when the game runs inside Claude and you are signed in
  status: "local",                 // "local" | "cloud" | "cloud-error"
  index: null,                     // the account's list of saves
  localIndex: null,                // this browser's list of saves
  queue: Promise.resolve(),        // account writes, one after another
  dirty: false,                    // changed since the last account save
  localGameId: undefined,          // which game the browser autosave holds
  localHasGame: false,
  localHadSave: false,             // whether this browser had any save when the page opened
  notice: null,                    // a message for the Saves window
  lastCloudAt: null,
};

/* ---------- What a save holds ---------- */
function newGameId() { return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function saveMeta() {
  if (!game) return { nation: cleanName(ui.name || "") === "Unnamed Nation" ? "" : cleanName(ui.name || ""), turn: 0, when: "Founding", phase: ui.phase };
  const n = game.nations[PLAYER];
  return { nation: n.name, color: n.color, turn: game.turn, when: seasonLabel(game.turn), phase: ui.phase, alive: !!n.alive };
}
function snapshot() {
  return { format: SAVE_FORMAT, v: SAVE_VERSION, build: GAME_BUILD, gameId: ui.gameId || null, savedAt: new Date().toISOString(), meta: saveMeta(),
    seed: ui.seed, phase: ui.phase, name: ui.name, drawCells: ui.drawCells, game: serializeGame(game) };
}
function isSaveData(s) { return !!s && typeof s === "object" && (s.v === 5 || s.v === 6) && Number.isFinite(s.seed); }
function saveGameId(s) { return s ? s.gameId || (s.game ? `legacy-${s.seed}` : null) : null; }
function saveHasGame(s) { return !!(s && s.game && (s.phase === "play" || s.phase === "collapsed" || s.phase === "provinces")); }
function metaOfSave(s) {
  if (s && s.meta) return s.meta;
  const n = s && s.game && s.game.nations && s.game.nations[PLAYER];
  return n ? { nation: n.name, color: n.color, turn: s.game.turn, when: seasonLabel(s.game.turn), phase: s.phase, alive: !!n.alive } : { nation: (s && s.name) || "", turn: 0, when: "Founding", phase: s ? s.phase : "draw" };
}

/* ---------- Packing: gzip and base64, so a long game fits the account's documents ---------- */
function bytesToB64(buf) {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBytes(b64) {
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
async function packSave(obj) {
  const json = typeof obj === "string" ? obj : JSON.stringify(obj);
  if (typeof CompressionStream === "undefined") return "J" + json;
  const buf = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  return "G" + bytesToB64(buf);
}
async function unpackSave(str) {
  if (typeof str !== "string" || !str) throw new Error("empty save");
  if (str[0] === "J") return JSON.parse(str.slice(1));
  if (str[0] === "G") {
    if (typeof DecompressionStream === "undefined") throw new Error("this browser cannot open compressed saves");
    const text = await new Response(new Blob([b64ToBytes(str.slice(1))]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    return JSON.parse(text);
  }
  if (str[0] === "{") return JSON.parse(str);
  throw new Error("unknown save format");
}

/* ---------- This browser ---------- */
function localGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function localSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } }
function localDel(key) { try { localStorage.removeItem(key); } catch (e) { /* storage unavailable */ } }
function readLocalIndex() {
  if (SAVES.localIndex) return SAVES.localIndex;
  let idx = null;
  try { idx = JSON.parse(localGet(LOCAL_KEYS.slots) || "null"); } catch (e) { idx = null; }
  SAVES.localIndex = idx && idx.slots ? idx : { slots: {} };
  return SAVES.localIndex;
}
const LocalSlots = {
  where: "browser",
  async list() { return Object.values(readLocalIndex().slots); },
  async write(id, info, packed) {
    if (!localSet(LOCAL_KEYS.slot + id, packed)) throw new Error("This browser's storage is full or turned off.");
    const idx = readLocalIndex();
    idx.slots[id] = { ...info, id, bytes: packed.length };
    localSet(LOCAL_KEYS.slots, JSON.stringify(idx));
  },
  async read(id) { const p = localGet(LOCAL_KEYS.slot + id); if (!p) throw new Error("This save is missing from the browser."); return p; },
  async remove(id) { const idx = readLocalIndex(); delete idx.slots[id]; localSet(LOCAL_KEYS.slots, JSON.stringify(idx)); localDel(LOCAL_KEYS.slot + id); },
  async move(from, to, patch) {
    const idx = readLocalIndex();
    const s = idx.slots[from];
    if (!s) return;
    const p = localGet(LOCAL_KEYS.slot + from);
    if (p === null) return;
    if (idx.slots[to]) await this.remove(to);
    localSet(LOCAL_KEYS.slot + to, p);
    idx.slots[to] = { ...s, ...patch, id: to };
    delete idx.slots[from];
    localDel(LOCAL_KEYS.slot + from);
    localSet(LOCAL_KEYS.slots, JSON.stringify(idx));
  },
};

/* ---------- Your Claude account (the artifact's private per-person storage) ---------- */
function cloudPath(id) { return `data/users/${SAVES.uid}/${id}`; }
async function cloudIndex(fresh) {
  if (!fresh && SAVES.index) return SAVES.index;
  const snap = await SAVES.cloud.doc(cloudPath("saveindex")).get();
  const data = snap.exists ? snap.data() : null;
  SAVES.index = { slots: { ...((data && data.slots) || {}) } };
  return SAVES.index;
}
async function cloudPutIndex(idx) {
  await SAVES.cloud.doc(cloudPath("saveindex")).set({ slots: idx.slots, updated: new Date().toISOString() });
  SAVES.index = idx;
}
const CloudSlots = {
  where: "account",
  async list() { return Object.values((await cloudIndex()).slots); },
  // the pieces go up first under a new name; only then does the list point at them, so a broken upload never spoils a save
  async write(id, info, packed) {
    const gen = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const parts = [];
    for (let k = 0; k * SAVE_LIMITS.chunk < packed.length; k++) {
      const pid = `sp-${id}-${gen}-${k}`;
      await SAVES.cloud.doc(cloudPath(pid)).set({ d: packed.slice(k * SAVE_LIMITS.chunk, (k + 1) * SAVE_LIMITS.chunk) });
      parts.push(pid);
    }
    const idx = await cloudIndex(true);
    const old = idx.slots[id];
    idx.slots[id] = { ...info, id, parts, bytes: packed.length };
    await cloudPutIndex(idx);
    if (old && old.parts) for (const pid of old.parts) { try { await SAVES.cloud.doc(cloudPath(pid)).delete(); } catch (e) { /* left over, harmless */ } }
  },
  async read(id) {
    const idx = await cloudIndex(true);
    const s = idx.slots[id];
    if (!s || !s.parts) throw new Error("This save is no longer in your account.");
    let packed = "";
    for (const pid of s.parts) {
      const snap = await SAVES.cloud.doc(cloudPath(pid)).get();
      if (!snap.exists) throw new Error("Part of this save is missing.");
      packed += snap.data().d;
    }
    return packed;
  },
  async remove(id) {
    const idx = await cloudIndex(true);
    const s = idx.slots[id];
    if (!s) return;
    delete idx.slots[id];
    await cloudPutIndex(idx);
    for (const pid of s.parts || []) { try { await SAVES.cloud.doc(cloudPath(pid)).delete(); } catch (e) { /* harmless */ } }
  },
  // renaming a save only changes the list; its pieces stay where they are
  async move(from, to, patch) {
    const idx = await cloudIndex(true);
    const s = idx.slots[from];
    if (!s) return;
    const gone = idx.slots[to];
    idx.slots[to] = { ...s, ...patch, id: to };
    delete idx.slots[from];
    await cloudPutIndex(idx);
    if (gone && gone !== s) for (const pid of gone.parts || []) { try { await SAVES.cloud.doc(cloudPath(pid)).delete(); } catch (e) { /* harmless */ } }
  },
};
function slotStore() { return SAVES.status === "cloud" ? CloudSlots : LocalSlots; }
function cloudQueue(job) {
  const run = SAVES.queue.then(job, job);
  SAVES.queue = run.catch(() => {});
  return run;
}
function cloudErrorText(e) {
  const code = e && e.code;
  if (code === "quota_exceeded") return "Your account's save space for this game is full. Delete a few saves.";
  if (code === "invalid_argument") return "Your account doesn't let this page save (you may only have view access).";
  if (code === "resource_exhausted") return "Saving too often; it will try again next season.";
  if (code === "revoked" || code === "not_granted" || code === "capability_disabled" || code === "capability_removed") return "Saving to your account isn't available here.";
  return "Couldn't reach your account just now; the game is still saved in this browser.";
}

/* ---------- The autosave ---------- */
function saveGame() {
  const s = snapshot();
  const id = s.gameId;
  // a different game is about to replace the browser's autosave: keep that game first
  if (SAVES.localGameId !== undefined && SAVES.localGameId !== id && SAVES.localHasGame) {
    const old = localGet(LOCAL_KEYS.auto);
    if (old) { localSet(LOCAL_KEYS.earlier, old); keepEarlierLocal(); }
  }
  localSet(LOCAL_KEYS.auto, JSON.stringify(s));
  SAVES.localGameId = id;
  SAVES.localHasGame = saveHasGame(s);
  SAVES.dirty = true;
}
// the earlier game goes into the list of saves (compressed), then the raw copy is dropped
async function keepEarlierLocal() {
  const raw = localGet(LOCAL_KEYS.earlier);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (!saveHasGame(data)) { localDel(LOCAL_KEYS.earlier); return; }
    const meta = metaOfSave(data);
    const id = `earlier-${saveGameId(data) || Date.now().toString(36)}`;
    await LocalSlots.write(id, { name: `Earlier game: ${meta.nation}`, kind: "earlier", ...meta, gameId: saveGameId(data), savedAt: data.savedAt || new Date().toISOString(), build: data.build || 17 }, await packSave(raw));
    await trimEarlier(LocalSlots);
    localDel(LOCAL_KEYS.earlier);
    if (SAVES.status === "cloud") cloudQueue(async () => {
      const idx = await cloudIndex(true);
      if (!idx.slots[id]) { await CloudSlots.write(id, { ...readLocalIndex().slots[id] }, await packSave(raw)); await trimEarlier(CloudSlots); }
    }).catch(() => {});
  } catch (e) { /* the raw copy stays until it can be kept */ }
}
async function trimEarlier(store) {
  const earlier = (await store.list()).filter(s => s.kind === "earlier").sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  for (const s of earlier.slice(SAVE_LIMITS.earlier)) await store.remove(s.id);
}

/* At the end of every season: the account gets this season, and keeps the one before it. */
function seasonCheckpoint(force) {
  if (!game || ui.phase === "draw") return;
  if (!force && !window.__classicTurns && !RT.paused && Date.now() - (SAVES.lastCheckpoint || 0) < 20000) { SAVES.dirty = true; return; }   // at most every 20 seconds while time runs
  SAVES.lastCheckpoint = Date.now();
  if (SAVES.status === "cloud") cloudAutosave(true);
}
function cloudAutosave(rotate) {
  if (SAVES.status !== "cloud" || !game || ui.phase === "draw") return Promise.resolve();
  const s = snapshot();
  SAVES.dirty = false;
  return cloudQueue(async () => {
    const idx = await cloudIndex(true);
    const auto = idx.slots.auto;
    const meta = metaOfSave(s);
    // the account's autosave belongs to another game: keep it as an earlier game
    if (auto && auto.gameId && auto.gameId !== s.gameId) {
      await CloudSlots.move("auto", `earlier-${auto.gameId}`, { kind: "earlier", name: `Earlier game: ${auto.nation || "?"}` });
      if (idx.slots["auto-prev"]) await CloudSlots.remove("auto-prev");
      await trimEarlier(CloudSlots);
    } else if (rotate && auto && auto.turn < meta.turn) {
      await CloudSlots.move("auto", "auto-prev", { kind: "prev", name: "One season earlier" });
    }
    await CloudSlots.write("auto", { name: "Autosave", kind: "auto", ...meta, gameId: s.gameId, savedAt: s.savedAt, build: GAME_BUILD }, await packSave(s));
    if (s.gameId && (await cloudIndex()).slots[`earlier-${s.gameId}`]) await CloudSlots.remove(`earlier-${s.gameId}`);
    if (s.gameId && readLocalIndex().slots[`earlier-${s.gameId}`]) await LocalSlots.remove(`earlier-${s.gameId}`);
    SAVES.lastCloudAt = s.savedAt;
    SAVES.status = "cloud";
  }).catch(e => { SAVES.dirty = true; SAVES.notice = cloudErrorText(e); if (e && ["invalid_argument", "revoked", "not_granted", "capability_disabled", "capability_removed"].includes(e.code)) SAVES.status = "cloud-error"; renderSavesQuiet(); });
}

/* ---------- Opening the game: the browser's autosave first, then the account's, whichever is newer ---------- */
function readLocalAutosave() {
  const raw = localGet(LOCAL_KEYS.auto);
  SAVES.localHadSave = !!raw;
  if (!raw) return { data: null, raw: null, bad: false };
  try {
    const data = JSON.parse(raw);
    if (!isSaveData(data)) return { data: null, raw, bad: true };
    return { data, raw, bad: false };
  } catch (e) { return { data: null, raw, bad: true }; }
}
// a save this version cannot open is put aside, never overwritten
function rescueLocal(raw, why) {
  if (!raw) return;
  try { console.warn("Drawn Borders: the last save could not be opened:", why); } catch (e) { /* no console */ }
  localSet(LOCAL_KEYS.rescued, raw);
  localDel(LOCAL_KEYS.auto);
  SAVES.localGameId = null; SAVES.localHasGame = false;
  SAVES.notice = "Your last game could not be opened by this version. It is kept safe below: export it as a file and send it to Claude so it can be fixed.";
}
function openLocalAutosave(hotData) {
  const local = readLocalAutosave();
  let saved = isSaveData(hotData) ? hotData : local.data;
  if (local.bad) rescueLocal(local.raw, "the file is damaged");
  try { restore(saved); }
  catch (e) {
    if (saved === local.data) rescueLocal(local.raw, String((e && e.message) || e).slice(0, 80));
    saved = null;
    restore(null);
  }
  SAVES.localGameId = saved ? saveGameId(saved) : null;
  SAVES.localHasGame = saveHasGame(saved);
  SAVES.loadedSavedAt = saved ? saved.savedAt || null : null;
  if (localGet(LOCAL_KEYS.earlier)) keepEarlierLocal();
}
async function initSaves() {
  if (SAVES.started) return;
  SAVES.started = true;
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && SAVES.dirty) cloudAutosave(false); });
  if (!window.claude || typeof window.claude.use !== "function") return;
  try {
    const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
    if (!db || !user) return;
    const uid = await user.id();
    if (!uid) return;
    SAVES.cloud = db; SAVES.uid = uid;
    const idx = await cloudIndex(true);
    SAVES.status = "cloud";
    // saves made in this browser before (named or earlier games) are copied up once
    for (const s of Object.values(readLocalIndex().slots)) {
      if (idx.slots[s.id]) continue;
      try { await CloudSlots.write(s.id, { ...s }, await LocalSlots.read(s.id)); } catch (e) { /* stays in the browser */ }
    }
    await adoptAccountAutosave(idx.slots.auto || null);
  } catch (e) {
    SAVES.status = SAVES.cloud ? "cloud-error" : "local";
    SAVES.notice = cloudErrorText(e);
  }
  renderSavesQuiet();
}
async function adoptAccountAutosave(auto) {
  const here = game && ui.phase !== "draw";
  if (!auto) { if (here) cloudAutosave(false); return; }
  const same = here && auto.gameId === ui.gameId;
  const newerSame = same && auto.turn > game.turn;
  const newerOther = here && !same && auto.savedAt && (!SAVES.loadedSavedAt || auto.savedAt > SAVES.loadedSavedAt);
  const nothingHere = !here && !SAVES.localHadSave;
  if (newerSame || newerOther || nothingHere) {
    try {
      const data = await unpackSave(await CloudSlots.read("auto"));
      if (await loadSaveData(data, { quiet: true })) flashHint(`Continued ${metaOfSave(data).nation || "your game"} (${metaOfSave(data).when}) from your Claude account`);
    } catch (e) { SAVES.notice = "Your account's autosave could not be opened; it is kept there."; }
  } else if (here && (!same || auto.turn < game.turn)) cloudAutosave(false);
}

/* ---------- Loading, saving by name, files ---------- */
function resetForLoad() {
  if (deliberation && deliberation.controller) deliberation.controller.abort();
  deliberation = null;
  game = null;
  ui.phase = "draw"; ui.name = "";
  Object.assign(ui, { dispatch: null, pending: null, selectedCity: null, selectedCell: -1, tool: "select", sel: [], decision: null, play: null, stats: null, asm: null,
    compose: null, waiting: false, roadFrom: null, confirmRestart: false, hoverQuote: null, confirmWar: null, confirmCancel: null, hoverPath: null, tab: null, ending: false });
}
async function loadSaveData(data, opts = {}) {
  if (!isSaveData(data)) { SAVES.notice = "That isn't a Drawn Borders save."; renderSavesQuiet(); return false; }
  const back = game && ui.phase !== "draw" ? snapshot() : null;
  // the game being left is kept: another game is kept as an "Earlier game" by the autosave itself; an older
  // save of this same game would replace your progress, so that progress is kept as "Before loading"
  if (back && !opts.quiet && saveGameId(data) === back.gameId) await keepBeforeLoading(back);
  resetForLoad();
  try { restore(data); }
  catch (e) {
    try { if (back) restore(back); else restore(null); } catch (e2) { restore(null); }
    SAVES.notice = `That save could not be opened (${String((e && e.message) || e).slice(0, 80)}). Nothing was changed.`;
    bumpMap(); renderAll(); return false;
  }
  SAVES.loadedSavedAt = data.savedAt || null;
  saveGame();
  bumpMap();
  renderAll();
  if (ui.phase === "play") startDeliberation();
  return true;
}
async function keepBeforeLoading(s) {
  const meta = metaOfSave(s);
  const info = { name: "Before loading", kind: "backup", ...meta, gameId: s.gameId, savedAt: s.savedAt, build: GAME_BUILD };
  try { const packed = await packSave(s); await (SAVES.status === "cloud" ? cloudQueue(() => CloudSlots.write("before-load", info, packed)) : LocalSlots.write("before-load", info, packed)); }
  catch (e) { /* the browser autosave still holds it */ }
}
async function saveNamed(name) {
  if (!game || ui.phase === "draw") return;
  const store = slotStore();
  const named = (await store.list()).filter(s => s.kind === "manual");
  if (named.length >= SAVE_LIMITS.named) { SAVES.notice = `You have ${SAVE_LIMITS.named} saves already. Delete one to make room.`; renderSavesQuiet(); return; }
  const s = snapshot();
  const meta = metaOfSave(s);
  const label = cleanName(name || `${meta.nation}, ${meta.when}`).slice(0, 40);
  const id = `m-${Date.now().toString(36)}`;
  ui.saves.busy = true; renderSavesQuiet();
  try {
    const packed = await packSave(s);
    if (store === CloudSlots) await cloudQueue(() => CloudSlots.write(id, { name: label, kind: "manual", ...meta, gameId: s.gameId, savedAt: s.savedAt, build: GAME_BUILD }, packed));
    else await LocalSlots.write(id, { name: label, kind: "manual", ...meta, gameId: s.gameId, savedAt: s.savedAt, build: GAME_BUILD }, packed);
    SAVES.notice = `Saved "${label}".`;
  } catch (e) { SAVES.notice = store === CloudSlots ? cloudErrorText(e) : String((e && e.message) || e); }
  ui.saves.busy = false; ui.saves.name = "";
  renderSavesQuiet();
}
async function readSlotData(id) {
  if (id === "local-auto") { const l = readLocalAutosave(); if (!l.data) throw new Error("No autosave in this browser."); return l.data; }
  if (id === "rescued") { const raw = localGet(LOCAL_KEYS.rescued); if (!raw) throw new Error("Nothing kept aside."); return JSON.parse(raw); }
  const store = SAVES.status === "cloud" && (await cloudIndex()).slots[id] ? CloudSlots : LocalSlots;
  return unpackSave(await store.read(id));
}
async function loadSlot(id) {
  ui.saves.busy = true; renderSavesQuiet();
  try {
    const data = await readSlotData(id);
    if (await loadSaveData(data)) { ui.saves = null; flashHint(`Loaded ${metaOfSave(data).nation || "the game"}, ${metaOfSave(data).when}`); }
  } catch (e) { SAVES.notice = `That save could not be read: ${String((e && e.message) || e).slice(0, 100)}`; }
  if (ui.saves) { ui.saves.busy = false; ui.saves.confirm = null; }
  renderAll();
}
async function deleteSlot(id) {
  ui.saves.busy = true; renderSavesQuiet();
  try {
    if (id === "rescued") localDel(LOCAL_KEYS.rescued);
    else {
      if (SAVES.status === "cloud" && (await cloudIndex()).slots[id]) await cloudQueue(() => CloudSlots.remove(id));
      if (readLocalIndex().slots[id]) await LocalSlots.remove(id);
    }
  } catch (e) { SAVES.notice = cloudErrorText(e); }
  ui.saves.busy = false; ui.saves.confirm = null;
  renderSavesQuiet();
}
function fileNameFor(meta) {
  const slug = t => String(t || "").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 40) || "game";
  return `drawn-borders-${slug(meta.nation)}-${slug(meta.when)}.json`;
}
async function exportSave(id) {
  ui.saves.busy = true; renderSavesQuiet();
  try {
    const data = id === "current" ? snapshot() : await readSlotData(id);
    const meta = metaOfSave(data);
    const file = JSON.stringify({ format: SAVE_FORMAT, v: data.v, build: data.build || GAME_BUILD, savedAt: data.savedAt || new Date().toISOString(), meta, data: await packSave(data) });
    const name = fileNameFor(meta);
    const dl = window.claude && typeof window.claude.use === "function" ? await window.claude.use("downloads") : null;
    if (window.desktop) {
      // the Windows program: straight into the game's own Saves folder, no download dialog
      const where = await window.desktop.saveFile(name, file);
      SAVES.notice = `Saved the file ${name} in ${where}.`;
    } else if (dl) {
      try { await dl.save({ filename: name, data: file }); SAVES.notice = `Saved the file ${name}.`; }
      catch (e) { SAVES.notice = e && e.code === "declined" ? "The download was cancelled." : "The file couldn't be saved here."; }
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([file], { type: "application/json" }));
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      SAVES.notice = `Saved the file ${name} to your downloads.`;
    }
  } catch (e) { SAVES.notice = `Couldn't export: ${String((e && e.message) || e).slice(0, 100)}`; }
  ui.saves.busy = false;
  renderSavesQuiet();
}
async function importSaveFile(file) {
  if (!file) return;
  ui.saves.busy = true; renderSavesQuiet();
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    const data = obj && obj.format === SAVE_FORMAT && typeof obj.data === "string" ? await unpackSave(obj.data) : obj;
    if (!isSaveData(data)) throw new Error("this file isn't a Drawn Borders save");
    if (await loadSaveData(data)) { ui.saves = null; flashHint(`Loaded ${metaOfSave(data).nation || "the game"}, ${metaOfSave(data).when} from the file`); }
  } catch (e) { if (ui.saves) SAVES.notice = `That file could not be opened: ${String((e && e.message) || e).slice(0, 100)}`; }
  if (ui.saves) ui.saves.busy = false;
  renderAll();
}

/* ---------- The Saves window ---------- */
function openSaves() {
  ui.saves = { busy: false, confirm: null, name: "", list: null };
  SAVES.notice = SAVES.notice && /could not|couldn't|full|isn't/i.test(SAVES.notice) ? SAVES.notice : null;
  refreshSaveList();
}
async function refreshSaveList() {
  if (!ui.saves) return;
  const rows = [];
  const local = readLocalAutosave();
  try {
    if (SAVES.status === "cloud") for (const s of Object.values((await cloudIndex(true)).slots)) rows.push({ ...s, where: "account" });
  } catch (e) { SAVES.notice = cloudErrorText(e); }
  for (const s of Object.values(readLocalIndex().slots)) if (!rows.some(r => r.id === s.id)) rows.push({ ...s, where: "browser" });
  const accountAuto = rows.find(r => r.id === "auto");
  const sameAsAccount = accountAuto && local.data && accountAuto.gameId === saveGameId(local.data) && accountAuto.turn === metaOfSave(local.data).turn;
  if (local.data && saveHasGame(local.data) && !sameAsAccount) rows.push({ id: "local-auto", name: SAVES.status === "cloud" ? "Autosave in this browser" : "Autosave", kind: "local", ...metaOfSave(local.data), savedAt: local.data.savedAt || null, where: "browser", gameId: saveGameId(local.data) });
  const rescued = localGet(LOCAL_KEYS.rescued);
  if (rescued) { let m = {}; try { m = metaOfSave(JSON.parse(rescued)); } catch (e) { m = { nation: "?", when: "" }; } rows.push({ id: "rescued", name: "Could not be opened", kind: "rescued", ...m, where: "browser" }); }
  const order = { auto: 0, local: 1, prev: 2, manual: 3, backup: 4, earlier: 5, rescued: 6 };
  rows.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
  if (ui.saves) { ui.saves.list = rows; renderSavesQuiet(); }
}
function savedWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  if (isNaN(d)) return "";
  const mins = Math.round((now - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `today ${hm}`;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}, ${hm}`;
}
function saveRowHtml(s) {
  const busy = ui.saves.busy ? "disabled" : "";
  const sameGame = game && s.gameId && s.gameId === ui.gameId;
  const playingIt = sameGame && (s.kind === "auto" || s.kind === "local") && game && s.turn === game.turn;
  const canLoad = s.kind !== "rescued" && !playingIt;
  const canDelete = ["manual", "earlier", "backup", "rescued"].includes(s.kind);
  const conf = ui.saves.confirm;
  const label = { auto: "Autosave", prev: "One season earlier", local: s.name, manual: s.name, backup: "Before loading", earlier: s.name, rescued: "Could not be opened" }[s.kind] || s.name;
  const where = s.where === "account" ? "in your account" : "in this browser";
  const actions = conf && conf.id === s.id
    ? `<span class="save-ask">${conf.what === "load" ? (game && ui.phase !== "draw" ? "Load it? The game you're playing is kept as “Before loading”." : "Load it?") : "Delete this save for good?"}</span>
       <button class="btn ${conf.what === "delete" ? "danger" : "primary"}" type="button" data-action="${conf.what === "load" ? "save-load-go" : "save-delete-go"}" data-id="${escapeHtml(s.id)}" ${busy}>${conf.what === "load" ? "Load" : "Delete"}</button>
       <button class="btn" type="button" data-action="save-cancel" ${busy}>Cancel</button>`
    : `${canLoad ? `<button class="btn" type="button" data-action="save-load" data-id="${escapeHtml(s.id)}" ${busy}>Load</button>` : ""}
       <button class="btn" type="button" data-action="save-export" data-id="${escapeHtml(s.id)}" ${busy}>Export</button>
       ${canDelete ? `<button class="btn" type="button" data-action="save-delete" data-id="${escapeHtml(s.id)}" ${busy} aria-label="Delete">Delete</button>` : ""}`;
  return `<li class="save-row ${s.kind === "rescued" ? "bad" : ""}">
    <span class="crest" style="background:${escapeHtml(s.color || "#6b675e")}"></span>
    <div class="save-main"><strong>${escapeHtml(label)}</strong>
      <span class="muted small">${escapeHtml([s.nation, s.when].filter(Boolean).join(" · "))}${s.savedAt ? ` · saved ${escapeHtml(savedWhen(s.savedAt))}` : ""} · ${where}${playingIt ? " · the game you're playing" : ""}</span></div>
    <div class="actions">${actions}</div></li>`;
}
function savesHtml() {
  const S = ui.saves;
  const busy = S.busy ? "disabled" : "";
  const store = SAVES.status === "cloud"
    ? `<p class="save-where good">${ICONS.cloud} Saved in your Claude account at the end of every season. Your saves follow you to any browser or computer where you open this game.</p>`
    : window.desktop
      ? `<p class="save-where good">${ICONS.cloud} Saved on this computer at the end of every season. Export a file to keep an extra copy in ${escapeHtml(window.desktop.savesFolder)}.</p>`
    : SAVES.status === "cloud-error"
      ? `<p class="save-where warn">${ICONS.cloud} Your Claude account couldn't take saves just now, so they are kept in this browser. Export a file to keep a safe copy.</p>`
      : `<p class="save-where warn">${ICONS.cloud} Saves are kept in this browser only${window.claude ? "" : " (this copy of the game runs outside Claude)"}. Export a file to keep a safe copy.</p>`;
  const playing = game && ui.phase !== "draw";
  const named = (S.list || []).filter(s => s.kind === "manual").length;
  const defName = playing ? `${game.nations[PLAYER].name}, ${seasonLabel(game.turn)}` : "";
  return `<div class="dispatch saves" role="dialog" aria-modal="true" aria-labelledby="saves-title">
    <div class="saves-head"><div class="block" style="gap:4px"><span class="eyebrow">Drawn Borders</span><h2 id="saves-title">Saved games</h2></div>
      <button class="panel-close" type="button" data-action="saves-close" aria-label="Close" title="Close (Esc)">×</button></div>
    ${store}
    ${SAVES.notice ? `<p class="notice ${/^(Saved|Loaded)/.test(SAVES.notice) ? "good" : /cancelled/.test(SAVES.notice) ? "info" : ""}">${escapeHtml(SAVES.notice)}</p>` : ""}
    <div class="save-new">
      ${playing ? `<input id="save-name" type="text" maxlength="40" placeholder="${escapeHtml(defName)}" value="${escapeHtml(S.name || "")}" aria-label="Name for this save">
      <button class="btn primary" type="button" data-action="save-named" ${busy || (named >= SAVE_LIMITS.named ? "disabled" : "")}>Save this game</button>` : `<span class="muted small">Found a nation to start saving.</span>`}
      <span class="spacer"></span>
      ${playing ? `<button class="btn" type="button" data-action="save-export" data-id="current" ${busy}>Export to file</button>` : ""}
      <label class="btn file-btn ${S.busy ? "disabled" : ""}">Load from file<input type="file" id="save-file" accept=".json,application/json" ${busy}></label>
    </div>
    <ul class="save-list">${S.list === null ? `<li class="muted small">Looking for your saves…</li>` : S.list.length ? S.list.map(saveRowHtml).join("") : `<li class="muted small">No saves yet.</li>`}</ul>
    <p class="muted small">${named}/${SAVE_LIMITS.named} named saves. The autosave keeps the season before as a backup; a game you leave is kept as “Earlier game”.</p>
  </div>`;
}
function renderSaves() {
  const el = document.getElementById("saves");
  if (!el) return;
  if (!ui.saves) { if (!el.hidden) { el.hidden = true; el.innerHTML = ""; } return; }
  const focused = document.activeElement && document.activeElement.id === "save-name";
  const caret = focused ? document.activeElement.selectionStart : null;
  const again = !el.hidden;
  el.hidden = false;
  el.innerHTML = savesHtml();
  if (again) { const card = el.querySelector(".dispatch"); if (card) card.classList.add("again"); }
  if (focused) { const inp = document.getElementById("save-name"); if (inp) { inp.focus(); inp.setSelectionRange(caret, caret); } }
}
function renderSavesQuiet() { if (ui.saves) renderSaves(); }
const SAVE_ACTIONS = {
  "saves-open": () => openSaves(),
  "saves-close": () => { ui.saves = null; },
  "save-named": () => { const inp = document.getElementById("save-name"); saveNamed(inp ? inp.value : ""); },
  "save-load": el => { ui.saves.confirm = { id: el.dataset.id, what: "load" }; },
  "save-delete": el => { ui.saves.confirm = { id: el.dataset.id, what: "delete" }; },
  "save-cancel": () => { ui.saves.confirm = null; },
  "save-load-go": el => { loadSlot(el.dataset.id); },
  "save-delete-go": el => { deleteSlot(el.dataset.id).then(refreshSaveList); },
  "save-export": el => { exportSave(el.dataset.id); },
};
function bindSaveInputs() {
  if (SAVES.bound) return;
  SAVES.bound = true;
  document.addEventListener("change", e => { if (e.target && e.target.id === "save-file") importSaveFile(e.target.files && e.target.files[0]); });
  document.addEventListener("input", e => { if (e.target && e.target.id === "save-name" && ui.saves) ui.saves.name = e.target.value; });
  document.addEventListener("keydown", e => { if (e.target && e.target.id === "save-name" && e.key === "Enter") { e.preventDefault(); saveNamed(e.target.value); } });
}

Object.assign(ACTIONS, SAVE_ACTIONS);
Object.assign(ACTIONS, NAVY_ACTIONS);

let gameStarted = false;
function start(hotData) {
  // until the game has started (it waits a moment for the map's photographs), a reload keeps what it was handed
  gameStarted = false;
  window.claude?.hot?.snapshot?.(() => (gameStarted ? snapshot() : hotData));
  loadTextures(() => startGame(hotData));
}
function startGame(hotData) {
  ui.minds = loadMindsSetting();
  motion.on = loadMotion();
  openLocalAutosave(hotData);
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("sample").then(fn => { sampleFn = fn || null; renderQuiet(); }).catch(() => { sampleFn = null; });
  }
  bumpMap();
  bindEvents();
  bindSaveInputs();
  resizeCanvas();
  renderAll();
  gameStarted = true;
  requestAnimationFrame(animationLoop);
  initSaves();
}

window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});

