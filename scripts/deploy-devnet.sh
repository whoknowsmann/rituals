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
KEYPAIR="${SOLANA_KEYPAIR:-$HOME/.config/solana/id.json}"
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

# Guard: refuse to proceed without enough for rent exemption plus fees.
awk -v b="$BALANCE" 'BEGIN { if (b < 3.5) { exit 1 } }' || {
  echo "FAIL: need at least 3.5 SOL on devnet (rent-exempt minimum is ~3.01)."
  echo "      Fund $DEPLOYER via https://faucet.solana.com (devnet)."
  exit 1
}

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
solana program deploy \
  --url "$CLUSTER_URL" \
  --keypair "$KEYPAIR" \
  --program-id "$PROGRAM_KEYPAIR" \
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
