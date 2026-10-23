#!/usr/bin/env bash
# Plays the same worlds with this version and an older one (both at once) and prints them side by side:
# output, stability, wars, towns taken, famine, trade, the opening war, season time.
#   bash tests/balance.sh [old commit, default: the last commit on origin/main] [worlds, default 8] [seasons, default 40]
# Results: tests/out/balance-old.json and tests/out/balance-new.json. Takes about 15 minutes for 8 x 40.
set -euo pipefail
cd "$(dirname "$0")/.."
OLD="${1:-origin/main}"; W="${2:-8}"; S="${3:-40}"
OUT="$PWD/tests/out"; mkdir -p "$OUT"
TREE="$(mktemp -d)/old"
git worktree add --detach "$TREE" "$OLD" >/dev/null
trap 'git worktree remove --force "$TREE" >/dev/null 2>&1 || true' EXIT
echo "old: $(git -C "$TREE" log -1 --format='%h %s')"
echo "new: working copy of $(git log -1 --format='%h %s')"
node tests/compare.js "$W" "$S" "$OUT/balance-old.json" "$TREE/drawn-borders" > "$OUT/balance-old.log" 2>&1 &
P1=$!
node tests/compare.js "$W" "$S" "$OUT/balance-new.json" > "$OUT/balance-new.log" 2>&1 &
P2=$!
wait $P1 || { echo "old version failed:"; tail -5 "$OUT/balance-old.log"; exit 1; }
wait $P2 || { echo "new version failed:"; tail -5 "$OUT/balance-new.log"; exit 1; }
node tests/compare.js --diff "$OUT/balance-old.json" "$OUT/balance-new.json"
