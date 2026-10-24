/* Checks "places that live" (villages, hamlets, sites, markets, booms, busts, ruins and town charters) with the game
   rules alone (no browser).  node tests/villages.test.js [worlds] [seasons]   (default 2 worlds x 12 seasons)
   Each world: the villages stay sane season after season; a new mine makes a boom and its end a bust, then ruins or
   a farm village; a big village on a good site asks for a charter and becomes a town; an old save gets everything. */
"use strict";
const vm = require("vm");
const { engineSource } = require("../build.js");

const worlds = Number(process.argv[2] || 2), seasons = Number(process.argv[3] || 12);
const expose = "\n;globalThis.E = { generateWorld, setupGame, runSeason, claimFromPath, mulberry32, GRID_W, GRID_H, PLAYER, N_CELLS, edgeKey, dist, cellX, cellY, idx, inBounds, isLand, "
  + "hamletsOf, cellSettlement, villageStats, siteReport, charterCheck, ensureProvinces, decide, VIL, VILLAGE_PLANS, SITE_FEATURES, cityStay, nearestCity, cityModsActive, villMeta, AMBITIONS, ambCtx, "
  + "DECISIONS, decisionCtx, makeDecision, VILLAGE_DECISIONS, orderVillageWork, villageWorkCheck, VILLAGE_WORK_ORDER, villageFileLines, effectText };";
const ctx = vm.createContext({ console, Math, Date, JSON, Map, Set, structuredClone });
vm.runInContext(engineSource() + expose, ctx, { filename: "engine.js" });
const E = ctx.E;

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
function check(cond, msg) { if (!cond) throw new Error(msg); }

/* Everything that must hold for the villages at any time. */
function invariants(world, game, when) {
  const ids = new Set(), names = new Set(), cells = new Set();
  for (const v of game.villages) {
    check(v.id > 0 && !ids.has(v.id), `${when}: village id ${v.id} missing or repeated`);
    ids.add(v.id);
    check(!names.has(v.name), `${when}: two villages called ${v.name}`);
    names.add(v.name);
    check(!cells.has(v.cell), `${when}: two villages in cell ${v.cell}`);
    cells.add(v.cell);
    check(E.VILLAGE_PLANS[v.plan], `${when}: ${v.name} has no known look (${v.plan})`);
    check(Number.isFinite(v.pop) && v.pop >= 0, `${when}: ${v.name} people ${v.pop}`);
    if (v.status === "ruin") { check(v.pop === 0, `${when}: ruin ${v.name} still has people`); continue; }
    check(v.pop <= game.pop[v.cell] * 0.4 + 1e-6, `${when}: ${v.name} has more people (${v.pop}) than its land allows (${game.pop[v.cell]})`);
    check(game.owner[v.cell] >= 0, `${when}: living village ${v.name} on wild land`);
    check(!game.cities.some(c => Math.abs(E.cellX(c.cell) - E.cellX(v.cell)) <= 1 && Math.abs(E.cellY(c.cell) - E.cellY(v.cell)) <= 1), `${when}: ${v.name} stands inside a town`);
    check(Array.isArray(v.hist) && v.hist.length <= E.VIL.histMax && Array.isArray(v.log), `${when}: ${v.name} history broken`);
  }
  // every cell's people add up: village + hamlets + farms
  for (let i = 0; i < E.N_CELLS; i += 7) {
    if (!E.isLand(world, i)) continue;
    const s = E.cellSettlement(world, game, i);
    check(s.onFarms >= -1e-9 && Math.abs(s.inVillage + s.inHamlets + s.onFarms - s.P) < 1e-6 || s.onFarms === 0, `${when}: people of cell ${i} do not add up`);
    for (const h of s.hamlets) check(h.pop > 0 && Number.isFinite(h.x) && Math.floor(h.x) === E.cellX(i) && Math.floor(h.y) === E.cellY(i), `${when}: a hamlet of cell ${i} is outside it`);
  }
}

