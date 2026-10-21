/* =====================================================================
   16b. Claude connection: the rivals' minds and their letters
   ===================================================================== */
let sampleFn = null;
let deliberation = null;
const MINDS_KEY = "drawn-borders/minds";

function loadMindsSetting() { try { return localStorage.getItem(MINDS_KEY) === "rules" ? "rules" : "claude"; } catch (e) { return "claude"; } }
function saveMindsSetting(v) { try { localStorage.setItem(MINDS_KEY, v); } catch (e) { /* storage unavailable */ } }
function mindsReady() { return ui.minds === "claude" && !!sampleFn && !ui.mindsBlocked; }

function handleSampleError(e) {
  const code = e && e.code;
  if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(code)) {
    ui.mindsBlocked = true;
    ui.mindsNote = code === "not_granted" ? "You didn't allow Claude for this page, so the rivals use the built-in rules." : "Claude isn't available here, so the rivals use the built-in rules.";
  } else if (code === "rate_limited") ui.mindsNote = "Claude is busy or your usage limit was reached, so the built-in rules stood in this time.";
  else ui.mindsNote = "Claude couldn't answer this time, so the built-in rules stood in.";
}

/* Rivals decide at the start of each season, while you plan. Rules give an instant answer;
   Claude's choices replace them when they arrive. Either way the engine re-checks every choice. */
function startDeliberation() {
  if (!game || ui.phase !== "play") return;
  if (deliberation && deliberation.turn === game.turn && deliberation.gameRef === game) return;
  if (deliberation && deliberation.controller) deliberation.controller.abort();
  const g = game, w = world;
  const rivals = liveNations(g).filter(n => !n.isPlayer);
  const menus = {}, orders = {};
  for (const n of rivals) { menus[n.id] = buildMenu(g, w, n); orders[n.id] = ruleOrders(g, w, n, menus[n.id]); }
  const d = { turn: g.turn, gameRef: g, menus, orders, status: "done", source: "rules", controller: null, promise: Promise.resolve() };
  deliberation = d;
  d.minds = rivals.filter(n => !n.minor);
  if (rtClaudeOK()) claudeDeliberate(d);
}
function claudeDeliberate(d) {
  const g = d.gameRef, w = world, minds = d.minds || [], menus = d.menus;
  if (!mindsReady() || !minds.length || d.claudeTried || game !== g || g.turn !== d.turn) return;
  d.claudeTried = true;
  d.status = "thinking";
  d.controller = new AbortController();
  d.promise = sampleFn.json(seasonPrompt(g, w, minds, menus), { modelTier: "default", signal: d.controller.signal })
    .then(res => {
      const valid = validateClaudeOrders(res, menus, minds, g);
      Object.assign(d.orders, valid);
      if (Object.keys(valid).length) { d.source = "claude"; ui.mindsNote = null; }
    })
    .catch(e => { if (!e || e.code !== "cancelled") handleSampleError(e); })
    .finally(() => { d.status = "done"; if (deliberation === d && !ui.waiting) renderQuiet(); });
}

function renderQuiet() {
  if (ui.tab === "nations") renderSidebar();
  renderOverlays();
}

/* ---------- Writing to a rival ---------- */
function newComposer(to, terms = []) {
  return { to, terms: terms.map(t => ({ ...t })), text: "", threat: false, termType: "trade", dir: "us", amount: 5, seasons: 8, cityId: "", error: null };
}

function composerTermOptions(g, to) {
  const war = atWar(g, PLAYER, to);
  const opts = war ? [["peace", "Peace"]] : [["trade", "Trade agreement"], ["nap", "Non-aggression pact"], ["alliance", "Defensive alliance"], ["border", "Border accord"]];
  return opts.concat([["payment", "One-off payment"], ["tribute", "Payment each season"], ["city", "Hand over a town"]]);
}

function readComposerTerm(c) {
  const g = game;
  if (["trade", "nap", "alliance", "border", "peace"].includes(c.termType)) return { type: c.termType };
  if (c.termType === "payment" || c.termType === "tribute") {
    const amount = Math.round(Number(c.amount) * 2) / 2;
    const t = { type: c.termType, from: c.dir === "us" ? PLAYER : c.to, amount };
    if (c.termType === "tribute") t.seasons = Math.round(Number(c.seasons));
    return t;
  }
  const city = g.cities.find(x => x.id === Number(c.cityId));
  return city ? { type: "city", from: city.owner, cityId: city.id } : null;
}

