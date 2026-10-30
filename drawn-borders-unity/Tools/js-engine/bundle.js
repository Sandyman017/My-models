/* Writes the web game's rules engine into the Unity project, where V8 (PuerTS) runs it.
   node Tools/js-engine/bundle.js           writes Assets/DrawnBorders/Resources/DrawnBorders/engine-bundle.txt
   node Tools/js-engine/bundle.js --check   fails if that file is older than ../drawn-borders/src/engine
   The bundle is the polyfill (polyfill.js) and then engineSource() from ../drawn-borders/build.js, the same script the
   Node tests run. It is one classic script: every function and constant of the engine is a global afterwards. */
"use strict";
const fs = require("fs");
const path = require("path");
const { engineSource } = require(path.join(__dirname, "../../../drawn-borders/build.js"));

const OUT = path.join(__dirname, "../../Assets/DrawnBorders/Resources/DrawnBorders/engine-bundle.txt");

function bundleSource() {
  return "/* Made by drawn-borders-unity/Tools/js-engine/bundle.js from drawn-borders/src/engine: do not edit. */\n"
    + fs.readFileSync(path.join(__dirname, "polyfill.js"), "utf8") + "\n" + engineSource();
}

if (require.main === module) {
  const text = bundleSource();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (current !== text) { console.error("engine-bundle.txt is out of date: run  node Tools/js-engine/bundle.js"); process.exit(1); }
    console.log("engine-bundle.txt is up to date");
  } else {
    fs.writeFileSync(OUT, text);
    console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(Buffer.byteLength(text) / 1e6).toFixed(2)} MB, ${text.split("\n").length} lines)`);
  }
}

module.exports = { bundleSource, OUT };
