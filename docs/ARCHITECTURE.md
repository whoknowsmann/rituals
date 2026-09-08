# Architecture

## Implemented flow

    harmless normalized fixture
        -> deterministic analyzer
        -> versioned PreflightResult
        -> tested presentation view model
        -> React Native Preflight screen

The analyzer and view model are pure TypeScript. They perform no network access, signing, transaction submission, or arbitrary rendering.

## Mobile shell

The application is based on the official Solana Mobile Expo template. `App.tsx` provides:

- React Query
- Solana cluster context
- Solana connection context
- React Native Paper theme
- React Navigation

`src/navigators/HomeNavigator.tsx` renders the wallet/settings top bar and `PreflightScreen`.

The template’s authorization utility retains devnet MWA connection plumbing. Real Android authorization has not yet been exercised in this repository.

## Domain contract

`src/domain/preflight/types.ts` defines normalized evidence and the versioned `PreflightResult` contract.

Inputs currently cover:

- program support observations
- observed asset movements
- authority/delegate changes
- simulation state
- unresolved elements
- explicit upstream evidence-completeness signal

Outputs separate:

- verdict and confidence
- analysis completeness
- deterministic summary
- observations
- inferred intent
- asset changes
- authority changes
- programs
- warnings
- unsupported/unresolved identifiers
- simulation state and reason
- recommended action
- fixed disclaimer

## Deterministic rules currently implemented

- Severe authority loss produces `ABORT`.
- `CLEAR` requires upstream-complete evidence, only supported programs, no unresolved elements, and successful simulation.
- All other cases produce `HOLD`.
- Unknown programs create uncertainty; they do not independently produce `ABORT`.
- Simulation failure or absence prevents `CLEAR`.

These rules operate on normalized evidence. They do not yet decode a real Solana transaction.

## Presentation

`src/components/preflight/resultViewModel.ts` maps domain values into restrained cockpit language:

- `CLEAR` -> `CLEAR FOR TAKEOFF`
- `HOLD` -> `HOLD POSITION`
- `ABORT` -> `ABORT SIGNING`

The result screen makes fixture status and incomplete analysis visible and does not claim arbitrary cross-app inspection.

## Next architectural slice

A transaction decoder will sit before normalized evidence:

    serialized transaction
        -> input validation
        -> legacy/versioned decode
        -> address lookup table resolution status
        -> supported instruction observations
        -> normalized evidence

A later simulation adapter will enrich—but not replace—the decoder’s facts. Exact reviewed-byte identity must exist before any transaction is forwarded to a wallet.

## Optional services

No backend exists. Add one only for protected hosted-model credentials, validated community-report aggregation, or public metadata caching/rate limiting. Core transaction analysis must remain usable without it.
