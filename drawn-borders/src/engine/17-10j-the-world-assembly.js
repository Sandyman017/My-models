/* =====================================================================
   10j. The World Assembly: one hall where every nation can speak to all the others
   A topic is opened by one nation. The season after, every nation answers (and votes, on a motion).
   The season after that, the main parties answer back and the motion is decided.
   Code decides every vote and every effect; Claude only writes the speeches.
   ===================================================================== */
const ASSEMBLY = { maxOpen: 4, aiCooldown: 8, playerCooldown: 2, aidShare: 0.005, sanctionSeasons: 12, peaceSeasons: 8, defyAfter: 4, playerPostsPerSeason: 2 };
const MOTIONS = {
  statement: { label: "Statement", vote: false, blurb: "Say something to the whole world. Every government can answer. Nothing is voted on, but who agrees with whom is remembered." },
  condemn:   { label: "Condemnation", vote: true, needsTarget: true, blurb: "Ask the world to condemn a nation. If it passes, every supporter thinks less of it, it is trusted less, and its people lose confidence (−4 stability)." },
  sanction:  { label: "Sanctions", vote: true, needsTarget: true, blurb: "Ask the world to stop trading with a nation for three years. If it passes, no nation that voted for it may buy from it or sell to it, their trade agreements with it end, and none may sign a new one. Its trade with the world beyond the map goes on." },
  peace:     { label: "Call for peace", vote: true, needsWar: true, blurb: "Ask the sides of a war to make peace. If it passes, both sides lean toward peace for two years, and whoever is still fighting a year later angers every supporter." },
  aid:       { label: "Appeal for aid", vote: true, blurb: "Ask the world for help. If it passes, every supporter sends 0.5% of its yearly output to the nation that asked." },
};
const VOTE_LABEL = { yes: "Supports", no: "Opposes", abstain: "Abstains" };

function ensureAssembly(g) {
  if (!g.assembly) g.assembly = { topics: [], nextId: 1, last: {}, sanctions: [], seen: {} };
  return g.assembly;
}
function openTopics(g) { return ensureAssembly(g).topics.filter(t => t.status === "open"); }
function sanctioned(g, a, b) {
  return ensureAssembly(g).sanctions.some(s => s.until > g.turn && ((s.target === a && s.by.includes(b)) || (s.target === b && s.by.includes(a))));
}
function warById(g, id) { return g.wars.find(x => x.id === id) || null; }
function warName(g, war) { return `${war.sideA.map(id => nameOf(g, id)).join(" and ")} against ${war.sideB.map(id => nameOf(g, id)).join(" and ")}`; }

function topicTitle(g, spec) {
  const T = spec.target !== null && spec.target !== undefined ? nameOf(g, spec.target) : "";
  const war = spec.warId ? warById(g, spec.warId) : null;
  switch (spec.kind) {
    case "condemn": return `Condemn the ${T}`;
    case "sanction": return `Sanctions on the ${T}`;
    case "peace": return war ? `Peace in the war of the ${war.sideA.map(id => nameOf(g, id)).join(" and ")} on the ${war.sideB.map(id => nameOf(g, id)).join(" and ")}` : "A call for peace";
    case "aid": return `Aid for the ${nameOf(g, spec.author)}`;
    default: return cleanText(spec.title, 80) || `A statement from the ${nameOf(g, spec.author)}`;
  }
}

function validateTopic(g, spec) {
  const A = ensureAssembly(g), M = MOTIONS[spec.kind];
  if (!M) return "Choose what kind of topic this is.";
  const author = g.nations[spec.author];
  if (!author || !author.alive) return "That nation no longer exists.";
  const cool = author.isPlayer ? ASSEMBLY.playerCooldown : ASSEMBLY.aiCooldown;
  if (A.last[spec.author] !== undefined && g.turn - A.last[spec.author] < cool) return `You opened a topic recently. You can open another in ${cool - (g.turn - A.last[spec.author])} season${cool - (g.turn - A.last[spec.author]) === 1 ? "" : "s"}.`;
  if (openTopics(g).length >= ASSEMBLY.maxOpen + (author.isPlayer ? 1 : 0)) return "The Assembly is busy. Wait for a topic to close.";
  if (M.needsTarget) {
    const t = g.nations[spec.target];
    if (!t || !t.alive) return "Choose a nation.";
    if (spec.target === spec.author) return "You cannot propose this against yourself.";
    if (openTopics(g).some(x => x.kind === spec.kind && x.target === spec.target)) return "This is already being debated.";
  }
  if (M.needsWar) {
    const war = warById(g, spec.warId);
    if (!war) return "Choose a war.";
    if (openTopics(g).some(x => x.kind === "peace" && x.warId === spec.warId)) return "Peace in this war is already being debated.";
  }
  if (spec.kind === "aid" && openTopics(g).some(x => x.kind === "aid" && x.author === spec.author)) return "Your appeal is already being heard.";
  if (spec.text !== undefined && author.isPlayer && cleanText(spec.text, 600).length < 10) return "Write a statement of at least a few words.";
  return null;
}

