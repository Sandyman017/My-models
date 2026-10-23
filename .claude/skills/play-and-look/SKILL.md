---
name: play-and-look
description: Open Drawn Borders in a real browser, found a nation, play some seasons and screenshot the screens that changed, then look at each screenshot once. Use after any change to a panel, the map or the founding screens, or when asked to "play it", "show me", "take a screenshot" or "check it in the browser".
---

# Play and look

Sees a change in the real game (Chromium + Playwright), the way Maz will see it. Look at each new or changed screen **once**, not again and again.

## Steps
1. `cd drawn-borders && node build.js` (the game is the built file).
2. If `node_modules/playwright` is missing: `npm ci && npm i --no-save playwright`. Chromium is already installed in cloud sessions (never run `playwright install`).
3. Run `node tests/look.js` with the steps that reach the changed screen. It founds a nation with "Try a sample shape", lets the game divide it into provinces, plays the seasons, then does the steps:
   - `key:x` press a key · `click:<selector>` · `eval:<js>` (the page's own `game`, `world`, `ui`, `renderAll()` …) · `wait:<ms>` · `idle` (wait for the season to finish playing on the map) · `shot:<name>` · `text:<selector>` (print text, to check numbers without a picture)
   - Examples:
     - Trade panel: `node tests/look.js --seasons 2 idle key:x wait:800 shot:trade`
     - Close zoom: `node tests/look.js --seasons 1 idle "eval:ui.zoom=4;renderAll()" wait:1500 shot:zoom`
     - Founding screen only: `node tests/look.js --no-found "click:text=Try a sample shape" wait:1500 shot:founding`
   - Find the key or `data-action` for a panel with Grep in `src/ui/` (keys are in `ui/44-19-input.js`).
4. Read every screenshot it prints (`tests/out/look-*.png`) with the Read tool. Check: nothing overlaps or is cut off, text is simple English, numbers look sane and explain themselves (hover cards), the map stays clean.
5. The script fails on any page error or broken characters (`â€`, `Â·`). Fix these before anything else.
6. Tell Maz in one or two plain sentences what you saw; show him a screenshot (SendUserFile) only when a screen is new or changed a lot.

Screenshots are in `tests/out/`, which git ignores. The full regression run is still `node tests/browser.test.js`.
