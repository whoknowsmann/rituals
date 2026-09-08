# Development

## Observed environment

Verified on 2026-09-08 under Ubuntu 24.04 WSL2:

- Node.js 26.3.0
- npm 11.16.0
- OpenJDK 21.0.12
- No `ANDROID_HOME`
- No standalone Gradle command
- No ADB

The package metadata supports Node 18+, but the exact release CI version has not been selected.

## Clean setup

    npm ci

Do not use `npm audit fix --force`; current audit recommendations include incompatible major downgrades/upgrades across Expo, React Native, navigation, and SPL Token.

## Quality gates

    npm test
    npm run typecheck
    npm run doctor

Current observed result:

- 13 tests pass across two files
- TypeScript passes
- Expo Doctor passes 18/18 checks

## Bundle smoke test

    rm -rf /tmp/preflight-expo-export
    npx expo export --platform android --output-dir /tmp/preflight-expo-export

This verifies Metro can produce the Android JavaScript bundle. It does not produce or install an APK.

## Android and MWA

Expo Go does not support the required native MWA package. Use a custom development build with an Android device/emulator and an MWA-compatible wallet.

This machine currently lacks Android SDK/ADB configuration. Options to evaluate next:

1. Configure an existing Windows Android SDK for WSL use if one is already installed.
2. Use EAS cloud build after authenticating an Expo account.
3. Install local Android command-line tooling only with explicit owner approval.

A real MWA authorization must be exercised before marking wallet integration complete.

## TDD workflow

For production logic:

1. Add one behavior test.
2. Run it and confirm the expected failure.
3. Implement the minimum behavior.
4. Run the focused test.
5. Run the full tests and typecheck.
6. Refactor only while green.

## Current test files

- `src/domain/preflight/analyze.test.ts`
- `src/components/preflight/resultViewModel.test.ts`

## Git workflow

The private repository currently develops on `main` during bootstrap. Move feature work to short-lived branches once the baseline is stable. Do not push credentials, wallet material, Android keystores, Expo tokens, or `.env` files.
