/* =====================================================================
   16k. People and work in the panels: ages, who works, skills, wages, labour laws
   ===================================================================== */
const AGE_COLORS = { kids: "#8fc98a", work: "#d9a441", old: "#b48ce0" };
function pplBar(parts) {
  const tot = parts.reduce((s, p) => s + p.v, 0) || 1;
  return `<div class="ppl-bar">${parts.map(p => `<span style="width:${(p.v / tot * 100).toFixed(2)}%;background:${p.c}" title="${escapeHtml(p.l)} ${pct(p.v / tot)}"></span>`).join("")}</div>
    <div class="grp-legend">${parts.map(p => `<span><i style="background:${p.c}"></i>${escapeHtml(p.l)} ${pct(p.v / tot)}</span>`).join("")}</div>`;
}
function pplSpark(hist) {
  const h = (hist || []).map(x => x.ls).filter(v => v > 0);
  if (h.length < 2) return "";
  const W = 120, H = 26, lo = Math.min(...h), hi = Math.max(...h), span = Math.max(1e-6, hi - lo);
  const pts = h.map((v, k) => `${(k / (h.length - 1) * W).toFixed(1)},${(H - 2 - (v - lo) / span * (H - 4)).toFixed(1)}`).join(" ");
  return `<svg class="grp-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--gold)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
}
function fmtK(v) { return `$${v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(0) : v.toFixed(1)}k`; }
function lsRank(nid) {
  const rows = liveNations(game).map(z => { const e = economies()[z.id]; return { id: z.id, ls: e && e.people ? e.people.ls : 0 }; }).sort((a, b) => b.ls - a.ls);
  return { rank: rows.findIndex(x => x.id === nid) + 1, of: rows.length, best: rows[0] };
}

function peopleTabHtml() {
  const n = game.nations[PLAYER];
  const econ = economies()[PLAYER];
  const P = econ.people;
  if (!P) return `<p class="muted">No people to show.</p>`;
  if (!n.demo || !n.edu) ensurePeople(world, game, n, econ);
  const D = demoOf(n), ed = eduOf(n), L = n.laws;
  const pop = econ.pop;
  const W = 1 - D.kids - D.old;
  const T = skillTarget(n, econ);
  const tr = lsTrend(n);
  const rk = lsRank(PLAYER);

  // 1. the people: young and old
  const ages = `
    <div class="block">
      <span class="eyebrow">The people of ${escapeHtml(n.name)} · ${fmtPop(pop)}</span>
      ${pplBar([{ l: "Children (under 15)", v: D.kids, c: AGE_COLORS.kids }, { l: "Working age (15-64)", v: W, c: AGE_COLORS.work }, { l: "Old (65 and over)", v: D.old, c: AGE_COLORS.old }])}
      <div class="rows">
        <div class="row"><span>Children per woman<span class="sub">${D.tfr > 3.5 ? "large families, as in most poor countries" : D.tfr > 2.1 ? "families are getting smaller as people grow richer" : "fewer than 2.1: in time the nation will shrink"}</span></span><span class="num">${D.tfr.toFixed(1)}</span></div>
        <div class="row"><span>Life expectancy<span class="sub">from healthcare${(D.staff ?? 1) < 0.95 ? " (short of doctors)" : ""}, medicine, wealth${L.hours === "long" ? " and long hours" : ""}</span></span><span class="num">${Math.round(D.e0)} years</span></div>
        <div class="row"><span>Born a year</span><span class="num">${fmtPeople((D.births || 0) * pop)}</span></div>
        <div class="row"><span>Died a year</span><span class="num">${fmtPeople((D.deaths || 0) * pop)}</span></div>
        <div class="row"><span>Natural growth<span class="sub">where food is plentiful the land can feed faster growth; hunger slows it</span></span><span class="num tone-${D.r < 0 ? "bad" : "neutral"}">${signedPct(D.r, 1)} a year</span></div>
      </div>
      <p class="muted small">Richer people have fewer children, and better healthcare means longer lives, so a nation grows old as it grows rich: fewer workers and more pensioners for each worker to support.</p>
    </div>`;

  // 2. who works
  const pt = P.parts, wf = econ.workforce || 0;
  const pwLaw = labourLaw(L, "women").pw;
  const work = `
    <div class="block">
      <span class="eyebrow">Who works · ${fmtWorkers(wf)} (${pct(wf / Math.max(0.001, pop))} of the people)</span>
      ${pplBar([{ l: "Men", v: pt.men, c: "#5d9fc4" }, { l: "Women", v: pt.women, c: "#d6619e" }, { l: "Children", v: pt.kids, c: AGE_COLORS.kids }, { l: "Old people", v: pt.old, c: AGE_COLORS.old }].filter(x => x.v > 0.0005))}
      <div class="rows">
        <div class="row"><span>Women who work<span class="sub">${D.warWork ? "the war has brought women into the factories in place of the men at the front" : Math.abs((D.pw ?? pwLaw) - pwLaw) > 0.01 ? `moving toward ${pct(pwLaw)} under the law: customs change slowly` : `the law: ${labourLaw(L, "women").label.toLowerCase()}`}</span></span><span class="num">${pct(D.pw ?? pwLaw)}</span></div>
        ${pt.kids > 0.0005 ? `<div class="row"><span>Children who work<span class="sub">child labour: ${labourLaw(L, "childwork").label.toLowerCase()}</span></span><span class="num">${fmtWorkers(pt.kids * pop)}</span></div>` : ""}
        ${pt.old > 0.0005 ? `<div class="row"><span>Old people who still work<span class="sub">${labourLaw(L, "pensions").rate ? "fewer need to with a pension" : "no pension: they work as long as they can"}</span></span><span class="num">${fmtWorkers(pt.old * pop)}</span></div>` : ""}
        <div class="row"><span>Soldiers under arms<span class="sub">not counted as workers</span></span><span class="num">${fmtCount((n.mil && n.mil.men) || 0)}</span></div>
        <div class="row"><span>Without a job</span><span class="num tone-${(econ.unemployment || 0) > 0.08 ? "bad" : (econ.unemployment || 0) > JOBS.natural ? "warn" : "good"}">${(econ.unemployed || 0) < 0.0005 ? "none" : `${fmtWorkers(econ.unemployed)} · ${pct1(econ.unemployment)}`}</span></div>
      </div>
    </div>`;

  // 3. skills
  const st = P.staff;
  const shortRows = P.shortages.slice(0, 6).map(x => `<li><span><button class="linkbtn" type="button" data-city-pick="${x.cityId}">${escapeHtml(x.town)}</button>: ${escapeHtml(industryWord(x.kind))} works at ${pct(x.fill)}</span><span class="num tone-bad">${fmtWorkers(x.miss)} ${SKILL_INFO[x.lack].short}</span></li>`).join("");
  const posRow = (l, need, short) => need > 0.0005 ? `<div class="row"><span>${SKILL_INFO[l].label} posts in mines, plants and offices<span class="sub">${short > 0.0005 ? `${fmtWorkers(short)} of them empty` : "all filled"}</span></span><span class="num tone-${short > 0.0005 ? "bad" : "good"}">${fmtWorkers(need)}</span></div>` : "";
  const skills = `
    <div class="block">
      <span class="eyebrow">Skills · workforce skill ${pct(n.skill)}</span>
      ${pplBar(SKILL_LEVELS.map(l => ({ l: SKILL_INFO[l].label, v: l === "u" ? Math.max(0, 1 - ed.s - ed.e) : ed[l], c: SKILL_INFO[l].color })))}
      <ul class="factors">${SKILL_LEVELS.map(l => `<li><span><strong>${SKILL_INFO[l].label}</strong> <span class="muted small">${escapeHtml(SKILL_INFO[l].who)}</span></span><span class="num">${pct(l === "u" ? Math.max(0, 1 - ed.s - ed.e) : ed[l])}</span></li>`).join("")}</ul>
      <p class="small">The schools now give ${pct(T.s)} skilled and ${pct(T.e)} educated young people${(econ.levels.university || 0) >= 0.5 ? ", more thanks to your universities" : ""}${L.childwork !== "banned" ? `; child labour costs them schooling` : ""}${st.f < 0.95 ? `; schools are short of teachers` : ""}. Each season the workforce moves ${pct(PEOPLE.renew)} of the way there as young people start work and adults learn, so better schools take years to show. Where skilled hands are short, workers also learn on the job.</p>
      <div class="rows">
        ${posRow("s", P.need.s, P.short.s)}
        ${posRow("e", P.need.e, P.short.e)}
        <div class="row"><span>Doctors, teachers and officials<span class="sub">${st.e < 0.95 ? "hospitals and schools have too few trained people, so healthcare and schools work only that far" : "hospitals, schools and the offices of state are staffed"}</span></span><span class="num tone-${st.e < 0.8 ? "bad" : st.e < 0.95 ? "warn" : "good"}">${pct(st.e)} filled</span></div>
        <div class="row"><span>Nurses, clerks and technicians</span><span class="num tone-${st.s < 0.8 ? "bad" : st.s < 0.95 ? "warn" : "good"}">${pct(st.s)} filled</span></div>
        ${P.over > 0.005 ? `<div class="row"><span>Working below their training<span class="sub">skilled and educated people in simpler jobs: room to build workplaces that need them</span></span><span class="num">${fmtWorkers(P.over)}</span></div>` : ""}
        ${P.borrowed > 0.0005 ? `<div class="row"><span>Moved to other towns for skilled work</span><span class="num">${fmtWorkers(P.borrowed)}</span></div>` : ""}
      </div>
      ${shortRows ? `<span class="eyebrow">Short of skilled people</span><ul class="factors">${shortRows}</ul>` : `<p class="muted small">Every mine, plant and office finds the skilled and educated people it needs. Electronics, research parks, universities, offices and nuclear plants need the most educated people; steel, chemicals and power stations need skilled trades.</p>`}
    </div>`;

  // 4. wages and the living standard
  const pl = P.places;
  const placeRows = ["farm", "primary", "secondary", "quaternary", "tertiary", "public"].filter(k => pl[k] && pl[k].n > 0.0005).map(k => `<tr><td>${escapeHtml(JOB_PLACE[k])}</td><td class="num">${fmtWorkers(pl[k].n)}</td><td class="num">${fmtK(pl[k].pay / pl[k].n)}</td></tr>`).join("");
  const wages = `
    <div class="block">
      <span class="eyebrow">Wages and living standard</span>
      <div class="ppl-big"><span><span class="num">${fmtK(P.ls)}</span><span class="sub">a year for each person: wages, pensions and benefits${P.goodsK < 0.99 ? ", less what empty shops can't sell" : ""}</span></span>${pplSpark(n.demo.hist)}</div>
      <p class="small">${tr === null ? "" : `${signedPct(tr, 1)} in a year. `}${ordinal(rk.rank)} of ${rk.of} nations${rk.rank > 1 && rk.best ? ` (the ${escapeHtml(nameOf(game, rk.best.id))} live best, on ${fmtK(rk.best.ls)})` : ""}.</p>
      <div class="rows">
        ${SKILL_LEVELS.map(l => `<div class="row"><span>${SKILL_INFO[l].label} workers earn<span class="sub">on average, a year</span></span><span class="num">${fmtK(P.wage[l])}</span></div>`).join("")}
        <div class="row"><span>Workers' share of what the nation makes<span class="sub">the rest goes to owners, who invest it${P.dLam ? `; the labour laws move it ${signed(Math.round(P.dLam * 100))} points` : ""}</span></span><span class="num">${pct(P.lam)}</span></div>
        ${P.lifted > 0.0005 ? `<div class="row"><span>Raised by the minimum wage<span class="sub">paid by employers to the lowest paid</span></span><span class="num">${fmtMoney(P.lifted)}/yr</span></div>` : ""}
        ${P.joblessPay > 0.0005 ? `<div class="row"><span>Help for the jobless<span class="sub">from the healthcare and welfare law</span></span><span class="num">${fmtMoney(P.joblessPay)}/yr</span></div>` : ""}
        <div class="row"><span>Pensions<span class="sub">${P.pension.cost > 0.0005 ? `${fmtPeople(P.pension.pensioners)} pensioners get ${fmtK(P.pension.per)} a year` : "none: the old work or live on their children"}</span></span><span class="num">${P.pension.cost > 0.0005 ? `${fmtMoney(P.pension.cost / 4)}/season` : "—"}</span></div>
      </div>
      <table class="regions"><thead><tr><th>Where people work</th><th class="num">Workers</th><th class="num">Average pay</th></tr></thead><tbody>${placeRows}</tbody></table>
      <p class="muted small">Each workplace pays its workers a share of what it makes, more to skilled and educated people. Pay rises with skills, machines and markets. People move toward towns that pay better, and living standards that rise or fall move stability and the workers' mood.</p>
    </div>`;

  // 5. labour laws
  const laws = `
    <div class="block">
      <span class="eyebrow">Labour laws · take effect when the season ends</span>
      ${LABOUR_ORDER.map(k => lawHtml(k, LABOUR[k].name, LABOUR[k].order.map(v => ({ value: v, label: LABOUR[k].vals[v].label, sub: LABOUR[k].vals[v].sub || "&nbsp;" })))).join("")}
      <p class="muted small">Hover a choice to see what it would do to output, wages, jobs, families and the budget, and how each group would take it.</p>
      <ul class="factors">${LABOUR_ORDER.map(k => `<li><span><strong>${escapeHtml(LABOUR[k].name)}</strong> <span class="muted small">${escapeHtml(LABOUR[k].about)}</span></span></li>`).join("")}</ul>
    </div>`;

  // 6. towns
  const rows = econ.regions.slice().sort((a, b) => b.pop - a.pop).map(r => {
    const sk = r.mix0 || { s: 0, e: 0 };
    const sh = P.shortages.filter(x => x.cityId === r.city.id).length;
    return `<tr data-city="${r.city.id}"><td>${r.city.capital ? "★ " : ""}${escapeHtml(r.city.name)}</td><td class="num">${fmtWorkers(r.workforce)}</td><td class="num">${pct(sk.s)} / ${pct(sk.e)}</td><td class="num">${fmtK(r.incomeK || 0)}</td><td class="num tone-${townURate(r) > 0.08 ? "bad" : townURate(r) > JOBS.natural ? "warn" : "good"}">${pct1(townURate(r))}</td><td class="num ${sh ? "tone-bad" : "muted"}">${sh ? sh : "—"}</td></tr>`;
  }).join("");
  const towns = `
    <div class="block">
      <span class="eyebrow">Towns</span>
      <table class="regions"><thead><tr><th>Town</th><th class="num">Workers</th><th class="num">Skilled / educated</th><th class="num">Wages a person</th><th class="num">No job</th><th class="num">Short</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted small">The capital, university towns and big cities draw educated people; towns cut off from the capital have fewer. Skilled and educated people move along the roads to the workplaces that need them.</p>
    </div>`;
  return ages + work + skills + wages + laws + towns;
}

/* ---------- Law buttons: what a labour law does ---------- */
function labourLawText(law, value) {
  const n = game.nations[PLAYER], econ = economies()[PLAYER], P = econ.people, D = demoOf(n);
  if (!P) return "";
  if (value === n.laws[law]) {
    if (law === "hours") return `${labourLaw(n.laws, "hours").sub} a week${labourLaw(n.laws, "hours").out ? ` · output ${signedPct(labourLaw(n.laws, "hours").out, 0)}` : ""}`;
    if (law === "unions") return `Workers take ${pct(P.lam)} of what the nation makes${labourLaw(n.laws, "unions").strikes ? labourLaw(n.laws, "unions").strikes > 1 ? " · strikes are common" : " · unions may strike" : " · no strikes, but no voice"}`;
    if (law === "minwage") return labourLaw(n.laws, "minwage").floor ? `Nobody earns under ${fmtK(labourLaw(n.laws, "minwage").floor * P.avg)} a year` : `The unskilled earn ${fmtK(P.wage.u)} a year on average`;
    if (law === "childwork") return P.parts.kids > 0.0005 ? `${fmtWorkers(P.parts.kids * econ.pop)} children work` : "Every child is at school";
    if (law === "women") return `${pct(D.pw ?? labourLaw(n.laws, "women").pw)} of women work`;
    if (law === "pensions") return P.pension.cost > 0.0005 ? `${fmtMoney(P.pension.cost / 4)} a season for ${fmtPeople(P.pension.pensioners)} pensioners` : "The old work or live on their children";
  }
  const v = peopleLawPreview(world, game, PLAYER, law, value);
  const now = forecast(world, game, PLAYER, n.laws), alt = forecast(world, game, PLAYER, { ...n.laws, [law]: value });
  const parts = [];
  if (Math.abs(v.dGdp) >= 0.002) parts.push(`output ${signedPct(v.dGdp, 1)}`);
  if (Math.abs(v.dLs) >= 0.002) parts.push(`living standard ${signedPct(v.dLs, 1)}`);
  if (Math.abs(v.dU) >= 0.001) parts.push(`jobless ${v.dU > 0 ? "+" : "−"}${pct1(Math.abs(v.dU))}`);
  if (Math.abs(v.dInvest) >= 0.01) parts.push(`private investment ${signedPct(v.dInvest, 0)}`);
  const dBal = alt.budget.balance - now.budget.balance;
  if (Math.abs(dBal) >= 0.005) parts.push(`${fmtSignedMoney(dBal)} a season`);
  if (Math.abs(v.dTfr) >= 0.05) parts.push(`children per woman ${v.dTfr > 0 ? "+" : "−"}${Math.abs(v.dTfr).toFixed(1)}`);
  if (Math.abs(v.dE0) >= 0.3) parts.push(`life expectancy ${v.dE0 > 0 ? "+" : "−"}${Math.abs(v.dE0).toFixed(1)} years`);
  if (Math.abs(v.dSkill.s) >= 0.005 || Math.abs(v.dSkill.e) >= 0.005) parts.push(`schools give ${signed(Math.round(v.dSkill.s * 100))} points skilled${Math.abs(v.dSkill.e) >= 0.005 ? `, ${signed(Math.round(v.dSkill.e * 100))} educated` : ""}`);
  if (law === "unions") parts.push(value === "banned" ? "no strikes" : value === "strong" ? "more strikes" : "strikes now and then");
  if (Math.abs(alt.target - now.target) >= 0.1) parts.push(`stability target ${signed1(alt.target - now.target)}`);
  return `If chosen: ${parts.join(", ") || "little change"}${law === "women" ? " (over a few years: customs change slowly)" : ""}`;
}

function educationLawText(value) {
  const n = game.nations[PLAYER], econ = economies()[PLAYER];
  const now = forecast(world, game, PLAYER, n.laws), alt = value === n.laws.education ? now : forecast(world, game, PLAYER, { ...n.laws, education: value });
  const T = skillTarget(n, econ, { ...n.laws, education: value });
  const head = `Schools give ${pct(T.s)} skilled, ${pct(T.e)} educated`;
  if (value === n.laws.education) return `${head} · ${fmtMoney(now.budget.education)} a season`;
  return `If chosen: ${head.toLowerCase()} (over the years), ${fmtSignedMoney(alt.budget.balance - now.budget.balance)} a season, stability target ${signed1(alt.target - now.target)}`;
}
function lackWord(x) { return x && (x.lack === "s" || x.lack === "e") ? `${SKILL_INFO[x.lack].short} workers` : "workers"; }

/* ---------- Season report and news ---------- */
function seasonPeopleNews(w, g, dispatch) {
  const n = g.nations[PLAYER];
  if (!n || !n.alive || !n.demo) return;
  const econ = computeEconomy(w, g, PLAYER), P = econ.people, D = n.demo;
  if (!P) return;
  const M = n.pplNote || (n.pplNote = {});
  const out = dispatch.people || (dispatch.people = []);
  const once = (key, cond, text, tone) => { if (cond && !M[key]) { M[key] = g.turn; out.push({ text, tone }); } else if (!cond && M[key] && g.turn - M[key] > 8) delete M[key]; };
  once("warwork", D.warWork, "With the men at the front, women are taking their places in the factories and offices.", "neutral");
  once("short", P.shortages.length > 0, P.shortages.length ? `${industryWord(P.shortages[0].kind)} in ${P.shortages[0].town} cannot find enough ${SKILL_INFO[P.shortages[0].lack].short} workers and works at ${pct(P.shortages[0].fill)}. Better schools, universities or time to train will help.` : "", "warn");
  once("staff", P.staff.e < 0.85, `Hospitals and schools are short of doctors and teachers (${pct(P.staff.e)} of the posts filled): healthcare and schools work only that far. More educated people would fill them.`, "warn");
  for (const [k, lim, text] of [["tfr4", D.tfr < 4, "Families are getting smaller: fewer than 4 children per woman."], ["tfr3", D.tfr < 3, "Fewer than 3 children per woman: the nation's growth is slowing."], ["tfr2", D.tfr < 2.1, "Fewer than 2.1 children per woman: in time the population will start to shrink."], ["old10", D.old > 0.1, "One person in ten is now over 65."], ["old15", D.old > 0.15, "15% of the people are over 65: more pensioners for each worker."]]) {
    if (lim && !M[k]) { M[k] = g.turn; out.push({ text, tone: "neutral" }); }
  }
  const tr = lsTrend(n);
  if (tr !== null && tr < -0.03 && !(M.fall && g.turn - M.fall < 8)) { M.fall = g.turn; out.push({ text: `Living standards fell ${pct1(-tr)} in a year, to ${fmtK(P.ls)} a person.`, tone: "bad" }); }
  if (tr !== null && tr > 0.06 && !(M.rise && g.turn - M.rise < 8)) { M.rise = g.turn; out.push({ text: `Living standards rose ${pct1(tr)} in a year, to ${fmtK(P.ls)} a person.`, tone: "good" }); }
}
function peopleDispatchHtml(d) {
  const list = d.people || [];
  if (!list.length) return "";
  return `<div class="block"><span class="eyebrow">People and work</span><ul class="news">${list.map(x => `<li><span class="dot" style="background:${x.tone === "good" ? "var(--good)" : x.tone === "bad" ? "var(--bad)" : x.tone === "warn" ? "var(--warn)" : "var(--gold)"}"></span><span>${escapeHtml(x.text)}</span></li>`).join("")}</ul></div>`;
}
/* ---------- Rival nations: how their people live ---------- */
function rivalPeopleHtml(z) {
  const e = economies()[z.id];
  if (!e || !e.people || !z.demo) return "";
  const P = e.people, D = z.demo, ed = eduOf(z);
  return `<div class="block" style="gap:4px"><span class="eyebrow">Their people</span><ul class="factors">
    <li><span>Living standard</span><span class="num">${fmtK(P.ls)} a person</span></li>
    <li><span>Children per woman · over 65</span><span class="num">${D.tfr.toFixed(1)} · ${pct(D.old)}</span></li>
    <li><span>Skilled · educated</span><span class="num">${pct(ed.s)} · ${pct(ed.e)}</span></li>
    ${(() => { const vs = villageStats(world, game, z.id); return vs.count ? `<li><span>Villages · people in them</span><span class="num">${vs.count} · ${fmtPeople(vs.people)}${vs.biggest[0] ? ` · biggest ${escapeHtml(vs.biggest[0].name)}` : ""}</span></li>` : ""; })()}
    <li><span>Unions · hours · women at work</span><span class="num">${escapeHtml(labourLaw(z.laws, "unions").label.toLowerCase())} · ${escapeHtml(labourLaw(z.laws, "hours").sub)} · ${escapeHtml(labourLaw(z.laws, "women").label.toLowerCase())}</span></li>
  </ul></div>`;
}
/* ---------- A town's people ---------- */
function townPeopleLine(city, r) {
  const econ = economies()[city.owner], P = econ && econ.people;
  if (!P || !r.mix0) return "";
  const sh = P.shortages.filter(x => x.cityId === city.id);
  return `<p class="small">Skilled ${pct(r.mix0.s)}, educated ${pct(r.mix0.e)} · wages ${fmtK(r.incomeK || 0)} a person (the nation: ${fmtK(P.bill / Math.max(0.001, econ.pop))})${sh.length ? ` · <span class="tone-bad">short of ${sh.map(x => `${SKILL_INFO[x.lack].short} people for the ${escapeHtml(industryWord(x.kind).toLowerCase())}`).join(", ")}</span>` : ""}.</p>`;
}

