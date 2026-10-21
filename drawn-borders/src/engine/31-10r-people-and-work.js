/* =====================================================================
   10r. People and work: young and old, three kinds of workers, wages and living standards, labour laws
   Ideas from Victoria 3 (jobs that need qualifications, wages from what a job produces, standard of living),
   real demography (fewer children as people grow richer, longer lives with better healthcare) and labour history
   (hours, unions, minimum wage, child labour, women at work, pensions).
   ===================================================================== */
const LABOUR_ORDER = ["hours", "unions", "minwage", "childwork", "women", "pensions"];
const LABOUR = {
  hours: { name: "Working hours", def: "normal", order: ["long", "normal", "short"],
    about: "How long a working week is. Longer weeks make more, but wear people out.",
    vals: {
      long:   { label: "Long", sub: "60 hours", out: 0.06, lam: -0.02, e0: -1.5, stab: -2 },
      normal: { label: "Normal", sub: "48 hours", out: 0, lam: 0, e0: 0, stab: 0 },
      short:  { label: "Short", sub: "40 hours", out: -0.06, lam: 0.01, e0: 0.5, stab: 1 } } },
  unions: { name: "Trade unions", def: "allowed", order: ["banned", "allowed", "strong"],
    about: "Whether workers may organize. Unions win higher pay, and they strike to get it.",
    vals: {
      banned:  { label: "Banned", sub: "no strikes", lam: -0.06, power: -6, strikes: 0, stab: -1 },
      allowed: { label: "Allowed", sub: "", lam: 0, power: 0, strikes: 1, stab: 0 },
      strong:  { label: "Strong", sub: "closed shops", lam: 0.05, power: 8, strikes: 2, stab: 0 } } },
  minwage: { name: "Minimum wage", def: "none", order: ["none", "low", "high"],
    about: "The least an employer may pay. It lifts the poorest, but some low-paid jobs disappear.",
    vals: {
      none: { label: "None", sub: "", floor: 0, cut: 0, lam: 0 },
      low:  { label: "Low", sub: "45% of the average", floor: 0.45, cut: 0.02, lam: 0.01 },
      high: { label: "High", sub: "60% of the average", floor: 0.6, cut: 0.06, lam: 0.02 } } },
  childwork: { name: "Child labour", def: "limited", order: ["allowed", "limited", "banned"],
    about: "Whether children may work. Working children earn now, but grow up with less schooling.",
    vals: {
      allowed: { label: "Allowed", sub: "1 child in 5 works", work: 0.22, entryS: -0.08, entryE: -0.02, tfr: 0.3 },
      limited: { label: "Limited", sub: "farms and family shops", work: 0.08, entryS: -0.02, entryE: 0, tfr: 0 },
      banned:  { label: "Banned", sub: "every child at school", work: 0, entryS: 0.02, entryE: 0.01, tfr: -0.1 } } },
  women: { name: "Women at work", def: "some", order: ["home", "some", "equal"],
    about: "How many women work outside the home. More workers, and smaller families.",
    vals: {
      home:  { label: "Few", sub: "4 in 10 work", pw: 0.38, tfr: 0.35 },
      some:  { label: "Some", sub: "6 in 10 work", pw: 0.6, tfr: 0 },
      equal: { label: "Equal", sub: "7 in 10 work", pw: 0.74, tfr: -0.3 } } },
  pensions: { name: "Pensions", def: "none", order: ["none", "basic", "generous"],
    about: "What the state pays the old. Without one, old people keep working or live on their children.",
    vals: {
      none:     { label: "None", sub: "", rate: 0, oldWork: 0.4, tfr: 0.1 },
      basic:    { label: "Basic", sub: "30% of the average wage", rate: 0.3, oldWork: 0.18, tfr: 0 },
      generous: { label: "Generous", sub: "55% of the average wage", rate: 0.55, oldWork: 0.06, tfr: -0.15 } } },
};
function labourLaw(L, k) { const D = LABOUR[k]; return D.vals[(L && L[k]) || D.def] || D.vals[D.def]; }
function labourDefaults() { return Object.fromEntries(LABOUR_ORDER.map(k => [k, LABOUR[k].def])); }
/* What each kind of government would choose, given time and calm. */
const LAB_PREFS = {
  expansionist: { hours: "long", unions: "banned", minwage: "none", childwork: "limited", women: "some", pensions: "none" },
  mercantile:   { hours: "normal", unions: "allowed", minwage: "low", childwork: "banned", women: "equal", pensions: "basic" },
  agrarian:     { hours: "normal", unions: "allowed", minwage: "none", childwork: "allowed", women: "some", pensions: "none" },
  militarist:   { hours: "long", unions: "banned", minwage: "none", childwork: "limited", women: "some", pensions: "none" },
};

/* ---------- Three kinds of workers ---------- */
const SKILL_LEVELS = ["u", "s", "e"];
const SKILL_INFO = {
  u: { label: "Unskilled", short: "unskilled", color: "#a59a86", who: "labourers, farm hands, dockers, shop and factory hands" },
  s: { label: "Skilled", short: "skilled", color: "#d9a441", who: "trained trades: machinists, electricians, foremen, nurses, clerks" },
  e: { label: "Educated", short: "educated", color: "#6fb6e0", who: "university people: engineers, doctors, teachers, scientists, managers" },
};
const PEOPLE = {
  skillBase: 0.144, skillS: 0.6, skillE: 1.2,   // the old single "workforce skill" number, worked out from the mix
  wageW: { u: 1, s: 1.6, e: 2.6 },              // how pay is shared inside a workplace
  renew: 0.02,                                  // each season the mix moves 2% of the way to what the schools give
  train: 0.006,                                 // where skilled hands are short, unskilled workers learn on the job (share of them a season)
  pm: 0.95,                                     // men of working age who work
  natRef: 0.0165,                               // a year's natural growth that the food-based growth was tuned for
  lamRef: 0.4,                                  // the owners' share of output at the default laws
  pwPull: 0.06,                                 // how fast customs change: women's work moves 6% of the way to the law a season
};
const EDU_ENTRY = { minimal: { s: 0.15, e: 0.01 }, basic: { s: 0.35, e: 0.04 }, good: { s: 0.47, e: 0.11 }, excellent: { s: 0.5, e: 0.27 } };
/* What share of the jobs in each kind of workplace needs each kind of worker. */
const JOB_MIX = {
  farm: [0.92, 0.08, 0], services: [0.58, 0.33, 0.09], public: [0.4, 0.45, 0.15],
  fishing: [0.8, 0.2, 0], logging: [0.8, 0.2, 0], mine: [0.62, 0.34, 0.04], coalmine: [0.66, 0.31, 0.03], goldmine: [0.55, 0.38, 0.07], oilfield: [0.45, 0.45, 0.1],
  smelter: [0.5, 0.44, 0.06], power_coal: [0.45, 0.45, 0.1], power_gas: [0.4, 0.48, 0.12], power_hydro: [0.4, 0.48, 0.12], power_nuclear: [0.15, 0.45, 0.4],
  light: [0.6, 0.35, 0.05], foodproc: [0.65, 0.31, 0.04], heavy: [0.45, 0.48, 0.07], chemical: [0.3, 0.52, 0.18], electronics: [0.22, 0.5, 0.28],
  resort: [0.62, 0.33, 0.05], university: [0.15, 0.3, 0.55], techpark: [0.1, 0.35, 0.55], broadcast: [0.2, 0.45, 0.35], business: [0.15, 0.45, 0.4],
};
function jobMix(kind) { return JOB_MIX[kind] || JOB_MIX.light; }
const LAMBDA = { farm: 0.62, primary: 0.5, secondary: 0.55, tertiary: 0.64, quaternary: 0.6 };   // workers' share of what a workplace makes, at the default laws
const JOB_PLACE = { farm: "Farms", primary: "Mines, oil fields, forests and fishing", secondary: "Factories and power stations", quaternary: "Offices, universities and research", tertiary: "Shops, transport and services", public: "Hospitals, schools and government" };

