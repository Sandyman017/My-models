/* =====================================================================
   16d. The Agenda: your leader, your ambitions, the race for great works, your legacy;
   decisions that wait for you; what is coming up; what your neighbors' generals are planning
   ===================================================================== */
Object.assign(ICONS, {
  flag: giSvg("lorc/flying-flag"),
  star: giSvg("lorc/laurel-crown"),
  fist: giSvg("lorc/fist"),
  pick: giSvg("lorc/mining"),
  drop: giSvg("skoll/oil-drum"),
  flame: giSvg("sbed/fire"),
  sun: giSvg("lorc/sun"),
  plus: giSvg("sbed/medical-pack"),
  flask: giSvg("lorc/round-bottom-flask"),
  fish: giSvg("delapouite/fishing"),
  tree: giSvg("lorc/pine-tree"),
  wave: giSvg("lorc/big-wave"),
  shieldI: giSvg("lorc/checked-shield"),
  anchor: giSvg("lorc/anchor"),
  eye: giSvg("delapouite/spy"),
});
/* each great work's landmark: the same drawing in the panels and on the map */
const WORK_GLYPHS = {
  dam: "delapouite/waterfall", railway: "delapouite/steam-locomotive", harbor: "delapouite/lighthouse", academy: "delapouite/graduate-cap",
  exchange: "delapouite/bank", fair: "delapouite/medieval-pavilion", forts: "lorc/stone-tower", monument: "delapouite/arc-triomphe",
  broadcast: "delapouite/radio-tower", atomic: "skoll/atom",
};
const WORK_ICONS = Object.fromEntries(Object.entries(WORK_GLYPHS).map(([k, name]) => [k, giSvg(name)]));
const DEC_ICONS = { fist: "fist", mine: "pick", gold: "coin", oil: "drop", fire: "flame", sun: "sun", people: "people", shield: "shieldI", coin: "coin", plus: "plus", flask: "flask", scroll: "scroll", food: "food", army: "army", fish: "fish", tree: "tree", wave: "wave", crown: "crown" };
function decIcon(d) { return ICONS[DEC_ICONS[d.icon] || "flag"] || ICONS.flag; }
const AMB_ICONS = { road: "road", town: "town", anchor: "anchor", output: "output", mine: "pick", coin: "coin", people: "people", food: "food", flask: "flask", globe: "globe", hall: "hall", army: "army", shield: "shieldI", star: "star" };

/* ---------- Effects as small colored chips: you see exactly what a choice does ---------- */
function effectChipsHtml(effects, nid = PLAYER) {
  const chips = effects.flatMap(e => (e.t === "successor" ? e.leader.traits.map(t => ({ text: `${LEADER_TRAITS[t].label}: ${TRAIT_EFFECTS[t]}`, tone: "neutral" })) : [effectText(game, e, nid)])).filter(x => x.text);
  if (!chips.length) return `<span class="chip tone-neutral">Nothing changes</span>`;
  return chips.map(x => `<span class="chip fx tone-${x.tone}">${escapeHtml(x.text)}</span>`).join("");
}

/* ---------- Your leader ---------- */
function leaderInitials(L) { return L.name.split(" ").map(p => p[0]).join("").slice(0, 2); }
function leaderBlockHtml() {
  const n = game.nations[PLAYER];
  const L = n.leader;
  if (!L) {
    const d = game.decisions.find(x => x.key === "succession" && x.nid === PLAYER);
    return `<div class="block leader-card"><span class="eyebrow">Your leader</span>
      <p class="notice">The nation has no leader: the succession is undecided (−3 stability until it is).</p>
      ${d ? `<div class="actions"><button class="btn primary" type="button" data-action="dec-open" data-id="${d.id}">Choose a successor</button></div>` : ""}</div>`;
  }
  const deeds = L.deeds || {};
  const next = L.epithet ? [] : EPITHETS.map(e => ({ e, k: deeds[e.key] || 0, f: Math.min(1, (deeds[e.key] || 0) / e.need) })).sort((a, b) => b.f - a.f).slice(0, 3);
  return `<div class="block leader-card">
    <span class="eyebrow">Your leader</span>
    <div class="leader-head">
      <div class="portrait" style="--c:${n.color}"><span>${escapeHtml(leaderInitials(L))}</span></div>
      <div class="leader-id"><strong>${escapeHtml(leaderName(n))}</strong><span class="muted small">Age ${Math.floor(L.age)} · leading since ${seasonLabel(L.since)}</span></div>
    </div>
    <ul class="trait-list">${L.traits.map(t => `<li><span class="chip trait">${LEADER_TRAITS[t].label}</span><span class="small">${escapeHtml(TRAIT_EFFECTS[t])}</span></li>`).join("")}</ul>
    ${L.epithet ? `<p class="small">History will remember ${escapeHtml(L.name)} as <strong>${escapeHtml(L.epithet)}</strong>, for having ${escapeHtml(L.epithetWhy)}.</p>`
      : `<div class="epithets"><span class="muted small">Great deeds earn a leader a title, like “${escapeHtml(next[0].e.name)}”:</span>${next.map(x => `<div class="ep-row"><span class="small">${escapeHtml(x.e.name)}<span class="muted"> · ${escapeHtml(x.e.why)}</span></span><span class="num small muted">${Math.min(x.k, x.e.need)}/${x.e.need}</span><span class="bar thin"><span style="width:${x.f * 100}%"></span></span></div>`).join("")}</div>`}
    <p class="muted small">Leaders grow old. When yours dies or retires, you choose who comes next.</p>
  </div>`;
}

/* ---------- Decisions waiting ---------- */
function myDecisions() { return game ? game.decisions.filter(d => d.nid === PLAYER) : []; }
function pendingDecisionsHtml() {
  const ds = myDecisions();
  if (!ds.length) return "";
  return `<div class="block"><span class="eyebrow">Waiting for your decision</span>
    ${ds.map(d => `<button class="dec-row tone-${d.tone}" type="button" data-action="dec-open" data-id="${d.id}"><span class="dec-ic">${decIcon(d)}</span><span class="dec-txt"><strong>${escapeHtml(d.title)}</strong><span class="muted small">${escapeHtml(d.cat)} · decide by ${seasonLabel(d.expires)}</span></span><span class="go">Decide</span></button>`).join("")}
  </div>`;
}

