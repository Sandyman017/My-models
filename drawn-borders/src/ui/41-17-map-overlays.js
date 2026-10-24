/* =====================================================================
   17. Map overlays: toolbar, hints, tooltip, end turn, dispatch
   ===================================================================== */
function toolbarHtml() {
  const tool = (id, label, key, icon) => `<button class="tool ${ui.tool === id ? "on" : ""}" type="button" data-tool="${id}" data-label="${label} (${key})" aria-label="${label}" aria-pressed="${ui.tool === id}">${ICONS[icon]}</button>`;
  return tool("select", "Inspect", "V", "select") + tool("road", "Build road", "R", "road") + tool("town", "Found town", "T", "town")
    + `<button class="tool res-tool ${ui.resView ? "on" : ""}" type="button" data-action="res-view" data-label="Resources view (E)" aria-label="Resources view" aria-pressed="${!!ui.resView}">${ICONS.res}</button>`;
}

function hintText() {
  if (ui.phase === "draw") return drawingPath || ui.drawCells ? "" : "Press and drag to draw your borders";
  if (ui.phase === "provinces") return drawingPath || ui.provDraw ? "" : "Draw around some of your land to make it a province";
  if (ui.phase === "play" && ui.tool === "province" && !ui.pending) return drawingPath || ui.provDraw ? "" : "Draw around land to make it a new province or move it into another · Esc to stop";
  if (ui.phase !== "play" || ui.pending) return "";
  if (ui.tool === "road") return ui.roadFrom ? "Click a town to join it, or a deposit or any spot in your land to reach it · Esc to cancel" : "Click one of your towns to start a road";
  if (ui.tool === "town") return "Click a spot on wild land near your border, or empty land inside it";
  if (ui.fleetSel.length) return "Right-click the sea: sail there · right-click your harbor: dock · Esc clear";
  if (ui.sel.length) return "Right-click: march, attack, or cross by sea · Shift or drag: add · H halt · G generals · Esc clear";
  if (game && game.turn === 0 && view.zoom === 1) return "Scroll to zoom · drag with the right mouse button to move the map";
  return "";
}

function turnboxHtml() {
  return `<span class="season-chip" data-why="season" tabindex="0"><span class="wx">${weatherIcon(seasonWar(game))}</span>${seasonLabel(game.turn)}<small class="era">${ERAS[game.era || 0].name}</small></span>
    <button class="end-turn" type="button" data-action="end-season">End ${SEASONS[game.turn % 4].toLowerCase()}</button>`;
}

function tooltipHtml(i) {
  if (ui.phase === "play" && ui.tradeHover && !ui.hoverQuote) return tradeLaneTooltipHtml(ui.tradeHover);
  if (i < 0) return "";
  if (ui.phase === "play" && ui.hoverQuote) {
    const q = ui.hoverQuote;
    if (!q.ok) return `<strong>Can't build here</strong><span class="tt-bad">${escapeHtml(q.reason)}</span>`;
    const extra = q.kind === "town"
      ? `<span class="tt-line">Claims ${q.claim.length} cells · farmland for ${q.claimFood.toFixed(2)}M</span>`
      : `<span class="tt-line">${q.newEdges.length} segments · ${q.seasons} season${q.seasons > 1 ? "s" : ""}</span>`;
    return `<strong>${escapeHtml(q.label)}</strong>${extra}<span class="tt-line">Cost ${fmtMoney(q.cost)}${q.dGdp > 0.05 ? ` · output +${fmtMoney(q.dGdp)}/yr` : ""}</span><span class="tt-good">Click to plan it</span>`;
  }
  const t = world.terrain[i];
  if (t === T.SEA) return seaTooltipHtml(i);
  if (game && ui.phase === "play") {
    const hp = ui.fleetHover && ui.fleetHover.text ? ui.fleetHover : ui.hoverPath;
    const order = hp && hp.text ? `<span class="${hp.bad ? "tt-bad" : "tt-good"}">${escapeHtml(hp.text)}</span>` : "";
    const units = unitsTooltipHtml(i);
    if (units || order) return `${tooltipBase(i)}${units}${order}`;
  }
  return tooltipBase(i);
}