function composerHtml() {
  const g = game, c = ui.compose;
  const rivals = liveNations(g).filter(n => !n.isPlayer);
  const to = g.nations[c.to];
  const sent = g.lastLetter[c.to] === g.turn;
  const termOpts = composerTermOptions(g, c.to).map(([v, l]) => `<option value="${v}" ${c.termType === v ? "selected" : ""}>${l}</option>`).join("");
  let extra = "";
  if (c.termType === "payment" || c.termType === "tribute") {
    extra = `<select id="term-dir" aria-label="Who pays"><option value="us" ${c.dir === "us" ? "selected" : ""}>We pay</option><option value="them" ${c.dir === "them" ? "selected" : ""}>They pay</option></select>
      <label class="inline">$<input type="number" id="term-amount" min="0.5" step="0.5" value="${c.amount}" aria-label="Amount in billions">B</label>
      ${c.termType === "tribute" ? `<label class="inline">for <input type="number" id="term-seasons" min="1" max="20" step="1" value="${c.seasons}" aria-label="Seasons"> seasons</label>` : ""}`;
  } else if (c.termType === "city") {
    const ours = g.cities.filter(x => x.owner === PLAYER), theirs = g.cities.filter(x => x.owner === c.to);
    extra = `<select id="term-city" aria-label="Town"><option value="">Choose a town</option>
      <optgroup label="We hand over">${ours.map(x => `<option value="${x.id}" ${String(c.cityId) === String(x.id) ? "selected" : ""}>${escapeHtml(x.name)}</option>`).join("")}</optgroup>
      <optgroup label="They hand over">${theirs.map(x => `<option value="${x.id}" ${String(c.cityId) === String(x.id) ? "selected" : ""}>${escapeHtml(x.name)}</option>`).join("")}</optgroup></select>`;
  }
  const termList = c.terms.length
    ? `<ul class="term-list">${c.terms.map((t, i) => `<li><span>${escapeHtml(termText(g, t).replace(/^./, s => s.toUpperCase()))}</span><button class="chip-x" type="button" data-action="term-remove" data-i="${i}" aria-label="Remove term">×</button></li>`).join("")}</ul>`
    : `<p class="muted small">No formal terms. A letter without terms can still ask for something; if it clearly asks for trade, a pact, an alliance, a border accord or peace, they will treat it as a proposal.</p>`;
  const err = c.terms.length ? validateDeal(g, world, PLAYER, c.to, c.terms) : null;
  const canSend = !sent && !err && (c.terms.length || c.text.trim().length >= 10);
  return `<div class="composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
    <div class="composer-head">
      <div class="block" style="gap:2px"><span class="eyebrow">Letter</span><h2 id="composer-title">To the ${escapeHtml(to.name)}</h2></div>
      <button class="btn" type="button" data-action="compose-close">Close</button>
    </div>
    <label class="muted small" for="compose-to">Recipient</label>
    <select id="compose-to">${rivals.map(n => `<option value="${n.id}" ${n.id === c.to ? "selected" : ""}>${escapeHtml(n.name)}</option>`).join("")}</select>
    <div class="block">
      <span class="eyebrow">Formal terms · binding if accepted</span>
      ${termList}
      <div class="term-row">
        <select id="term-type" aria-label="Term">${termOpts}</select>
        ${extra}
        <button class="btn" type="button" data-action="term-add">Add term</button>
      </div>
      ${c.error ? `<p class="notice">${escapeHtml(c.error)}</p>` : ""}
      ${err ? `<p class="notice">${escapeHtml(err)}</p>` : ""}
    </div>
    <div class="block">
      <label class="eyebrow" for="letter-text">Your letter</label>
      <textarea id="letter-text" maxlength="1500" rows="7" placeholder="Make your case. Real arguments about shared dangers, mutual gain or your record can move them. Flattery cannot.">${escapeHtml(c.text)}</textarea>
      <label class="check"><input type="checkbox" id="letter-threat" ${c.threat ? "checked" : ""}> Threaten war if they refuse</label>
    </div>
    <p class="muted small">Only the formal terms are binding. ${mindsReady() ? "Claude reads your letter for its arguments; the game checks every claim against what is true and decides; then Claude writes their reply in character." : "Without Claude, your words are judged only by their tone and what they ask for."} False claims cost trust. A threat is only as strong as your army, your reach and your record of carrying threats out.</p>
    ${sent ? `<p class="notice info">You have already written to the ${escapeHtml(to.name)} this season. Couriers take a season.</p>` : ""}
    <div class="actions"><button class="btn primary" type="button" data-action="send-letter" ${canSend ? "" : "disabled"}>Send letter</button></div>
  </div>`;
}

