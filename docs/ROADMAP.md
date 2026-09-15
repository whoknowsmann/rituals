# Roadmap

Status labels describe observed implementation, not aspiration. Rituals is the sole active hackathon product; the retired Preflight implementation remains available through Git history.

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
- [x] 176 native Solana test cases at the approved protocol checkpoint

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
- [x] 1,758 JavaScript/TypeScript cases across 56 files at the current green checkpoint

## Active integration sequence

1. [x] Expose a truthful submitted-versus-confirming client boundary without weakening transaction identity or readback
2. [>] Define the missing honest Create inputs: schedule UX, canonical rule serialization/digest, nonce policy, and authoritative protocol/mint/fee-recipient sources
3. [ ] Wire the visible Create state machine: review → wallet → submitted → confirming → confirmed/error
4. [ ] Generate a digest-bound invite only after authoritative Create confirmation
5. [ ] Build invite/join and dedicated member-funding progress
6. [ ] Add funding and activation transaction state machines
7. [ ] Replace fixture dashboard/detail/claim/confirmation/receipt actions with authoritative RPC and submitted transactions
8. [ ] Handle stale, rejected, expired, offline, duplicate-tap, reload-recovery, and reconnect behavior across visible actions

The typed transaction stack is implemented and tested against deterministic transports. The current deployment configuration is deliberately `not-deployed`; visible transaction CTAs remain disabled and no public-cluster transaction has occurred.

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

- [ ] Provision an authorized local-only devnet program identity
- [ ] Deploy to devnet with valueless classic SPL test assets
- [ ] Verify the complete two-wallet lifecycle
- [ ] Test native Mobile Wallet Adapter on Jack's Solana Seeker
- [ ] Build, sign, install, and verify the standalone APK
- [ ] Run a broader integrated adversarial/security audit after the complete app is wired
- [ ] Capture demo video, screenshots, pitch, privacy copy, and submission materials
- [ ] Final release/submission QA and Jack's explicit approval

## Explicitly deferred

- Solo rituals are a P1 candidate after the private-group P0 loop.
- Public discovery, feeds, leaderboards, stranger betting, and sponsor pools are outside P0.
- AI and reminders are optional follow-on work.
- Mainnet and valuable-token support are not part of the hackathon acceptance path.

The existing Expo slug, Android package, iOS bundle identifier, and EAS project ID remain legacy build identifiers for now. They are not active Preflight branding and will change only when doing so will not disrupt the proven build pipeline.
