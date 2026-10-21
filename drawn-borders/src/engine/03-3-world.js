/* =====================================================================
   3. World: terrain from continuous noise, so coasts can be painted smoothly
   ===================================================================== */
function idx(x, y) { return y * GRID_W + x; }
function cellX(i) { return i % GRID_W; }
function cellY(i) { return (i / GRID_W) | 0; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H; }
function dist(a, b) { return Math.hypot(cellX(a) - cellX(b), cellY(a) - cellY(b)); }

function elevationAt(seed, x, y) {
  const nx = (x / GRID_W) * 2 - 1, ny = (y / GRID_H) * 2 - 1;
  const radial = Math.sqrt(nx * nx * 0.85 + ny * ny);
  const edge = Math.max(Math.abs(nx), Math.abs(ny));
  const edgeFall = edge > 0.88 ? (edge - 0.88) * 6 : 0;
  return fbm(x / 13, y / 13, seed) - 0.6 * Math.pow(radial, 2.4) - edgeFall;
}
function moistureAt(seed, x, y) { return fbm(x / 8, y / 8, seed + 977, 3); }

function percentile(values, p) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[Math.floor(p * (sorted.length - 1))];
}

function classify(w, e, m) {
  if (e <= w.seaLevel) return T.SEA;
  if (e >= w.mountainLevel) return T.MOUNTAIN;
  if (e >= w.hillLevel) return T.HILLS;
  return m > w.moistLevel ? T.FOREST : T.PLAINS;
}

function generateWorld(seed) {
  const elev = new Float32Array(N_CELLS);
  for (let i = 0; i < N_CELLS; i++) elev[i] = elevationAt(seed, cellX(i) + 0.5, cellY(i) + 0.5);
  const seaLevel = percentile(elev, 0.42);
  const landElev = Array.from(elev).filter(e => e > seaLevel);
  const w = {
    seed, seaLevel,
    hillLevel: percentile(landElev, 0.79),
    mountainLevel: percentile(landElev, 0.93),
    moistLevel: 0.53,
    terrain: new Uint8Array(N_CELLS),
    coastal: new Uint8Array(N_CELLS),
    landCount: 0,
  };
  for (let i = 0; i < N_CELLS; i++) {
    const x = cellX(i), y = cellY(i);
    const edge = x < 1 || y < 1 || x >= GRID_W - 1 || y >= GRID_H - 1;
    w.terrain[i] = edge ? T.SEA : classify(w, elev[i], moistureAt(seed, x + 0.5, y + 0.5));
    if (w.terrain[i] !== T.SEA) w.landCount++;
  }
  placeDeposits(w);
  for (let i = 0; i < N_CELLS; i++) {
    if (w.terrain[i] === T.SEA) continue;
    w.coastal[i] = DIRS4.some(([dx, dy]) => isSeaXY(w, cellX(i) + dx, cellY(i) + dy)) ? 1 : 0;
  }
  return w;
}
function isSeaXY(w, x, y) { return !inBounds(x, y) || w.terrain[idx(x, y)] === T.SEA; }
function isLand(w, i) { return w.terrain[i] !== T.SEA; }

function cellFood(w, g, i) {
  const t = w.terrain[i];
  if (t === T.SEA) return 0;
  let f = TERRAIN[t].food;
  if (t === T.PLAINS && g.irrigated && g.irrigated[i]) f *= 1 + ECON.irrigationBoost;
  if (w.coastal[i]) f += ECON.coastalFood;
  return f;
}
function cellDensity(w, i) {
  const t = w.terrain[i];
  return t === T.SEA ? 0 : TERRAIN[t].density + (w.coastal[i] ? 0.04 : 0);
}

