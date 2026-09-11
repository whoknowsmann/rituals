# Anchor/MWA compatibility spike

Phase 0 Task 3 is a quarantined feasibility spike. Nothing under this directory is production code.

## Scope

The spike proves one minimal Anchor instruction and the corresponding thin mobile client path:

- Anchor 0.31.1 program instruction `set_value(value: u64)`;
- `init` account and signer/payer constraints;
- a dependency-light TypeScript client using the repository's existing `@solana/web3.js` dependency;
- instruction key order, signer/writable flags, Anchor discriminator, and little-endian `u64` encoding;
- local-validator deployment and account readback.

The client deliberately does not import `@coral-xyz/anchor`. MWA is not invoked here: MWA supplies a signer for the already-built web3.js transaction in the existing app, so mobile bundling is tested through the existing Expo export below.

## Live versions observed

```text
rustc 1.93.1
cargo 1.93.1
solana-cli 3.0.13 (Agave)
anchor-cli 0.31.1
avm 0.32.1
Node v26.3.0
npm 11.16.0
Java 21.0.12
Expo ~52.0.49
React Native 0.76.9
@solana/web3.js resolved from root lockfile (1.98.2)
@solana-mobile/mobile-wallet-adapter-protocol-web3js 2.2.2
```

`@coral-xyz/anchor` is not a root dependency and was not added.

## Commands and observed results

All commands below were run from the repository root unless a directory is shown.

### Clean reproducible identity and Anchor build

```bash
rm -rf spikes/001-anchor-mwa-compatibility/program/target \
  spikes/001-anchor-mwa-compatibility/program/test-ledger \
  spikes/001-anchor-mwa-compatibility/.verify
cd spikes/001-anchor-mwa-compatibility
PROGRAM_ID=$(node prepare.mjs)
test "$PROGRAM_ID" = "$(solana-keygen pubkey .verify/identity/anchor_mwa_spike-keypair.json)"
test "$PROGRAM_ID" = "$(grep -oE '[1-9A-HJ-NP-Za-km-z]{32,44}' program/Anchor.toml)"
test "$PROGRAM_ID" = "$(grep -oE '[1-9A-HJ-NP-Za-km-z]{32,44}' program/programs/anchor-mwa-spike/src/lib.rs)"
test "$PROGRAM_ID" = "$(grep -oE '[1-9A-HJ-NP-Za-km-z]{32,44}' client/instruction.ts)"
cd program
anchor build
```

`prepare.mjs` creates a fresh disposable deploy keypair under `.verify/`, then synchronizes its public ID into `Anchor.toml`, `declare_id!`, and the client before compilation. It never writes a private key to tracked files. The equality checks are a required guard: the keypair used for deployment, Anchor's declared ID, and the client ID must be identical.

**PASS (clean-from-no-target run).** The minimal Anchor program compiled and emitted the deployable SBF artifact and IDL. The disposable workspace needed `[profile.release] overflow-checks = true` and `idl-build = ["anchor-lang/idl-build"]`.

The first spike commit's apparent local success was not cleanly reproducible: it depended on stale generated `target/` state. After deleting `target/`, Anchor generated a different deploy keypair (`5b8xpiXkm5YCHmBsJeGYrPQABeSn9WUnb5fYxsCVGPGK`) while the source and client declared `8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB`; deployment then failed at transaction simulation with `Attempt to load a program that does not exist`. This repair makes identity preparation explicit and checks the three IDs before deployment.

The Solana 3.0.13 platform build tool uses rustc 1.84.1-dev, despite the host rustc being 1.93.1. Current crates initially selected edition-2024/Rust-1.85-incompatible versions. The spike's generated `Cargo.lock` pins compatible transitive versions (`blake3 1.5.5`, `zeroize 1.8.1`, `borsh 1.5.7`, `proc-macro-crate 3.1.0`, `indexmap 2.7.1`, and `unicode-segmentation 1.12.0`). No system or global tool was changed.

Earlier build attempts recorded the real compatibility errors:

- `Invalid Base58 string` before replacing the placeholder program ID with a disposable generated keypair;
- ``overflow-checks` is not enabled`;
- `block-buffer 0.12.1` and `zeroize 1.9.0` required edition 2024;
- `unicode-segmentation 1.13.3 requires rustc 1.85.0`.

