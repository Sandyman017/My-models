---
name: balance-check
description: Compare game balance between this version of Drawn Borders and the previous one by playing the same 8 worlds for 40 seasons with both (output, stability, wars, towns taken, famine, trade, the opening war, season time) and explain the differences. Use at the end of every version, before a release, or when asked whether a change "broke the balance", made the game harder or slower.
---

# Balance check

The step-5 check from `drawn-borders/CLAUDE.md`, in one command. It costs about 15 minutes of computer time and very little usage: start it in the background and keep working (or wait for the notification), don't poll.

## Steps
1. Commit or at least save your work; `node build.js` (the new side reads `src/` through `build.js`).
2. Pick the old version: by default the last commit on `origin/main` (the released game). For a version built over several commits on a branch, use the commit before the first one (`git merge-base HEAD origin/main`).
3. Run in the background: `cd drawn-borders && bash tests/balance.sh [old-commit] [worlds=8] [seasons=40]`. It makes a temporary git worktree of the old commit, plays both versions at once, then prints the table. Results stay in `tests/out/balance-old.json` / `balance-new.json`.
4. Read the table and judge it against what the change was meant to do:
   - `errors` must be 0 on the new side. Any error: open `tests/out/balance-new.log`, fix it, run again.
   - **firstWar** (the season the opening war starts, per world) should stay the same in most worlds unless the change is about war.
   - **worldGdp** within about ±10%, **meanStab** within about ±3 points, **wars** and **townsMoved** close, **famine** near 0, unless the change is meant to move them. Explain every big move from the code (which rule causes it), don't just report it.
   - **msPerSeason**: more than about 15% slower needs a reason or a fix.
5. Write the result in `game-plan.md` under the version's **Checks** line in the same style as earlier versions ("against v37, 8 worlds × 40 seasons, passive player: …"), and tell Maz in two or three simple sentences: what changed, whether that is intended, and whether anything needs fixing.

For a quick look during work, use fewer worlds: `bash tests/balance.sh origin/main 3 20`.
