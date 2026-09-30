# Solo smoke runbook

This runbook is for the post-deploy, typed-client proof of the solo and Season
flows. The scripts never use a Solana CLI default keypair: every signer path is
an explicit argument. A devnet run also reads the payer's mainnet balance and
refuses to continue when it is non-zero.

## ProtocolConfig layout check

The pre-Seasons deployed program and the Seasons build have the same
`ProtocolConfig` fields and order:

```text
schema_version, authority, allowed_stake_mint, fee_recipient,
fee_basis_points, minimum_fee, maximum_fee, maximum_member_stake,
max_members, max_events, paused, bump
```

The client decoder remains 135 bytes. Seasons add a separate `Season` PDA; they
do not change `ProtocolConfig`. Therefore, after the new program deploy:

- run `verify-devnet-config.ts` first;
- run `init-protocol-config.ts` only when the PDA is absent (for example, a
  fresh deployment/cluster), not merely because the program binary changed.

## Post-deploy devnet sequence

Run from the repository root. Replace the explicit paths and token account
addresses with the operator's devnet-only files. The `solo-owner` key must hold
TEST tokens in `--creator-token-account`; it must not be the CLI default wallet.

```bash
npx tsx scripts/verify-devnet-config.ts

# Only if verify reports that ProtocolConfig is absent:
npx tsx scripts/init-protocol-config.ts

npx tsx scripts/create-demo-cause.ts \
  --url https://api.devnet.solana.com \
  --owner-keypair .keys/rituals-demo-cause-owner.json

npx tsx scripts/init-demo-season.ts \
  --url https://api.devnet.solana.com \
  --authority-keypair .keys/rituals-devnet-deployer.json \
  --slug october-run-club \
  --title 'October Run Club'

# Paste the JSON causeTokenAccount into src/data/rituals/demoConfig.ts.
# Paste the JSON address from init-demo-season into demoConfig.ts as the Season.
# Commit only the public addresses, never the keypair files.

npx tsx scripts/smoke-solo.ts \
  --url https://api.devnet.solana.com \
  --keypair .keys/rituals-solo-smoke-owner.json \
  --creator-token-account <creator TEST token account> \
  --cause-token-account <causeTokenAccount from create-demo-cause> \
  --season <Season address from init-demo-season> \
  --witness-keypair .keys/rituals-solo-smoke-witness.json \
  --path all
```

**Phone demos:** the app's Season address is compiled in, but it is the
deterministic PDA of the slug, so print it first with
`npx tsx scripts/season-address.ts <slug>`, put it in `demoConfig.ts`, build and
install, and only then create it with `init-demo-season.ts --slug <slug>
--lead-minutes <n>` when the person is at the phone. Joins close when week 1
opens, and a joined ritual's first check-in waits for it too, so keep the lead
short (about 8 minutes) once the APK is already installed.

`init-demo-season` is idempotent: running it again with the same slug decodes
and prints the existing Season instead of submitting a second initialization.
The default Season has 16 windows at `DEMO_CADENCE`, with week 1 opening about
10 minutes after initialization. `smoke-solo --path all` creates four fresh
rituals and waits through week 1 for each path, so it is intentionally a long
proof. Use `--path honor`, `--path miss`, `--path skip`, or `--path witness` for
one path at a time.

Every successful script ends with a JSON object. Representative results are:

```json
{
  "script": "create-demo-cause",
  "label": "Northside Food Bank (demo)",
  "causeTokenAccount": "<public token account>"
}
```

```json
{
  "script": "smoke-solo",
  "paths": ["honor", "miss", "skip", "witness"],
  "assertionFailures": 0,
  "results": [
    { "path": "honor", "eventStatus": "Settled", "claimStatus": "Confirmed" },
    { "path": "miss", "eventStatus": "Settled" },
    { "path": "skip", "eventStatus": "Voided", "voidReason": "DeclaredSkip" },
    { "path": "witness", "eventStatus": "Settled", "claimStatus": "Confirmed" }
  ]
}
```

