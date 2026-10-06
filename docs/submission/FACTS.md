# Rituals — submission fact sheet (verified 2026-10-04 evening)

Every sentence in the README, video script, deck and store listing must trace
to a line here. If a claim is not here, it is not made. Measured, not inherited.

## One line

Rituals: put a stake on a weekly promise. Stamp the week to keep it. Miss it and
that week's stake goes to a cause you chose. Rituals takes nothing.

Tagline (pinned by test, never reword): **Show up, or pay up.**

## The loop (all proven on a Solana Seeker, Android 16, with Seed Vault Wallet)

1. **Start a ritual — 2 steps, 1 wallet approval.**
   - Step 1: what's your ritual (typed text becomes the name: "to read" → "Read";
     suggestions optional, deterministic, on-device — **never call them AI**).
   - Step 2: how many weeks (− / +, 1–16), **Demo speed · Real weeks** (Demo is
     the default), ONE total stake (type it or 5 / 10 / 20 / 50; the app splits
     it evenly across the weeks, rounded down to 0.01 tSKR a week, and says so
     when that locks a little less), a single schedule summary, and **where
     missed weeks go, chosen by the user**: Northside Food Bank (demo, default),
     City Animal Shelter (demo), Public Library Fund (demo), or a wallet you
     choose (it must already hold a tSKR account). Balance and
     Get test tokens appear only when short or empty; the button blocks if the
     stake won't fit. No signed summary card.
   - The single approval creates the ritual, locks every week's stake in a vault,
     activates it, and pre-pays the app's settle key (0.001 + 0.002 SOL per week,
     capped 0.05) so later weeks close with no wallet prompt.
   - Button: **Lock it in** → **Locked in.**
