---
name: release
description: Release a new version of Drawn Borders - run all checks, bump the version, update the docs, commit, push, and make sure the Windows installer is built and published on the GitHub Releases page. Use when a version or a part of one is finished, or when Maz asks to "release", "publish", "ship" or "put it on my PC".
---

# Release

Maz plays the Windows program from the Releases page, so a part is finished only when its installer is published. Work from `drawn-borders/`.

## 1. Checks (all must pass; stop and fix on any failure)
1. `node build.js`
2. `node tests/engine.test.js` and `node tests/trade.test.js` (run any other `tests/*.test.js` the version added)
3. `node tests/browser.test.js` (needs `npm ci && npm i --no-save playwright` once)
4. End of a whole version (not each part): the `balance-check` skill.

## 2. Version numbers
- Each release gets the next number: `version` in `package.json` (`38.0.0` for a new version, `38.1.0`, `38.2.0` for its later parts or fixes) and `GAME_BUILD` in `src/ui/57-20b-saved-games.js` (the whole number, e.g. `38`; keep it on parts of the same version unless saves changed). Then `node build.js` again.
- Only a **new** `version` is published; a push without a bump only checks that the installer builds.

## 3. Docs (so a new chat knows everything)
- `game-plan.md`: a `### Version NN: …` section at the end with Maz's words, what was added in plain English, fixes, **Checks**, and the version numbers ("GAME_BUILD 38, installer version 38.0.0"). Update the "Next" section (what is done, what is next).
- `CLAUDE.md`: new files, new saved state, new tests, new rules.

## 4. Commit and push
- `git add -A && git commit` (message: "Version NN: <what it adds>", simple words) and `git push -u origin <branch>`. Always commit `drawn-borders.html` with the source (`node build.js --check` must pass).
- The workflow `.github/workflows/drawn-borders-windows.yml` runs on pushes to `main` and `claude/**`. Check its run with the GitHub MCP tools (`actions_list` for workflow runs on the branch, then `get_job_logs` if it fails). Don't poll with sleep: check once after about 15 minutes (`send_later`), or when Maz asks.
- If it fails: read the log, fix, push again (a failed run did not publish, so the same version number is fine).
- When it passes, confirm the release `drawn-borders-v<version>` exists (`get_latest_release` / `get_release_by_tag`).
- Open a pull request to `main` only when Maz asks (or has said to merge each version).

## 5. Tell Maz
Two or three short, simple sentences: the version number, what is new to try, and "Download `Drawn-Borders-Setup-<version>.exe` from the Releases page" (Windows may say "protected your PC": More info → Run anyway). Old saves keep loading — say so only after the checks proved it.
