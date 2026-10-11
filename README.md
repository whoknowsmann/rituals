# Rituals

**Show up, or pay up.**

Rituals puts a stake on a weekly promise. Stamp the week to keep it. Miss it and that week's stake goes where you chose: a demo cause, or a wallet you pick. Rituals takes nothing.

A Solana Mobile app for the Seeker, built for CLOCK IN. It runs on Solana devnet with a valueless test token (tSKR) and has been run end to end on a Seeker (Android 16) with Seed Vault Wallet.

- Product page: https://rituals.whoknowsman.com
- Demo video: <video-url>
- APK: https://github.com/whoknowsmann/rituals/releases/tag/v0.1.0-clockin

## Try it in five minutes

1. Install the APK from the GitHub release: https://github.com/whoknowsmann/rituals/releases/tag/v0.1.0-clockin
2. In Seed Vault Wallet, go to Settings → Network → Devnet before you open Rituals.
3. Open Rituals and tap Connect, then Seed Vault Wallet. It shows the request as coming from Rituals at rituals.whoknowsman.com.
4. On Home, tap **Get test tokens**. The faucet sends 0.05 devnet SOL and 50 tSKR in one transaction it pays itself, so there is nothing to sign. It refuses a wallet that already holds at least 0.03 SOL and 10 tSKR. If it says it is empty, email <owner-email>. Then tap **Start one**.
5. "What will you do each week?" Type a name, such as Read. If you like, say what counts as showing up. Tap **Next**.
6. "Your stake": keep 2 weeks and Demo speed, tap 20, and pick where a missed week goes. Tap **Lock it in** and approve once: double-tap the side button and use your fingerprint. Approvals need to land within about 60 seconds. Seed Vault doesn't recognize the site yet, so tick "I trust this site" when you approve.
7. You land on the ritual screen. Week 1 opens 60 seconds after you tapped Lock it in. When it opens, type an optional note, hold **HOLD TO STAMP** for 1.4 seconds and approve. You have 60 seconds.
8. Leave week 2 alone and stay on the ritual screen. When its time runs out the screen turns to Finished with a MISSED stamp. Within about 20 seconds the app has closed the week, with no wallet prompt, and one line reads, for example, "10 of 20 tSKR back · 10 tSKR to City Animal Shelter (demo)". Tap a closed week on the punch card to open its receipt.

## How the money works

- **One stake, split across the weeks.** You pick 1 to 16 weeks and one total: type it, or tap 5, 10, 20 or 50 (default 20). The app splits it evenly at full token precision, so 20 over 6 weeks locks 19.999998 tSKR (6 × 3.333333). Every amount on screen rounds to 2 decimals: that ritual reads "3.33 tSKR a week", and with one kept week it finishes as "3.33 of 20 tSKR back · 16.67 tSKR to Northside Food Bank (demo)". Your wallet's approval sheet may show 20 or 19.999998.
- **Kept or missed.** A stamped week returns that week's stake and leaves a KEPT receipt. A missed week sends that week's stake to the destination you chose before you started: Northside Food Bank, City Animal Shelter or Public Library Fund (labelled "(demo)", not real charities: on devnet all three pay into the faucet's tSKR account, so a missed stake funds the next judge's test tokens), or a wallet you choose, which must already hold a tSKR account. The destination is locked when you create the ritual.
- **What it costs.** Rituals takes nothing: no share of stakes or forfeits and no activation fee (on-chain fee settings 0 / 0 / 0). You pay the chain: about 0.000005 SOL per stamp or settle, account rent of about 0.009 SOL per ritual (not refunded when a ritual finishes), and a settle-key pre-payment of 0.001 SOL plus 0.002 SOL per week. Creating a 2-week ritual costs about 0.014 SOL, and the 6-week ritual on the Seeker cost 0.0218 SOL. The faucet's 0.05 SOL covers any ritual.
- **Not a wager.** There is no chance, no counterparty, and no one gains from your miss. The closest relative is a forfeitable deposit, the StickK and Beeminder idea, on chain.

## How weeks run

- **Two speeds.** Demo speed (the default) makes a week a minute and a half. Week 1 opens 60 seconds after Lock it in, you get 60 seconds to stamp and 10 of grace, and the next week opens 20 seconds later. A 2-week ritual runs in about 4 minutes. The clock never pauses, and the app says so before Lock it in: "Demo weeks keep running while you’re away. Unstamped weeks are missed." Real weeks last 7 days: stamp any day in a 6-day window, with 23 hours of grace. Every week's times are written on chain at create and checked against the chain clock, so nobody can click through weeks.
- **Closing a week takes no wallet prompt.** Your first approval pre-pays a small key the app holds on the phone, the settle key. It only opens and settles weeks, which anyone may run, and the program sends the money only where the ritual already says. **Nothing runs while the app is closed**: there is no server and no background task. A missed week's money moves the next time you open the app. Home or the ritual screen shows the outcome at once, and the app closes every overdue week back to back, one transaction per week.
- **Home** shows one tile per ritual: a dot for each week (filled kept, ✕ missed, hollow upcoming) and "X of Y tSKR back". Finished rituals sit under a collapsed "Finished · N". Home shows only the connected wallet's rituals.
- **End early** (Settings → Your rituals): one approval returns everything you haven't missed ("Back to you"). A week that has just closed unstamped is shown as "Missed week, sent" and goes to your destination in the same transaction.
- **Skip** (Real weeks only): one per ritual. Tap Skip week N before that week opens and its stake comes back to you.
- **Reminders** run on the phone from the on-chain schedule, with no server. Real weeks get three a week (opens, one day left, last hour); Demo speed gets one when each week opens. Settings has a Remind me switch and a link to Android's notification settings, which list four channels (Week opens, One day left, Last hour, Demo weeks). Each ritual has its own on/off link.