function openTopic(g, spec, text, pending = false) {
  const A = ensureAssembly(g);
  const t = {
    id: A.nextId++, kind: spec.kind, author: spec.author, target: MOTIONS[spec.kind].needsTarget ? spec.target : null, warId: spec.kind === "peace" ? spec.warId : null,
    title: topicTitle(g, spec), opened: g.turn, round: 0, status: "open", votes: {}, msgs: [], result: null, playerPosts: {},
  };
  if (MOTIONS[t.kind].vote) t.votes[t.author] = "yes";
  postMsg(t, { nid: t.author, turn: g.turn, kind: "open", stance: MOTIONS[t.kind].vote ? "yes" : null, text: pending ? null : text, fallback: text, pending });
  A.topics.unshift(t);
  A.last[spec.author] = g.turn;
  if (A.topics.length > 40) A.topics = A.topics.filter((x, i) => x.status === "open" || i < 40);
  return t;
}
function postMsg(t, m) { t.msgs.push({ id: t.msgs.length + 1, reasons: [], ...m }); }

/* ---------- How a government votes ---------- */
function assemblyStance(g, w, X, t) {
  const nx = g.nations[X], per = personality(nx);
  const reasons = [];
  let s = 0;
  const add = (v, why) => { s += v; if (Math.abs(v) >= 0.6) reasons.push(why); };
  const opA = opinionDetail(g, X, t.author).value;
  if (X === t.author) return { vote: "yes", reasons: ["it is our own motion"] };
  if (t.kind === "statement") {
    add(opA / 15, opA >= 0 ? `we think well of the ${nameOf(g, t.author)}` : `we distrust the ${nameOf(g, t.author)}`);
    return { vote: s > 1 ? "agree" : s < -1 ? "disagree" : "neutral", reasons };
  }
  if (t.kind === "condemn" || t.kind === "sanction") {
    const T = t.target;
    if (X === T) return { vote: "no", reasons: ["the motion is aimed at us"] };
    const opT = opinionDetail(g, X, T).value;
    add(-opT / 18, opT < 0 ? `we have no love for the ${nameOf(g, T)}` : `the ${nameOf(g, T)} is a friend`);
    add(opA / 40, `our view of the ${nameOf(g, t.author)}`);
    if (atWar(g, X, T)) add(5, `we are at war with the ${nameOf(g, T)}`);
    if (hasTreaty(g, X, T, "alliance")) add(-4, `we are allied with the ${nameOf(g, T)}`);
    // what our trade with them is really worth (10t): a need they fill weighs most; sanctions would end it
    const ex = tradeExposure(g, X, T), book = !!(g.trade && g.trade.v), sanc = t.kind === "sanction";
    if (book) {
      if (ex.buy && ex.buy.share >= EMBARGO_AI.dependShare) add(-(sanc ? 1 + 3 * ex.buy.share : 0.5 + ex.buy.share), `we buy ${pct(ex.buy.share)} of our ${goodWord(ex.buy.k)} from the ${nameOf(g, T)}`);
      if (ex.sellPct >= EMBARGO_AI.material) add(-(sanc ? clamp(1 + 50 * ex.sellPct, 1, 3) : 0.6), `the ${nameOf(g, T)} buys our ${goodWord(ex.sell.k)} (${pct1(ex.sellPct)} of our output)`);
      if (!ex.material && hasTreaty(g, X, T, "trade")) add(sanc ? -1 : -0.5, `we have a trade agreement with the ${nameOf(g, T)}`);
    } else if (hasTreaty(g, X, T, "trade")) add(sanc ? -3 : -1, `we trade with the ${nameOf(g, T)}`);
    if (hasTreaty(g, X, T, "tribute")) add(-1.5, "tribute binds us");
    const started = g.stats.warsStarted[T] || 0;
    const aggressor = g.wars.some(war => war.sideA[0] === T);
    if (aggressor) add(per.aggression < 1 ? 1.5 : 0.5, `the ${nameOf(g, T)} started a war`);
    if (started >= 2) add(0.8, "it has started wars before");
    if (hasTrait(nx, "honorable") && aggressor) add(1, "our leader despises aggression");
    if (hasTrait(nx, "greedy") && t.kind === "sanction" && (book ? ex.material : hasTreaty(g, X, T, "trade"))) add(-1.5, "sanctions would cost us money");
    // fear: a small or weak state does not provoke a strong neighbor
    const ratio = armyPower(g, T) / Math.max(1, armyPower(g, X));
    if (!atWar(g, X, T) && sharesBorder(g, X, T) && ratio > 1.5) add(-1.2 * per.caution, `we fear the ${nameOf(g, T)}'s army`);
    if (alliesOf(g, T).some(z => hasTreaty(g, X, z, "alliance"))) add(-1, "our allies are its allies");
  } else if (t.kind === "peace") {
    const war = warById(g, t.warId);
    if (!war) return { vote: "abstain", reasons: ["the war is already over"] };
    const party = war.sideA.includes(X) || war.sideB.includes(X);
    if (party) {
      const sc = sideScore(war, X);
      add(sc < -15 ? 3 : sc > 25 ? -3 : 0.5, sc < -15 ? "the war is going badly for us" : sc > 25 ? "we are winning" : "the war is costly");
      if (per.aggression > 1.2 && sc > 0) add(-1, "our generals want to finish the job");
    } else {
      add(1.2, "war is bad for trade and for everyone's safety");
      const friendA = war.sideA.reduce((m, id) => Math.max(m, opinionDetail(g, X, id).value), -100);
      const friendB = war.sideB.reduce((m, id) => Math.max(m, opinionDetail(g, X, id).value), -100);
      const winning = war.score > 25 ? "A" : war.score < -25 ? "B" : null;
      if (winning === "A" && friendA > 30) add(-2, "our friends are winning this war");
      if (winning === "B" && friendB > 30) add(-2, "our friends are winning this war");
      if (winning === "A" && friendB > 20) add(1.5, "our friends are losing this war");
      if (winning === "B" && friendA > 20) add(1.5, "our friends are losing this war");
      if (per.aggression > 1.2) add(-0.8, "we respect strength more than appeals");
    }
  } else if (t.kind === "aid") {
    if (X === t.author) return { vote: "yes", reasons: [] };
    add(opA / 15, opA >= 0 ? `we think well of the ${nameOf(g, t.author)}` : `we distrust the ${nameOf(g, t.author)}`);
    add(0.6, "helping costs little and earns goodwill");
    if (nx.treasury < 0) add(-2, "our own treasury is in debt");
    if (atWar(g, X, t.author)) add(-6, `we are at war with the ${nameOf(g, t.author)}`);
    if (hasTrait(nx, "greedy")) add(-1.2, "our leader counts every coin");
    if (hasTrait(nx, "charismatic")) add(0.5, "generosity plays well at home");
  }
  return { vote: s > 0.8 ? "yes" : s < -0.8 ? "no" : "abstain", reasons };
}

