/* =====================================================================
   16i. Cities in the panels and on the map: the city file, its mood and loyalty, programs, the Cities panel
   ===================================================================== */
Object.assign(ICONS, { city: giSvg("delapouite/modern-city"), fist: giSvg("lorc/fist") });
function roleIc(key) { const R = CITY_ROLES[key]; return R ? giSvg(R.icon) : ""; }
function cityProf(city) { return game ? cityProfile(world, game, city, economies()) : null; }
function moodTone(m) { return m >= 62 ? "good" : m < 30 ? "bad" : m < 42 ? "warn" : "neutral"; }
function moodColor(m) { return m >= 62 ? "var(--good)" : m < 30 ? "var(--bad)" : m < 42 ? "var(--warn)" : "var(--fg)"; }
function moodWord(m) { return m >= 75 ? "proud and content" : m >= 62 ? "content" : m >= 48 ? "calm" : m >= 40 ? "restless" : m >= 28 ? "angry" : "in revolt"; }
function cityRankText(p, n) { return `${cityOrd(p.rankN)} of ${p.ofN} in the ${n.name} · ${cityOrd(p.rankW)} of ${p.ofW} in the world`; }
function roleChipsHtml(p, max = 6) {
  return `<div class="cf-roles">${p.roles.slice(0, max).map(r => `<span class="cf-role" title="${escapeHtml(r.tip)}">${roleIc(r.key)}${escapeHtml(r.label)}</span>`).join("")}</div>`;
}
function popTrendSvg(c) {
  const h = (c.popHist || []).slice(-24);
  if (h.length < 2) return "";
  const W = 220, H = 34, lo = Math.min(...h) * 0.97, hi = Math.max(...h) * 1.03, span = Math.max(0.001, hi - lo);
  const pts = h.map((v, k) => `${(k / (h.length - 1) * W).toFixed(1)},${(H - (v - lo) / span * H).toFixed(1)}`).join(" ");
  const first = h[0], last = h[h.length - 1];
  return `<div class="cf-trend"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--gold)" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>
    <span class="muted small">${h.length - 1} year${h.length > 2 ? "s" : ""}: ${fmtPeople(first)} → ${fmtPeople(last)} (${last >= first ? "+" : "−"}${pct(Math.abs(last / Math.max(0.001, first) - 1))})</span></div>`;
}
function cityHistHtml(c) {
  const h = c.hist || [];
  const trend = popTrendSvg(c);
  return `<details class="block cf-hist"><summary>History of ${escapeHtml(c.name)}${c.founded ? ` · founded ${seasonLabel(c.founded)}` : ` · ${ageWords(cityAge(world, game, c))} old`}</summary>
    ${trend}
    ${h.length ? `<ul class="news">${h.slice(0, 12).map(x => `<li><span class="dot" style="background:${x.tone === "good" ? "var(--good)" : x.tone === "bad" ? "var(--bad)" : x.tone === "warn" ? "var(--warn)" : "var(--muted)"}"></span><span><span class="num muted small">${seasonLabel(x.turn)}</span><br>${escapeHtml(x.text)}</span></li>`).join("")}</ul>` : `<p class="muted small">Nothing has been written down yet: its story starts now.</p>`}
  </details>`;
}
function cityFileHtml(city, p) {
  const n = game.nations[city.owner];
  const cls = cityClass(p.imp), tier = cityTier(p.pop);
  const lines = p.lines.map(l => `<li><span>${escapeHtml(l.label)}</span><span class="num">+${Math.round(l.pts)}</span></li>`).join("");
  return `<div class="block cityfile">
    <div class="cf-head"><span class="cf-class">${escapeHtml(cls.label)}</span><span class="cf-imp num" title="Importance: how much this city matters, from its people, wealth, government, harbor, rivers and roads, industry, mines, farms, learning, borders and history">${p.imp}</span></div>
    <p class="small muted">${escapeHtml(tier.label)} · ${fmtPeople(p.pop)} people · ${escapeHtml(cityRankText(p, n))}</p>
    ${p.roles.length ? roleChipsHtml(p) : ""}
    <details><summary>Why ${escapeHtml(city.name)} matters (importance ${p.imp})</summary><ul class="factors">${lines}</ul>
      <p class="muted small">Importance decides how much its loss or capture weighs in a war and a peace, how much unrest there shakes the nation, and how hard enemy generals fight for it.</p></details>
  </div>`;
}
function cityMoodHtml(city, p) {
  const m = Math.round(city.mood ?? CITY.moodBase), t = Math.round(p.moodTarget ?? m);
  const terms = p.mood || [];
  const li = x => `<li><span>${escapeHtml(x.label)}</span><span class="num tone-${toneOf(x.value, 0.05)}">${signed1(x.value)}</span></li>`;
  const eff = 1 + CITY.outPerMood * (m - CITY.moodBase);
  return `<div class="block">
    <span class="eyebrow">Mood ${m} · ${moodWord(m)}${t !== m ? ` · heading to ${t}` : ""}</span>
    <div class="meter"><span style="width:${clamp(m, 0, 100)}%;background:${moodColor(m)}"></span><i style="left:calc(${clamp(t, 0, 100)}% - 1px)"></i></div>
    ${terms.length ? `<ul class="factors">${terms.slice(0, 6).map(li).join("")}</ul>` : ""}
    ${terms.length > 6 ? `<details><summary>${terms.length - 6} more causes</summary><ul class="factors">${terms.slice(6).map(li).join("")}</ul></details>` : ""}
    <p class="muted small">Output here ${eff >= 1 ? "+" : "−"}${pct1(Math.abs(eff - 1))} from the mood. Below 40, unrest here shakes the whole nation; below 28 the city riots. Each season the mood closes 30% of the gap to where it is heading.</p>
  </div>`;
}
function cityLoyaltyHtml(city, p) {
  if (city.origin === city.owner && (city.loyalty ?? 92) >= 80) return "";
  const L = Math.round(city.loyalty ?? 92);
  const o = city.origin !== city.owner ? game.nations[city.origin] : null;
  const rate = p.loyalRate || 0;
  const res = L < CITY.loyalResist ? 0.3 * (CITY.loyalResist - L) / CITY.loyalResist : 0;
  return `<div class="block">
    <span class="eyebrow">Loyalty ${L}${o ? ` · many still feel part of the ${escapeHtml(o.name)}` : ""}</span>
    <div class="meter"><span style="width:${clamp(L, 0, 100)}%;background:${L >= 70 ? "var(--good)" : L >= 40 ? "var(--warn)" : "var(--bad)"}"></span></div>
    <ul class="factors">
      ${o ? `<li><span>It changes ${rate >= 0 ? "+" : "−"}${Math.abs(rate).toFixed(1)} a season${cityFocusOn(game, city, "seat") ? " (faster as a provincial seat)" : ""}; a happier city comes to feel at home sooner</span></li>` : ""}
      ${res > 0.005 ? `<li><span class="tone-bad">Workers drag their feet: output −${pct(res)}</span></li>` : ""}
      ${L < CITY.loyalRaise ? `<li><span class="tone-bad">No divisions can be raised here until loyalty reaches ${CITY.loyalRaise}</span></li>` : ""}
      ${o && o.alive ? `<li><span>The ${escapeHtml(o.name)} has a just cause to win it back${L < 45 ? `, and if its army comes, the people may help it` : ""}. At ${CITY.integrate} for ${CITY.integrateSeasons} seasons, the claim ends.</span></li>` : ""}
    </ul>
  </div>`;
}
function cityProgramsHtml(city, p, r) {
  const mine = city.owner === PLAYER;
  const f = activeFocus(game, city);
  const pend = game.projects.find(q => q.kind === "focus" && q.cityId === city.id);
  const cur = f ? FOCI[f] : null;
  const up = f ? focusUpkeepCost(f, r) : 0;
  let html = `<div class="block"><span class="eyebrow">City program${cur ? ` · ${escapeHtml(cur.label)}` : ""}</span>`;
  if (cur) html += `<div class="cf-prog"><span class="cf-prog-ic">${giSvg(cur.icon)}</span><span><strong>${escapeHtml(cur.label)}</strong>${city.focusSince !== undefined ? ` <span class="muted small">since ${seasonLabel(city.focusSince)}</span>` : ""}<span class="sub">${escapeHtml(cur.does)}${mine ? ` Upkeep ${fmtMoneyFine(up)} a season.` : ""}</span></span></div>`;
  else html += `<p class="muted small">${mine ? "No program yet. A program shapes what the city becomes: it costs money once, takes a season or two, and a little upkeep every season." : "No city program."}</p>`;
  if (pend) html += `<p class="small tone-warn">Being set up: ${escapeHtml(FOCI[pend.focus].label)} (${pend.seasons - pend.progress} season${pend.seasons - pend.progress > 1 ? "s" : ""} left)${cur ? `; it replaces the ${escapeHtml(cur.label.toLowerCase())}` : ""}.</p>`;
  if (mine && !pend) {
    const ok = p.foci.filter(x => !x.why && x.key !== f), no = p.foci.filter(x => x.why);
    if (ok.length) html += `<div class="build-list">${ok.map(x => { const F = FOCI[x.key]; return `<button class="build-opt" type="button" data-action="quote-focus" data-city="${city.id}" data-focus="${x.key}"><span class="cf-opt"><span class="cf-prog-ic">${giSvg(F.icon)}</span><span><strong>${escapeHtml(F.label)}</strong><span class="sub">${escapeHtml(F.does)}</span></span></span><span class="num">${fmtMoney(focusSetupCost(x.key, r))}</span></button>`; }).join("")}</div>`;
    if (no.length) html += `<details><summary>Programs that do not fit ${escapeHtml(city.name)}</summary><ul class="factors">${no.map(x => `<li><span>${escapeHtml(FOCI[x.key].label)}<span class="sub">${escapeHtml(x.why)}</span></span></li>`).join("")}</ul></details>`;
  }
  return html + `</div>` + cityModsHtml(city);
}
/* What decisions left in the city: timed effects and lasting works. */
function cityModsHtml(city) {
  const ms = cityModsActive(game, city).filter(m => m.out || m.def || m.loyal || m.growth || m.noIntake || m.mood);
  if (!ms.length) return "";
  const li = m => {
    const parts = [];
    if (m.mood) parts.push(`mood ${signed(m.mood)}`);
    if (m.out) parts.push(`output ${signedPct(m.out, 0)}`);
    if (m.def) parts.push(`defenders ${signedPct(m.def, 0)}`);
    if (m.loyal) parts.push(`loyalty ${signed(m.loyal)} a season`);
    if (m.growth) parts.push(`${signedPct(m.growth * 4, 1)} growth a year`);
    if (m.noIntake) parts.push("closed to newcomers");
    const left = m.until === null || m.until === undefined ? "lasting" : `${Math.max(1, m.until - game.turn - 1)} season${Math.max(1, m.until - game.turn - 1) === 1 ? "" : "s"} left`;
    return `<li><span>${escapeHtml(m.label)}<span class="sub">${parts.join(", ")} · ${left}</span></span></li>`;
  };
  return `<div class="block"><span class="eyebrow">In effect here</span><ul class="factors">${ms.map(li).join("")}</ul></div>`;
}