## What's proven

- **On a Seeker, 2026-10-09.** A wallet with no tSKR took 50 from the faucet and created a 6-week demo ritual at 20 tSKR with one wallet approval; the create locked 19.999998. Five weeks were stamped and week 2 was left alone. Six settle transactions followed, one a minute, all signed by the app's settle key and none by the wallet: five returned 3.333333 each, and week 2's 3.333333 went to Northside Food Bank. The wallet ended at 46.666667 (50 − 19.999998 + 5 × 3.333333), read from the chain. On 2026-10-06 a missed week's 10 tSKR landed in the wallet the user had chosen (9.125 before, 19.125 after).
- **On devnet.** Scripted runs of the app's own create, stamp and settle code pass, including a 3.333333-a-week ritual on 2026-10-09 and End early in three variants on 2026-10-07.
- **Tests.** 2,930 TypeScript tests (169 files) and 224 native program tests (measured 2026-10-11). A bug hunt on 2026-10-08 fixed about 25 issues.
- **Reminders.** Real-week alarms were checked on the Seeker on 2026-10-06. Demo-week reminders, the Android channels and the Remind me switch are tested in code only.

## Known limits

- Devnet only. tSKR has no value. The faucet's float is finite and it can run dry; then the app shows a contact email.
- Seed Vault Wallet has to be on Devnet, and the app cannot read the wallet's network. If Seed Vault cancels a send, Rituals shows "Network mismatch?" with the path to Devnet (at most twice per phone).
- Nothing checks that you did the thing. You stamp your own weeks, and the stake is the check. A witness is built but hidden.
- On Demo speed a week you are away for is a missed week.
- The stamp note lives on the phone, not on chain.

## What's next

1. **Daily rituals.** Same mechanics, shorter windows. The program already takes any window length; Demo speed runs one-minute weeks.
2. **A home-screen widget.** Designed.
3. **Friends, a witness and Seasons.** Built but hidden, because they have rough edges. Friends (two to six people who stake and confirm each other) has a program on devnet and a built flow that needs a UI pass; a witness confirms without staking; Seasons are shared public rituals with honest counts.
4. **Real donation rails**, through The Giving Block.
5. **Mainnet stake options.** The program is mint-agnostic, so the stake asset is one config value. On mainnet the plan is to offer USDC, SOL and SKR, after legal and security review.

## Under the hood

| Item | Devnet address |
|---|---|
| Rituals program (Anchor) | `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` |
| ProtocolConfig | `7LMgBSJmEFKkfYKh2znr6VSxcm5QEHEouNijXDENhMd1` |
| tSKR mint | `AaHgFh7ussUDor8QfaBCaRz2RHiPNCs7i2yuzdLbt9tc` |
| Demo causes (all three): the faucet's tSKR account | `2JTKtgKaGE6DaGmsNGsRd8oipsw9UQB1Cdu6f9D25HtY` |
| Faucet hot wallet | `FDjXc5KeLbWf9UaMr3y6uUe5ZQDqJYctWuMW7CdnRK8q` |

The program was last upgraded on 2026-10-07 at slot 508611515, for End early.

- React Native with Expo, in TypeScript. The program is Anchor.
- Wallet connection uses Mobile Wallet Adapter pinned to Seed Vault Wallet, the wallet built into every Seeker. The app binds the wallet's signature to the exact bytes you reviewed; if a wallet rewrites the priority fee, it verifies the landed transaction instead.
- A lost wallet reply, or a cancel after signing, is treated as "may have gone through" and checked against the chain. In-flight actions are journaled, so a killed app recovers on restart.
- Account decoders are strict, and reads retry a bounded number of times on public-RPC 429s.
- Get test tokens calls our devnet faucet at faucet.whoknowsman.com (Vercel functions).

## Repository map

- `docs/PRODUCT.md`: what Rituals is, and why it is a commitment device and not gambling.
- `docs/ARCHITECTURE.md`: the mobile path and the on-chain boundary.
- `docs/SECURITY.md`: trust boundaries, wallet safety, and limits.
- `docs/DEVELOPMENT.md`: setup, quality gates and git workflow.
- `docs/STATUS.md`: where the project stands right now.
- `docs/submission/`: the fact sheet every number here traces to, plus the deck text, video script and store listing.
- `programs/`: the Anchor program. `src/`: the app. `scripts/`: devnet setup, smoke tests and build helpers.

License: MIT (see `LICENSE`).