/* ---------- Words when Claude is not writing them ---------- */
function assemblyFallback(g, X, t, stance, phase) {
  const n = g.nations[X], T = t.target !== null ? nameOf(g, t.target) : "", Au = nameOf(g, t.author);
  const war = t.warId ? warById(g, t.warId) : null;
  const pickBy = arr => arr[(X * 7 + t.id * 3 + phase.length) % arr.length];
  if (phase === "open") {
    return {
      condemn: t.why === "starve" ? `The ${T} has cut off grain to a people who are already hungry. Hunger must never be a weapon between nations. We ask the world to condemn it.`
        : t.why === "bully" ? `The ${T} cuts off the trade of nation after nation to bend them to its will. We ask the world to condemn it, before every market is closed by threats.`
        : t.why === "treaty" ? `The ${T} signed a treaty with us and then broke it. If a signature means nothing, no agreement in this hall is safe. We ask the world to condemn it.`
        : t.why === "threat" ? `The ${T} gathers its army on our border and answers our questions with silence. We ask the world to condemn these threats before they become a war.`
        : `The ${T} has chosen war over law. We ask every nation in this hall to condemn it, so that no government believes it may take what it wants by force.`,
      sanction: `The ${T} has shown it cannot be trusted. We propose that no nation trade with it until it changes course. Words alone have not stopped it.`,
      peace: `The war of ${war ? warName(g, war) : "our neighbors"} has cost enough lives. We call on both sides to stop and on this Assembly to stand with us.`,
      aid: `Our people are in hardship. We ask our neighbors for help in this hour, and we will remember who answered.`,
      statement: `The government of the ${n.name} wishes to address all nations. We seek peace, fair trade and respect for borders, and we hope others will say the same.`,
    }[t.kind];
  }
  if (phase === "result") return "";
  if (t.kind === "statement") {
    return pickBy({
      agree: [`The ${n.name} welcomes these words from the ${Au}.`, `We stand with the ${Au} on this.`, `Well said. The ${n.name} agrees.`],
      disagree: [`The ${n.name} has heard fine words from the ${Au} before. We will judge them by their deeds.`, `We do not share this view.`],
      neutral: [`The ${n.name} takes note.`, `We have listened and will consider what was said.`],
    }[stance] || [`The ${n.name} takes note.`]);
  }
  if (phase === "rebuttal") return `The ${n.name} rejects this motion. It is built on half-truths, and those who vote for it will be remembered.`;
  if (phase === "closing") return `We thank those who stood with us. The record of this hall will show who did and who did not.`;
  const lines = {
    yes: { condemn: [`The ${n.name} supports this condemnation.`, `What the ${T} has done cannot go unanswered. We vote yes.`], sanction: [`We will close our markets to the ${T}.`, `The ${n.name} supports sanctions.`], peace: [`The ${n.name} supports peace. Enough blood has been spilled.`, `Let the guns fall silent. We vote yes.`], aid: [`The ${n.name} will help the ${Au}.`, `We will send what we can.`] },
    no: { condemn: [`The ${n.name} will not join this condemnation.`, `This motion serves the ${Au}, not justice. We vote no.`], sanction: [`Sanctions would hurt ordinary people. We vote no.`, `The ${n.name} will not cut its trade over this.`], peace: [`This war will end when its causes are settled, not before. We vote no.`, `The ${n.name} opposes this call.`], aid: [`The ${n.name} cannot support this appeal.`, `Each nation must manage its own house. We vote no.`] },
    abstain: { condemn: [`The ${n.name} abstains.`], sanction: [`The ${n.name} abstains.`], peace: [`The ${n.name} abstains.`], aid: [`The ${n.name} abstains.`] },
  };
  return pickBy((lines[stance] || lines.abstain)[t.kind] || [`The ${n.name} abstains.`]);
}

