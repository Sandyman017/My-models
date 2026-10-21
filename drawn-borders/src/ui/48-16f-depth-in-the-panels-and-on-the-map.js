/* =====================================================================
   16f. Depth in the panels and on the map: work and the people who move for it, the food reserve,
        smelters, veterans, the weather of the season, and the "why" behind every number in the top bar
   ===================================================================== */
Object.assign(ICONS, {
  furnace: giSvg("delapouite/furnace"), granary: giSvg("delapouite/granary"), bindle: giSvg("delapouite/bindle"),
  wxSnow: giSvg("lorc/snowflake-2"), wxLeaf: giSvg("lorc/maple-leaf"), wxSprout: giSvg("lorc/sprout"), wxSun: giSvg("lorc/sun"),
});
function weatherIcon(sw) { return { thaw: ICONS.wxSprout, summer: ICONS.wxSun, rain: ICONS.wxLeaf, winter: ICONS.wxSnow }[sw.key] || ""; }
function fmtSignedMoneyFine(b) { return b >= 0 ? `+${fmtMoneyFine(b)}` : fmtMoneyFine(b); }
function capFirstLetter(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
function fmtSignedPeople(m) { return `${m >= 0 ? "+" : "−"}${fmtPeople(Math.abs(m))}`; }
function townById(econ, id) { return econ.regions.find(r => r.city.id === id) || null; }

/* ---------- The "why" cards: hover a number in the top bar to see what makes it ---------- */
function whyCard(title, big, rows, note) {
  const row = r => r.sec ? `<div class="wc-sec">${escapeHtml(r.sec)}</div>`
    : `<div class="wc-row${r.total ? " total" : ""}"><span class="l">${escapeHtml(r.label)}${r.sub ? `<small>${escapeHtml(r.sub)}</small>` : ""}</span><span class="n${r.tone ? ` tone-${r.tone}` : ""}">${escapeHtml(r.value ?? "")}</span></div>`;
  return `<div class="wc-head"><span class="wc-t">${escapeHtml(title)}</span><span class="wc-v">${escapeHtml(big)}</span></div>
    <div class="wc-rows">${rows.map(row).join("")}</div>${note ? `<p class="wc-note">${escapeHtml(note)}</p>` : ""}`;
}
function whyTreasury() {
  const n = game.nations[PLAYER];
  const b = forecast(world, game, PLAYER, n.laws).budget;
  const work = myWorkPay();
  const rows = [
    ["Taxes collected", b.revenue], ["Tariffs on imports", b.tariffs], ["Healthcare", -b.services], ["Education", -b.education], ["Research", -b.research],
    ["Army pay and upkeep", -b.armyUpkeep], ["Arms production", -b.arms.spend], ["Navy", -(b.navy || 0)], ["Roads, harbors and wharves", -b.upkeep],
    ["Grain for the food reserve", -(b.granary || 0)], ["Ministries", -(b.ministries || 0)], ["Great works", -work], ["Interest on debt", -b.interest],
  ].filter(([, v]) => Math.abs(v) >= 0.0005).map(([label, v]) => ({ label, value: fmtSignedMoneyFine(v), tone: v > 0 ? "good" : "" }));
  const bal = b.balance - work;
  rows.push({ label: bal >= 0 ? "Surplus this season" : "Deficit this season", value: fmtSignedMoneyFine(bal), tone: bal >= 0 ? "good" : "bad", total: true });
  return whyCard("Treasury", n.treasury >= 0 ? fmtMoney(n.treasury) : `Debt ${fmtMoney(-n.treasury)}`, rows, "What comes in and goes out every season. New projects are paid when you order them.");
}
function whyOutput() {
  const n = game.nations[PLAYER], econ = economies()[PLAYER];
  const h = n.history, prev = h.length >= 2 ? h[h.length - 2] : null;
  const rows = [{ sec: "By sector, a year" }];
  ["primary", "secondary", "tertiary", "quaternary"].forEach((k, i) => {
    const v = econ.sectors[k] ? econ.sectors[k].va : 0;
    const was = prev && prev.sec ? prev.sec[i] : null;
    const d = was !== null && was !== undefined ? v - was : 0;
    rows.push({ label: SECTORS[k].label, sub: SECTORS[k].blurb, value: `${fmtMoney(v)}${Math.abs(d) >= 0.1 ? ` (${fmtSignedMoney(d)})` : ""}`, tone: Math.abs(d) >= 0.1 ? toneOf(d) : "" });
  });
  const top = (econ.subs || []).slice().sort((a, b) => b.va - a.va).slice(0, 3);
  if (top.length) rows.push({ label: "Largest parts", sub: top.map(x => `${x.sub} ${fmtMoney(x.va)}`).join(" · "), value: "" });
  if ((econ.unemployed || 0) > 0.001) rows.push({ label: "Lost to unemployment", sub: `${fmtWorkers(econ.unemployed)} workers have no job (${pct1(econ.unemployment)})`, value: `−${fmtMoney(econ.lostToIdle || 0)}`, tone: "bad" });
  if ((econ.smallholders || 0) > 0.001) rows.push({ label: "Family plots in cut-off towns", sub: `${fmtWorkers(econ.smallholders)} people farm small plots for their own food: they earn little`, value: "" });
  if ((econ.armed || 0) > 0.001) rows.push({ label: "Soldiers under arms", sub: "they are not at work", value: `${pct(econ.armed)} of workers` });
  const change = prev && prev.gdp ? econ.gdp / prev.gdp - 1 : 0;
  return whyCard("Output", `${fmtMoney(econ.gdp)}/yr${prev ? ` · ${signedPct(change, 1)}` : ""}`, rows, "Changes are since last season. Click for the Economy panel.");
}
function whyPopulation() {
  const n = game.nations[PLAYER], econ = economies()[PLAYER];
  const h = n.history, prev = h.length >= 2 ? h[h.length - 2] : null;
  const pf = n.popFlow;
  const total = prev ? econ.pop - prev.pop : 0;
  const rows = [{ sec: "Last season" }];
  if (pf) {
    const ev = (pf.events || 0) + (n.popEvents || 0);
    const parts = [["Born, minus those who died", pf.births, "more where food is plentiful and healthcare good"], ["Hunger", pf.famine], ["Killed in war", pf.war], ["Decisions and events", ev]];
    let sum = 0;
    for (const [label, v, sub] of parts) { sum += v; if (Math.abs(v) >= 0.0005) rows.push({ label, sub, value: fmtSignedPeople(v), tone: v >= 0 ? "good" : "bad" }); }
    const other = total - sum;
    if (prev && Math.abs(other) >= 0.003) rows.push({ label: other > 0 ? "Land settled or won" : "Land lost or occupied", value: fmtSignedPeople(other), tone: other >= 0 ? "good" : "bad" });
    if (prev) rows.push({ label: "Change", value: fmtSignedPeople(total), tone: toneOf(total, 0.0005), total: true });
    if (pf.moved >= 0.001) rows.push({ label: "Moved between your towns", sub: "for work or food; the total does not change", value: fmtPeople(pf.moved) });
  } else rows.push({ label: "Shown after the next season ends", value: "" });
  rows.push({ sec: "Work" });
  rows.push({ label: "Workers", sub: `${pct((econ.workforce || 0) / Math.max(0.001, econ.pop))} of the people: men and women of working age${econ.people && econ.people.parts.kids > 0.0005 ? ", children" : ""}${econ.people && econ.people.parts.old > 0.0005 ? ", old people" : ""}; soldiers under arms are not counted`, value: fmtWorkers(econ.workforce || 0) });
  const u = econ.unemployment || 0;
  rows.push({ label: "Without a job", value: (econ.unemployed || 0) < 0.0005 ? "none" : `${fmtWorkers(econ.unemployed)} · ${pct1(u)}`, tone: u > 0.08 ? "bad" : u > JOBS.natural ? "warn" : "good" });
  if ((econ.smallholders || 0) > 0.001) rows.push({ label: "On family plots", sub: "in towns cut off from the market; a road would bring work", value: fmtWorkers(econ.smallholders) });
  const worst = econ.regions.filter(r => r.pop > 0.2).sort((a, b) => townURate(b) - townURate(a))[0];
  if (worst && townURate(worst) > 0.06) rows.push({ label: `Most jobless: ${worst.city.name}`, value: pct1(townURate(worst)), tone: "bad" });
  return whyCard("Population", fmtPop(econ.pop), rows, "Families move from towns without work to towns with work, and away from hunger.");
}
function whyFood() {
  const n = game.nations[PLAYER], econ = economies()[PLAYER];
  const fish = econ.regions.reduce((s, r) => s + (r.fish || 0), 0);
  const hv = econ.harvest || 1;
  const G = econ.granary, months = monthsOfFood((n.granary && n.granary.stock) || 0, econ.pop);
  const spare = econ.food - econ.pop;
  const rows = [
    { label: "Farms and fishing can feed", sub: `this year's harvest: ${harvestWord(hv)} (${pct(hv)} of normal)`, value: fmtPop(econ.food) },
    ...(fish > 0.005 ? [{ label: "of which fishing", value: fmtPeople(fish) }] : []),
    { label: "People to feed", value: fmtPop(econ.pop) },
    { label: spare >= 0 ? "To spare" : "Short", value: fmtPeople(Math.abs(spare)), tone: spare >= 0 ? "good" : "bad", total: true },
    { sec: "National food reserve" },
    { label: "In store", sub: `the law asks for ${GRANARY_LAWS[n.laws.granary || "none"].months} months`, value: `${fmtNum(months)} months` },
  ];
  if (G && G.release > 0.0005) rows.push({ label: "Handed out this season", sub: "the fields can't feed everyone", value: `${fmtPeople(G.release * 4)} fed`, tone: "warn" });
  if (G && G.fill > 0.0005) rows.push({ label: "Bought from your farms this season", value: fmtMoneyFine(G.fill * GRAN.priceB) });
  if (econ.famineShare > 0.001) rows.push({ label: "People short of food", value: pct(econ.famineShare), tone: "bad" });
  return whyCard("Food", `${pct(econ.food / Math.max(0.01, econ.pop))} of need${G && G.release > 0.0005 ? " + store" : ""}`, rows, "Towns joined by road share their food. Irrigation and fishing add more; the reserve feeds the towns joined to the capital when a harvest fails.");
}
function whyStability() {
  const n = game.nations[PLAYER], fc = forecast(world, game, PLAYER, n.laws);
  const base = fc.terms.find(t => t.base);
  const rest = fc.terms.filter(t => !t.base).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const shown = rest.slice(0, 7), more = rest.slice(7);
  const rows = (base ? [{ label: base.label, value: `${Math.round(base.value)}` }] : [])
    .concat(shown.map(t => ({ label: t.label, value: signed1(t.value), tone: toneOf(t.value, 0.05) })));
  if (more.length) { const s = sumTerms(more); rows.push({ label: `${more.length} smaller thing${more.length > 1 ? "s" : ""}`, value: signed1(s), tone: toneOf(s, 0.05) }); }
  rows.push({ label: "Where it is heading", value: `${Math.round(fc.target)}`, total: true });
  return whyCard("Stability", `${Math.round(n.stability)} → ${Math.round(fc.target)}`, rows, "Each season stability closes a quarter of the gap to where it is heading. At zero the government falls.");
}
function whyArmy() {
  const n = game.nations[PLAYER], econ = economies()[PLAYER];
  const mine = game.divisions.filter(d => d.owner === PLAYER);
  const c = { inf: 0, art: 0, arm: 0 };
  mine.forEach(d => { c[d.type]++; });
  const lv = EXP_LEVELS.map(L => ({ L, n: mine.filter(d => expLevel(d.exp) === L).length })).filter(x => x.n);
  const wings = game.airwings.filter(a => a.owner === PLAYER);
  const sw = seasonWar(game);
  const rows = [
    { label: "Infantry divisions", value: `${c.inf}` }, { label: "Artillery divisions", value: `${c.art}` }, { label: "Armored divisions", value: `${c.arm}` },
    ...(wings.length ? [{ label: "Air wings", value: `${wings.length} · ${fmtCount(wings.reduce((s, a) => s + a.planes, 0))} planes` }] : []),
    { label: "Soldiers", sub: `up to ${fmtCount(manpowerCap(n, econ))} may serve under your conscription law`, value: fmtCount(n.mil ? n.mil.men : 0) },
    ...(lv.length ? [{ label: "Experience", sub: "veterans fight better; green troops worse", value: lv.map(x => `${x.n} ${x.L.label.toLowerCase()}`).join(" · ") }] : []),
  ];
  const out = mine.filter(d => !d.supplied && !d.training).length;
  if (out) rows.push({ label: "Out of supply", value: `${out} division${out > 1 ? "s" : ""}`, tone: "bad" });
  const foes = enemiesOf(game, PLAYER);
  if (foes.length) rows.push({ label: "At war with", value: foes.map(f => nameOf(game, f)).join(", "), tone: "bad" });
  rows.push({ sec: `This season: ${sw.name}` });
  rows.push({ label: capFirstLetter(seasonEffectsList(sw).join("; ")) || "No penalties: the best season to campaign", value: "" });
  return whyCard("Army", `${mine.length} division${mine.length === 1 ? "" : "s"}`, rows, "Click for the Army panel.");
}
function whyPrestige() {
  const n = game.nations[PLAYER];
  const rk = legacyRank(game, PLAYER);
  const by = n.prestigeBy || {};
  const rows = Object.entries(PRESTIGE_CATS).filter(([k]) => by[k]).map(([k, C]) => ({ label: C.label, value: signed(by[k]), tone: toneOf(by[k]) }));
  const log = (n.prestigeLog || []).slice(0, 3);
  if (log.length) { rows.push({ sec: "Latest" }); for (const e of log) rows.push({ label: e.why || PRESTIGE_CATS[e.cat].label, sub: seasonLabel(e.turn), value: signed(e.pts), tone: toneOf(e.pts) }); }
  if (!rows.length) rows.push({ label: "None yet", sub: "world firsts, great works, ambitions, Assembly motions and your leader's deeds bring prestige", value: "" });
  return whyCard("Prestige", `${n.prestige || 0} · ${ordinal(rk.rank)} of ${rk.of}`, rows, "Click for your Agenda and legacy.");
}
function whySeason() {
  const sw = seasonWar(game);
  const next = SEASON_WAR[(game.turn + 1) % 4];
  const list = seasonEffectsList(sw);
  const rows = list.length ? list.map(t => ({ label: t.charAt(0).toUpperCase() + t.slice(1), value: "" })) : [{ label: "No penalties: dry ground and long days", value: "" }];
  rows.push({ label: `Next: ${next.name}`, sub: next.note, value: "" });
  return whyCard(sw.name, seasonLabel(game.turn), rows, "Roads are the way through any season.");
}
const WHY = { treasury: whyTreasury, output: whyOutput, population: whyPopulation, food: whyFood, stability: whyStability, army: whyArmy, prestige: whyPrestige, season: whySeason };
function whyEl() {
  let el = document.getElementById("whycard");
  if (!el) { el = document.createElement("div"); el.id = "whycard"; el.className = "whycard"; el.hidden = true; el.setAttribute("role", "tooltip"); document.body.appendChild(el); }
  return el;
}
function showWhy(target) {
  const fn = WHY[target.dataset.why];
  if (!fn || !game || ui.phase === "draw" || ui.play) return;
  const el = whyEl();
  try { el.innerHTML = fn(); } catch (e) { el.hidden = true; return; }
  el.hidden = false;
  const r = target.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const x = clamp(r.left + r.width / 2 - w / 2, 8, window.innerWidth - w - 8);
  let y = r.bottom + 10;
  if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 10);
  el.style.left = `${Math.round(x)}px`; el.style.top = `${Math.round(y)}px`;
}
function hideWhy() { const el = document.getElementById("whycard"); if (el) el.hidden = true; }
document.addEventListener("mouseover", e => { const t = e.target && e.target.closest ? e.target.closest("[data-why]") : null; if (t) showWhy(t); });
document.addEventListener("mouseout", e => { const t = e.target && e.target.closest ? e.target.closest("[data-why]") : null; if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) hideWhy(); });
document.addEventListener("focusin", e => { const t = e.target && e.target.closest ? e.target.closest("[data-why]") : null; if (t) showWhy(t); });
document.addEventListener("focusout", e => { if (e.target && e.target.closest && e.target.closest("[data-why]")) hideWhy(); });
document.addEventListener("pointerdown", () => hideWhy(), true);