function tooltipBase(i) {
  const t = world.terrain[i];
  const site = game && game.sites ? siteAt(i) : null;
  const kd = knownDepositAt(i);
  let dep = "";
  if (site) dep = `<span class="tt-good">${escapeHtml(site.name)}${site.level > 1 ? ` · level ${site.level}` : ""}${site.exhausted ? " · worked out" : site.paused ? " · paused" : ""}</span>${SITE_KINDS[site.kind].res && !site.exhausted ? `<span class="tt-line">${escapeHtml(fmtAmount(SITE_KINDS[site.kind].res, game.depLeft[i]))} left</span>` : ""}`;
  else if (kd && (!game || game.depLeft[i] > 0.01)) dep = `<span class="tt-good">${RES[kd].label} deposit · ${escapeHtml(reserveText(i, kd))}</span>`;
  if (game && game.owner[i] === PLAYER && (site || kd)) dep += `<span class="tt-line">Click for details</span>`;
  if (!game) return `<strong>${TERRAIN[t].name}</strong><span class="tt-line">Feeds ${(cellFood(world, {}, i) * 1000).toFixed(0)}k people</span>${dep}`;
  const city = game.cities.find(c => c.cell === i);
  const owner = game.owner[i];
  const who = owner >= 0 ? game.nations[owner].name : "Wild land";
  if (city) {
    const r = economies()[city.owner].regions.find(x => x.city.id === city.id);
    if (!r) return `<strong>${escapeHtml(city.name)}${city.capital ? " ★" : ""}</strong><span class="tt-line">${escapeHtml(who)}</span><span class="tt-bad">Occupied by the ${escapeHtml(nameOf(game, game.occ[city.cell]))}</span>`;
    return `<strong>${escapeHtml(city.name)}${city.capital ? " ★" : ""}</strong><span class="tt-line">${escapeHtml(who)}</span>${provTooltipLines(i)}<span class="tt-line">${escapeHtml(cityTier(r.pop).label)} · ${escapeHtml(cityClass(city.imp).label)} · importance ${city.imp || "?"}${(city.roles || []).filter(k => k !== "capital" && CITY_ROLES[k]).length ? ` · ${escapeHtml((city.roles || []).filter(k => k !== "capital" && CITY_ROLES[k]).slice(0, 2).map(k => CITY_ROLES[k].label).join(", "))}` : ""}</span>${(city.mood ?? 55) < 40 ? `<span class="tt-bad">Mood ${Math.round(city.mood)}: ${moodWord(city.mood)}</span>` : ""}${city.origin !== city.owner && (city.loyalty ?? 92) < 70 ? `<span class="tt-bad">Loyalty ${Math.round(city.loyalty)}: many feel part of the ${escapeHtml(nameOf(game, city.origin))}</span>` : ""}<span class="tt-line">${r.pop.toFixed(2)}M people · $${r.outputK.toFixed(1)}k each</span><span class="${r.foodRatio < ECON.famineLine ? "tt-bad" : "tt-line"}">Food ${pct(r.foodRatio)} of need</span>${townURate(r) > 0.05 ? `<span class="tt-bad">${pct(townURate(r))} of workers have no job</span>` : ""}`;
  }
  return `<strong>${TERRAIN[t].name}</strong><span class="tt-line">${escapeHtml(who)}</span>${provTooltipLines(i)}${dep}${game.occ[i] >= 0 ? `<span class="tt-bad">Occupied by the ${escapeHtml(nameOf(game, game.occ[i]))}</span>` : ""}<span class="tt-line">${(game.pop[i] * 1000).toFixed(0)}k people · feeds ${(cellFood(world, game, i) * 1000).toFixed(0)}k</span>`;
}

