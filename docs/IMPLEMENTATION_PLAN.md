# Preflight Initial Vertical-Slice Implementation Plan

Status: approved implementation baseline

## Objective

Prove one complete, honest inspect-before-sign product path before adding AI, community reports, Panic Mode, or other secondary surfaces.

The first slice will accept normalized transaction evidence from safe fixtures, evaluate it deterministically, and render a mobile Preflight result. MWA and real serialized-transaction plumbing are separate checkpoints layered onto this tested contract.

## Product boundary

Preflight does not intercept arbitrary wallet requests and is not a universal signing firewall. It analyzes transactions created inside Preflight, explicitly imported supported transactions, safe fixtures, or confirmed historical signatures.

## Stack baseline

Start from official Solana Mobile Expo template v3.0.0 at upstream commit `04cdd54bc3a9234b518412c51b0d6c5f1d32dc29`.

Observed upstream baseline:

- Expo 52.0.43
- React Native 0.76.9
- React 18.3.1
- Mobile Wallet Adapter protocol packages 2.2.2
- `@solana/web3.js` 1.x
- TypeScript 5.x

Before product changes:

- Install from the committed lockfile.
- Run TypeScript checks.
- Run Expo diagnostics.
- Record incompatibilities rather than silently upgrading the complete stack.
- Add real tests; the template’s placeholder test script is not acceptable.

## Milestone 1 — deterministic risk contract

### Files

- `src/domain/preflight/types.ts`
- `src/domain/preflight/analyze.ts`
- `src/domain/preflight/fixtures.ts`
- `src/domain/preflight/analyze.test.ts`
- Test-runner configuration and package scripts as required

### Input contract

Normalized public evidence:

- supported/unsupported program observations
- asset movements
- authority/delegate changes
- simulation status
- unresolved elements

The analyzer must not execute, sign, fetch, or render anything.

### Output contract

Versioned result containing:

- verdict: `CLEAR | HOLD | ABORT`
- confidence: `HIGH | MEDIUM | LOW`
- analysis completeness
- observations and inferred intent as separate arrays
- asset and authority changes
- programs
- warnings
- unsupported elements
- simulation status/reason
- recommended action
- fixed disclaimer

### TDD acceptance tests

Implement one RED→GREEN cycle at a time:

1. Unsupported or incomplete required evidence can never produce `CLEAR`.
2. A fully supported benign transfer with successful simulation produces `CLEAR` and the expected movement.
3. Severe authority-loss evidence produces `ABORT`.
4. An unknown program without severe evidence produces `HOLD`, not `ABORT`.
5. Simulation failure reduces completeness and prevents `CLEAR`.

### Acceptance criteria

- Every production behavior has a test that was observed failing first.
- Focused and full tests pass.
- TypeScript check passes.
- Output contains no generated prose or hidden network dependency.

## Milestone 2 — result-screen tracer bullet

### Files

- `src/screens/PreflightScreen.tsx`
- Small presentational components under `src/components/preflight/`
- Component tests only if the selected React Native test stack is stable

### Behavior

- Select one of three safe fixtures.
- Show verdict, confidence/completeness, observed changes, warnings, unsupported elements, simulation state, recommended action, and disclaimer.
- Show explicit fixture labeling.
- Preserve error and empty states.

### Acceptance criteria

- CLEAR, HOLD, and ABORT fixtures visibly differ.
- Incomplete analysis is never visually reassuring.
- No claim implies arbitrary cross-app interception.
- App remains useful without AI or a backend.

## Milestone 3 — transaction decoder

### Files

- `src/domain/solana/decodeTransaction.ts`
- `src/domain/solana/decodeTransaction.test.ts`
- Safe serialized fixtures under `src/fixtures/`

### Behavior

- Validate input encoding and size.
- Decode legacy and versioned transactions.
- Identify fee payer, signer/writable keys, program IDs, and supported System/SPL instructions.
- Report unresolved address lookup tables and unsupported instructions.
- Never sign or submit input.

### Acceptance criteria

- Safe fixtures decode deterministically.
- Malformed and oversized inputs fail safely.
- Unknown/unsupported data remains explicit.
- Decoder output can feed Milestone 1 without UI coupling.

## Milestone 4 — reviewed transaction identity

### Files

- `src/domain/preflight/reviewIdentity.ts`
- `src/domain/preflight/reviewIdentity.test.ts`

### Behavior

- Hash canonical reviewed bytes.
- Compare bytes/hash immediately before any future wallet handoff.
- Reject mismatches and require re-analysis.

### Acceptance criteria

- Exact match succeeds.
- Any byte change fails.
- No implementation mutates reviewed bytes to make them signable.

## Milestone 5 — Mobile Wallet Adapter checkpoint

### Behavior

- Authorize with a compatible wallet on Android.
- Display public key and connection/cancellation/error state.
- Do not claim completion from mocks.
- Only add wallet handoff after exact-byte identity checks exist.

### Acceptance criteria

- Real Android authorization exercised on hardware or emulator with an MWA wallet.
- Evidence and exact steps recorded in `docs/DEVELOPMENT.md`.
- If Android tooling or hardware is unavailable, document the exact blocker and do not mark complete.

## Deferred until the first slice is verified

- Hosted AI narration
- SKR staking/Guardian lookup
- Signed community reports
- Panic Mode
- Community backend
- Android share/deep-link import
- Devnet report anchoring

## Verification commands

These will be finalized after dependency inspection:

- clean dependency installation from lockfile
- focused unit test command
- full unit test command
- TypeScript typecheck
- Expo diagnostics
- Android build or EAS build command

## Documentation deliverables

- `README.md`: observed status and exact commands
- `docs/ARCHITECTURE.md`: implemented component boundaries
- `docs/DEVELOPMENT.md`: environment, tests, Android build, MWA exercise
- `docs/SECURITY.md`: threat model, fixture safety, secrets, limitations
- `docs/ROADMAP.md`: complete versus deferred work

Documentation must describe observed behavior, not intended capability.

## Rollback and security

- Keep the repository private during early implementation.
- Never commit API keys, wallet secrets, keystores, Expo tokens, or auth tokens.
- Keep fixtures harmless: devnet/test accounts, expired blockhashes, or otherwise non-actionable payloads.
- Revert to the preceding coherent commit if template upgrades destabilize MWA or Android builds.
- Do not rewrite upstream history; record the template commit used.
