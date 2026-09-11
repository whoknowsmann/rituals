# Development

## Current repository state

The codebase runs the verified Preflight prototype plus pure Rituals contracts, a production Anchor ProtocolConfig initializer, and immutable ritual creation. Mobile Rituals UI and escrow flow are not implemented. Use `docs/plans/2026-09-09-rituals-rebuild.md` for the rebuild and do not claim future acceptance criteria before observing them.

## Observed baseline

Last verified before this documentation correction:

- Ubuntu 24.04 under WSL2;
- Expo `~52.0.49`;
- React Native `0.76`;
- Node/npm/JDK details must be re-read live before build/toolchain decisions;
- 281 JavaScript/TypeScript tests passed;
- TypeScript passed;
- Expo Doctor passed 18/18;
- Android Metro export succeeded;
- a signed EAS development APK was installed/launched on a physical Seeker;
- Windows ADB provided the working USB transport;
- MWA packages/plumbing exist, but a complete real Rituals transaction flow does not.

Do not copy stale system-version values from this document into troubleshooting; inspect live state.

## Clean setup

```bash
npm ci
```

Preserve `package-lock.json`. Do not run `npm audit fix --force`; Expo, React Native, navigation, Solana, and native modules are version-coupled.

## Current JavaScript quality gates

```bash
npm test
npm run typecheck
npm run doctor
```

Re-run and record the exact current test count before the Rituals branch begins. Native integration coverage lives in `program-tests/tests/create_ritual.rs` and `initialize.rs`; it asserts exact Anchor custom error numbers and verifies the persisted account schema/state.

## Android bundle smoke test

Use a disposable directory inside the project:

```bash
rm -rf .verify/expo-export
npx expo export --platform android --output-dir .verify/expo-export
rm -rf .verify/expo-export
```

This proves Metro can emit an Android JavaScript bundle. It is not an APK, installation test, native-module test, wallet test, or standalone release proof.

CI currently writes its export to `/tmp/preflight-expo-export`; the local command above uses `.verify/expo-export` so disposable artifacts stay within the repository and can be cleaned explicitly.

## Android and MWA

Expo Go cannot load the required native Mobile Wallet Adapter package.

Use:

- source/tests/EAS commands in WSL;
- Windows ADB for USB transport;
- physical Solana Seeker as the native/MWA source of truth;
- EAS development build for iteration;
- signed standalone/internal APK for final acceptance.

Before device work, load the Solana Mobile skill's verified Android/EAS reference and inspect live ADB/device state. Do not assume a serial, port, SDK path, Metro process, or wallet session remains current.

Every state-changing action must:

1. present exact effect;
2. request MWA authorization/signature;
3. wait for transaction confirmation;
4. fetch the exact target account/balances;
5. mark success only when expected state is observed.

## Program toolchain

The quarantined compatibility spike established the following observed versions and result:

- Rust `1.93.1` host toolchain; Solana platform build tooling used Rust `1.84.1-dev`;
- Solana CLI `3.0.13` (Agave);
- Anchor CLI `0.31.1`;
- Node `26.3.0`, npm `11.16.0`, Java `21.0.12`;
- Anchor `0.31.1` onchain build and local-validator instruction/readback: validated with Rust-1.84-compatible transitive crate pins;
- existing Expo bundle with the thin web3.js client path: validated;
- native MWA signing for Rituals: not exercised and unvalidated.

Before production program work:

```bash
rustc --version || true
cargo --version || true
solana --version || true
anchor --version || true
node --version
npm --version
java -version
```

Do not install or globally change Rust, Solana CLI, Anchor, Node, Java, Android tooling, or package managers without presenting the exact need and receiving approval.

The spike remains throwaway code under `spikes/001-anchor-mwa-compatibility/`; none of it is production code. Production workspace files may now land using its pinned-version and client strategy, but actual Rituals token escrow, program economics, security, devnet deployment, native MWA signing, and the two-wallet flow still require separate verification.

Production workspace commands:

