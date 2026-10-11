# Development

## Current state

Solo Rituals on devnet, proven on a Solana Seeker. What is measured and what is
next: `docs/STATUS.md` (read it first). Product facts: `docs/submission/FACTS.md`.
Structure: `docs/ARCHITECTURE.md`.

The JavaScript/TypeScript source contains the active app plus generic shell,
cluster and wallet plumbing. Group, witness and Seasons code is kept and hidden
behind `SOLO_ONLY` (`src/features/rituals/productScope.ts`).

## Setup

```bash
npm ci                      # runs the postinstall MWA wallet-package patch
```

Do not run `npm audit fix --force`; Expo, React Native, navigation, Solana and
native modules are version-coupled.

## Quality gates

```bash
npm test                    # vitest, whole suite (~7 s); read the summary line
npm run typecheck
npm run doctor
```

Keep testing proportionate: while working, run the tests for the files you
touched plus `typecheck`; run the full suite once before an APK build or a
merge. Measure counts from the checkout; never copy a historical total into a
status claim.

## Devnet scripts (WSL)

Node devnet scripts can hang on the WSL resolver's AAAA lookups. Preload IPv4:

```bash
export NODE_OPTIONS="--require $PWD/scripts/lib/ipv4-only.cjs"
npx tsx scripts/verify-devnet-config.ts        # on-chain config matches the client
npx tsx scripts/smoke-app-solo.ts              # create → stamp → settle key closes 2 weeks (kept + missed)
npx tsx scripts/smoke-app-solo.ts --cadence real
npx tsx scripts/smoke-app-solo.ts --simulate-wallet-fee-change
```

Run the solo smoke before every APK build that touches the chain path. Keys for
scripts sit in `.keys/` (gitignored); never use the Solana CLI default keypair.

## Device

Seeker over USB through the Windows adb (`./scripts/adb.sh`), never a Linux
`adb`. `./scripts/check-device.sh` reports the device and the installed build.
`scripts/ui.py` drives screens (dump / tapt / type / shot); `scripts/capture.sh`
takes screenshots, recordings (`take` for the demo), logs and crash buffers.

## Build and install

```bash
TAG=dN scripts/build-apk-local.sh     # local EAS build (~4 min warm) -> artifacts/rituals-dN.apk, staged for adb
./scripts/adb.sh push 'C:\Users\<user>\AppData\Local\Temp\rituals\rituals-dN.apk' /data/local/tmp/rituals.apk
./scripts/adb.sh shell pm install -r /data/local/tmp/rituals.apk   # then dismiss Play Protect: "Don't send"
```

JDK 17 is required (`~/.local/jdk`); stop Gradle with `./gradlew --stop`, never
by killing daemons from a compound command. Confirm the install with
`dumpsys package com.whoknowsmann.rituals | grep lastUpdateTime`, then walk the
new build on the phone up to the wallet prompt.

## Wallet and identity

MWA authorization identifies the app as Rituals at
`https://rituals.whoknowsman.com`. Seed Vault Wallet must be set to Devnet; a
devnet transaction against a mainnet setting shows the wallet's own "Network
mismatch" sheet and sends nothing. Demo accounts are fresh Seed Vault accounts
with devnet assets only; the faucet (`https://faucet.whoknowsman.com`) funds
them from inside the app.

## Native boundary

Rust, program tests, Cargo and Anchor files are maintained separately. Native
tests: `cargo test --manifest-path program-tests/Cargo.toml --locked`. A
program change that alters an account layout or a value the shipped decoder
asserts is a rollout, not a routine deploy (see `docs/STATUS.md`).

## TDD and hygiene

For new behavior: write a focused failing test, run it, implement the minimum,
run the focused test, run the relevant suite, then refactor while green. Never
add secrets, wallet material, keystores, tokens or unsanitized device logs.

## Git

`feat/solo-screens` is the working branch; `main` is fast-forwarded to it for
release. Coherent commits, stage only the paths owned by the change.
