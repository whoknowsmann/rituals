# Rituals Rebuild Implementation Plan

> **For Hermes:** Use `subagent-driven-development` only after verifying the configured delegation route is hosted/non-local and functional. If delegation remains unavailable, execute each task directly with the same RED–GREEN–REFACTOR and two-stage review discipline.

**Goal:** Replace the current Preflight screen with a Seeker-tested Rituals vertical slice in which two or more wallets fund a devnet ritual, one participant claims completion, another wallet confirms it, and a purpose-built Solana program settles the event deterministically.

**Architecture:** Preserve the verified Expo/React Native, MWA, EAS, CI, and Android shell. Add pure TypeScript contracts for money, thresholds, lifecycle, invite digests, and transaction summaries; an Anchor program controls membership, SPL escrow, attestations, and settlement; the mobile client reads authoritative program state and requests every signature through MWA. P0 uses devnet and a valueless test SPL token, requires no hosted backend, and defaults unresolved/questioned claims to a no-forfeiture void/roll-forward path.

**Tech stack:** Expo 52, React Native 0.76, TypeScript, Vitest, React Navigation, React Native Paper, TanStack Query, `@solana/web3.js` 1.x, SPL Token, Mobile Wallet Adapter, Rust, Anchor after compatibility spike, Solana devnet, EAS Android builds.

**Product sources of truth:**

- Hub: `Product and MVP Scope.md`
- Hub: `Technical Architecture and Decisions.md`
- Hub: `Rituals Verification and Accountability.md`
- Repository: `docs/ARCHITECTURE.md`
- Repository: this plan

**Non-goals:** mainnet or real USDC; public groups; stranger betting; chat; photo/location proof; AI adjudication; generalized multisig treasury; host overrides; backend custody; arbitrary token support; Expo/React Native upgrade during the core slice.

---

## Execution rules

1. Work on a private feature branch.
2. Never delete the working Preflight implementation until the Rituals fixture UI and test suite are green; then archive or remove it in a dedicated commit.
3. Every behavioral function follows RED → observed expected failure → GREEN → full relevant suite → refactor.
4. Every Solana state-changing test must read the resulting account/token state, not trust the transaction signature alone.
5. No global Rust/Solana/Anchor/package installation without Jack's approval after live toolchain inspection.
6. Never use a valuable wallet, private key, seed phrase, or mainnet token in tests.
7. Keep the repository private and do not push, deploy, or rotate credentials without explicit authorization.
8. Run two reviews per milestone: specification compliance first, code/security quality second.
9. Update documentation to observed behavior at every milestone; label fixtures, local-validator flows, and devnet flows separately.

## Definition of done

P0 is complete only when all are true:

- a signed standalone Android APK is installed and launches as Rituals on the physical Seeker;
- MWA connects at least two distinct wallet identities on devnet;
- a two-or-more-member ritual is created, joined, funded, and activated;
- exact fee, stake, threshold, cluster, and mint are disclosed before signatures;
- a claimant signs a completion instruction;
- a different eligible member signs an approval;
- the configured threshold changes the onchain claim state;
- settlement returns principal and distributes forfeiture in token atomic units with no protocol share;
- pending/questioned claims cannot silently become forfeitures;
- the app reads onchain state back after each write;
- program tests prove authorization, replay resistance, conservation, and deterministic rounding;
- unit tests, program tests, TypeScript, Expo Doctor, Android bundle export, CI, and the physical-device script all pass;
- README, architecture, security, roadmap, and demo script match the observed build.

---

## Phase 0 — preserve the baseline and remove uncertainty

### Task 1: Create and document the rebuild branch

**Objective:** Isolate the pivot without losing the known-good Preflight commit history.

**Files:**

- Create: `docs/plans/2026-09-09-rituals-rebuild.md` (this file)
- Modify: none of the production source files

**Steps:**

1. Record `git status --short`, current branch, current HEAD, and remote privacy.
2. Ensure every untracked sketch is intentional; do not discard it.
3. Create `feat/rituals-rebuild` from the current verified branch.
4. Commit only the plan and intended Rituals sketch assets.
5. Verify repository remains private and the branch has no credential files.

