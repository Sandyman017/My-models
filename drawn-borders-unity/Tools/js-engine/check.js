/* The same-results check: the game's rules engine must give exactly the same game in Unity (V8 inside Unity, through PuerTS)
   as in Node. Both hosts run this file after the engine bundle, then for each seed in SameCheck.seeds call start(seed),
   season() SameCheck.seasons times and finish(), and time each call themselves. Only the text from finish() is compared:
     Node:  node Tools/js-engine/node-check.js node.txt
     Unity: Unity.exe -batchmode -quit -projectPath . -executeMethod DrawnBorders.JsEngineCheck.Run -checkOut unity.txt
     then   node Tools/js-engine/node-check.js --compare node.txt unity.txt */
"use strict";
globalThis.SameCheck = (function () {
  let world = null, game = null, lines = [];

  // The same kind of oval the game's "Try a sample shape" button draws (as in drawn-borders/tests/engine.test.js).
  function sampleCells(w, seed) {
    const rng = mulberry32(seed);
    for (let tries = 0; tries < 400; tries++) {
      const cx = 8 + rng() * (GRID_W - 16), cy = 7 + rng() * (GRID_H - 14);
      const rx = 6 + rng() * 4, ry = 4.5 + rng() * 3, pts = [];
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2, wobble = 0.82 + 0.36 * rng();
        pts.push([cx + Math.cos(a) * rx * wobble, cy + Math.sin(a) * ry * wobble]);
      }
      const res = claimFromPath(w, pts);
      if (res.ok && res.droppedCells < 4 && res.cells.length >= 70) return res.cells;
    }
    throw new Error("no sample spot");
  }

  // The whole game as text: like JSON.stringify(game), but Sets, Maps and typed arrays are written out in full.
  function gameText(g) {
    return JSON.stringify(g, (k, v) => (v instanceof Set || v instanceof Map ? Array.from(v) : ArrayBuffer.isView(v) ? Array.from(v) : v));
  }
  // cyrb53: a 53-bit hash of a string, as 14 hex digits
  function hash(s) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
  }

  // Each nation after a season: people and output (as kept in its history), stability and treasury (exact numbers).
  function note() {
    lines.push(`season ${game.turn}`);
    for (const n of game.nations) {
      const h = n.history[n.history.length - 1] || {};
      lines.push(`  ${n.id} ${n.name}: ${n.alive ? "" : "(gone) "}people ${h.pop} · output ${h.gdp} · stability ${n.stability} · treasury ${n.treasury}`);
    }
  }

  return {
    seeds: [1000, 8919, 16838],
    seasons: 12,
    start(seed) {
      // The engine calls Math.random once (the ministers' salt, g.cabSalt): both hosts use the same seeded numbers.
      Math.random = mulberry32((seed * 2654435761) >>> 0);
      world = generateWorld(seed);
      game = setupGame(world, sampleCells(world, seed), "Testland", seed);
      lines = [`world ${seed}: ${world.landCount} land cells · ${game.nations.length} nations · ${game.cities.length} towns · start hash ${hash(gameText(game))}`];
    },
    season() {
      runSeason(world, game, {});
      note();
    },
    finish() {
      const text = gameText(game);
      lines.push(`saved game: ${text.length} characters · hash ${hash(text)}`);
      world = game = null;
      return lines.join("\n");
    },
    // what the host lacked (filled in by polyfill.js), for the report
    hostNote() { return (globalThis.__polyfilled || []).length ? "stand-ins used for: " + globalThis.__polyfilled.join(", ") : "no stand-ins needed"; },
  };
})();