```bash
# SBF build and generated IDL (uses the root Cargo.lock)
anchor build
# Production crate compilation without native test dependencies
cargo build --locked --workspace
# Host-only ProgramTest harness (uses its independent lock)
cargo test --manifest-path program-tests/Cargo.toml --locked
```

The production workspace intentionally excludes `program-tests`: the SBF build uses the older platform Cargo toolchain and its own compatible lock, while native ProgramTest uses host Cargo and the modern Solana 2.3.1 graph. The native harness contains fifteen tests covering exact state, signer and validation failures, duplicate initialization, API compilation, paused-protocol rejection, and locked-fee immutability across simulated configuration replacement. `anchor build` generates `target/deploy/rituals.so` and `target/idl/rituals.json` without deploying them; on a clean build it may also generate a disposable ignored `target/deploy/rituals-keypair.json`, which is a build artifact and must be removed. The fixed program ID in `Anchor.toml` and `declare_id!` is a **LOCAL TEST PLACEHOLDER** only. A later explicit credential operation must replace and synchronize it before devnet deployment.

Root lock assertions must remain true: it excludes `solana-program-test`, `block-buffer 0.12.1`, `digest 0.11.3`, and `blake3 >= 1.8`; `program-tests/Cargo.lock` contains the native modern graph. CI uses immutable commit pins for checkout, setup-node, cache, and the Rust toolchain. The Anchor CLI source is installed from the reviewed commit corresponding to tag `v0.31.1`; the Solana `v3.0.13` installer is SHA-256 checked before execution. Remote CI remains unverified.

After verification, remove `target/`, `.anchor/`, test ledgers, and deployment keypairs. Never create or retain a stable devnet authority in this repository.

Run the native harness directly with `cargo test --manifest-path program-tests/Cargo.toml --locked`. Do not use `anchor test` for this scaffold: Anchor's command remains deployment-oriented before invoking any configured script, while the credential-free native harness intentionally registers the fixed placeholder ID in ProgramTest.

## Strict TDD workflow

For every new behavior:

1. write one focused failing test;
2. run it and confirm it fails because the behavior is missing;
3. implement only enough to pass;
4. run the focused test;
5. run the relevant full suite;
6. refactor only while green;
7. commit the coherent slice.

Pure money and lifecycle logic must not be written before its failing test.

## Current test files

Preflight/historical foundation:

- `src/domain/preflight/analyze.test.ts`
- `src/domain/preflight/inspectTransaction.test.ts`
- `src/domain/preflight/reviewIdentity.test.ts`
- `src/domain/solana/decodeTransaction.test.ts`
- `src/components/preflight/resultViewModel.test.ts`

Planned Rituals tests are listed task-by-task in the rebuild plan.

## Git workflow

- Repository remains private.
- Create `feat/rituals-rebuild` before production changes.
- Commit the plan before code.
- Keep commits small and green.
- Do not push unless authorized.
- Do not rewrite or delete the known-good Preflight history.
- Keep deployment IDs, test-mint facts, and scrubbed acceptance evidence in docs; keep authorities and secrets out of Git.

Never commit:

- seed phrases/private keys;
- wallet/deployment-authority keypairs;
- Android keystores;
- EAS/GitHub/RPC tokens;
- `.env` files;
- valuable-wallet data;
- unsanitized device logs.

## Dependency strategy

The Expo 52 baseline has unresolved advisories. Classify affected direct/transitive paths and shipped-runtime relevance. Test any framework migration in an isolated worktree, one Expo SDK at a time, and merge only after tests, typecheck, Doctor, Android export, APK, and MWA regression checks pass.

Do not mix an Expo upgrade with the first Rituals vertical slice unless the existing stack blocks the required program/MWA integration.

## Acceptance documents

During implementation create and keep current:

- `docs/DEVNET_DEMO.md`
- `docs/DEVNET_ACCEPTANCE.md`
- `docs/THREAT_MODEL.md`
- `docs/PUBLISHER_CHECKLIST.md`
- `docs/DEMO_SCRIPT.md`
- `docs/SUBMISSION_CHECKLIST.md`
