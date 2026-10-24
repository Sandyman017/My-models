/* =====================================================================
   17e. Time that runs: the season clock, speeds and pause; short news; your goals
   Like Hearts of Iron, WorldBox or OpenTTD, the world keeps moving while you play. Each season lasts a few
   seconds of real time; you can pause at any moment (Space), and the game pauses by itself when something
   needs you. Rivals think with Claude when there is time for it (speed 1, or while paused); otherwise their
   built-in rules decide, so you never wait.
   ===================================================================== */
const RT_LEN = [0, 36, 18, 8];                   // seconds of real time per season at speed 1, 2, 3
const RT = { speed: 1, paused: true, t: 0, last: 0, why: null, started: false };
try { const v = Number(localStorage.getItem("drawn-borders/speed")); if (v >= 1 && v <= 3) RT.speed = v; } catch (e) { /* storage unavailable */ }
function rtClaudeOK() { return RT.paused || RT.speed === 1; }
function rtBlocked() {
  return !game || ui.phase !== "play" || ui.ending || !!ui.dispatch || !!ui.decision || !!ui.stats || !!ui.asm || !!ui.saves || !!ui.compose || !!ui.credits || !!ui.waiting || document.hidden;
}
function rtTick(now) {
  const dt = RT.last ? Math.min(0.25, (now - RT.last) / 1000) : 0;
  RT.last = now;
  if (game && RT.game !== game) {   // a new game, or one just loaded: it starts paused
    RT.game = game; RT.paused = true; RT.started = false; RT.t = 0; RT.why = null;
    ui.news = startNewsItems(); ui.reports = []; ui.seenInbox = game.inbox.filter(it => it.status === "open").map(it => it.id);
    renderOverlays();
    return;
  }
  if (!game || ui.phase !== "play" || RT.paused || rtBlocked()) return;
  RT.t += dt;
  const fill = document.getElementById("clock-fill");
  if (fill) fill.style.width = `${Math.min(100, (RT.t / RT_LEN[RT.speed]) * 100)}%`;
  if (RT.t >= RT_LEN[RT.speed]) { RT.t = 0; endSeason(); }
}
function rtPause(why, act) {
  RT.paused = true;
  RT.why = why || null;
  RT.act = act || null;
  maybeThinkWithClaude();
  if (SAVES.dirty) seasonCheckpoint(true);
  renderOverlays();
}
function rtResume() {
  RT.paused = false; RT.why = null; RT.act = null; RT.started = true; RT.last = performance.now();
  renderOverlays();
}
function rtSetSpeed(v) {
  const frac = RT.t / RT_LEN[RT.speed];
  RT.speed = v;
  RT.t = frac * RT_LEN[v];
  try { localStorage.setItem("drawn-borders/speed", String(v)); } catch (e) { /* storage unavailable */ }
  if (RT.paused) rtResume(); else renderOverlays();
}
/* When you stop to think, the rivals get to think with Claude too. */
function maybeThinkWithClaude() {
  const d = deliberation;
  if (d && game && d.turn === game.turn && d.gameRef === game && !d.claudeTried) claudeDeliberate(d);
}

/* ---------- The clock in the corner ---------- */
function clockHtml() {
  const sp = [1, 2, 3].map(v => `<button type="button" class="${!RT.paused && RT.speed === v ? "on" : ""}" data-action="rt-speed" data-v="${v}" title="Speed ${v}: a season every ${RT_LEN[v]} seconds">${"▶".repeat(v)}</button>`).join("");
  return `<span class="season-chip" data-why="season" tabindex="0"><span class="wx">${weatherIcon(seasonWar(game))}</span>${seasonLabel(game.turn)}<small class="era">${ERAS[game.era || 0].name}</small></span>
    <div class="clock ${RT.paused ? "paused" : ""}">
      <button type="button" class="pausebtn ${RT.paused ? "on" : ""}" data-action="rt-pause" title="${RT.paused ? "Continue (Space)" : "Pause (Space)"}">${RT.paused ? "▶ Play" : "❚❚"}</button>
      <div class="speeds">${sp}</div>
      <button type="button" class="nextbtn" data-action="end-season" title="Go to the next season now">Next ⏭</button>
      <span class="clock-track"><span id="clock-fill" style="width:${Math.min(100, (RT.t / RT_LEN[RT.speed]) * 100)}%"></span></span>
    </div>`;
}
function pauseBannerHtml() {
  if (!game || ui.phase !== "play" || !RT.paused || ui.dispatch || ui.decision || ui.stats || ui.asm || ui.saves || ui.compose) return "";
  const why = RT.why || (RT.started ? "Paused." : "Time stands still until you start it.");
  const act = RT.act ? `<button class="btn" type="button" data-action="rt-act">${escapeHtml(RT.act.label)}</button>` : "";
  return `<span class="pb-ic">❚❚</span><span>${escapeHtml(why)}</span>${act}<button class="btn primary" type="button" data-action="rt-pause">${RT.started ? "Continue" : "Start time"} <kbd>Space</kbd></button>`;
}

