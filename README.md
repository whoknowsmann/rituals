# Preflight

Preflight is an Android-first Solana transaction inspection companion for Seeker.

It is designed to decode and explain supported transactions before wallet approval. It does not intercept arbitrary requests from other apps and does not guarantee transaction safety.

## Current status

Implemented:

- Official Solana Mobile Expo template baseline
- Mobile Wallet Adapter connection plumbing inherited from the official template
- Deterministic, pure transaction-evidence risk contract
- Three explicitly labeled harmless normalized fixtures
- Conservative CLEAR / HOLD / ABORT rules
- Mobile cockpit-style result screen with facts, uncertainty, warnings, simulation status, and recommended action
- Automated domain and presentation-model tests

Not yet implemented or verified:

- Serialized Solana transaction decoder
- RPC simulation adapter
- Exact reviewed-byte identity check
- Real Android MWA authorization exercise
- APK build
- AI narration
- SKR/staking lookup
- Signed safety reports

No unfinished capability above should be presented as working.

## Local setup

Prerequisites:

- Node.js 18 or newer; current development verification used Node 26.3.0
- npm

Install exactly from the lockfile:

    npm ci

Run tests:

    npm test

Run TypeScript checks:

    npm run typecheck

Run Expo diagnostics:

    npm run doctor

Verify an Android JavaScript bundle without producing an APK:

    npx expo export --platform android --output-dir /tmp/preflight-expo-export

Start the custom-development-client workflow:

    npm start

Expo Go is not sufficient for Mobile Wallet Adapter native functionality.

## Android build status

This WSL environment currently has Java 21 but no Android SDK, `ANDROID_HOME`, Gradle command, or ADB. A local APK has therefore not been produced. Expo/EAS cloud build has not been exercised and may require account authentication.

A successful JavaScript bundle export is not an APK build and is not evidence that MWA works on Android hardware.

## Dependency baseline

The project started from official template v3.0.0 at upstream commit:

    04cdd54bc3a9234b518412c51b0d6c5f1d32dc29

The template uses Expo 52 / React Native 0.76 and currently carries unresolved dependency advisories. After compatible fixes, npm reports 50 advisories: 34 moderate, 15 high, and 1 critical. Do not use `npm audit fix --force` blindly; it proposes incompatible major framework changes. Framework migration or targeted mitigation is required before release.

## Documentation

- `docs/IMPLEMENTATION_PLAN.md` — committed build sequence and acceptance criteria
- `docs/ARCHITECTURE.md` — implemented boundaries and data flow
- `docs/DEVELOPMENT.md` — verified commands and environment blockers
- `docs/SECURITY.md` — threat model, fixture rules, and limitations
- `docs/ROADMAP.md` — completed and deferred milestones

Product and hackathon decisions are maintained in Jack’s Hub Obsidian vault under `Projects/Preflight`.

## Repository visibility

The repository is private during early implementation. Hackathon submission visibility will be changed only when required and after a secrets/history review.

## License

No license has been selected yet. All rights are reserved until that decision is made.
