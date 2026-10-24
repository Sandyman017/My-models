/* Draws every kind of road with the game's own road painter (ui/36c), from close up to far out, on a small test
   page, and saves tests/out/road-looks.png. The full map takes minutes a frame on a machine without a graphics
   card; this takes seconds, so the roads can be checked anywhere.
   The scene: four roads side by side 200 m apart (dirt track, gravel road, asphalt road, motorway), a river
   crossing them, and below them a mountain road. Each panel is the same scene at another scale.
   node tests/road-looks.js
   Needs Playwright (npm i --no-save playwright). */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const { chromium } = require("playwright");
const SRC = path.join(__dirname, "..", "src");

// the painter's own pieces: the game's noise functions and the road painter, and its packing of the textures
const big = fs.readFileSync(path.join(SRC, "ui/36-14d-the-map-drawn-by-the-graphics-card.js"), "utf8");
const full = big.slice(big.indexOf("function glShaderSource() {"));
const noise = full.slice(full.indexOf("float hash2(int ix"), full.indexOf("// the game's continent"));
const ctx = vm.createContext({ Math, Float32Array, Array, GRID_W: 96, GRID_H: 64, N_CELLS: 96 * 64 });
vm.runInContext(fs.readFileSync(path.join(SRC, "ui/36c-14f-roads-on-the-map.js"), "utf8") + "\n;globalThis.G = roadGlsl(); globalThis.pack = roadTextures;", ctx);

const M = 1 / 50000, Y0 = 20.5, RIVER_X = 21.0;
const chains = [];
// four roads side by side, a gentle long bend in each
for (let g = 0; g < 4; g++) {
  const pts = [];
  for (let x = 18.5; x <= 23.5001; x += 0.16) pts.push([x, Y0 + g * 200 * M + 0.004 * Math.sin((x - 18.5) * 1.3)]);
  chains.push({ pts, grade: g, hill: pts.map(() => 0.1 * g), yellow: g === 2 ? 0 : 0, seed: 11 + g });
}
// a second asphalt road with a double yellow centre line
{ const pts = []; for (let x = 18.5; x <= 23.5001; x += 0.16) pts.push([x, Y0 + 900 * M]); chains.push({ pts, grade: 2, hill: pts.map(() => 0), yellow: 1, seed: 31 }); }
// a mountain road
{ const pts = []; for (let x = 18.5; x <= 23.5001; x += 0.16) pts.push([x, Y0 + 3000 * M]); chains.push({ pts, grade: 2, hill: pts.map(() => 1), yellow: 0, seed: 47 }); }
// a junction: a gravel road running into the motorway from the south
{ const pts = []; for (let y = Y0 + 2000 * M; y >= Y0 + 600 * M - 1e-9; y -= 0.007) pts.push([RIVER_X + 900 * M, y]); chains.push({ pts, grade: 1, hill: pts.map(() => 0), yellow: 0, seed: 53 }); }
const X = ctx.pack(chains);

