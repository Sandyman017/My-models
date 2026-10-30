/* What Unity asks of the game's engine: the Unity version's side of the web interface, without the page.
   It goes into the bundle after the engine (bundle.js). Unity calls U.something(...) through JsEngine with plain values
   and gets JSON text back, shaped for Unity's JsonUtility: no nulls (-1 instead), only numbers, text, true/false and lists.
   The rules all stay in the engine: this file only calls them, as the web interface does (ui/44-19-input.js, ui/52b-16m-…). */
"use strict";
globalThis.U = (function () {
  let world = null, game = null;
  let delib = null;               // the rivals' plans for this season, made at its start (startDeliberation in ui/40-16b-…)
  let newsSeen = {}, seenInbox = [];   // news shown lately, letters already announced (seasonHeadlines, pushNews in ui/51-17e-…)
  // the province colours of the web map (ui/52b-16m-…: PROV_TINTS, provTint)
  const PROV_TINTS = ["#e7c46a", "#7fc4d8", "#e08a7a", "#9ccf7c", "#c39be0", "#e3a95c", "#7fa6e6", "#d7d78a", "#8fd8b8", "#e6a0c4", "#b5b5b5", "#cfa77f"];
  const tint = p => PROV_TINTS[(p.id * 7) % PROV_TINTS.length];
  const ok = (extra) => JSON.stringify(Object.assign({ ok: true, reason: "" }, extra || {}));
  const fail = reason => JSON.stringify({ ok: false, reason: String(reason || "That cannot be done.") });

  // Everything the map draws: who owns each cell, each cell's province, the nations, provinces and towns.
  function state() {
    const capitals = new Set();
    for (const p of game.provinces) { const c = provCapital(game, p); if (c) capitals.add(c.id); }
    return JSON.stringify({
      turn: game.turn,
      owner: Array.from(game.owner),
      prov: Array.from(game.prov),
      nations: game.nations.map(n => ({ id: n.id, name: n.name, color: n.color, alive: !!n.alive, minor: !!n.minor, player: !!n.isPlayer })),
      provinces: game.provinces.map(p => ({ id: p.id, owner: p.owner, name: p.name, capital: provCapital(game, p) ? p.capital : -1, tint: tint(p) })),
      towns: game.cities.map(c => ({ id: c.id, cell: c.cell, name: c.name, owner: c.owner, capital: !!c.capital, provCapital: capitals.has(c.id), pop: c.pop || 0 })),
    });
  }

  // The player's provinces, as the founding's second step lists them (provinceStats, as foundingProvincesHtml).
  function provinces() {
    const st = provinceStats(world, game, PLAYER, computeEconomy(world, game, PLAYER));
    return JSON.stringify({
      rows: st.map(s => ({
        id: s.p.id, name: s.p.name, tint: tint(s.p), area: fmtArea(s.cells), people: fmtPop(s.pop),
        capital: s.capital ? s.capital.id : -1,
        towns: s.towns.map(t => ({ id: t.id, name: t.name, natCapital: !!t.capital })),
      })),
    });
  }

  // A change to the player's provinces during the founding: made at once and free (provChange in ui/52b-16m-…).
  function change(op) {
    const plan = provincePlan(world, game, PLAYER, op);
    if (!plan.ok) return fail(plan.reason);
    applyProvincePlan(game, PLAYER, plan);
    return ok();
  }

  // ---------- the seasons (endSeason in ui/44-19-input.js; time, news and pauses in ui/51-17e-…) ----------

  // The rivals decide at the start of a season, with what they know then (their built-in rules: Claude is not here).
  function deliberate() {
    const menus = {}, orders = {};
    for (const n of liveNations(game)) {
      if (n.isPlayer) continue;
      menus[n.id] = buildMenu(game, world, n);
      orders[n.id] = ruleOrders(game, world, n, menus[n.id]);
    }
    delib = { turn: game.turn, menus, orders };
  }

  function shortLine(t, max = 110) {
    const s = String(t || "").replace(/\s+/g, " ").trim();
    const parts = s.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [s];
    let out = "";
    for (const p of parts) { if (out && (out + p).length > max) break; out += p; }
    out = out.trim();
    if (out.length > max + 10) { out = out.slice(0, max); out = out.slice(0, out.lastIndexOf(" ")) + "…"; }
    return out;
  }

  // Everything a season brought, most important first (seasonHeadlines): `go` says what clicking it opens.
  function headlines(d) {
    const g = game, P = g.nations[PLAYER], out = [];
    const add = (pri, text, tone, go) => { if (text) out.push({ pri, text: shortLine(text), tone: tone || "neutral", go: go || "report", id: -1 }); };
    const mentionsMe = t => t.includes(P.name) || /\byou(r)?\b/i.test(t);
    for (const x of d.opening || []) add(x.tone === "good" ? 90 : 98, x.text, x.tone, "goals");
    for (const x of d.decisions || []) if (g.decisions.some(y => y.id === x.id)) { add(92, `A decision: ${x.title}`, x.tone === "bad" ? "warn" : "neutral", "decision"); out[out.length - 1].id = x.id; }
    const fresh = g.inbox.filter(it => it.status === "open" && !seenInbox.includes(it.id));
    for (const it of fresh) add(it.threat ? 96 : 88, `${it.threat ? "A demand" : "A letter"} from the ${nameOf(g, it.from)}`, it.threat ? "bad" : "neutral", "letters");
    for (const it of g.inbox.filter(it => it.status === "info" && it.kind === "declaration" && it.turn >= g.turn - 1)) add(99, `The ${nameOf(g, it.from)} declared war on you!`, "bad", "army");
    const mine = (d.battles || []).filter(r => r.attacker === PLAYER || r.defender === PLAYER);
    if (mine.length) {
      const won = mine.filter(r => (r.attacker === PLAYER) === r.won).length;
      add(86, `Your army fought ${mine.length} battle${mine.length > 1 ? "s" : ""}: ${won} won, ${mine.length - won} lost`, won >= mine.length - won ? "good" : "bad", "army");
    }
    for (const t of d.war || []) add(mentionsMe(t) ? 84 : 58, t, mentionsMe(t) ? "bad" : "neutral", "army");
    for (const t of d.warnings || []) add(80, t, "bad");
    for (const x of d.ambitions || []) add(76, x.text, x.tone, "agenda");
    for (const t of d.leader || []) add(72, t, "warn", "agenda");
    for (const x of d.sea || []) add(x.tone === "bad" ? 78 : 48, x.text, x.tone, "navy");
    for (const x of d.built || []) add(66, x.text, x.tone === "bad" ? "bad" : "good", "realm");
    for (const x of d.cabinet || []) add(x.tone === "bad" ? 74 : x.tone === "warn" ? 60 : 54, x.text, x.tone, "cabinet");
    for (const x of d.firsts || []) add(x.nid === PLAYER ? 70 : 44, x.text, x.nid === PLAYER ? "good" : "neutral", "agenda");
    for (const x of d.economy || []) add(x.tone === "bad" ? 64 : x.tone === "good" ? 55 : 40, x.text, x.tone, "economy");
    for (const t of d.diplomacy || []) add(mentionsMe(t) ? 62 : 46, t, "neutral", "nations");
    for (const x of d.trade || []) add(x.pause ? 94 : x.tone === "bad" ? 70 : x.tone === "warn" ? 62 : x.tone === "good" ? 52 : 40, x.text, x.tone, "trade");
    for (const a of d.abroad || []) {
      const t = `The ${nameOf(g, a.nid)}: ${a.text.charAt(0).toLowerCase()}${a.text.slice(1)}`;
      const big = /\bwar\b|civil war|collapsed|conquered|Grand Harbor|Railway|Academy|Stock Exchange|World's Fair|Monument|Atomic|Broadcasting|Fortresses|Great Dam/.test(a.text);
      add(mentionsMe(a.text) ? 26 : big ? 50 : 24, t, "neutral", "nations");
    }
    for (const x of d.assembly || []) add(34, x.text, x.tone, "assembly");
    for (const x of d.people || []) add(x.tone === "bad" ? 66 : x.tone === "warn" ? 60 : 40, x.text, x.tone, "people");
    for (const x of d.groups || []) add(x.tone === "bad" ? 74 : x.tone === "warn" ? 70 : 48, x.text, x.tone, "groups");
    for (const x of d.cities || []) add(x.tone === "bad" ? 68 : x.tone === "good" ? 53 : 42, x.text, x.tone, "city");
    for (const x of d.villages || []) if (x.major) add(x.tone === "bad" ? 56 : 44, x.text, x.tone, "village");
    out.sort((a, b) => b.pri - a.pri);
    const seen = new Set(), all = [], news = [];
    for (const x of out) {
      if (seen.has(x.text)) continue;
      seen.add(x.text);
      all.push(x);
      // the same news again within six seasons is only in the report
      const key = x.text.replace(/[0-9.,$%MBk]+/g, "#");
      const last = newsSeen[key];
      if (x.pri < 90 && last !== undefined && g.turn - last < 6) continue;
      newsSeen[key] = g.turn;
      news.push(x);
    }
    seenInbox = seenInbox.concat(g.inbox.filter(it => it.status === "open").map(it => it.id));
    // the news list: five at most, then a line for the rest (pushNews)
    const shown = news.filter(x => x.pri >= 30).slice(0, 5), rest = news.length - shown.length;
    if (shown.length && rest) shown.push({ pri: 0, text: `${rest} more in the season report`, tone: "neutral", go: "report", id: -1 });
    if (!shown.length) shown.push({ pri: 0, text: rest ? `A quiet season (${rest} small item${rest === 1 ? "" : "s"} in the report)` : "A quiet season", tone: "neutral", go: "report", id: -1 });
    return { news: shown, report: all };
  }

  function seasonBefore() {
    const g = game, P = PLAYER;
    return {
      wars: liveNations(g).filter(z => z.id !== P && atWar(g, P, z.id)).map(z => z.id),
      towns: g.cities.filter(c => c.owner === P && g.occ[c.cell] < 0).map(c => c.id),
      inbox: g.inbox.filter(it => it.status === "open").map(it => it.id),
      seenDecl: g.inbox.filter(it => it.kind === "declaration").map(it => it.id),
    };
  }

  // Why time stops by itself after a season, or "" (autoPauseReason).
  function pauseReason(d, before) {
    const g = game, P = PLAYER;
    const declared = g.inbox.find(it => it.status === "info" && it.kind === "declaration" && !before.seenDecl.includes(it.id));
    if (declared) return `The ${nameOf(g, declared.from)} declared war on you!`;
    const newWar = liveNations(g).find(z => z.id !== P && atWar(g, P, z.id) && !before.wars.includes(z.id));
    if (newWar) return `You are at war with the ${newWar.name}.`;
    const lost = before.towns.filter(id => { const c = g.cities.find(x => x.id === id); return !c || c.owner !== P || g.occ[c.cell] >= 0; });
    if (lost.length) { const c = g.cities.find(x => x.id === lost[0]); return `${c ? c.name : "One of your towns"} has fallen to the enemy.`; }
    const fresh = g.inbox.filter(it => it.status === "open" && !before.inbox.includes(it.id));
    const letter = fresh.find(it => it.threat) || fresh[0];
    if (letter) return `${letter.threat ? "A demand" : "A letter"} from the ${nameOf(g, letter.from)} is waiting for your answer${fresh.length > 1 ? `, and ${fresh.length - 1} more letter${fresh.length > 2 ? "s" : ""}` : ""}.`;
    const cut = (d.trade || []).find(x => x.pause);
    if (cut) return shortLine(cut.text, 150);
    if ((d.opening || []).some(x => x.tone === "bad")) return shortLine(d.opening.find(x => x.tone === "bad").text, 150);
    return "";
  }

  // The bar at the top: the same figures and notes as the web game's (hudHtml in ui/38-16-…).
  function hud() {
    const n = game.nations[PLAYER];
    const econ = computeEconomy(world, game, PLAYER);
    const fc = forecast(world, game, PLAYER, n.laws);
    const h = n.history, prev = h.length >= 2 ? h[h.length - 2] : null;
    const gdpD = prev ? econ.gdp / prev.gdp - 1 : 0, popD = prev ? econ.pop / prev.pop - 1 : 0;
    let works = 0;
    for (const k in game.works) { const b = game.works[k].builders && game.works[k].builders[PLAYER]; if (b && !b.paused) works += b.cost / b.seasons; }
    const foodRatio = econ.food / econ.pop, enemies = enemiesOf(game, PLAYER).length, rank = legacyRank(game, PLAYER).rank;
    const envoys = game.inbox.filter(it => it.status === "open").length;
    const stat = (key, value, note, tone) => ({ key, value, note: note || "", tone: tone || "neutral" });
    const stats = [
      stat("Treasury", n.treasury >= 0 ? fmtMoney(n.treasury) : `Debt ${fmtMoney(-n.treasury)}`, `${fmtSignedMoney(fc.budget.balance - works)}/season`, toneOf(fc.budget.balance - works, 0.05)),
      stat("Output", `${fmtMoney(econ.gdp)}/yr`, prev ? signedPct(gdpD, 1) : "", toneOf(gdpD, 0.0005)),
      stat("Population", fmtPop(econ.pop), prev ? signedPct(popD, 1) : "", toneOf(popD, 0.0002)),
      stat("Food", pct(foodRatio), econ.famineShare > 0.01 ? "shortage" : econ.granary && econ.granary.release > 0.0005 ? "+ store" : (econ.foodIn || 0) > 0.01 * econ.pop ? "+ imports" : "of need",
        econ.famineShare > 0.01 ? "bad" : foodRatio < 1.1 || (econ.granary && econ.granary.release > 0.0005) ? "warn" : "neutral"),
      stat("Stability", `${Math.round(n.stability)}`, `→ ${Math.round(fc.target)}`, toneOf(fc.target - n.stability, 0.5)),
      stat("Army", `${game.divisions.filter(d => d.owner === PLAYER).length} div`, enemies ? "at war" : fmtCount(n.soldiers), enemies ? "bad" : "neutral"),
      stat("Prestige", `${n.prestige || 0}`, liveNations(game).some(z => (z.prestige || 0) > 0) ? ordinal(rank) : "", rank === 1 ? "good" : "neutral"),
    ];
    if (envoys) stats.push(stat("Envoys", `${envoys}`, "waiting", "warn"));
    return JSON.stringify({ name: n.name, color: n.color, season: seasonLabel(game.turn), era: ERAS[game.era || 0].name, stats });
  }

  // The player's decisions waiting for an answer, as the decision card shows them (decisionHtml in ui/55-16d-…).
  function decisions() {
    const chips = effects => {
      const list = effects.flatMap(e => (e.t === "successor" ? e.leader.traits.map(t => ({ text: `${LEADER_TRAITS[t].label}: ${TRAIT_EFFECTS[t]}`, tone: "neutral" })) : [effectText(game, e, PLAYER)])).filter(x => x.text);
      return list.length ? list.map(x => ({ text: x.text, tone: x.tone || "neutral" })) : [{ text: "Nothing changes", tone: "neutral" }];
    };
    return JSON.stringify({
      list: game.decisions.filter(d => d.nid === PLAYER).map(d => {
        const place = d.cell >= 0 && game.owner[d.cell] === PLAYER ? (game.cities.find(c => c.cell === d.cell) || nearestCity(game, d.cell, PLAYER)) : null;
        const def = d.options.find(o => o.id === d.def) || d.options[0];
        return {
          id: d.id, title: d.title, body: d.body, tone: d.tone || "neutral", cat: d.cat || "", place: place ? place.name : "",
          by: seasonLabel(d.expires), def: def.label, cell: d.cell >= 0 && d.key !== "succession" ? d.cell : -1,
          options: d.options.map(o => ({ id: String(o.id), label: o.label, sub: o.sub || "", chips: chips(o.effects) })),
        };
      }),
    });
  }

  return {
    /** Founds the nation (foundNation in ui/44-19-input.js): the world, the rivals, every nation's provinces. */
    newGame(seed, cells, name) {
      world = generateWorld(seed);
      game = setupGame(world, cells, name, seed);
      delib = null; newsSeen = {}; seenInbox = [];
      return state();
    },
    hud,
    decisions,
    /** Ends the season (endSeason): the rivals act on the plans they made at its start, then everything moves on. */
    endSeason() {
      if (!delib || delib.turn !== game.turn) deliberate();
      const before = seasonBefore();
      const dispatch = runSeason(world, game, { menus: delib.menus, orders: delib.orders });
      const h = headlines(dispatch);
      const pn = game.nations[PLAYER];
      const collapsed = !pn.alive || pn.stability <= 0.5;
      if (collapsed) addChronicle(game, pn.alive ? `The government of ${pn.name} collapsed.` : `${pn.name} was conquered.`, "bad", PLAYER);
      deliberate();
      return JSON.stringify({ season: dispatch.season, news: h.news, report: h.report, pause: pauseReason(dispatch, before), collapsed });
    },
    /** The answer to a decision; gives the line for the hint. */
    decide(id, optId) {
      const d = game.decisions.find(x => x.id === id);
      if (!d) return fail("That decision is no longer open.");
      const r = decide(world, game, d, optId, false);
      bumpWorld(game);
      return ok({ text: `${d.title.replace(/[?.!]$/, "")}: ${r.option.label}.` });
    },
    /** The first news of a new game (startNewsItems). */
    startNews() {
      const g = game, list = [];
      const O = g.opening;
      if (O && ["claim", "demand", "refused", "war"].includes(O.stage) && g.nations[O.by]) list.push({ pri: 98, text: `The ${g.nations[O.by].name}, your neighbor, says ${O.town} belongs to it.`, tone: "bad", go: "goals", id: -1 });
      list.push({ pri: 0, text: `${g.nations[PLAYER].name} is founded. Press Space to start time.`, tone: "good", go: "realm", id: -1 });
      seenInbox = g.inbox.filter(it => it.status === "open").map(it => it.id);
      return JSON.stringify({ season: seasonLabel(g.turn), news: list, report: [], pause: "", collapsed: false });
    },
    state,
    provinces,
    /** "Divide it for me" (k = 0) or into k provinces of about the same size. */
    autoDivide(k) {
      let area = 0;
      for (let i = 0; i < N_CELLS; i++) if (game.owner[i] === PLAYER) area++;
      autoDivide(world, game, PLAYER, k || autoProvinceCount(area));
      bumpWorld(game);
      return ok();
    },
    rename(pid, name) {
      if (!renameProvince(game, PLAYER, pid, name)) return fail("Give it a name no other province of yours has.");
      bumpWorld(game);
      return ok();
    },
    setCapital(pid, cityId) { return change({ t: "capital", pid, cityId }); },
    /** The land inside a line drawn with the pen (provPenDone and provDrawCardHtml in ui/52b-16m-…). */
    penCells(path) {
      const inside = path.length >= 6 ? landCellsInsidePath(world, path).filter(c => game.owner[c] === PLAYER) : [];
      if (!inside.length) return fail("Draw around some of your own land.");
      const set = new Set(inside), ids = new Map();
      for (const c of inside) for (const [dx, dy] of DIRS4) {
        const x = cellX(c) + dx, y = cellY(c) + dy;
        if (!inBounds(x, y)) continue;
        const j = idx(x, y);
        if (set.has(j) || game.owner[j] !== PLAYER) continue;
        const p = provAt(game, j);
        if (p) ids.set(p.id, (ids.get(p.id) || 0) + 1);
      }
      for (const c of inside) { const p = provAt(game, c); if (p && !ids.has(p.id)) ids.set(p.id, 0); }
      const targets = [...ids.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => provById(game, id)).filter(Boolean);
      const towns = game.cities.filter(c => c.owner === PLAYER && set.has(c.cell));
      return ok({
        cells: inside, area: fmtArea(inside.length), people: fmtPop(inside.reduce((s, c) => s + game.pop[c], 0)),
        towns: towns.map(t => t.name), canNew: inside.length >= PROV.minCells, minArea: fmtArea(PROV.minCells),
        targets: targets.map(p => ({ id: p.id, name: p.name })),
      });
    },
    /** Makes the drawn land a new province (to = -1) or adds it to province `to`. */
    drawProvince(cells, to) { return change({ t: "draw", cells, to: to >= 0 ? to : null }); },
    /** "Start with these provinces": the first lines of the nation's story (startWithProvinces in ui/52b-16m-…). */
    start() {
      const name = game.nations[PLAYER].name;
      const cap = game.cities.find(c => c.owner === PLAYER && c.capital).cell;
      const rivals = game.nations.filter(n => !n.isPlayer).map(n => {
        const rc = game.cities.find(c => c.owner === n.id && c.capital);
        return `the ${n.name} to the ${directionWord(cap, rc.cell)}`;
      });
      addChronicle(game, `${name} is founded. Its neighbors: ${bJoin(rivals)}.`, "neutral", PLAYER);
      const list = provList(game, PLAYER);
      addChronicle(game, list.length > 1 ? `${name} is divided into ${list.length} provinces: ${bJoin(list.map(p => p.name))}.` : `${name} is governed as one province.`, "neutral", PLAYER);
      bumpWorld(game);
      deliberate();
      return JSON.stringify({ lines: game.chronicle.slice(0, 2).reverse().map(e => e.text) });   // the newest come first
    },
  };
})();