/* ---------- Work in the Economy panel, the Realm panel and a town ---------- */
function migrationDelta(n, cityId) {
  const m = n.migr;
  if (!m || !m.flows) return 0;
  return m.flows.reduce((s, f) => s + (f.to === cityId ? f.people : 0) - (f.from === cityId ? f.people : 0), 0);
}
function jobsBlockHtml(econ) {
  const n = game.nations[PLAYER];
  const farm = econ.regions.reduce((s, r) => s + (r.farmWorkers || 0), 0), ind = econ.regions.reduce((s, r) => s + (r.indWorkers || 0), 0), svc = econ.regions.reduce((s, r) => s + (r.serviceWorkers || 0), 0);
  const u = econ.unemployment || 0;
  const small = econ.smallholders || 0;
  const rows = econ.regions.slice().sort((a, b) => townURate(b) - townURate(a)).map(r => {
    const ur = townURate(r), mv = migrationDelta(n, r.city.id);
    return `<tr data-city="${r.city.id}"><td>${r.city.capital ? "★ " : ""}${escapeHtml(r.city.name)}</td><td class="num">${fmtWorkers(r.workforce)}</td><td class="num tone-${ur > 0.12 ? "bad" : ur > JOBS.natural + 0.01 ? "warn" : "good"}">${pct1(ur)}</td><td class="num ${mv > 0 ? "tone-good" : mv < 0 ? "tone-warn" : "muted"}">${Math.abs(mv) >= 0.001 ? fmtSignedPeople(mv) : "–"}</td></tr>`;
  }).join("");
  return `<div class="block">
    <span class="eyebrow">Work · ${pct1(u)} of workers without a job</span>
    <div class="rows">
      <div class="row"><span>Workers<span class="sub">${pct((econ.workforce || 0) / Math.max(0.001, econ.pop))} of the people (see the People panel); soldiers under arms are not counted</span></span><span class="num">${fmtWorkers(econ.workforce || 0)}</span></div>
      <div class="row"><span>On the farms</span><span class="num">${fmtWorkers(farm)}</span></div>
      <div class="row"><span>In mines, plants and offices you built</span><span class="num">${fmtWorkers(ind)}</span></div>
      <div class="row"><span>In shops, transport, offices and public services<span class="sub">${fmtWorkers(econ.publicJobs || 0)} of them in hospitals, schools and government</span></span><span class="num">${fmtWorkers(svc)}</span></div>
      ${small > 0.001 ? `<div class="row"><span>On family plots<span class="sub">in towns cut off from the national market: they feed themselves but earn little</span></span><span class="num">${fmtWorkers(small)}</span></div>` : ""}
      <div class="row"><span>Without a job</span><span class="num tone-${u > 0.08 ? "bad" : u > JOBS.natural ? "warn" : "good"}">${(econ.unemployed || 0) < 0.0005 ? "none" : fmtWorkers(econ.unemployed)}</span></div>
    </div>
    <table class="regions"><thead><tr><th>Town</th><th class="num">Workers</th><th class="num">No job</th><th class="num">Moved</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted small">Every job in a mine, plant or office makes about ${JOBS.perIndustry} more in shops and services, and towns joined to a big market by road have more work. People move from towns without work to towns with work ("Moved" is last season). Above ${pct(JOBS.natural)} without work, people grow angry.</p>
  </div>`;
}
function townWorkHtml(city, r) {
  const n = game.nations[city.owner], econ = economies()[city.owner];
  const ur = townURate(r), wf = Math.max(1e-6, r.workforce);
  const parts = [["Farms", r.farmWorkers || 0, "#9db262"], ["Family plots", r.smallholders || 0, "#c9b56a"], ["Mines, plants, offices", r.indWorkers || 0, "#d08a4a"], ["Services", r.serviceWorkers || 0, "#5d9fc4"], ["No job", r.unemployed || 0, "#ef7c68"]].filter(([, v], k) => k !== 1 || v > 0.0005);
  const bar = `<div class="sector-bar">${parts.map(([l, v, col]) => `<span style="width:${(v / wf) * 100}%;background:${col}" title="${l} ${pct(v / wf)}"></span>`).join("")}</div>`;
  const legend = `<div class="legend">${parts.map(([l, v, col]) => `<span><i class="swatch" style="background:${col}"></i>${l} ${pct1(v / wf)}</span>`).join("")}</div>`;
  const m = n.migr && n.migr.flows ? n.migr.flows : [];
  const inn = m.filter(f => f.to === city.id), out = m.filter(f => f.from === city.id);
  const name = id => (cityById(id) || { name: "a town" }).name;
  const moves = [];
  if (inn.length) moves.push(`${fmtPeople(inn.reduce((s, f) => s + f.people, 0))} came from ${inn.slice(0, 3).map(f => escapeHtml(name(f.from))).join(", ")}`);
  if (out.length) moves.push(`${fmtPeople(out.reduce((s, f) => s + f.people, 0))} left for ${out.slice(0, 3).map(f => escapeHtml(name(f.to))).join(", ")}`);
  const cut = econ.networks[r.net] && !econ.networks[r.net].capital;
  const hint = (ur > 0.08 || (r.smallholders || 0) > 0.05 * wf) ? (cut ? "This town is cut off from the national market, so there is little paid work: many farm family plots. A road to the capital's network would bring work." : "A mine, a plant or an office here would bring work, and more for the shops around it.") : (r.vacancies || 0) > 0.01 ? "There is work waiting here: families from other towns will come." : "";
  return `<div class="block">
    <span class="eyebrow">Work · ${pct1(ur)} without a job</span>
    ${bar}${legend}
    ${townPeopleLine(city, r)}
    <p class="small">${fmtWorkers(r.workforce)} workers${(r.vacancies || 0) > 0.005 ? ` · ${fmtWorkers(r.vacancies)} jobs waiting` : ""}${moves.length ? `. Last season ${moves.join("; ")}.` : "."}</p>
    ${hint ? `<p class="muted small">${hint}</p>` : ""}
  </div>`;
}