async function sendLetter() {
  const g = game, w = world, c = ui.compose;
  if (!c) return;
  const text = cleanText(c.text, 1500);
  const terms = c.terms.map(t => ({ ...t }));
  if (g.lastLetter[c.to] === g.turn) return;
  if (terms.length && validateDeal(g, w, PLAYER, c.to, terms)) return;
  const entry = { id: g.nextId++, turn: g.turn, to: c.to, text, terms, threat: c.threat, status: "reading", verdict: null, lines: [], notes: [], counter: null, counterStatus: null, reply: "", source: mindsReady() ? "claude" : "rules" };
  g.letters.unshift(entry);
  if (g.letters.length > 40) g.letters.length = 40;
  g.lastLetter[c.to] = g.turn;
  ui.compose = null;
  ui.tab = "letters";
  renderAll();

  let analysis;
  if (entry.source === "claude") {
    try { analysis = sanitizeAnalysis(await sampleFn.json(analysisPrompt(g, w, c.to, text, terms, c.threat), { modelTier: "default", cache: false }), g); }
    catch (e) { handleSampleError(e); entry.source = "rules"; analysis = analyzeLetterRules(text); }
  } else analysis = analyzeLetterRules(text);
  if (game !== g) return;

  const outcome = processLetter(g, w, c.to, text, terms, c.threat, analysis);
  Object.assign(entry, { status: "replying", verdict: outcome.verdict, lines: outcome.lines, notes: outcome.notes, counter: outcome.counter, terms: outcome.terms, inferred: outcome.inferred, summary: analysis.summary, manipulation: analysis.manipulation });
  const verb = { accept: "accepted", reject: "refused", counter: "answered with a counter-offer to", message: "received" }[outcome.verdict];
  addChronicle(g, `You wrote to the ${nameOf(g, c.to)}. They ${verb} your letter${outcome.terms.length ? ` (${termsText(g, outcome.terms)})` : ""}.`, outcome.verdict === "accept" ? "good" : outcome.verdict === "reject" ? "bad" : "neutral", PLAYER);
  bumpMap();
  renderAll();

  if (entry.source === "claude") {
    try {
      const res = await sampleFn(replyPrompt(g, w, c.to, text, outcome), {
        modelTier: "default", cache: false,
        onText: ({ text: t }) => { entry.reply = t; const el = document.getElementById(`reply-${entry.id}`); if (el) el.textContent = t; },
      });
      entry.reply = cleanText(res.text, 2400);
    } catch (e) { handleSampleError(e); entry.reply = templateReply(g, c.to, outcome); entry.source = "rules"; }
  } else entry.reply = templateReply(g, c.to, outcome);
  if (game !== g) return;
  entry.status = "done";
  saveGame();
  renderAll();
}

function envoyImpactLines(g, w, it) {
  const lines = [];
  for (const t of it.terms) {
    if (t.type === "trade") {
      const h = hypothetical(g, { treaty: { type: "trade", a: PLAYER, b: it.from } });
      const d = computeEconomy(w, h, PLAYER).gdp - computeEconomy(w, g, PLAYER).gdp;
      if (d > 0.05) lines.push(`Your output would grow ${fmtMoney(d)} a year`);
      else {
        const road = bestTradeRoad(w, h, PLAYER, it.from);
        if (road) {
          const h2 = hypothetical(h, { edges: road.newEdges });
          const d2 = computeEconomy(w, h2, PLAYER).gdp - computeEconomy(w, g, PLAYER).gdp;
          lines.push(`No border, road or ports link you yet. Accept, then build a trade road from ${road.from.name} to ${road.to.name} (about ${fmtMoney(road.cost)}): with it your output would grow ${fmtMoney(d2)} a year`);
        } else lines.push("No border, road or ports link you, and no road could reach them without crossing a third nation. A port in each country would open sea trade");
      }
    }
    if (t.type === "nap") lines.push(`Neither side may attack the other for ${TREATY_INFO.nap.seasons} seasons`);
    if (t.type === "alliance") lines.push("You must come to their aid if they are attacked, and they to yours");
    if (t.type === "border") lines.push(`Neither side may found towns within ${DIPLO.nearBorderCells} cells of the other for ${TREATY_INFO.border.seasons} seasons`);
    if (t.type === "payment") lines.push(t.from === PLAYER ? `You pay ${fmtMoney(t.amount)} now (treasury ${fmtMoney(g.nations[PLAYER].treasury)})` : `You receive ${fmtMoney(t.amount)}`);
    if (t.type === "tribute") lines.push(t.from === PLAYER ? `You pay ${fmtMoney(t.amount)} every season for ${t.seasons} seasons` : `You receive ${fmtMoney(t.amount)} a season`);
    if (t.type === "city") {
      const city = g.cities.find(x => x.id === t.cityId);
      if (city) lines.push(t.from === PLAYER ? `You lose ${city.name} and ${fmtMoney(regionValue(w, g, city).gdp)} of output a year` : `You gain ${city.name}`);
    }
    if (t.type === "peace") lines.push("The war ends; occupied land returns to its owners unless handed over");
  }
  if (it.threat) {
    const ratio = armyPower(g, it.from) / Math.max(1, armyPower(g, PLAYER));
    lines.push(`If you refuse, they threaten war. Their army is ${ratio.toFixed(1)}× yours.`);
  }
  return lines;
}

