# Rituals

Rituals is a Solana Mobile accountability app for private groups: friends commit to a recurring activity, fund an equal stake, and confirm completion under a shared rule.

## Current status

The active app is a fixture-backed Rituals experience covering home, template/create/review, detail, claim, confirmation, and settled/voided receipt previews. It labels fixture data `DEVNET` / `NO REAL VALUE` and submits no transaction. The local Anchor program is approved through creation, exact funding, activation, cancellation/refunds, signed claims, friend attestations, safe questioning, and conservation-safe event settlement. Real devnet, MWA writes, and terminal vault closure remain unverified.

The app uses hosted-model-compatible architecture but no hosted model is active in the current home slice. Wallet authorization is configured for Solana devnet through Mobile Wallet Adapter. No real transaction is submitted by the fixture home actions.

This branch contains no active archived product UI or domain code. Git history is the rollback/archive boundary.

## Stack

- Expo `~52.0.49` / React Native `0.76`
- TypeScript, React Navigation, React Native Paper, TanStack Query
- `@solana/web3.js`, SPL Token, Solana Mobile Wallet Adapter
- Vitest and EAS Android builds

`app.json` retains the existing slug, Android package, iOS bundle identifier, and EAS project ID as legacy build identifiers so the current build linkage is not broken. They are not the visible product identity; the visible name and wallet identity are Rituals. The private-repository URI in wallet identity remains temporary until a public origin exists.

## Local verification

```bash
npm ci
npm test
npm run typecheck
npm run doctor
rm -rf .verify/expo-export
npx expo export --platform android --output-dir .verify/expo-export
rm -rf .verify/expo-export
```

The export is a disposable Metro bundle smoke test, not APK, native MWA, wallet, or release proof. Expo Go cannot exercise the native MWA package.

## Safety boundary

P0 is devnet with valueless test assets and explicit no-real-value labeling. Never request or store seed phrases, private keys, tokens, keystores, or valuable wallet material. A wallet signature proves attestation, not physical-world truth. Mainnet and valuable assets require independent program review, legal/publisher review, privacy controls, and an exercised two-wallet flow.

## Documentation

- `docs/ARCHITECTURE.md` — observed active boundaries
- `docs/DEVELOPMENT.md` — setup and verification
- `docs/ROADMAP.md` — completed and remaining work
- `docs/SECURITY.md` — current limits and trust boundaries
- `docs/plans/2026-09-09-rituals-rebuild.md` — historical rebuild plan

## Sketch

The retained consumer sketch is `sketches/consumer-pivot/001-rituals/`; its README and screenshot are the only active consumer-pivot artifacts.
