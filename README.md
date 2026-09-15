# Rituals

Rituals is a Solana Mobile accountability app for private groups: friends commit to a recurring activity, fund an equal stake, and confirm completion under a shared rule.

## Current status

The active app is a fixture-backed Rituals experience covering home, template/create/review, member roster, pre-funding lobby, detail, claim, confirmation, and settled/voided receipt previews. Fixture data and actions are labeled `DEVNET` / `NO REAL VALUE`; visible screens do not submit transactions.

The local Anchor program is approved through creation, exact funding, activation, cancellation/refunds, signed claims, friend attestations, safe questioning, conservation-safe event settlement, and terminal zero-balance vault closure. Beneath the fixture UI, the typed client implements authoritative RPC reads, opaque preparation for all eleven actions, exact prepared-message binding, runtime-opaque split submission/confirmation handles, Mobile Wallet Adapter submission, blockheight confirmation, and action-specific readback against injected transports. Split handles expose only immutable display metadata, are accepted only by their issuing client, share duplicate confirmation work, and intentionally do not survive reloads.

The current deployment configuration is deliberately `not-deployed`, so the application facade fails closed before RPC or wallet work and the funding-lobby transaction CTA remains disabled. No public-cluster deployment, native Seeker signing, or real onchain lifecycle has been verified yet.

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