function skillIndex(s, e) { return PEOPLE.skillBase + PEOPLE.skillS * s + PEOPLE.skillE * e; }
/* An old save, or a new nation: the mix that gives the workforce skill it had. */
function eduFromSkill(skill) {
  const sk = skill ?? 0.36;
  const e = clamp(0.03 + (sk - 0.36) * 0.45, 0.005, 0.4);
  const s = clamp((sk - PEOPLE.skillBase - PEOPLE.skillE * e) / PEOPLE.skillS, 0.05, 0.6);
  return { s, e };
}
function eduOf(n) { return (n && n.edu) || eduFromSkill(n ? n.skill : 0.36); }

/* ---------- Young and old ---------- */
function demoRates(n, kp, L, g) {
  L = L || (n && n.laws) || {};
  const svRaw = { minimal: -4, basic: 0, good: 5, generous: 9 }[L.services || "basic"] || 0;
  const staff = n && n.demo && n.demo.staff != null ? n.demo.staff : 1;
  const sv = svRaw > 0 ? svRaw * staff : svRaw;
  const hungry = n && n.lastFamine ? -12 * clamp(n.lastFamine, 0, 1) : 0;
  const e0 = clamp(46 + sv + (hasTech(n, "medicine") ? 6 : 0) + 22 * (1 - Math.exp(-Math.max(0, kp) / 30)) + labourLaw(L, "hours").e0 + hungry, 30, 86);
  const eduT = { minimal: 0.1, basic: 0, good: -0.05, excellent: -0.15 }[L.education || "basic"] || 0;
  const tfr = clamp(1.6 + 3.2 * Math.exp(-Math.max(0, kp - 8) / 18) + labourLaw(L, "women").tfr + labourLaw(L, "childwork").tfr + labourLaw(L, "pensions").tfr + eduT, 1.1, 6.5);
  return { e0, tfr, mk: 0.02 * Math.exp(-(e0 - 48) / 8), mw: 0.011 * Math.exp(-(e0 - 48) / 25), mo: 1 / Math.max(6, 0.25 * e0) };
}
/* A year's births, deaths and ageing, as shares of the population. */
function demoFlows(d, R) {
  const K = d.kids, O = d.old, W = 1 - K - O;
  const births = R.tfr * 0.43 * W / 35;
  const dk = K * R.mk, dw = W * R.mw, dold = O * R.mo;
  const r = births - dk - dw - dold;
  // in a growing nation the young outnumber those about to grow up or grow old
  return { births, deaths: dk + dw + dold, dk, dw, dold, kOut: K / 15 * Math.exp(-r * 7), wOut: W / 50 * Math.exp(-r * 24) * 0.8, r };
}
function stableAges(n, kp, L) {
  const R = demoRates(n, kp, L);
  let d = { kids: 0.36, old: 0.06 };
  for (let y = 0; y < 300; y++) {
    const f = demoFlows(d, R);
    const K = d.kids + f.births - f.kOut - f.dk, W = 1 - d.kids - d.old + f.kOut - f.wOut - f.dw, O = d.old + f.wOut - f.dold;
    const T = K + W + O;
    d = { kids: K / T, old: O / T };
  }
  return d;
}
const DEMO_DEFAULT = { kids: 0.36, old: 0.063, pw: 0.6, r: 0.0165, e0: 50, tfr: 4.8 };
function demoOf(n) { return (n && n.demo) || DEMO_DEFAULT; }
function ensurePeople(w, g, n, econ) {
  n.laws = { ...labourDefaults(), ...n.laws };
  if (!n.edu) n.edu = eduFromSkill(n.skill);
  n.skill = skillIndex(n.edu.s, n.edu.e);
  if (!n.demo) {
    const e = econ || computeEconomy(w, g, n.id);
    const kp = e.people ? e.people.lsRaw : (e.gdp / Math.max(0.01, e.pop)) * 0.55;
    const d = stableAges(n, kp, n.laws);
    const R = demoRates(n, kp, n.laws);
    const f = demoFlows(d, R);
    n.demo = { kids: d.kids, old: d.old, pw: labourLaw(n.laws, "women").pw, r: f.r, e0: R.e0, tfr: R.tfr, births: f.births, deaths: f.deaths, hist: [] };
  }
}
/* Who works: men and women of working age, children where the law lets them, old people without a pension. */
function labourForce(n, L) {
  L = L || (n && n.laws) || {};
  const D = demoOf(n);
  const K = D.kids, O = D.old, W = 1 - K - O;
  const pw = D.pw ?? labourLaw(L, "women").pw;
  const men = W * 0.5 * PEOPLE.pm, women = W * 0.5 * pw, kids = K * labourLaw(L, "childwork").work, old = O * labourLaw(L, "pensions").oldWork;
  return { lf: men + women + kids + old, men, women, kids, old, adults: men + women };
}

