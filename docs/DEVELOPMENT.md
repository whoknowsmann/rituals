# Development

## Current state

Rituals is the active product. Home, detail, claim, confirmation, and receipt data are still deterministic and fixture-backed. The create/review → connected host/member roster → funding-lobby journey is live: the funding lobby submits a **real** Create transaction against the devnet deployment. Current state and the next gate are in `docs/STATUS.md`.

The Anchor program is **deployed to devnet** (`2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p`) and approved through terminal vault closure. The typed mobile client implements RPC reads, all-action preparation, exact message/signature binding, an opaque split submission/confirmation boundary, MWA submission, confirmation, and authoritative readback. The deployment configuration is `deployed`, and the funding-lobby Create CTA invokes a state-changing Ritual action; the other lifecycle actions are proven on devnet by script but have no screen wiring yet. Submitted-action handles are process-local capabilities; never persist or reconstruct them as authority after reload.

The JavaScript/TypeScript source contains only active Rituals app code plus generic shell, cluster, and wallet plumbing. The retired product is preserved only by Git history.

## Setup

```bash
npm ci
```

Do not run `npm audit fix --force`; Expo, React Native, navigation, Solana, and native modules are version-coupled.

## JavaScript quality gates

```bash
npm test
npm run typecheck
npm run doctor
```

The hygiene test scans active `App.tsx` and `src` for the archived product name and deleted imports. Keep it green when adding screens or routes. The exact test total is measured from the current checkout; do not copy historical totals into status claims.

## Android bundle smoke test

```bash
rm -rf .verify/expo-export
npx expo export --platform android --output-dir .verify/expo-export
rm -rf .verify/expo-export
```

This proves Metro can emit an Android JavaScript bundle. It is not an APK, native-module test, wallet test, or standalone release proof. Expo Go cannot load native Mobile Wallet Adapter.

## Wallet and build identity

MWA authorization uses Rituals on Solana devnet. The wallet URI is still the private repository URI until a public HTTPS origin exists. The Expo slug, Android package, iOS bundle identifier, and EAS project ID remain unchanged legacy build identifiers; do not change them as part of this product migration without a separate build-linkage decision.

Use a custom development or standalone Android build for native MWA checks. Every future state-changing action must show its exact effect, request MWA authorization, wait for confirmation, read back the target state, and mark success only from observed state.

## Native boundary

Rust, program tests, Cargo, and Anchor files are maintained independently from this JavaScript/docs migration. Run their pinned commands only when working on that boundary. Existing local/native artifacts and placeholder IDs are not deployment credentials or production proof.

## TDD and hygiene

For new behavior: write a focused failing test, run it, implement the minimum, run the focused test, run the relevant suite, then refactor while green. Never add secrets, wallet material, keystores, tokens, or unsanitized device logs.

## Git workflow

Keep the repository private, make coherent commits, do not push without authorization, and use Git history as the rollback boundary for archived product work. Stage only the paths owned by the current change.
