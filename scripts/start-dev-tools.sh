#!/bin/bash
# One-click local dev environment: Firestore emulator + price-sync trigger
# server + the app itself, all together. Closing this terminal window stops
# everything. Never touches the live site or real production data.
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

export PATH="/opt/homebrew/opt/openjdk/bin:/opt/homebrew/bin:$PATH"

echo "=================================================="
echo " King's Head Manager — Dev Tools"
echo "=================================================="
echo "Starting Firestore emulator, price-sync server, and the app..."
echo "Close this window (or press Ctrl+C) to stop everything."
echo ""

cleanup() {
  echo ""
  echo "Shutting down..."
  kill 0
}
trap cleanup EXIT INT TERM

firebase emulators:start --only firestore > /tmp/khkm-firestore-emulator.log 2>&1 &
node scripts/priceSyncServer.mjs > /tmp/khkm-price-sync-server.log 2>&1 &

# Give the emulator a moment before the app tries to connect.
sleep 5

npm run dev -- --port 3003 &
DEV_PID=$!

# Wait for the dev server to actually be listening, then open the browser.
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:3003; then
    open "http://localhost:3003"
    break
  fi
  sleep 1
done

wait $DEV_PID