/* ---------- Filling the jobs ---------- */
function poolSum(p) { return p.u + p.s + p.e; }
/* Take n workers for jobs any worker can do: the unskilled first, then the skilled, then the educated. */
function takeAny(p, n, into) {
  let left = n;
  for (const l of SKILL_LEVELS) { const t = Math.min(p[l], left); p[l] -= t; left -= t; into[l] += t; }
  return n - left;
}
/* Take workers for a mix of jobs: educated jobs need the educated, skilled jobs the skilled or educated, the rest anyone. */
function takeMix(p, need, mix, into) {
  const Ne = need * mix[2], Ns = need * mix[1], Nu = need * mix[0];
  let t = Math.min(p.e, Ne); p.e -= t; into.e += t; into.posE = (into.posE || 0) + t;
  into.ne = (into.ne || 0) + Ne; into.fe = (into.fe || 0) + t; into.ns = (into.ns || 0) + Ns;
  let ns = Ns; t = Math.min(p.s, ns); p.s -= t; into.s += t; ns -= t; into.fs = (into.fs || 0) + t; t = Math.min(p.e, ns); p.e -= t; into.e += t; into.over = (into.over || 0) + t; into.fs += t;
  let nu = Nu; t = Math.min(p.u, nu); p.u -= t; into.u += t; nu -= t;
  t = Math.min(p.s, nu); p.s -= t; into.s += t; nu -= t; into.over = (into.over || 0) + t;
  t = Math.min(p.e, nu); p.e -= t; into.e += t; nu -= t; into.over = (into.over || 0) + t;
}
/* How much of a workplace can work with the people on hand, and which kind of worker holds it back. */
function mixFill(need, mix, E, S, U) {
  if (!(need > 0)) return { f: 0, lack: null };
  const Ne = need * mix[2], Ns = need * mix[1];
  const fe = Ne > 1e-9 ? E / Ne : Infinity, fs = Ne + Ns > 1e-9 ? (E + S) / (Ne + Ns) : Infinity, fa = (E + S + U) / need;
  const f = Math.max(0, Math.min(1, fe, fs, fa));
  const lack = f >= 0.999 ? null : fa <= Math.min(fe, fs) ? "u" : fe <= fs ? "e" : "s";
  return { f, lack };
}
function jobFill(x, need, pool) {
  const mix = jobMix(x.kind);
  x.need = need;
  const { f, lack } = mixFill(need, mix, pool.e, pool.s, pool.u);
  x.take = { u: 0, s: 0, e: 0 };
  takeMix(pool, need * f, mix, x.take);
  x.workers = poolSum(x.take);
  x.fill = need > 0 ? x.workers / need : 0;
  x.lack = lack;
  return x.workers;
}
/* Skilled and educated people move within a road network to the workplaces that are short of them. */
function shareSkills(regions, networks) {
  for (let k = 0; k < networks.length; k++) {
    const regs = regions.filter(r => r.net === k);
    if (regs.length < 2) continue;
    for (const r of regs) for (const x of r.ind) {
      if (!(x.need > 0) || x.fill >= 0.999 || (x.lack !== "s" && x.lack !== "e")) continue;
      const others = regs.filter(o => o !== r);
      const oE = others.reduce((s, o) => s + o.pool.e, 0), oS = others.reduce((s, o) => s + o.pool.s, 0);
      if (oE + oS < 1e-6) continue;
      // give back what it holds, then hire again with the whole network's skilled people
      const back = x.take; r.pool.u += back.u; r.pool.s += back.s; r.pool.e += back.e;
      r.indWorkers -= x.workers;
      const mix = jobMix(x.kind), need = x.need;
      const { f, lack } = mixFill(need, mix, r.pool.e + oE, r.pool.s + oS, r.pool.u);
      const want = { e: need * f * mix[2], s: need * f * mix[1] };
      // the skilled positions: own town first, then the others
      const borrow = { u: 0, s: 0, e: 0 };
      const take = { u: 0, s: 0, e: 0 };
      const fromOthers = (lvl, amt) => { let left = amt; for (const o of others) { const t = Math.min(o.pool[lvl], left); o.pool[lvl] -= t; left -= t; borrow[lvl] += t; o.lent = (o.lent || 0) + t; if (left <= 1e-12) break; } return amt - left; };
      let t = Math.min(r.pool.e, want.e); r.pool.e -= t; take.e += t; take.posE = t; if (want.e - t > 1e-12) { const b = fromOthers("e", want.e - t); take.e += b; take.posE += b; }
      let ns = want.s; t = Math.min(r.pool.s, ns); r.pool.s -= t; take.s += t; ns -= t;
      if (ns > 1e-12) { const b = fromOthers("s", ns); take.s += b; ns -= b; }
      if (ns > 1e-12) { t = Math.min(r.pool.e, ns); r.pool.e -= t; take.e += t; ns -= t; take.over = t; if (ns > 1e-12) { const b = fromOthers("e", ns); take.e += b; take.over += b; } }
      const rest = { u: 0, s: 0, e: 0 };
      takeAny(r.pool, need * f * mix[0], rest);
      take.u += rest.u; take.s += rest.s; take.e += rest.e; take.over = (take.over || 0) + rest.s + rest.e;
      x.take = take;
      x.workers = take.u + take.s + take.e;
      x.fill = need > 0 ? x.workers / need : 0;
      x.lack = lack;
      x.borrowed = borrow.s + borrow.e;
      r.indWorkers += x.workers;
    }
  }
  for (const r of regions) r.unfilledInd = r.ind.reduce((s, x) => s + Math.max(0, (x.need || 0) - (x.workers || 0)), 0);
}
/* Each town's people by kind: the nation's mix, with more educated people in the capital and university towns, fewer in towns cut off. */
function peoplePools(nation, regions, networks, adultsShare) {
  const ed = eduOf(nation);
  const sN = ed.s * adultsShare, eN = ed.e * adultsShare;
  const wE = regions.map(r => r.workforce * (r.city.capital ? 1.3 : 1) * (r.cm && r.cm.learning ? 1.5 : 1) * (networks[r.net].capital ? 1 : 0.6) * (r.pop > 4 ? 1.15 : 1));
  const wS = regions.map(r => r.workforce * (networks[r.net].capital ? 1 : 0.85));
  const W = regions.reduce((s, r) => s + r.workforce, 0);
  const sE = wE.reduce((s, v) => s + v, 0), sS = wS.reduce((s, v) => s + v, 0);
  regions.forEach((r, k) => {
    const e = sE > 0 ? Math.min(0.9 * r.workforce, eN * W * wE[k] / sE) : 0;
    const s = sS > 0 ? Math.min(r.workforce - e, sN * W * wS[k] / sS) : 0;
    r.pool = { u: Math.max(0, r.workforce - e - s), s, e };
    r.mix0 = { s: r.workforce > 0 ? s / r.workforce : 0, e: r.workforce > 0 ? e / r.workforce : 0 };
  });
}
/* Service jobs: hospitals, schools and government hire first (doctors, nurses, teachers), then shops, transport and offices.
   Posts nobody qualified could fill are filled by whoever is left. */