/* ---------- One season in the hall ---------- */
function runAssembly(w, g, rng, dispatch) {
  const A = ensureAssembly(g);
  const news = [];
  for (const t of openTopics(g)) {
    if (!g.nations[t.author].alive) { closeTopic(g, t, "closed", "The nation that opened this topic no longer exists."); continue; }
    t.round++;
    if (t.round === 1) assemblyReplies(g, w, t, rng);
    else if (t.round >= 2) {
      assemblyFollowups(g, w, t, rng);
      const res = resolveTopic(g, w, t);
      if (res) news.push({ topicId: t.id, text: res.text, tone: res.tone });
    }
  }
  // a call for peace that was ignored
  for (const war of g.wars) {
    if (war.assemblyDefyAt === g.turn) {
      const winners = war.score >= 0 ? war.sideA : war.sideB;
      for (const s of war.assemblyBy || []) for (const x of winners) if (s !== x && g.nations[s].alive) addMod(g, s, x, "defied_assembly", "Defied the Assembly's call for peace", -8, 0.5, -16);
      const text = `The ${winners.map(id => nameOf(g, id)).join(" and ")} ignored the Assembly's call for peace and fought on.`;
      news.push({ topicId: null, text, tone: "bad" });
      addChronicle(g, text, "bad", winners[0]);
    }
  }
  A.sanctions = A.sanctions.filter(s => s.until > g.turn && g.nations[s.target].alive);
  const t = aiOpenTopic(g, w, rng);
  if (t) news.push({ topicId: t.id, text: `The ${nameOf(g, t.author)} opened a topic in the Assembly: “${t.title}”.`, tone: "neutral", fresh: true });
  dispatch.assembly = news;
  return news;
}

