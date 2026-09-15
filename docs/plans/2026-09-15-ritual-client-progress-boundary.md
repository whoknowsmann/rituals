# Ritual Client Progress Boundary Implementation Plan

> **Status:** Active production plan. Spike `spikes/002-client-progress-boundary/` validated the split runtime-opaque submitted-action seam. This plan implements that seam before visible Create transaction UX.

## Goal

Let mobile UI observe a truthful post-wallet `submitted` boundary before authoritative `confirming`/`confirmed` work without weakening the existing prepared-message, signer, signature, blockheight, or readback guarantees.

## Current boundary

`RitualActionSubmitter.submitAndConfirm(prepared)` currently performs these operations in one promise:

1. unwrap and revalidate the prepared transaction;
2. invoke the wallet once;
3. prove the returned signature belongs to the exact prepared message;
4. build the internal submitted-action expectation;
5. confirm by blockheight and authoritatively read back the expected state.

The combined promise is safe but does not give React a truthful await boundary between submission and confirmation.

## Chosen design

Add split primitives backed by a runtime-opaque, process-local handle:

- `submitPrepared(prepared)` performs steps 1–4 and returns an immutable `SubmittedRitualActionHandle` only after signature/message verification succeeds.
- `confirmSubmitted(handle)` accepts only a handle issued by the same `RitualActionSubmitter`, performs step 5, and returns the existing confirmed result.
- duplicate confirmation calls for the same handle share one promise and never repeat confirmation/readback;
- forged, prototype-only, structurally copied, cross-submitter, or stale handles fail before confirmation transport work;
- existing `submitAndConfirm(prepared)` remains and composes the two primitives without a second wallet request.

The handle may expose only immutable, non-custody display metadata needed by later UI: canonical signature, message digest, action kind, expectation kind, and ritual address. Confirmation authority remains in submitter-owned private state, not TypeScript structural branding.

## Explicit limitations

- Handles are process-local. Reload/crash recovery must use a future separately validated transaction-identity recovery path; serialized objects must never regain confirmation authority.
- This milestone does not expose fake success, an invite, or a created Ritual route.
- This milestone does not change the current `not-deployed` configuration.
- This milestone does not call RPC, MWA, a wallet, or a public cluster during tests.

## Task 1 — Split the submission boundary with strict TDD

### Files

Modify:

- `src/data/rituals/ritualSubmission.test.ts`
- `src/data/rituals/ritualSubmission.ts`

### RED acceptance tests

Add focused tests proving:

1. `submitPrepared` invokes the wallet once and returns a frozen handle only after the real existing signature/message checks pass.
2. invalid, malformed, mismatched, or mutated wallet output never yields a handle.
3. `confirmSubmitted` rejects a plain structural forgery and a prototype-only forgery before confirmation/readback.
4. a handle issued by another submitter is rejected before confirmation/readback.
5. two confirmation calls for one handle return the same promise and execute confirmation/readback once.
6. confirmation failure is shared by duplicates and cannot be retried implicitly with the same handle.
7. public handle metadata is canonical, immutable, and detached from mutable prepared input.
8. `submitAndConfirm` composes the split methods with exactly one wallet request and one confirmation/readback.

Run the exact focused RED before production edits and preserve the failing output in the implementation report.

### GREEN implementation

- Introduce a runtime-opaque exported handle class/type whose constructor cannot grant authority by structural imitation.
- Keep handle authority in a private per-submitter `WeakMap`.
- Store the internal `SubmittedRitualAction` and one optional confirmation promise in the map.
- Move the current pre-confirmation logic into `submitPrepared` without weakening or duplicating validation.
- Implement `confirmSubmitted` over only submitter-issued state.
- Reimplement `submitAndConfirm` as composition.

### Focused verification

```bash
npx vitest run src/data/rituals/ritualSubmission.test.ts
npm run typecheck
```

## Task 2 — Expose the split seam through the application facade with strict TDD

### Files

Modify:

- `src/data/rituals/ritualClient.test.ts`
- `src/data/rituals/ritualClient.ts`

### RED acceptance tests

1. `RitualClient` exposes immutable `submitPrepared`, `confirmSubmitted`, and compatibility `submitAndConfirm` methods.
2. `submitPrepared` and `confirmSubmitted` bind to the same internal submitter instance, so its handle is accepted.
3. a handle from a different client/submitter is rejected.
4. the facade does not construct or expose a client while deployment is unavailable; existing fail-closed behavior remains green.

### GREEN implementation

- Extend `RitualClient` with the split methods and handle/result types.
- Bind all three submission methods to the one internal `RitualActionSubmitter`.
- Preserve the null-prototype, non-enumerable, non-writable, frozen facade.

### Focused verification

```bash
npx vitest run src/data/rituals/ritualSubmission.test.ts src/data/rituals/ritualClient.test.ts src/features/rituals/client/useRitualClient.test.ts
npm run typecheck
```

## Review and integration gate

Run one combined specification/security review focused on:

- no signature or message verification moved after handle exposure;
- no structural object can gain confirmation authority;
- no cross-client capability confusion;
- no duplicate confirmation/readback;
- no mutable nested metadata exposure;
- exact compatibility behavior;
- honest process-local recovery limitation.

Repair every Critical/Important finding and re-review.

Then run once:

```bash
npm test
npm run typecheck
git diff --check
```

Update README, architecture, roadmap, development/security docs, and the Hub roadmap/project home only if the observed boundary changes their current claims. Commit coherent production and documentation checkpoints separately.

## Non-goals

- No screen state machine in this milestone.
- No rule-digest serialization decision.
- No nonce policy.
- No schedule/start-time UX.
- No stake mint, fee recipient, or token-account policy.
- No invite generation or persistence.
- No package changes.
- No generated identity, deployment, RPC request, MWA invocation, wallet signature, or valuable asset.

## Rollback

The production change is additive and retains `submitAndConfirm`. Reverting the production commit restores the prior combined-only facade; spike evidence and this plan remain historical decision records.
