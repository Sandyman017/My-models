/* Plays whole worlds with the game rules alone (no browser) and checks that nothing breaks.
   node tests/engine.test.js [worlds] [seasons]   (default 2 worlds x 12 seasons) */
"use strict";
const vm = require("vm");
const { engineSource } = require("../build.js");

const worlds = Number(process.argv[2] || 2), seasons = Number(process.argv[3] || 12);
const expose = "\n;globalThis.E = { generateWorld, setupGame, runSeason, claimFromPath, mulberry32, GRID_W, GRID_H, PLAYER };";
const ctx = vm.createContext({ console, Math, Date, JSON, Map, Set, structuredClone });
vm.runInContext(engineSource() + expose, ctx, { filename: "engine.js" });
const E = ctx.E;

// The same kind of oval the game's "Try a sample shape" button draws.
function sampleCells(world, seed) {
  const rng = E.mulberry32(seed);
  for (let tries = 0; tries < 400; tries++) {
    const cx = 8 + rng() * (E.GRID_W - 16), cy = 7 + rng() * (E.GRID_H - 14);
    const rx = 6 + rng() * 4, ry = 4.5 + rng() * 3, pts = [];
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2, wobble = 0.82 + 0.36 * rng();
      pts.push([cx + Math.cos(a) * rx * wobble, cy + Math.sin(a) * ry * wobble]);
    }
    const res = E.claimFromPath(world, pts);
    if (res.ok && res.droppedCells < 4 && res.cells.length >= 70) return res.cells;
  }
  throw new Error("no sample spot");
}

let failed = 0;
for (let i = 0; i < worlds; i++) {
  const seed = 1000 + i * 7919;
  const t0 = Date.now();
  try {
    const world = E.generateWorld(seed);
    const game = E.setupGame(world, sampleCells(world, seed), "Testland", seed);
    for (let s = 0; s < seasons; s++) E.runSeason(world, game, {});
    const saved = JSON.stringify(game);
    JSON.parse(saved);
    const p = game.nations[E.PLAYER];
    const bad = game.nations.filter(n => !Number.isFinite(n.treasury));
    if (bad.length) throw new Error("treasury is not a number for " + bad.map(n => n.name).join(", "));
    console.log(`world ${seed}: ${seasons} seasons ok · ${game.nations.length} nations · ${game.cities.length} cities · `
      + `player owns ${game.cities.filter(c => c.owner === E.PLAYER).length} · save ${(saved.length / 1e6).toFixed(1)} MB · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    failed++;
    console.error(`world ${seed}: FAILED\n${e.stack}`);
  }
}
process.exit(failed ? 1 : 0);
