# Rituals

**Show up, or pay up. You set the stake. You do the work. You get it back.**

Rituals is a Solana Mobile commitment device. You put your own money behind a
recurring commitment you keep skipping. If you show up, you get it back. If you
don't, you forfeit that event's allocation to the members who did show up.

Friends are **witnesses, not rivals**: they co-sign that you showed up. There is
no chance element and no counterparty, so this is a forfeitable deposit rather
than a wager — the same product category as StickK or Beeminder, implemented
onchain. See `docs/PRODUCT.md` for the canonical framing used in copy, the pitch,
and any app-review question.

## Current status

Last verified 2026-09-18 against live devnet and a physical Seeker.

**Deployed and proven on devnet.** The Anchor program is live on devnet and the
complete hero flow — create → fund ×2 → activate → initialize event → claim →
friend approves → finalize/settle — has been executed as real transactions
against a live validator using the production typed builders, with 17/17
assertions passing. Settlement is verified exactly: the event pool equals both
member allocations, payout plus refund plus remainder equals the pool, the
unclaimed member's allocation is forfeited to the confirmed claimant, no
remainder is stranded, and the protocol takes no share.

**Deployment configuration is `deployed`.** The application facade opens, and the
funding-lobby screen submits a real Create transaction through the typed client.

| What | Address |
|---|---|
| Program | `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` |
| ProtocolConfig | `7LMgBSJmEFKkfYKh2znr6VSxcm5QEHEouNijXDENhMd1` |
| TEST stake mint (6dp) | `AaHgFh7ussUDor8QfaBCaRz2RHiPNCs7i2yuzdLbt9tc` |
| Fee recipient token account | `CD2gkjrNr6cp6asMzYXjPD2uxYkz97Hrmgw7z6c6Z8UJ` |
| Upgrade authority | `ETQ9czekQJSebxkWn986Hao15FfEbe1345cZZDrHhXbx` |
| First verified Ritual | `fKKTwdDgNiqYtAnxgLyDL8W2xJxGx5Y2QjMu6pxT5XH` |

Devnet only, valueless SPL TEST assets. Not for mainnet.

**Not yet proven: the phone gate.** Every on-chain proof so far was signed by CLI
keypairs. No transaction has been signed through Mobile Wallet Adapter from the
device. The instructions are byte-identical — only the signer transport is
unverified — but until that passes, "works on a Seeker" is not a claim this
repository makes.

**Still fixture-backed.** Home, detail, claim, confirmation, and receipt screens
read deterministic fixtures rather than authoritative RPC. Create is the only
visible path that submits. Invite/join and member-funding progress do not exist
yet.

Verified state on the device (2026-09-18): the APK installs and launches cleanly
on a physical Seeker (Android 16, SDK 36, arm64-v8a) with no crashes, and made
zero wallet-adapter calls while idle.

### Measured checkpoint

| Gate | Result |
|---|---|
| TypeScript/JavaScript tests | 1,906 passing across 65 files |
| Native program test functions | 180 across `program-tests/` |
| Program size | 2,145 lines (`programs/rituals/src/lib.rs`) |
| `tsc --noEmit` | clean |
| Live chain assertions | `verify-devnet-config.ts` — all pass |

Re-measure before quoting these; do not copy stale numbers forward.

## Stack

- Expo `~52.0.49` / React Native `0.76`
- TypeScript, React Navigation, React Native Paper, TanStack Query
- `@solana/web3.js`, SPL Token, Solana Mobile Wallet Adapter
- Anchor program, native ProgramTest harness
- Vitest and EAS Android builds

Build identity is Rituals throughout: name `Rituals`, slug `rituals`, Android
package and iOS bundle identifier `com.whoknowsmann.rituals`, EAS owner
`argussmithson`. The MWA wallet identity URI still points at the private
repository and must change when a public origin exists.

## Local verification

```bash
npm ci
npm test
npm run typecheck
npm run doctor
rm -rf .verify/expo-export
npx expo export --platform android --output-dir .verify/expo-export
rm -rf .verify/expo-export
```

The export is a disposable Metro bundle smoke test — not APK, native MWA, wallet,
or release proof. Expo Go cannot exercise the native MWA package.

### Devnet and device scripts

```bash
./scripts/check-device.sh                     # read-only Seeker/profile/wallet report
npx tsx scripts/verify-devnet-config.ts       # assert live ProtocolConfig matches the client
npx tsx scripts/smoke-create-ritual.ts        # real Create against devnet (fresh nonce each run)
npx tsx scripts/smoke-full-lifecycle.ts       # full hero flow as real transactions
npx tsx scripts/inspect-ritual.ts <address>   # read live Ritual/Event/Claim state
```

`scripts/adb.sh` drives the Windows `adb.exe` from WSL deliberately: installing a
second adb inside WSL makes two daemons fight over the same USB device and
produces misleading "device offline" errors.

## Safety boundary

P0 is devnet with valueless test assets and explicit no-real-value labeling.
Never request or store seed phrases, private keys, tokens, keystores, or valuable
wallet material. A wallet signature proves attestation, not physical-world truth.

**Device rule:** Jack's Seeker is a personal device. Its Seed Vault and existing
personal wallets are off-limits — no authorization, no balance reads, no prompts
that could touch them. Wallet accounts are selected by Jack in the wallet's own
prompt, never by tooling. Demo wallets must be fresh accounts.

Mainnet and valuable assets require independent program review, legal/publisher
review, privacy controls, dispute design, and an exercised two-wallet flow.

## Documentation

- `docs/PRODUCT.md` — what Rituals is and is not; canonical copy rules
- `docs/STATUS.md` — single source of truth for current state and next gate
- `docs/ARCHITECTURE.md` — observed active boundaries
- `docs/DEVELOPMENT.md` — setup, verification, and device workflow
- `docs/ROADMAP.md` — completed and remaining work
- `docs/SECURITY.md` — current limits and trust boundaries
- `docs/plans/2026-09-17-hackathon-submission.md` — active submission plan
- `docs/plans/2026-09-09-rituals-rebuild.md` — historical rebuild plan

Product and hackathon decisions live in Jack's Hub vault under
`Projects/Rituals`. This repository is authoritative for behavior that exists in
code; the Hub is authoritative for product and hackathon decisions.

## Sketch

The retained consumer sketch is `sketches/consumer-pivot/001-rituals/`; its
README and screenshot are the only active consumer-pivot artifacts.