function assemblyReplies(g, w, t, rng) {
  for (const n of liveNations(g)) {
    if (n.id === t.author || n.isPlayer) continue;
    const st = assemblyStance(g, w, n.id, t);
    if (MOTIONS[t.kind].vote) t.votes[n.id] = st.vote;
    // great powers always speak; small states speak when they take a side, or now and then
    const speaks = !n.minor || st.vote === "yes" || st.vote === "no" || st.vote === "agree" || st.vote === "disagree" || rng() < 0.35;
    if (!speaks) continue;
    postMsg(t, { nid: n.id, turn: g.turn, kind: "reply", stance: st.vote, reasons: st.reasons, text: null, fallback: assemblyFallback(g, n.id, t, st.vote, "reply"), pending: true });
  }
}

function assemblyFollowups(g, w, t, rng) {
  const tally = voteTally(g, t);
  const target = t.target !== null ? g.nations[t.target] : null;
  if (target && target.alive && !target.isPlayer && MOTIONS[t.kind].vote && tally.yes.length >= tally.no.length)
    postMsg(t, { nid: target.id, turn: g.turn, kind: "followup", stance: "no", reasons: ["the motion is aimed at us"], text: null, fallback: assemblyFallback(g, target.id, t, "no", "rebuttal"), pending: true });
  // someone answers the player if the player spoke in this topic
  const playerSpoke = t.msgs.some(m => m.nid === PLAYER && m.kind !== "open" && m.turn >= g.turn - 1);
  if (playerSpoke) {
    const cands = liveNations(g).filter(n => !n.isPlayer && n.id !== t.author && n.id !== t.target);
    const strong = cands.map(n => ({ n, op: opinionDetail(g, n.id, PLAYER).value })).sort((a, b) => Math.abs(b.op) - Math.abs(a.op))[0];
    if (strong) postMsg(t, { nid: strong.n.id, turn: g.turn, kind: "followup", stance: strong.op > 5 ? "agree" : strong.op < -5 ? "disagree" : "neutral", reasons: [`answering the ${nameOf(g, PLAYER)}`], replyTo: PLAYER, text: null, fallback: strong.op >= 0 ? `The ${strong.n.name} has heard the ${nameOf(g, PLAYER)} and finds sense in it.` : `The ${strong.n.name} has heard the ${nameOf(g, PLAYER)}. We are not persuaded.`, pending: true });
  }
  const author = g.nations[t.author];
  if (!author.isPlayer && author.alive && (t.msgs.filter(m => m.kind === "reply").length >= 3 || playerSpoke))
    postMsg(t, { nid: author.id, turn: g.turn, kind: "followup", stance: MOTIONS[t.kind].vote ? "yes" : "agree", reasons: ["closing the debate"], text: null, fallback: assemblyFallback(g, author.id, t, "yes", "closing"), pending: true });
}

function voteTally(g, t) {
  const out = { yes: [], no: [], abstain: [] };
  for (const n of liveNations(g)) out[t.votes[n.id] || "abstain"].push(n.id);
  return out;
}

function closeTopic(g, t, status, text) {
  t.status = status;
  t.closed = g.turn;
  if (text) postMsg(t, { nid: -1, turn: g.turn, kind: "result", text, fallback: text });
}