/* ---------- Short news instead of the long report ---------- */
function shortLine(t, max = 110) {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  const parts = s.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [s];
  let out = "";
  for (const p of parts) { if (out && (out + p).length > max) break; out += p; }
  out = out.trim();
  if (out.length > max + 10) { out = out.slice(0, max); out = out.slice(0, out.lastIndexOf(" ")) + "…"; }
  return out;
}
function seasonHeadlines(d) {
  const g = game, P = g.nations[PLAYER], out = [];
  const add = (pri, icon, text, tone, act) => { if (text) out.push({ pri, icon, text: shortLine(text), tone: tone || "neutral", act: act || { report: true } }); };
  const mentionsMe = t => t.includes(P.name) || /\byou(r)?\b/i.test(t);
  for (const x of d.opening || []) add(x.tone === "good" ? 90 : 98, "shieldI", x.text, x.tone, { goals: true });
  for (const x of d.decisions || []) if (g.decisions.some(y => y.id === x.id)) add(92, "stability", `A decision: ${x.title}`, x.tone === "bad" ? "warn" : "neutral", { decision: x.id });
  const fresh = g.inbox.filter(it => it.status === "open" && !(ui.seenInbox || []).includes(it.id));
  for (const it of fresh) add(it.threat ? 96 : 88, "mail", `${it.threat ? "A demand" : "A letter"} from the ${nameOf(g, it.from)}`, it.threat ? "bad" : "neutral", { panel: "letters" });
  for (const it of g.inbox.filter(it => it.status === "info" && it.kind === "declaration" && it.turn >= g.turn - 1)) add(99, "army", `The ${nameOf(g, it.from)} declared war on you!`, "bad", { panel: "army" });
  const mine = (d.battles || []).filter(r => r.attacker === PLAYER || r.defender === PLAYER);
  if (mine.length) {
    const won = mine.filter(r => (r.attacker === PLAYER) === r.won).length;
    add(86, "army", `Your army fought ${mine.length} battle${mine.length > 1 ? "s" : ""}: ${won} won, ${mine.length - won} lost`, won >= mine.length - won ? "good" : "bad", { panel: "army" });
  }
  for (const t of d.war || []) add(mentionsMe(t) ? 84 : 58, "army", t, mentionsMe(t) ? "bad" : "neutral", { panel: "army" });
  for (const t of d.warnings || []) add(80, "flame", t, "bad", { report: true });
  for (const x of d.ambitions || []) add(76, "star", x.text, x.tone, { panel: "agenda" });
  for (const t of d.leader || []) add(72, "crown", t, "warn", { panel: "agenda" });
  for (const x of d.sea || []) add(x.tone === "bad" ? 78 : 48, "anchor", x.text, x.tone, { panel: "navy" });
  for (const x of d.built || []) add(66, /^Road/.test(x.text) ? "road" : /town/i.test(x.text) ? "town" : "output", x.text, x.tone === "bad" ? "bad" : "good", { panel: "realm" });
  for (const x of d.cabinet || []) add(x.tone === "bad" ? 74 : x.tone === "warn" ? 60 : 54, "cabinet", x.text, x.tone, { panel: "cabinet" });
  for (const x of d.firsts || []) add(x.nid === PLAYER ? 70 : 44, "star", x.text, x.nid === PLAYER ? "good" : "neutral", { panel: "agenda" });
  for (const x of d.economy || []) add(x.tone === "bad" ? 64 : x.tone === "good" ? 55 : 40, /harvest|food|granar/i.test(x.text) ? "food" : /moved|people/i.test(x.text) ? "people" : "output", x.text, x.tone, { panel: "economy" });
  for (const t of d.diplomacy || []) add(mentionsMe(t) ? 62 : 46, "globe", t, "neutral", { panel: "nations" });
  for (const x of d.trade || []) add(x.pause ? 94 : x.tone === "bad" ? 70 : x.tone === "warn" ? 62 : x.tone === "good" ? 52 : 40, "freighter", x.text, x.tone, { panel: "trade" });
  for (const a of d.abroad || []) {
    const t = `The ${nameOf(g, a.nid)}: ${a.text.charAt(0).toLowerCase()}${a.text.slice(1)}`;
    const big = /\bwar\b|civil war|collapsed|conquered|Grand Harbor|Railway|Academy|Stock Exchange|World's Fair|Monument|Atomic|Broadcasting|Fortresses|Great Dam/.test(a.text);
    add(mentionsMe(a.text) ? 26 : big ? 50 : 24, "globe", t, "neutral", { nation: a.nid });
  }
  for (const x of d.assembly || []) add(34, "hall", x.text, x.tone, { assembly: true });
  for (const x of d.people || []) add(x.tone === "bad" ? 66 : x.tone === "warn" ? 60 : 40, "people", x.text, x.tone, { panel: "people" });
  for (const x of d.groups || []) add(x.tone === "bad" ? 74 : x.tone === "warn" ? 70 : 48, "groups", x.text, x.tone, { panel: "groups" });
  for (const x of d.cities || []) add(x.tone === "bad" ? 68 : x.tone === "good" ? 53 : 42, "city", x.text, x.tone, { city: x.cityId });
  for (const x of d.villages || []) if (x.major) add(x.tone === "bad" ? 56 : 44, "town", x.text, x.tone, { cell: x.cell });   // a boom, a bust, ruins, a market (10w)
  out.sort((a, b) => b.pri - a.pri);
  const seen = new Set(), list = [];
  ui.newsSeen = ui.newsSeen || {};
  for (const x of out) {
    if (seen.has(x.text)) continue;
    seen.add(x.text);
    const key = x.text.replace(/[0-9.,$%MBk]+/g, "#");
    const last = ui.newsSeen[key];
    if (x.pri < 90 && last !== undefined && g.turn - last < 6) { x.repeat = true; continue; }
    ui.newsSeen[key] = g.turn;
    list.push(x);
  }
  return list;
}
function pushNews(list, d) {
  const g = game;
  ui.news = ui.news || [];
  ui.seenInbox = (ui.seenInbox || []).concat(g.inbox.filter(it => it.status === "open").map(it => it.id));
  const shown = list.filter(x => x.pri >= 30).slice(0, 5);
  const season = seasonLabel(Math.max(0, g.turn - 1));
  const items = shown.map((x, k) => ({ ...x, id: `${g.turn}-${k}`, season, turn: g.turn }));
  const rest = list.length - shown.length;
  if (shown.length && rest) items.push({ id: `${g.turn}-more`, icon: "scroll", text: `${rest} more in the season report`, tone: "neutral", act: { report: true }, season, turn: g.turn, more: true });
  if (!shown.length) items.push({ id: `${g.turn}-quiet`, icon: "scroll", text: rest ? `A quiet season (${rest} small item${rest === 1 ? "" : "s"} in the report)` : "A quiet season", tone: "neutral", act: { report: true }, season, turn: g.turn, more: true });
  ui.news = items.concat(ui.news).slice(0, 40);
  ui.reports = [{ turn: g.turn, d }].concat(ui.reports || []).slice(0, 8);
}
function startNewsItems() {
  const g = game, items = [];
  if (!g || ui.phase !== "play") return items;
  const O = g.opening;
  if (O && ["claim", "demand", "refused", "war"].includes(O.stage) && g.nations[O.by]) items.push({ id: "start-claim", icon: "shieldI", text: `The ${g.nations[O.by].name}, your neighbor, says ${O.town} belongs to it.`, tone: "bad", act: { goals: true }, turn: g.turn });
  items.push({ id: "start", icon: "flag", text: g.turn === 0 ? `${g.nations[PLAYER].name} is founded. Press Space to start time.` : `Game loaded: ${seasonLabel(g.turn)}. Press Space to continue.`, tone: "good", act: { panel: "realm" }, turn: g.turn });
  return items;
}
function newsHtml() {
  if (!game || ui.phase !== "play") return "";
  const news = (ui.news || []).slice(0, 7);
  if (!news.length) return "";
  const latest = news[0].turn;
  return `<div class="news-head"><span class="eyebrow">News</span><button class="linkbtn" type="button" data-action="news-report" data-turn="${latest}">Season report</button></div>
    ${news.map(x => `<button class="news-item tone-${x.tone} ${x.turn !== latest ? "old" : ""} ${x.more ? "more" : ""}" type="button" data-action="news-open" data-id="${x.id}" title="${escapeHtml(x.text)}">
      <span class="ni-ic">${ICONS[x.icon] || ICONS.scroll}</span><span class="ni-txt">${escapeHtml(x.text)}</span></button>`).join("")}`;
}
function openNews(id) {
  const x = (ui.news || []).find(n => n.id === id);
  if (!x) return;
  const a = x.act || { report: true };
  if (a.decision && game.decisions.some(d => d.id === a.decision)) { ui.decision = a.decision; return; }
  if (a.panel) { ui.tab = a.panel; if (a.panel === "cabinet") ui.ministry = null; return; }
  if (a.nation !== undefined && game.nations[a.nation] && game.nations[a.nation].alive && !game.nations[a.nation].isPlayer) { ui.tab = "nations"; ui.openNation = a.nation; return; }
  if (a.assembly) { openAssembly(); return; }
  if (a.goals) { ui.goalsOpen = true; return; }
  if (a.city !== undefined && game.cities.some(c => c.id === a.city)) { ui.selectedCity = a.city; ui.selectedCell = -1; ui.tab = "selected"; return; }
  if (a.cell !== undefined && villageAt(game, a.cell)) { selectVillage(villageAt(game, a.cell).id); centerOnCell(a.cell, Math.max(view.zoom, 3)); return; }   // a village's news opens its page (16n)
  const r = (ui.reports || []).find(r => r.turn === x.turn) || (ui.reports || [])[0];
  if (r) ui.dispatch = r.d;
}