const COLS = 4, ROWS = 2, PW = 420, PH = 300;
const mid = Y0 + 450 * M;
const panels = [
  { name: "1 m a pixel (closer than the game goes)", mpp: 1.0, cx: RIVER_X + 120 * M, cy: Y0 + 300 * M },
  { name: "3.3 m a pixel (the game's closest)", mpp: 3.3, cx: RIVER_X + 300 * M, cy: mid },
  { name: "10 m a pixel", mpp: 10, cx: RIVER_X + 600 * M, cy: mid + 400 * M },
  { name: "40 m a pixel", mpp: 40, cx: RIVER_X, cy: mid + 1000 * M },
  { name: "a climb on a mountain road, 5 m a pixel", mpp: 5, cx: RIVER_X + 7300 * M, cy: Y0 + 3000 * M },
  { name: "mountain road, 30 m a pixel", mpp: 30, cx: RIVER_X, cy: Y0 + 3000 * M },
  { name: "150 m a pixel", mpp: 150, cx: RIVER_X, cy: mid },
  { name: "1.5 km a pixel (far out)", mpp: 1500, cx: RIVER_X, cy: mid },
];
const frag = `#version 300 es
precision highp float; precision highp int;
uniform float uM[8]; uniform vec2 uC[8]; uniform int uOne;
out vec4 outColor;
${noise}
const float M = 1.0 / 50000.0;
${ctx.G}
void main() {
  vec2 px = vec2(gl_FragCoord.x, ${ROWS * PH}.0 - gl_FragCoord.y);
  int c = int(px.x / ${PW}.0), r = int(px.y / ${PH}.0), k = r * ${COLS} + c;
  float pxm = uM[k] * M;
  vec2 p = uC[k] + (px - vec2(float(c) * ${PW}.0 + ${PW / 2}.0, float(r) * ${PH}.0 + ${PH / 2}.0)) * pxm;
  vec2 q = p / M;
  vec3 col = mix(vec3(0.37, 0.45, 0.27), vec3(0.45, 0.50, 0.30), vnoise(q / 90.0, 5)) * (0.95 + 0.1 * vnoise(q / 7.0, 6));
  float water = 1.0 - sstep(28.0 - 0.5 * uM[k], 28.0 + 0.5 * uM[k], abs(p.x - ${RIVER_X.toFixed(4)}) / M);
  col = mix(col, vec3(0.13, 0.22, 0.24), water);
  vec4 rd = roadAt(p, pxm, water);
  col = mix(col, rd.rgb, rd.a);
  if (min(mod(px.x, ${PW}.0), mod(px.y, ${PH}.0)) < 2.0) col = vec3(0.1);
  outColor = vec4(col, 1.0);
}`;
const tex = (unit, w, h, internal, format, arr) => `{ const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + ${unit}); gl.bindTexture(gl.TEXTURE_2D, t);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.${internal}, ${w}, ${h}, 0, gl.${format}, gl.FLOAT, new Float32Array(${arr})); }`;
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111;font:13px sans-serif;color:#fff">
<div style="position:relative;width:${COLS * PW}px;height:${ROWS * PH}px"><canvas id="c" width="${COLS * PW}" height="${ROWS * PH}"></canvas>
${panels.map((p, k) => `<div style="position:absolute;left:${(k % COLS) * PW + 8}px;top:${Math.floor(k / COLS) * PH + 6}px;text-shadow:0 0 3px #000">${p.name}</div>`).join("")}</div>
<script>
const gl = document.getElementById("c").getContext("webgl2", { preserveDrawingBuffer: true });
const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { document.title = "ERR " + gl.getShaderInfoLog(o); throw new Error("compile"); } return o; };
const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, "#version 300 es\\nin vec2 a; void main(){ gl_Position = vec4(a,0.0,1.0); }")); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, ${JSON.stringify(frag)})); gl.linkProgram(pr); gl.useProgram(pr);
const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
const l = gl.getAttribLocation(pr, "a"); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
${tex(0, X.vtW, X.vtH, "RGBA32F", "RGBA", JSON.stringify(Array.from(X.V)))}
${tex(1, 96, 64, "RGBA32F", "RGBA", JSON.stringify(Array.from(X.cells)))}
${tex(2, X.lW, X.lH, "R32F", "RED", JSON.stringify(Array.from(X.L)))}
gl.uniform1i(gl.getUniformLocation(pr, "uRoadV"), 0); gl.uniform1i(gl.getUniformLocation(pr, "uRoadCell"), 1); gl.uniform1i(gl.getUniformLocation(pr, "uRoadList"), 2);
gl.uniform1i(gl.getUniformLocation(pr, "uRoadOn"), 1); gl.uniform1i(gl.getUniformLocation(pr, "uOne"), 1);
const P = ${JSON.stringify(panels)};
gl.uniform1fv(gl.getUniformLocation(pr, "uM"), P.map(p => p.mpp)); gl.uniform2fv(gl.getUniformLocation(pr, "uC"), P.flatMap(p => [p.cx, p.cy]));
gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.finish(); document.title = "DONE";
</script>`;
(async () => {
  const out = path.join(__dirname, "out");
  fs.mkdirSync(out, { recursive: true });
  const page_ = path.join(out, "road-looks.html");
  fs.writeFileSync(page_, html);
  const opts = { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] };
  const browser = await chromium.launch(opts).catch(e => {
    if (fs.existsSync("/opt/pw-browsers/chromium")) return chromium.launch({ ...opts, executablePath: "/opt/pw-browsers/chromium" });
    throw e;
  });
  const page = await browser.newPage({ viewport: { width: COLS * PW, height: ROWS * PH } });
  await page.goto("file://" + page_);
  let t = "";
  for (let k = 0; k < 120 && !/^(DONE|ERR)/.test(t); k++) { t = await page.title(); if (!/^(DONE|ERR)/.test(t)) await page.waitForTimeout(500); }
  await page.screenshot({ path: path.join(out, "road-looks.png") });
  await browser.close();
  if (!t.startsWith("DONE")) { console.error("road painter failed: " + t.slice(0, 600)); process.exit(1); }
  console.log("road looks drawn: tests/out/road-looks.png");
})();