2. **Stamp a week — 1 approval.** A big centred HOLD (1.4 s fill, ring, buzz).
   Optional one-line note, kept on the phone only. Then confetti, a YOU SHOWED UP!
   stamp and a line from the sayings basket ("Couch: 0. You: 1.", "Future you
   says thanks.", …).
3. **Weeks close by themselves.** The settle key opens a missed week and settles
   every finished week. Kept → stake back, KEPT receipt (with the note).
   Missed → that week's stake to the cause, MISSED stamp ("That's a week, not a
   verdict."). A wallet button stays as a fallback.
4. **Home**: two-column tiles, a colour per ritual, punch card ("1 of 4 kept"),
   status pill ("Stamp this week"), "+ New ritual".
5. **One declared skip per ritual**: call it before the week opens and that
   week's stake comes back to you.
6. **Night mode** follows the phone; sun/moon toggle in the top bar.
7. Empty Home says "Start a ritual?" with one button. Each remembered ritual
   gets its own tile colour. A finished ritual (or one made by another wallet)
   can be removed from the phone; the chain is untouched.
8. Only an explicit authorize account chain list excluding Devnet triggers the
   network popup and blocks sending. Absent/empty chains fail open; cancellation
   and timeout get a quiet inline line, not a popup. Device proof of Seed Vault's
   `accounts[].chains` is still pending; each authorize logs the selected list.

## Speeds

- **Demo speed** (default; the app says "Demo speed: a week here is 1
  minute." on the ritual screen): week 1 opens 45 s after create, 45-second
  stamp window, 10 s grace, next week 5 s later: 1-minute weeks; a 4-week
  ritual runs start to finish in under 5 minutes (fe56eb5, 2026-10-06).
- **Real weeks**: week 1 opens 45 s after create, stamp any day in a 6-day
  window, 23 h grace, 7-day weeks. A finished week settles the next time you
  open the app (or via the wallet fallback). Say this plainly.
- Every week's opens / deadline / resolution is written on chain at create; the
  program checks stamps and settlements against the chain clock. Nobody can
  click through weeks.

## Money (devnet, valueless tSKR token, 6 decimals)

- Stake is tSKR. Kept week → your stake back. Missed week → that week's stake to
  the destination the user chose (a demo cause or a wallet), locked before you start. **Rituals takes nothing**:
  no share of stakes or forfeits, and since 2026-10-04 **no activation fee**
  (on-chain fee settings 0 / 0 / 0).
- What the user pays: network fees (~0.000005 SOL per transaction), account
  rent (vault rent returns when the ritual closes), and the settle-key
  pre-payment above. Create all-in ≈ 0.01–0.02 SOL for a 4-week ritual.
- Demo wallet: **Seed Vault Wallet** (approve = double-tap the side button +
  fingerprint). Phantom is also offered. Approvals must land within ~60 s.
- Not a wager: no chance, no counterparty, nobody profits from a miss. The
  closest analogue is a forfeitable deposit (StickK / Beeminder, on chain).

## Words

Use: your stake, show up, keep your word, get it back, stamp, ritual, week,
cause. Never: win, beat, versus, rival, pot, jackpot, payout, odds, luck,
"profit from", AI, SKR, mainnet (we are devnet only), "live" for anything
hidden.

## What is hidden (code kept; "coming soon" in the deck / README only)

With friends (2–6 stake and confirm each other; program live on devnet, flow
built, needs a UI pass) · a witness who confirms without staking · Seasons
(shared public rituals with honest counts) · pick a person as the destination ·
real donation rails (The Giving Block, post-hackathon) · photo proof, reminders
· SKR as the stake asset on mainnet (the program is mint-agnostic: one config
value) · mainnet stablecoin after legal and security review.

## Tech (true today)

- Anchor program on **devnet**: `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p`
  (upgraded 2026-10-04, slot 507505707). ProtocolConfig
  `7LMgBSJmEFKkfYKh2znr6VSxcm5QEHEouNijXDENhMd1`. tSKR mint
  `AaHgFh7ussUDor8QfaBCaRz2RHiPNCs7i2yuzdLbt9tc`. Demo cause token account
  `4adFBqT1x7AyBFF4bd8qVgeSjPbqhnaJVB4x5muMzbT5`.
- App: React Native / Expo, TypeScript. Mobile Wallet Adapter with an explicit
  wallet choice (Seed Vault Wallet, Phantom). Every prepared transaction carries
  compute-budget instructions; the app binds the wallet's signature to the
  exact reviewed bytes and, when a wallet rewrites the priority fee, verifies
  the landed transaction instead. In-flight actions are journaled so a killed
  app recovers after a restart. Strict account decoders; bounded retry on
  public-RPC 429s.
- Tests: 2,275 TypeScript tests / 126 files; 206 native program tests; three
  app-path devnet smokes (demo weeks, demo with wallet fee rewrite, real weeks)
  green on 2026-10-04.
- Repo: github.com/whoknowsmann/rituals (private until Wed Oct 7 ~02:00 CDT,
  then public). License: Jack decides (MIT suggested).

## Honest gaps (say them, don't hide them)

- Devnet only; tSKR has no value. Seed Vault Wallet must be switched to Devnet
  (otherwise "Network mismatch").
- A judge gets tSKR in the app: **Get test tokens** (on the create screen when
  the wallet is short or empty, and in Settings) asks the project's devnet
  faucet (faucet.whoknowsman.com, Vercel functions, repo whoknowsmann/rituals-faucet)
  to send **0.05 devnet SOL + 50 tSKR in one transaction the faucet pays**; the
  wallet signs nothing and may hold nothing. Limits: refused once a wallet holds
  ≥ 0.03 SOL and ≥ 10 tSKR; a small float (~2 devnet SOL) is the ceiling; if it is
  empty the app shows the contact email. Never blocks creating a ritual.
- The wallet shows the requester as "github.com" until the app identity moves
  to its own https origin.
- The stamp note lives on the phone, not on chain.
- Hidden features have rough edges; they are hidden for a reason.

## Hackathon

CLOCK IN — the Solana Mobile Hackathon with RadiantsDAO. Submissions close
Oct 8, 2026 (we submit **Wed Oct 7, 8 pm CDT**). Required: a functional Android
APK, the GitHub repository, a demo video, a pitch deck. Judged on: stickiness
and product-market fit · user experience · innovation · presentation and demo.
Winners publish on the Solana dApp Store. (SKR integration is optional and a
separate prize; we are not entering it.)

Judges: Anatoly Yakovenko, Mert Mumtaz, Chase Barker, Akshay Rajan, Beeman,
Voynich and A2nkF (EthelSec).