/* ---------- Ambitions ---------- */
function ambitionCardHtml(a) {
  const p = AMBITIONS[a.key].progress(ambCtxUI(), a);
  const left = a.deadline - game.turn;
  const reward = AMBITIONS[a.key].reward(ambCtxUI(), a);
  const ask = ui.ambDrop === a.id;
  return `<div class="amb active">
    <div class="amb-head"><span class="amb-ic">${ICONS[AMB_ICONS[AMBITIONS[a.key].icon] || "flag"]}</span><strong>${escapeHtml(a.title)}</strong><span class="num small ${left <= 2 ? "tone-bad" : "muted"}">${left} season${left === 1 ? "" : "s"} left</span></div>
    <div class="bar"><span style="width:${clamp(p.frac, 0, 1) * 100}%"></span></div>
    <span class="small">${escapeHtml(p.text)}</span>
    <div class="chips"><span class="chip fx tone-good">+${a.prestige} prestige</span>${reward.length ? effectChipsHtml(reward) : ""}</div>
    ${ask ? `<div class="confirm"><p class="small">Give up this ambition? The people were promised it: −2 stability.</p><div class="actions"><button class="btn danger" type="button" data-action="amb-drop" data-id="${a.id}">Give it up</button><button class="btn" type="button" data-action="amb-keep">Keep it</button></div></div>`
      : `<button class="linkbtn" type="button" data-action="amb-drop-ask" data-id="${a.id}">Give up</button>`}
  </div>`;
}
function ambCtxUI() { const econ = economies()[PLAYER]; return { w: world, g: game, n: game.nations[PLAYER], econ, Y: econ.gdp }; }
function ambitionsHtml() {
  refreshOffers(world, game, economies()[PLAYER]);
  const A = game.amb;
  const active = A.active.map(ambitionCardHtml).join("");
  const free = AMBITION_SLOTS - A.active.length;
  const offers = free > 0 && A.offers.length ? `<div class="amb-offers"><span class="muted small">${A.active.length ? "You can set one more ambition. Choose one:" : "Choose an ambition for the nation. Choosing one path means not taking the others for now."}</span>
    ${A.offers.map(o => {
      const reward = AMBITIONS[o.key].reward(ambCtxUI(), o);
      return `<div class="amb offer"><div class="amb-head"><span class="amb-ic">${ICONS[AMB_ICONS[AMBITIONS[o.key].icon] || "flag"]}</span><strong>${escapeHtml(o.title)}</strong><span class="num small muted">${o.seasons} seasons</span></div>
        <span class="small muted">${escapeHtml(o.why)}</span>
        <div class="chips"><span class="chip fx tone-good">+${o.prestige} prestige</span>${reward.length ? effectChipsHtml(reward) : ""}</div>
        <button class="btn" type="button" data-action="amb-pick" data-id="${o.id}">Set this ambition</button></div>`;
    }).join("")}</div>` : "";
  const done = (A.log || []).filter(x => x.result === "done").length;
  return `<div class="block"><span class="eyebrow">Ambitions · ${A.active.length} of ${AMBITION_SLOTS}${done ? ` · ${done} fulfilled` : ""}</span>
    ${active || (offers ? "" : `<p class="muted small">No ambitions right now.</p>`)}
    ${offers}
    <p class="muted small">Fulfil an ambition before its deadline for prestige and a reward. Missing one disappoints the people (−3 stability for a year).</p>
  </div>`;
}

