/* =====================================================================
   8. Budget and stability (pure)
   ===================================================================== */
function taxLaw(v) { return TAX_LAWS.find(t => t.v === v) || TAX_LAWS[1]; }

function computeBudget(n, econ, laws) {
  const gdp = econ.gdp, q = gdp / 4;
  const collection = clamp(ECON.collectFloor + (1 - ECON.collectFloor) * n.stability / ECON.collectFullAt, ECON.collectFloor, 1);
  const revenue = q * (laws.tax / 100) * collection * (hasTrait(n, "corrupt") ? 0.95 : 1) * (1 + modSum(n, "revenue") + (hasTrait(n, "greedy") ? 0.05 : 0));
  const services = econ.pop * SERVICE_LAWS[laws.services].costK / 4;
  const education = econ.pop * EDU_LAWS[laws.education || "basic"].costK / 4;
  const research = q * RESEARCH_LAWS[laws.research || "low"].share;
  // import tax on what pays duty (everything from the world market, and from nations without a trade agreement)
  const tariffs = (econ.tariffBase ?? econ.importBill ?? 0) / 4 * TRADE_LAWS[laws.trade || "balanced"].tariff;
  const mil = n.mil || { men: n.soldiers || 0, value: 0 };
  const soldiersNext = mil.men, recruits = 0;
  const armyUpkeep = (mil.men * MIL.upkeepK) / 4e6 + mil.value * MIL.maintenance;
  const arms = armsPlan(n, econ, laws);
  const army = armyUpkeep + arms.spend;
  const upkeep = econ.roadEdges * ECON.roadUpkeepB + portsUpkeep(econ.cities);
  const navy = n.navyUpkeep || 0;
  const gc = granaryCost(n, econ, laws);
  const cab = cabinetUpkeep(n, econ);
  const programs = econ.programs || 0;
  const pensions = pensionCostYear(n, econ, laws) / 4;
  const debt = Math.max(0, -n.treasury);
  const debtRatio = debt / Math.max(1, gdp);
  const interestRate = Math.max(0.01, ECON.interestBase + ECON.interestRisk * Math.max(0, debtRatio - ECON.riskRef) - (hasTech(n, "finance") ? 0.01 : 0) - ((econ.goods && econ.goods.supply.gold > 0.3) ? 0.005 : 0) - (econ.interestCut || 0));
  const interest = (debt * interestRate) / 4;
  return {
    gdp, collection, revenue, services, education, research, tariffs, army, armyUpkeep, arms, soldiersNext, recruits, upkeep, interest, interestRate, debt, debtRatio, navy,
    granary: gc.cost, granaryFill: gc.fill, ministries: cab, programs, pensions,
    balance: revenue + tariffs - services - education - research - army - navy - upkeep - interest - gc.cost - cab - programs - pensions,
  };
}

