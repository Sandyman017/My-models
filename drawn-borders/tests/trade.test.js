/* Checks trade between nations with the game rules alone (no browser).
   node tests/trade.test.js [worlds] [seasons]   (default 2 worlds x 10 seasons)
   - contracts are sane: no negative amounts, no trade across a war or an embargo, sellers ship what buyers receive
   - the same game played twice gives the same contracts (no randomness in trade)
   - an embargo cuts the target's supply at once, and its preview says so first
   - grain reaches a nation whose harvest failed
   - a trade agreement between two linked nations is still worth something to them
   - the book survives a save and load through the game's own save code; an old save without one gets one */
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path");
const { engineSource } = require("../build.js");

const worlds = Number(process.argv[2] || 2), seasons = Number(process.argv[3] || 10);
const saving = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "56-20-saving.js"), "utf8").replace(/function restore\(saved\)[\s\S]*$/, "");
const expose = "\n;globalThis.E = { generateWorld, setupGame, runSeason, claimFromPath, mulberry32, computeEconomy, GRID_W, GRID_H, PLAYER, tradeBlocked, tradeWith, embargoPreview, declareEmbargo, liftEmbargo, clearWorldTrade, tradeMigrate, evaluateDeal, serializeGame, deserializeGame, liveNations };";
function load() {
  const warns = [];
  const ctx = vm.createContext({ console: { log: console.log, warn: (...a) => warns.push(a.join(" ")) }, Math, Date, JSON, Map, Set, WeakMap, structuredClone });
  vm.runInContext(engineSource() + "\n" + saving + expose, ctx, { filename: "engine.js" });
  return { E: ctx.E, warns };
}
function sampleCells(E, world, seed) {
  const rng = E.mulberry32(seed);
  for (let tries = 0; tries < 400; tries++) {
    const cx = 8 + rng() * (E.GRID_W - 16), cy = 7 + rng() * (E.GRID_H - 14);
    const rx = 6 + rng() * 4, ry = 4.5 + rng() * 3, pts = [];
    for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2, wobble = 0.82 + 0.36 * rng(); pts.push([cx + Math.cos(a) * rx * wobble, cy + Math.sin(a) * ry * wobble]); }
    const res = E.claimFromPath(world, pts);
    if (res.ok && res.droppedCells < 4 && res.cells.length >= 70) return res.cells;
  }
  throw new Error("no sample spot");
}
let failed = 0;
const check = (ok, what) => { if (!ok) { failed++; console.error("  FAIL: " + what); } };

