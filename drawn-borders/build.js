#!/usr/bin/env node
/* Builds the game from its source files.

   node build.js           writes drawn-borders.html: the whole game in one file, to double-click or publish
   node build.js --check   fails if drawn-borders.html is older than the source files

   The source lives in src/:
     page.html    the page around the game (fonts, the empty panels the game fills in)
     style.css    the look
     engine/      the pure game rules: world, economy, seasons, rivals, war, diplomacy (runs in Node too)
     ui/          the interface: map painting, panels, input, saving, art
   Files are joined in name order (engine first, then ui), as one script, exactly as before the split. */
"use strict";
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "src");
const OUT = path.join(__dirname, "drawn-borders.html");

function sectionFiles(dir) {
  return fs.readdirSync(path.join(SRC, dir)).filter(f => f.endsWith(".js")).sort().map(f => path.join(SRC, dir, f));
}
const read = f => fs.readFileSync(f, "utf8");

/** The pure game rules as one script, for tests in Node. */
function engineSource() {
  return '"use strict";\n\n' + sectionFiles("engine").map(read).join("");
}

function buildPage() {
  const script = [...sectionFiles("engine"), ...sectionFiles("ui")].map(read).join("");
  const page = read(path.join(SRC, "page.html"));
  const parts = page.split("/*@@STYLE@@*/\n");
  if (parts.length !== 2 || !parts[1].includes("/*@@SCRIPT@@*/\n")) throw new Error("src/page.html lost its STYLE or SCRIPT marker");
  // split/join instead of replace, so "$" in the code is never read as a pattern
  return parts[0] + read(path.join(SRC, "style.css")) + parts[1].split("/*@@SCRIPT@@*/\n").join(script);
}

if (require.main === module) {
  const html = buildPage();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (current !== html) { console.error("drawn-borders.html is out of date: run  node build.js"); process.exit(1); }
    console.log("drawn-borders.html is up to date");
  } else {
    fs.writeFileSync(OUT, html);
    console.log(`wrote drawn-borders.html (${(Buffer.byteLength(html) / 1e6).toFixed(2)} MB, ${html.split("\n").length} lines)`);
  }
}

module.exports = { buildPage, engineSource };
