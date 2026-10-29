/* Writes what the web game's engine makes for a few seeds, so the Unity (C#) engine can be checked against it.
   node Tools/js-reference.js [out.json]   (run from drawn-borders-unity/) */
"use strict";
const vm = require("vm");
const path = require("path");
const { engineSource } = require(path.join(__dirname, "../../drawn-borders/build.js"));
const expose = "\n;globalThis.E = { generateWorld, emptyGame, settleCells, makeNation, placeTowns, shapeTraits, claimFromPath, mulberry32, cellDensity, cellFood, riverCells, riverGeo, seaGeo, beachSeaCell, GRID_W, GRID_H, N_CELLS };";
const ctx = vm.createContext({ console, Math, Date, JSON, Map, Set, structuredClone });
vm.runInContext(engineSource() + expose, ctx, { filename: "engine.js" });
const E = ctx.E;

const SEEDS = [12345, 1000, 8919, 54321, 77777, 31337];
// The same loops the C# check draws: ovals around a few places.
const LOOPS = [[40, 32, 8, 6], [30, 25, 7, 5], [55, 35, 9, 6], [48, 30, 5, 4], [62, 28, 10, 7]];
function loop(cx, cy, rx, ry) { const p = []; for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; p.push([cx + Math.cos(a) * rx * (1 + 0.15 * Math.sin(3 * a)), cy + Math.sin(a) * ry]); } return p; }

const out = [];
for (const seed of SEEDS) {
  const w = E.generateWorld(seed);
  const sea = E.seaGeo(w), rg = E.riverGeo(w);
  const r = { seed, seaLevel: w.seaLevel, hillLevel: w.hillLevel, mountainLevel: w.mountainLevel, landCount: w.landCount,
    terrain: Array.from(w.terrain).join(""), dep: Array.from(w.dep).join(""), hid: Array.from(w.hid).join(""),
    coastal: Array.from(w.coastal).join(""), rivers: Array.from(E.riverCells(w)).join(""), ocean: Array.from(sea.ocean).join(""),
    nav: Array.from(rg.nav).map(v => (v < 0 ? "." : String.fromCharCode(65 + (v % 26)))).join(""), claims: [] };
  for (const L of LOOPS) {
    const res = E.claimFromPath(w, loop(...L));
    if (!res.ok) { r.claims.push({ ok: false, error: res.error }); continue; }
    const cells = res.cells, g = E.emptyGame(w);
    E.settleCells(w, g, 0, cells);
    const traits = E.shapeTraits(w, cells);
    g.nations.push(E.makeNation(0, "p", null, traits, true));
    E.placeTowns(w, g, 0, cells, E.mulberry32(7));
    let people = 0, farmland = 0, ocean = 0;
    for (const c of cells) { people += g.pop[c]; farmland += E.cellFood(w, g, c); if (E.beachSeaCell(w, c) >= 0) ocean++; }
    r.claims.push({ ok: true, cells: cells.join(","), dropped: res.droppedCells, stability: traits.stability, defense: traits.defense,
      shapeTerm: traits.shapeTerm, sizeTerm: traits.sizeTerm, ruggedTerm: traits.ruggedTerm, exposureTerm: traits.exposureTerm,
      people: people.toFixed(4), farmland: farmland.toFixed(4), ocean, towns: g.cities.map(c => `${c.cell}:${c.name}`).join(",") });
  }
  out.push(r);
}
require("fs").writeFileSync(process.argv[2] || "js-reference.json", JSON.stringify(out));
console.log(`wrote ${out.length} worlds`);