for (let i = 0; i < worlds; i++) {
  const seed = 16838 + i * 7919;
  const { E, warns } = load();
  const w = E.generateWorld(seed), g = E.setupGame(w, sampleCells(E, w, seed), "Testland", seed);
  check(g.trade && g.trade.v === 1, "a new game has a trade book");
  for (let s = 0; s < seasons; s++) {
    E.runSeason(w, g, {});
    const T = g.trade;
    const ec = {};
    for (const n of E.liveNations(g)) ec[n.id] = E.computeEconomy(w, g, n.id);
    for (const f of T.flows) {
      check(f.q > 0 && Number.isFinite(f.q), `flow amount ${JSON.stringify(f)}`);
      if (f.s >= 0 && f.b >= 0) check(!E.tradeBlocked(g, f.s, f.b, f.k) || T.embargoes.length > 0, `flow across a war or sanctions ${f.s}>${f.b} ${f.k}`);
    }
    // what comes from the world market never goes beyond what is still short
    for (const id in ec) for (const k in ec[id].trade.importsFrom) { const wq = ec[id].trade.importsFrom[k].filter(x => x.from < 0).reduce((a, x) => a + x.q, 0); check(k === "food" || wq <= Math.max(0, ec[id].goods.demand[k]) + 1e-6, `world imports beyond need ${id} ${k}`); }
    let worst = 0;
    for (const f of T.flows) {
      if (f.s < 0 || f.b < 0 || !ec[f.s] || !ec[f.b]) continue;
      // signed contracts (the merchants' quick deals between seasons are each side's own reckoning)
      const sent = (ec[f.s].trade.exportsTo[f.k] || []).filter(x => x.to === f.b && x.r !== "new").reduce((a, x) => a + x.q, 0);
      const got = (ec[f.b].trade.importsFrom[f.k] || []).filter(x => x.from === f.s && x.r !== "new").reduce((a, x) => a + x.q, 0);
      worst = Math.max(worst, Math.abs(sent - got));
    }
    check(worst < 0.05, `sellers ship what buyers receive (worst gap ${worst.toFixed(3)})`);
  }
  // determinism: the same game again
  {
    const L2 = load(), w2 = L2.E.generateWorld(seed), g2 = L2.E.setupGame(w2, sampleCells(L2.E, w2, seed), "Testland", seed);
    for (let s = 0; s < seasons; s++) L2.E.runSeason(w2, g2, {});
    check(JSON.stringify(g2.trade) === JSON.stringify(g.trade), "two identical games sign identical contracts");
  }
  // an embargo on the biggest nation-to-nation contract
  const big = g.trade.flows.filter(f => f.s >= 0 && f.b >= 0 && !E.tradeBlocked(g, f.s, f.b, f.k)).sort((a, b) => b.q - a.q)[0];
  if (big) {
    const before = E.computeEconomy(w, g, big.b).sat[big.k] ?? 1;
    const pv = E.embargoPreview(w, g, big.s, big.b, big.k, "sell", false);
    const r = E.declareEmbargo(w, g, big.s, big.b, big.k, "sell", "test", { preview: pv });
    check(r.ok, "the embargo can be declared");
    const after = big.k === "food" ? null : E.computeEconomy(w, g, big.b).sat[big.k];
    if (after !== null) {
      check(after <= before + 1e-3, `the target's supply does not rise (${before.toFixed(2)} → ${after.toFixed(2)})`);
      const line = pv.lines.find(l => l.label.includes("share of need"));
      if (after < before - 0.02) check(!!line, "the preview warned of the cut");
    }
    check(!E.declareEmbargo(w, g, big.s, big.b, big.k, "sell", "test").ok, "the same embargo cannot be declared twice");
    check(E.liftEmbargo(w, g, r.e.id, big.s).ok, "the embargo can be lifted");
  }
  // grain for a nation whose harvest failed (one with a link to another nation)
  const linked = E.liveNations(g).find(n => Object.keys(g.trade.links).some(k => k.split("-").map(Number).includes(n.id)) && n.id !== E.PLAYER);
  if (linked) {
    linked.harvest = 0.5;
    linked.granary.stock = 0;
    const f0 = E.computeEconomy(w, g, linked.id);
    E.clearWorldTrade(w, g, { quiet: true });
    const f1 = E.computeEconomy(w, g, linked.id);
    const grain = g.trade.flows.filter(f => f.k === "food" && f.b === linked.id).reduce((a, f) => a + f.q, 0);
    check(f0.trade.foodGap <= 1e-4 || grain > 0 || f1.trade.worldImportCapRaw === 0, `grain flows to a hungry nation (${linked.name}: gap ${f0.trade.foodGap.toFixed(2)})`);
    check(f1.famineShare <= f0.famineShare + 1e-6, `famine does not grow when grain arrives (${f0.famineShare.toFixed(2)} → ${f1.famineShare.toFixed(2)})`);
  }
  // a trade agreement between two nations with a link is worth something to at least one of them
  const pair = Object.entries(g.trade.links).map(([k, L]) => ({ ids: k.split("-").map(Number), L })).find(x => x.ids.every(id => g.nations[id].alive) && !g.treaties.some(t => t.type === "trade" && x.ids.includes(t.a) && x.ids.includes(t.b)) && !g.wars.some(war => x.ids.every(id => war.sideA.includes(id) || war.sideB.includes(id))));
  if (pair) {
    const [a, b] = pair.ids;
    const v1 = E.evaluateDeal(g, w, a, b, [{ type: "trade" }]), v2 = E.evaluateDeal(g, w, b, a, [{ type: "trade" }]);
    const gain = l => l.lines.some(x => /add \$/.test(x.label));
    check(gain(v1) || gain(v2), `a trade agreement still has value (${a}-${b} by ${pair.L.m})`);
  }
  // save and load through the game's own code
  const saved = JSON.parse(JSON.stringify(E.serializeGame(g)));
  const back = E.deserializeGame(saved);
  check(JSON.stringify(back.trade) === JSON.stringify(g.trade), "the trade book survives a save and load");
  check(JSON.stringify(back.opening || null) === JSON.stringify(g.opening || null) && back.cabSalt === g.cabSalt, "the opening claim and the ministers' salt survive a save and load");
  // an old save without a book
  delete saved.trade;
  const old = E.deserializeGame(saved);
  check(!old.trade, "an old save has no book before migration");
  E.tradeMigrate(w, old);
  check(old.trade && old.trade.v === 1 && Array.isArray(old.trade.flows), "migration gives an old save a book");
  E.runSeason(w, old, {});
  check(old.trade.turn === old.turn, "the migrated game keeps signing contracts");
  check(!warns.length, `no warnings from the trade clearing (${warns.slice(0, 2).join(" | ")})`);
  console.log(`world ${seed}: ${seasons} seasons, ${g.trade.flows.length} contracts (${g.trade.flows.filter(f => f.s >= 0 && f.b >= 0).length} between nations), ${Object.keys(g.trade.links).length} links`);
}
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log("trade test ok");
