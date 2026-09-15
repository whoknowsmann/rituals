# Ritual Create Authority and Availability Plan

> **Status:** Active read-only infrastructure plan. This milestone validates the authoritative inputs a future Create screen must consume; it does not select a nonce, define schedule UX, prepare a transaction, or enable deployment.

## Goal

Add a fail-closed read boundary that answers:

- Which program/config is authoritative?
- Which classic SPL mint and fee-recipient token account are authorized?
- Are those token accounts usable and mutually consistent?
- For a caller-supplied creator and nonce, what exact Ritual/vault PDAs would be created?
- Is the candidate Ritual PDA currently available or occupied?

The result must come from one coherent confirmed RPC snapshot after bounded discovery, not from UI-supplied program, mint, or fee-recipient values.

## Current facts

- `ProtocolConfig.allowedStakeMint` is the authoritative stake mint.
- `ProtocolConfig.feeRecipient` intentionally stores the fee-recipient classic SPL token-account address.
- Onchain Create validates the mint/config address, token-program ownership through Anchor account types, and recipient-token mint equality.
- The current TypeScript reader validates ProtocolConfig ownership/content but does not read classic SPL Mint/TokenAccount state.
- The current reader has no candidate Create availability API.
- Ritual PDA seeds are `['ritual', creator, nonce_le_u64]`; stake/fee vaults derive from that Ritual PDA.
- Current production deployment remains `not-deployed`; the local placeholder program ID must never become a fallback.
- The `SplitFundingNotImplemented` error variant is currently unused and is not an executed protocol restriction.

## Chosen scope

Implement a read-only `getCreateAuthoritySnapshot({ creator, nonce }, options?)` path on the local/test reader and frozen RitualClient facade.

The method performs bounded two-stage discovery:

1. read canonical ProtocolConfig;
2. derive the candidate Ritual/vault PDAs from caller-supplied creator/nonce;
3. re-read ProtocolConfig together with the candidate Ritual PDA, configured mint, and configured fee-recipient token account using `minContextSlot` at least the discovery slot, with the candidate slot treated as presence-only;
4. reject if ProtocolConfig identity changed;
5. validate classic SPL account ownership/layout/initialization and recipient mint equality;
6. return one immutable snapshot at the second read slot.

A non-null candidate Ritual value means `occupied` regardless of its owner, layout, executable flag, malformed fields, or hostile accessors; any reported presence blocks safe initialization. The reader must not route that slot through the normal account-envelope validator or access/expose candidate fields or bytes. ProtocolConfig, mint, and recipient slots remain strictly validated.

`availability` means PDA occupancy only. A snapshot may report `available` while `protocolConfig.paused` is true; callers must display that distinction, and a future preparation adapter must refuse paused configuration.

## Public result

```ts
type CreateAuthorityAvailability = 'available' | 'occupied'

type CreateAuthoritySnapshot = Readonly<{
  slot: number
  programId: PublicKey
  protocolConfigAddress: PublicKey
  protocolConfig: ProtocolConfigAccountView
  creator: PublicKey
  nonce: bigint
  ritualAddress: PublicKey
  stakeVaultAddress: PublicKey
  feeVaultAddress: PublicKey
  ritualBump: number
  stakeVaultBump: number
  feeVaultBump: number
  stakeMint: Readonly<{
    address: PublicKey
    decimals: number
    supply: bigint
  }>
  feeRecipientToken: Readonly<{
    address: PublicKey
    mint: PublicKey
    authority: PublicKey
  }>
  availability: CreateAuthorityAvailability
}>
```

All PublicKeys must be detached copies. Nested values and arrays/objects must be frozen. Do not expose raw RPC buffers.

## Task 1 — Validate classic SPL mint and token-account snapshots with strict TDD

### Files

Create:

- `src/data/rituals/tokenAccounts.ts`
- `src/data/rituals/tokenAccounts.test.ts`

### Required behavior

- Accept the existing RPC envelope shape: owner `PublicKey`, data `Uint8Array`, executable `false`.
- Require owner equals classic `TOKEN_PROGRAM_ID`; reject Token-2022 and arbitrary owners.
- Decode only canonical classic SPL Mint and TokenAccount layouts using the repository-pinned `@solana/spl-token` package.
- Mint validator requires exact layout, initialized state, and the layout's exact `u8` decimals value; no narrower decimals policy exists in the current protocol. It returns detached/frozen address, decimals, and supply.
- Recipient validator requires exact layout, initialized state, and exact expected mint, and returns detached/frozen address, mint, and internal authority. A default internal authority is protocol-valid and must not be rejected merely for being default.
- The read boundary deliberately rejects a frozen recipient as a future-activation usability policy because the configured account must later receive the fee transfer. Document and test this separately from protocol validity: current Anchor Create does not explicitly reject a frozen recipient.
- Reject malformed envelopes, executable accounts, wrong sizes, truncated/oversized data, uninitialized mint/recipient accounts, frozen recipients under the explicit future-activation policy, wrong recipient mint, and hostile property access without leaking raw values.

### Focused RED/GREEN tests

1. valid initialized classic SPL mint decodes exact decimals/supply;
2. valid recipient token account decodes exact mint/authority;
3. wrong Solana owner, Token-2022 owner, or executable account rejects;
4. wrong exact layout size rejects;
5. uninitialized mint rejects;
6. uninitialized recipient rejects;
7. recipient with wrong mint rejects;
8. default recipient authority remains accepted as protocol-valid;
9. frozen recipient rejects with the explicit future-activation usability category/policy;
10. hostile envelope getters fail closed with a typed sanitized error;
11. outputs are deeply immutable/detached.