function envoyCardHtml(it) {
  const g = game, n = g.nations[it.from];
  const label = { call: "Call to arms", warning: "Warning", declaration: "Declaration of war", demand_tribute: "Demand", demand_city: "Demand", peace: "Peace offer", peace_demand: "Peace offer", peace_concede: "Peace offer" }[it.kind] || "Proposal";
  const status = { accepted: "You accepted", declined: "You declined", ignored: "You left it unanswered", void: "No longer possible", info: "" }[it.status] || "";
  const impact = it.status === "open" ? envoyImpactLines(g, world, it) : [];
  const actions = it.status === "open" ? `<div class="actions">
      <button class="btn primary" type="button" data-action="envoy-accept" data-id="${it.id}">${it.kind === "call" ? "Join the war" : "Accept"}</button>
      <button class="btn" type="button" data-action="envoy-decline" data-id="${it.id}">${it.kind === "call" ? "Stay out" : "Decline"}</button>
      ${it.kind !== "call" ? `<button class="btn" type="button" data-action="envoy-reply" data-id="${it.id}">Reply in writing</button>` : ""}
    </div><p class="muted small">Answer by the end of ${seasonLabel(it.expires - 1)}. Silence counts as a refusal.</p>` : "";
  return `<article class="letter in" style="--c:${n ? n.color : "var(--muted)"}">
    <header><span class="eyebrow">${label} · from the ${escapeHtml(n ? n.name : "?")} · ${seasonLabel(it.turn)}</span>${it.threat ? `<span class="tag tone-bad">War if refused</span>` : ""}</header>
    <p class="letter-text">${escapeHtml(it.text || "")}</p>
    ${it.terms.length ? `<p class="small"><strong>Terms:</strong> ${escapeHtml(termsText(g, it.terms))}.</p>` : ""}
    ${impact.length ? `<ul class="factors">${impact.map(l => `<li><span>${escapeHtml(l)}</span></li>`).join("")}</ul>` : ""}
    ${status ? `<p class="small muted">${status}${it.note ? `: ${escapeHtml(it.note)}` : ""}.</p>` : ""}
    ${actions}
  </article>`;
}

function letterEntryHtml(L) {
  const g = game, n = g.nations[L.to];
  const verdictTag = { accept: ["Accepted", "good"], reject: ["Refused", "bad"], counter: ["Counter-offer", "warn"], message: ["Answered", "neutral"] }[L.verdict];
  const waiting = L.status === "reading" ? `A courier is riding to the ${escapeHtml(n.name)}${L.source === "claude" ? ". Their court is reading your letter…" : "…"}` : "";
  const weigh = L.lines.length ? `<details><summary>How they weighed it</summary><ul class="factors">${L.lines.slice().sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts)).map(l => `<li><span>${escapeHtml(l.label)}</span><span class="num tone-${toneOf(l.pts, 0.4)}">${l.pts > 0 ? "+" : ""}${l.pts}</span></li>`).join("")}</ul>
      ${L.notes.length ? `<p class="eyebrow" style="margin-top:8px">Your arguments</p><ul class="factors">${L.notes.map(x => `<li><span>${escapeHtml(x.label)}</span><span class="small muted">${escapeHtml(x.verdict)}</span></li>`).join("")}</ul>` : ""}
      <p class="muted small">Weights are in points; one point is about 1% of their yearly output. They accept at zero or above.</p></details>` : "";
  const counter = L.verdict === "counter" && L.counter ? `<div class="counter"><p class="small"><strong>Their counter-offer:</strong> ${escapeHtml(termsText(g, L.counter.terms))}.</p>
      ${L.counterStatus ? `<p class="small muted">${escapeHtml(L.counterStatus)}</p>` : `<div class="actions"><button class="btn primary" type="button" data-action="accept-counter" data-id="${L.id}">Accept counter-offer</button></div>`}</div>` : "";
  return `<article class="letter out" style="--c:${n ? n.color : "var(--muted)"}">
    <header><span class="eyebrow">You wrote to the ${escapeHtml(n ? n.name : "?")} · ${seasonLabel(L.turn)}</span>${L.threat ? `<span class="tag tone-bad">Threat of war</span>` : ""}</header>
    ${L.text ? `<p class="letter-text mine">${escapeHtml(L.text)}</p>` : ""}
    ${L.terms.length ? `<p class="small"><strong>${L.inferred ? "They read it as a proposal of" : "Terms"}:</strong> ${escapeHtml(termsText(g, L.terms))}.</p>` : ""}
    ${waiting ? `<p class="small muted courier">${waiting}</p>` : ""}
    ${L.status !== "reading" ? `<div class="reply">
      <header><span class="eyebrow">Reply</span>${verdictTag ? `<span class="tag tone-${verdictTag[1]}">${verdictTag[0]}</span>` : ""}${L.source === "claude" ? `<span class="tag tone-neutral">Written by Claude</span>` : ""}</header>
      <p class="letter-text" id="reply-${L.id}">${escapeHtml(L.reply || (L.status === "replying" ? "Their reply is being written…" : ""))}</p>
      ${counter}${weigh}
    </div>` : ""}
  </article>`;
}