/* ---------- Great works ---------- */
function workRowHtml(key) {
  const def = WORKS[key], W = game.works[key] || { owner: null, builders: {} };
  const done = W.owner !== null && W.owner !== undefined;
  const mine = W.builders && W.builders[PLAYER];
  const racers = Object.entries(W.builders || {}).filter(([id]) => Number(id) !== PLAYER && game.nations[id] && game.nations[id].alive).map(([id, b]) => ({ n: game.nations[id], f: b.progress / b.seasons }));
  let status = "", action = "", bars = "", order = 3;
  if (done) {
    const holder = workHolder(game, key);
    status = `${W.owner === PLAYER ? "Built by you" : `Built by the ${escapeHtml(nameOf(game, W.owner))}`} in ${seasonLabel(W.done)}${holder !== W.owner ? holder === -1 ? " · its land is occupied" : ` · now held by the ${escapeHtml(nameOf(game, holder))}` : ""}`;
    order = W.owner === PLAYER || holder === PLAYER ? 0 : 4;
  } else if (mine) {
    order = 0;
    bars += `<div class="race me"><span class="small">You</span><span class="bar"><span style="width:${(mine.progress / mine.seasons) * 100}%"></span></span><span class="num small">${mine.progress}/${mine.seasons}</span></div>`;
    status = `${mine.paused ? "Paused" : mine.stalled ? `<span class="tone-bad">Stalled last season: not enough money</span>` : `${fmtMoney(mine.cost / mine.seasons)} a season`} · ${fmtMoney(mine.paid)} spent of ${fmtMoney(mine.cost)}`;
    action = ui.workCancel === key
      ? `<div class="confirm"><p class="small">Stop building? Half of the ${fmtMoney(mine.paid)} spent will be recovered.</p><div class="actions"><button class="btn danger" type="button" data-action="work-cancel" data-key="${key}">Stop for good</button><button class="btn" type="button" data-action="work-cancel-no">Keep building</button></div></div>`
      : `<div class="actions"><button class="btn" type="button" data-action="work-pause" data-key="${key}">${mine.paused ? "Resume work" : "Pause"}</button><button class="linkbtn" type="button" data-action="work-cancel-ask" data-key="${key}">Stop building</button></div>`;
  } else {
    const q = quoteWorkLite(world, game, PLAYER, key, economies()[PLAYER]);
    if (q.ok) {
      order = 1;
      status = `${fmtMoney(q.installment)} a season for ${q.seasons} seasons (${fmtMoney(q.cost)} in all)`;
      action = ui.workConfirm === key
        ? `<div class="confirm"><p class="small">Start the ${escapeHtml(def.label)}? It costs ${fmtMoney(q.installment)} every season for ${q.seasons} seasons. If a rival finishes first, you get half your money back.</p><div class="actions"><button class="btn primary" type="button" data-action="work-start" data-key="${key}">Start building</button><button class="btn" type="button" data-action="work-confirm-no">Not now</button></div></div>`
        : `<div class="actions"><button class="btn primary" type="button" data-action="work-confirm" data-key="${key}">Build it</button></div>`;
    } else {
      order = racers.length ? 2 : 3;
      status = `<span class="muted">${escapeHtml(q.reason)}</span>`;
    }
  }
  bars += racers.map(r => `<div class="race"><span class="small" style="color:${r.n.color}">${escapeHtml(r.n.name)}</span><span class="bar"><span style="width:${r.f * 100}%;background:${r.n.color}"></span></span><span class="num small">${pct(r.f)}</span></div>`).join("");
  const html = `<div class="work ${done ? "done" : ""} ${mine ? "mine" : ""}">
    <div class="work-head"><span class="work-ic">${WORK_ICONS[key] || ICONS.star}</span><span class="work-name"><strong>${escapeHtml(def.label)}</strong><span class="muted small">like ${escapeHtml(def.inspired)}</span></span></div>
    <span class="small">${escapeHtml(def.gives)}.</span>
    <span class="small">${status}</span>
    ${bars ? `<div class="races">${bars}</div>` : ""}
    ${action}
  </div>`;
  return { html, order };
}
function worksHtml() {
  const rows = WORK_ORDER.map(k => ({ k, ...workRowHtml(k) })).sort((a, b) => a.order - b.order);
  return `<div class="block"><span class="eyebrow">Great works · one of each in the whole world</span>
    ${rows.map(r => r.html).join("")}
    <p class="muted small">Great works take years and are paid season by season. Only the first nation to finish one gets it; the others get half their money back. Works that stand on the land, like the Great Dam, belong to whoever holds that land.</p>
  </div>`;
}

/* ---------- Legacy ---------- */
function legacyHtml() {
  const n = game.nations[PLAYER];
  const { rank, of } = legacyRank(game, PLAYER);
  const by = n.prestigeBy || {};
  const log = (n.prestigeLog || []).slice(0, 5);
  return `<div class="block"><span class="eyebrow">Legacy</span>
    <div class="legacy-top"><span class="legacy-pts">${ICONS.star}<strong>${n.prestige || 0}</strong><span class="muted small">prestige</span></span><span class="small">${rank === 1 ? "The most renowned nation in the world" : `${ordinal(rank)} of ${of} nations`}</span></div>
    <div class="chips">${Object.entries(PRESTIGE_CATS).filter(([k]) => by[k]).map(([k, c]) => `<span class="chip" style="border-color:${c.color}">${c.label} ${by[k]}</span>`).join("") || `<span class="muted small">Earn prestige from ambitions, great works, world firsts and the Assembly.</span>`}</div>
    ${log.length ? `<ul class="factors">${log.map(x => `<li><span class="small">${escapeHtml(x.why)}</span><span class="num small tone-${toneOf(x.pts)}">${signed(x.pts)}</span></li>`).join("")}</ul>` : ""}
    <div class="actions"><button class="btn" type="button" data-action="legacy-open">Legacy of every nation</button></div>
  </div>`;
}

function agendaTabHtml() {
  return pendingDecisionsHtml() + leaderBlockHtml() + ambitionsHtml() + worksHtml() + legacyHtml();
}

/* ---------- The decision card ---------- */
function decisionHtml(d) {
  const place = d.cell >= 0 && game.owner[d.cell] === PLAYER ? (game.cities.find(c => c.cell === d.cell) || nearestCity(game, d.cell, PLAYER)) : null;
  const def = d.options.find(o => o.id === d.def) || d.options[0];
  const more = myDecisions().length - 1;
  return `<div class="dispatch decision tone-${d.tone}" role="dialog" aria-modal="true" aria-labelledby="dec-title">
    <div class="dec-top"><span class="dec-badge">${decIcon(d)}</span>
      <div class="block" style="gap:4px"><span class="eyebrow">${escapeHtml(d.cat)}${place ? ` · ${escapeHtml(place.name)}` : ""} · decide by ${seasonLabel(d.expires)}</span><h2 id="dec-title">${escapeHtml(d.title)}</h2></div></div>
    <p class="dec-body">${escapeHtml(d.body)}</p>
    <div class="dec-options">${d.options.map((o, i) => `<button class="dec-opt" type="button" data-action="dec-choose" data-id="${d.id}" data-opt="${o.id}">
        <span class="dec-key">${i + 1}</span>
        <span class="dec-label"><strong>${escapeHtml(o.label)}</strong>${o.sub ? `<span class="muted small">${escapeHtml(o.sub)}</span>` : ""}<span class="chips">${effectChipsHtml(o.effects)}</span></span>
      </button>`).join("")}</div>
    <div class="dec-foot">
      <span class="muted small">If you don't decide by ${seasonLabel(d.expires)}, your ministers will choose “${escapeHtml(def.label)}”.${more > 0 ? ` ${more} more decision${more > 1 ? "s" : ""} waiting.` : ""}</span>
      <div class="actions">${d.cell >= 0 && d.key !== "succession" ? `<button class="btn" type="button" data-action="dec-map" data-cell="${d.cell}">Show on the map</button>` : ""}<button class="btn" type="button" data-action="dec-later">Decide later <kbd>Esc</kbd></button></div>
    </div>
  </div>`;
}
function openDecision(id) {
  const d = game && game.decisions.find(x => x.id === id && x.nid === PLAYER);
  ui.decision = d ? d.id : null;
}
function autoOpenDecision() {
  if (!game || ui.phase !== "play") return;
  const d = myDecisions().find(x => !(ui.seenDecisions || []).includes(x.id));
  if (d) { ui.seenDecisions = (ui.seenDecisions || []).concat([d.id]); ui.decision = d.id; }
}