No package change or install is allowed.

## Task 2 — Read a coherent Create authority/availability snapshot with strict TDD

### Files

Modify:

- `src/data/rituals/ritualsRpc.ts`
- focused existing RPC test file or create `src/data/rituals/ritualsRpcCreateAuthority.test.ts`

### Required behavior

- Validate creator as non-default `PublicKey` and nonce as `u64 bigint` before transport access.
- First fetch only canonical ProtocolConfig.
- Derive Ritual/stake-vault/fee-vault addresses with existing helpers.
- Second fetch exactly `[ProtocolConfig, Ritual, allowedStakeMint, feeRecipient]` with confirmed commitment and `minContextSlot >= discovery.slot`.
- Add a narrowly scoped presence-preserving response path for this read: validate outer response, slot, count, density, and the ProtocolConfig/mint/recipient envelopes using existing strict rules, but never inspect the candidate Ritual value beyond `null` versus non-null. A non-null executable, arbitrary-owner, arbitrary-layout, accessor-bearing, or otherwise malformed candidate still returns `occupied`.
- Re-decode and compare the full ProtocolConfig identity between discovery and authority snapshot.
- Validate mint/recipient with Task 1 helpers.
- Require recipient token mint equals configured allowed stake mint.
- Return `available` only when candidate Ritual is null; any non-null candidate is `occupied` without accessing or exposing its fields or bytes. Preserve `protocolConfig.paused` separately; occupancy availability does not mean Create is currently permitted.
- Return the second fetch slot and detached/deeply frozen canonical metadata.
- Preserve existing current-production factory failure before transport access.

### Focused tests

1. valid available snapshot maps every authoritative address/value and second slot;
2. non-null candidate returns occupied;
3. exact nonce boundary vectors `0` and `u64::MAX` derive canonical PDAs;
4. invalid creator/nonce rejects before transport;
5. second request uses discovery slot as minimum;
6. stale second response rejects;
7. changed ProtocolConfig identity rejects;
8. wrong mint owner/layout/uninitialized rejects;
9. wrong recipient owner/layout/state/mint rejects;
10. non-null candidate values with executable/arbitrary-owner/arbitrary-layout/hostile properties all return occupied without field access;
11. raw candidate fields/bytes are never exposed;
12. available plus paused remains distinguishable and does not claim Create readiness;
13. nested outputs are frozen/detached;
14. hostile/malformed non-candidate RPC response remains sanitized.

Do not add broad Cartesian malformed-input matrices.

## Task 3 — Expose the read-only method through RitualClient with strict TDD

### Files

Modify:

- `src/data/rituals/ritualClient.ts`
- `src/data/rituals/ritualClient.test.ts`
- `src/features/rituals/client/useRitualClient.test.ts` only if the exact method surface assertion requires it

### Required behavior

- Add `getCreateAuthoritySnapshot({ creator, nonce }, options?)` to `RitualClient`.
- Bind it to the same internal `RitualsRpcReader` as existing reads.
- Preserve the exact frozen, null-prototype, non-enumerable/non-writable/non-configurable facade.
- Preserve `useRitualClient` cluster/deployment gating; no client or transport access while unavailable.
- Do not add a write/preparation method in this milestone.

### Focused tests

1. facade exposes the method with the same immutable descriptor guarantees;
2. deterministic facade call returns the reader-produced authority snapshot;
3. current `not-deployed` resolution remains unavailable and touches no transport;
4. no low-level decoder/constructor becomes a runtime barrel bypass.

## Review and phase gate

Run one combined spec/security review after all three tasks. Focus on:

- authoritative config identity across the two reads;
- SPL owner/layout/state/mint checks;
- availability semantics for any non-null candidate;
- nonce/PDA exactness;
- no placeholder/deployment bypass;
- no raw bytes or mutable authority data;
- no accidental Create preparation or screen enablement.

Then run once:

```bash
npm test
npm run typecheck
npm run doctor
rm -rf .verify/expo-export
npx expo export --platform android --output-dir .verify/expo-export
rm -rf .verify/expo-export
git diff --check
```

Update active repository and Hub status docs to observed behavior and commit coherent milestones.

## Explicit non-goals

- No nonce generation, persistence, collision retry, or silent nonce replacement.
- No schedule/cadence/timezone/claim-window policy.
- No rule digest construction.
- No Create instruction/preparer changes.
- No screen changes or transaction state machine.
- No invite generation.
- No deployment manifest, program identity, mint, token-account creation, live/deployment RPC invocation, MWA invocation, wallet signature, or valuable asset.
- No Token-2022 support.

## Product decisions still requiring Jack

Before schedule UI becomes product behavior, decide:

1. weekly-only P0 versus multiple cadence presets;
2. first-event date/time default;
3. claim-window duration;
4. resolution-grace duration;
5. device-local versus explicit timezone policy;
6. generated schedule versus per-event editing;
7. random versus monotonic nonce allocation and collision retry policy;
8. whether unresolved-claim voiding remains an implicit protocol invariant or a versioned visible rule.

## Rollback

This milestone is additive and read-only. Reverting its production commits restores the prior reader/facade without changing existing transaction behavior. The plan remains a historical decision record.