function takeServices(pool, n, pubN) {
  const pub = { u: 0, s: 0, e: 0 }, rest = { u: 0, s: 0, e: 0 };
  const np = Math.min(n, Math.max(0, pubN));
  takeMix(pool, np, JOB_MIX.public, pub);
  takeMix(pool, n - np, JOB_MIX.services, rest);
  const into = { u: pub.u + rest.u, s: pub.s + rest.s, e: pub.e + rest.e, over: (pub.over || 0) + (rest.over || 0), pub };
  const got = poolSum(into);
  if (got < n - 1e-9) { const extra = { u: 0, s: 0, e: 0 }; takeAny(pool, n - got, extra); into.u += extra.u; into.s += extra.s; into.e += extra.e; }
  return into;
}
/* How well the public services are staffed: doctors, nurses, teachers and officials who have the training. */
function publicStaffing(regions) {
  let ne = 0, fe = 0, ns = 0, fs = 0;
  for (const r of regions) { const p = r.svcTake && r.svcTake.pub; if (!p) continue; ne += p.ne || 0; fe += p.fe || 0; ns += p.ns || 0; fs += p.fs || 0; }
  const e = ne > 1e-9 ? fe / ne : 1, s = ns > 1e-9 ? fs / ns : 1;
  return { e, s, f: 0.6 * e + 0.4 * s, ne, fe, ns, fs };
}

/* ---------- Wages, pensions and the living standard ---------- */
function labourLam(n, L) {
  L = L || (n && n.laws) || {};
  return labourLaw(L, "hours").lam + labourLaw(L, "unions").lam + labourLaw(L, "minwage").lam + modSum(n, "wage");
}
function strikeCut(n, kind) {
  let c = 0;
  for (const m of (n && n.mods) || []) if (m.strike === kind) c = Math.max(c, m.strikeCut || 0.5);
  return c;
}
function pensionPlan(pop, D, L, avgWage) {
  const P = labourLaw(L, "pensions");
  const old = pop * D.old;
  const pensioners = old * (1 - P.oldWork);
  const per = P.rate * avgWage;
  return { old, pensioners, per, cost: pensioners * per };
}
/* Who earns what: each workplace pays its workers a share of what it makes, split by kind of worker. */
function peopleWages(nation, regions, all, econ, LF) {
  const L = (nation && nation.laws) || {};
  const dLam = labourLam(nation, L);
  const acts = [];
  const add = (place, r, va, take, lam) => { if (va > 0 && take && poolSum(take) > 1e-9) acts.push({ place, r, va, take, lam: clamp(lam + dLam, 0.2, 0.9) }); };
  for (const x of all) {
    const def = INDUSTRIES[x.kind];
    add(def.sector === "primary" ? "primary" : def.sector, x.region, x.va || 0, x.take, LAMBDA[def.sector] || 0.55);
  }
  for (const r of regions) {
    add("farm", r, r.farmVA || 0, r.farmTake, LAMBDA.farm);
    if (r.svcTake && r.svcVA > 0) {
      const pub = Math.min(r.publicJobs || 0, r.serviceWorkers || 0), all2 = Math.max(1e-9, r.serviceWorkers || 0);
      const fp = pub / all2;
      const split = (t, f) => ({ u: t.u * f, s: t.s * f, e: t.e * f });
      add("tertiary", r, r.svcVA * (1 - fp), split(r.svcTake, 1 - fp), LAMBDA.tertiary);
      add("public", r, r.svcVA * fp, split(r.svcTake, fp), LAMBDA.tertiary);
    }
  }
  // first pass: what each workplace pays each kind of worker
  let bill = 0, workers = 0;
  for (const a of acts) {
    a.bill = a.va * a.lam;
    const units = a.take.u * PEOPLE.wageW.u + a.take.s * PEOPLE.wageW.s + a.take.e * PEOPLE.wageW.e;
    a.unit = units > 0 ? a.bill / units : 0;
    bill += a.bill; workers += poolSum(a.take);
  }
  const avg0 = workers > 0 ? bill / workers : 0;
  // a minimum wage lifts the lowest pay (out of the owners' share)
  const floor = labourLaw(L, "minwage").floor * avg0;
  let lifted = 0;
  if (floor > 0) for (const a of acts) {
    const wu = a.unit * PEOPLE.wageW.u;
    if (wu < floor && a.take.u > 0) { const extra = (floor - wu) * a.take.u; a.bill += extra; a.floorU = floor; lifted += extra; bill += extra; }
  }
  const lv = { u: { pay: 0, n: 0 }, s: { pay: 0, n: 0 }, e: { pay: 0, n: 0 } };
  const places = {};
  for (const a of acts) {
    const wu = a.floorU ? a.floorU : a.unit * PEOPLE.wageW.u;
    const pay = { u: wu * a.take.u, s: a.unit * PEOPLE.wageW.s * a.take.s, e: a.unit * PEOPLE.wageW.e * a.take.e };
    for (const l of SKILL_LEVELS) { lv[l].pay += pay[l]; lv[l].n += a.take[l]; }
    const P = places[a.place] || (places[a.place] = { pay: 0, n: 0, va: 0 });
    P.pay += pay.u + pay.s + pay.e; P.n += poolSum(a.take); P.va += a.va;
    a.r.wages = (a.r.wages || 0) + pay.u + pay.s + pay.e;
  }
  const avg = workers > 0 ? bill / workers : 0;
  const pop = Math.max(0.001, econ.pop);
  const D = demoOf(nation);
  const pen = pensionPlan(pop, D, L, avg);
  const benefit = { minimal: 0, basic: 0.15, good: 0.3, generous: 0.45 }[L.services || "basic"] || 0;
  const wageU = lv.u.n > 0 ? lv.u.pay / lv.u.n : avg;
  const jobless = (econ.unemployed || 0) * benefit * wageU;
  const plots = regions.reduce((s, r) => s + (r.smallholders || 0), 0) * wageU * 0.5;
  const goods = 0.8 + 0.2 * Math.min(1, econ.sat ? econ.sat.goods ?? 1 : 1);
  const income = bill + pen.cost + jobless + plots;
  for (const r of regions) r.incomeK = (r.wages || 0) / Math.max(0.001, r.pop);
  return {
    bill, lifted, avg, wage: { u: wageU, s: lv.s.n > 0 ? lv.s.pay / lv.s.n : avg, e: lv.e.n > 0 ? lv.e.pay / lv.e.n : avg },
    places, lam: econ.gdp > 0 ? bill / econ.gdp : 0, dLam, pension: pen, benefit, joblessPay: jobless, plotsPay: plots,
    lsRaw: income / pop, ls: income / pop * goods, goodsK: goods, income,
  };
}
/* After the economy is worked out: the nation's people and work in one place. */
function peopleSummary(nation, regions, all, econ, LF, armed) {
  const tot = { u: 0, s: 0, e: 0 }, have = { u: 0, s: 0, e: 0 }, short = { s: 0, e: 0 }, posNeed = { s: 0, e: 0 };
  let over = 0, borrowed = 0;
  const shortages = [];
  for (const r of regions) {
    have.u += r.workforce * (1 - r.mix0.s - r.mix0.e); have.s += r.workforce * r.mix0.s; have.e += r.workforce * r.mix0.e;
    for (const x of r.ind) {
      if (!(x.need > 0)) continue;
      const mix = jobMix(x.kind);
      posNeed.s += x.need * mix[1]; posNeed.e += x.need * mix[2];
      over += (x.take && x.take.over) || 0;
      borrowed += x.borrowed || 0;
      if (x.lack === "s" || x.lack === "e") {
        const miss = x.need * (x.lack === "e" ? mix[2] : mix[1]) * (1 - x.fill);
        short[x.lack] += miss;
        if (miss > 0.0005) shortages.push({ town: r.city.name, cityId: r.city.id, kind: x.kind, site: !!x.site, fill: x.fill, lack: x.lack, miss });
      }
    }
    for (const t of [r.farmTake, r.svcTake]) if (t) over += t.over || 0;
  }
  shortages.sort((a, b) => b.miss - a.miss);
  const W = Math.max(1e-6, regions.reduce((s, r) => s + r.workforce, 0));
  const wages = peopleWages(nation, regions, all, econ, LF);
  return {
    lf: LF.lf, parts: { men: LF.men, women: LF.women, kids: LF.kids, old: LF.old }, adultsShare: LF.lf > 0 ? LF.adults / LF.lf : 1, armed,
    have, need: posNeed, short, shortages: shortages.slice(0, 12), over, borrowed, W, staff: publicStaffing(regions),
    ...wages,
  };
}
function pensionCostYear(n, econ, laws) {
  const P = econ.people;
  if (!P) return 0;
  return pensionPlan(econ.pop, demoOf(n), laws || n.laws, P.avg).cost;
}