let failed = 0;
for (let wi = 0; wi < worlds; wi++) {
  const seed = 1000 + wi * 7919;
  const t0 = Date.now();
  try {
    const world = E.generateWorld(seed);
    const game = E.setupGame(world, sampleCells(world, seed), "Testland", seed);
    invariants(world, game, "at the founding");
    check(game.villages.length > 50, `only ${game.villages.length} villages at the founding`);
    const before = game.villages.length;
    for (let s = 0; s < seasons; s++) { E.runSeason(world, game, {}); invariants(world, game, `season ${game.turn}`); }
    const markets = game.villages.filter(v => v.kind === "market").length;

    // the same game gives the same villages (no randomness outside the seed)
    const twin = E.setupGame(world, sampleCells(world, seed), "Testland", seed);
    for (let s = 0; s < 3; s++) E.runSeason(world, twin, {});
    const again = E.setupGame(world, sampleCells(world, seed), "Testland", seed);
    for (let s = 0; s < 3; s++) E.runSeason(world, again, {});
    check(JSON.stringify(twin.villages) === JSON.stringify(again.villages), "the same game made different villages");

    // a site report everywhere on the player's land
    const own = [];
    for (let i = 0; i < E.N_CELLS; i++) if (game.owner[i] === E.PLAYER) own.push(i);
    for (const c of own.slice(0, 40)) {
      const r = E.siteReport(world, game, c, E.PLAYER);
      check(r.score >= 0 && r.score <= 100 && Array.isArray(r.lines) && r.lines.every(l => E.SITE_FEATURES[l.key] && typeof l.text === "string"), `site report of ${c} broken`);
    }

    // a boom: a new mine next to a village; then the mine is worked out: a bust, and people hold on in the town
    const far = x => game.cities.every(c => E.dist(c.cell, x.cell) >= 3);
    const v = game.villages.find(x => game.owner[x.cell] === E.PLAYER && x.status === "village" && x.kind === "farm" && far(x)) || game.villages.find(x => x.status === "village" && x.kind === "farm" && far(x)) || game.villages.find(x => x.status === "village");
    check(v, "no village to test a boom with");
    const x = E.cellX(v.cell), y = E.cellY(v.cell);
    const mcell = v.cell;   // the camp stands at the pit itself
    const site = { id: game.nextId++, cell: mcell, kind: "mine", level: 2, pace: "normal", paused: false, opened: game.turn, extracted: 0, name: "Test pit", lastWorkers: 0.1 };
    game.sites.push(site);
    world.depTotal[mcell] = Math.max(world.depTotal[mcell] || 0, 10); game.depLeft[mcell] = Math.max(game.depLeft[mcell] || 0, 10);
    E.runSeason(world, game, {});
    const vb = game.villages.find(z => z.id === v.id);
    check(vb && vb.kind === "mine" && vb.status === "boom" && vb.plan === "camp", `no boom at ${v.name}: ${vb && vb.kind}/${vb && vb.status}/${vb && vb.plan}`);
    const popBoom = vb.pop;
    for (let s = 0; s < 3; s++) { site.lastWorkers = 0.1; E.runSeason(world, game, {}); }
    const vb2 = game.villages.find(z => z.id === v.id);
    let ruinSeen = false, farmSeen = false, becameTown = false, popGrown = popBoom;
    if (!vb2) {
      // the boom camp grew big enough for its nation to grant it a town charter: a boomtown became a town
      becameTown = game.cities.some(c => c.name === v.name && c.fromVillage);
      check(becameTown, `${v.name} disappeared during its boom`);
    } else {
    popGrown = vb2.pop;
    check(popGrown > popBoom, `the boom camp did not grow (${popBoom} -> ${popGrown})`);
    site.exhausted = true; site.exhaustedAt = game.turn; game.depLeft[mcell] = 0;
    E.runSeason(world, game, {});
    const vx = game.villages.find(z => z.id === v.id);
    check(vx && (vx.status === "bust" || vx.status === "village" || vx.status === "ruin"), `no bust at ${v.name}: ${vx && vx.status}`);
    const town = E.nearestCity(game, mcell, game.owner[mcell]);
    if (town && E.dist(town.cell, mcell) <= 3) check(E.cityStay(game, town) > 0, `${town.name} did not hold on after its mine closed`);
    for (let s = 0; s < 30; s++) {
      E.runSeason(world, game, {});
      const z = game.villages.find(q => q.id === v.id);
      if (!z) break;
      if (z.status === "ruin") { ruinSeen = true; break; }
      if (z.status === "village" && z.kind !== "mine") { farmSeen = true; break; }
    }
    check(ruinSeen || farmSeen, `${v.name} neither emptied nor became a farm village after the bust`);
    }
    invariants(world, game, "after the bust");

    // ruins: a village whose land is abandoned is left in ruins; when people return, it is resettled
    const rv = game.villages.find(z => z.status === "village" && game.owner[z.cell] >= 0 && game.cities.every(c => E.dist(c.cell, z.cell) >= 2.5));
    let ruinsTested = false;
    if (rv) {
      const keep = game.owner[rv.cell];
      game.owner[rv.cell] = -1;
      E.runSeason(world, game, {});
      const r1 = game.villages.find(z => z.id === rv.id);
      check(r1 && r1.status === "ruin" && r1.pop === 0, `${rv.name} was not left in ruins (${r1 && r1.status})`);
      game.owner[rv.cell] = keep;
      let back = false;
      for (let s = 0; s < 12 && !back; s++) { E.runSeason(world, game, {}); const r2 = game.villages.find(z => z.id === rv.id); back = !!(r2 && r2.status !== "ruin"); }
      check(back || game.owner[rv.cell] !== keep, `${rv.name} was never resettled`);
      ruinsTested = true;
    }

    // a charter: a big village on a road, far from towns
    const M = E.villMeta(game);
    let cand = game.villages.filter(z => game.owner[z.cell] === E.PLAYER && z.status === "village" && game.cities.every(c => E.dist(c.cell, z.cell) >= 4));
    let charterTested = false;
    for (const cv of cand) {
      const cx = E.cellX(cv.cell), cy = E.cellY(cv.cell);
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => E.idx(cx + dx, cy + dy)).find(c => E.isLand(world, c));
      game.roads.add(E.edgeKey(cv.cell, nb));
      cv.pop = 0.02; game.pop[cv.cell] = Math.max(game.pop[cv.cell], 0.2); cv.charter = null;
      M.lastCharter[E.PLAYER] = -99;
      game.decisions = game.decisions.filter(d => d.key !== "townCharter");
      const chk = E.charterCheck(world, game, cv);
      if (!chk.ok) continue;
      {
        E.runSeason(world, game, {});
        const d = game.decisions.find(q => q.key === "townCharter");
        if (!d && !E.charterCheck(world, game, game.villages.find(z => z.id === cv.id) || cv).ok) continue;   // war or a new town got in the way this season
        check(d, `${cv.name} did not ask for a charter (turn ${game.turn})`);
        const asker = game.villages.find(z => z.id === d.villageId);
        check(asker && d.options.length >= 2 && d.body.includes(asker.name), "the charter question is malformed");
        const n0 = game.cities.length;
        game.nations[E.PLAYER].treasury += 50;
        E.decide(world, game, d, "a", false);
        const t = game.cities.find(c => c.name === asker.name);
        check(t && game.cities.length === n0 + 1 && !game.villages.some(z => z.id === asker.id), `${asker.name} did not become a town`);
        check(t.fromVillage && t.hist.length >= 2, "the new town does not remember its village");
        E.runSeason(world, game, {});
        invariants(world, game, "after the charter");
        charterTested = true;
      }
      break;
    }

    // what a government can do for its villages, and what happens to them
    const owner = E.PLAYER;
    const mineV = () => game.villages.filter(z => game.owner[z.cell] === owner && z.status !== "ruin");
    let works = 0;
    for (const z of mineV()) for (const key of E.VILLAGE_WORK_ORDER) {
      const ch = E.villageWorkCheck(world, game, owner, z, key);
      if (!ch.ok) continue;
      game.nations[owner].treasury += ch.cost + 1;
      const r = E.orderVillageWork(world, game, owner, z.id, key);
      check(r.ok && z.works && z.works[key] === game.turn, `${key} for ${z.name} did not happen (${r.reason})`);
      works++;
      if (works >= 3) break;
    }
    const events = [];
    for (const key of Object.keys(E.VILLAGE_DECISIONS)) {
      const c = E.decisionCtx(world, game, owner, E.mulberry32(seed + key.length));
      const f = E.DECISIONS[key].find(c);
      if (!f) continue;
      const d = E.makeDecision(c, key, f);
      check(d && d.options.length >= 2 && d.villageId, `${key}: no proper question`);
      for (const o of d.options) for (const e of o.effects) check(typeof E.effectText(game, e, owner).text === "string", `${key}: an effect has no words`);
      game.nations[owner].treasury += 5;
      E.decide(world, game, d, d.options[0].id, false);
      events.push(key);
    }
    E.runSeason(world, game, {});
    invariants(world, game, "after works and events");
    check(Array.isArray(E.villageFileLines(world, game, owner)), "the minister knows nothing of the villages");
    // the village ambitions: offered when they fit, and their progress reads
    for (const key of ["charter", "countryside"]) {
      const ac = E.ambCtx(world, game), A = E.AMBITIONS[key], o = A.offer(ac);
      if (!o) continue;
      const amb = { key, ...o };
      const pr = A.progress(ac, amb);
      check(typeof A.title(amb, game) === "string" && typeof A.why(amb, game) === "string" && Number.isFinite(pr.frac) && typeof pr.text === "string", `the ${key} ambition is broken`);
    }

    // an old save: villages from version 38 (no ids, looks, stories), no village book, towns without sites
    const old = JSON.parse(JSON.stringify(game));
    for (const k of ["prov", "irrigated", "owner", "pop", "forest", "fish", "depLeft", "occ", "cleared"]) if (game[k] && game[k].constructor !== Array) old[k] = game[k].slice ? game[k].slice() : game[k];
    old.roads = new Set(game.roads); old.usedNames = new Set(game.usedNames || []);
    delete old.villMeta;
    old.villages = old.villages.filter(z => z.status !== "ruin").map(z => ({ cell: z.cell, name: z.name, kind: z.kind === "market" ? "farm" : z.kind, born: z.born, pop: z.pop }));
    for (const c of old.cities) { delete c.siteGrow; delete c.siteDef; }
    E.ensureProvinces(world, old);
    check(old.villages.every(z => z.id > 0 && z.plan && z.status && Array.isArray(z.hist) && z.log.length), "an old save's villages were not filled in");
    E.runSeason(world, old, {});
    invariants(world, old, "old save, one season on");

    const saved = JSON.stringify(game);
    check(!saved.includes('"_vroad"') && !saved.includes('"_vctx"'), "working copies leaked into the save");
    console.log(`world ${seed}: ok · villages ${before} → ${game.villages.filter(z => z.status !== "ruin").length} (${game.villages.filter(z => z.status === "ruin").length} ruins) · markets ${markets} · `
      + `boom ${v.name} ${Math.round(popBoom * 1e6)} → ${Math.round(popGrown * 1e6)} then ${becameTown ? "a town (charter)" : ruinSeen ? "ruins" : "a farm village"} · ruins ${ruinsTested ? "and resettling" : "not testable"} · charter ${charterTested ? "granted" : "not testable here"} · works ${works} · events ${events.length ? events.join(", ") : "none fitted"} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    failed++;
    console.error(`world ${seed}: FAILED\n${e.stack}`);
  }
}
process.exit(failed ? 1 : 0);
