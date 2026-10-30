/* The same-results check, Node's side (see check.js), and the comparison with Unity's side.
   node Tools/js-engine/node-check.js [out.txt]                 plays the check's worlds in Node, prints and writes the summary
   node Tools/js-engine/node-check.js --compare a.txt b.txt     compares two summaries (lines starting with # are only shown)
   Node runs the very file Unity runs (engine-bundle.txt) as a plain script, as a browser page does. (In a separate context made
   with vm.createContext, as the engine tests do, every call of an engine function is slow: a season takes about 5 times as long.) */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { bundleSource, OUT: BUNDLE } = require("./bundle.js");

function readSummary(file) {
  const lines = fs.readFileSync(file, "utf8").replace(/\r/g, "").split("\n").filter(l => l !== "");
  return { body: lines.filter(l => !l.startsWith("#")), notes: lines.filter(l => l.startsWith("#")) };
}

// Season times from the "# time" lines: { seed: [ms, ...] }
function seasonTimes(notes) {
  const out = {};
  for (const l of notes) {
    const m = /^# time world (\d+): start ([\d.]+) ms · seasons ([\d. ]+) ms/.exec(l);
    if (m) out[m[1]] = { start: Number(m[2]), seasons: m[3].trim().split(/\s+/).map(Number) };
  }
  return out;
}

function compare(fileA, fileB) {
  const A = readSummary(fileA), B = readSummary(fileB);
  for (const l of A.notes.filter(l => !l.startsWith("# time"))) console.log(`${path.basename(fileA)} ${l}`);
  for (const l of B.notes.filter(l => !l.startsWith("# time"))) console.log(`${path.basename(fileB)} ${l}`);
  let diffs = 0;
  for (let i = 0; i < Math.max(A.body.length, B.body.length); i++) {
    if (A.body[i] === B.body[i]) continue;
    if (++diffs <= 5) console.log(`DIFFERENT at line ${i + 1}:\n  ${path.basename(fileA)}: ${A.body[i] ?? "(nothing)"}\n  ${path.basename(fileB)}: ${B.body[i] ?? "(nothing)"}`);
  }
  const ta = seasonTimes(A.notes), tb = seasonTimes(B.notes);
  const avg = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
  console.log(`\nseason time (average of each world's seasons, then the first season alone)      ${path.basename(fileA)}   vs   ${path.basename(fileB)}`);
  for (const seed of Object.keys(ta)) {
    if (!tb[seed]) continue;
    console.log(`  world ${seed}: ${avg(ta[seed].seasons).toFixed(0)} ms vs ${avg(tb[seed].seasons).toFixed(0)} ms · first season ${ta[seed].seasons[0].toFixed(0)} vs ${tb[seed].seasons[0].toFixed(0)} ms · world and setup ${ta[seed].start.toFixed(0)} vs ${tb[seed].start.toFixed(0)} ms`);
  }
  if (diffs) { console.log(`\n${diffs} line(s) differ: NOT the same`); return 1; }
  console.log(`\nALL THE SAME (${A.body.length} lines)`);
  return 0;
}

// The polyfill's number stand-in must write numbers exactly as the real toLocaleString("en-US") does.
function polyfillSelfTest() {
  const ctx = vm.createContext({ __forcePolyfill: { toLocaleString: true, structuredClone: true } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "polyfill.js"), "utf8"), ctx, { filename: "polyfill.js" });
  const values = [0, -0, 1, -1, 0.5, 1.0005, 2.0005, 0.0005, -0.0004, 999.9995, 999999.9995, 1234567.8915, 1e21, 1.5e22, 1e-7, -1e-7, 123.456789, 0.1 + 0.2];
  let x = 12345;
  const rnd = () => (x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let i = 0; i < 20000; i++) {
    const mag = Math.pow(10, Math.floor(rnd() * 14) - 4), v = (rnd() - 0.3) * mag;
    values.push(v, Math.round(v), Math.round(v * 2) / 2, Math.round(v * 2000) / 2000, Math.round(v * 20000 + 0.5) / 20000);
  }
  const bad = values.filter(v => ctx.__enUS(v) !== v.toLocaleString("en-US"));
  if (bad.length) throw new Error(`the polyfill writes ${bad.length} numbers differently, e.g. ${bad.slice(0, 3).map(v => `${v}: ${ctx.__enUS(v)} vs ${v.toLocaleString("en-US")}`).join("; ")}`);
  const cloned = vm.runInContext(`(() => {
    const sample = { a: [1, { b: new Set([2]) }], m: new Map([["k", new Float32Array([1.5])]]) };
    sample.self = sample;
    const copy = structuredClone(sample);
    return copy.self === copy && copy.a[1].b.has(2) && copy.m.get("k")[0] === 1.5 && copy.m.get("k") !== sample.m.get("k");
  })()`, ctx);
  if (!cloned) throw new Error("the polyfill's structuredClone is wrong");
  return values.length;
}

function run(outFile) {
  const text = fs.readFileSync(BUNDLE, "utf8");
  if (text !== bundleSource()) { console.error("engine-bundle.txt is out of date: run  node Tools/js-engine/bundle.js"); process.exit(1); }
  const tested = polyfillSelfTest();
  const ms = t0 => Number(process.hrtime.bigint() - t0) / 1e6;
  let t0 = process.hrtime.bigint();
  vm.runInThisContext(text, { filename: "engine-bundle.txt" });
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, "check.js"), "utf8"), { filename: "check.js" });
  const load = ms(t0);
  const C = globalThis.SameCheck, body = [], notes = [`# host: Node ${process.versions.node} (V8 ${process.versions.v8}) · ${C.hostNote()} · engine loaded in ${load.toFixed(0)} ms`,
    `# polyfill self-test: the number stand-in writes ${tested} numbers exactly as Node's toLocaleString("en-US")`];
  for (const seed of C.seeds) {
    t0 = process.hrtime.bigint();
    C.start(seed);
    const start = ms(t0), times = [];
    for (let s = 0; s < C.seasons; s++) { t0 = process.hrtime.bigint(); C.season(); times.push(ms(t0)); }
    body.push(C.finish());
    notes.push(`# time world ${seed}: start ${start.toFixed(1)} ms · seasons ${times.map(t => t.toFixed(1)).join(" ")} ms`);
    console.log(`world ${seed}: ${C.seasons} seasons, ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(0)} ms a season`);
  }
  const out = [...notes, ...body].join("\n") + "\n";
  if (outFile) { fs.writeFileSync(outFile, out); console.log(`wrote ${outFile}`); } else process.stdout.write(out);
}

if (process.argv[2] === "--compare") process.exit(compare(process.argv[3], process.argv[4]));
run(process.argv[2]);
