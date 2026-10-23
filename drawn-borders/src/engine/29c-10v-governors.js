/* =====================================================================
   10v. Governors and the money for each province (v38, part 2)
   The national government decides how much money each province gets (none, small, normal or large: a share of
   the province's own output, paid every season from the national treasury). Each full province has a governor
   (a name, no traits, no corruption, no coups); a territory's money is spent by the Interior ministry. Every
   season the money is spent on what the province needs, read from its own numbers:
     public works where people have no job (real jobs at the town's wages),
     police, clinics and festivals where a town is unhappy (its mood),
     schools and local officials where conquered people still feel foreign (their loyalty),
     and local roads and markets with what is left (a little more output).
   So provinces end up spending on different things. What money cannot fix (hunger, a town cut off from the
   capital, a shortage of skilled workers) is in the needs report too, with who can fix it.
   The effects are city effects (cityModsActive), so every town's mood, loyalty, jobs and output list them.
   ===================================================================== */
const PGOV = {
  levels: [
    { key: "none", label: "None", share: 0 },
    { key: "small", label: "Small", share: 0.001 },
    { key: "normal", label: "Normal", share: 0.002 },
    { key: "large", label: "Large", share: 0.004 },
  ],
  defaultLevel: 2,
  jobsFrom: 0.04,                 // public works only where more than 4% of workers have no job
  moodBelow: 52, moodMax: 7, moodK: 0.003,
  loyalBelow: 85, loyalMax: 1.4, loyalK: 0.003,
  outMax: 0.02, outK: 0.004,
  seasons: 1,                     // what the money buys lasts until the next season's money
  logMax: 8,
};
function provFundLevel(p) { return PGOV.levels[p && p.fund !== undefined && p.fund !== null ? p.fund : PGOV.defaultLevel] || PGOV.levels[PGOV.defaultLevel]; }
/* What a province gets a season at a level: a share of its output a year. */
function provGrantOf(gdp, level) { return Math.max(0, gdp || 0) * PGOV.levels[level].share; }

/* Each province's output, from the towns' output shared by where their people live (as provinceStats does), and
   the money for all provinces of a nation this season. Read by computeEconomy (econ.provGrants). */
function provGdpMap(g, nid, regions) {
  const out = new Map();
  if (!g.prov || !g.provinces) return out;
  for (const r of regions) {
    if (!(r.pop > 0)) continue;
    const per = (r.gdp || 0) / r.pop;
    for (const c of r.cells) { const id = g.prov[c]; if (id >= 0) out.set(id, (out.get(id) || 0) + per * g.pop[c]); }
  }
  return out;
}
function provGrantsTotal(g, nid, regions) {
  if (!g.provinces) return 0;
  const gdp = provGdpMap(g, nid, regions), towns = provWithTowns(g, regions);
  let s = 0;
  for (const p of g.provinces) if (p.owner === nid && towns.has(p.id)) s += provGrantOf(gdp.get(p.id) || 0, provFundIndex(p));
  return s;
}
/* Money is spent in towns: a province with no town of its own (its people are counted in a town of another
   province) gets nothing. */
function provWithTowns(g, regions) { return new Set(regions.map(r => (g.prov ? g.prov[r.city.cell] : -1))); }
function provFundIndex(p) { return p.fund !== undefined && p.fund !== null ? p.fund : PGOV.defaultLevel; }

/* ---------- Governors ---------- */
function governorName(g, p) {
  const sex = hash2(p.id, p.owner, 3301) < 0.5 ? "m" : "f";
  const taken = new Set((g.provinces || []).filter(q => q.gov).map(q => q.gov.name));
  for (let k = 0; k < 30; k++) {
    const name = `${LEADER_FIRST[sex][Math.floor(hash2(p.id, k, 3302) * LEADER_FIRST[sex].length)]} ${LEADER_LAST[Math.floor(hash2(p.id, k, 3303) * LEADER_LAST.length)]}`;
    if (!taken.has(name)) return { name, sex };
  }
  return { name: `${LEADER_FIRST[sex][0]} ${LEADER_LAST[p.id % LEADER_LAST.length]}`, sex };
}
/* A full province has a governor; a territory has none (the Interior ministry runs it). New for old saves too. */
function ensureGovernors(g) {
  for (const p of g.provinces || []) {
    if (p.fund === undefined || p.fund === null) p.fund = PGOV.defaultLevel;
    const full = p.capital !== null && p.capital !== undefined;
    if (full && !p.gov) { const nm = governorName(g, p); p.gov = { name: nm.name, sex: nm.sex, since: g.turn || 0 }; }
    if (!full && p.gov) p.gov = null;
  }
}
function governorTitle(g, p) { return p.gov ? `Governor ${p.gov.name}` : "the Interior ministry"; }

