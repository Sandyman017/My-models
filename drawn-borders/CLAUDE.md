# Drawn Borders — Maz's strategy game

A grand strategy game that runs in the browser. You draw your own country's borders on a generated world and divide it into provinces, then run it season by season against rival nations: economy from geography (mines, farms, factories), trade between nations (contracts, embargoes, grain and aid), roads and cities, army and navy, diplomacy and letters, ministers, interest groups, and people and work (ages, skills, wages, labour laws).

- **Play**: double-click `drawn-borders.html` (Chrome or Edge). It is built from `src/` and committed, so it is always ready to play.
- **Windows program** (since v35): `desktop/` wraps the same built file in Electron. Maz installs it from the GitHub Releases page.
- **Full history and design**: `game-plan.md` — what the player wants, every version (v1–v38) and what each added, and ideas for next steps. Read it before big changes.

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
3. `node tests/trade.test.js [worlds] [seasons]` — checks trade between nations (default 2 × 10): contracts are sane, the same game signs the same contracts, an embargo cuts supply and its preview says so, grain reaches a hungry nation, the book survives a save and old saves get one.
4. `node tests/browser.test.js` — opens the built game in Chrome (Playwright), founds a nation, divides it into provinces, plays 3 seasons, opens the Provinces panel, the Trade panel and the trade statistics, fails on any error or broken characters; screenshots in `tests/out/`. (In cloud sessions: `npm ci && npm i --no-save playwright`; the scripts fall back to the session's own Chromium.)
5. At the end of a version only: `bash tests/balance.sh [old commit]` plays 8 worlds × 40 seasons with this version and the old one at once (a temporary git worktree) and prints them side by side (output, stability, wars, the opening war, season time). About 15 minutes of computer time, very little usage. (By hand: `node tests/compare.js 8 40 new.json [folder]`, then `--diff old.json new.json`.)

**Project skills** (in `.claude/skills/` at the repository root): `play-and-look` (open the built game, play, screenshot the changed screens with `node tests/look.js …`, look once), `balance-check` (step 5 and how to read it), `release` (checks, version bump, docs, push, the Windows installer on the Releases page).

## How we work (Maz's choice after v37: the same quality, less usage)
v37 (trade) took about a day and a half and hit the usage limit many times. Most of that went to helper agents (each one re-reads the code from scratch, and their work was lost when the limit cut them off), not to the tests. So:
- **No helper agents or parallel workers** unless Maz asks for them. Build it yourself, one part after another, committing and pushing after each part.
- **A short plan, then build.** For a big feature: read the code it touches, give Maz a plan of about 10 lines in simple English, and start when he says yes. No separate research or critic rounds; review your own design against the code instead.
- **Big ideas in parts** he can play between (each part finished, tested and released), rather than one giant version.
- **Quality stays the same**: run the quick tests (steps 1–4) after each part; run the 8-world comparison (step 5) once at the end of a version; look at a screenshot of every new or changed screen (once, not again and again).
- **A new chat for each new feature.** Keep this file and `game-plan.md` up to date, so a fresh chat knows everything it needs.

## Trade between nations (since v37)
- **The merchants' book** `game.trade` (saved): once a season, at the end of `runSeason` after the harvest, `clearWorldTrade` signs the next season's contracts — who sells what to whom — by the price at the buyer's border (world price, transport by road, caravan or sea, import tax unless there is a trade agreement, the middlemen's cut from beyond the map). What no nation can sell or buy goes to the world market through harbors and trade partners. No randomness: ties go by nation id.
- `computeEconomy` only **reads** the book (it never writes it). A war, an embargo or a lost harbor cuts a contract at once; merchants make quick deals with spare goods between seasons. Worlds imagined to weigh a choice (`hypothetical`) share the book; `{embargo}`, `{lift}` and `{noReroute}` change it there.
- Files: `engine/25b-…` (book, prices, links, embargoes, food aid, read helpers such as `tradeOf`, `tradeWith`, `tradeOffers`, `tradeRisks`, `embargoPreview`), `engine/25c-…` (rivals' trade decisions: embargoes, lifting, food aid, early warnings), `ui/54b-…` (Trade panel), `ui/51b-…` (Nations, letters, season report), `ui/42b-…` (trade on the map), Statistics "Trade" view in `ui/45-17c-…`.
- Old saves get a book when they load (`tradeMigrate`); a fault in the clearing never stops a season (the old contracts stand).

## Provinces and villages (since v38, part 1)
- **State** (saved): `g.prov` (Int16Array, a province id for every cell, -1 for wild land), `g.provinces` (`{ id, owner, name, capital: city id or null, made, hist: [{t, pop, gdp}] }`), `g.provNext` (the id counter, kept apart from `g.nextId` so nothing else changes), `g.villages` (`{ cell, name, kind: farm|mine|fish, born, pop }`). A province with `capital: null` is a **territory** (no town yet, run from the national capital).
- `engine/29b-10u-provinces.js`: `partitionCells`/`autoDivide` (the same rule for "Divide it for me", rivals and old saves: towns far apart become seeds, provinces grow evenly), `tidyProvinces` (every cell of a nation in one of its provinces; new or conquered land joins the nearest), `syncProvinces` (each season before the turn ends; a lost province capital passes to the biggest town), `provincePlan`/`quoteProvince`/`finishProvince` (draw, join, capital: weighed on copies, then a project of kind `"province"` with a cost and 1–2 seasons), `provinceStats` (people by cell; each town's output shared among the provinces its land lies in, by people), `updateVillages` (villages from people on farmland, near mines, on fishing coasts; no effect on the economy), `rivalProvinces` (once a year: a territory with a town gets a capital; a province over ~70 cells is split).
- **Province capitals are the old "provincial seat" program** (`provSeat(g, city)`): public jobs, loyalty, mood, the acting capital if the national capital falls, and they ease the stability cost of a large country (10% each, at most 4 = the old 40%). Their offices cost the old seat upkeep (in `econ.programs`). The seat program is no longer offered; old saves turn their seats into province capitals (`ensureProvinces` in `restore`).
- **Founding**: after "Found this nation" the game is set up and `ui.phase` is `"provinces"` (step 2: draw with the pen, "Divide it for me", names, capitals); "Start with these provinces" begins play. Changes there are free and instant; later they go through `quoteProvince` and the confirm card.
- **Interface**: `ui/52b-16m-…` (founding step, Provinces panel on key B, the pen tool `ui.tool === "province"`, province lines in `drawTerritories`, names and villages drawn after the towns so they make room for town names, the gold ring on province capitals, hover lines).

## Governors and money for each province (since v38.1, part 2)
- `engine/29c-10v-governors.js`: each province has `fund` (0–3: none, small, normal, large = 0/0.1/0.2/0.4% of its output a year, paid each season) and `gov` (`{ name, sex, since }`, null for a territory); `govLog` keeps the last spending reports. `econ.provGrants` (from `provGrantsTotal`) is the budget line `provinces`; `runNationSeason` stores what was paid in `n.provPaid`, and `seasonGovernors` (after `seasonProvinces`) splits it by `provinceNeeds` (jobs, unhappy towns, loyalty, then local roads and markets; food and cut-off towns are listed but money can't fix them) into city mods `gov_jobs` (`jobs`: public jobs share, read by `cityEconMods`), `gov_mood`, `gov_loyal`, `gov_dev` (`out`). `rivalFunding` sets rivals' levels once a year. `ensureGovernors` (in `ensureProvinces`) fills old saves.
- Interface: money buttons, governor, needs and last spending in each province card; the needs report at the top of the Provinces panel; "Money for the provinces" in the budget; `provincesDispatchHtml` in the season report.

## The Windows program (`desktop/`, `package.json`)
- `desktop/main.js` opens `drawn-borders.html` in its own window (maximized, F11 full screen, one copy at a time, links open in the normal browser). `desktop/preload.js` gives the page `window.desktop` = `{ savesFolder, saveFile(name, data) }`; "Export to file" uses it to write to `Documents\Drawn Borders\Saves`. Autosaves and named saves stay in localStorage, which Electron keeps in the user's AppData.
- The game must still work without `window.desktop` (browser, claude.ai): check for it, never require it.
- `npm install`, then `npm start` runs it; `npm run dist` builds the installer (on Windows).
- **Releasing**: bump `version` in `package.json` when the game changes, and push. On every push to `main` or a `claude/**` branch that touches `drawn-borders/`, the workflow `.github/workflows/drawn-borders-windows.yml` checks the build, plays two worlds, builds `Drawn-Borders-Setup-<version>.exe` on Windows and publishes it on the Releases page as `drawn-borders-v<version>` (only a new version is published; pushes without a version bump just check that the installer still builds). Not code-signed: Windows shows "Windows protected your PC" → More info → Run anyway.
- Claude features (letters, ministers' answers, account saves) need claude.ai's `window.claude`; in the program they fall back to the built-in rules.

New sections: add a new numbered file in the right folder (pick a number between its neighbors, e.g. `31b-...js`, since names sort as text). Anything before section 13 belongs in `engine/` and must not touch the browser.

## Rules the code follows
- **The code owns every rule and number.** Panels, ministers and rival AI read the same functions (for example `computeEconomy`, `forecast`, `runSeason`) — never duplicate a formula in the interface.
- Every number shown to the player explains itself (hover cards, "why" lists).
- Rival nations use the same options and estimates as the player.
- New state on a nation must be created for old saves too (see the `ensure...` functions called at setup and on restore, such as `ensureGroups`, `ensurePeople`).
- Before and after a big change, simulate many seasons in Node and compare with the previous version (output, stability, wars, the opening war), and check that saves still load.

## Claude features
Inside claude.ai (as an artifact) the game can ask Claude to write rivals' letters and ministers' answers, and save to the player's account. Opened as a plain file, these fall back: ministers answer from their files without Claude, and games are saved in the browser and as save files.