### Client instruction test

```bash
rm -rf .verify/client
mkdir -p .verify/client
npx tsc spikes/001-anchor-mwa-compatibility/client/instruction.ts \
  spikes/001-anchor-mwa-compatibility/client/instruction.contract.ts \
  --module commonjs --target es2022 --moduleResolution node \
  --esModuleInterop --skipLibCheck --outDir .verify/client
node .verify/client/instruction.contract.js
```

**PASS.** Output:

```text
client instruction test passed: keys, signer/writable flags, discriminator, and u64 data verified
```

The executable test also verifies negative `u64` input is rejected.

### Actual program test

A local Agave validator was started on disposable ports (`18899` RPC, `18000` gossip, `19900` faucet), the just-built program was deployed with the keypair from `prepare.mjs`, and the web3.js TypeScript harness was run:

```bash
cd spikes/001-anchor-mwa-compatibility
PROGRAM_ID=$(cat .verify/program-id.txt)
cd program
solana-test-validator --reset --quiet --rpc-port 18899 --faucet-port 19900 --gossip-port 18000
solana program deploy target/deploy/anchor_mwa_spike.so \
  --program-id ../.verify/identity/anchor_mwa_spike-keypair.json \
  --url http://127.0.0.1:18899
cd ../../..
SPIKE_RPC_URL=http://127.0.0.1:18899 SPIKE_PROGRAM_ID="$PROGRAM_ID" \
  node --experimental-strip-types \
  spikes/001-anchor-mwa-compatibility/client/run-program-test.ts
```

**PASS.** The harness validated the client ID against `SPIKE_PROGRAM_ID`, generated a disposable payer and state keypair, requested a local airdrop, submitted the actual instruction, and read the account back. It verified the program owner, initialized account size, stored authority, and stored value. The `state` init account is now signer+writable, so `[authority, state]` is required and no unnecessary-state-signature warning is emitted.

The Anchor CLI's normal TypeScript test path was not used because the root intentionally has no `@coral-xyz/anchor` dependency. The narrower local-validator harness is the recorded equivalent and uses the same Anchor-generated instruction ABI.

### Existing Expo mobile bundling

```bash
rm -rf .verify/expo-export
npx expo export --platform android --output-dir .verify/expo-export
find .verify/expo-export -type f -print
rm -rf .verify/expo-export
```

**PASS.** The existing Expo 52 application exported an Android JavaScript bundle and artifacts were present. The recommended mobile strategy therefore remains the existing `@solana/web3.js` plus MWA protocol-web3js path, not adding Anchor's JavaScript client to the app. This is a Metro bundle smoke test, not a native-wallet signing or APK acceptance test.

## Tradeoffs and production boundary

- Keep Anchor onchain if the Rituals program needs its account constraints and IDL generation.
- Use a small typed web3.js client generated/maintained from a frozen IDL for the Expo app unless a future isolated test proves an Anchor client can bundle without materially increasing the mobile surface.
- Do not copy this program, generated keypair, `target/`, validator ledger, or spike client into production.
- The local validator and keypairs are disposable; no mainnet/devnet wallet, seed phrase, credential file, deployment authority, EAS configuration, or MWA wallet session was used.
- The Solana platform toolchain's Rust 1.84.1 compatibility requires lockfile pinning inside a future program workspace; it is a reproducibility concern, not a reason to alter the root toolchain.

## Verdict: VALIDATED

The requested compatibility evidence is complete after a clean-from-no-target identity preparation, rebuild, deployment, transaction, and readback: Anchor onchain plus a thin existing-web3.js/MWA mobile client. This validates feasibility only; it does not validate Rituals economics, security, production deployment, native MWA signing, or the full Anchor client bundle.

### Cleanup

After verification, stop the validator; remove `program/target`, `program/test-ledger`, `.verify`, generated deploy keypairs, and temporary export output; then restore the three tracked public-ID files rewritten by `prepare.mjs`:

```bash
git restore \
  spikes/001-anchor-mwa-compatibility/program/Anchor.toml \
  spikes/001-anchor-mwa-compatibility/program/programs/anchor-mwa-spike/src/lib.rs \
  spikes/001-anchor-mwa-compatibility/client/instruction.ts
```

None of the generated artifacts or temporary identity changes are part of the spike commit.
