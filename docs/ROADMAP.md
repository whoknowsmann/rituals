# Roadmap

Status labels describe observed implementation, not aspiration.

## Completed — reusable foundation

- [x] Private GitHub repository and draft PR workflow
- [x] Expo/React Native Android shell
- [x] MWA dependencies and authorization plumbing
- [x] Deterministic legacy/v0 transaction decoding
- [x] Exact reviewed-byte identity
- [x] Fixture-backed Preflight domain/UI prototype
- [x] Unit tests, TypeScript, Expo Doctor, and Android bundle gates
- [x] EAS project and signed development APK
- [x] Physical Seeker install/launch proof
- [x] Consumer-course-correction research across prior winners and dApp landscape
- [x] Three interactive consumer sketches
- [x] Rituals selected, named, and scoped
- [x] Equal event-tranche and no-forfeiture-rake economics
- [x] Multisignature threshold-attestation accountability model
- [x] Corrected Hub MVP and target architecture
- [x] Detailed Rituals rebuild implementation plan

## Completed — M0 contracts and feasibility

- [x] Create private `feat/rituals-rebuild` branch and commit plan/sketches
- [x] Re-run and record current repository baseline
- [x] Inspect Rust/Solana/Anchor toolchains
- [x] Validate Anchor program plus existing Expo/web3.js compatibility in a throwaway spike
- [x] Define Rituals domain types
- [x] Test threshold derivation
- [x] Test exact stake and activation-fee math
- [x] Test settlement conservation and atomic-unit remainder policy
- [x] Test canonical invite/rule digest
- [x] Test lifecycle guards and safe unresolved-claim handling

## M1 — program truth (active)

- [x] Scaffold pinned Anchor workspace and CI (remote CI remains unverified)
- [x] Initialize protocol configuration
- [x] Create immutable ritual/member configuration
- [ ] Fund program-controlled SPL escrow
- [ ] Lock exact activation fee at activation
- [ ] Cancel safely before activation
- [ ] Sign completion claims
- [ ] Record unique eligible approvals
- [ ] Enforce threshold and replay boundaries
- [ ] Question/void unresolved events safely
- [ ] Settle current event only
- [ ] Prove conservation for every 2–6-member attendance combination
- [ ] Generate/freeze IDL and typed React Native program adapter

## M2 — consumer loop

- [ ] Replace Preflight cockpit with Rituals visual system
- [ ] Home and ritual-detail states
- [ ] Broad ritual templates
- [ ] Create/review flow with exact disclosures
- [ ] Private invitation and digest verification
- [ ] Funding/activation status
- [ ] Completion claim flow
- [ ] Confirmation inbox and question path
- [ ] Settlement receipt
- [ ] Loading, empty, rejected, stale, and error states
- [ ] MWA-backed writes and confirmed state readback
- [ ] Optional local reminders if native compatibility permits

## M3 — device and security proof

- [ ] Migrate visible app/MWA identity to Rituals
- [ ] Decide EAS project and Android package migration deliberately
- [ ] Deploy new program and valueless test mint to devnet
- [ ] Native MWA signing for Rituals
- [ ] Run documented two-wallet devnet cycle
- [ ] Verify pending/questioned no-confiscation path
- [ ] Build signed standalone APK
- [ ] Install, cold-start, connect wallet, and run full loop on Seeker
- [ ] Record build ID, hash, package, device facts, signatures, and balances
- [ ] Threat model and program review
- [ ] Dependency advisory classification/remediation decision
- [ ] Publisher/privacy/UGC checklist

## M4 — submission

- [ ] Resolve operative rubric and prize/SKR questions with organizer
- [ ] Add only a verified high-leverage SKR integration after P0
- [ ] Add only bounded non-adjudicative AI after P0, if worthwhile
- [ ] Demo script and capture
- [ ] Pitch brief/deck
- [ ] dApp Store listing assets and policy disclosures
- [ ] Registration, roster, representative, wallet, KYC readiness
- [ ] Clean source/security review
- [ ] Submit at least 24 hours before official close

## Approved future doors — after P0

### P1 candidate: solo rituals

- [ ] Prototype self-attestation for a one-member ritual only after the private-group P0 loop is complete
- [ ] Precommit a non-platform, policy/custody-safe destination for missed tranches
- [ ] Resolve destination custody, refunds, publisher policy, and applicable legal treatment before valuable funds

### Exploratory P2: public/app-wide challenge templates

- [ ] Evaluate versioned challenge-template schemas and narrow adapters
- [ ] Separately design reward source, moderation/UGC, privacy, and Sybil-resistance controls

P0 does not include public discovery, feeds, leaderboards, public groups, stranger betting, or sponsor-funded pools.

## Cut order under schedule pressure

Cut first:

1. AI;
2. SKR discount if not required;
3. local push/reminders;
4. free non-financial mode;
5. polish beyond the core journey;
6. granular dispute voting;
7. backend/push infrastructure.

Never cut:

- exact fee and stake disclosure;
- threshold authorization;
- checked/conservative settlement math;
- no-forfeiture-rake invariant;
- unresolved-claim safety;
- read-after-write verification;
- two-wallet devnet proof;
- standalone Seeker APK;
- honest devnet/mainnet labeling;
- submission accessibility and rehearsal.

## Post-hackathon, only after gates

- Mainnet stablecoin support
- Independent audit and incident response
- Granular dispute resolution
- Push-notification backend
- Encrypted optional evidence
- Larger groups/cycles
- Premium coordination features
- Public/app-wide challenge templates only after separate reward, moderation, privacy, Sybil-resistance, and publisher-policy review
- Production analytics with consent
- Broader token support

Detailed plan: `docs/plans/2026-09-09-rituals-rebuild.md`.