/* ---------- The food reserve in the Economy panel ---------- */
function granaryBlockHtml(econ) {
  const n = game.nations[PLAYER];
  const G = econ.granary || {};
  const stock = (n.granary && n.granary.stock) || 0, months = monthsOfFood(stock, econ.pop), want = GRANARY_LAWS[n.laws.granary || "none"].months;
  const b = forecast(world, game, PLAYER, n.laws).budget;
  const last = n.granary && n.granary.last;
  const frac = want > 0 ? clamp(months / want, 0, 1) : months > 0 ? 1 : 0;
  return `<div class="block">
    <span class="eyebrow">Food reserve · ${fmtNum(months)} months in store</span>
    <div class="reserve"><span style="width:${frac * 100}%;background:${frac > 0.6 ? "var(--good)" : frac > 0.3 ? "var(--warn)" : "var(--bad)"}"></span></div>
    <div class="rows">
      <div class="row"><span>Grain in store<span class="sub">enough to feed all your people for ${fmtNum(months)} months</span></span><span class="num">${fmtNum(stock * 0.25)} Mt</span></div>
      ${(b.granaryFill || 0) > 0.0005 ? `<div class="row"><span>Bought from your farms this season</span><span class="num">${fmtMoneyFine(-(b.granary || 0))}</span></div>` : ""}
      ${last && last.release > 0.0005 && last.turn === game.turn - 1 ? `<div class="row"><span>Handed out last season<span class="sub">the harvest fell short</span></span><span class="num tone-warn">${fmtPeople(last.release * 4)} fed</span></div>` : ""}
      <div class="row"><span>This year's harvest<span class="sub">brought in each autumn; it feeds the nation for a year</span></span><span class="num tone-${(econ.harvest || 1) < 0.95 ? "warn" : (econ.harvest || 1) > 1.02 ? "good" : "neutral"}">${pct(econ.harvest || 1)} of normal</span></div>
      <div class="row"><span>Lost to damp and rats</span><span class="num">${pct(GRAN.spoil)} a season</span></div>
    </div>
    ${lawHtml("granary", "Keep in store", GRANARY_ORDER.map(k => ({ value: k, label: GRANARY_LAWS[k].months ? `${GRANARY_LAWS[k].months} months` : "None", sub: { none: "no store", small: "small", medium: "medium", large: "large" }[k] })))}
    <p class="muted small">In good years the state buys grain from your own farms and stores it. When a harvest falls short, the towns joined to the capital are fed from the store instead of going hungry. In a drought you can open the granaries.${G.spare !== undefined && G.fillWant > G.spare + 0.0005 ? " Your farms have little to spare, so the store fills slowly." : ""}</p>
  </div>`;
}
function granaryLawText(now, value, current) {
  const n = game.nations[PLAYER];
  const months = monthsOfFood((n.granary && n.granary.stock) || 0, now.econ.pop);
  if (current) return `${fmtNum(months)} months in store${now.budget.granary > 0.0005 ? ` · ${fmtMoneyFine(now.budget.granary)} a season to fill it` : ""}`;
  const alt = forecast(world, game, PLAYER, { ...n.laws, granary: value });
  const d = alt.budget.balance - now.budget.balance;
  if (!GRANARY_LAWS[value].months) return `If chosen: no food reserve; the state stops buying grain, and what is in store is kept until used or spoiled${Math.abs(d) >= 0.0005 ? ` · ${fmtSignedMoneyFine(d)} a season` : ""}`;
  return `If chosen: keep ${GRANARY_LAWS[value].months} months of food${Math.abs(d) >= 0.0005 ? ` · ${fmtSignedMoneyFine(d)} a season while it fills` : " · no extra cost now"}`;
}

