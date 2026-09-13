# Roadmap

Status labels describe observed implementation, not aspiration.

## Complete

- [x] Expo/React Native Android shell and navigation
- [x] Mobile Wallet Adapter authorization plumbing on Solana devnet
- [x] Rituals domain contracts: draft, invite, lifecycle, money, settlement, and thresholds
- [x] Deterministic fixture-backed Rituals home with loading, populated, funding, confirmation, completed, empty, and error states
- [x] Explicit devnet / no-real-value disclosures and safe fixture actions
- [x] Activation implementation and approval
- [x] Safe pre-activation cancellation and exact tracked refunds
- [x] Focused JavaScript tests, TypeScript, Expo Doctor, and Android bundle gates
- [x] Consumer Rituals sketch and screenshot

## Remaining protocol work

- [ ] Claim, confirmation, question, and complete settlement flow
- [ ] Typed mobile adapter from a frozen IDL
- [ ] Real devnet deployment with valueless test assets
- [ ] Native MWA signing and confirmed read-after-write flow
- [ ] Two-wallet devnet acceptance cycle
- [ ] Independent program/security review

## Remaining consumer and release work

- [ ] Create/review/invite/funding/activation screens beyond the fixture home
- [ ] Ritual detail, claim, confirmation inbox, and settlement receipt screens
- [ ] Loading, stale, rejected, and transaction error behavior for real repositories
- [ ] Standalone Seeker APK and offline/native acceptance
- [ ] Public HTTPS wallet origin and final metadata
- [ ] Publisher/privacy/legal review before valuable assets or mainnet

## Explicitly deferred

- Solo rituals are a P1 candidate after the private-group P0 loop.
- Public discovery, feeds, leaderboards, stranger betting, and sponsor pools are outside P0.
- AI and reminders are optional follow-on work, not part of the current fixture slice.

The existing Expo slug, Android package, iOS bundle identifier, and EAS project ID remain legacy build identifiers for now. They are not a product-identity migration target in this change.
