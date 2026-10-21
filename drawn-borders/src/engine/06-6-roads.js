/* =====================================================================
   6. Roads: pathfinding and networks
   ===================================================================== */
function pathEdges(path) {
  const edges = [];
  for (let k = 1; k < path.length; k++) edges.push(edgeKey(path[k - 1], path[k]));
  return edges;
}

/* Cheapest route through a nation's own land. Existing roads are nearly free to reuse. */
function findRoadPath(w, g, nid, from, to, allowed) {
  const ok = allowed || new Set([nid]);
  const cost = new Float32Array(N_CELLS).fill(Infinity);
  const prev = new Int32Array(N_CELLS).fill(-1);
  const done = new Uint8Array(N_CELLS);
  cost[from] = 0;
  const open = [from];
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (cost[open[k]] < cost[open[bi]]) bi = k;
    const c = open.splice(bi, 1)[0];
    if (done[c]) continue;
    done[c] = 1;
    if (c === to) break;
    for (const [dx, dy] of DIRS8) {
      const x = cellX(c) + dx, y = cellY(c) + dy;
      if (!inBounds(x, y)) continue;
      const k = idx(x, y);
      if (done[k] || !isLand(w, k) || !ok.has(g.owner[k]) || (g.occ && g.occ[k] >= 0)) continue;
      const diag = dx !== 0 && dy !== 0;
      if (diag && (!isLand(w, idx(cellX(c) + dx, cellY(c))) || !isLand(w, idx(cellX(c), cellY(c) + dy)))) continue;
      const step = g.roads.has(edgeKey(c, k)) ? 0.05
        : ((TERRAIN[w.terrain[c]].roadCost + TERRAIN[w.terrain[k]].roadCost) / 2) * (diag ? 1.414 : 1);
      if (cost[c] + step < cost[k]) { cost[k] = cost[c] + step; prev[k] = c; open.push(k); }
    }
  }
  if (cost[to] === Infinity) return null;
  const path = [];
  for (let c = to; c !== -1; c = prev[c]) path.push(c);
  return path.reverse();
}

function roadQuote(w, g, path) {
  const edges = pathEdges(path).filter(e => !g.roads.has(e));
  let units = 0;
  for (const e of edges) {
    const [a, b] = edgeEnds(e);
    const diag = cellX(a) !== cellX(b) && cellY(a) !== cellY(b);
    units += ((TERRAIN[w.terrain[a]].roadCost + TERRAIN[w.terrain[b]].roadCost) / 2) * (diag ? 1.414 : 1);
  }
  return {
    newEdges: edges,
    cost: units * BUILD.roadUnitB,
    seasons: Math.max(1, Math.ceil(edges.length / BUILD.roadEdgesPerSeason)),
  };
}

/* Which cities can reach each other by road (only through the nation's own land). */
function cityNetworks(g, nid, cities) {
  const adj = new Map();
  for (const k of g.roads) {
    const [a, b] = edgeEnds(k);
    if (g.owner[a] !== nid || g.owner[b] !== nid || (g.occ && (g.occ[a] >= 0 || g.occ[b] >= 0))) continue;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  }
  const cityAt = new Map(cities.map((c, k) => [c.cell, k]));
  const netOf = new Array(cities.length).fill(-1);
  let nets = 0;
  cities.forEach((city, k) => {
    if (netOf[k] !== -1) return;
    const id = nets++;
    const seen = new Set([city.cell]);
    const queue = [city.cell];
    netOf[k] = id;
    while (queue.length) {
      const c = queue.pop();
      for (const n of adj.get(c) || []) {
        if (seen.has(n)) continue;
        seen.add(n); queue.push(n);
        if (cityAt.has(n)) netOf[cityAt.get(n)] = id;
      }
    }
  });
  return { netOf, count: nets };
}