function resolveTopic(g, w, t) {
  if (!MOTIONS[t.kind].vote) {
    // a statement: those who agreed or disagreed are remembered
    for (const m of t.msgs) {
      if (m.nid < 0 || m.nid === t.author) continue;
      if (m.stance === "agree") addMod(g, t.author, m.nid, "assembly_agree", "Spoke up for us in the Assembly", 3, 0.25, 6);
      if (m.stance === "disagree") addMod(g, t.author, m.nid, "assembly_disagree", "Spoke against us in the Assembly", -3, 0.25, -6);
    }
    closeTopic(g, t, "closed", "The debate is closed.");
    return null;
  }
  const tally = voteTally(g, t);
  const passed = tally.yes.length > tally.no.length && tally.yes.length >= 2;
  const counts = `${tally.yes.length} for, ${tally.no.length} against, ${tally.abstain.length} abstaining`;
  const AuN = nameOf(g, t.author);
  // votes are remembered whatever the result
  for (const y of tally.yes) if (y !== t.author) addMod(g, t.author, y, "assembly_backed", "Backed our motion in the Assembly", 4, 0.25, 10);
  for (const x of tally.no) if (x !== t.author) addMod(g, t.author, x, "assembly_opposed", "Opposed our motion in the Assembly", -3, 0.25, -8);
  if (t.target !== null) {
    for (const y of tally.yes) addMod(g, t.target, y, "assembly_against", "Voted against us in the Assembly", -6, 0.25, -15);
    for (const x of tally.no) if (x !== t.target) addMod(g, t.target, x, "assembly_defended", "Defended us in the Assembly", 4, 0.25, 10);
  }
  let text, tone = passed ? "good" : "neutral";
  if (!passed) {
    text = `The motion “${t.title}” failed (${counts}).`;
  } else if (t.kind === "condemn") {
    const T = g.nations[t.target];
    for (const y of tally.yes) if (y !== t.target) { addMod(g, y, t.target, "condemned", "Condemned by the Assembly", -10, 0.5, -20); rel(g, y, t.target).trust = Math.max(0, rel(g, y, t.target).trust - 4); }
    T.stability = Math.max(1, T.stability - 4);
    text = `The Assembly condemned the ${T.name} (${counts}).`;
    tone = t.target === PLAYER ? "bad" : "good";
  } else if (t.kind === "sanction") {
    const T = g.nations[t.target];
    const by = tally.yes.filter(y => y !== t.target);
    let cut = 0;
    for (const y of by) for (const tr of g.treaties.filter(x => x.type === "trade" && ((x.a === y && x.b === T.id) || (x.b === y && x.a === T.id)))) { g.treaties = g.treaties.filter(x => x !== tr); cut++; }
    for (const y of by) addMod(g, T.id, y, "sanctioned_us", "Placed sanctions on us", -10, 0.5, -20);
    ensureAssembly(g).sanctions.push({ target: T.id, by, until: g.turn + ASSEMBLY.sanctionSeasons, topicId: t.id });
    bumpWorld(g);
    text = `The Assembly placed sanctions on the ${T.name} for three years (${counts}).${cut ? ` ${cut} trade agreement${cut > 1 ? "s were" : " was"} ended.` : ""}`;
    tone = t.target === PLAYER ? "bad" : "good";
  } else if (t.kind === "peace") {
    const war = warById(g, t.warId);
    if (!war) { text = `The war ended before the vote. The motion lapsed.`; tone = "neutral"; }
    else {
      war.assemblyCall = g.turn + ASSEMBLY.peaceSeasons;
      war.assemblyDefyAt = g.turn + ASSEMBLY.defyAfter;
      war.assemblyBy = tally.yes.filter(y => !war.sideA.includes(y) && !war.sideB.includes(y));
      text = `The Assembly called for peace in the war of ${warName(g, war)} (${counts}).`;
    }
  } else if (t.kind === "aid") {
    const to = g.nations[t.author];
    let total = 0;
    const donors = [];
    for (const y of tally.yes) {
      if (y === t.author) continue;
      const d = g.nations[y];
      const amount = Math.round(computeEconomy(w, g, y).gdp * ASSEMBLY.aidShare * 10) / 10;
      if (amount <= 0) continue;
      d.treasury -= amount; to.treasury += amount; total += amount;
      donors.push(`${d.name} ${fmtMoney(amount)}`);
      addMod(g, t.author, y, "sent_aid", "Sent us aid when we needed it", 10, 0.25, 20);
    }
    text = total > 0 ? `The Assembly agreed to help the ${to.name}: ${fmtMoney(total)} in aid (${donors.join(", ")}). Vote: ${counts}.` : `The Assembly agreed to help the ${to.name}, but nobody could pay.`;
    if (t.author === PLAYER) tone = "good";
  }
  closeTopic(g, t, passed ? "passed" : "failed", text);
  t.result = { passed, yes: tally.yes, no: tally.no, abstain: tally.abstain };
  if (passed) addPrestige(g, t.author, 5, "diplomacy", `The Assembly passed our motion: ${t.title}`);
  addChronicle(g, text, tone === "bad" ? "bad" : "neutral", t.author);
  for (const n of liveNations(g)) if (!n.isPlayer && (n.id === t.author || n.id === t.target)) remember(g, n.id, text);
  return { text, tone };
}

