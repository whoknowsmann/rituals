# Rituals — public README draft

> **Show up, or pay up. You set the stake. You do the work. You get it back.**

**Draft for hackathon review — not the repository’s final README.**

Rituals is a Solana Mobile commitment device for small private groups. Two to six
friends choose a recurring commitment—read, study, practice, attend, call family,
or create—then each member locks an equal event-by-event stake. A member signs a
completion claim. Friends confirm under the rule the group chose before funding.
When the threshold is reached, the program returns that member’s event allocation.
A clearly unclaimed allocation is redistributed among confirmed members; pending or
questioned claims are protected from automatic confiscation.

Friends are witnesses, not rivals. Rituals has no chance element, no counterparty,
and no platform share of stakes or forfeitures. It is a self-directed forfeitable
deposit, in the category of commitment tools such as StickK and Beeminder—not a
betting market.

## The hero loop

```text
Create → invite → fund → activate → claim → friend confirms → settle → receipt
```

The production protocol and typed client prove the complete lifecycle on Solana
devnet with CLI keypairs. The mobile integration is being completed around that
protocol for the Seeker demo. The final submission will show the same lifecycle
through Mobile Wallet Adapter once the phone-signed gate is complete.

## How it works

1. **Create.** The host chooses a ritual, schedule, equal per-member stake, event
   count, fee payer, and confirmation threshold.
2. **Invite.** A digest-bound invitation carries the locked rules to the private
   group.
3. **Fund.** Every member funds the same event allocation from a wallet selected
   in the wallet UI.
4. **Activate.** Once the roster is funded, the program locks the terms and charges
   one disclosed activation fee.
5. **Claim.** A member signs an event-specific completion claim during the claim
   window.
6. **Confirm.** Eligible friends sign confirmations. The program rejects self-
   confirmation, duplicate confirmations, nonmembers, and claims for another event.
7. **Settle.** Confirmed members recover their own event allocation. Only clearly
   unclaimed allocations are redistributed. Pending or questioned claims use the
   no-confiscation path.
8. **Receipt.** The app shows the signed claim, confirmations, threshold, event
   result, remaining recoverable stake, and onchain identifiers.

Threshold options are Honor (no friend confirmation), One friend (the default),
Group majority, and Unanimous. A wallet signature proves who attested and what rule
was enforced; it does not prove that the real-world activity happened. Friends are
the human oracle.

## Devnet deployment

These are public identifiers for a devnet deployment using valueless SPL TEST
assets. They are not mainnet addresses and must not be used for real funds.

| Resource | Address |
|---|---|
| Program | `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` |
| ProtocolConfig | `7LMgBSJmEFKkfYKh2znr6VSxcm5QEHEouNijXDENhMd1` |
| TEST stake mint (6 decimals) | `AaHgFh7ussUDor8QfaBCaRz2RHiPNCs7i2yuzdLbt9tc` |
| Fee recipient token account | `CD2gkjrNr6cp6asMzYXjPD2uxYkz97Hrmgw7z6c6Z8UJ` |
| Devnet upgrade authority | `ETQ9czekQJSebxkWn986Hao15FfEbe1345cZZDrHhXbx` |
| First verified Ritual | `fKKTwdDgNiqYtAnxgLyDL8W2xJxGx5Y2QjMu6pxT5XH` |

The activation fee is separate from stake: 2% of the committed pool, with a
0.50–5.00 USDC-equivalent floor/cap in the six-decimal configuration. The fee is
stored at activation. Rituals takes no share of forfeited allocations.

## Run locally

Requirements: Node.js, npm, an Android development environment for device work,
and a Solana devnet wallet for disposable test identities.

```bash
npm ci
npm test
npm run typecheck
npm run doctor
```

The Android JavaScript bundle smoke test is:

```bash
rm -rf .verify/expo-export
npx expo export --platform android --output-dir .verify/expo-export
rm -rf .verify/expo-export
```

This export does not prove native Mobile Wallet Adapter behavior. Use a custom
Expo development build or standalone APK for native wallet testing:

```bash
npm run build                 # EAS development APK
npm run build:local           # local EAS development APK, if configured
```

The `preview` and `production` EAS profiles produce APKs. Keep signing keys and
passwords outside Git.

Useful devnet scripts:

```bash
npx tsx scripts/verify-devnet-config.ts
npx tsx scripts/smoke-create-ritual.ts
npx tsx scripts/smoke-full-lifecycle.ts
npx tsx scripts/inspect-ritual.ts <ritual-address>
```