/* ---------- Each season: children are born, people grow old, workers learn ---------- */
function peopleSeason(w, g, n, econ, pf, popBefore) {
  ensurePeople(w, g, n, econ);
  const D = n.demo, P = econ.people;
  const kp = P ? P.lsRaw : 10;
  n.lastFamine = econ.famineShare || 0;
  n.era = g.era || 0;
  const R = demoRates(n, kp, n.laws, g);
  const f = demoFlows(D, R);
  const q = 0.25;
  const actual = popBefore > 0 ? ((pf.births || 0) + (pf.famine || 0)) / popBefore : 0;
  // where food is short, fewer children are born and live; where the land feeds more, the nation grows faster at every age
  let B = f.births * q + Math.min(0, actual - f.r * q);
  if (B < 0) B = 0;
  let K = D.kids + B - f.kOut * q - f.dk * q;
  let Wk = 1 - D.kids - D.old + f.kOut * q - f.wOut * q - f.dw * q - (popBefore > 0 ? Math.max(0, -(pf.war || 0)) / popBefore : 0);
  let O = D.old + f.wOut * q - f.dold * q;
  K = Math.max(0.05, K); Wk = Math.max(0.2, Wk); O = Math.max(0.005, O);
  const T = K + Wk + O;
  D.kids = K / T; D.old = O / T;
  D.e0 = R.e0; D.tfr = R.tfr; D.r = f.r; D.births = B * 4; D.deaths = f.deaths;
  D.staff = P && P.staff ? P.staff.f : 1;
  // women's work changes with the law, slowly; in a great war they take the places of the men at the front
  const atWarNow = enemiesOf(g, n.id).length > 0;
  const boost = atWarNow && ARMY_ORDER.indexOf(n.laws.army) >= 2 && n.laws.women !== "home" ? 0.12 : 0;
  const pwT = labourLaw(n.laws, "women").pw + boost;
  D.pw = (D.pw ?? pwT) + (pwT - (D.pw ?? pwT)) * (boost ? 0.25 : PEOPLE.pwPull);
  D.warWork = boost > 0;
  D.hist = (D.hist || []).concat([{ t: g.turn, ls: Math.round((P ? P.ls : 0) * 100) / 100 }]).slice(-24);
  peopleSkills(n, econ);
}
/* What the young bring from school, and what adults learn. */
function skillTarget(n, econ, L) {
  L = L || n.laws;
  const want = EDU_ENTRY[L.education || "basic"] || EDU_ENTRY.basic, low = EDU_ENTRY.minimal;
  const st = econ.people && econ.people.staff ? econ.people.staff.f : 1;
  const base = { s: low.s + (want.s - low.s) * st, e: low.e + (want.e - low.e) * st };
  const C = labourLaw(L, "childwork");
  const uni = Math.min(0.1, 0.02 * ((econ.levels && econ.levels.university) || 0));
  const bonus = ((econ.skillBonus || 0) + (econ.citySkill || 0)) / PEOPLE.skillE;
  return { s: clamp(base.s + C.entryS, 0.03, 0.6), e: clamp(base.e + C.entryE + uni + bonus, 0.005, 0.42) };
}
function peopleSkills(n, econ) {
  const ed = n.edu || (n.edu = eduFromSkill(n.skill));
  const T = skillTarget(n, econ);
  ed.s += (T.s - ed.s) * PEOPLE.renew;
  ed.e += (T.e - ed.e) * PEOPLE.renew;
  // learning on the job, where skilled hands are short
  const P = econ.people;
  if (P && P.short && P.W > 0 && P.short.s > 0) {
    const u = Math.max(0, 1 - ed.s - ed.e);
    ed.s += Math.min(P.short.s / P.W, PEOPLE.train * u);
  }
  ed.s = clamp(ed.s, 0.02, 0.65); ed.e = clamp(ed.e, 0.003, 0.45);
  if (ed.s + ed.e > 0.95) { const k = 0.95 / (ed.s + ed.e); ed.s *= k; ed.e *= k; }
  n.skill = skillIndex(ed.s, ed.e);
}
/* A decision or great work that raises "skill" by v: shared between trades and universities. */
function peopleSkillAdd(n, v) {
  const ed = n.edu || (n.edu = eduFromSkill(n.skill));
  ed.s = clamp(ed.s + v * 0.7 / PEOPLE.skillS, 0.02, 0.65);
  ed.e = clamp(ed.e + v * 0.3 / PEOPLE.skillE, 0.003, 0.45);
  n.skill = skillIndex(ed.s, ed.e);
}
/* Natural growth sets how fast people multiply where food allows: richer, older nations grow slowly or shrink. */
function peopleGrowth(fed, n) {
  const r = n && n.demo && n.demo.r != null ? n.demo.r : PEOPLE.natRef;
  const k = r / PEOPLE.natRef;
  return k >= 0 ? fed * Math.min(k, 2) : r / 4;
}
/* The owners' share of output: lower pay leaves more to invest, higher pay less. */
function profitFactor(n) { return clamp((PEOPLE.lamRef - labourLam(n)) / PEOPLE.lamRef, 0.6, 1.4); }