/* ---------- Smelters in the site panel ---------- */
function smelterBlockHtml(s, x, mine) {
  if (s.kind !== "mine") return "";
  const econ = economies()[game.owner[s.cell]] || emptyEconomy();
  const sm = x && x.smelterX;
  if (s.smelter) {
    const rate = sm ? sm.rate ?? 0 : 0;
    const short = [];
    if (sm) {
      if ((sm.fill ?? 1) < 0.95) short.push("workers");
      if ((econ.sat.coal ?? 1) < 0.95) short.push("coal");
      if ((econ.sat.power ?? 1) < 0.95) short.push("electricity");
    }
    return `<div class="block">
      <span class="eyebrow">Smelter</span>
      <div class="rows">
        <div class="row"><span>Ore smelted<span class="sub">the rest leaves as ore</span></span><span class="num">${sm ? pct((sm.processed || 0) / Math.max(1e-6, x.outUnits || 0)) : "–"}</span></div>
        <div class="row"><span>Worth added</span><span class="num">${fmtMoney(sm ? sm.va || 0 : 0)}/yr</span></div>
        <div class="row"><span>Coal burned</span><span class="num">${fmtNum(sm ? (sm.processed || 0) * INDUSTRIES.smelter.in.coal * RES[2].perUnit : 0)} Mt a year</span></div>
        <div class="row"><span>Workers</span><span class="num">${fmtWorkers(sm ? sm.workers || 0 : 0)}</span></div>
      </div>
      ${short.length ? `<p class="notice">The smelter works at ${pct(rate)}: short of ${short.join(", ")}.${short.includes("coal") ? " Open a coal mine, or import coal through a harbor." : ""}</p>` : (econ.goods.util && (econ.goods.util.metals ?? 1) < 0.9) ? `<p class="notice">Your nation can't use or sell all its metal, so smelting more of it adds little. Factories that use metal, or a harbor or trade partner to sell it, would change that.</p>` : `<p class="muted small">The metal leaves lighter than the ore: hauling costs half as much.</p>`}
    </div>`;
  }
  if (!mine || s.exhausted) return "";
  const busy = game.projects.find(p => p.kind === "smelter" && p.siteId === s.id);
  if (busy) return `<div class="block"><span class="eyebrow">Smelter</span><p class="small">A smelter is being built here: ready in ${busy.seasons - busy.progress} season${busy.seasons - busy.progress > 1 ? "s" : ""}.</p></div>`;
  const q = quoteSmelter(world, game, PLAYER, s, economies()[PLAYER]);
  const coalLine = q.ok ? `It would burn ${fmtNum(q.coal * RES[2].perUnit)} Mt of coal a year: your nation makes ${fmtNum((econ.goods.supply.coal || 0) * RES[2].perUnit)} Mt and wants ${fmtNum((econ.goods.demand.coal || 0) * RES[2].perUnit)} Mt now.` : "";
  const loses = q.ok ? smelterLossText(q) : "";
  return `<div class="block">
    <span class="eyebrow">Smelter</span>
    <p class="small">Raw ore sells cheap and is heavy to haul. A smelter here turns it into metal on the spot.</p>
    ${q.ok ? `<div class="actions"><button class="btn${q.dGdp > 0.05 ? " primary" : ""}" type="button" data-action="smelter-build" data-id="${s.id}">Build a smelter · ${fmtMoney(q.cost)}</button></div>
      ${q.dGdp < -0.05 ? `<p class="notice">Right now a smelter here would lower your output by ${fmtMoney(-q.dGdp)} a year. ${escapeHtml(loses)}</p>` : ""}
      <p class="muted small">${q.dGdp > 0.05 ? `Output +${fmtMoney(q.dGdp)} a year. ` : ""}${coalLine} Employs about ${fmtWorkers(q.workersNeed)} workers.</p>` : `<p class="muted small">${escapeHtml(q.reason)}</p>`}
  </div>`;
}

/* Why a smelter would cost output: the goods it would take from others. */
function smelterLossText(q) {
  // nothing to burn or no power: it would stand idle
  if (q.smelted != null && q.smelted < 0.05 * Math.max(0.01, q.units || 0)) {
    if ((q.smeltCoal ?? 1) < 0.1) return "There is no coal for it to burn, so it would stand idle and its workers would make nothing. Open a coal mine first.";
    if ((q.smeltPower ?? 1) < 0.1) return "There is no electricity for it, so it would stand idle and its workers would make nothing. Build a power station first.";
  }
  const L = (q.satLosses || []).filter(x => ["coal", "power", "machinery", "goods"].includes(x.good));
  const parts = L.map(x => `${GOODS[x.good].label.toLowerCase()} would fall from ${pct(x.from)} to ${pct(x.to)} of what the nation wants`);
  if (!parts.length) return "Its workers earn more where they work now, and its metal would not all be sold.";
  return `It would take ${L.some(x => x.good === "coal") ? "coal" : "electricity"} from your power stations and factories: ${parts.join("; ")}. Open a coal mine first.`;
}

/* ---------- The season's weather in the Army panel ---------- */
function weatherBlockHtml() {
  const sw = seasonWar(game);
  const list = seasonEffectsList(sw);
  return `<div class="weather-note" data-why="season" tabindex="0"><span class="wx">${weatherIcon(sw)}</span><span><strong>${escapeHtml(sw.name)}.</strong> ${escapeHtml(list.length ? capFirstLetter(list.join("; ")) : "No penalties: the best season to campaign")}.</span></div>`;
}

/* ---------- On the map: smelters at the mines, people on the move, veterans' chevrons ---------- */
function drawSmelterMark(c, x, y, r, cs) {
  const bx = x + r * 0.95, by = y - r * 0.95, br = Math.max(4, r * 0.62);
  c.fillStyle = "rgba(12,10,8,0.9)"; c.beginPath(); c.arc(bx, by, br + 1.2, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#c46a3a"; c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fill();
  giDraw(c, "delapouite/furnace", bx, by, br * 1.45, "#1a120c");
  if (cs >= 14) drawSmoke(c, bx, by - br * 0.6, clamp(cs * 0.1, 2.5, 7), bx + by);
}
function drawMigrations(c, cs, pb) {
  for (const e of pb.timed) {
    if (e.t !== "migrate" || pb.t < e.t0 || pb.t > e.t1 + 0.3) continue;
    if (e.owner !== PLAYER && view.zoom < 1.6) continue;
    const [x0, y0] = cellCenter(e.from, cs), [x1, y1] = cellCenter(e.to, cs);
    const p = clamp((pb.t - e.t0) / Math.max(0.01, e.t1 - e.t0), 0, 1);
    const mx = (x0 + x1) / 2 - (y1 - y0) * 0.18, my = (y0 + y1) / 2 + (x1 - x0) * 0.18;
    const fade = pb.t > e.t1 ? clamp(1 - (pb.t - e.t1) / 0.3, 0, 1) : 1;
    c.save();
    c.globalAlpha = 0.45 * fade;
    c.strokeStyle = "#f3dc9a"; c.lineWidth = 1.4; c.setLineDash([3, 5]);
    c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx, my, x1, y1); c.stroke(); c.setLineDash([]);
    c.globalAlpha = fade;
    const dots = clamp(Math.round(e.people * 40), 3, 9), rad = clamp(cs * 0.1, 1.8, 3.6);
    for (let k = 0; k < dots; k++) {
      const q = clamp(p * 1.4 - (k / dots) * 0.4, 0, 1);
      if (q <= 0.001 || q >= 0.999) continue;
      const bx = (1 - q) * (1 - q) * x0 + 2 * (1 - q) * q * mx + q * q * x1, by = (1 - q) * (1 - q) * y0 + 2 * (1 - q) * q * my + q * q * y1;
      c.fillStyle = "#f3dc9a"; c.strokeStyle = "rgba(10,8,6,0.9)"; c.lineWidth = 1;
      c.beginPath(); c.arc(bx, by, rad, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    c.restore();
  }
}
function drawChevrons(c, x, y, w, rank) {
  const k = rank - 1;   // seasoned 1, veteran 2, elite 3
  if (k <= 0) return;
  const cw = Math.max(5, w * 0.24), ch = cw * 0.45;
  c.save();
  c.lineJoin = "round"; c.lineCap = "round";
  for (let i = 0; i < Math.min(3, k); i++) {
    const yy = y - 2 - i * (ch + 1.2);
    c.strokeStyle = "rgba(10,8,6,0.95)"; c.lineWidth = 3.4;
    c.beginPath(); c.moveTo(x, yy - ch); c.lineTo(x + cw / 2, yy); c.lineTo(x + cw, yy - ch); c.stroke();
    c.strokeStyle = "#e8c35e"; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(x, yy - ch); c.lineTo(x + cw / 2, yy); c.lineTo(x + cw, yy - ch); c.stroke();
  }
  c.restore();
}

/* ---------- Actions ---------- */
Object.assign(ACTIONS, {
  "smelter-build": el => { const s = game.sites.find(x => x.id === Number(el.dataset.id)); const q = s && quoteSmelter(world, game, PLAYER, s); if (q && q.ok) ui.pending = q; else if (q) flashHint(q.reason); },
});

/* What the season does to a march: a note for the route preview. */
function routeWeatherNote(lead, path) {
  const sw = seasonWar(game);
  if (!sw.offRoad || !path || !path.length) return "";
  let prev = lead.cell, off = false;
  for (const c of path) { if (!(game.roads.has(edgeKey(prev, c)) && controller(game, prev) === controller(game, c))) { off = true; break; } prev = c; }
  return off ? ` · ${sw.name}: slow off the roads` : "";
}
function weatherDispatchHtml(d) {
  const sw = d.weather;
  if (!sw) return "";
  const busy = enemiesOf(game, PLAYER).length || game.divisions.some(x => x.owner === PLAYER && ((x.path && x.path.length) || x.voyage));
  if (!busy) return "";
  return `<p class="notice info wx-note"><span class="wx">${weatherIcon(sw)}</span><span><strong>${escapeHtml(sw.name)} is here.</strong> ${escapeHtml(sw.note)}</span></p>`;
}
function industryJobsLine(q, def) {
  const r = economies()[PLAYER].regions.find(x => x.city.id === q.cityId);
  const u = r ? r.unemployed || 0 : 0;
  return u >= def.workers * 0.5
    ? `Employs ${fmtWorkers(def.workers)} workers from the ${fmtWorkers(u)} without a job in ${escapeHtml(r.city.name)}, and makes about ${fmtWorkers(def.workers * JOBS.perIndustry)} more jobs in its shops and services`
    : `Employs ${fmtWorkers(def.workers)} workers, taken from services`;
}

Object.assign(ICONS, {
  cabinet: giSvg("delapouite/round-table"), minInterior: giSvg("andymeneely/police-badge"), minEconomy: giSvg("delapouite/bank"),
  minAgriculture: giSvg("lorc/wheat"), minEnergy: giSvg("lorc/power-lightning"), minDefence: giSvg("sbed/shield"), minForeign: giSvg("delapouite/shaking-hands"),
});