/* ---------- Coming up: what finishes soon (one more turn…) ---------- */
function comingUpHtml() {
  const n = game.nations[PLAYER], items = [];
  for (const d of myDecisions()) items.push({ t: -1, html: `<button class="cu-item urgent" type="button" data-action="dec-open" data-id="${d.id}"><span class="cu-ic">${decIcon(d)}</span><span class="cu-txt">${escapeHtml(d.title)}</span><span class="cu-t">decide</span></button>` });
  for (const p of game.projects.filter(p => p.nid === PLAYER)) { const left = p.seasons - p.progress; items.push({ t: left, html: `<button class="cu-item" type="button" data-action="panel-open" data-p="${p.kind === "ships" || p.kind === "portup" ? "navy" : p.kind === "focus" || p.kind === "capital" ? "cities" : "realm"}"><span class="cu-ic">${ICONS[p.kind === "road" ? "road" : p.kind === "town" ? "town" : p.kind === "site" ? "pick" : p.kind === "ships" ? (p.ship === "freighter" ? "freighter" : p.ship) : p.kind === "port" || p.kind === "portup" || p.kind === "wharf" ? "anchor" : p.kind === "focus" || p.kind === "capital" ? "city" : "output"]}</span><span class="cu-txt">${escapeHtml(p.label)}</span><span class="cu-t">${left} season${left === 1 ? "" : "s"}</span></button>` }); }
  if (n.groups) for (const k of GROUP_ORDER) { const s = n.groups[k]; if (!s.demand || s.share < 0.1) continue; const left = s.demand.until - game.turn; items.push({ t: left, html: `<button class="cu-item" type="button" data-action="panel-open" data-p="groups"><span class="cu-ic">${groupIc(k)}</span><span class="cu-txt">${escapeHtml(GROUPS[k].label)}: ${escapeHtml(s.demand.label)}</span><span class="cu-t">${left} season${left === 1 ? "" : "s"}</span></button>` }); }
  const R = n.research;
  if (R && R.target && !hasTech(n, R.target)) {
    const pts = researchPoints(n, economies()[PLAYER]);
    const left = pts > 0 ? Math.max(1, Math.ceil((TECHS[R.target].cost - R.progress) / pts)) : 99;
    items.push({ t: left, html: `<button class="cu-item" type="button" data-action="panel-open" data-p="economy"><span class="cu-ic">${ICONS.flask}</span><span class="cu-txt">${escapeHtml(TECHS[R.target].label)}</span><span class="cu-t">${left > 40 ? "slow" : `${left} season${left === 1 ? "" : "s"}`}</span></button>` });
  }
  for (const key in game.works) {
    const b = game.works[key].builders && game.works[key].builders[PLAYER];
    if (b) items.push({ t: b.seasons - b.progress, html: `<button class="cu-item" type="button" data-action="panel-open" data-p="agenda"><span class="cu-ic">${ICONS.star}</span><span class="cu-txt">${escapeHtml(WORKS[key].label)}</span><span class="cu-t">${b.paused ? "paused" : `${b.seasons - b.progress} season${b.seasons - b.progress === 1 ? "" : "s"}`}</span></button>` });
  }
  for (const a of game.amb.active) {
    const p = AMBITIONS[a.key].progress(ambCtxUI(), a);
    items.push({ t: a.deadline - game.turn + 0.5, html: `<button class="cu-item" type="button" data-action="panel-open" data-p="agenda"><span class="cu-ic">${ICONS.flag}</span><span class="cu-txt">${escapeHtml(a.title)}</span><span class="cu-t">${pct(clamp(p.frac, 0, 1))} · ${a.deadline - game.turn} seasons</span></button>` });
  }
  if (game.amb.active.length < AMBITION_SLOTS && game.turn >= 1) items.push({ t: 50, html: `<button class="cu-item soft" type="button" data-action="panel-open" data-p="agenda"><span class="cu-ic">${ICONS.flag}</span><span class="cu-txt">Set a national ambition</span><span class="cu-t">${AMBITION_SLOTS - game.amb.active.length} free</span></button>` });
  if (!items.length) return "";
  items.sort((a, b) => a.t - b.t);
  const shown = ui.cuOpen === false ? [] : items.slice(0, 6);
  return `<button class="cu-head" type="button" data-action="cu-toggle" aria-expanded="${ui.cuOpen !== false}">Coming up <span class="muted">${ui.cuOpen === false ? `${items.length} ▴` : "▾"}</span></button>${shown.map(x => x.html).join("")}`;
}