/* ---------- Goals: what you are working toward, and what threatens you ---------- */
function goalsHtml() {
  if (!game || ui.phase !== "play") return "";
  const g = game, rows = [];
  const O = g.opening;
  if (O && ["claim", "demand", "refused", "war"].includes(O.stage)) {
    const odds = openingOdds(world, g);
    const x = odds.x;
    const state = O.stage === "war" ? `At war: hold ${O.town}` : O.stage === "refused" ? `You refused. They may attack from ${seasonLabel(OPENING.warFrom)}; the claim ends ${seasonLabel(O.until)}` : O.stage === "demand" ? "Their demand is waiting in your letters" : `They will demand it soon`;
    const risk = O.stage === "refused" && g.turn >= OPENING.warFrom - 1 ? (odds.value === null ? " · for now they think a war too costly" : odds.value > 0 ? " · they think they can win" : " · for now they think a war too costly") : "";
    rows.push(`<button class="goal danger" type="button" data-action="goal-open" data-kind="opening">
      <span class="g-ic">${ICONS.shieldI}</span><span class="g-txt"><strong>Keep ${escapeHtml(O.town)}</strong><span class="small">The ${escapeHtml(x.name)} claims it. ${escapeHtml(state)}${escapeHtml(risk)}.</span>
      <span class="small muted">Their divisions ${odds.theirs} · yours ${odds.mine}${odds.allies.length ? ` · allies on their border: ${escapeHtml(odds.allies.join(", "))}` : ""}</span>
      <span class="small g-hint">${O.stage === "war" ? "Your generals defend. To end it, offer peace in Letters." : O.stage === "claim" ? "Get ready: more divisions in the Army panel." : "To stop them: more divisions (Army panel), money or a pact (Letters), or an ally on their border."}</span></span></button>`);
  }
  { const P = g.nations[PLAYER];
    const k = P.groups ? GROUP_ORDER.filter(x => P.groups[x].demand && P.groups[x].share >= 0.12).sort((a, b) => (P.groups[a].demand.until - P.groups[b].demand.until) || (P.groups[b].share - P.groups[a].share))[0] : null;
    if (k) { const s = P.groups[k], left = s.demand.until - g.turn;
      rows.push(`<button class="goal" type="button" data-action="panel-open" data-p="groups"><span class="g-ic">${groupIc(k)}</span><span class="g-txt"><strong>${escapeHtml(GROUPS[k].label)} ${GROUPS[k].are === "is" ? "demands" : "demand"}</strong><span class="small">${escapeHtml(s.demand.label)}</span><span class="small muted">${left} season${left === 1 ? "" : "s"} left · approval ${Math.round(s.approval)} · ${pct(s.share)} of the power</span></span></button>`); } }
  for (const a of g.amb.active) {
    const p = AMBITIONS[a.key].progress(ambCtxUI(), a);
    const left = a.deadline - g.turn;
    rows.push(`<button class="goal" type="button" data-action="goal-open" data-kind="amb"><span class="g-ic">${ICONS[AMB_ICONS[AMBITIONS[a.key].icon] || "flag"]}</span>
      <span class="g-txt"><strong>${escapeHtml(a.title)}</strong><span class="gbar"><i style="width:${clamp(p.frac, 0, 1) * 100}%"></i></span><span class="small muted">${escapeHtml(shortLine(p.text))} · ${left} season${left === 1 ? "" : "s"} left · +${a.prestige} prestige</span></span></button>`);
  }
  if (g.amb.active.length < AMBITION_SLOTS) {
    refreshOffers(world, g, economies()[PLAYER]);
    if (ui.goalPick) {
      rows.push(`<div class="goal-pick"><span class="small muted">Choose a goal. Reach it in time for prestige and a reward; miss it and the people are let down.</span>
        ${g.amb.offers.map(o => { const reward = AMBITIONS[o.key].reward(ambCtxUI(), o); return `<div class="gp-row"><div><strong class="small">${escapeHtml(o.title)}</strong><span class="small muted">${o.seasons} seasons · +${o.prestige} prestige${reward.length ? ` · ${escapeHtml(reward.map(e => effectText(g, e, PLAYER).text).filter(Boolean).join("; "))}` : ""}</span></div><button class="btn" type="button" data-action="goal-set" data-id="${o.id}">Set</button></div>`; }).join("")}
        <button class="linkbtn" type="button" data-action="goal-pick-close">Not now</button></div>`);
    } else if (g.amb.offers.length) rows.push(`<button class="goal add" type="button" data-action="goal-pick"><span class="g-ic">${ICONS.flag}</span><span class="g-txt"><strong>Choose a goal</strong><span class="small muted">${g.amb.offers.length} ideas from your ministers</span></span></button>`);
  }
  if (!rows.length) return "";
  return `<div class="news-head"><span class="eyebrow">Goals</span></div>${rows.join("")}`;
}

