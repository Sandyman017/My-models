# Drawn Borders — Maz's strategy game

A grand strategy game that runs in the browser. You draw your own country's borders on a generated world, then run it season by season against rival nations: economy from geography (mines, farms, factories), trade between nations (contracts, embargoes, grain and aid), roads and cities, army and navy, diplomacy and letters, ministers, interest groups, and people and work (ages, skills, wages, labour laws).

- **Play**: double-click `drawn-borders.html` (Chrome or Edge). It is built from `src/` and committed, so it is always ready to play.
- **Windows program** (since v35): `desktop/` wraps the same built file in Electron. Maz installs it from the GitHub Releases page.
- **Full history and design**: `game-plan.md` — what the player wants, every version (v1–v37) and what each added, and ideas for next steps. Read it before big changes.

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
4. `node tests/browser.test.js` — opens the built game in Chrome (Playwright), founds a nation, plays 3 seasons, opens the Trade panel and the trade statistics, fails on any error or broken characters; screenshots in `tests/out/`.

## Trade between nations (since v37)
- **The merchants' book** `game.trade` (saved): once a season, at the end of `runSeason` after the harvest, `clearWorldTrade` signs the next season's contracts — who sells what to whom — by the price at the buyer's border (world price, transport by road, caravan or sea, import tax unless there is a trade agreement, the middlemen's cut from beyond the map). What no nation can sell or buy goes to the world market through harbors and trade partners. No randomness: ties go by nation id.
- `computeEconomy` only **reads** the book (it never writes it). A war, an embargo or a lost harbor cuts a contract at once; merchants make quick deals with spare goods between seasons. Worlds imagined to weigh a choice (`hypothetical`) share the book; `{embargo}`, `{lift}` and `{noReroute}` change it there.
- Files: `engine/25b-…` (book, prices, links, embargoes, food aid, read helpers such as `tradeOf`, `tradeWith`, `tradeOffers`, `tradeRisks`, `embargoPreview`), `engine/25c-…` (rivals' trade decisions: embargoes, lifting, food aid, early warnings), `ui/54b-…` (Trade panel), `ui/51b-…` (Nations, letters, season report), `ui/42b-…` (trade on the map), Statistics "Trade" view in `ui/45-17c-…`.
- Old saves get a book when they load (`tradeMigrate`); a fault in the clearing never stops a season (the old contracts stand).

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