/* ---------- What a province needs: read from its towns' numbers ---------- */
/* Returns { gdp, grant, needs: [{ key, label, weight, money (can money help), towns: [{ c, r, v }], text, who }] }. */
function provinceNeeds(w, g, p, econ) {
  const E = econ || computeEconomy(w, g, p.owner);
  const gdp = provGdpMap(g, p.owner, E.regions).get(p.id) || 0;
  const regs = E.regions.filter(r => g.prov && g.prov[r.city.cell] === p.id);
  const needs = [];
  const add = (key, label, money, towns, weight, text, who) => { if (towns.length && weight > 0) needs.push({ key, label, money, towns, weight, text, who }); };
  // jobs
  const jobless = regs.map(r => ({ c: r.city, r, v: Math.max(0, (r.unemployed || 0) - PGOV.jobsFrom * (r.workforce || 0)) })).filter(x => x.v > 0.002);
  const jl = jobless.reduce((s, x) => s + x.v, 0);
  add("jobs", "Jobs", true, jobless, jl * 3, jobless.length ? `${fmtPeople(regs.reduce((s, r) => s + (r.unemployed || 0), 0))} people without a job (${bJoin(jobless.map(x => `${x.c.name} ${pct(townURate(x.r))}`))})` : "", "public works");
  // unrest
  const sad = regs.filter(r => (r.city.mood ?? CITY.moodBase) < PGOV.moodBelow).map(r => ({ c: r.city, r, v: (PGOV.moodBelow - r.city.mood) / PGOV.moodBelow * r.pop }));
  add("mood", "Unhappy towns", true, sad, sad.reduce((s, x) => s + x.v, 0) * 1.5, `${bJoin(sad.map(x => `${x.c.name} (mood ${Math.round(x.c.mood)})`))}`, "police, clinics and festivals");
  // loyalty
  const foreign = regs.filter(r => r.city.origin !== r.city.owner && (r.city.loyalty ?? CITY.loyalNative) < PGOV.loyalBelow).map(r => ({ c: r.city, r, v: (PGOV.loyalBelow - r.city.loyalty) / PGOV.loyalBelow * r.pop }));
  add("loyal", "Loyalty", true, foreign, foreign.reduce((s, x) => s + x.v, 0) * 1.5, `${bJoin(foreign.map(x => `${x.c.name} (loyalty ${Math.round(x.c.loyalty)}, many still feel part of the ${nameOf(g, x.c.origin)})`))}`, "schools and local officials");
  // development: always, with what is left
  const dev = regs.map(r => ({ c: r.city, r, v: r.gdp || 0 }));
  add("dev", "Local roads and markets", true, dev, Math.max(0.05, regs.reduce((s, r) => s + r.pop, 0)) * 0.4, "more trade and a little more output in every town", "local roads and markets");
  // what money from the province cannot fix
  const hungry = regs.filter(r => (r.foodRatio ?? 1) < ECON.famineLine).map(r => ({ c: r.city, r, v: r.pop }));
  add("food", "Food", false, hungry, 1, `${bJoin(hungry.map(x => `${x.c.name} (${pct(x.r.foodRatio)} of the food it needs)`))}`, "the national government: grain from abroad or the reserve, a road to farmland, irrigation");
  const cut = regs.filter(r => E.networks[r.net] && !E.networks[r.net].capital).map(r => ({ c: r.city, r, v: r.pop }));
  add("road", "Cut off", false, cut, 1, `${bJoin(cut.map(x => x.c.name))} not joined to the capital`, "the national government: a road (or a harbor and freighters)");
  return { gdp, grant: regs.length ? provGrantOf(gdp, provFundIndex(p)) : 0, needs, regs };
}

/* ---------- Every season: the governors spend the money ---------- */
/* money: what the treasury paid for this province. Split among the needs money can help, by their weight; inside a
   need, among its towns by how much each needs it. Returns the governor's report. */