function lettersTabHtml() {
  const g = game;
  const open = g.inbox.filter(it => it.status === "open");
  const closedIn = g.inbox.filter(it => it.status !== "open").map(it => ({ kind: "in", id: it.id, item: it }));
  const out = g.letters.map(L => ({ kind: "out", id: L.id, item: L }));
  const timeline = [...closedIn, ...out].sort((a, b) => b.id - a.id).slice(0, 30);
  return `<div class="actions"><button class="btn primary" type="button" data-action="compose">Write a letter</button></div>
    ${open.length ? `<div class="block"><span class="eyebrow">Awaiting your answer</span>${open.map(envoyCardHtml).join("")}</div>` : ""}
    <div class="block"><span class="eyebrow">Correspondence</span>
      ${timeline.length ? timeline.map(e => (e.kind === "in" ? envoyCardHtml(e.item) : letterEntryHtml(e.item))).join("") : `<p class="muted small">No letters yet. Rivals write when they want something from you, and you can write to them at any time, once a season each.</p>`}
    </div>`;
}

/* ---------- Nations tab ---------- */
function mindsBlockHtml() {
  const avail = !!sampleFn && !ui.mindsBlocked;
  const d = deliberation && deliberation.gameRef === game && deliberation.turn === game.turn ? deliberation : null;
  const status = !avail ? (ui.mindsNote || "Claude isn't available on this page, so the rivals use the built-in rules.")
    : ui.minds !== "claude" ? "The rivals use the built-in rules. Their decisions are instant."
    : d && d.status === "thinking" ? "Claude is weighing the rivals' options for this season…"
    : ui.mindsNote || (d && d.source === "claude" ? "Claude has chosen the rivals' moves for this season." : "Claude decides for the rivals each season and writes their letters.");
  return `<div class="block">
    <div class="law-head"><strong>Rival minds</strong></div>
    <div class="seg seg-2">
      <button type="button" data-action="minds" data-value="claude" class="${ui.minds === "claude" && avail ? "on" : ""}" ${avail ? "" : "disabled"}>Claude<small>thinks and writes</small></button>
      <button type="button" data-action="minds" data-value="rules" class="${ui.minds !== "claude" || !avail ? "on" : ""}">Built-in rules<small>instant</small></button>
    </div>
    <p class="small ${d && d.status === "thinking" ? "tone-warn" : "muted"}">${escapeHtml(status)}</p>
    <p class="muted small">Either way, the game decides what is legal and what every choice costs. Claude chooses among those options in each nation's character and explains why. Claude runs on your own Claude usage.</p>
  </div>`;
}

function warConfirmHtml(n) {
  const g = game, w = world;
  const cb = casusBelli(g, PLAYER, n.id);
  const broken = treatiesBetween(g, PLAYER, n.id).filter(t => ["nap", "alliance", "border", "truce"].includes(t.type));
  const allies = alliesOf(g, n.id).filter(a => a !== PLAYER);
  const ratio = armyPower(g, PLAYER) / Math.max(1, armyPower(g, n.id) * defenseMult(n));
  const lines = [
    `Your cause: ${cb.label}${cb.strength === 0 ? ". Other nations will see this as unprovoked aggression." : cb.strength === 1 ? ". Other nations will see it as thin." : ". Others will accept it as just."}`,
    `Your army against theirs, counting their defenses: ${ratio.toFixed(2)}×.`,
  ];
  if (broken.length) lines.push(`This breaks your ${broken.map(t => TREATY_INFO[t.type].label.toLowerCase()).join(" and ")}. Every nation will trust you less.`);
  if (allies.length) lines.push(`Their allies may join them: ${allies.map(a => `the ${nameOf(g, a)}`).join(", ")}.`);
  if (!sharesBorder(g, PLAYER, n.id)) {
    const ours = navyPower(g, PLAYER), theirs = navyPower(g, n.id);
    lines.push(`You share no border: this war is fought at sea and by landings. Your warships against theirs: ${theirs > 0 ? `${(ours / theirs).toFixed(2)}×` : ours > 0 ? "they have none" : "neither of you has any"}. Your freighters: ${(g.nations[PLAYER].freighters || 0)}.`);
  }
  lines.push("War weariness will cost stability every season it lasts.");
  void w;
  return `<div class="confirm"><h3>Declare war on the ${escapeHtml(n.name)}?</h3>
    <ul class="factors">${lines.map(l => `<li><span>${escapeHtml(l)}</span></li>`).join("")}</ul>
    <div class="actions"><button class="btn danger" type="button" data-action="declare-war" data-nid="${n.id}">Declare war</button><button class="btn" type="button" data-action="declare-war-cancel">Cancel</button></div></div>`;
}

