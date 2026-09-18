#!/usr/bin/env bash
# Create the valueless SPL test mint used for devnet Rituals stakes.
#
# Devnet only. The mint has no value and exists purely so the demo can move
# token balances through the program. Mint authority stays with the devnet
# deployer so demo wallets can be topped up on request.

set -euo pipefail
cd "$(dirname "$0")/.."

KEYPAIR=".keys/rituals-devnet-deployer.json"
URL="https://api.devnet.solana.com"
DECIMALS=6
MANIFEST="deployment/devnet-mint.json"

say() { echo "[$(date -u +%H:%M:%S)] $*"; }

DEPLOYER="$(solana address -k "$KEYPAIR")"
say "creating TEST mint (decimals=$DECIMALS) as $DEPLOYER"

# Classic SPL Token program only; the protocol rejects Token-2022.
# NOTE: in spl-token-cli 5.x, --owner is an alias for --mint-authority, so
# passing both is rejected. The fee payer keypair supplies the authority.
MINT_OUT="$(spl-token create-token \
  --url "$URL" \
  --fee-payer "$KEYPAIR" \
  --mint-authority "$KEYPAIR" \
  --decimals "$DECIMALS" \
  --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA 2>&1)"
echo "$MINT_OUT"

MINT="$(echo "$MINT_OUT" | grep -oP 'Address:\s*\K[1-9A-HJ-NP-Za-km-z]{32,44}' | head -1)"
[[ -n "$MINT" ]] || { echo "FAIL: could not parse mint address"; exit 1; }
say "mint: $MINT"

# Fee recipient token account. ProtocolConfig.feeRecipient stores a TOKEN
# ACCOUNT address, not a wallet address.
say "creating fee-recipient token account"
spl-token create-account "$MINT" \
  --url "$URL" --fee-payer "$KEYPAIR" --owner "$DEPLOYER" >/dev/null 2>&1 || true
FEE_ACCOUNT="$(spl-token address --token "$MINT" --url "$URL" --owner "$DEPLOYER" --verbose 2>/dev/null \
  | grep -oP 'Associated token address:\s*\K[1-9A-HJ-NP-Za-km-z]{32,44}' | head -1)"
[[ -n "$FEE_ACCOUNT" ]] || { echo "FAIL: could not resolve fee recipient token account"; exit 1; }
say "fee recipient token account: $FEE_ACCOUNT"

mkdir -p "$(dirname "$MANIFEST")"
cat > "$MANIFEST" <<JSON
{
  "cluster": "devnet",
  "mint": "$MINT",
  "decimals": $DECIMALS,
  "mintAuthority": "$DEPLOYER",
  "feeRecipientTokenAccount": "$FEE_ACCOUNT",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "note": "Valueless devnet TEST token. No real value. Not for mainnet."
}
JSON

say "wrote $MANIFEST"
cat "$MANIFEST"