/* ---------- Stability ---------- */
function peopleStabTerms(n, econ, laws) {
  const L = laws || n.laws;
  const out = [];
  const H = labourLaw(L, "hours"), U = labourLaw(L, "unions");
  if (H.stab) out.push({ label: `Working hours: ${H.label.toLowerCase()} (${H.sub} a week)`, value: H.stab });
  if (U.stab) out.push({ label: "Trade unions banned", value: U.stab });
  const D = demoOf(n);
  if (labourLaw(L, "pensions").rate === 0 && D.old > 0.08) out.push({ label: `Old people without pensions (${pct(D.old)} of the people are over 65)`, value: -Math.min(6, (D.old - 0.08) * 60) });
  const era = n.era || 0;
  if (L.childwork === "allowed" && era >= 2) out.push({ label: "Children in the mines and mills shock the public", value: -2 });
  return out;
}

/* ---------- What the groups think of it all ---------- */
function peopleGroupTerms(n, econ, L, k, T) {
  const lv = (key, map) => { const v = map[(L && L[key]) || LABOUR[key].def] || 0; if (v) T(`${LABOUR[key].name}: ${labourLaw(L, key).label.toLowerCase()}${labourLaw(L, key).sub ? ` (${labourLaw(L, key).sub})` : ""}`, v); };
  const D = demoOf(n), P = econ.people;
  if (k === "workers") {
    lv("hours", { long: -8, short: 6 });
    lv("unions", { banned: -12, strong: 8 });
    lv("minwage", { low: 3, high: 7 });
    lv("childwork", { allowed: -3, banned: 2 });
    lv("pensions", { basic: 3, generous: 6 });
    if (labourLaw(L, "pensions").rate === 0 && D.old > 0.08) T("Old workers with no pension", -Math.min(6, (D.old - 0.08) * 80));
    const tr = lsTrend(n);
    if (tr !== null && tr > 0.03) T(`Living standards rising (${signedPct(tr, 1)} in a year)`, 4);
    else if (tr !== null && tr < -0.02) T(`Living standards falling (${signedPct(tr, 1)} in a year)`, -clamp(-tr * 150, 2, 10));
  } else if (k === "business") {
    lv("hours", { long: 5, short: -6 });
    lv("unions", { banned: 6, strong: -8 });
    lv("minwage", { low: -3, high: -7 });
    lv("childwork", { allowed: 3, banned: -2 });
    lv("women", { home: -3, equal: 3 });
    lv("pensions", { generous: -3 });
    if (P && P.need && P.need.s + P.need.e > 0.01) {
      const sh = (P.short.s + P.short.e) / (P.need.s + P.need.e);
      if (sh > 0.03) T(`Factories and offices can't find skilled people (${pct(sh)} of the posts empty)`, -clamp(sh * 40, 2, 8));
    }
  } else if (k === "farmers") {
    lv("childwork", { allowed: 3, banned: -4 });
    lv("minwage", { high: -3 });
  } else if (k === "faith") {
    lv("women", { home: 5, equal: -7 });
    lv("childwork", { allowed: -2 });
    lv("pensions", { basic: 2, generous: 3 });
  }
}
function lsTrend(n) {
  const h = (n.demo && n.demo.hist) || [];
  if (h.length < 5) return null;
  const a = h[h.length - 5].ls, b = h[h.length - 1].ls;
  return a > 0 ? b / a - 1 : null;
}
/* What workers and employers ask for. */
const PEOPLE_DEMANDS = {
  workers: [
    { key: "unions", applies: (n) => lawIs(n, "unions", ["banned"]), met: (n) => !lawIs(n, "unions", ["banned"]), law: () => ({ law: "unions", value: "allowed" }), label: () => "Allow trade unions" },
    { key: "hours", applies: (n) => lawIs(n, "hours", ["long"]), met: (n) => !lawIs(n, "hours", ["long"]), law: () => ({ law: "hours", value: "normal" }), label: () => "A 48-hour week (normal working hours)" },
    { key: "pension", applies: (n) => lawIs(n, "pensions", ["none"]) && demoOf(n).old > 0.08, met: (n) => !lawIs(n, "pensions", ["none"]), law: () => ({ law: "pensions", value: "basic" }), label: () => "Pensions for old workers" },
    { key: "minwage", applies: (n, c) => lawIs(n, "minwage", ["none"]) && (lsTrend(n) ?? 0) < 0, met: (n) => !lawIs(n, "minwage", ["none"]), law: () => ({ law: "minwage", value: "low" }), label: () => "A minimum wage" },
  ],
  business: [
    { key: "unions", applies: (n) => lawIs(n, "unions", ["strong"]), met: (n) => !lawIs(n, "unions", ["strong"]), law: () => ({ law: "unions", value: "allowed" }), label: () => "Curb the unions (allowed, not strong)" },
    { key: "minwage", applies: (n) => lawIs(n, "minwage", ["high"]), met: (n) => !lawIs(n, "minwage", ["high"]), law: () => ({ law: "minwage", value: "low" }), label: () => "Lower the minimum wage" },
    { key: "skills", applies: (n, c) => { const P = c.econ.people; return !!P && P.need.s + P.need.e > 0.01 && (P.short.s + P.short.e) / (P.need.s + P.need.e) > 0.06 && EDU_ORDER.indexOf(n.laws.education || "basic") < 3; }, met: (n, c, d) => EDU_ORDER.indexOf(n.laws.education || "basic") > EDU_ORDER.indexOf(d.from), law: (n) => ({ law: "education", value: EDU_ORDER[EDU_ORDER.indexOf(n.laws.education || "basic") + 1] }), label: (n) => `Train more skilled people: education to ${EDU_LAWS[EDU_ORDER[EDU_ORDER.indexOf(n.laws.education || "basic") + 1]].label.toLowerCase()}`, extra: (n) => ({ from: n.laws.education || "basic" }) },
  ],
};

