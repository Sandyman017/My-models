# Drawn Borders — Maz's strategy game

A grand strategy game that runs in the browser. You draw your own country's borders on a generated world, then run it season by season against rival nations: economy from geography (mines, farms, factories, trade), roads and cities, army and navy, diplomacy and letters, ministers, interest groups, and people and work (ages, skills, wages, labour laws).

- **Play**: double-click `drawn-borders.html` (Chrome or Edge). It is built from `src/` and committed, so it is always ready to play.
- **Full history and design**: `game-plan.md` — what the player wants, every version (v1–v34) and what each added, and ideas for next steps. Read it before big changes.

## About the player (Maz)
- English is his second language: explain things in **simple English**.
- Plays on a Windows PC with a mouse (GTX 1650).
- Wants **realism and logic**, "not adding for the sake of adding"; loves statistics; wants a clean, map-first screen.
- **Old saves must keep loading** after every change.

## How the project is organised (since v34)
Until v33 the game was one hand-edited 2.1 MB file. Now the source is split into files, and `build.js` joins them back into the one playable file:

- `src/page.html` — the page around the game (fonts, the empty boxes the panels fill). Has `/*@@STYLE@@*/` and `/*@@SCRIPT@@*/` markers.
- `src/style.css` — the look.
- `src/engine/` — the pure game engine (world, economy, seasons, AI, war, diplomacy). Runs without the browser.
- `src/ui/` — the interface (map painting, panels, input, saving, art data).
- Each file is one of the old numbered sections; its name is `NN-section-title.js`. `NN` is the order the files are joined in (engine first, then ui). It is still **one shared script**: functions in any file can call functions in any other, exactly as before.

**After every change:**
1. `node build.js` — rebuilds `drawn-borders.html`. Always commit it together with the source; `node build.js --check` fails if it is out of date.
2. `node tests/engine.test.js [worlds] [seasons]` — plays whole worlds with the engine in Node (default 2 × 12) and checks nothing breaks and the save round-trips.
3. `node tests/browser.test.js` — opens the built game in Chrome (Playwright), founds a nation, plays 3 seasons, fails on any error or broken characters; screenshot in `tests/out/`.

New sections: add a new numbered file in the right folder (pick a number between its neighbors, e.g. `31b-...js`, since names sort as text). Anything before section 13 belongs in `engine/` and must not touch the browser.

## Rules the code follows
- **The code owns every rule and number.** Panels, ministers and rival AI read the same functions (for example `computeEconomy`, `forecast`, `runSeason`) — never duplicate a formula in the interface.
- Every number shown to the player explains itself (hover cards, "why" lists).
- Rival nations use the same options and estimates as the player.
- New state on a nation must be created for old saves too (see the `ensure...` functions called at setup and on restore, such as `ensureGroups`, `ensurePeople`).
- Before and after a big change, simulate many seasons in Node and compare with the previous version (output, stability, wars, the opening war), and check that saves still load.

## Claude features
Inside claude.ai (as an artifact) the game can ask Claude to write rivals' letters and ministers' answers, and save to the player's account. Opened as a plain file, these fall back: ministers answer from their files without Claude, and games are saved in the browser and as save files.