**Commands:**

```bash
git status --short
git branch --show-current
git rev-parse HEAD
gh repo view --json isPrivate,url
git switch -c feat/rituals-rebuild
git add docs/plans/2026-09-09-rituals-rebuild.md sketches/consumer-pivot
git diff --cached --check
git commit -m "docs: plan Rituals rebuild"
```

**Expected:** new local branch, one documentation/design commit, no push, no secrets.

### Task 2: Re-establish the verified JavaScript and Android baseline

**Objective:** Prove any later failures are caused by the pivot rather than inherited workspace drift.

**Files:**

- Modify only if current commands are inaccurate: `docs/DEVELOPMENT.md`

**Steps:**

1. Run locked install only if `node_modules` is missing or lockfile state requires it.
2. Run current tests and record exact count.
3. Run TypeScript and Expo Doctor.
4. Export the Android bundle inside the repository as required by the current Expo CLI.
5. Remove only the disposable export directory.

**Commands:**

```bash
npm test
npm run typecheck
npm run doctor
rm -rf .verify/expo-export
npx expo export --platform android --output-dir .verify/expo-export
rm -rf .verify/expo-export
```

**Expected:** the known Preflight baseline stays green. If not, stop and diagnose before Rituals code.

### Task 3: Inspect toolchains and run the Anchor feasibility spike

**Objective:** Kill the riskiest technical assumption before broad implementation: can the current WSL/Expo stack build, test, invoke, and decode a minimal Anchor program without destabilizing MWA?

**Files:**

- Create: `spikes/001-anchor-mwa-compatibility/README.md`
- Create: `spikes/001-anchor-mwa-compatibility/program/` as throwaway spike code
- Create: `spikes/001-anchor-mwa-compatibility/client/` as throwaway instruction/decoding code

**Inspect first:**

```bash
rustc --version || true
cargo --version || true
solana --version || true
anchor --version || true
node --version
npm --version
java -version
```

If a required tool is absent or incompatible, present the exact proposed install/change and get approval before proceeding.

**Spike acceptance:**

- build one program instruction locally;
- run one program test with signer/account constraints;
- create the corresponding instruction from Node/TypeScript;
- prove the mobile dependency strategy bundles under Expo;
- document versions, errors, tradeoffs, and `VALIDATED | PARTIAL | INVALIDATED`;
- delete or quarantine spike code rather than copying untested exploration into production.

**Decision:**

- If full Anchor client bundles cleanly, use it for program-account decoding and instruction building.
- If the Anchor mobile client is the blocker, keep Anchor onchain but generate a small typed `@solana/web3.js` client from the frozen IDL.
- If Anchor program/toolchain itself is blocked, stop and compare native Rust program versus a narrower noncustodial devnet proof before changing architecture.

Commit:

```bash
git add spikes/001-anchor-mwa-compatibility docs/ARCHITECTURE.md docs/DEVELOPMENT.md
git commit -m "spike: validate Anchor and mobile compatibility"
```

---

## Phase 1 — freeze pure contracts through TDD

### Task 4: Define Rituals domain types and lifecycle vocabulary

**Objective:** Give UI, client, and program one explicit language before they are built independently.

**Files:**

- Create: `src/domain/rituals/types.ts`
- Create: `src/domain/rituals/types.test.ts`
- Create: `src/domain/rituals/index.ts`

**RED:** add compile/runtime assertions for exact supported statuses and confirmation modes.

```ts
export type ConfirmationMode = "HONOR" | "ONE_FRIEND" | "MAJORITY" | "UNANIMOUS";
export type RitualStatus = "DRAFT" | "FUNDING" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type ClaimStatus = "UNCLAIMED" | "PENDING" | "CONFIRMED" | "QUESTIONED";
export type EventStatus = "SCHEDULED" | "CLAIMING" | "RESOLVING" | "SETTLED" | "VOIDED";
```

