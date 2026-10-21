/* =====================================================================
   10n. The opening: a neighbor at your border, and its claim on one of your towns
   A new nation is not founded in an empty world. One great power lives right next door, and it says that one of
   your border towns is rightfully its own. It sends its demand in the first autumn. Give in, and the town is gone;
   refuse, and it will make war once it believes it can win, unless you make that look too costly: a bigger army,
   an ally on its border, or a deal. Hold on until the claim is dropped, and the nation remembers that you stood firm.
   ===================================================================== */
const OPENING = {
  neighborMin: 7, neighborMax: 10,    // the neighbor's capital this many cells from your land: close enough to touch
  demandTurn: 2,                      // the demand arrives at the start of the first autumn
  warFrom: 5,                         // after a refusal it may attack from the summer of the second year (instead of after two years)
  until: 14,                          // if it has not attacked by then, it drops the claim
  grace: 16,                          // apart from the claim, no great power attacks a new nation in its first four years
  truce: 8,                           // however the claim ends, a truce of two years follows
  bonus: 16,                          // how much the claim adds to its wish for war, while it stands
  mobilize: false,                    // a refusal makes it build more arms
};

/* A great power placed so that its land grows right up to yours. */
function placeNeighbor(w, g, rng, fromPlayer, foodTarget) {
  const cands = [];
  for (let i = 0; i < N_CELLS; i++) {
    if (!isLand(w, i) || g.owner[i] !== -1 || fromPlayer[i] < OPENING.neighborMin - 2 || fromPlayer[i] > OPENING.neighborMax) continue;
    const near = fromPlayer[i] >= OPENING.neighborMin ? 0 : -2;   // a little farther looks more natural
    cands.push({ i, s: foodWithin(w, g, i, 3, null) + 3 * Math.max(0, 1 - seaGeo(w).coastDist[i] / 5) + near + rng() * 0.5 });
  }
  cands.sort((a, b) => b.s - a.s);
  const touches = cells => cells.some(k => DIRS4.some(([dx, dy]) => { const x = cellX(k) + dx, y = cellY(k) + dy; return inBounds(x, y) && g.owner[idx(x, y)] === PLAYER; }));
  for (const c of cands.slice(0, 20)) {
    const cells = growTerritory(w, g, c.i, foodTarget, maxCells(w), k => g.owner[k] !== -1);
    if (cells.length < 12) continue;
    // the land between: it reaches out toward your border until the two touch
    const have = new Set(cells);
    for (let extra = 0; extra < 40 && !touches(cells); extra++) {
      let best = -1;
      for (const k of cells) for (const [dx, dy] of DIRS4) {
        const x = cellX(k) + dx, y = cellY(k) + dy;
        if (!inBounds(x, y)) continue;
        const j = idx(x, y);
        if (have.has(j) || !isLand(w, j) || g.owner[j] !== -1) continue;
        if (best < 0 || fromPlayer[j] < fromPlayer[best]) best = j;
      }
      if (best < 0) break;
      cells.push(best); have.add(best);
    }
    if (touches(cells)) return { capital: c.i, cells };
  }
  return null;
}

/* Who claims what: the neighbor, and the player's town nearest to its land. */
function setupOpening(w, g) {
  const cands = liveNations(g).filter(z => !z.isPlayer && !z.minor).map(z => ({ z, gap: gap(w, g, PLAYER, z.id) })).sort((a, b) => a.gap - b.gap);
  if (!cands.length || cands[0].gap > 6) return;
  const x = cands[0].z;
  const town = borderTownOf(w, g, PLAYER, x.id, 30);
  if (!town) return;
  g.opening = { by: x.id, cityId: town.id, town: town.name, stage: "claim", turn: g.turn, refusedAt: null, news: [] };
  addChronicle(g, `The ${x.name} says that ${town.name} rightfully belongs to it.`, "warn", PLAYER);
}
function openingActive(g) { return !!(g.opening && ["claim", "demand", "refused", "war"].includes(g.opening.stage)); }
function openingClaimant(g) { return g.opening && g.nations[g.opening.by]; }
/* The claim as a just cause, and as a reason for war on top of the usual ones. */
function openingWarBonus(g, x, y, winChance) {
  const O = g.opening;
  return O && O.by === x && y === PLAYER && O.stage === "refused" && g.turn < O.until ? Math.round(OPENING.bonus * Math.min(1, 2 * (winChance ?? 0.5))) : 0;
}
function openingWarAllowed(g, x, y) {
  const O = g.opening;
  return !!(O && O.by === x && y === PLAYER && O.stage === "refused" && g.turn >= OPENING.warFrom);
}

