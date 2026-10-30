/* What Unity asks of the game's engine: the Unity version's side of the web interface, without the page.
   It goes into the bundle after the engine (bundle.js). Unity calls U.something(...) through JsEngine with plain values
   and gets JSON text back, shaped for Unity's JsonUtility: no nulls (-1 instead), only numbers, text, true/false and lists.
   The rules all stay in the engine: this file only calls them, as the web interface does (ui/44-19-input.js, ui/52b-16m-…). */
"use strict";
globalThis.U = (function () {
  let world = null, game = null;
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

  return {
    /** Founds the nation (foundNation in ui/44-19-input.js): the world, the rivals, every nation's provinces. */
    newGame(seed, cells, name) {
      world = generateWorld(seed);
      game = setupGame(world, cells, name, seed);
      return state();
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
      return JSON.stringify({ lines: game.chronicle.slice(0, 2).reverse().map(e => e.text) });   // the newest come first
    },
  };
})();