The scripts require local devnet tooling and disposable identities. Never point
them at valuable assets or personal wallets.

### Test-count note for this draft

The expected checkpoint is **1,906 JavaScript/TypeScript tests across 65 files**,
with 180 native program test functions and a clean TypeScript check, as recorded in
`docs/STATUS.md` and re-measured by the parent agent on 2026-09-23. In this
submission-materials checkout, `npm test` was attempted but could not start because
`vitest` is not installed (`sh: 1: vitest: not found`). Re-run `npm ci` and `npm
test` from a dependency-complete checkout before replacing this note with fresh
terminal output.

## Architecture

```text
Seeker Android app (Expo / React Native)
  ├─ MWA authorization and signing transport
  ├─ Ritual screens and state machines
  ├─ typed RitualsRepository
  │    ├─ fixture repository for preview-only screens today
  │    └─ RPC-backed readers and prepared actions
  └─ RitualClient
       ├─ deployment + devnet identity gate
       ├─ exact Anchor instruction/account codecs
       ├─ message/signature binding
       ├─ blockheight confirmation
       └─ authoritative read-after-write verification

Solana devnet
  └─ Anchor Rituals program
       ├─ ProtocolConfig
       ├─ Ritual and member roster
       ├─ stake and fee vaults
       ├─ Event and CompletionClaim accounts
       ├─ threshold attestations
       └─ deterministic settlement and receipts
```

The domain layer is pure and uses checked token atomic-unit arithmetic. The client
fails closed on the wrong cluster, program identity, mint, account owner, schema,
or invite digest. The program owns escrow through PDAs; there is no Rituals server
and no developer-controlled withdrawal path.

The current visible Create path submits a real Create transaction. Home, detail,
claim, confirmation, and receipt screens are still fixture-backed in the observed
checkout; the corresponding client actions and full protocol lifecycle are proven
by devnet scripts. Deterministic ritual suggestions run on-device from the template
picker. They are not a hosted or generative AI feature.

SKR integration is real: the app reads the current SKR balance and can select the
activation-fee discount branch. The balance is not used to adjudicate claims.

## Honest status

### Proven

- Anchor program deployed to Solana devnet.
- Protocol configuration and valueless TEST mint verified against the typed client.
- Full CLI-signed lifecycle: create, fund twice, activate, initialize event, claim,
  friend approval, finalize/settle, and exact conservation assertions.
- Settlement returns confirmed allocations, redistributes only clearly unclaimed
  allocations, strands no remainder, and gives the protocol no forfeiture share.
- Expo/React Native Android app installs and launches on a physical Seeker.
- Funding lobby Create path is wired to the typed client.
- MWA authorization/submission transport exists in the app code.
- SKR balance read and activation-fee discount branch exist.

### Pending before calling the phone demo complete

- A real Create signed through Mobile Wallet Adapter from the Seeker.
- A wallet-signed two-wallet devnet lifecycle on the phone.
- Invite/join, member-funding progress, and activation wiring in visible screens.
- Authoritative RPC-backed home/detail/claim/confirmation/receipt screens.
- Standalone release APK acceptance and final visual/accessibility QA.

The demo script explicitly avoids the reload-recovery path until it has been proven.
Submitted-action handles are process-local by design; reloading during an in-flight
wallet transaction is not presented as supported behavior yet.

## Security and devnet-only disclaimer

This is a hackathon prototype. It uses valueless devnet assets and is not a claim
that mainnet SOL, USDC, or other valuable funds are safe. Mainnet activation is
blocked on independent program review, legal and publisher-policy review, privacy
controls, dispute design, and a real two-wallet acceptance pass.

- Never enter or store seed phrases, private keys, keystores, or wallet passwords in
  Rituals or this repository.
- Use fresh disposable devnet accounts and let the wallet choose the account in its
  own approval UI.
- Review exact outflow, stake, activation fee, cluster, mint, and threshold before
  signing.
- A wallet signature proves an attestation, not physical-world truth.
- A pending or questioned claim is not silently treated as a missed commitment.
- The app has no accounts, email collection, hosted backend, contacts, camera,
  precise location, or required evidence uploads in the P0 slice.
- Onchain wallet public keys, rule digests, amounts, thresholds, claims,
  confirmations, and settlement state are public by design.

## License and status

This document is a draft for the Clock In hackathon package. Confirm repository
license, public-origin MWA identity, APK artifact, demo link, and final privacy/store
copy before publication.