/* ---------- Strikes: workers stop one industry until they are heard ---------- */
const STRIKERS = {
  mine: "iron miners", coalmine: "coal miners", goldmine: "gold miners", oilfield: "oil workers", logging: "loggers", fishing: "fishermen", smelter: "smelter workers",
  power_coal: "power station workers", power_gas: "power station workers", power_hydro: "dam and power workers", power_nuclear: "nuclear plant workers",
  light: "textile and workshop hands", foodproc: "food factory workers", heavy: "steel and machine workers", chemical: "chemical workers", electronics: "electronics workers",
  resort: "hotel workers", university: "university staff", techpark: "technicians", broadcast: "printers and broadcasters", business: "office clerks",
};
function strikeTarget(c) {
  const by = {};
  for (const r of c.econ.regions) for (const x of r.ind) if (x.workers > 0) by[x.kind] = by[x.kind] || { kind: x.kind, workers: 0, va: 0, town: r.city, top: 0 };
  for (const r of c.econ.regions) for (const x of r.ind) if (x.workers > 0) { const b = by[x.kind]; b.workers += x.workers; b.va += x.va || 0; if (x.workers > b.top) { b.top = x.workers; b.town = r.city; } }
  return Object.values(by).sort((a, b) => b.workers - a.workers)[0] || null;
}
const PEOPLE_DECISIONS = {
  walkout: {
    cat: "Economy", icon: "people", tone: "bad",
    find: c => {
      const U = labourLaw(c.n.laws, "unions");
      const s = groupOf(c.n, "workers");
      if (!U.strikes || !s || (c.n.mods || []).some(m => m.strike)) return null;
      const at = c.n.laws.unions === "strong" ? 55 : 46;
      if (s.approval >= at) return null;
      const t = strikeTarget(c);
      if (!t || t.workers < 0.01) return null;
      return { w: (0.5 + (at - s.approval) * 0.08) * U.strikes, t };
    },
    make: (c, f) => {
      const t = f.t || strikeTarget(c);
      if (!t) return null;
      const who = STRIKERS[t.kind] || "workers";
      const strong = c.n.laws.unions === "strong";
      const loss = Math.max(0.05, round1(t.va * 0.5 / 4));
      return {
        title: `The ${who} go on strike`, cell: t.town.cell, cityId: t.town.id,
        body: `${fmtPeople(t.workers)} ${who} have walked out${t.town ? `, starting in ${t.town.name}` : ""}. The ${strong ? "powerful unions" : "unions"} say: ${topGrievances(c, "workers")}. While they are out, the ${who} produce half as much (about ${fmtMoney(loss)} a season).`,
        options: [
          { id: "a", tag: "kind", label: "Give them a pay rise", effects: [{ t: "mod", key: "payrise", label: "Pay rise after the strike", wage: 0.02, seasons: 12 }, { t: "group", v: { workers: 8, business: -4 }, seasons: 12 }] },
          { id: "b", tag: "thrift", label: "Meet them halfway", effects: [{ t: "mod", key: "strike", label: `The ${who} on strike`, strike: t.kind, strikeCut: 0.5, seasons: 1 }, { t: "mod", key: "payrise", label: "A small pay rise", wage: 0.01, seasons: 8 }, { t: "group", v: { workers: 3, business: -1 }, seasons: 8 }] },
          { id: "c", tag: "proud", label: "Wait them out", effects: [{ t: "mod", key: "strike", label: `The ${who} on strike`, strike: t.kind, strikeCut: 0.6, seasons: 3 }, { t: "group", v: { workers: -6, business: 3 }, seasons: 12 }] },
          ...(strong ? [] : [{ id: "d", tag: "force", label: "Send in the police", effects: [{ t: "stab", v: -2 }, { t: "group", v: { workers: -12, business: 2 }, seasons: 16 }, { t: "mod", key: "strikepolice", label: "Strikers beaten by the police", stab: -1, seasons: 4 }] }]),
        ], def: "b",
      };
    },
  },
};

Object.assign(DECISIONS, PEOPLE_DECISIONS);
GROUP_DEMANDS.workers.splice(1, 0, ...PEOPLE_DEMANDS.workers);
GROUP_DEMANDS.business.splice(1, 0, ...PEOPLE_DEMANDS.business);

