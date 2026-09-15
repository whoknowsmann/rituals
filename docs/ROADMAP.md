# Roadmap

Status labels describe observed implementation, not aspiration. Rituals is the sole active hackathon product; the retired Preflight implementation remains available through Git history.

## Complete

### Product and mobile foundation

- [x] Expo/React Native Android shell and Rituals navigation
- [x] Rituals domain contracts: draft, invite, lifecycle, money, settlement, and thresholds
- [x] Fixture-backed home/dashboard with loading, funding, confirmation, completed, empty, and error states
- [x] Fixture-backed templates, create/review, detail, claim, friend-confirmation, and settlement-receipt journeys
- [x] Explicit devnet/no-real-value and no-wallet/no-persistence disclosures
- [x] Remove predecessor-specific UX and domain logic from active source

### Production Anchor protocol

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
- [x] Exact instruction-data encoders for all eleven instructions
- [x] Canonical account-meta and `TransactionInstruction` builders for every action
- [x] Confirmed RPC reads with monotonic `minContextSlot`, sparse-response rejection, error redaction, and sealed read provenance
- [x] Authoritative same-slot ProtocolConfig/Ritual/Event/all-Claims bundles with bounded event-advance retry and bitmap correlation
- [x] Blockheight-confirmed Create/Fund/Activate/Cancel/Close readback; a signature alone cannot report success
- [x] Opaque Create/Fund/Activate/Cancel/Close preparation with exact fee/rent/token summaries, per-preparer provenance, message digest, and mutation detection
- [>] Event-action preparation implemented; bounded adversarial hardening and combined review remain
- [x] 1,642 JavaScript/TypeScript cases at the latest accepted event-preparation success checkpoint

## Active integration sequence

1. [>] Finish one bounded adversarial pass for Initialize/Claim/Approve/Question/Finalize preparation
2. [ ] Run one combined event-preparation specification/security review
3. [ ] Add event/claim/finalization confirmation and authoritative readback
4. [ ] Bind exact prepared message bytes to the wallet-returned signature
5. [ ] Add Mobile Wallet Adapter signing and submission
6. [ ] Replace fixture repositories/actions with real RPC and transaction states

Compute policy for the remaining build:

- Keep adversarial depth for custody, authority, arithmetic, serialization, transaction identity, and readback.
- Do not add broad malformed-input Cartesian matrices without a concrete boundary risk or RED defect.
- Use focused tests during implementation and one aggregate suite per milestone.
- Run Expo Doctor, Android export, and packaging only at phase boundaries.
- Use one bounded implementation task and one combined spec/security review per milestone.

## Remaining mobile UX

- [ ] Invite/join flow
- [ ] Dedicated member-funding and activation progress
- [ ] Review → wallet → submitted → confirming → confirmed/error transaction UX
- [ ] Authoritative dashboard, detail, claim, confirmation, and receipt data
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
