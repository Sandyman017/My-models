/* Draws every village look side by side with the game's own village painter (ui/36b), on a small test page, and
   saves tests/out/village-looks.png. The full map takes minutes a frame on a machine without a graphics card; this
   takes seconds, so the looks can be checked anywhere.
   node tests/village-looks.js [people, default 4000] [metres a pixel, default: each village fits its panel]
   Needs Playwright (npm i --no-save playwright). */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const { chromium } = require("playwright");
const SRC = path.join(__dirname, "..", "src");
const pop = Number(process.argv[2] || 4000) / 1e6, fixedMpp = process.argv[3] ? Number(process.argv[3]) : null;

// the painter's own pieces: the game's noise functions and the village painter
const big = fs.readFileSync(path.join(SRC, "ui/36-14d-the-map-drawn-by-the-graphics-card.js"), "utf8");
const full = big.slice(big.indexOf("function glShaderSource() {"));
const noise = full.slice(full.indexOf("float hash2(int ix"), full.indexOf("// the game's continent"));
const seg = full.match(/float segDist\(vec2 p, vec2 a, vec2 b\)[^\n]*/)[0];
const ctx = vm.createContext({ Math, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), VIL: { grid: 0.12 } });
vm.runInContext(fs.readFileSync(path.join(SRC, "ui/36b-14e-villages-on-the-map.js"), "utf8") + "\n;globalThis.G = villageGlsl(); globalThis.VR = villageRadius;", ctx);

const plans = ["cluster", "grove", "line", "compound", "hill", "harbor", "camp", "market", "scatter", "modern"];
const panels = plans.map((p, k) => ({ name: p, plan: k, ruin: 0, look: p, pop: p === "scatter" ? pop * 0.5 : p === "camp" ? pop * 1.5 : pop }))
  .concat([{ name: "ruins", plan: 0, ruin: 1, look: "cluster", pop: pop * 0.7 }, { name: "hamlet", plan: 0, ruin: 0, look: "cluster", pop: 0.0012 }]);
const COLS = 4, ROWS = 3, PW = 360, PH = 300;
for (const p of panels) {
  p.R = ctx.VR(p.pop, p.look) * 50000;
  p.mpp = fixedMpp || Math.max(0.9, (["line", "harbor"].includes(p.name) ? 2.1 : p.name === "modern" ? 1.45 : 1.2) * p.R / (PH * 0.45));
}
const frag = `#version 300 es
precision highp float; precision highp int;
uniform int uSeed; uniform highp sampler2D uVillages; uniform highp sampler2D uVillInfo; uniform ivec2 uVGrid;
uniform float uR[12]; uniform float uM[12]; uniform int uP[12]; uniform int uRu[12];
out vec4 outColor;
${noise}
${seg}
const float VG = 0.12;
${ctx.G}
void main() {
  vec2 px = vec2(gl_FragCoord.x, ${ROWS * PH}.0 - gl_FragCoord.y);
  int c = int(px.x / ${PW}.0), r = int(px.y / ${PH}.0), k = r * ${COLS} + c;
  vec2 q = (px - vec2(float(c) * ${PW}.0 + ${PW / 2}.0, float(r) * ${PH}.0 + ${PH / 2}.0 + 10.0)) * uM[k];
  vec3 col = mix(vec3(0.37, 0.45, 0.27), vec3(0.45, 0.50, 0.30), vnoise(q / 90.0, 5)) * (0.95 + 0.1 * vnoise(q / 7.0, 6));
  if (uP[k] == 3) col = mix(vec3(0.70, 0.64, 0.52), vec3(0.62, 0.58, 0.46), vnoise(q / 120.0, 7));
  vec4 v = villagePlan(uP[k], uRu[k] == 1, q, uR[k], 1234 + k * 977, uM[k]);
  col = mix(col, v.rgb, v.a);
  if (min(mod(px.x, ${PW}.0), mod(px.y, ${PH}.0)) < 2.0) col = vec3(0.1);
  outColor = vec4(col, 1.0);
}`;
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111;font:13px sans-serif;color:#fff">
<div style="position:relative;width:${COLS * PW}px;height:${ROWS * PH}px"><canvas id="c" width="${COLS * PW}" height="${ROWS * PH}"></canvas>
${panels.map((p, k) => `<div style="position:absolute;left:${(k % COLS) * PW + 8}px;top:${Math.floor(k / COLS) * PH + 6}px;text-shadow:0 0 3px #000">${p.name} · ${Math.round(p.pop * 1e6)} people · ${Math.round(p.R)} m · ${p.mpp.toFixed(1)} m/px</div>`).join("")}</div>
<script>
const gl = document.getElementById("c").getContext("webgl2", { preserveDrawingBuffer: true });
const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { document.title = "ERR " + gl.getShaderInfoLog(o); throw new Error("compile"); } return o; };
const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, "#version 300 es\\nin vec2 a; void main(){ gl_Position = vec4(a,0.0,1.0); }")); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, ${JSON.stringify(frag)})); gl.linkProgram(pr); gl.useProgram(pr);
const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
const l = gl.getAttribLocation(pr, "a"); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
const P = ${JSON.stringify(panels)};
gl.uniform1fv(gl.getUniformLocation(pr, "uR"), P.map(p => p.R)); gl.uniform1fv(gl.getUniformLocation(pr, "uM"), P.map(p => p.mpp));
gl.uniform1iv(gl.getUniformLocation(pr, "uP"), P.map(p => p.plan)); gl.uniform1iv(gl.getUniformLocation(pr, "uRu"), P.map(p => p.ruin));
gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.finish(); document.title = "DONE";
</script>`;
(async () => {
  const out = path.join(__dirname, "out");
  fs.mkdirSync(out, { recursive: true });
  const page_ = path.join(out, "village-looks.html");
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
  await page.screenshot({ path: path.join(out, "village-looks.png") });
  await browser.close();
  if (!t.startsWith("DONE")) { console.error("village painter failed: " + t.slice(0, 600)); process.exit(1); }
  console.log("village looks drawn: tests/out/village-looks.png");
})();