function dispatchHtml(d) {
  const p = d.player;
  const r = p.report;
  const n = game.nations[PLAYER];
  const fig = (k, v, dl, tone) => `<div class="fig"><span class="k">${k}</span><span class="v">${v}</span>${dl ? `<span class="d tone-${tone}">${dl}</span>` : ""}</div>`;
  const news = [];
  if (r.event) news.push({ color: r.event.tone === "good" ? "var(--good)" : r.event.tone === "bad" ? "var(--bad)" : "var(--warn)", who: r.event.title, text: r.event.text, why: r.event.effects.join(" · ") });
  d.built.forEach(b => news.push({ color: NATION_COLORS[PLAYER], who: n.name, text: b.text }));
  d.abroad.forEach(a => news.push({ color: NATION_COLORS[a.nid], who: game.nations[a.nid].name, text: a.text, why: a.why ? `${a.why}${a.source === "claude" ? " (decided by Claude)" : ""}` : null }));
  const warNews = (d.war || []).concat(p.losses ? [`Your army lost ${fmtCount(p.losses)} soldiers this season.`] : []);
  const battleList = (d.battles || []).slice(0, 6);
  const battleHtml = battleList.length ? `<div class="block"><span class="eyebrow">Battles · click one to see why it went that way</span>${battleList.map(r => battleReportHtml(r)).join("")}${(d.battles || []).length > 6 ? `<p class="muted small">${d.battles.length - 6} more in the Army panel.</p>` : ""}</div>` : "";
  const marchHtml = (d.marches || []).length ? `<div class="block"><span class="eyebrow">Your orders</span><ul class="news">${d.marches.slice(0, 8).map(x => `<li><span class="dot" style="background:${x.tone === "warn" ? "var(--warn)" : "var(--muted)"}"></span><span>${escapeHtml(x.text)}</span></li>`).join("")}</ul></div>` : "";
  const warHtml = marchHtml + (warNews.length ? `<div class="block"><span class="eyebrow">War</span><ul class="news">${warNews.map(t => `<li><span class="dot" style="background:var(--bad)"></span><span>${escapeHtml(t)}</span></li>`).join("")}</ul></div>` : "") + battleHtml;
  const econHtml = (d.economy || []).length ? `<div class="block"><span class="eyebrow">Economy</span><ul class="news">${d.economy.map(x => `<li><span class="dot" style="background:${x.tone === "good" ? "var(--good)" : x.tone === "bad" ? "var(--bad)" : "var(--muted)"}"></span><span>${escapeHtml(x.text)}</span></li>`).join("")}</ul></div>` : "";
  const dipHtml = (d.diplomacy || []).length ? `<div class="block"><span class="eyebrow">Diplomacy</span><ul class="news">${d.diplomacy.map(t => `<li><span class="dot" style="background:var(--gold)"></span><span>${escapeHtml(t)}</span></li>`).join("")}</ul></div>` : "";
  const envoys = game.inbox.filter(it => it.status === "open" || (it.status === "info" && it.turn === game.turn - 1)).length;
  const envoyHtml = envoys ? `<p class="notice info">${envoys} letter${envoys > 1 ? "s" : ""} from foreign governments ${envoys > 1 ? "are" : "is"} waiting for you. <button class="btn" type="button" data-action="open-letters">Read letters</button></p>` : "";
  const newsHtml = news.length
    ? `<ul class="news">${news.map(x => `<li><span class="dot" style="background:${x.color}"></span><span><span class="who">${escapeHtml(x.who)}</span> ${escapeHtml(x.text)}${x.why ? `<span class="why">${escapeHtml(x.why)}</span>` : ""}</span></li>`).join("")}</ul>`
    : `<p class="muted">A quiet season.</p>`;
  const warn = d.warnings.length ? `<div class="block">${d.warnings.map(w => `<p class="notice">${escapeHtml(w)}</p>`).join("")}</div>` : "";
  return `<div class="dispatch" role="dialog" aria-modal="true" aria-labelledby="dispatch-title">
    <div class="block" style="gap:4px"><span class="eyebrow">Dispatch · end of</span><h2 id="dispatch-title">${escapeHtml(d.season)}</h2></div>
    <div class="dispatch-figures">
      ${fig("Output", fmtMoney(p.gdp), signedPct(p.gdpChange, 1), toneOf(p.gdpChange, 0.0005))}
      ${fig("Population", fmtPop(p.pop), signedPct(p.popChange, 1), toneOf(p.popChange, 0.0002))}
      ${fig("Stability", `${Math.round(r.to)}`, `${signed1(r.to - r.from)} · aim ${Math.round(r.target)}`, toneOf(r.to - r.from, 0.1))}
      ${fig("Treasury", p.treasury >= 0 ? fmtMoney(p.treasury) : `Debt ${fmtMoney(-p.treasury)}`, fmtSignedMoney(p.balance), toneOf(p.balance, 0.05))}
    </div>
    ${warn}
    ${weatherDispatchHtml(d)}
    ${envoyHtml}
    ${cabinetDispatchHtml(d)}
    ${dispatchV16Html(d)}
    ${seaDispatchHtml(d)}
    ${warHtml}
    <div class="block"><span class="eyebrow">News</span>${newsHtml}</div>
    ${econHtml}
    ${tradeDispatchHtml(d)}
    ${citiesDispatchHtml(d)}
    ${provincesDispatchHtml(d)}
    ${villagesDispatchHtml(d)}
    ${groupsDispatchHtml(d)}
    ${peopleDispatchHtml(d)}
    ${dipHtml}
    ${(d.assembly || []).length ? `<div class="block"><span class="eyebrow">World Assembly</span><ul class="news">${d.assembly.map(x => `<li><span class="dot" style="background:${x.tone === "good" ? "var(--good)" : x.tone === "bad" ? "var(--bad)" : "var(--gold)"}"></span><span>${escapeHtml(x.text)}</span></li>`).join("")}</ul><div class="actions"><button class="btn" type="button" data-action="asm-open">Open the Assembly</button></div></div>` : ""}
    <div class="actions"><button class="btn primary" type="button" data-action="close-dispatch" id="dispatch-close">Continue to ${escapeHtml(seasonLabel(game.turn))}</button>${ui.lastPlayback ? `<button class="btn" type="button" data-action="replay">Watch the season again</button>` : ""}</div>
  </div>`;
}