function rivalCardHtml(n) {
  const g = game, w = world;
  const econ = economies()[n.id];
  const a = ARCHETYPES[n.archetype];
  const op = opinionDetail(g, n.id, PLAYER);
  const r = rel(g, n.id, PLAYER);
  const d = gap(w, g, PLAYER, n.id);
  const ratio = armyPower(g, n.id) / Math.max(1, armyPower(g, PLAYER));
  const war = warBetween(g, n.id, PLAYER);
  const treaties = treatiesBetween(g, n.id, PLAYER);
  const reasons = op.items.slice().sort((x, y) => Math.abs(y.value) - Math.abs(x.value))
    .map(i => `<li><span>${escapeHtml(i.label)}</span><span class="num tone-${toneOf(i.value)}">${signed(i.value)}</span></li>`).join("") || `<li><span class="muted">No strong feelings yet.</span></li>`;
  const cred = r.cred > 0.6 ? "taken seriously" : r.cred > 0.35 ? "half-believed" : "no longer believed";
  const others = liveNations(g).filter(z => !z.isPlayer && z.id !== n.id).map(z => {
    const wz = atWar(g, n.id, z.id);
    const tr = treatiesBetween(g, n.id, z.id).map(t => TREATY_INFO[t.type].label.toLowerCase());
    return `<li><span>The ${escapeHtml(z.name)}</span><span class="${wz ? "tone-bad" : "muted"}">${wz ? "at war" : opinionLabel(opinionDetail(g, n.id, z.id).value) + (tr.length ? ` · ${tr.join(", ")}` : "")}</span></li>`;
  }).join("");
  const chips = treaties.length ? treaties.map(t => `<span class="chip tone-neutral">${TREATY_INFO[t.type].label}${t.type === "tribute" ? ` · ${t.a === PLAYER ? "you pay" : "they pay"} ${fmtMoney(t.amount)}` : ""}${t.until ? ` · to ${seasonLabel(t.until)}` : ""}${t.type === "truce" || (t.type === "tribute" && t.a !== PLAYER) ? "" : ` <button class="chip-x" type="button" data-action="cancel-treaty" data-id="${t.id}" aria-label="Cancel ${TREATY_INFO[t.type].label}">×</button>`}</span>`).join("") : `<span class="muted small">No treaties with you.</span>`;
  const cancelAsk = ui.confirmCancel && treaties.some(t => t.id === ui.confirmCancel) ? (() => {
    const t = treaties.find(x => x.id === ui.confirmCancel);
    const breaking = BINDING.includes(t.type);
    return `<div class="confirm"><p>${breaking ? `Cancelling the ${TREATY_INFO[t.type].label.toLowerCase()} before it ends breaks your word. The ${escapeHtml(n.name)} will be furious, and every nation will trust you less.` : `Ending trade will hurt both economies and annoy the ${escapeHtml(n.name)}, but it breaks no promise.`}</p>
      <div class="actions"><button class="btn danger" type="button" data-action="cancel-treaty-confirm" data-id="${t.id}">Cancel it</button><button class="btn" type="button" data-action="cancel-treaty-abort">Keep it</button></div></div>`;
  })() : "";
  const score = war ? sideScore(war, PLAYER) : 0;
  const warHtml = war ? `<div class="warbox"><strong>At war since ${seasonLabel(war.since)}</strong>
      <div class="meter dual"><span style="left:50%;width:0"></span><i style="left:calc(${50 + score / 2}% - 1px)"></i></div>
      <span class="small">${score > 0 ? `You are ahead (${signed(score)})` : score < 0 ? `They are ahead (${signed(-score)})` : "Neither side is ahead yet"} · cause given: ${escapeHtml(war.cb)}</span></div>` : "";
  const feed = n.feed.slice(0, 5).map(f => `<li><span class="when">${seasonLabel(f.turn)}${f.source === "claude" ? " · Claude" : ""}</span><span>${escapeHtml(f.text)}</span>${f.why ? `<span class="muted small">${escapeHtml(f.why)}</span>` : ""}</li>`).join("");
  return `<div class="rival" style="--c:${n.color}">
    <div class="block" style="gap:6px">
      <span class="tag" style="color:${n.color}">${n.minor ? `City-state · ${a.label}` : a.label}</span>
      <h3>${escapeHtml(n.name)}</h3>
      <p class="muted small">${n.minor ? "A small city-state. It cannot win a war alone, so it lives by trade and by finding protectors. " : ""}${a.blurb}</p>
      ${n.leader ? `<div class="leader"><strong>${escapeHtml(leaderName(n))}</strong><span class="muted small">age ${Math.floor(n.leader.age)} · in power since ${seasonLabel(n.leader.since)}</span>
        <div class="chips">${n.leader.traits.map(t => `<span class="chip tone-neutral" title="${escapeHtml(LEADER_TRAITS[t].note)}">${LEADER_TRAITS[t].label}</span>`).join("")}</div>
        <span class="muted small">${n.leader.traits.map(t => LEADER_TRAITS[t].note).join("; ").replace(/^./, c => c.toUpperCase())}.</span></div>` : ""}
      ${n.plan ? `<p class="small"><span class="muted">Stated aims:</span> ${escapeHtml(n.plan)}</p>` : ""}
    </div>
    ${warHtml}
    ${intelHtml(n)}
    <div class="block" style="gap:6px">
      <div class="law-head"><strong>Their view of you: ${opinionLabel(op.value)}</strong><span class="num">${signed(op.value)}</span></div>
      <div class="meter dual"><span style="left:${op.value >= 0 ? 50 : 50 + op.value / 2}%;width:${Math.abs(op.value) / 2}%;background:${op.value >= 0 ? "var(--good)" : "var(--bad)"}"></span></div>
      <details><summary>Why they feel this way</summary><ul class="factors">${reasons}</ul></details>
    </div>
    <div class="mini-stats">
      <div><span>Trust in you</span><span class="num">${Math.round(r.trust)}/100</span></div>
      <div><span>Your threats</span><span>${cred}</span></div>
      <div><span>Their army</span><span class="num">${ratio.toFixed(1)}× yours</span></div>
      <div><span>Divisions</span><span class="num">${forcesText(g, n.id)}</span></div>
      <div><span>Aircraft</span><span class="num">${fmtCount(g.airwings.filter(x => x.owner === n.id).reduce((s, x) => s + x.planes, 0))}</span></div>
      <div><span>Navy</span><span class="num">${(() => { const c = navyCounts(g, n.id); return `${c.cruiser + c.destroyer} warships · ${c.freighter} freighters`; })()}</span></div>
      <div><span>Border</span><span>${d === 0 ? "shared" : d >= 99 ? "none" : `${d} cells apart`}${d !== 0 && seaContact(w, g, PLAYER, n.id) ? " · by sea" : ""}</span></div>
      <div><span>Output</span><span class="num">${fmtMoney(econ.gdp)}</span></div>
      <div><span>Towns</span><span class="num">${econ.cities.length}</span></div>
    </div>
    <div class="block" style="gap:6px"><span class="eyebrow">Treaties with you</span><div class="chips">${chips}</div>${cancelAsk}</div>
    ${rivalCabinetHtml(n)}
    ${rivalGroupsHtml(n)}
    ${rivalPeopleHtml(n)}
    ${others ? `<div class="block" style="gap:4px"><span class="eyebrow">Their relations</span><ul class="factors">${others}</ul></div>` : ""}
    <div class="block" style="gap:6px"><span class="eyebrow">Recent decisions</span>
      ${feed ? `<ul class="feed">${feed}</ul>` : `<p class="muted small">Nothing yet. Rivals act at the end of each season.</p>`}</div>
    <div class="actions">
      <button class="btn primary" type="button" data-action="compose" data-nid="${n.id}">Write a letter</button>
      ${!war && (sharesBorder(g, PLAYER, n.id) || seaContact(world, g, PLAYER, n.id)) ? `<button class="btn danger" type="button" data-action="declare-war-ask" data-nid="${n.id}">Declare war…</button>` : ""}
    </div>
    ${ui.confirmWar === n.id ? warConfirmHtml(n) : ""}
  </div>`;
}

