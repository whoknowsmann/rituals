# Fewer Signatures — Devnet Proof and Implementation Plan

> **Scope:** devnet only, valueless TEST tokens, no program changes.

**Goal:** Reduce wallet approval prompts by combining lifecycle instructions into
atomic transactions while preserving exact-message review, compute-budget
instructions, recovery journaling, and authoritative readback.

## Measured prompt counts

The product-owner baseline is measured as wallet prompts per two-person journey:

| Role | Before | After A+C (implemented) | After A+B+C (B proven, not wired) | Candidate A+B+C+D |
|---|---:|---:|---:|---:|
| Host | 7 | **5** | **5** | 4*
| Member | 3 | **3** | **2** | 2*

- **Before:** host signs Create, host Fund, Activate, Initialize Event, Claim,
  Finalize, Close; member signs Fund, Claim, Approve.
- **A:** Create + host Fund is one host-signed transaction: host saves one
  prompt.
- **B:** last member Fund + Activate is one member-signed transaction: member
  saves one prompt. `activate_ritual` has no ritual-member signer; the last
  member can be the fee payer.
- **C:** Initialize Event + first Claim is one claimant-signed transaction:
  whoever claims first opens the event and saves one prompt.
- **D:** Finalize + Close would save one host prompt only when the final event is
  terminal. It is not yet proven and is not included in the implemented count.

`*` is the expected count if D is independently proven and wired. It is not a
verified result.

## Devnet proof

Command, using only the explicit keypairs `.keys/rituals-devnet-deployer.json`
(host) and `.keys/rituals-devnet-friend.json` (member):

```bash
npx tsx scripts/smoke-bundled-actions.ts \
  CD2gkjrNr6cp6asMzYXjPD2uxYkz97Hrmgw7z6c6Z8UJ \
  4UAbYjikxY1fWj1AkaPLih5hTdzvGgsRwBFCg6AVkmwP
```

Successful run on 2026-09-25 used a fresh ritual and recorded:

| Bundle | Instructions | Signature | Readback |
|---|---|---|---|
| A | `create_ritual` + host `fund_member` | `4GhDiJM9cNa11p3VSPSiPM1ocXXu1HtZSHdVZP6FbRDNLzZSELYZfBFax9X8cuyZr9kSrRYHjCxZL5aSBoTo6QeA` | `Funding`, host bitmap `1`, count `1`, stake funded, fee locked |
| B | friend `fund_member` + `activate_ritual` | `2CctpZh9Y7wfahiRVkyxg6H3xqyUg7uytpth8Gzv8gJCBC2uJmRe9RAaRiPxixBu1TpAGMXsyLujuMZaRfq8z8L` | `Active`, bitmap `3`, count `2`, fee transferred |
| C | `initialize_current_event` + host `claim_completion` | `t2x5kJTbey9dd1BktJca2uGAVQYMLTphrBiQRnLDWDh9iuSssMnyPV3kid2xmPzxitA6RrxqKN6TXdRou9zbMLD` | event exists and host claim is `Pending` |

The script compiles each transaction and asserts exactly one required wallet
signature. Each transaction carries `SetComputeUnitLimit` and
`SetComputeUnitPrice`; no program deploy or upgrade is performed. The script
uses a 12-second first-event delay and spends only TEST tokens plus normal
account rent/network fees.

The recorded successful proof run used three transactions. Across the three
pre-C diagnostic/retry runs plus the final proof (nine sent transactions total;
failed C builds did not broadcast), RPC transaction metadata measured
`0.03564744 SOL` of payer debits and `0.0000468 SOL` of network fees, below the
`0.1 SOL` budget. TEST-token movements are valueless.

Bundle D remains **untested**. The final-event state must be created before it
can be tested cheaply; do not rely on it until a transaction and terminal
vault readback are recorded.

## Client implementation

Implemented on `feat/fewer-signatures`:

- `RitualActionPreparer` accepts an ordered instruction list and still hashes
  the exact transaction message. Compute-budget instructions remain in the
  reconstructed wallet transaction.
- `PreparedExpectation` and `RitualActionExpectation` support a frozen ordered
  bundle of expectations. Confirmation verifies every component against one
  authoritative final read, using the indexed event reader when needed.
- Bundle A is selected when Create has an existing creator ATA. The screen
  derives the authorized devnet TEST ATA; if an ATA is absent, the chain will
  reject the bundle rather than creating a token account implicitly.
- Bundle C is selected when Claim is the first event action and the event is
  absent. An already initialized event keeps the existing standalone Claim
  path.
- New action kinds are accepted by the recovery journal. The journal is written
  before wallet handoff and updated with the returned signature, exactly as for
  standalone actions.

## Risks and safeguards

1. **Atomicity:** Any failing instruction rolls back the whole transaction, but
   the wallet may return after broadcasting. The client therefore keeps the
   post-signature `submitted`/signature recovery path and never reports
   “nothing was sent” after wallet return.
2. **Expectation readback:** A multi-instruction transaction needs a combined
   expectation, not just the last instruction. The verifier checks all bundle
   members against the final authoritative ritual/event/claim state.
3. **ATA prerequisite:** A requires the host's token account before signing.
   ATA derivation is not account creation; the UI must not promise A when the
   account does not exist. A later dedicated ATA-provisioning action would add
   another prompt and should be disclosed separately.
4. **Fees and rent:** Preparation sums token outflow and rent for every account
   created by the bundle. Network fee is still an estimate and must remain in
   the review summary. A creates the ritual plus two vaults; C creates an event
   and a claim.
5. **Transaction size/compute:** Combining instructions increases message size
   and compute. The client retains the explicit 200k compute limit and priority
   price required for Phantom's exact-message behavior. A/B/C fit on devnet;
   D needs a separate size/compute proof.
6. **Time windows:** C must be sent while the event is `Scheduled` or `Claiming`.
   Preparation and wallet delay can cross a deadline; authoritative confirmation
   then reports failure/unknown and recovery must resolve it from chain.
7. **Fee-payer/signature identity:** B relies on Activate's account contract:
   the fee payer signs the transaction, while the instruction has no ritual
   member signer. The devnet proof verifies the friend can pay for both
   instructions.
8. **Retry semantics:** Retrying a post-submission bundle can duplicate neither
   Create nor Claim safely. Recovery must resolve the original signature before
   offering a fresh prepared action.

## Verification gates

```bash
npx tsc --noEmit
npx vitest run
npx tsx scripts/smoke-bundled-actions.ts \
  CD2gkjrNr6cp6asMzYXjPD2uxYkz97Hrmgw7z6c6Z8UJ \
  4UAbYjikxY1fWj1AkaPLih5hTdzvGgsRwBFCg6AVkmwP
```

The focused bundle tests cover instruction ordering, one signer, exact-message
reconstruction, combined rent, recovery selection, and indexed combined
readback. The aggregate suite and typecheck are the release gates; a physical
Seeker run is still required to measure the actual Phantom/Seed Vault tap
sequence.