/* ---------- When a government decides to bring something to the hall ---------- */
function aiOpenTopic(g, w, rng) {
  const A = ensureAssembly(g);
  if (openTopics(g).length >= ASSEMBLY.maxOpen) return null;
  const cands = [];
  const ready = id => !g.nations[id].isPlayer && g.nations[id].alive && (A.last[id] === undefined || g.turn - A.last[id] >= ASSEMBLY.aiCooldown);
  const recent = (kind, pred) => A.topics.some(t => t.kind === kind && pred(t) && g.turn - t.opened < 12);
  for (const war of g.wars) {
    const att = war.sideA[0], def = war.sideB[0];
    // the attacked side asks the world to condemn its attacker
    if (g.turn - war.since <= 2 && ready(def) && !recent("condemn", t => t.target === att)) cands.push({ score: 3, spec: { kind: "condemn", author: def, target: att, why: "attacked" } });
    // a long war: the losing side, or a worried neutral, calls for peace
    if (g.turn - war.since >= 6 && !(war.assemblyCall > g.turn) && !recent("peace", t => t.warId === war.id)) {
      const losing = war.score > 25 ? def : war.score < -25 ? att : null;
      if (losing !== null && ready(losing)) cands.push({ score: 2.5, spec: { kind: "peace", author: losing, warId: war.id } });
      for (const n of liveNations(g)) if (ready(n.id) && !war.sideA.includes(n.id) && !war.sideB.includes(n.id) && (n.minor || n.archetype === "mercantile")) cands.push({ score: 1.5, spec: { kind: "peace", author: n.id, warId: war.id } });
    }
  }
  for (const n of liveNations(g)) {
    if (!ready(n.id)) continue;
    const econ = computeEconomy(w, g, n.id);
    // hardship: famine, collapse, crushing debt
    if ((econ.famineShare > 0.06 || n.stability < 28 || n.treasury < -0.8 * econ.gdp) && !recent("aid", t => t.author === n.id)) cands.push({ score: 2, spec: { kind: "aid", author: n.id } });
    // a serial aggressor: sanctions from those who fear or hate it
    for (const z of liveNations(g)) {
      if (z.id === n.id) continue;
      const binds = g.trade && g.trade.v ? tradeExposure(g, n.id, z.id).material : hasTreaty(g, n.id, z.id, "trade");   // we would not sanction our own trade
      if ((g.stats.warsStarted[z.id] || 0) >= 2 && opinionDetail(g, n.id, z.id).value < -30 && !binds && !recent("sanction", t => t.target === z.id))
        cands.push({ score: 1.2, spec: { kind: "sanction", author: n.id, target: z.id } });
    }
    for (const z of liveNations(g)) {
      if (z.id === n.id) continue;
      // a broken treaty is brought before the world
      const broke = rel(g, n.id, z.id).mods.find(m => m.key === "broke_treaty" && m.value < -30);
      if (broke && !recent("condemn", t => t.target === z.id)) cands.push({ score: 2.5, spec: { kind: "condemn", author: n.id, target: z.id, why: "treaty" } });
      // a frightened government warns the world about a hostile neighbor's army
      if (threatFrom(w, g, n.id, z.id) >= 0.9 && opinionDetail(g, n.id, z.id).value < -25 && !atWar(g, n.id, z.id) && (hasTrait(n, "paranoid") || personality(n).caution >= 1.2) && !recent("condemn", t => t.target === z.id))
        cands.push({ score: 1.3, spec: { kind: "condemn", author: n.id, target: z.id, why: "threat" } });
    }
    // a new great-power leader introduces the government
    if (!n.minor && n.leader && n.leader.since === g.turn && g.turn > 0 && rng() < 0.6) cands.push({ score: 1, spec: { kind: "statement", author: n.id, title: `A new government in the ${n.name}` } });
  }
  // grain cut off from the hungry, or a nation that bullies its trading partners (10t)
  cands.push(...tradeTopicCandidates(w, g, ready, recent));
  const valid = cands.filter(c => !validateTopic(g, c.spec)).sort((a, b) => b.score - a.score);
  if (!valid.length || rng() > 0.75) return null;
  const c = valid[0];
  const t = openTopic(g, c.spec, assemblyFallback(g, c.spec.author, { ...c.spec, id: A.nextId, target: c.spec.target ?? null, warId: c.spec.warId ?? null }, "yes", "open"), true);
  t.why = c.spec.why || null;
  t.msgs[0].reasons = [{ attacked: `the ${nameOf(g, t.target)} attacked us`, treaty: `the ${nameOf(g, t.target)} broke its treaty with us`, threat: `the ${nameOf(g, t.target)}'s army on our border frightens us`, starve: `the ${nameOf(g, t.target)} cut off grain while people go hungry`, bully: `the ${nameOf(g, t.target)} bullies its trading partners` }[c.spec.why] || { peace: "the war must end", aid: "our people are suffering", sanction: "it keeps starting wars", statement: "a new leader takes office and introduces the government" }[t.kind] || "our interests"];
  return t;
}

