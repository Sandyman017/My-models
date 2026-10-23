/* =====================================================================
   10c. Deals: terms, validation, evaluation from each nation's own interests
   ===================================================================== */
function termText(g, t) {
  switch (t.type) {
    case "trade": return "a trade agreement";
    case "nap": return `a non-aggression pact for ${TREATY_INFO.nap.seasons} seasons`;
    case "alliance": return "a defensive alliance";
    case "border": return `a border accord for ${TREATY_INFO.border.seasons} seasons`;
    case "payment": return `${nameOf(g, t.from)} pays ${fmtMoney(t.amount)} at once`;
    case "tribute": return `${nameOf(g, t.from)} pays ${fmtMoney(t.amount)} a season for ${t.seasons} seasons`;
    case "city": { const c = g.cities.find(x => x.id === t.cityId); return `${nameOf(g, t.from)} hands over ${c ? c.name : "a town"} and its land`; }
    case "peace": return "peace";
    case "lift_embargo": {
      // a noun phrase like the other terms ("agreed on an end to ..."); the goods while the embargo still stands
      if (t.by === "both") return "an end to the embargoes on both sides";
      const es = embargoesBy(g, t.by, t.on);
      const ons = t.on !== undefined ? [t.on] : [...new Set(es.map(e => e.on))];
      const the = id => (id === PLAYER ? nameOf(g, id) : `the ${nameOf(g, id)}`);   // the player's own name takes no "the"
      return `an end to ${the(t.by)}'s embargo${ons.length === 1 ? ` on ${the(ons[0])}${es.length ? ` (${embargoGoodsText(es)})` : ""}` : ""}`;
    }
    default: return "an unknown term";
  }
}
function termsText(g, terms) {
  const parts = terms.map(t => termText(g, t));
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function regionCellsForCity(g, city) {
  const own = g.cities.filter(c => c.owner === city.owner);
  const cells = [];
  for (let i = 0; i < N_CELLS; i++) {
    if (g.owner[i] !== city.owner) continue;
    let best = null, bd = Infinity;
    for (const c of own) {
      const d = (cellX(i) - cellX(c.cell)) ** 2 + (cellY(i) - cellY(c.cell)) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    if (best === city) cells.push(i);
  }
  return cells;
}
function regionValue(w, g, city) {
  const cells = regionCellsForCity(g, city);
  let pop = 0;
  cells.forEach(i => { pop += g.pop[i]; });
  const econ = computeEconomy(w, g, city.owner);
  const perPerson = econ.pop > 0.01 ? econ.gdp / econ.pop : ECON.baseOutputK;
  return { cells, pop, gdp: pop * perPerson };
}

function validateDeal(g, w, a, b, terms) {
  if (!terms.length) return "Add at least one term.";
  if (terms.length > 6) return "Too many terms in one proposal.";
  if (!g.nations[a].alive || !g.nations[b].alive) return "That nation no longer exists.";
  const war = atWar(g, a, b);
  const seen = new Set();
  for (const t of terms) {
    if (["trade", "nap", "alliance", "border", "peace", "lift_embargo"].includes(t.type)) {
      if (seen.has(t.type)) return "The same term appears twice.";
      seen.add(t.type);
    }
    if (["trade", "nap", "alliance", "border"].includes(t.type)) {
      if (war) return `You are at war. Make peace before proposing a ${TREATY_INFO[t.type].label.toLowerCase()}.`;
      if (hasTreaty(g, a, b, t.type)) return `A ${TREATY_INFO[t.type].label.toLowerCase()} is already in force.`;
      if (t.type === "trade" && sanctioned(g, a, b)) return "Sanctions voted by the World Assembly forbid trade between you.";
    }
    if (t.type === "peace" && !war) return "You are not at war with them.";
    if (t.type === "lift_embargo") {
      if (t.by !== "both" && t.by !== a && t.by !== b) return "The nation that lifts the embargo must be one of the two.";
      for (const L of t.by === "both" ? [a, b] : [t.by]) {
        const V = L === a ? b : a;
        if (!embargoesBy(g, L, V).length) return t.by === "both" ? `Only one side has an embargo: ask the ${nameOf(g, V)} to lift theirs.` : `The ${nameOf(g, L)} has no embargo on the ${nameOf(g, V)}.`;
      }
    }
    if (t.type === "payment" || t.type === "tribute") {
      if (t.from !== a && t.from !== b) return "The payer must be one of the two nations.";
      if (!(t.amount > 0) || !isFinite(t.amount)) return "Payments must be more than zero.";
      if (t.type === "tribute" && !(t.seasons >= 1 && t.seasons <= 20)) return "Tribute can last 1 to 20 seasons.";
      if (t.type === "payment") {
        const p = g.nations[t.from];
        const gdp = computeEconomy(w, g, t.from).gdp;
        if (p.treasury - t.amount < BUILD.creditFloorShare * gdp) return `The ${p.name} cannot afford ${fmtMoney(t.amount)}.`;
      }
    }
    if (t.type === "city") {
      const c = g.cities.find(x => x.id === t.cityId);
      if (!c || c.owner !== t.from || (t.from !== a && t.from !== b)) return "That town is not theirs to give.";
      if (g.cities.filter(x => x.owner === t.from).length <= 1) return "A nation cannot give away its last town.";
    }
  }
  return null;
}

/* Score a deal from nation E's point of view when P proposes it.
   1 point ≈ 1% of E's yearly output, so money, land, trade and security compare on one scale. */
function evaluateDeal(g, w, E, P, terms, ctx = {}) {
  const lines = [];
  const add = (label, pts) => { if (Math.abs(pts) >= 0.5) lines.push({ label, pts: Math.round(pts * 10) / 10 }); };
  const nE = g.nations[E], nP = g.nations[P], per = personality(nE);
  const econE = computeEconomy(w, g, E);
  const gdpE = Math.max(1, econE.gdp);
  const once = x => (100 * x) / gdpE;
  const flow = x => (100 * x * DIPLO.horizonYears) / gdpE;
  const r = rel(g, E, P);
  const trustF = clamp(r.trust / 60, 0.3, 1.3);
  const op = opinionDetail(g, E, P).value;
  const args = ctx.args || {};
  let asksFromE = false, commits = false;

  for (const t of terms) {
    if (t.type === "trade") {
      commits = true;
      const h = hypothetical(g, { treaty: { type: "trade", a: E, b: P } });
      const dE = computeEconomy(w, h, E).gdp - econE.gdp;
      const dP = computeEconomy(w, h, P).gdp - computeEconomy(w, g, P).gdp;
      if (dE < 0.05) add("No shared border, trade road or pair of ports for goods to pass through yet", -2);
      else add(`Trade would add ${fmtMoney(dE)} a year to our economy`, flow(dE) * per.tradeWeight * (args.mutual_prosperity ? 1 : 0.8));
      const th = threatFrom(w, g, E, P);
      if (th > 0.4) add(`It would also enrich a dangerous neighbor (+${fmtMoney(dP)} a year for them)`, -flow(dP) * 0.5 * th);
    }
    if (t.type === "nap") {
      commits = true;
      const th = threatFrom(w, g, E, P);
      if (th > 0.1) add(`Security against the ${nP.name}'s army`, th * 22 * per.caution * trustF);
      else add("We don't see them as a danger", -2);
      const wa = warAssessment(w, g, E, P);
      if (wa && wa.value > 0) add("It would tie our hands", -Math.min(25, wa.value));
    }
    if (t.type === "alliance") {
      commits = true;
      let best = 0, bestZ = null;
      for (const z of liveNations(g)) {
        if (z.id === E || z.id === P) continue;
        const s = Math.min(threatFrom(w, g, E, z.id), threatFrom(w, g, P, z.id));
        if (s > best) { best = s; bestZ = z.id; }
      }
      if (bestZ !== null && best > 0.05) add(`Shared danger from the ${nameOf(g, bestZ)}`, best * 30 * (args.shared_threat === bestZ ? 1 : 0.6) * trustF);
      else add("No common enemy to stand against", -4);
      const wars = enemiesOf(g, P).length;
      if (wars) add("They are at war; we could be dragged in", -12 * wars);
      const started = g.stats.warsStarted[P] || 0;
      if (started) add(`They have started ${started} war${started > 1 ? "s" : ""}`, -5 * Math.min(3, started));
      if (op < 15) add("We are not close enough for an alliance", -(15 - op) / 2);
    }
    if (t.type === "border") {
      commits = true;
      if (r.mods.some(m => m.key === "settled_near")) add("It would stop them settling near our border", 10);
      if (nE.archetype === "expansionist" && gap(w, g, E, P) > 0) add("It would limit our expansion", -10 * per.landWeight);
      add("Clear borders keep the peace", 2);
    }
    if (t.type === "payment") {
      if (t.from === P) add(`They pay us ${fmtMoney(t.amount)}`, once(t.amount) * per.moneyWeight);
      else { asksFromE = true; add(`We would pay ${fmtMoney(t.amount)}`, -once(t.amount) * 1.1); }
    }
    if (t.type === "tribute") {
      const total = t.amount * t.seasons;
      if (t.from === P) add(`Tribute of ${fmtMoney(t.amount)} a season`, once(total) * per.moneyWeight * Math.min(1, r.trust / 70));
      else { asksFromE = true; add(`We would pay ${fmtMoney(total)} in tribute`, -once(total) * 1.1); add("Paying tribute is humiliating", -8 * per.pride); }
    }
    if (t.type === "city") {
      const c = g.cities.find(x => x.id === t.cityId);
      const reg = regionValue(w, g, c);
      if (t.from === E) {
        asksFromE = true;
        const war = warBetween(g, E, P);
        const lost = war && g.occ[c.cell] >= 0 && !sameSide(war, g.occ[c.cell], E);
        const regain = lost ? clamp(0.5 + sideScore(war, E) / 150, 0.08, 0.6) : 1;
        add(lost ? `Losing ${c.name}, which their army already holds (${pct(regain)} chance we could win it back)` : `Losing ${c.name} (${fmtMoney(reg.gdp)} of output a year)`, -flow(reg.gdp) * regain);
        add(c.capital ? `${c.name} is our capital` : "Giving up our own land", (c.capital ? -150 : -12 * per.pride) * (lost ? 0.5 : 1));
        add(`${c.name} matters to us (importance ${c.imp || "?"}${cityRoleWords(c)})`, -clamp(c.imp || 20, 0, 110) * 0.15 * (lost ? 0.5 : 1));
        if (c.origin === P && (c.loyalty ?? CITY.loyalNative) < 60) add(`${c.name}'s people never felt at home with us`, 5);
      } else {
        add(`Gaining ${c.name} (${fmtMoney(reg.gdp)} of output a year)`, flow(reg.gdp) * per.landWeight * 0.8 + 4);
        add(`What ${c.name} adds to our standing (importance ${c.imp || "?"})`, clamp(c.imp || 20, 0, 110) * 0.08);
        if (c.origin === E) add(`Our own people in ${c.name} come home`, 12);
      }
    }
    if (t.type === "peace") {
      const war = warBetween(g, E, P);
      const pd = war ? peaceDesire(g, E, war) : 0;
      add(pd >= 0 ? "We want this war over" : "We are winning; peace now wastes our gains", pd);
      if (war && war.assemblyCall > g.turn) add("The World Assembly has called for peace", 10);
    }
    if (t.type === "lift_embargo") {
      // each side's embargoes, worked out on a copy of the world where they are lifted (merchants find their old buyers)
      const baseE = econBaseFor(w, g, E, econE);
      for (const L of t.by === "both" ? [P, E] : [t.by]) {
        const V = L === E ? P : E;
        const es = embargoesBy(g, L, V);
        if (!es.length) continue;
        const hE = computeEconomy(w, hypothetical(g, { lift: { by: L, on: V } }), E);
        const dE = hE.gdp - baseE.gdp;
        const goods = embargoGoodsText(es);
        if (L === P) {
          // their embargo on us ends; worth half to us, since it would end some day anyway
          if (dE > 0.005) add(`Their embargo on our trade ends (${goods}): ${fmtSignedMoney(dE)} a year for us`, flow(dE) * per.tradeWeight * 0.5);
          // fuel, arms and food count as in an embargo's hurt: a whole key supply is worth 6% of output a year
          const fuel = (hE.fuelSat ?? 1) - (baseE.fuelSat ?? 1), arms = (hE.armsSat ?? 1) - (baseE.armsSat ?? 1), fed = baseE.famineShare - hE.famineShare;
          const key = Math.max(fuel, arms, fed, 0);
          const keyText = fed >= Math.max(fuel, arms) ? `${pct(key)} more of our people would be fed` : fuel >= arms ? `Our army would get back ${pct(key)} of the fuel it needs` : `Our arms factories would get back ${pct(key)} of the metal and parts they need`;
          if (key >= 0.02) add(keyText, 0.5 * DIPLO.horizonYears * 6 * key);
          if (terms.some(x => (x.type === "payment" || x.type === "tribute") && x.from === E)) add("Paying them to end it is giving in to pressure", -3 * per.pride);
        } else {
          // we lift ours: our merchants trade again, but we give up the pressure it puts on them
          asksFromE = true;
          if (dE > 0.005) add(`Our merchants could trade with them again (${goods}): ${fmtSignedMoney(dE)} a year`, flow(dE) * per.tradeWeight);
          const cause = es.reduce((best, e) => { const c = embargoCause(w, g, e, { ignoreAnswers: t.by === "both" }); return c.score > best.score ? c : best; }, { score: 0, lines: [] });
          if (cause.score > 0) add(`It ends the pressure our embargo puts on them (${lcFirst(cause.lines.slice().sort((a, b) => b.pts - a.pts)[0].label)})`, -cause.score);
          if (terms.some(x => (x.type === "payment" || x.type === "tribute") && x.from === P)) add("Paid to lift it, we may not bring it back for four years", -1);
        }
      }
    }
  }
  add(`How we feel about the ${nP.name}`, op / 5);
  if (commits) add("Caution about new commitments", -1.5 * per.caution);

  if (ctx.threat && (asksFromE || terms.some(t => ["peace", "trade", "border", "nap"].includes(t.type)))) {
    const near = sharesBorder(g, E, P) ? 1 : gap(w, g, E, P) <= 3 ? 0.5 : 0.1;
    const ratio = armyPower(g, P) / Math.max(1, armyPower(g, E) * defenseMult(nE));
    const C = r.cred * clamp((ratio - 0.7) / 0.8, 0, 1) * near;
    if (C >= 0.25) {
      add(`Fear of war with the ${nP.name}`, C * 35 * per.caution);
      add("We resent being threatened", -8 * per.pride);
    } else add(near < 0.5 ? "An empty threat: they cannot reach us" : "An empty threat: their army is not strong enough", -8);
  }
  for (const l of ctx.extraLines || []) add(l.label, l.pts);
  if (ctx.tone === "insulting") add("Your insulting tone", -6);
  else if (ctx.tone === "hostile") add("Your hostile tone", -2);
  else if (ctx.tone === "respectful") add("Your courteous tone", 1);
  if (ctx.manipulation) add("Your letter tried to deceive our court", -10);

  const points = Math.round(lines.reduce((s, l) => s + l.pts, 0) * 10) / 10;
  let verdict = points >= 0 ? "accept" : "reject";
  let counter = null;
  if (verdict === "reject" && !ctx.noCounter) {
    counter = counterOffer(g, w, E, P, terms, points, gdpE, ctx);
    if (counter) verdict = "counter";
  }
  return { points, lines, verdict, counter };
}

function counterOffer(g, w, E, P, terms, points, gdpE, ctx) {
  if (terms.some(t => t.type === "alliance") && !hasTreaty(g, E, P, "nap")) {
    const alt = terms.filter(t => t.type !== "alliance").concat([{ type: "nap" }]);
    if (!validateDeal(g, w, P, E, alt)) {
      const ev = evaluateDeal(g, w, E, P, alt, { ...ctx, noCounter: true });
      if (ev.points >= 0) return { terms: alt, why: "They would sign a non-aggression pact, but not an alliance." };
    }
  }
  if (terms.some(t => t.type === "trade") && !terms.some(t => t.type !== "trade" && t.type !== "payment")) {
    const h = hypothetical(g, { treaty: { type: "trade", a: E, b: P } });
    if (computeEconomy(w, h, E).gdp - computeEconomy(w, g, E).gdp < 0.05) return null;
  }
  // asked to lift our embargo while theirs on us stands: both, or nothing
  const lift = terms.find(t => t.type === "lift_embargo" && t.by === E);
  if (lift && embargoesBy(g, P, E).length) {
    const alt = terms.map(t => (t === lift ? { type: "lift_embargo", by: "both" } : t));
    if (!validateDeal(g, w, P, E, alt)) {
      const ev = evaluateDeal(g, w, E, P, alt, { ...ctx, noCounter: true });
      if (ev.points >= 0) return { terms: alt, why: "They would lift their embargo if you lift yours." };
    }
  }
  const shortfall = -points + 1;
  if (shortfall > 0 && shortfall <= DIPLO.counterGap) {
    const amount = Math.max(0.5, Math.ceil(((shortfall * gdpE) / 100) * 2) / 2);
    const payer = g.nations[P];
    if (amount <= 0.5 * Math.max(0, payer.treasury)) {
      const existing = terms.find(t => t.type === "payment" && t.from === P);
      const alt = existing ? terms.map(t => (t === existing ? { ...t, amount: t.amount + amount } : t)) : terms.concat([{ type: "payment", from: P, amount }]);
      return { terms: alt, why: `They would agree if you also pay ${fmtMoney(amount)}${existing ? " more" : ""}.` };
    }
  }
  return null;
}

function transferCity(g, city, to) {
  const from = city.owner;
  if (to >= 0 && to !== from) leaderDeed(g, to, "conquered");
  const cells = regionCellsForCity(g, city);
  cells.forEach(i => { g.owner[i] = to; g.occ[i] = -1; });
  city.owner = to;
  cityChangedHands(g, city, from, to);
  groupsCityChanged(g, city, from, to);
  const wasCapital = city.capital;
  city.capital = false;
  if (wasCapital && to >= 0 && to !== from) city.wasCapital = g.turn;
  g.projects = g.projects.filter(p => p.cityId !== city.id || (p.kind === "ships" && p.seller !== undefined));
  if (wasCapital) ensureCapital(g, from);
  g._contact = null;
  sendHome(g);
  bumpWorld(g);
}
function ensureCapital(g, nid) {
  const own = g.cities.filter(c => c.owner === nid);
  if (!own.length || own.some(c => c.capital)) return;
  // the government moves to a province capital it still holds, or else to its most important city
  let best = own[0], bestScore = -Infinity;
  for (const c of own) {
    const pop = regionCellsForCity(g, c).reduce((s, i) => s + g.pop[i], 0);
    const score = (g.occ[c.cell] >= 0 ? -1e6 : 0) + (c.focus === "seat" || provSeat(g, c) ? 1e4 : 0) + (c.imp || 0) * 10 + pop;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  best.capital = true;
  if (typeof cityHist === "function") cityHist(g, best, `Became the capital of the ${nameOf(g, nid)} after the old capital was lost.`, "warn");
}

function applyDeal(g, w, A, B, terms) {
  const done = [];
  let peace = false;
  const paidBy = new Set();   // who paid to have an embargo lifted
  for (const t of terms) {
    if (["trade", "nap", "alliance", "border"].includes(t.type)) { addTreaty(g, t.type, A, B); done.push(TREATY_INFO[t.type].label); }
    if (t.type === "payment") {
      const to = t.from === A ? B : A;
      g.nations[t.from].treasury -= t.amount;
      g.nations[to].treasury += t.amount;
      done.push(`${fmtMoney(t.amount)} paid by the ${nameOf(g, t.from)}`);
    }
    if (t.type === "tribute") {
      const to = t.from === A ? B : A;
      addTreaty(g, "tribute", t.from, to, { amount: t.amount, seasons: t.seasons });
      done.push(`Tribute of ${fmtMoney(t.amount)} a season`);
    }
    if (t.type === "city") {
      const to = t.from === A ? B : A;
      const c = g.cities.find(x => x.id === t.cityId);
      if (c && c.owner === t.from) { transferCity(g, c, to); done.push(`${c.name} passed to the ${nameOf(g, to)}`); }
    }
    if (t.type === "peace") peace = true;
    if (t.type === "lift_embargo") {
      for (const L of t.by === "both" ? [A, B] : [t.by]) {
        const V = L === A ? B : A;
        const paid = terms.some(x => (x.type === "payment" || x.type === "tribute") && x.from === V);
        // a paid lift is a promise not to bring it back for four years (10s)
        for (const e of embargoesBy(g, L, V)) liftWithAnswers(w, g, e, "agreed in a deal", null, null, { paid });
        if (paid) paidBy.add(V);
        done.push(`The ${nameOf(g, L)} lifted its embargo`);
      }
    }
  }
  if (peace) { const war = warBetween(g, A, B); if (war) endWarBetween(g, war, A, B); done.push("Peace"); }
  // paying to have trade restored leaves a bitter taste, not goodwill
  if (paidBy.has(A)) addMod(g, A, B, "paid_to_trade", "Made us pay to trade", -8, 0.5, -16); else addMod(g, A, B, "agreed", "Reached agreements with us", 5, 0.5, 15);
  if (paidBy.has(B)) addMod(g, B, A, "paid_to_trade", "Made us pay to trade", -8, 0.5, -16); else addMod(g, B, A, "agreed", "Reached agreements with us", 5, 0.5, 15);
  rememberBoth(g, A, B, `The ${nameOf(g, A)} and the ${nameOf(g, B)} agreed to ${termsText(g, terms)}.`);
  return done;
}