/* ---------- Rival governments: labour laws by character, and as they grow richer ---------- */
function peopleLawWishes(g, n, econ, push, budget) {
  const L = n.laws, P = econ.people, D = demoOf(n);
  const pref = LAB_PREFS[n.archetype] || {};
  const atWarNow = enemiesOf(g, n.id).length > 0;
  const ls = P ? P.ls : 0;
  if (atWarNow && ARMY_ORDER.indexOf(L.army) >= 2 && L.women === "home") push("women", "some", "bring women into the war factories");
  if (L.childwork === "allowed" && ls > 22) push("childwork", "limited", "send the children to school");
  if (L.childwork === "limited" && ls > 35 && pref.childwork !== "allowed") push("childwork", "banned", "every child at school");
  const afford = law => { const v = LABOUR.pensions.order[LABOUR.pensions.order.indexOf(L.pensions) + 1]; if (!v) return false; const extra = (pensionCostYear(n, econ, { ...L, pensions: v }) - pensionCostYear(n, econ, L)) / 4; return budget && budget.balance > extra * 1.2 && n.treasury > 0; };
  if (L.pensions === "none" && D.old > 0.09 && afford()) push("pensions", "basic", "care for the old");
  if (L.unions === "banned" && n.stability < 35) push("unions", "allowed", "let the workers organize before they revolt");
  if (g.turn >= 8 && n.stability > 50 && !atWarNow) for (const k of LABOUR_ORDER) {
    if (!pref[k] || L[k] === pref[k]) continue;
    const O = LABOUR[k].order, i = O.indexOf(L[k]), j = O.indexOf(pref[k]);
    if (k === "childwork" && j < i) continue;   // nobody goes back to child labour
    if (k === "pensions" && j > i && !afford()) continue;
    push(k, O[i + (j > i ? 1 : -1)], "its own ideas about work");
    break;
  }
}

/* ---------- What a law change would do (shown on the law buttons) ---------- */
function peopleLawPreview(w, g, nid, law, value) {
  const n = g.nations[nid];
  const base = computeEconomy(w, g, nid);
  const L2 = { ...n.laws, [law]: value };
  const n2 = { ...n, laws: L2 };
  if (law === "women") n2.demo = { ...demoOf(n), pw: labourLaw(L2, "women").pw };
  const g2 = { ...g, nations: g.nations.map(z => (z.id === nid ? n2 : z)) };
  const after = computeEconomyRaw(w, g2, nid);
  const P0 = base.people, P1 = after.people;
  const R0 = demoRates(n, P0 ? P0.lsRaw : 10, n.laws), R1 = demoRates(n, P0 ? P0.lsRaw : 10, L2);
  const pen0 = pensionCostYear(n, base, n.laws), pen1 = pensionCostYear(n, base, L2);
  return {
    dGdp: after.gdp / Math.max(1e-6, base.gdp) - 1,
    dLs: P0 && P1 ? P1.ls / Math.max(1e-6, P0.ls) - 1 : 0,
    dU: (after.unemployment || 0) - (base.unemployment || 0),
    dWorkers: (after.workforce || 0) - (base.workforce || 0),
    dTfr: R1.tfr - R0.tfr, dE0: R1.e0 - R0.e0,
    dPension: (pen1 - pen0) / 4,
    dInvest: profitFactor(n2) / profitFactor(n) - 1,
    dSkill: (() => { const a = skillTarget(n, base, n.laws), b = skillTarget(n, base, L2); return { s: b.s - a.s, e: b.e - a.e }; })(),
  };
}

/* ---------- Ministers' files ---------- */
function peopleFileLines(w, g, n, econ) {
  const P = econ.people, D = demoOf(n), ed = eduOf(n);
  if (!P) return [];
  const L = n.laws;
  const T = skillTarget(n, econ);
  const out = [
    `Ages: ${pct(D.kids)} children under 15, ${pct(1 - D.kids - D.old)} of working age, ${pct(D.old)} over 65. Children per woman ${D.tfr.toFixed(1)}; life expectancy ${Math.round(D.e0)} years; natural growth ${signedPct(D.r, 1)} a year.`,
    `Who works: ${fmtPeople(P.lf * econ.pop)} (${pct(P.lf)} of the people): men ${fmtPeople(P.parts.men * econ.pop)}, women ${fmtPeople(P.parts.women * econ.pop)}${P.parts.kids > 0.0005 ? `, children ${fmtPeople(P.parts.kids * econ.pop)}` : ""}${P.parts.old > 0.0005 ? `, old people ${fmtPeople(P.parts.old * econ.pop)}` : ""}${D.warWork ? "; women have taken the places of the men at the front" : ""}.`,
    `Skills: ${pct(1 - ed.s - ed.e)} unskilled, ${pct(ed.s)} skilled, ${pct(ed.e)} educated (the schools are heading to ${pct(T.s)} skilled and ${pct(T.e)} educated). ${P.shortages.length ? `SHORT of skilled people: ${P.shortages.slice(0, 4).map(x => `${industryWord(x.kind)} in ${x.town} works at ${pct(x.fill)} for want of ${fmtPeople(x.miss)} ${SKILL_INFO[x.lack].short} workers`).join("; ")}.` : "Every workplace finds the skilled people it needs."}${P.over > 0.01 ? ` ${fmtPeople(P.over)} skilled or educated people work below their training.` : ""}${P.staff.f < 0.95 ? ` Hospitals, schools and offices of state are SHORT of trained staff: ${pct(P.staff.e)} of the posts for doctors, teachers and officials are filled, ${pct(P.staff.s)} for nurses and clerks; the healthcare and schools laws work only that far.` : ""}`,
    `Living standard: $${fmt1(P.ls)}k a year per person (wages, pensions and benefits${P.goodsK < 0.99 ? ", less what empty shops cannot sell" : ""}); ${(() => { const tr = lsTrend(n); return tr === null ? "" : `${signedPct(tr, 1)} in a year; `; })()}average wage $${fmt1(P.avg)}k (unskilled $${fmt1(P.wage.u)}k, skilled $${fmt1(P.wage.s)}k, educated $${fmt1(P.wage.e)}k). Workers take ${pct(P.lam)} of what the nation makes.`,
    `Labour laws: ${LABOUR_ORDER.map(k => `${LABOUR[k].name.toLowerCase()} ${labourLaw(L, k).label.toLowerCase()}`).join(", ")}.${P.pension.cost > 0.001 ? ` Pensions cost ${fmtMoney(P.pension.cost / 4)} a season for ${fmtPeople(P.pension.pensioners)} pensioners.` : ""}`,
  ];
  return out;
}
function industryWord(kind) {
  if (SITE_KINDS[kind]) return SITE_KINDS[kind].label;
  return (INDUSTRIES[kind] && INDUSTRIES[kind].label) || kind;
}
function peopleBriefLine(g, n, econ) {
  const P = econ.people, D = demoOf(n);
  if (!P) return "";
  return `People: living standard $${fmt1(P.ls)}k a person; ${pct(D.old)} over 65, ${D.tfr.toFixed(1)} children per woman; skills ${pct(eduOf(n).s)} skilled, ${pct(eduOf(n).e)} educated${P.shortages.length ? `; workplaces short of ${P.short.e > P.short.s ? "educated" : "skilled"} people` : ""}.`;
}