Include branded/explicit fields for public keys, ritual IDs, token atomic units as `bigint`, event indices, timestamps, rule digest, member index, and devnet cluster. Do not make `number` a money type.

**Verification:**

```bash
npx vitest run src/domain/rituals/types.test.ts
npm run typecheck
```

Commit: `feat: define Rituals domain contracts`

### Task 5: Implement threshold derivation

**Objective:** Map human modes to exact additional signatures without ambiguous majority semantics.

**Files:**

- Create: `src/domain/rituals/threshold.ts`
- Create: `src/domain/rituals/threshold.test.ts`

**RED cases:**

- two members: honor `0`, one friend `1`, majority `1`, unanimous `1`;
- four members: majority of other members `2`, unanimous `3`;
- six members: majority `3`, unanimous `5`;
- reject funded group sizes below two or above six;
- reject explicit threshold outside `0..N-1`.

**Target interface:**

```ts
export function requiredAdditionalConfirmations(
  mode: ConfirmationMode,
  fundedMemberCount: number,
): number;
```

**Verification:**

```bash
npx vitest run src/domain/rituals/threshold.test.ts
npm test
```

Commit: `feat: derive Rituals confirmation thresholds`

### Task 6: Implement stake allocation and activation-fee quoting

**Objective:** Make every amount exact, capped, and disclosed before any wallet request.

**Files:**

- Create: `src/domain/rituals/money.ts`
- Create: `src/domain/rituals/money.test.ts`

**RED cases:**

- 20 token units / four events = 5 each;
- non-divisible totals are rejected rather than rounded invisibly;
- group pool uses checked `bigint` multiplication;
- fee is 200 bps with 0.50 minimum and 5.00 maximum;
- 40/80/200/1000 unit pools quote 0.80/1.60/4.00/5.00;
- split fee remainder is distributed deterministically;
- zero-stake ritual quotes zero platform fee;
- invalid decimals and negative/zero configurations fail.

**Target interfaces:**

```ts
export function derivePerEventAllocation(total: bigint, eventCount: number): bigint;
export function quoteActivationFee(pool: bigint, config: FeeConfig): bigint;
export function splitAtomicUnits(total: bigint, orderedMembers: readonly PublicKeyText[]): ReadonlyMap<PublicKeyText, bigint>;
```

**Verification:** `npx vitest run src/domain/rituals/money.test.ts && npm test`

Commit: `feat: add exact Rituals fee and stake math`

### Task 7: Implement deterministic settlement preview

**Objective:** Prove conservation for all MVP attendance combinations before writing escrow code.

**Files:**

- Create: `src/domain/rituals/settlement.ts`
- Create: `src/domain/rituals/settlement.test.ts`

**RED cases:**

- four members, 5 units/event, three confirmed and one unclaimed;
- all complete;
- one completes;
- no confirmed members safely voids;
- pending or questioned claim prevents forfeiture and yields `VOIDED` under P0 policy;
- every atomic remainder goes to confirmed members in member-index order;
- sum of payouts exactly equals the event pool;
- no output field allocates money to Rituals/platform.

**Target result:**

```ts
type SettlementPreview =
  | { kind: "SETTLED"; payouts: readonly MemberPayout[]; forfeited: bigint }
  | { kind: "VOIDED"; refunds: readonly MemberRefund[]; reason: VoidReason };
```

Add generated loops covering member counts 2–6, confirmed counts 0–N, and representative token-unit remainders.

**Verification:** `npx vitest run src/domain/rituals/settlement.test.ts && npm test`

Commit: `feat: add conservation-safe event settlement`

### Task 8: Implement ritual draft validation and canonical rule digest

**Objective:** Bind human-readable invite data to immutable onchain rules without a backend.

**Files:**

- Create: `src/domain/rituals/draft.ts`
- Create: `src/domain/rituals/draft.test.ts`
- Create: `src/domain/rituals/invite.ts`
- Create: `src/domain/rituals/invite.test.ts`

**RED cases:**

