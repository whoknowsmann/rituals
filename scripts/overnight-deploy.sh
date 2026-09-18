#!/usr/bin/env bash
# Overnight autopilot: wait for devnet SOL, then deploy and verify.
#
# Every action here is devnet-only and reversible. It stops at the first
# failure rather than pressing on, and it never touches mainnet or any key
# other than the dedicated devnet deployer.

set -uo pipefail
cd "$(dirname "$0")/.."

LOG="/tmp/rituals-overnight.log"
KEYPAIR=".keys/rituals-devnet-deployer.json"
URL="https://api.devnet.solana.com"

say() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }
fail() { say "STOPPED: $*"; exit 1; }

say "=== overnight run starting ==="
ADDRESS="$(solana address -k "$KEYPAIR")" || fail "cannot read deploy keypair"
say "deploy wallet: $ADDRESS"

# ---- Phase 1: wait for funding (up to ~7 hours) ----
say "phase 1: waiting for >= 3.5 devnet SOL"
DEADLINE=$(( $(date +%s) + 25200 ))
while true; do
  BAL="$(solana balance -k "$KEYPAIR" --url "$URL" 2>/dev/null | awk '{print $1}')"
  BAL="${BAL:-0}"
  if awk -v b="$BAL" 'BEGIN { exit !(b >= 3.5) }'; then
    say "funded: $BAL SOL"
    break
  fi
  if [ "$(date +%s)" -gt "$DEADLINE" ]; then
    fail "never funded (still $BAL SOL). Fund $ADDRESS at https://faucet.solana.com"
  fi
  solana airdrop 2 "$ADDRESS" --url "$URL" >/dev/null 2>&1 || true
  sleep 120
done

# ---- Phase 2: deploy ----
say "phase 2: deploying to devnet"
if ./scripts/deploy-devnet.sh >> "$LOG" 2>&1; then
  say "deploy OK"
else
  fail "deploy failed — see $LOG"
fi

PROGRAM_ID="$(solana address -k target/deploy/rituals-keypair.json)"
say "program live: $PROGRAM_ID"

# ---- Phase 3: verify on-chain ----
say "phase 3: verifying"
if solana program show "$PROGRAM_ID" --url "$URL" >> "$LOG" 2>&1; then
  say "program account confirmed executable on devnet"
else
  fail "program not visible on-chain after deploy"
fi

say "=== overnight run complete ==="
say "NEXT (needs Jack): create SPL test mint, flip deployment config, wire screens"