function forcesText(g, nid) {
  const c = { inf: 0, art: 0, arm: 0 };
  g.divisions.forEach(d => { if (d.owner === nid) c[d.type]++; });
  return `${c.inf + c.art + c.arm}${c.arm ? ` (${c.arm} armored)` : ""}`;
}

function nationRowHtml(n) {
  const g = game;
  const op = opinionDetail(g, n.id, PLAYER).value;
  const war = atWar(g, PLAYER, n.id);
  const tr = treatiesBetween(g, n.id, PLAYER).map(t => TREATY_INFO[t.type].label.toLowerCase());
  const d = gap(world, g, PLAYER, n.id);
  const status = war ? `<span class="tone-bad">at war</span>` : tr.length ? escapeHtml(tr.join(", ")) : d === 0 ? "neighbor" : "";
  const open = ui.openNation === n.id;
  return `<button class="nation-row ${open ? "on" : ""}" type="button" data-action="nation-open" data-nid="${n.id}" aria-expanded="${open}" style="--c:${n.color}">
    <span class="swatch"></span>
    <span class="nr-main"><strong>${escapeHtml(n.name)}</strong><span class="muted small">${n.minor ? "City-state" : ARCHETYPES[n.archetype].label} · ${n.leader ? escapeHtml(leaderName(n)) : ""}</span></span>
    <span class="nr-side"><span class="num tone-${toneOf(op)}">${signed(op)}</span><span class="small muted">${status}</span>${riskPillHtml(n.id)}</span>
  </button>`;
}

