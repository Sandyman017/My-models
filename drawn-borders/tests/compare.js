/* Plays whole worlds with the game rules (the player does nothing) and records numbers to compare two versions:
   output, stability, wars, towns taken, famine, trade, the opening war, and how long a season takes.
   node tests/compare.js [worlds] [seasons] [out.json] [game folder]      (default 8 worlds x 40 seasons, this folder)
   node tests/compare.js --diff old.json new.json                         (the two side by side)
   To get the previous version: git worktree add /tmp/old <its commit>, then use /tmp/old/drawn-borders as the folder. */
"use strict";
const vm = require("vm"), path = require("path"), fs = require("fs");

if (process.argv[2] === "--diff") {
  const [a, b] = process.argv.slice(3).map(f => JSON.parse(fs.readFileSync(f, "utf8")));
  console.log("measure".padEnd(14), "old".padStart(10), "new".padStart(10));
  for (const k in a.sum) console.log(k.padEnd(14), String(a.sum[k]).padStart(10), String(b.sum[k]).padStart(10));
  console.log("\nseed     first war (old/new)   world output (old/new)   wars (old/new)");
  a.results.forEach((r, i) => { const q = b.results[i] || {}; console.log(String(r.seed).padEnd(8), `${r.firstWar}/${q.firstWar}`.padStart(12), `${r.worldGdp}/${q.worldGdp}`.padStart(22), `${r.wars}/${q.wars}`.padStart(16)); });
  process.exit(0);
}

const [nW = "8", nS = "40", out, dir = path.join(__dirname, "..")] = process.argv.slice(2);
const { engineSource } = require(path.resolve(dir, "build.js"));
const expose = "\n;globalThis.E = { generateWorld, setupGame, runSeason, claimFromPath, mulberry32, computeEconomy, GRID_W, GRID_H, PLAYER, liveNations };";
const ctx = vm.createContext({ console, Math, Date, JSON, Map, Set, WeakMap, structuredClone, performance });
vm.runInContext(engineSource() + expose, ctx, { filename: "engine.js" });
const E = ctx.E;
function sampleCells(world, seed) {
  const rng = E.mulberry32(seed);
  for (let t = 0; t < 400; t++) {
    const cx = 8 + rng() * (E.GRID_W - 16), cy = 7 + rng() * (E.GRID_H - 14), rx = 6 + rng() * 4, ry = 4.5 + rng() * 3, pts = [];
    for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2, wb = 0.82 + 0.36 * rng(); pts.push([cx + Math.cos(a) * rx * wb, cy + Math.sin(a) * ry * wb]); }
    const r = E.claimFromPath(world, pts); if (r.ok && r.droppedCells < 4 && r.cells.length >= 70) return r.cells;
  }
  throw new Error("no sample spot");
}
const results = [];
for (let i = 0; i < Number(nW); i++) {
  const seed = 1000 + i * 7919;
  const w = E.generateWorld(seed), g = E.setupGame(w, sampleCells(w, seed), "Testland", seed);
  const t0 = performance.now();
  let err = null, firstWar = null;
  try {
    for (let s = 0; s < Number(nS); s++) {
      E.runSeason(w, g, {});
      if (firstWar === null && g.wars.some(x => x.sideA.includes(E.PLAYER) || x.sideB.includes(E.PLAYER))) firstWar = g.turn;
    }
  } catch (e) { err = e.stack.split("\n").slice(0, 4).join(" | "); }
  const live = g.nations.filter(n => n.alive), econ = live.map(n => E.computeEconomy(w, g, n.id));
  const r = {
    seed, err, msPerSeason: Math.round((performance.now() - t0) / Number(nS)), alive: live.length, of: g.nations.length,
    worldGdp: Math.round(econ.reduce((s, e) => s + e.gdp, 0)),
    meanStab: +(live.reduce((s, n) => s + n.stability, 0) / live.length).toFixed(1),
    wars: Object.values(g.stats.warsStarted || {}).reduce((a, b) => a + b, 0),
    townsMoved: Object.values(g.stats.nat || {}).reduce((s, x) => s + (x.townsLost || 0), 0),
    famine: +(econ.reduce((s, e) => s + (e.faminePop || 0), 0) / econ.reduce((s, e) => s + e.pop, 0)).toFixed(3),
    exp: +econ.reduce((s, e) => s + (e.exportValue || 0), 0).toFixed(1), imp: +econ.reduce((s, e) => s + (e.importBill || 0), 0).toFixed(1),
    treaties: (g.treaties || []).filter(t => t.type === "trade").length, firstWar,
  };
  results.push(r);
  console.log(JSON.stringify(r));
}
const avg = k => +(results.reduce((s, r) => s + (typeof r[k] === "number" ? r[k] : 0), 0) / results.length).toFixed(2);
const sum = { worldGdp: avg("worldGdp"), meanStab: avg("meanStab"), wars: avg("wars"), townsMoved: avg("townsMoved"), famine: avg("famine"), exp: avg("exp"), imp: avg("imp"), treaties: avg("treaties"), msPerSeason: avg("msPerSeason"), errors: results.filter(r => r.err).length };
console.log("SUMMARY", JSON.stringify(sum));
if (out) fs.writeFileSync(out, JSON.stringify({ results, sum }, null, 1));
