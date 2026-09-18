# Clock In Submission Plan

> **Status:** Active execution plan. Supersedes prior milestone plans as the
> scheduling authority. Written 2026-09-17.
>
> **Deadline:** 2026-10-09 06:59 UTC (01:59 CDT). Internal ship target is
> 2026-10-08 06:59 UTC — 24 hours early, non-negotiable.

## Posture change

The protocol and the typed client are DONE and FROZEN. 176 native Rust cases and
1,758 TypeScript cases already exceed what this submission needs. Measured at the
freeze point:

- `src/data` (plumbing): 6,296 lines vs `src/screens` (judge-visible): 722 lines
- Rust: 2,145 program lines vs 11,830 program-test lines

That ratio was correct for a protocol and is wrong for a hackathon with three weeks
left. From here:

- **No new backend tests** unless reproducing an observed defect on the visible path.
- **No new adversarial matrices.** The existing custody, authority, arithmetic,
  serialization, and transaction-identity coverage stands as-is.
- **Every remaining hour goes to** the visible path, devnet, device, and submission
  materials.

Frozen (change only to fix a real defect): `programs/`, `program-tests/`,
`src/data/rituals/`, `src/domain/rituals/`.

## Locked product decisions

Previously blocking steps 2–8. Decided 2026-09-17; implement as specified,
do not relitigate.

| # | Decision | Value |
|---|---|---|
| 1 | Cadence | Weekly only for P0 |
| 2 | First event | Next occurrence of the chosen weekday |
| 3 | Claim window | 48h from event start |
| 4 | Resolution grace | 24h after claim window closes |
| 5 | Timezone | Device-local, displayed with explicit offset, no picker |
| 6 | Schedule editing | Generated schedule, no per-event editing |
| 7 | Nonce | Random u64, one collision retry via the existing availability snapshot |
| 8 | Unresolved-claim voiding | Stays an implicit protocol invariant, shown as a visible rule string |

### Devnet duration override

Non-optional for the demo. A weekly ritual with a 48h claim window cannot be
demonstrated in a video. Requirements:

- Devnet-only; must be impossible to activate against mainnet.
- Compresses event period, claim window, and grace to seconds.
- Visibly labeled in-app as a demo acceleration — never hidden.
- Does not alter settlement math, custody, or authority checks.

Without this the hero flow demo is impossible. Build it early, not the night before.

## Hero flow

The one path that must work on a real Seeker with two real wallets:

**Create → Fund → Activate → Claim → Friend Confirm → Settle**

Everything else stays fixture-backed preview if time runs out. This flow is the
demo video, and it is also the answer to "meaningful interaction with the Solana
network."

## Schedule

### Week 1 (Sep 17–23) — Deploy and prove Create

- [ ] Send organizer questions (Hub: Clock In Organizer Questions) — **day one, blocks nothing but informs everything**
- [ ] Re-init EAS under `argussmithson` with the new `rituals` identity
- [ ] Prove the Android build still works after the identity change
- [x] Align program identity across declare_id!, Anchor.toml, deploy keypair, frozen IDL, and TS
- [x] Decouple cross-language vectors from the deployment identity
- [x] Implement the devnet duration override (accelerated demo cadence)
- [x] Generate schedules and nonces (locked decisions 1–7)
- [x] Build the Create state machine and orchestrator
- [ ] **BLOCKED — fund the deploy wallet:** needs ~5 devnet SOL at
      `5zLkuSKAdkswmsRsCN7XtiKAYhH1pkwpiYQKzeuJgZbm` (rent exemption alone is
      3.01 SOL). Public CLI faucet is rate-limited; use the GitHub-authed
      faucet at https://faucet.solana.com
- [ ] Deploy to devnet; create a valueless SPL test mint
- [ ] Flip deployment config off `not-deployed`; verify the client facade opens
- [ ] Wire the machine into the Review screen
- [ ] **Gate: one real Create transaction confirmed on devnet from the phone**

#### Wallets

| Role | Where | Purpose | Needs |
|---|---|---|---|
| Deploy | CLI `~/.config/solana/id.json` | deploy, mint, rent | ~5 SOL |
| Host (wallet A) | Phantom / Seed Vault on Seeker | creates and funds | ~1 SOL |
| Friend (wallet B) | second Phantom on Seeker | confirms the claim | ~1 SOL |

Public addresses only. Never store or transmit seed phrases or private keys.

### Week 2 (Sep 24–30) — Complete the lifecycle

- [ ] Digest-bound invite generated only after confirmed Create
- [ ] Join flow and member funding progress
- [ ] Fund + Activate state machines
- [ ] Claim, friend confirmation, and settlement wired to authoritative RPC
- [ ] Replace fixture dashboard/detail/receipt reads with real data
- [ ] **Gate: full two-wallet lifecycle completes on devnet**
- [ ] **Checkpoint: schedule holding? If yes, AI recap is in scope. If not, cut it now and say so.**

### Week 3 (Oct 1–8) — Harden and package

- [ ] SKR activation-fee discount (real balance read + fee branch, no theater)
- [ ] Stale / rejected / expired / offline / duplicate-tap / reconnect handling
- [ ] Reload recovery for in-flight transactions — see risk below
- [ ] Icon, splash, adaptive icon, visual polish
- [ ] Accessibility and Seeker-size QA
- [ ] Signed standalone APK, installed and verified on the Seeker
- [ ] Demo video, pitch deck, screenshots, privacy copy
- [ ] Make the GitHub repo public; update the MWA wallet identity URI
- [ ] Integrated adversarial pass on the now-complete app
- [ ] **Ship Oct 8 06:59 UTC**

## Rubric hedge

Two published rubrics disagree. Live Align API: AI 20, SKR 20, UX 15, UI 15,
Innovation 15, Ecosystem Impact 15. Terms §8.1: four equal 25% criteria
(Stickiness/PMF, UX, Innovation, Presentation) with no AI or SKR.

Rituals currently scores zero on AI and SKR — a 40-point forfeit under the API
rubric. Strategy:

1. The hero flow serves UX, UI, Presentation, Innovation, and Stickiness under
   **both** rubrics. It is unconditionally first.
2. SKR fee discount is cheap and genuinely useful. Build it in week 3 regardless
   of the organizer's answer.
3. AI recap (confirmed check-ins → shareable summary) only if the week-2
   checkpoint is green. AI never adjudicates whether a member told the truth.

Do not distort the product or claim integrations that don't exist. A judge who
opens the app and finds decorative AI scores worse than one who finds none.

## Known risks

**Reload recovery (highest technical risk).** Submitted-action handles are
process-local by design and cannot be restored after a reload. On Android, MWA
leaves the app to reach the wallet, so backgrounding mid-transaction is ordinary,
not exceptional. A user who takes a call while funding must not land in an
unrecoverable state. Scheduled week 3, but it is load-bearing for the demo — if
it slips, the video must avoid the path that triggers it, and that constraint
should be known in advance, not discovered during filming.

**Rubric uncertainty.** Unresolved for nine days. Mitigated by the hedge above.

**Device access.** The entire submission depends on the Seeker. Verify it is
charged, updated, and wallet-provisioned in week 1 — not week 3.

**Winner publication.** A winning app must be live in the dApp Store within 30
days of announcement. Not a submission blocker, but store-readiness is not
optional if we place.

## Definition of done

- [ ] Signed APK installs and runs on a real Seeker
- [ ] Full hero flow completes with two real wallets on devnet
- [ ] Demo video shows the complete loop with visible on-chain confirmation
- [ ] Public GitHub repo with accurate README
- [ ] Pitch deck
- [ ] Submitted at least 24 hours before close