function nationsTabHtml() {
  const g = game;
  const rivals = liveNations(g).filter(n => !n.isPlayer);
  const fallen = g.nations.filter(n => !n.isPlayer && !n.alive);
  if (ui.openNation != null && !rivals.some(n => n.id === ui.openNation)) ui.openNation = null;
  // wars and neighbors first, then the great powers, then the small states
  const rank = n => (atWar(g, PLAYER, n.id) ? 0 : 10) + (gap(world, g, PLAYER, n.id) === 0 ? 0 : 3) + (n.minor ? 5 : 0);
  const sorted = rivals.slice().sort((a, b) => rank(a) - rank(b) || a.id - b.id);
  const list = sorted.map(n => nationRowHtml(n) + (ui.openNation === n.id ? rivalCardHtml(n) : "")).join("");
  return mindsBlockHtml()
    + (rivals.length ? `<div class="nation-list">${list}</div><p class="muted small">Click a nation to see its leader, its view of you and its decisions. Click it on the map, too.</p>` : `<p class="muted">No rival nations remain.</p>`)
    + (fallen.length ? `<p class="muted small">Fallen: ${fallen.map(n => escapeHtml(n.name)).join(", ")}.</p>` : "");
}

/* ---------- Actions for diplomacy ---------- */
function playerDeclareWar(nid) {
  const g = game;
  if (atWar(g, PLAYER, nid) || !(sharesBorder(g, PLAYER, nid) || seaContact(world, g, PLAYER, nid))) return;
  const { news } = declareWar(g, world, PLAYER, nid);
  news.forEach(t => addChronicle(g, t, "bad", PLAYER));
  ui.confirmWar = null;
  bumpMap();
}

function playerCancelTreaty(id) {
  const g = game;
  const t = g.treaties.find(x => x.id === id);
  if (!t) return;
  const other = t.a === PLAYER ? t.b : t.a;
  endTreaty(g, t, PLAYER);
  addChronicle(g, `You ended the ${TREATY_INFO[t.type].label.toLowerCase()} with the ${nameOf(g, other)}.`, BINDING.includes(t.type) ? "bad" : "neutral", PLAYER);
  ui.confirmCancel = null;
  bumpMap();
}

function acceptCounterOffer(id) {
  const g = game;
  const L = g.letters.find(x => x.id === id);
  if (!L || !L.counter || L.counterStatus) return;
  const res = acceptCounter(g, world, L.to, L.counter.terms);
  L.counterStatus = res.ok ? "You accepted their counter-offer. It is in force." : res.reason;
  if (res.ok) addChronicle(g, `You accepted the ${nameOf(g, L.to)}'s counter-offer: ${termsText(g, L.counter.terms)}.`, "good", PLAYER);
  bumpMap();
}

/* Who made the art: the icons (CC BY 3.0 asks for this credit) and the photographs the map is painted with. */
function creditsHtml() {
  return `<div class="dispatch credits" role="dialog" aria-modal="true" aria-labelledby="credits-title">
    <div class="block" style="gap:4px"><span class="eyebrow">Drawn Borders · version ${GAME_BUILD}</span><h2 id="credits-title">Credits</h2></div>
    <p>The ground on the map is painted with real photographs, and the icons were drawn by artists who share their work freely. Thank you to them.</p>
    <p class="map-status" style="font-size:12px;opacity:0.85;user-select:text">Map: ${typeof GLMAP !== "undefined" ? (GLMAP.note || (GLMAP.ok ? "full map" : "old tile map")) : "-"}</p>
    <div class="credit-row"><span class="credit-ic">${ICONS.crown}</span><div><strong>Icons</strong>
      <p>From game-icons.net, by Lorc, Delapouite, Skoll, sbed, Willdabeast, Faithtoken and Cathelineau. Licensed under Creative Commons Attribution 3.0 (CC BY 3.0, creativecommons.org/licenses/by/3.0).</p></div></div>
    <div class="credit-row"><span class="credit-ic">${ICONS.tree}</span><div><strong>Ground photographs</strong>
      <p>Rock, meadow, dry ground, forest floor, sand and snow by Nobiax (yughues) and rubberduck, prepared by CryHam for the open-source game Stunt Rally. Public domain (CC0).</p></div></div>
    <div class="credit-row"><span class="credit-ic">${ICONS.scroll}</span><div><strong>Fonts</strong>
      <p>Big Shoulders Display and IBM Plex Sans and Mono, from Google Fonts (SIL Open Font License).</p></div></div>
    <div class="actions"><button class="btn primary" type="button" data-action="credits-close" id="credits-close">Close</button></div>
  </div>`;
}
function waitingHtml() {
  return `<div class="dispatch waiting" role="dialog" aria-modal="true" aria-labelledby="waiting-title">
    <div class="block" style="gap:4px"><span class="eyebrow">End of ${escapeHtml(seasonLabel(game.turn))}</span><h2 id="waiting-title">The courts deliberate</h2></div>
    <p>Claude is weighing each rival's options: its treasury, its fears, its grudges and its promises. This usually takes under a minute.</p>
    <div class="bar indeterminate"><span></span></div>
    <div class="actions"><button class="btn" type="button" data-action="skip-wait">Don't wait: use the built-in rules this season</button></div>
  </div>`;
}

