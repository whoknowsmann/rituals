# Roadmap

> Current state and the next gate live in `docs/STATUS.md`, which is measured and
> re-verified. This file is the longer completed/remaining breakdown. If the two
> disagree, STATUS.md wins.
>
> **2026-09-26: direction changed to SOLO FIRST.** The active plan is
> `docs/plans/solo-first-2026-09-26.md` (phases A–E). The "Explicitly deferred"
> note about solo below is obsolete.

Status labels describe observed implementation, not aspiration. Rituals is the sole product in this repository. An earlier, unrelated prototype was fully removed from active source; it survives only under the `archive/*` Git tags and is not part of this submission.

## Complete

### Product and mobile foundation

- [x] Expo/React Native Android shell and Rituals navigation
- [x] Rituals domain contracts: draft, invite, lifecycle, money, settlement, and thresholds
- [x] Fixture-backed home/dashboard with loading, funding, confirmation, completed, empty, and error states
- [x] Fixture-backed templates, create/review, detail, claim, friend-confirmation, and settlement-receipt journeys
- [x] Connected host plus immutable two-to-six-member roster entry
- [x] Honest pre-funding lobby with exact preview terms and no fake invite, persistence, or transaction behavior
- [x] Explicit devnet/no-real-value and preview-only disclosures
- [x] Remove predecessor-specific UX and domain logic from active source

### Approved local Anchor protocol

- [x] Protocol configuration and immutable two-to-six-member Ritual creation
- [x] Classic SPL Token mint/account validation and separate stake/fee vaults
- [x] Exact HOST/SPLIT funding, activation-fee transfer, and safe cancellation refunds
- [x] Event initialization, signed completion claims, friend approvals, and questioning
- [x] Conservation-safe settlement with settled/voided receipts and no protocol forfeiture share
- [x] Fail-closed zero-balance terminal vault closure with immutable creator rent return
- [x] Specification and custody/security review through terminal closure
- [x] 180 native Solana test functions in `program-tests/` (measured 2026-09-18)

### Typed mobile Solana client

- [x] Frozen Anchor IDL and explicit local/current deployment identity boundary
- [x] Canonical PDA helpers with cross-language vectors
- [x] Fail-closed ProtocolConfig/Ritual/Event/Claim decoders from Rust-serialized fixtures
- [x] Exact instruction-data encoders and canonical account-meta builders for all eleven actions
- [x] Confirmed RPC reads with monotonic `minContextSlot`, sparse-response rejection, error redaction, and sealed read provenance
- [x] Authoritative same-slot ProtocolConfig/Ritual/Event/all-Claims bundles with bounded event-advance retry and bitmap correlation
- [x] Opaque preparation for Create/Fund/Activate/Cancel/Close and Initialize/Claim/Approve/Question/Finalize
- [x] Exact fee/rent/token summaries, per-preparer provenance, message digest, and mutation detection
- [x] Blockheight confirmation and action-specific authoritative readback for all lifecycle and event actions
- [x] Exact prepared-message binding to the wallet-returned signature
- [x] Runtime-opaque split `submitPrepared` / `confirmSubmitted` boundary with issuing-client authority and duplicate-confirmation memoization
- [x] Mobile Wallet Adapter authorization and single-transaction submission transport
- [x] Safe application facade gated by devnet cluster and authorized deployment identity
- [x] 1,906 JavaScript/TypeScript cases across 65 files (measured 2026-09-18)

## Active integration sequence

1. [x] Expose a truthful submitted-versus-confirming client boundary without weakening transaction identity or readback
2. [x] Define the missing honest Create inputs: schedule UX, canonical rule serialization/digest, nonce policy, and authoritative protocol/mint/fee-recipient sources
3. [x] Wire the visible Create state machine: review → wallet → submitted → confirming → confirmed/error
4. [ ] Generate a digest-bound invite only after authoritative Create confirmation
5. [ ] Build invite/join and dedicated member-funding progress
6. [ ] Add funding and activation transaction state machines
7. [ ] Replace fixture dashboard/detail/claim/confirmation/receipt actions with authoritative RPC and submitted transactions
8. [ ] Handle stale, rejected, expired, offline, duplicate-tap, reload-recovery, and reconnect behavior across visible actions

The typed transaction stack is deployed to devnet and exercised as real transactions. The deployment configuration is `deployed`; the funding-lobby Create CTA submits for real. Remaining visible screens still read fixtures. Every on-chain proof so far was signed by CLI keypairs — Mobile Wallet Adapter signing from the device is the next gate.

Compute policy for the remaining build:

- Keep adversarial depth for custody, authority, arithmetic, serialization, transaction identity, and readback.
- Do not add broad malformed-input Cartesian matrices without a concrete boundary risk or RED defect.
- Use focused tests during implementation and one aggregate suite per milestone.
- Run Expo Doctor, Android export, and packaging only at phase boundaries.
- Use one bounded implementation task and one combined spec/security review per milestone.

## Remaining mobile UX

- [ ] Digest-bound invite/join flow
- [ ] Dedicated member-funding and activation progress
- [ ] Authoritative dashboard, detail, claim, confirmation, and receipt data/actions
- [ ] Loading, stale, rejected, expired, offline, and reconnect behavior
- [ ] Final icon, splash, adaptive icon, and visual polish
- [ ] Accessibility and Seeker-size QA

## Devnet, device, and release proof

- [x] Provision an authorized devnet program identity
- [x] Deploy to devnet with valueless classic SPL test assets
- [x] Initialize and verify ProtocolConfig against the client contract
- [x] Verify the complete lifecycle on devnet with CLI keypairs (17/17 assertions)
- [x] Install and launch the APK on Jack's physical Seeker
- [x] Sign a real Create through Mobile Wallet Adapter from the Seeker (2026-09-25 `3PkBnAG7…`; 2026-09-26 bundled Create+fund `23Hwtf2h…`)
- [x] Last-member Fund+Activate in one approval on the Seeker (2026-09-26 `5qdDRUw6…`)
- [ ] **NEXT GATE:** solo honor ritual on the Seeker: create → stamp check-in → settle → receipt (after Phase A–C of the solo-first plan)
- [ ] Group claim/approve/settle on the Seeker (blocked by bug B1: demo first event opens a week out)
- [ ] Build, sign, install, and verify the standalone release APK
- [ ] Run a broader integrated adversarial/security audit after the complete app is wired
- [ ] Capture demo video, screenshots, pitch, privacy copy, and submission materials
- [ ] Final release/submission QA and Jack's explicit approval

## Explicitly deferred

- ~~Solo rituals are a P1 candidate~~ → solo is now the primary product (2026-09-26).
- Seasons ship as honest counts + join only. Public feeds with names, leaderboards, stranger betting, and sponsor pools stay out.
- AI and reminders are optional follow-on work.
- Mainnet and valuable-token support are not part of the hackathon acceptance path.

Build identifiers are Rituals throughout: name `Rituals`, slug `rituals`, Android package and iOS bundle identifier `com.whoknowsmann.rituals`, EAS owner `argussmithson`. The EAS relink landed in 8052f1c and the Android build pipeline was re-proven afterwards: both a preview and a development-client APK built and installed on the Seeker.

AI/SKR note: the SKR balance read is real and unit-tested, but it is not wired into any screen yet (checked 2026-09-30), so no discount is live. The template-picker suggestions are deterministic and on-device — deliberately, so nothing can fail mid-demo — and must not be presented as an AI integration in the submission.