/* The player opens a topic or speaks. Player text is in-world words: it never changes how anyone votes. */
function playerOpenTopic(g, spec, text) {
  const s = { ...spec, author: PLAYER, text };
  const err = validateTopic(g, s);
  if (err) return { ok: false, reason: err };
  const t = openTopic(g, s, cleanText(text, 600));
  t.msgs[0].text = cleanText(text, 600);
  return { ok: true, topic: t };
}
function playerPost(g, t, text, vote) {
  if (t.status !== "open") return { ok: false, reason: "This topic is closed." };
  const clean = cleanText(text, 600);
  const used = t.playerPosts[g.turn] || 0;
  if (clean.length && used >= ASSEMBLY.playerPostsPerSeason) return { ok: false, reason: "You have spoken twice in this topic this season. Wait for the others to answer." };
  if (vote && MOTIONS[t.kind].vote && t.author !== PLAYER) t.votes[PLAYER] = vote;
  if (clean.length >= 2) {
    postMsg(t, { nid: PLAYER, turn: g.turn, kind: "player", stance: MOTIONS[t.kind].vote ? (t.votes[PLAYER] || null) : null, text: clean, fallback: clean });
    t.playerPosts[g.turn] = used + 1;
  }
  return { ok: true };
}

/* The player answers an envoy (a rival's proposal, demand, or call to arms). */
function respondToEnvoy(g, w, item, accept, ignored = false) {
  const from = item.from;
  if (!g.nations[from] || !g.nations[from].alive) { item.status = "void"; return { ok: false, reason: "That nation no longer exists." }; }
  if (item.kind === "call") {
    const war = g.wars.find(x => x.id === item.warId);
    if (accept && war) {
      joinWar(g, war, PLAYER, war.sideA.includes(from) ? "A" : "B");
      addMod(g, from, PLAYER, "honored", "Came to our aid in war", 20, 0.5, 30);
      remember(g, from, `The ${nameOf(g, PLAYER)} honored our alliance and joined the war.`);
    } else if (war) abandonAlly(g, PLAYER, from);
    item.status = accept ? "accepted" : "declined";
    return { ok: true };
  }
  if (accept) {
    const err = validateDeal(g, w, from, PLAYER, item.terms);
    if (err) { item.status = "void"; item.note = err; return { ok: false, reason: err }; }
    applyDeal(g, w, from, PLAYER, item.terms);
    if (item.threat) {
      remember(g, from, `The ${nameOf(g, PLAYER)} gave in to our demand. We promised peace in return.`);
      addTreaty(g, "truce", from, PLAYER);
    }
    item.status = "accepted";
    return { ok: true };
  }
  addMod(g, from, PLAYER, "refused", "Rejected our proposal", -3, 1, -9);
  if (ignored) addMod(g, from, PLAYER, "ignored", "Ignored our envoy", -2, 1, -6);
  if (!item.threat && item.kind && !item.kind.startsWith("peace") && !item.kind.startsWith("demand")) {
    const fn = g.nations[from];
    fn.lastAsked = { ...(fn.lastAsked || {}), [`${item.kind}:${PLAYER}`]: g.turn + 6 }; // don't pester: ask again in about three years
  }
  if (item.threat) addCommitment(g, from, PLAYER, termsText(g, item.terms));
  remember(g, from, `The ${nameOf(g, PLAYER)} ${ignored ? "ignored" : "refused"} our proposal of ${termsText(g, item.terms)}.`);
  item.status = ignored ? "ignored" : "declined";
  return { ok: true };
}