/* ---------- When the game stops by itself ---------- */
function autoPauseReason(d, before) {
  const g = game, P = PLAYER;
  const declared = g.inbox.find(it => it.status === "info" && it.kind === "declaration" && !(before.seenDecl || []).includes(it.id));
  if (declared) return { text: `The ${nameOf(g, declared.from)} declared war on you!`, act: { label: "Army", panel: "army" } };
  const newWar = liveNations(g).find(z => z.id !== P && atWar(g, P, z.id) && !before.wars.includes(z.id));
  if (newWar) return { text: `You are at war with the ${newWar.name}.`, act: { label: "Army", panel: "army" } };
  const lost = before.towns.filter(id => { const c = g.cities.find(x => x.id === id); return !c || c.owner !== P || g.occ[c.cell] >= 0; });
  if (lost.length) { const c = g.cities.find(x => x.id === lost[0]); return { text: `${c ? c.name : "One of your towns"} has fallen to the enemy.`, act: { label: "Army", panel: "army" } }; }
  const fresh = g.inbox.filter(it => it.status === "open" && !before.inbox.includes(it.id));
  const letter = fresh.find(it => it.threat) || fresh[0];   // a demand first: it matters most
  if (letter) return { text: `${letter.threat ? "A demand" : "A letter"} from the ${nameOf(g, letter.from)} is waiting for your answer${fresh.length > 1 ? `, and ${fresh.length - 1} more letter${fresh.length > 2 ? "s" : ""}` : ""}.`, act: { label: "Read it", panel: "letters" } };
  const cut = (d.trade || []).find(x => x.pause);   // a new embargo on food, fuel or what industry cannot do without
  if (cut) return { text: shortLine(cut.text, 150), act: { label: "Trade", panel: "trade" } };
  if ((d.opening || []).some(x => x.tone === "bad")) return { text: shortLine(d.opening.find(x => x.tone === "bad").text, 150), act: { label: "Army", panel: "army" } };
  return null;
}
function seasonBefore() {
  const g = game, P = PLAYER;
  return {
    wars: liveNations(g).filter(z => z.id !== P && atWar(g, P, z.id)).map(z => z.id),
    towns: g.cities.filter(c => c.owner === P && g.occ[c.cell] < 0).map(c => c.id),
    inbox: g.inbox.filter(it => it.status === "open").map(it => it.id),
    seenDecl: g.inbox.filter(it => it.kind === "declaration").map(it => it.id),
  };
}
/* The season has been played out on the map: its news, and a pause if something needs you. */
function seasonShown(d) {
  if (window.__classicTurns) { ui.seasonBefore = null; pushNews(seasonHeadlines(d), d); ui.dispatch = d; renderAll(); return; }
  const before = ui.seasonBefore || seasonBefore();
  ui.seasonBefore = null;
  pushNews(seasonHeadlines(d), d);
  const why = autoPauseReason(d, before);
  autoOpenDecision();
  if (why) rtPause(why.text, why.act);
  renderAll();
}

