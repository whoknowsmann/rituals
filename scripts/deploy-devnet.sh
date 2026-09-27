#!/usr/bin/env bash
# Deploy the Rituals program to devnet and record the authorized identity.
#
# Prerequisites:
#   - `anchor build` has produced target/deploy/rituals.so
#   - the deploy wallet holds at least ~3.5 SOL on devnet
#
# This script is idempotent up to the deploy itself: re-running it redeploys and
# overwrites the manifest. It NEVER touches mainnet.

set -euo pipefail

CLUSTER_URL="https://api.devnet.solana.com"
# Dedicated devnet-only deploy key. Deliberately NOT the global CLI default,
# which may point at a wallet holding real mainnet funds and be reused for
# unrelated work. This key's only job is deploying Rituals to devnet.
KEYPAIR="${SOLANA_KEYPAIR:-.keys/rituals-devnet-deployer.json}"
PROGRAM_KEYPAIR="target/deploy/rituals-keypair.json"
PROGRAM_SO="target/deploy/rituals.so"
MANIFEST="deployment/devnet.json"

cd "$(dirname "$0")/.."

echo "==> Preflight checks"
[[ -f "$PROGRAM_SO" ]] || { echo "FAIL: $PROGRAM_SO missing. Run 'anchor build'."; exit 1; }
[[ -f "$PROGRAM_KEYPAIR" ]] || { echo "FAIL: $PROGRAM_KEYPAIR missing."; exit 1; }

PROGRAM_ID="$(solana address -k "$PROGRAM_KEYPAIR")"
DEPLOYER="$(solana address -k "$KEYPAIR")"
BALANCE="$(solana balance --url "$CLUSTER_URL" -k "$KEYPAIR" | awk '{print $1}')"

echo "    program id : $PROGRAM_ID"
echo "    deployer   : $DEPLOYER"
echo "    balance    : $BALANCE SOL"

# DEPLOY_BUFFER: a buffer keypair FILE (gitignored, e.g. .keys/…). Writing to a
# known buffer lets a failed deploy resume by re-running this script, instead of
# stranding ~3.7 SOL behind the one-off seed phrase the CLI prints. Rent already
# locked in that buffer counts toward the balance guard.
BUFFER_ARGS=()
BUFFER_BAL=0
if [[ -n "${DEPLOY_BUFFER:-}" ]]; then
  [[ -f "$DEPLOY_BUFFER" ]] || { echo "FAIL: DEPLOY_BUFFER $DEPLOY_BUFFER missing."; exit 1; }
  BUFFER_ARGS=(--buffer "$DEPLOY_BUFFER")
  BUFFER_BAL="$(solana balance --url "$CLUSTER_URL" "$(solana address -k "$DEPLOY_BUFFER")" 2>/dev/null | awk '{print $1}')"
  BUFFER_BAL="${BUFFER_BAL:-0}"
  echo "    buffer     : $(solana address -k "$DEPLOY_BUFFER") ($BUFFER_BAL SOL)"
fi

# Guard: refuse to proceed without enough for rent exemption plus fees.
awk -v b="$BALANCE" -v f="$BUFFER_BAL" 'BEGIN { if (b + f < 3.5) { exit 1 } }' || {
  echo "FAIL: need at least 3.5 SOL on devnet (rent-exempt minimum is ~3.01)."
  echo "      Fund $DEPLOYER via https://faucet.solana.com (devnet)."
  exit 1
}

# Refuse to run if the deploy key holds mainnet value; that would mean the
# wrong key is configured. Fail closed: an unreadable mainnet balance is not 0.
MAINNET_BAL=""
for _ in 1 2 3; do
  MAINNET_BAL="$(solana balance --url https://api.mainnet-beta.solana.com -k "$KEYPAIR" 2>/dev/null | awk '{print $1}')"
  [[ -n "$MAINNET_BAL" ]] && break
  sleep 5
done
[[ -n "$MAINNET_BAL" ]] || { echo "FAIL: could not read the deploy key's mainnet balance; refusing to proceed."; exit 1; }
if awk -v b="$MAINNET_BAL" 'BEGIN { exit !(b > 0) }'; then
  echo "FAIL: deploy key $DEPLOYER holds $MAINNET_BAL SOL on MAINNET."
  echo "      Use a dedicated devnet-only key; refusing to proceed."
  exit 1
fi

echo "==> Verifying declare_id matches the deploy keypair"
DECLARED="$(grep -oP 'declare_id!\("\K[^"]+' programs/rituals/src/lib.rs)"
if [[ "$DECLARED" != "$PROGRAM_ID" ]]; then
  echo "FAIL: declare_id! is $DECLARED but the deploy keypair is $PROGRAM_ID."
  echo "      Update declare_id!, re-run 'anchor build', then retry."
  exit 1
fi

echo "==> Verifying the built IDL still matches the frozen snapshot"
if ! diff -q target/idl/rituals.json src/data/rituals/idl/rituals.json >/dev/null; then
  echo "FAIL: built IDL differs from the frozen snapshot in src/data/rituals/idl/."
  echo "      The typed client decoders are bound to the frozen IDL; investigate before deploying."
  exit 1
fi

echo "==> Deploying to devnet"
# Buffer writes carry a small priority fee: without one, TPU writes on a busy
# devnet failed with "Max retries exceeded" (2026-09-27). Set DEPLOY_USE_RPC=1
# to send writes through the RPC instead; the public devnet RPC answers ~700
# write transactions with 429s, so that needs a dedicated endpoint.
# DEPLOY_EXTRA_ARGS appends further `solana program deploy` flags (e.g.
# `--buffer <recovered-keypair.json>` to resume a failed write).
USE_RPC_FLAG=""
[[ "${DEPLOY_USE_RPC:-0}" == "1" ]] && USE_RPC_FLAG="--use-rpc"
# shellcheck disable=SC2086
solana program deploy \
  --url "$CLUSTER_URL" \
  --keypair "$KEYPAIR" \
  --program-id "$PROGRAM_KEYPAIR" \
  $USE_RPC_FLAG \
  --with-compute-unit-price "${DEPLOY_CU_PRICE:-10000}" \
  --max-sign-attempts "${DEPLOY_MAX_SIGN_ATTEMPTS:-30}" \
  "${BUFFER_ARGS[@]}" \
  ${DEPLOY_EXTRA_ARGS:-} \
  "$PROGRAM_SO"

echo "==> Confirming the program is executable on-chain"
solana program show "$PROGRAM_ID" --url "$CLUSTER_URL"

mkdir -p "$(dirname "$MANIFEST")"
cat > "$MANIFEST" <<JSON
{
  "cluster": "devnet",
  "programId": "$PROGRAM_ID",
  "deployer": "$DEPLOYER",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "note": "Devnet only. Valueless SPL test assets. Not for mainnet."
}
JSON

echo "==> Wrote $MANIFEST"
cat "$MANIFEST"
echo
echo "NEXT: update RITUALS_CURRENT_CONFIG in src/data/rituals/programIds.ts to"
echo "      { cluster: 'devnet', programId: '$PROGRAM_ID', deployment: 'deployed' }"
echo "      and update assertSupportedRitualsProgram to accept exactly that id."