/* The opening, season by season: the demand, the answer, the war or the end of the claim. */
function openingSeason(w, g, dispatch) {
  const O = g.opening;
  if (!O || O.stage === "over") return;
  const x = g.nations[O.by], P = g.nations[PLAYER];
  const town = g.cities.find(c => c.id === O.cityId);
  const say = (text, tone) => { dispatch.opening = dispatch.opening || []; dispatch.opening.push({ text, tone }); addChronicle(g, text, tone === "bad" ? "bad" : tone === "good" ? "good" : "warn", PLAYER); };
  if (!x || !x.alive || !P.alive) { O.stage = "over"; O.result = "gone"; return; }
  // the town changed hands: given up, or taken in war
  if (!town || town.owner !== PLAYER) {
    if (O.stage !== "war" || !atWar(g, PLAYER, x.id)) {
      O.stage = "over"; O.result = "lost";
      openingTruce(g, x);
      say(`${O.town} now belongs to the ${x.name}. The claim is settled, and a truce of two years begins.`, "bad");
      return;
    }
  }
  if (atWar(g, PLAYER, x.id)) {
    if (O.stage !== "war") { O.stage = "war"; say(`The ${x.name} has gone to war over ${O.town}. Defend it!`, "bad"); }
    if (town && g.occ[town.cell] === x.id && !g.inbox.some(it => it.status === "open" && it.from === x.id && it.openingPeace)) {
      const terms = [{ type: "peace" }, { type: "city", from: PLAYER, cityId: O.cityId }];
      if (!validateDeal(g, w, x.id, PLAYER, terms)) {
        g.inbox.push({ id: g.nextId++, from: x.id, kind: "peace_claim", terms, threat: false, turn: g.turn, expires: g.turn + DIPLO.inboxSeasons, status: "open", openingPeace: true,
          text: `Our soldiers stand in ${O.town}. We have taken what is ours, and we want nothing more. Sign it over to us, and this war ends today.\n\n${leaderName(x) || `The ${x.name}`}`, reason: `It holds ${O.town}, which it always claimed.` });
        say(`The ${x.name} holds ${O.town} and offers peace if you sign it over. Its letter is waiting.`, "bad");
      }
    }
    return;
  }
  if (O.stage === "war") {   // the war is over and the town is still ours
    O.stage = "over"; O.result = "held";
    openingTruce(g, x);
    addPrestige(g, PLAYER, 6, "war", `Held ${O.town} against the ${x.name}`);
    addNationMod(g, P, { key: "stood_firm", label: `We held ${O.town}`, stab: 2, seasons: 6 });
    say(`The war is over and ${O.town} is still yours. The people are proud (+6 prestige, +2 stability for 6 seasons).`, "good");
    return;
  }
  // a deal instead of a war: tribute paid to it, or a pact not to attack
  const paid = (g.treaties || []).some(t => t.type === "tribute" && t.a === PLAYER && t.b === x.id);
  const pact = hasTreaty(g, PLAYER, x.id, "nap") || hasTreaty(g, PLAYER, x.id, "alliance");
  if ((paid || pact) && ["claim", "demand", "refused"].includes(O.stage)) {
    O.stage = "over"; O.result = paid ? "paid" : "pact";
    openingTruce(g, x);
    const r = rel(g, x.id, PLAYER);
    r.mods = r.mods.filter(m => m.key !== "claim_town");
    say(paid ? `The ${x.name} takes your money and drops its claim to ${O.town}. Peace, at a price.` : `The ${x.name} signed a pact with you and drops its claim to ${O.town}.`, "good");
    return;
  }
  if (O.stage === "claim" && g.turn >= OPENING.demandTurn) {
    O.stage = "demand";
    g.inbox.push({ id: g.nextId++, from: x.id, kind: "demand_city", terms: [{ type: "city", from: PLAYER, cityId: O.cityId }], threat: true, turn: g.turn, expires: g.turn + DIPLO.inboxSeasons, status: "open", opening: true,
      text: openingLetter(g, x, O), reason: `It has always said that ${O.town} is rightfully its own.` });
    say(`The ${x.name} demands ${O.town}, and threatens war if you refuse. Its letter is waiting for you.`, "bad");
    return;
  }
  if (O.stage === "demand") {
    const item = g.inbox.find(it => it.opening && it.from === x.id);
    if (item && item.status === "open") return;
    if (item && item.status === "accepted") return;   // the town changes hands: handled above next season
    O.stage = "refused"; O.refusedAt = g.turn; O.until = g.turn + (OPENING.until - OPENING.demandTurn);
    addMod(g, x.id, PLAYER, "claim_town", `Holds ${O.town}, which is rightfully ours`, -12, 0, -12);
    if (OPENING.mobilize) {
      const arms = ARMS_ORDER.indexOf(x.laws.arms || "low");
      x.laws = { ...x.laws, arms: ARMS_ORDER[Math.min(ARMS_ORDER.indexOf("high"), arms + 1)] };
    }
    say(`You refused. ${OPENING.mobilize ? `The ${x.name} is building more arms.` : `The ${x.name} says it will take ${O.town} by force.`} It may attack from ${seasonLabel(OPENING.warFrom)} if it thinks it can win. A strong enough army, an ally on its border, or a deal can stop it.`, "bad");
    return;
  }
  if (O.stage === "refused" && g.turn >= O.until) {
    O.stage = "over"; O.result = "held";
    openingTruce(g, x);
    const r = rel(g, x.id, PLAYER);
    r.mods = r.mods.filter(m => m.key !== "claim_town");
    addPrestige(g, PLAYER, 5, "diplomacy", `Kept ${O.town} without a war`);
    addNationMod(g, P, { key: "stood_firm", label: `We stood firm over ${O.town}`, stab: 3, seasons: 6 });
    say(`The ${x.name} has given up its claim to ${O.town}. You stood firm without a war (+5 prestige, +3 stability for 6 seasons).`, "good");
  }
}
function openingTruce(g, x) {
  if (!atWar(g, PLAYER, x.id) && !hasTreaty(g, PLAYER, x.id, "truce")) addTreaty(g, "truce", x.id, PLAYER, { seasons: OPENING.truce });
}
function openingLetter(g, x, O) {
  const open = { militarist: `To the government of ${g.nations[PLAYER].name}.`, expansionist: `To the rulers of ${g.nations[PLAYER].name},`, mercantile: `To our neighbors in ${g.nations[PLAYER].name},`, agrarian: `To our neighbors in ${g.nations[PLAYER].name},` }[x.archetype] || `To the government of ${g.nations[PLAYER].name},`;
  return `${open}\n\n${O.town} was built by our people and has always been ours. Your new state has no right to it. Hand ${O.town} over to us, and there will be peace between our nations. Refuse, and our army will take back what is ours.\n\n${leaderName(x) || `The ${x.name}`}\n\n(You can also answer with your own offer: money each season, or a pact not to attack each other. Write to them in Letters, or ask your foreign minister.)`;
}
/* What the player is up against: the numbers for the Goals box and the advisers. */
function openingOdds(w, g) {
  const O = g.opening;
  if (!O) return null;
  const x = g.nations[O.by];
  const mine = g.divisions.filter(d => d.owner === PLAYER).length, theirs = g.divisions.filter(d => d.owner === O.by).length;
  const ratio = armyPower(g, O.by) / Math.max(1, armyPower(g, PLAYER) * defenseMult(g.nations[PLAYER]));
  const wa = warAssessment(w, g, O.by, PLAYER);
  return { mine, theirs, ratio, value: wa ? wa.value : null, allies: alliesOf(g, PLAYER).filter(a => sharesBorder(g, a, O.by)).map(a => g.nations[a].name), x };
}