function governorSpend(w, g, p, money, info) {
  const items = [];
  const helpable = info.needs.filter(x => x.money);
  const tot = helpable.reduce((s, x) => s + x.weight, 0);
  if (!(money > 0) || !(tot > 0)) return { t: g.turn, spent: 0, items };
  for (const need of helpable) {
    const m = money * need.weight / tot;
    const vt = need.towns.reduce((s, x) => s + x.v, 0) || 1;
    const done = [];
    for (const x of need.towns) {
      const mt = m * x.v / vt, c = x.c, r = x.r, tg = Math.max(0.5, r.gdp || 0);
      if (mt < 0.0005) continue;
      if (need.key === "jobs") {
        // a public works job costs the town's service wage for a season
        const perM = Math.max(1, r.serviceK || ECON7.serviceK) / 4;   // $B a season for a million workers
        const jobs = Math.min(x.v, mt / perM);
        addCityMod(g, c, { key: "gov_jobs", label: `Public works paid by the province (${fmtPeople(jobs)} jobs)`, jobs: jobs / Math.max(1e-6, r.workforce || 1e-6), seasons: PGOV.seasons });
        done.push(`${fmtPeople(jobs)} jobs in ${c.name}`);
      } else if (need.key === "mood") {
        const v = Math.round(PGOV.moodMax * (1 - Math.exp(-mt / (PGOV.moodK * tg))) * 10) / 10;
        addCityMod(g, c, { key: "gov_mood", label: "Police, clinics and festivals paid by the province", mood: v, seasons: PGOV.seasons });
        done.push(`${c.name} mood +${v}`);
      } else if (need.key === "loyal") {
        const v = Math.round(PGOV.loyalMax * (1 - Math.exp(-mt / (PGOV.loyalK * tg))) * 100) / 100;
        addCityMod(g, c, { key: "gov_loyal", label: "Schools and local officials paid by the province", loyal: v, seasons: PGOV.seasons });
        done.push(`${c.name} loyalty +${v} a season`);
      } else if (need.key === "dev") {
        const v = PGOV.outMax * (1 - Math.exp(-mt / (PGOV.outK * tg)));
        addCityMod(g, c, { key: "gov_dev", label: "Local roads and markets paid by the province", out: v, seasons: PGOV.seasons });
        done.push(`${c.name} output +${(v * 100).toFixed(1)}%`);
      }
    }
    if (done.length) items.push({ key: need.key, label: need.who, money: m, text: done.join(", ") });
  }
  return { t: g.turn, spent: money, items };
}
/* After the treasury has paid (runNationSeason stores what it paid in n.provPaid), each province's money is spent. */
function seasonGovernors(w, g, dispatch) {
  if (!g.provinces) return;
  ensureGovernors(g);
  for (const n of liveNations(g)) {
    const paid = n.provPaid || 0;
    n.provPaid = 0;
    const list = provList(g, n.id);
    if (!list.length) continue;
    const econ = computeEconomy(w, g, n.id);
    const infos = list.map(p => ({ p, info: provinceNeeds(w, g, p, econ) }));
    const want = infos.reduce((s, x) => s + x.info.grant, 0);
    for (const { p, info } of infos) {
      const money = want > 0 ? paid * info.grant / want : 0;
      const rep = governorSpend(w, g, p, money, info);
      p.govLog = (p.govLog || []).concat([rep]).slice(-PGOV.logMax);
      if (n.id === PLAYER && dispatch && rep.spent > 0.0005 && rep.items.length) {
        (dispatch.provinces = dispatch.provinces || []).push({ pid: p.id, text: `${p.name}: ${governorTitle(g, p)} spent ${fmtMoney(rep.spent)} on ${rep.items.map(i => i.label).join(", ")}.`, why: rep.items.map(i => i.text).join("; ") });
      }
    }
    if (!n.isPlayer && (g.turn + n.id) % 4 === 1) rivalFunding(w, g, n, infos, econ);
  }
}
/* Rivals choose each province's money by the same numbers: more where the needs are, less when money is short. */
function rivalFunding(w, g, n, infos, econ) {
  const B = computeBudget(n, econ, n.laws);
  const tight = n.treasury < 0 && B.balance < 0;
  const rich = n.treasury > 0.15 * econ.gdp;
  for (const { p, info } of infos) {
    const urgent = info.needs.some(x => x.money && x.key !== "dev");
    p.fund = tight ? (urgent ? 1 : 0) : urgent ? (rich ? 3 : 2) : rich ? 2 : 1;
  }
}
