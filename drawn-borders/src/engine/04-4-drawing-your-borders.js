/* =====================================================================
   4. Drawing your borders
   ===================================================================== */
function pointInPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function landCellsInsidePath(w, pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(GRID_W - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(GRID_H - 1, Math.ceil(Math.max(...ys)));
  const cells = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(x, y);
    if (isLand(w, i) && pointInPolygon(x + 0.5, y + 0.5, pts)) cells.push(i);
  }
  return cells;
}
function largestConnectedGroup(cells) {
  const set = new Set(cells), seen = new Set();
  let best = [];
  for (const start of cells) {
    if (seen.has(start)) continue;
    const group = [], queue = [start];
    seen.add(start);
    while (queue.length) {
      const c = queue.pop();
      group.push(c);
      for (const [dx, dy] of DIRS4) {
        const nx = cellX(c) + dx, ny = cellY(c) + dy;
        if (!inBounds(nx, ny)) continue;
        const k = idx(nx, ny);
        if (set.has(k) && !seen.has(k)) { seen.add(k); queue.push(k); }
      }
    }
    if (group.length > best.length) best = group;
  }
  return best;
}
function maxCells(w) { return Math.floor(w.landCount * LIMITS.maxLandShare); }
function claimFromPath(w, pts) {
  if (pts.length < 6) return { ok: false, error: "Draw a larger loop: press, drag around an area, and release." };
  const inside = landCellsInsidePath(w, pts);
  if (!inside.length) return { ok: false, error: "Your borders contain no land. Draw over the continent, not the sea." };
  const main = largestConnectedGroup(inside);
  if (main.length < LIMITS.minCells) return { ok: false, error: `Too small: ${fmtArea(main.length)}. A nation needs at least ${fmtArea(LIMITS.minCells)}.` };
  if (main.length > maxCells(w)) return { ok: false, error: `Too large: ${fmtArea(main.length)}. Leave room for two rivals and wild land. The limit here is ${fmtArea(maxCells(w))}.` };
  return { ok: true, cells: main.sort((a, b) => a - b), droppedCells: inside.length - main.length };
}

/* Shape → stability and defense. Used at founding and kept as the nation's base. */
function measureShape(w, cells) {
  const set = new Set(cells);
  let coast = 0, landBorder = 0, borderCells = 0, ruggedBorderCells = 0;
  for (const c of cells) {
    let onBorder = false;
    for (const [dx, dy] of DIRS4) {
      const nx = cellX(c) + dx, ny = cellY(c) + dy;
      if (isSeaXY(w, nx, ny)) coast++;
      else if (!set.has(idx(nx, ny))) { landBorder++; onBorder = true; }
    }
    if (onBorder) { borderCells++; if (w.terrain[c] >= T.HILLS) ruggedBorderCells++; }
  }
  const area = cells.length, perimeter = coast + landBorder;
  return {
    area, coast, landBorder,
    compactness: Math.min(1, (16 * area) / (perimeter * perimeter)),
    ruggedBorderShare: borderCells ? ruggedBorderCells / borderCells : 0,
    exposure: landBorder / (4 * Math.sqrt(area)),
  };
}
function shapeTraits(w, cells) {
  const s = measureShape(w, cells);
  const shapeTerm = Math.round((s.compactness - FOUNDING.compactRef) * FOUNDING.compactWeight);
  const sizeTerm = -Math.round(Math.max(0, s.area - FOUNDING.sizeThreshold) / FOUNDING.sizePerPoint);
  const ruggedTerm = Math.round(FOUNDING.ruggedWeight * s.ruggedBorderShare);
  const exposureTerm = Math.round(-FOUNDING.exposureWeight * (s.exposure - 0.5));
  return {
    shape: s, shapeTerm, sizeTerm, ruggedTerm, exposureTerm,
    base: FOUNDING.stabilityBase + shapeTerm,
    stability: clamp(FOUNDING.stabilityBase + shapeTerm + sizeTerm, 10, 95),
    defense: clamp(FOUNDING.defenseBase + ruggedTerm + exposureTerm, 5, 95),
  };
}