/* ---------- Actions and keys ---------- */
Object.assign(ACTIONS, {
  "rt-pause": () => { if (RT.paused) rtResume(); else rtPause(); },
  "rt-act": () => { const a = RT.act; if (a && a.panel) { ui.tab = a.panel; if (a.panel === "cabinet") ui.ministry = null; } },
  "rt-speed": el => rtSetSpeed(Number(el.dataset.v)),
  "news-open": el => openNews(el.dataset.id),
  "news-report": el => { const r = (ui.reports || []).find(r => r.turn === Number(el.dataset.turn)) || (ui.reports || [])[0]; if (r) ui.dispatch = r.d; },
  "goal-open": el => { if (el.dataset.kind === "opening") { ui.tab = "nations"; ui.openNation = game.opening ? game.opening.by : null; } else ui.tab = "agenda"; },
  "goal-pick": () => { ui.goalPick = true; },
  "goal-pick-close": () => { ui.goalPick = false; },
  "goal-set": el => { if (pickAmbition(world, game, Number(el.dataset.id))) { ui.goalPick = false; bumpMap(); } },
});
function onTimeKey(e) {
  if (e.key !== " " || !game || ui.phase !== "play" || ui.dispatch || ui.stats || ui.asm || ui.saves || ui.compose || ui.decision || ui.credits) return false;
  if (RT.paused) rtResume(); else rtPause();
  e.preventDefault();
  return true;
}
function renderTimeOverlays() {
  const playing = game && ui.phase === "play";
  const rc = document.getElementById("rightcol");
  if (rc) {
    const goals = playing ? goalsHtml() : "", news = playing ? newsHtml() : "";
    rc.hidden = !(goals || news);
    rc.innerHTML = `${goals ? `<div class="rc-card goals">${goals}</div>` : ""}${news ? `<div class="rc-card newsbox">${news}</div>` : ""}`;
  }
  const pb = document.getElementById("pausebanner");
  if (pb) { const h = playing ? pauseBannerHtml() : ""; pb.hidden = !h; pb.innerHTML = h; }
}