The script also verifies exact token deltas: activation fees only reach the
configured fee recipient, an honor/witness allocation returns to the creator,
a miss allocation reaches the cause, and a declared skip refunds the creator.
Season `participant_count` moves on activation, while `checked_in_count[0]`
moves exactly once on honor or witness approval.

## Local validator proof (no devnet writes)

The local run uses the supplied built `.so`, a fresh ledger, and throwaway keys
under the Hermes scratch directory. `--create-local-mint` creates a 6-decimal
TEST-like mint, fee-recipient token account, and ProtocolConfig using the same
client `buildInitializeProtocolConfigInstruction` as the protocol setup script.
The mainnet-balance guard is skipped for localhost.

```bash
mkdir -p /home/hound/.hermes/cache/scratch/solo-d-local
solana-test-validator \
  --url localhost \
  --rpc-port 18899 \
  --faucet-port 19900 \
  --gossip-port 18000 \
  --dynamic-port-range 18100-18200 \
  --ledger /home/hound/.hermes/cache/scratch/solo-d-local/ledger \
  --bpf-program 2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p \
    /home/hound/projects/preflight-solo/target/deploy/rituals.so \
  --reset

solana-keygen new --no-bip39-passphrase -o /home/hound/.hermes/cache/scratch/solo-d-local/owner.json
solana-keygen new --no-bip39-passphrase -o /home/hound/.hermes/cache/scratch/solo-d-local/witness.json
solana airdrop 5 --url http://127.0.0.1:18899 -k /home/hound/.hermes/cache/scratch/solo-d-local/owner.json
solana airdrop 2 --url http://127.0.0.1:18899 -k /home/hound/.hermes/cache/scratch/solo-d-local/witness.json

# 1) Mint + ProtocolConfig (the owner here is only the local setup payer)
npx tsx scripts/create-demo-cause.ts \
  --url http://127.0.0.1:18899 \
  --owner-keypair /home/hound/.hermes/cache/scratch/solo-d-local/owner.json \
  --create-local-mint

# 2) The cause account itself MUST be owned by a separate keypair. The program
#    rejects a forfeit destination owned by the creator or witness (6068
#    ForfeitDestinationOwnedByParticipant), so reusing owner.json as the cause
#    owner makes every smoke path fail at create.
solana-keygen new --no-bip39-passphrase -o /home/hound/.hermes/cache/scratch/solo-d-local/cause-owner.json
solana airdrop 1 --url http://127.0.0.1:18899 -k /home/hound/.hermes/cache/scratch/solo-d-local/cause-owner.json
npx tsx scripts/create-demo-cause.ts \
  --url http://127.0.0.1:18899 \
  --owner-keypair /home/hound/.hermes/cache/scratch/solo-d-local/cause-owner.json

npx tsx scripts/init-demo-season.ts \
  --url http://127.0.0.1:18899 \
  --authority-keypair /home/hound/.hermes/cache/scratch/solo-d-local/owner.json \
  --slug october-run-club-local \
  --title 'October Run Club' \
  --fast

npx tsx scripts/smoke-solo.ts \
  --url http://127.0.0.1:18899 \
  --keypair /home/hound/.hermes/cache/scratch/solo-d-local/owner.json \
  --cause-token-account <causeTokenAccount from the SECOND create-demo-cause run> \
  --season <address from init-demo-season JSON> \
  --witness-keypair /home/hound/.hermes/cache/scratch/solo-d-local/witness.json \
  --fast --path all
```

The witness path needs the same scratch directory spelling as the key-generation
commands above (`/home/hound/.hermes/cache/scratch/solo-d-local/witness.json`).
The local Season uses four short windows (30-second period, 15-second claim
window, 10-second resolution grace); this is valid because the program only
requires chronological, non-overlapping windows. The expected local summary is
`assertionFailures: 0` and four results with the statuses shown above.

Stop the validator after the run and delete the scratch keypairs and ledger:

```bash
pkill -f 'solana-test-validator.*18899' || true
rm -rf /home/hound/.hermes/cache/scratch/solo-d-local
```

The local signatures are deliberately not part of the runbook's expected
output; they have no devnet meaning.