/* ---------- Intelligence: war risk, shown in the Nations panel ---------- */
const riskCache = { key: "", map: new Map() };
function riskOf(nid) {
  const key = `${mapVersion}|${game.turn}|${game.ver}`;
  if (riskCache.key !== key) { riskCache.key = key; riskCache.map = new Map(); }
  if (!riskCache.map.has(nid)) riskCache.map.set(nid, withEconMemo(game, () => warRisk(world, game, nid)));
  return riskCache.map.get(nid);
}
function riskPillHtml(nid) {
  const r = riskOf(nid);
  if (!r) return "";
  return `<span class="risk r${r.level}" title="Risk that they attack you">${r.level >= 2 ? "⚠ " : ""}War risk: ${r.label.toLowerCase()}</span>`;
}
function intelHtml(n) {
  const r = riskOf(n.id);
  if (!r) return "";
  const lines = r.lines || [];
  const motives = lines.filter(l => l.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 3);
  const brakes = lines.filter(l => l.pts < 0).sort((a, b) => a.pts - b.pts).slice(0, 3);
  const ratio = armyPower(game, n.id) / Math.max(1, armyPower(game, PLAYER));
  const tips = [];
  if (r.level >= 1) {
    if (ratio > 0.9) tips.push(`a bigger army (theirs is ${ratio.toFixed(1)}× yours)`);
    if (!alliesOf(game, PLAYER).length) tips.push("an ally they would have to fight too");
    if (!hasTreaty(game, PLAYER, n.id, "nap")) tips.push("a non-aggression pact with them");
    tips.push("warmer relations: letters, trade, help in the Assembly");
  }
  return `<div class="block intel r${r.level}">
    <div class="law-head"><strong>${ICONS.eye} Intelligence · war risk: ${r.label}</strong><span class="risk-meter">${[0, 1, 2, 3].map(k => `<i class="${k <= r.level ? "on" : ""}"></i>`).join("")}</span></div>
    <p class="small">${escapeHtml(r.why)}${r.chance !== undefined ? ` Their own estimate of winning: about ${pct(r.chance)}.` : ""}</p>
    ${motives.length ? `<span class="muted small">What draws them to war</span><ul class="factors">${motives.map(l => `<li><span class="small">${escapeHtml(l.label)}</span><span class="num small tone-bad">${signed(l.pts)}</span></li>`).join("")}</ul>` : ""}
    ${brakes.length ? `<span class="muted small">What holds them back</span><ul class="factors">${brakes.map(l => `<li><span class="small">${escapeHtml(l.label)}</span><span class="num small tone-good">${signed(l.pts)}</span></li>`).join("")}</ul>` : ""}
    ${tips.length ? `<p class="muted small">What would make them think again: ${tips.join("; ")}.</p>` : ""}
  </div>`;
}

/* ---------- The dispatch: what this season brought ---------- */
function dispatchV16Html(d) {
  const sec = (title, list, color) => list.length ? `<div class="block"><span class="eyebrow">${title}</span><ul class="news">${list.map(x => `<li><span class="dot" style="background:${x.color || color}"></span><span>${escapeHtml(x.text)}</span></li>`).join("")}</ul></div>` : "";
  const decs = (d.decisions || []).filter(x => game.decisions.some(y => y.id === x.id));
  const decHtml = decs.length ? `<div class="block"><span class="eyebrow">A decision awaits you</span>${decs.map(x => `<button class="dec-row tone-${x.tone}" type="button" data-action="dec-open-now" data-id="${x.id}"><span class="dec-ic">${decIcon(x)}</span><span class="dec-txt"><strong>${escapeHtml(x.title)}</strong><span class="muted small">${escapeHtml(x.cat)}</span></span><span class="go">Decide</span></button>`).join("")}</div>` : "";
  return decHtml
    + sec("Your leader", (d.leader || []).map(t => ({ text: t })), "var(--gold)")
    + sec("Ambitions", (d.ambitions || []).map(x => ({ text: x.text, color: x.tone === "good" ? "var(--good)" : "var(--bad)" })), "var(--gold)")
    + sec("World firsts and great works", (d.firsts || []).map(x => ({ text: x.text, color: x.nid !== null && x.nid !== undefined && game.nations[x.nid] ? NATION_COLORS[x.nid] : "var(--gold)" })), "var(--gold)");
}

