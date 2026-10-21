/* =====================================================================
   15. Founding preview (same economy rules as the game itself)
   ===================================================================== */
function foundingPreview(cells) {
  const g = emptyGame(world);
  settleCells(world, g, PLAYER, cells);
  const traits = shapeTraits(world, cells);
  g.nations.push(makeNation(PLAYER, "preview", null, traits, true));
  placeTowns(world, g, PLAYER, cells, mulberry32(7));
  const econ = computeEconomy(world, g, PLAYER);
  let materials = 0, coastalCells = 0, oceanCells = 0;
  const counts = { [T.PLAINS]: 0, [T.FOREST]: 0, [T.HILLS]: 0, [T.MOUNTAIN]: 0 };
  const deposits = { 1: 0, 2: 0, 3: 0, 4: 0 };
  cells.forEach(c => { materials += TERRAIN[world.terrain[c]].materials; if (world.coastal[c]) coastalCells++; if (beachSeaCell(world, c) >= 0) oceanCells++; counts[world.terrain[c]]++; if (world.dep[c]) deposits[world.dep[c]]++; });
  return { traits, econ, materials, coastalCells, oceanCells, counts, deposits, area: cells.length, towns: g.cities.map(c => c.cell) };
}

function foundingFactors(p) {
  const f = [];
  const room = p.econ.food / p.econ.pop - 1;
  f.push({ text: `Farmland can feed ${p.econ.food.toFixed(1)}M; ${p.econ.pop.toFixed(1)}M live here now`, effect: room > 0 ? `room to grow ${pct(room)}` : "already crowded", tone: room > 0.2 ? "good" : "bad" });
  const dep = p.deposits;
  const found = [[1, "metal ore"], [2, "coal"], [3, "oil and gas"], [4, "gold"]].filter(([k]) => dep[k]).map(([k, l]) => `${dep[k]} ${l}`);
  f.push({ text: found.length ? `Deposits: ${found.join(", ")}` : "No mineral, coal or oil deposits", effect: dep[1] && (dep[2] || dep[3]) ? "can build heavy industry" : dep[2] || dep[3] ? "has fuel for power" : "must import", tone: dep[1] && (dep[2] || dep[3]) ? "good" : dep[2] || dep[3] ? "neutral" : "bad" });
  f.push({ text: p.counts[T.FOREST] ? `${p.counts[T.FOREST]} forest cells for timber` : "No forest for timber", effect: p.counts[T.FOREST] >= 6 ? "logging" : "little timber", tone: p.counts[T.FOREST] >= 6 ? "good" : "bad" });
  if (p.oceanCells) f.push({ text: `${p.oceanCells} cells on the open sea: harbors, sea trade, fishing and a navy`, effect: "can reach the world by sea", tone: "good" });
  else if (p.coastalCells) f.push({ text: "Coast only on a lake: fishing, but ships from the sea can't reach it", effect: "no sea harbor", tone: "bad" });
  else f.push({ text: "Landlocked: no fishing, harbors or ships", effect: "no sea trade", tone: "bad" });
  const t = p.traits;
  f.push({ text: t.shapeTerm >= 0 ? "Compact shape is easy to govern" : "Stretched shape is hard to govern", effect: `${signed(t.shapeTerm)} stability`, tone: toneOf(t.shapeTerm) });
  if (t.sizeTerm < 0) f.push({ text: "Large territory strains your administration", effect: `${signed(t.sizeTerm)} stability`, tone: "bad" });
  if (t.ruggedTerm > 0) f.push({ text: "Hills and mountains guard your border", effect: `${signed(t.ruggedTerm)} defense`, tone: "good" });
  f.push({ text: t.shape.landBorder === 0 ? "An island: no land border" : t.exposureTerm < 0 ? "Long land border to defend" : "Short land border", effect: `${signed(t.exposureTerm)} defense`, tone: toneOf(t.exposureTerm) });
  return f;
}

