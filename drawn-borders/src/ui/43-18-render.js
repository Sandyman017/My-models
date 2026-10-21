/* =====================================================================
   18. Render
   ===================================================================== */
const PANELS = [["realm", "crown", "Realm", "1"], ["cities", "city", "Cities", "c"], ["groups", "groups", "Groups", "p"], ["people", "toolbox", "People", "o"], ["cabinet", "cabinet", "Ministries", "m"], ["agenda", "flag", "Agenda", "2"], ["economy", "output", "Economy", "3"], ["army", "army", "Army", "4"], ["navy", "anchor", "Navy", "9"], ["selected", "select", "Inspect", "5"], ["nations", "globe", "Nations", "6"], ["letters", "mail", "Letters", "7"], ["chronicle", "scroll", "Log", "8"]];
function dockHtml() {
  const letters = game.inbox.filter(it => it.status === "open").length;
  const unread = assemblyUnread(game);
  const btn = (p, icon, label, key, badge) => `<button class="dock-btn ${ui.tab === p ? "on" : ""}" type="button" data-action="panel" data-p="${p}" data-label="${label} (${key.toUpperCase()})" aria-label="${label}" aria-pressed="${ui.tab === p}">${ICONS[icon]}${badge ? `<span class="badge">${badge}</span>` : ""}</button>`;
  return PANELS.map(([p, icon, label, key]) => btn(p, icon, label, key, p === "letters" ? letters : p === "agenda" ? myDecisions().length : p === "cabinet" ? cabinetBadge() : 0)).join("")
    + `<div class="dock-sep"></div>`
    + `<button class="dock-btn" type="button" data-action="stats-open" data-label="Statistics (I)" aria-label="Statistics">${ICONS.chart}</button>`
    + `<button class="dock-btn" type="button" data-action="asm-open" data-label="World Assembly (U)" aria-label="World Assembly">${ICONS.hall}${unread ? `<span class="badge">${unread}</span>` : ""}</button>`
    + `<button class="dock-btn" type="button" data-action="saves-open" data-label="Saved games (L)" aria-label="Saved games">${ICONS.save}</button>`;
}
function renderHud() {
  const hud = document.getElementById("hud");
  hud.innerHTML = hudHtml();
  hud.classList.toggle("play", !!game && ui.phase !== "draw");
  const dock = document.getElementById("dock");
  dock.hidden = !game || ui.phase !== "play";
  if (!dock.hidden) dock.innerHTML = dockHtml();
  const nav = document.getElementById("mapnav");
  if (!nav) return;
  nav.hidden = !game || ui.phase === "draw" || !!ui.play;
  if (nav.hidden) return;
  const unread = assemblyUnread(game);
  nav.innerHTML = `<button class="hud-statsbtn" type="button" data-action="stats-open" title="Statistics (I)">${ICONS.chart}Statistics <kbd>I</kbd></button>
    <button class="hud-statsbtn hud-asmbtn" type="button" data-action="asm-open" title="World Assembly (U)">${ICONS.hall}Assembly <kbd>U</kbd>${unread ? `<span class="badge" aria-label="${unread} with news">${unread}</span>` : ""}</button>`;
}
function renderSidebar() {
  renderSidebarInner();
  const ch = document.querySelector("#sidebar .chat");
  if (ch) ch.scrollTop = ch.scrollHeight;
}
function renderSidebarInner() {
  const sb = document.getElementById("sidebar");
  const scroll = sb.scrollTop;
  const html = sidebarHtml();
  const playing = ui.phase === "play";
  sb.hidden = !html || (playing && !ui.tab);
  sb.classList.toggle("founding", !playing);
  const opened = sb.dataset.panel !== String(ui.tab);
  sb.dataset.panel = String(ui.tab);
  const pend = ui.pending ? `${ui.pending.kind}|${ui.pending.label}` : "";
  const newPending = !!pend && sb.dataset.pending !== pend;
  sb.dataset.pending = pend;
  sb.innerHTML = html;
  sb.scrollTop = opened || newPending ? 0 : scroll;
}
function renderOverlays() {
  const playing = ui.phase === "play";
  const toolbar = document.getElementById("toolbar");
  toolbar.hidden = !playing;
  if (playing) toolbar.innerHTML = toolbarHtml();
  const hint = document.getElementById("map-hint");
  const ht = hintText();
  hint.hidden = !ht;
  hint.textContent = ht;
  const turnbox = document.getElementById("turnbox");
  turnbox.hidden = !playing;
  if (playing) turnbox.innerHTML = clockHtml();
  const cu = document.getElementById("comingup");
  const cuHtml = playing && game && !ui.dispatch ? comingUpHtml() : "";
  cu.hidden = !cuHtml;
  if (cuHtml) cu.innerHTML = cuHtml;
  const dc = document.getElementById("decision");
  const dec = playing && game && !ui.dispatch && !ui.waiting && !ui.play && !ui.stats && !ui.asm && !ui.saves && ui.decision ? game.decisions.find(x => x.id === ui.decision) : null;
  if (!dec) { if (!(ui.decision && (ui.dispatch || ui.stats || ui.asm || ui.play || ui.waiting || ui.saves))) ui.decision = null; dc.hidden = true; dc.innerHTML = ""; dc.dataset.id = ""; }
  else if (dc.hidden || dc.dataset.id !== String(dec.id)) {
    dc.hidden = false; dc.dataset.id = String(dec.id);
    dc.innerHTML = decisionHtml(dec);
    const first = dc.querySelector(".dec-opt");
    if (first) first.focus();
  }
  const pbar = document.getElementById("playbar");
  pbar.hidden = true;
  renderTimeOverlays();
  const mt = document.getElementById("motion-toggle");
  if (mt) { mt.classList.toggle("on", motion.on); mt.setAttribute("aria-pressed", String(motion.on)); }
  const cr = document.getElementById("credits");
  if (!ui.credits) { cr.hidden = true; cr.innerHTML = ""; }
  else if (cr.hidden) {
    cr.hidden = false; cr.innerHTML = creditsHtml();
    const b = document.getElementById("credits-close");
    if (b) b.focus();
  }
  const dp = document.getElementById("dispatch");
  const wasOpen = !dp.hidden;
  dp.hidden = !ui.dispatch;
  if (ui.dispatch && !wasOpen) {
    dp.innerHTML = dispatchHtml(ui.dispatch);
    const b = document.getElementById("dispatch-close");
    if (b) b.focus();
  }
  const wt = document.getElementById("waiting");
  wt.hidden = !ui.waiting;
  if (ui.waiting) wt.innerHTML = waitingHtml();
  const cp = document.getElementById("composer");
  if (!ui.compose || !playing) { cp.hidden = true; cp.innerHTML = ""; }
  else if (cp.hidden || ui.composeDirty) {
    const wasHidden = cp.hidden;
    cp.hidden = false;
    cp.innerHTML = composerHtml();
    ui.composeDirty = false;
    if (wasHidden) { const ta = document.getElementById("letter-text"); if (ta) ta.focus(); }
  }
  canvas.className = ui.phase === "draw" ? "tool-draw" : playing ? `tool-${ui.tool}${ui.sel.length || ui.fleetSel.length ? " has-sel" : ""}` : "";
}
function renderAll() {
  renderHud();
  renderSidebar();
  renderOverlays();
  renderMap();
  renderStats();
  renderAssembly();
  renderSaves();
}