/* ---------- Great works on the map: landmarks the whole world can see ---------- */
const WORK_SLOTS = { monument: 0, academy: 1, exchange: 2, harbor: 3, fair: 4, broadcast: 5, railway: 6, dam: 7, forts: 8, atomic: 9 };
function workDrawCell(key, W, cell) {
  if (!game.cities.some(c => c.cell === cell)) return { cell, dx: 0, dy: 0 };
  const a = (25 + WORK_SLOTS[key] * 15) * Math.PI / 180;
  return { cell, dx: Math.cos(a) * 1.05, dy: 0.25 + Math.sin(a) * 0.95 };
}
function workGlyph(c, key, x, y, s, color) {
  if (WORK_GLYPHS[key]) giDraw(c, WORK_GLYPHS[key], x, y, s * 2.15, color);
}
function drawWorks(c, cs) {
  view.workBoxes = [];
  if (!game || !game.works || cs < 7) return;
  const r = clamp(cs * 0.27, 7, 14);
  for (const key of WORK_ORDER) {
    const W = game.works[key];
    if (!W) continue;
    const done = W.owner !== null && W.owner !== undefined;
    const sites = done ? [{ cell: W.cell, owner: workHolder(game, key) >= 0 ? workHolder(game, key) : W.owner, f: 1 }]
      : Object.entries(W.builders || {}).map(([id, b]) => ({ cell: b.cell, owner: Number(id), f: b.progress / b.seasons }));
    for (const st of sites) {
      if (st.cell < 0) continue;
      const pos = workDrawCell(key, W, st.cell);
      const [x0, y0] = cellCenter(st.cell, cs);
      const x = x0 + pos.dx * cs, y = y0 + pos.dy * cs;
      if (x < -30 - view.ox || y < -30 - view.oy || x > view.vw - view.ox + 30 || y > view.vh - view.oy + 30) continue;
      view.workBoxes.push({ key, x, y, r, cell: st.cell });
      const color = NATION_COLORS[st.owner] || "#cfc6b4";
      c.save();
      c.globalAlpha = done ? 1 : 0.92;
      c.fillStyle = "rgba(14,12,10,0.88)";
      c.beginPath(); c.arc(x, y, r + 2, 0, Math.PI * 2); c.fill();
      if (done) {
        const gr = c.createRadialGradient(x, y - r * 0.3, r * 0.2, x, y, r);
        gr.addColorStop(0, "#f6e3a1"); gr.addColorStop(1, "#c9a344");
        c.fillStyle = gr;
      } else c.fillStyle = "#3a3830";
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = color; c.lineWidth = Math.max(2, r * 0.2);
      c.beginPath();
      if (done) c.arc(x, y, r + 1.5, 0, Math.PI * 2);
      else c.arc(x, y, r + 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * st.f);
      c.stroke();
      if (!done) { c.setLineDash([2, 3]); c.strokeStyle = "rgba(240,230,200,0.5)"; c.lineWidth = 1; c.beginPath(); c.arc(x, y, r + 1.5, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
      workGlyph(c, key, x, y, r * 0.62, done ? "#2a2010" : "#e8dfc8");
      c.restore();
      if (cs >= 22) {
        const fs = clamp(cs * 0.36, 10, 12), text = done ? WORKS[key].label : `${WORKS[key].label} · ${pct(st.f)}`;
        c.font = `600 ${fs}px "IBM Plex Sans", system-ui, sans-serif`;
        drawPlaceLabel(c, text, x - c.measureText(text).width / 2, y + r + fs * 0.9, fs, 600, done ? 0.95 : 0.8);
      }
    }
  }
}
function hitWork(px, py) {
  for (const b of view.workBoxes || []) if (Math.hypot(px - b.x, py - b.y) <= b.r + 3) return b;
  return null;
}

/* ---------- Statistics: the legacy of every nation ---------- */
const FIRST_TEXT = Object.fromEntries(FIRSTS.map(f => [f.key, f.text]).concat([["work", "complete a great work"]]));
function statsLegacyHtml() {
  const g = game, W = statsWidth();
  const rows = liveNations(g).slice().sort((a, b) => (b.prestige || 0) - (a.prestige || 0));
  const cats = Object.keys(PRESTIGE_CATS);
  const worksOf = id => Object.values(g.works).filter(x => x.owner === id).length;
  const table = `<div class="st-tablewrap"><table class="st-table"><thead><tr><th>#</th><th class="l">Nation</th><th>Prestige</th>${cats.map(k => `<th>${PRESTIGE_CATS[k].label}</th>`).join("")}<th>Works</th><th class="l">Leader</th></tr></thead>
    <tbody>${rows.map((n, i) => `<tr class="${n.isPlayer ? "me" : ""}"><td class="muted">${i + 1}</td><td class="l"><button type="button" class="st-nlink" data-action="st-nation" data-nid="${n.id}">${swatch(n)}${escapeHtml(n.name)}</button></td><td><strong>${n.prestige || 0}</strong></td>${cats.map(k => `<td>${(n.prestigeBy || {})[k] || "<span class=\"muted\">–</span>"}</td>`).join("")}<td>${worksOf(n.id) || "<span class=\"muted\">–</span>"}</td><td class="l small">${n.leader ? escapeHtml(leaderName(n)) : "<span class=\"muted\">no leader</span>"}</td></tr>`).join("")}</tbody></table></div>`;
  const firsts = Object.entries(g.firsts).sort((a, b) => b[1].turn - a[1].turn).map(([k, v]) => `<li><span class="when">${seasonLabel(v.turn)}</span>${swatch(g.nations[v.nid])}<span><strong>${escapeHtml(nameOf(g, v.nid))}</strong>: first to ${escapeHtml(FIRST_TEXT[k] || k)}</span></li>`).join("");
  const works = WORK_ORDER.map(k => {
    const Wk = g.works[k];
    if (!Wk) return "";
    if (Wk.owner !== null && Wk.owner !== undefined) { const h = workHolder(g, k); return `<li><span class="when">${seasonLabel(Wk.done)}</span>${swatch(g.nations[Wk.owner])}<span><strong>${WORKS[k].label}</strong> · built by the ${escapeHtml(nameOf(g, Wk.owner))}${h >= 0 && h !== Wk.owner ? ` · now held by the ${escapeHtml(nameOf(g, h))}` : ""}</span></li>`; }
    const racers = Object.entries(Wk.builders || {}).map(([id, b]) => `${swatch(g.nations[id])}${escapeHtml(nameOf(g, Number(id)))} ${pct(b.progress / b.seasons)}`).join(", ");
    return racers ? `<li><span class="when">being built</span><i class="sw"></i><span><strong>${WORKS[k].label}</strong> · ${racers}</span></li>` : "";
  }).join("");
  const past = (g.story.past || []).slice(0, 16).map(x => `<li><span class="when">${seasonLabel(x.turn)}</span>${swatch(g.nations[x.nid])}<span><strong>${escapeHtml(nameOf(g, x.nid))}</strong> · ${escapeHtml(x.title)}: ${escapeHtml(x.choice.charAt(0).toLowerCase() + x.choice.slice(1))}${x.auto ? " (left to ministers)" : ""}</span></li>`).join("");
  return `<div class="st-grid">
    ${card("Legacy of the nations", table, { wide: true, note: `${ERAS[g.era || 0].name} · prestige from ambitions, great works, world firsts, the Assembly and great leaders` })}
    ${card("Prestige over time", lineChart(seriesFor(g, "prestige", { hide: ui.stats.hidden }), { width: W.half, height: 230, axis: v => `${Math.round(v)}`, fmt: v => `${Math.round(v)}`, zero: true }))}
    ${card("Great works of the world", works ? `<ul class="st-chron">${works}</ul>` : `<p class="muted small">No nation has begun a great work yet.</p>`)}
    ${card("World firsts", firsts ? `<ul class="st-chron">${firsts}</ul>` : `<p class="muted small">No world firsts yet.</p>`)}
    ${card("Hard choices", past ? `<ul class="st-chron">${past}</ul>` : `<p class="muted small">No leader has faced a hard choice yet.</p>`, { note: "what each government chose" })}
  </div>`;
}

/* ---------- Actions ---------- */
const V16_ACTIONS = {
  "dec-open": el => openDecision(Number(el.dataset.id)),
  "dec-open-now": el => { ui.dispatch = null; openDecision(Number(el.dataset.id)); },
  "dec-later": () => { ui.decision = null; },
  "dec-map": el => { const c = Number(el.dataset.cell); ui.decision = null; centerOnCell(c, Math.max(view.zoom, 2.4)); },
  "dec-choose": el => {
    const d = game.decisions.find(x => x.id === Number(el.dataset.id));
    if (!d) { ui.decision = null; return; }
    const r = decide(world, game, d, el.dataset.opt, false);
    ui.decision = null;
    flashHint(`${d.title.replace(/[?.!]$/, "")}: ${r.option.label}.`);
    bumpMap();
    autoOpenDecision();
  },
  "amb-pick": el => { if (pickAmbition(world, game, Number(el.dataset.id))) bumpMap(); },
  "amb-drop-ask": el => { ui.ambDrop = Number(el.dataset.id); },
  "amb-keep": () => { ui.ambDrop = null; },
  "amb-drop": el => { dropAmbition(world, game, Number(el.dataset.id)); ui.ambDrop = null; bumpMap(); },
  "work-confirm": el => { ui.workConfirm = el.dataset.key; ui.workCancel = null; },
  "work-confirm-no": () => { ui.workConfirm = null; },
  "work-start": el => {
    const q = quoteWork(world, game, PLAYER, el.dataset.key, economies()[PLAYER]);
    ui.workConfirm = null;
    if (!q.ok) { flashHint(q.reason); return; }
    startWork(game, q);
    addChronicle(game, `You began building the ${WORKS[q.work].label} (${fmtMoney(q.installment)} a season for ${q.seasons} seasons).`, "good", PLAYER);
    bumpMap();
  },
  "work-pause": el => { const b = (game.works[el.dataset.key] || {}).builders; if (b && b[PLAYER]) b[PLAYER].paused = !b[PLAYER].paused; },
  "work-cancel-ask": el => { ui.workCancel = el.dataset.key; ui.workConfirm = null; },
  "work-cancel-no": () => { ui.workCancel = null; },
  "work-cancel": el => { const back = stopWork(game, el.dataset.key, PLAYER, 0.5); addChronicle(game, `You stopped building the ${WORKS[el.dataset.key].label}. ${fmtMoney(back)} was recovered.`, "warn", PLAYER); ui.workCancel = null; bumpMap(); },
  "legacy-open": () => { openStats(); ui.stats.view = "legacy"; },
  "cu-toggle": () => { ui.cuOpen = ui.cuOpen === false; },
  "panel-open": el => { ui.tab = el.dataset.p; },
};
Object.assign(ACTIONS, V16_ACTIONS);
Object.assign(ACTIONS, { "credits-open": () => { ui.credits = true; }, "credits-close": () => { ui.credits = false; } });

function myWorkPay() {
  let s = 0;
  for (const k in game.works) { const b = game.works[k].builders && game.works[k].builders[PLAYER]; if (b && !b.paused) s += b.cost / b.seasons; }
  return s;
}
function worksBudgetRowHtml() {
  const rows = [];
  for (const k in game.works) {
    const b = game.works[k].builders && game.works[k].builders[PLAYER];
    if (b && !b.paused) rows.push(`<div class="row"><span>${escapeHtml(WORKS[k].label)}<span class="sub">Great work · season ${b.progress + 1} of ${b.seasons}</span></span><span class="num">${fmtMoney(-b.cost / b.seasons)}</span></div>`);
  }
  return rows.join("");
}

function onClick(e) {
  if (e.target.closest("#stats")) { onStatsClick(e); return; }
  if (e.target.closest("#assembly")) { onAssemblyClick(e); return; }
  if (game && ui.phase === "play" && !ui.ending && (!deliberation || deliberation.turn !== game.turn || deliberation.gameRef !== game)) startDeliberation();
  const pick = e.target.closest("[data-city-pick]");
  if (pick) { ui.selectedCity = Number(pick.dataset.cityPick); ui.selectedCell = -1; ui.tab = "selected"; renderAll(); return; }
  const el = e.target.closest("[data-action],[data-tab],[data-tool],[data-law],tr[data-city]");
  if (e.target.closest("details summary")) return;
  if (!el || el.disabled) return;
  if (el.dataset.action && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el);
  else if (el.dataset.tab) ui.tab = el.dataset.tab;
  else if (el.dataset.tool) setTool(el.dataset.tool);
  else if (el.dataset.law) setLaw(el.dataset.law, el.dataset.value);
  else if (el.dataset.city) { ui.selectedCity = Number(el.dataset.city); ui.selectedCell = -1; ui.tab = "selected"; }
  saveGame();
  renderAll();
}

function onLawHover(e) {
  const el = e.target.closest("[data-law]");
  if (!el || !game) return;
  const law = el.dataset.law;
  const span = document.getElementById(`law-effect-${law}`);
  if (span) span.textContent = lawEffectText(law, law === "tax" ? Number(el.dataset.value) : el.dataset.value);
}
function onLawLeave(e) {
  const seg = e.target.closest(".seg");
  if (!seg || !game || (e.relatedTarget && seg.contains(e.relatedTarget))) return;
  const lawEl = seg.querySelector("[data-law]");
  if (!lawEl) return;
  const law = lawEl.dataset.law;
  const span = document.getElementById(`law-effect-${law}`);
  if (span) span.textContent = lawEffectText(law, game.nations[PLAYER].laws[law]);
}

function onKey(e) {
  if (e.target.matches("input, textarea, select")) return;
  if (ui.credits) {
    if (e.key === "Escape" || e.key === "Enter") { ui.credits = false; renderAll(); e.preventDefault(); }
    return;
  }
  if (ui.saves) {
    if (e.key === "Escape" || e.key.toLowerCase() === "l") { ui.saves = null; renderAll(); e.preventDefault(); }
    return;
  }
  if (e.key.toLowerCase() === "l" && !ui.play && !ui.waiting && !ui.dispatch && !ui.stats && !ui.asm && !ui.compose) { openSaves(); renderAll(); e.preventDefault(); return; }
  if (ui.decision && game && !ui.dispatch && !ui.stats && !ui.asm && !ui.play && !ui.saves) {
    const d = game.decisions.find(x => x.id === ui.decision);
    if (d) {
      if (e.key === "Escape") { ui.decision = null; renderAll(); e.preventDefault(); return; }
      const i = Number(e.key) - 1;
      if (Number.isInteger(i) && i >= 0 && i < d.options.length) { ACTIONS["dec-choose"]({ dataset: { id: String(d.id), opt: d.options[i].id } }); saveGame(); renderAll(); e.preventDefault(); }
      return;
    }
  }
  if (ui.stats) {
    if (e.key === "Escape" || e.key.toLowerCase() === "i") { ui.stats = null; renderAll(); e.preventDefault(); }
    return;
  }
  if (ui.asm) {
    if (e.key === "Escape" || e.key.toLowerCase() === "u") { if (ui.asm.compose && e.key === "Escape") ui.asm.compose = null; else ui.asm = null; renderAll(); e.preventDefault(); }
    return;
  }
  if (e.key.toLowerCase() === "u" && game && ui.phase !== "draw" && !ui.play && !ui.compose && !ui.waiting && !ui.dispatch) { openAssembly(); renderAll(); e.preventDefault(); return; }
  if (e.key.toLowerCase() === "i" && game && ui.phase !== "draw" && !ui.play && !ui.compose && !ui.waiting && !ui.dispatch) { openStats(); renderAll(); e.preventDefault(); return; }
  if (onTimeKey(e)) return;
  if (ui.play && (e.key === "Escape" || e.key === "Enter")) { ui.play.t = ui.play.end; e.preventDefault(); return; }
  if (!ui.dispatch && !ui.compose && !ui.waiting) {
    const step = 90;
    const cam = { "+": () => zoomStep(1), "=": () => zoomStep(1), "-": () => zoomStep(-1), "_": () => zoomStep(-1), "0": () => zoomFit(),
      arrowleft: () => panBy(step, 0), arrowright: () => panBy(-step, 0), arrowup: () => panBy(0, step), arrowdown: () => panBy(0, -step),
      a: () => panBy(step, 0), d: () => panBy(-step, 0), w: () => panBy(0, step), s: () => panBy(0, -step) }[e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase()];
    if (cam) { cam(); e.preventDefault(); return; }
  }
  if (ui.dispatch && (e.key === "Escape" || e.key === "Enter")) { ui.dispatch = null; autoOpenDecision(); renderAll(); e.preventDefault(); return; }
  if (ui.compose && e.key === "Escape") { ui.compose = null; renderAll(); return; }
  if (ui.compose || ui.waiting) return;
  if (ui.phase !== "play") return;
  const k = e.key.toLowerCase();
  if (k === "escape" && ui.fleetSel.length && ui.tool === "select") { ui.fleetSel = []; ui.fleetHover = null; }
  else if (k === "escape" && ui.sel.length && ui.tool === "select") { ui.sel = []; ui.hoverPath = null; ui.confirmDisband = false; }
  else if (k === "h" && ui.sel.length) haltSel();
  else if (k === "g" && ui.sel.length) setSelAuto(true);
  else if (k === "escape" && ui.tab && !ui.pending) ui.tab = null;
  else if (k === "escape") setTool("select");
  else if (PANELS.some(q => q[3] === k)) { const p = PANELS.find(q => q[3] === k)[0]; ui.tab = ui.tab === p ? null : p; }
  else if (k === "r") setTool("road");
  else if (k === "t") setTool("town");
  else if (k === "v") setTool("select");
  else if (k === "e") ui.resView = !ui.resView;
  else return;
  renderAll();
}

function bindEvents() {
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAt(view.zoom * Math.exp(-e.deltaY * 0.0018), e.clientX - rect.left, e.clientY - rect.top);
    document.getElementById("tooltip").hidden = true;
  }, { passive: false });
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  bindStats();
  bindAssembly();
  const sb = document.getElementById("sidebar");
  sb.addEventListener("mouseover", onLawHover);
  sb.addEventListener("mouseout", onLawLeave);
  sb.addEventListener("input", e => {
    if (e.target.id === "nation-name") { ui.name = e.target.value.slice(0, 32); scheduleMapRender(); }
  });
  sb.addEventListener("change", e => {
    if (e.target.id === "raise-city") { ui.raiseCity = Number(e.target.value); renderSidebar(); }
  });
  sb.addEventListener("input", onCabinetInput);
  sb.addEventListener("change", onCabinetInput);
  sb.addEventListener("keydown", onCabinetKey);
  sb.addEventListener("toggle", onCabinetToggle, true);
  sb.addEventListener("toggle", onReportToggle, true);
  sb.addEventListener("input", onMeetingInput);
  sb.addEventListener("keydown", onMeetingKey);
  const cp = document.getElementById("composer");
  const onComposer = e => {
    const c = ui.compose;
    if (!c) return;
    const id = e.target.id;
    if (id === "letter-text") {
      c.text = e.target.value.slice(0, 1500);
      const send = cp.querySelector('[data-action="send-letter"]');
      if (send) send.disabled = !(game.lastLetter[c.to] !== game.turn && (c.terms.length ? !validateDeal(game, world, PLAYER, c.to, c.terms) : c.text.trim().length >= 10));
      return;
    }
    if (id === "letter-threat") { c.threat = e.target.checked; return; }
    if (id === "term-amount") { c.amount = e.target.value; return; }
    if (id === "term-seasons") { c.seasons = e.target.value; return; }
    if (id === "term-dir") { c.dir = e.target.value; return; }
    if (id === "term-city") { c.cityId = e.target.value; return; }
    if (e.type !== "change") return;
    if (id === "compose-to") { ui.compose = { ...newComposer(Number(e.target.value)), text: c.text, threat: c.threat }; ui.composeDirty = true; renderOverlays(); }
    if (id === "term-type") { c.termType = e.target.value; c.error = null; ui.composeDirty = true; renderOverlays(); }
  };
  cp.addEventListener("input", onComposer);
  cp.addEventListener("change", onComposer);
  new ResizeObserver(() => resizeCanvas()).observe(mapwrap);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => renderMap());
}

