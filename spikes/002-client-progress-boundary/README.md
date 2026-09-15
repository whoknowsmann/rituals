# Spike 002 — client progress boundary

## Question (Given / When / Then)

**Given** `RitualActionSubmitter.submitAndConfirm(prepared)` currently performs wallet submission, signature/message verification, blockheight confirmation, and authoritative readback in one awaited operation,

**When** a mobile UI must render truthful `wallet -> submitted -> confirming -> confirmed/error` progress,

**Then** compare:

- **A — combined observer:** retain one `submitAndConfirm` call and invoke an awaited progress callback/observer at verified lifecycle boundaries.
- **B — split operation:** return an opaque submitted-action capability after wallet signature/message validation; accept only that capability for confirmation/readback.

## Alternatives implemented

`progressBoundary.ts` contains both alternatives using deterministic fake transports:

- `SplitSubmitter.submit(prepared, observer?)` performs the wallet step once, validates the returned signature against the exact prepared message, and only then creates a runtime-opaque `SubmittedActionHandle` and emits `submitted`.
- `SplitSubmitter.confirm(handle, observer?)` accepts only a handle issued by that submitter. A `WeakMap` stores the internal capability state, so a structurally compatible object or `Object.create(SubmittedActionHandle.prototype)` has no authority. Duplicate confirmation calls share the same promise.
- `CombinedSubmitter.submitAndConfirm(prepared, observer?)` composes the split primitives. It preserves the existing one-call compatibility shape without signing twice.

Progress events are frozen snapshots. Observers receive no custody-bearing `PreparedAction.custody` object; observer exceptions are isolated and cannot interrupt the custody flow. `subscribe()` returns an unsubscribe function for component unmount.

## Threat model and guarantees

The spike treats application code and UI observers as potentially buggy or hostile, while the wallet and on-chain program remain the custody authorities. It protects against:

- presenting `submitted` for an invalid or message-mismatched wallet signature;
- confirming a copied, forged, or stale plain object;
- duplicate confirmation causing a second confirmation/readback;
- observer mutation of progress data or prepared custody data;
- observer exceptions preventing confirmation or manufacturing `confirmed`.

It does **not** make arbitrary modified application code trustworthy, replace wallet authorization, or prove Solana serialization/RPC behavior. The validator and transports are deterministic fakes for the boundary comparison.

## Evidence

`progressBoundary.test.ts` has 10 focused tests proving:

1. wallet/sign runs once;
2. signature/message validation precedes `submitted`;
3. the combined API exposes `submitted` before `confirming`;
4. a plain forged object cannot confirm;
5. duplicate confirmation shares one promise and one reader call;
6. confirmation errors emit `error` and never `confirmed`;
7. observers cannot mutate custody-bearing data;
8. observer exceptions are isolated and unsubscribe models component unmount;
9. the compatibility API composes split primitives without a second wallet call;
10. invalid signatures emit `wallet,error`, never `submitted`.

### Exact commands

From `/home/hound/projects/preflight`:

```bash
npx vitest run spikes/002-client-progress-boundary/progressBoundary.test.ts
npx tsc --noEmit --strict --target ES2022 --module ESNext \
  --moduleResolution Bundler --skipLibCheck --esModuleInterop \
  spikes/002-client-progress-boundary/progressBoundary.ts \
  spikes/002-client-progress-boundary/progressBoundary.test.ts
```

Observed final evidence:

- Vitest: **1 test file passed, 10 tests passed**.
- TypeScript: **passed with no diagnostics**.
- No production files, package manifests, lockfiles, repository docs, credentials, RPC, wallet adapter, or deployment state were touched.

## Limitations

- The capability is process-local. A reload, process restart, or crash loses the `WeakMap`, in-flight promise, and subscriber list. Recovery must not deserialize or accept a handle from storage; production would need a separate recovery query keyed by a validated transaction identity and must re-run authoritative confirmation/readback under current expiry rules.
- The spike does not model blockheight expiry, RPC retries, readback invariants, or real wallet signature encoding; those remain responsibilities of the existing Ritual confirmation and submission layers.
- `submitted` means the wallet returned a valid signature for the prepared message. It does not claim chain inclusion; `confirmed` requires the confirmation reader's result in this comparison.

## Verdict

**VALIDATED.** Both seams can expose truthful progress without repeating wallet submission, but **B is the recommended production seam**: the opaque handle makes the post-signature boundary explicit and prevents callers from manufacturing confirmation input by structural imitation. Keep A as a compatibility facade implemented by composing B, so existing callers can migrate without changing custody semantics.

## Production recommendation

Later production work should add split methods to the Ritual client boundary (names such as `submit` and `confirmSubmittedAction`), backed by the existing signature validation and `RitualConfirmationVerifier`. Keep `submitAndConfirm` as a compatibility composition. The production implementation should preserve immutable snapshots, observer isolation, expiry/error mapping, authoritative readback, and explicit in-memory/reload recovery semantics. Expected production files are `src/data/rituals/ritualSubmission.ts`, `src/data/rituals/ritualClient.ts`, and their focused tests; this spike intentionally does not modify them.