- canonical serialization is stable regardless of object insertion order;
- changing title, requirement, schedule, members, stake, threshold, cluster, mint, or fee payer changes the digest;
- unknown schema version fails closed;
- wrong cluster/PDA/digest is rejected;
- oversized titles/requirements/schedules are rejected;
- private evidence fields are not valid invite schema fields.

**Target interface:**

```ts
export function canonicalizeRules(draft: LockedRitualRules): Uint8Array;
export async function digestRules(draft: LockedRitualRules): Promise<string>;
export function verifyInvite(invite: RitualInvite, onchain: RitualAccountView): VerificationResult;
```

Reuse a platform-compatible SHA-256 path already proven by `reviewIdentity.ts`; do not silently introduce Node-only crypto.

**Verification:** `npx vitest run src/domain/rituals/invite.test.ts && npm test`

Commit: `feat: bind Rituals invitations to locked rules`

### Task 9: Implement lifecycle transition guards

**Objective:** Prevent UI and client code from inventing impossible transitions.

**Files:**

- Create: `src/domain/rituals/lifecycle.ts`
- Create: `src/domain/rituals/lifecycle.test.ts`

**RED cases:**

- cannot activate until every accepted member funds;
- cannot change terms after activation;
- cannot claim before the window or after claim deadline;
- cannot self-approve;
- duplicate member approval rejected;
- reaching threshold confirms exactly once;
- pending/questioned cannot finalize as forfeited;
- settled event cannot reopen;
- final event completion permits close only when vault accounting is zero.

These are client-side guards for clarity, not substitutes for program enforcement.

**Verification:** `npx vitest run src/domain/rituals/lifecycle.test.ts && npm test`

Commit: `feat: define Rituals lifecycle guards`

---

## Phase 2 — build the program from the proven contracts

### Task 10: Scaffold the production Anchor workspace

**Objective:** Establish a pinned, reviewable program workspace using the spike's validated versions.

**Files:**

