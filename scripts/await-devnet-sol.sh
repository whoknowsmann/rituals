#!/usr/bin/env bash
# Retry the devnet faucet until the deploy wallet can afford a program deploy.
#
# The public devnet faucet is aggressively rate-limited, so this backs off and
# keeps trying rather than failing on the first refusal. Safe to run in the
# background; it stops as soon as the target balance is reached.

set -uo pipefail

TARGET_SOL="${TARGET_SOL:-5}"
URL="https://api.devnet.solana.com"
ADDRESS="$(solana address)"
LOG="${1:-/tmp/rituals-faucet.log}"

echo "[$(date -u +%H:%M:%S)] watching $ADDRESS, target ${TARGET_SOL} SOL" | tee -a "$LOG"

while true; do
  BAL="$(solana balance --url "$URL" 2>/dev/null | awk '{print $1}')"
  BAL="${BAL:-0}"

  if awk -v b="$BAL" -v t="$TARGET_SOL" 'BEGIN { exit !(b >= t) }'; then
    echo "[$(date -u +%H:%M:%S)] TARGET REACHED: $BAL SOL" | tee -a "$LOG"
    exit 0
  fi

  # Ask for 2 at a time; the faucet often caps single requests.
  if solana airdrop 2 --url "$URL" >/dev/null 2>&1; then
    NEW="$(solana balance --url "$URL" 2>/dev/null | awk '{print $1}')"
    echo "[$(date -u +%H:%M:%S)] airdrop OK -> $NEW SOL" | tee -a "$LOG"
  else
    echo "[$(date -u +%H:%M:%S)] rate limited at $BAL SOL, backing off" >> "$LOG"
  fi

  sleep 90
done