function stabilityTerms(n, econ, budget, laws, mood, extra = []) {
  const terms = [{ label: "Founding conditions (shape of the realm)", value: n.baseStability, base: true }];
  // each province capital eases governing a large country (10u), at most as much as two provincial seats did before v38
  const seatN = Math.min(PROV.seatEaseMax, econ.seats || 0), seatCut = 1 - PROV.seatEase * seatN;
  const sizeTerm = -Math.max(0, econ.area - FOUNDING.sizeThreshold) / FOUNDING.sizePerPoint * seatCut;
  if (sizeTerm < -0.05) terms.push({ label: `Governing ${fmtArea(econ.area)}${seatCut < 1 ? ` (eased by ${seatN} province capital${seatN > 1 ? "s" : ""})` : ""}`, value: sizeTerm });
  const tax = taxLaw(laws.tax);
  if (tax.stab) terms.push({ label: `${tax.label} taxes`, value: tax.stab });
  const sv = SERVICE_LAWS[laws.services];
  if (sv.stab) terms.push({ label: `${sv.label} healthcare`, value: sv.stab });
  const ed = EDU_LAWS[laws.education || "basic"];
  if (ed.stab) terms.push({ label: `${ed.label} schools and universities`, value: ed.stab });
  const tr = TRADE_LAWS[laws.trade || "balanced"];
  if (tr.stab) terms.push({ label: tr.stab > 0 ? "Protected industries keep jobs safe" : "Free trade unsettles local workers", value: tr.stab });
  if (econ.sat) {
    if (econ.sat.goods < 0.6) terms.push({ label: `Empty shops (${pct(econ.sat.goods)} of consumer goods wanted)`, value: -(0.6 - econ.sat.goods) * 15 });
    else if (econ.sat.goods > 0.95) terms.push({ label: "Shops are full", value: 2 });
    if (econ.sat.power < 0.95) terms.push({ label: `Blackouts (${pct(econ.sat.power)} of electricity needed)`, value: -(0.95 - econ.sat.power) * 12 });
    if ((econ.levels.broadcast || 0) > 0) terms.push({ label: "Radio and press rally the nation", value: Math.min(4.5, 1.5 * econ.levels.broadcast) });
  }
  const jobsTerm = unemploymentStabTerm(n, econ, laws);
  if (jobsTerm) terms.push(jobsTerm);
  terms.push(...peopleStabTerms(n, econ, laws));
  for (const t of cabinetStabTerms(n)) terms.push(t);
  if (n.crisisActive) terms.push({ label: "Banking crisis", value: -6 });
  if (hasTrait(n, "charismatic")) terms.push({ label: `${leaderName(n)} is loved by the people`, value: 4 });
  if (hasTrait(n, "corrupt")) terms.push({ label: `${leaderName(n)}'s corruption`, value: -3 });
  const ar = ARMY_LAWS[laws.army];
  if (ar.stab) terms.push({ label: `Conscription: ${ar.label.toLowerCase()}`, value: ar.stab });
  const am = ARMS_LAWS[laws.arms || "low"];
  if (am.stab) terms.push({ label: `Arms production: ${am.label.toLowerCase()} (rationing, long shifts)`, value: am.stab });
  if (Math.abs(mood) >= 0.05) terms.push({ label: mood >= 0 ? "Rising prosperity" : "Falling living standards", value: mood });
  if (econ.famineShare > 0.001) terms.push({ label: `Food shortage (${pct(econ.famineShare)} of people)${modSum(n, "famineShield") > 0 ? ", eased by full granaries" : ""}`, value: -ECON.famineWeight * econ.famineShare * (1 - Math.min(0.9, modSum(n, "famineShield"))) });
  if (econ.isolated.length) terms.push({ label: `${econ.isolated.length} town${econ.isolated.length > 1 ? "s" : ""} cut off from the capital`, value: -Math.min(ECON.isolationCap, ECON.isolationEach * econ.isolated.length) });
  if (budget.debtRatio > ECON.riskRef) terms.push({ label: `Debt at ${pct(budget.debtRatio)} of GDP`, value: -ECON.debtWeight * (budget.debtRatio - ECON.riskRef) });
  if (budget.debtRatio > ECON.lendersCloseAt) terms.push({ label: "Lenders refuse new loans", value: -ECON.lendersClosedStab });
  terms.push(...extra);
  return terms;
}
function sumTerms(terms) { return terms.reduce((s, t) => s + t.value, 0); }

function techGrowth(n, econ, laws, rng) {
  const armyShare = Math.min(0.2, n.soldiers / Math.max(1e5, econ.pop * 1e6));
  return ECON.techBase * EDU_LAWS[laws.education || "basic"].tech
    - ECON.taxDrag * (laws.tax / 100 - 0.25)
    - ECON.unrestDrag * Math.max(0, 50 - n.stability)
    - ECON.armyLaborDrag * Math.max(0, armyShare - 0.01)
    - ARMS_LAWS[laws.arms || "low"].drag
    + (hasTrait(n, "reformer") ? 0.0008 : 0)
    + (rng ? gaussian(rng) * ECON.shockSd : 0);
}

/* Forecast for the season ahead without changing anything. */
function forecast(w, g, nid, laws) {
  const n = g.nations[nid];
  const econ = computeEconomy(w, g, nid);
  const budget = computeBudget(n, econ, laws);
  const tg = techGrowth({ ...n, soldiers: budget.soldiersNext }, econ, laws, null);
  const mood = clamp(ECON.moodWeight * tg * 4, -ECON.moodCap, ECON.moodCap);
  const terms = stabilityTerms(n, econ, budget, laws, mood, (g.wars ? warStabilityTerms(g, nid) : []).concat(storyStabilityTerms(g, n)));
  const target = clamp(sumTerms(terms), 0, 100);
  return { econ, budget, terms, target };
}