- Create: `Anchor.toml`
- Create: `Cargo.toml`
- Create: `programs/rituals/Cargo.toml`
- Create: `programs/rituals/src/lib.rs`
- Create: `tests/rituals.ts` or the spike-selected local test harness
- Modify: `.gitignore`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/DEVELOPMENT.md`

Start with an initialization test that fails because the instruction/account does not exist, then add the minimum `ProtocolConfig` and `initialize_protocol_config` implementation.

CI must pin tool versions or use a reproducible setup; do not make JavaScript CI silently skip program tests.

**Verification:**

```bash
anchor build
anchor test
npm test
npm run typecheck
```

Commit: `build: scaffold Rituals Solana program`

### Task 11: Implement ritual creation and immutable membership rules

**Objective:** Create a Ritual PDA containing validated members, digest, stake mint, event allocation, threshold, timing, and exact fee quote.

**Files:**

- Modify: `programs/rituals/src/lib.rs`
- Create/modify: `programs/rituals/src/state.rs`
- Create/modify: `programs/rituals/src/errors.rs`
- Modify: program integration tests

**RED sequence, one test at a time:**

1. valid creator and 2–6 unique members succeeds;
2. duplicate member fails;
3. creator absent from member set fails;
4. invalid threshold fails;
5. zero/oversized events or stake fails;
6. non-allowlisted mint fails;
7. account stores exact fee quote and rule digest;
8. later protocol-fee changes do not mutate created ritual quote.

Use fixed member indices or measured PDA records according to spike result. Include ritual PDA seeds in tests.

Commit: `feat: create immutable Rituals groups`

### Task 12: Implement member funding, token vault, activation, and fee transfer

**Objective:** Move valueless devnet SPL tokens into program-controlled escrow and lock terms only when funding is complete.

**Files:**

- Modify: program state/instructions/tests
- Create: `scripts/create-devnet-test-token.ts`
- Create: `docs/DEVNET_DEMO.md`

**RED sequence:**

1. only a listed member can fund their slot;
2. funding exact expected stake succeeds;
3. partial/duplicate/overfunding fails or follows one explicitly documented rule;
4. wrong mint/token authority fails;
5. vault token-account authority is the expected PDA;
6. activation before full funding fails;
7. activation transfers exact quoted fee separately from escrow;
8. activation locks rules and member set;
9. cancellation before activation returns all deposited stake and charges no fee;
10. admin cannot withdraw active escrow.

Do not commit generated mint authority/keypair material. The demo script must default to throwaway local/devnet identities and explain safe deletion.

Commit: `feat: fund and activate Rituals escrow`

### Task 13: Implement completion claims and threshold approvals

**Objective:** Turn the multisig insight into event-specific threshold authorization.

**Files:**

- Modify: program state/instructions/errors/tests

**RED sequence:**

1. funded member can claim only their current event;
2. claim binds ritual, event index, claimant, and claim version;
3. nonmember claim fails;
4. eligible other member approval increments once;
5. self-approval fails;
6. duplicate approval fails;
7. approval for another event/claim fails;
8. threshold minus one remains pending;
9. exact threshold marks confirmed;
10. extra approval cannot re-trigger effects;
11. honor mode confirms claimant signature without additional approvals;
12. question marks the claim questioned and blocks ordinary finalization.

Prefer member-index bitmaps for fixed six-member MVP if validated by account sizing.

Commit: `feat: add threshold completion attestations`

### Task 14: Implement safe event settlement

**Objective:** Move only the current event tranche and conserve every atomic token unit.

**Files:**

- Modify: program state/instructions/errors/tests

**RED sequence:**

1. settlement before event/resolution window fails;
2. confirmed member receives principal;
3. clearly unclaimed member forfeits only current event allocation;
4. forfeiture goes only to confirmed members;
5. deterministic member order receives atomic remainder;
6. future-event escrow remains locked;
7. no confirmed member voids/refunds event;
8. pending/questioned claim invokes safe `VOIDED` path and no forfeiture bonus;
9. repeated settlement fails;
10. every attendance combination for 2–6 members conserves tokens;
11. platform recipient balance never changes during settlement;
12. final event leaves exact zero/refundable vault balance before closure.

Commit: `feat: settle Rituals events without protocol rake`

### Task 15: Freeze the IDL and add a typed mobile program adapter

**Objective:** Let React Native consume program state without leaking Anchor/RPC details into screens.

**Files:**

- Create: `src/data/rituals/programIds.ts`
- Create: `src/data/rituals/pdas.ts`
- Create: `src/data/rituals/accounts.ts`
- Create: `src/data/rituals/instructions.ts`
- Create: `src/data/rituals/ritualsClient.ts`
- Create corresponding `*.test.ts` files
- Generate/copy: `src/data/rituals/idl/rituals.json`

**RED cases:**

- PDA vectors match program tests;
- account discriminators/layouts decode known fixtures;
- wrong owner/discriminator/schema/mint fails closed;
- instruction bytes and account metas match IDL fixtures;
- cluster/program ID mismatch blocks signing;
- read-after-write confirmation waits for `confirmed` commitment and then refetches exact target account.

Define a narrow interface:

```ts
export interface RitualsClient {
  getRitual(address: PublicKey): Promise<RitualAccountView>;
  buildCreate(input: CreateRitualInput): Promise<PreparedAction>;
  buildFund(input: FundInput): Promise<PreparedAction>;
  buildClaim(input: ClaimInput): Promise<PreparedAction>;
  buildApprove(input: ApproveInput): Promise<PreparedAction>;
  buildSettle(input: SettleInput): Promise<PreparedAction>;
  confirmAndRead(action: SubmittedAction): Promise<RitualAccountView>;
}
```

Commit: `feat: add typed Rituals program client`

---

## Phase 3 — rebuild the consumer experience vertically

### Task 16: Add Rituals theme, fixture provider, and home/detail tracer bullet

**Objective:** Replace the security cockpit with a warm, broad-purpose Rituals experience while keeping network integration swappable.

**Files:**

- Create: `src/theme/ritualsTheme.ts`
- Create: `src/data/rituals/RitualsRepository.ts`
- Create: `src/data/rituals/FixtureRitualsRepository.ts`
- Create: `src/features/rituals/useRituals.ts`
- Create: `src/screens/RitualsHomeScreen.tsx`
- Create: `src/screens/RitualDetailScreen.tsx`
- Modify: `App.tsx`
- Modify: `src/navigators/AppNavigator.tsx`
- Modify: `src/navigators/HomeNavigator.tsx`
- Modify: `src/screens/index.ts`

**RED:** view-model tests prove the home surface shows next ritual, stake at risk, pending confirmation count, threshold label, and devnet badge without fitness-only copy.

Then render the fixture path on Android/Chrome-compatible tooling and compare it to the approved HTML sketch. Required states: loading, empty, error, active, pending confirmation.

Commit: `feat: replace Preflight home with Rituals`

### Task 17: Build the create/review/invite/funding flow against fixtures

**Objective:** Make locked rules and money legible before touching a wallet.

**Files:**

- Create screens under `src/screens/` for template, create, review, invite/join, and funding
- Create feature components under `src/features/rituals/create/`
- Create view-model/validation tests beside pure modules
- Modify navigation route types

**RED behavioral tests:**

- broad templates include reading, study, music, family, cooking, and movement;
- funded ritual defaults to one-friend confirmation;
- exact total/member/event/fee/network labels render;
- user cannot proceed with invalid or non-divisible stake;
- terms become visibly immutable at activation;
- invite mismatch blocks join;
- free ritual visibly has no escrow/fee.

Keep the first UI repository fixture-backed. Do not mix network debugging with interaction-design debugging.

Commit: `feat: add Rituals creation and funding journey`

### Task 18: Build claim, confirmation inbox, and receipt flow against fixtures

**Objective:** Make the core loop demoable before real transactions.

**Files:**

- Create: `src/screens/ClaimCompletionScreen.tsx`
- Create: `src/screens/ConfirmationInboxScreen.tsx`
- Create: `src/screens/SettlementReceiptScreen.tsx`
- Create components under `src/features/rituals/claims/`
- Add view-model tests

**RED behavioral tests:**

- claimant sees “your signature” separately from `X` friend confirmations;
- confirmer sees claimant, event, threshold progress, confirm/question choices;
- claimant cannot confirm own claim in UI model;
- pending/questioned text does not imply failure;
- receipt separates principal, bonus, forfeiture, future stake, platform fee, and network fee;
- protocol forfeiture share always renders zero/none;
- duplicate pending submissions disable the action.

Commit: `feat: add Rituals claim and confirmation loop`

### Task 19: Replace fixture writes with MWA-backed devnet actions

**Objective:** Make create/fund/claim/approve/settle real while preserving deterministic fixture mode for tests and demo recovery.

**Files:**

- Create: `src/data/rituals/SolanaRitualsRepository.ts`
- Create: `src/features/rituals/usePreparedAction.ts`
- Modify: `src/utils/useMobileWallet.tsx`
- Modify: `src/utils/useAuthorization.tsx`
- Modify query hooks/screens

**RED cases:**

- rejected authorization returns a user-safe cancelled state;
- wrong cluster/mint/program fails before signing;
- prepared action summary includes exact outflow and fee;
- transaction byte identity changes when transaction mutates;
- one in-flight action prevents duplicate tap;
- signature result alone does not mark success;
- confirmed state readback marks success;
- expired blockhash/retry rebuilds and re-presents changed bytes.

Change `APP_IDENTITY.name` only with the rest of the visible brand migration. Preserve MWA token handling; never persist key material.

Commit: `feat: connect Rituals flow to MWA and devnet`

### Task 20: Add deep-link invitations and local reminders

**Objective:** Support private group joining and retention without a backend.

**Files:**

- Modify: `app.json`
- Create: `src/features/rituals/invites/deepLinks.ts`
- Create: `src/features/rituals/invites/deepLinks.test.ts`
- Create: `src/features/rituals/reminders/localReminders.ts`
- Create tests
- Modify navigation container linking config

**RED cases:** malformed/oversized/unknown-version invites fail; digest mismatch is prominent; correct invite navigates to join preview; reminder times derive from event data; notification copy omits stake/private details from lock-screen text by default.

If local notifications require a new native dependency, install only after approval and an isolated compatibility check. Invitations are P0; notifications may defer if they threaten the build.

Commit: `feat: add private Rituals invites and reminders`

---

## Phase 4 — migration, device proof, and submission hardening

### Task 21: Perform the product identity migration

**Objective:** Rename the actual Android application only after the Rituals slice is green.

**Files:**

- Modify: `app.json`
- Modify: `src/utils/useAuthorization.tsx`
- Modify visible copy/assets
- Create/replace icons and splash assets
- Modify: `README.md`
- Modify: `docs/*.md`

Decide explicitly whether to preserve the EAS project ID and Android package for continuity or create Rituals-specific identities. Default recommendation for the private hackathon repo: preserve EAS linkage during development, change visible app name/scheme immediately, and postpone Android package migration until a verified replacement build avoids breaking the known installation path.

Before distribution, MWA identity URI must be a stable public HTTPS origin that matches the published application identity; the private GitHub URL is not sufficient as final production identity.

**Verification:** launcher label, splash, MWA wallet sheet, settings/about, Android package, deep link, and EAS metadata all match the documented choice.

Commit: `chore: migrate application identity to Rituals`

### Task 22: Run the two-wallet devnet acceptance script

**Objective:** Prove the entire cryptographic/economic loop outside mocks.

**Files:**

- Create: `docs/DEVNET_ACCEPTANCE.md`
- Create: `.verify/rituals-devnet-acceptance.json` only if scrubbed and intentionally ignored or artifacted

**Required run:**

1. create throwaway devnet wallet identities A and B through compatible wallets/test harness;
2. mint/fund only valueless test token and devnet SOL;
3. A creates a two-member, two-event ritual with one-friend threshold;
4. A and B fund;
5. activate and verify separate activation-fee balance;
6. A claims event 1;
7. B approves A;
8. B remains unclaimed for event 1;
9. finalize event;
10. assert A receives principal plus B's current-event allocation;
11. assert B's future-event allocation remains locked;
12. assert platform recipient did not receive forfeiture;
13. assert event cannot settle twice;
14. execute a pending/questioned scenario and verify safe void/no confiscation;
15. record transaction signatures, program ID, mint, slot, account addresses, and pre/post balances with no secrets.

Do not claim success until exact target accounts are read back and arithmetic is programmatically verified.

Commit: `test: document verified Rituals devnet cycle`

### Task 23: Build and test the standalone Seeker APK

**Objective:** Prove Rituals as an Android product rather than a Metro mock.

**Files:**

- Modify: `eas.json` only if a standalone internal profile is required
- Modify: `docs/DEVELOPMENT.md`
- Modify: `docs/DEVNET_ACCEPTANCE.md`

**Steps:**

1. run full local gates;
2. build signed standalone/internal APK through the verified EAS route;
3. compute SHA-256 with `sha256sum`;
4. install via the verified Windows ADB/WSL workflow;
5. launch and inspect logs for fatal errors;
6. execute wallet connect and the complete devnet flow on Seeker;
7. verify cold start without Metro;
8. record build ID, URL, hash, package, device OS/SDK, and observed limitations.

**Commands:** use exact commands from `docs/DEVELOPMENT.md` after updating them from the verified environment; do not invent paths or credentials.

Commit: `test: verify Rituals standalone Seeker build`

### Task 24: Run security, policy, and dependency gates

**Objective:** Prevent a convincing demo from being mistaken for a production-safe money app.

**Files:**

- Modify: `docs/SECURITY.md`
- Create: `docs/THREAT_MODEL.md`
- Create: `docs/PUBLISHER_CHECKLIST.md`
- Modify: `README.md`

Review:

- signer/account substitution;
- duplicate/replayed claims and approvals;
- wrong mint/program/cluster;
- arithmetic overflow/rounding;
- rent/ATA disclosure;
- admin authority limits;
- stuck funds and pause/escape behavior;
- invite tampering;
- RPC staleness;
- deep-link input handling;
- wallet rejection and transaction expiry;
- UGC/reporting requirements;
- privacy retention/deletion;
- gambling/contest/money-transmission/tax implications;
- dependency advisories and actual runtime paths.

No mainnet recommendation until an independent program review and applicable-law/publisher-policy review are complete.

Commit: `docs: document Rituals security and publisher gates`

### Task 25: Add only rubric features that preserve the loop

**Objective:** Improve judging score only after P0 passes.

**Optional ordered experiments:**

1. verified SKR holder/staker activation-fee discount;
2. local or protected-service template suggestion;
3. cycle recap from deterministic facts;
4. shareable non-financial receipt.

Each requires its own failing tests, narrow acceptance criteria, current official documentation, and proof in the Android build. Do not claim SKR merely because MWA is used. AI cannot judge truth, thresholds, disputes, or payouts.

### Task 26: Prepare submission artifacts and final rehearsal

**Objective:** Deliver a repeatable, policy-honest hackathon submission at least 24 hours early.

**Files:**

- Create: `docs/DEMO_SCRIPT.md`
- Create: `docs/PITCH_BRIEF.md`
- Create: `docs/SUBMISSION_CHECKLIST.md`
- Modify: `README.md`

Demo sequence must stay under roughly 90 seconds:

1. create “Read 50 pages weekly”;
2. set four events, equal stake, one-friend confirmation;
3. show locked fee and payout rules;
4. show funded group;
5. claimant signs;
6. friend co-signs;
7. contract settles;
8. receipt shows principal, bonus, remaining stake, and zero forfeiture rake.

Final gates:

```bash
npm test
npm run typecheck
npm run doctor
rm -rf .verify/expo-export
npx expo export --platform android --output-dir .verify/expo-export
anchor build
anchor test
git diff --check
git status --short
```

Also verify current official submission terms, dApp Store policy, operative judging rubric, APK link/hash, source visibility requirement, video permissions, pitch link, team roster, representative, and KYC readiness.

Commit: `docs: prepare Rituals hackathon submission`

---

## Milestone sequence and stop conditions

### M0 — contracts and feasibility

Ends after Tasks 1–9.

Proceed only if pure math/lifecycle tests are green and the Anchor/mobile spike is at least `PARTIAL` with a safe, bounded production approach.

### M1 — program truth

Ends after Tasks 10–15.

Proceed only if local program tests prove threshold authorization and token conservation. If escrow or payout invariants are uncertain, stop UI integration and fix the program first.

### M2 — consumer loop

Ends after Tasks 16–20.

Proceed only if a target user can understand create → fund → claim → co-sign → settle without a crypto lecture. If not, simplify the UI rather than adding features.

### M3 — physical proof

Ends after Tasks 21–24.

Proceed only if two-wallet devnet and standalone Seeker flows are repeatable from clean instructions.

### M4 — submission

Tasks 25–26. Optional rubric work is first to be cut. Never cut transaction clarity, conservation tests, device verification, or submission rehearsal.

## Suggested calendar

- 2026-09-09 to 2026-09-12: M0 contracts and feasibility.
- 2026-09-13 to 2026-09-20: M1 program and typed client.
- 2026-09-21 to 2026-09-27: M2 polished mobile flow.
- 2026-09-28 to 2026-10-02: M3 devnet and Seeker hardening.
- 2026-10-03 to 2026-10-07: video, pitch, listing, regression, submission.
- 2026-10-08: contingency only; target submission already complete.

## Rollback strategy

- Existing Preflight commits and build remain intact in Git/EAS.
- Rituals changes live on a separate branch until the vertical slice is green.
- Program deployment uses a new devnet program ID and valueless token.
- No mainnet migration occurs implicitly.
- A failed Anchor spike changes the plan before production code rather than forcing an incompatible dependency.
- Fixture repository remains available for deterministic demos if devnet infrastructure is temporarily unavailable, but must be visibly labeled and never substituted for the required real devnet proof.