/* ---------- The Cities panel ---------- */
function citiesTabHtml() {
  const prof = cityProfiles(world, game, economies());
  const n = game.nations[PLAYER];
  const mine = [...prof.values()].filter(p => p.owner === PLAYER).sort((a, b) => b.imp - a.imp);
  const econ = economies()[PLAYER];
  const progUp = econ.programs || 0;
  const top = mine[0];
  const unrest = mine.filter(p => p.occupied < 0 && (p.city.mood ?? 55) < 40);
  const row = p => {
    const c = p.city, m = Math.round(c.mood ?? 55), L = Math.round(c.loyalty ?? 92);
    const f = activeFocus(game, c), pend = game.projects.find(q => q.kind === "focus" && q.cityId === c.id);
    const roles = p.roles.filter(r => r.key !== "capital").slice(0, 3);
    return `<tr data-city="${c.id}"><td><span class="cf-rank num">${p.rankN}</span>${c.capital ? "★ " : ""}${escapeHtml(c.name)}${p.occupied >= 0 ? ` <span class="tone-bad small">occupied</span>` : ""}
      <span class="sub">${escapeHtml(cityTier(p.pop).label)}${roles.length ? ` · <span class="cf-ics">${roles.map(r => `<span title="${escapeHtml(r.label)}">${roleIc(r.key)}</span>`).join("")}</span> ${escapeHtml(roles.map(r => r.label).join(", "))}` : ""}${c.origin !== c.owner ? ` · <span class="tone-warn">loyalty ${L}</span>` : ""}</span></td>
      <td class="num">${p.imp}</td><td class="num tone-${moodTone(m)}">${p.occupied >= 0 ? "—" : m}${p.occupied < 0 && Math.abs((p.moodTarget ?? m) - m) >= 3 ? `<span class="muted">${p.moodTarget > m ? "▲" : "▼"}</span>` : ""}</td>
      <td class="small">${f ? escapeHtml(FOCI[f].label) : pend ? `<span class="tone-warn">${escapeHtml(FOCI[pend.focus].label)}…</span>` : `<span class="muted">—</span>`}</td></tr>`;
  };
  const world12 = [...prof.values()].filter(p => p.occupied < 0).sort((a, b) => b.imp - a.imp).slice(0, 12);
  const lost = game.cities.filter(c => c.origin === PLAYER && c.owner !== PLAYER && game.nations[c.owner] && game.nations[c.owner].alive);
  return `
    <div class="block">
      <span class="eyebrow">Your cities · ${mine.length} town${mine.length === 1 ? "" : "s"} · ${fmtPeople(econ.pop)} people</span>
      ${top ? `<p class="small">Your greatest city is <button class="linkbtn" type="button" data-city-pick="${top.id}">${escapeHtml(top.city.name)}</button>, a ${escapeHtml(cityClass(top.imp).label.toLowerCase())} (importance ${top.imp}, ${cityOrd(top.rankW)} in the world).${progUp > 0.005 ? ` City programs cost ${fmtMoneyFine(progUp)} a season.` : ""}</p>` : ""}
      ${unrest.length ? `<p class="notice">Unrest in ${unrest.map(p => `<button class="linkbtn" type="button" data-city-pick="${p.id}">${escapeHtml(p.city.name)}</button> (mood ${Math.round(p.city.mood)})`).join(", ")}. Unhappy cities produce less and shake the nation: click one to see why.</p>` : ""}
      <table class="regions cities"><thead><tr><th>City</th><th class="num" title="Importance">Imp.</th><th class="num">Mood</th><th>Program</th></tr></thead><tbody>${mine.map(row).join("")}</tbody></table>
      <p class="muted small">Every city is different: its importance comes from its people, wealth, government, harbor, rivers and roads, industry, mines, farms, learning, borders and history. Click a city to see why it matters, what its people feel and which programs fit it.</p>
    </div>
    ${lost.length ? `<div class="block"><span class="eyebrow">Cities you have lost</span><ul class="factors">${lost.map(c => `<li><span><button class="linkbtn" type="button" data-city-pick="${c.id}">${escapeHtml(c.name)}</button>, now the ${escapeHtml(nameOf(game, c.owner))}'s<span class="sub">${(c.loyalty ?? 92) < CITY.integrate ? `Its people still feel ${escapeHtml(n.name)}'s (loyalty to the ${escapeHtml(nameOf(game, c.owner))} ${Math.round(c.loyalty)}). You have a just cause to win it back.` : "Its people have come to feel at home there."}</span></span></li>`).join("")}</ul></div>` : ""}
    <div class="block">
      <span class="eyebrow">The greatest cities of the world</span>
      <table class="regions"><thead><tr><th>City</th><th class="num">People</th><th class="num">Imp.</th></tr></thead><tbody>
      ${world12.map((p, k) => `<tr data-city="${p.id}"><td><span class="cf-rank num">${k + 1}</span><span class="swatch" style="background:${NATION_COLORS[p.owner]}"></span>${escapeHtml(p.city.name)}${p.city.capital ? " ★" : ""}<span class="sub">${escapeHtml(nameOf(game, p.owner))} · ${escapeHtml(cityClass(p.imp).label)}${p.roles.filter(r => r.key !== "capital").length ? ` · ${escapeHtml(p.roles.filter(r => r.key !== "capital").slice(0, 2).map(r => r.label).join(", "))}` : ""}</span></td><td class="num">${fmtPeople(p.pop)}</td><td class="num">${p.imp}</td></tr>`).join("")}
      </tbody></table>
    </div>`;
}

/* ---------- The season report and the news ---------- */
function citiesDispatchHtml(d) {
  const list = d.cities || [];
  if (!list.length) return "";
  return `<div class="block"><span class="eyebrow">Cities</span><ul class="news">${list.map(x => `<li><span class="dot" style="background:${x.tone === "good" ? "var(--good)" : x.tone === "bad" ? "var(--bad)" : "var(--gold)"}"></span><span>${escapeHtml(x.text)}</span></li>`).join("")}</ul></div>`;
}

/* ---------- On the map ---------- */
function drawCityMarks(c, city, lx, ly, tw, size) {
  let x = lx + tw + size * 0.55;
  if ((city.mood ?? 55) < 30 && !(game.occ[city.cell] >= 0)) { giDraw(c, "lorc/fist", x, ly - size * 0.3, size * 0.95, "#ef7c68", "rgba(20,10,8,0.95)", 1.4); x += size * 1.05; }
  if (city.origin !== undefined && city.origin !== city.owner && (city.loyalty ?? 92) < 50 && game.nations[city.origin]) giDraw(c, "lorc/flying-flag", x, ly - size * 0.3, size * 0.95, NATION_COLORS[city.origin], "rgba(20,10,8,0.95)", 1.4);
}

