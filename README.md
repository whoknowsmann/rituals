# Rituals

**Show up, or pay up.**

Rituals puts a stake on a weekly promise. Stamp the week to keep it. Miss it and that week's stake goes where you chose: a demo cause, or a wallet you pick. Rituals takes nothing.

- Product page: https://rituals.whoknowsman.com
- Demo video: <video-url>

## How it works

The loop below has been run end to end on a Solana Seeker (Android 16) with Seed Vault Wallet. On one run, week 2 turned MISSED on the screen and 10 tSKR landed in the wallet the user had chosen (9.125 before, 19.125 after, read from the chain).

You start a ritual in two steps. First you type what it is; "to read" becomes "Read". Suggestions are optional and come from a fixed list on the device. Then you set the terms:

- **Weeks:** 1 to 16. The default is 2 on Demo speed and 4 on Real weeks.
- **Speed:** Demo speed (the default) or Real weeks.
- **Stake:** one total for the whole ritual. Type it, or tap 5, 10, 20 or 50. The app splits it evenly across the weeks at full token precision (20 over 6 weeks locks 19.999998 tSKR). Amounts on screen are rounded to 2 decimals.
- **Where a missed week goes:** Northside Food Bank (the default), City Animal Shelter, Public Library Fund, or a wallet you choose. The three causes are labelled "(demo)" in the app. They are devnet token accounts, not real charities. A wallet you choose must already hold a tSKR account. The app names it by its owner, for example "the wallet you chose · fT9Xe…LJgo1", never by its token account.

If your balance can't cover the stake, the button is blocked and **Get test tokens** appears. Tap **Lock it in** and approve once. That one approval creates the ritual, locks every week's stake in a vault, activates it, and pre-pays the app's settle key so later weeks can close without asking your wallet again. The app then takes you straight to the ritual screen.

The ritual screen counts down. Before a week opens it says "Week 1 opens in 32s". Once the week is open, a time-left line counts down by the button ("32s left"). Each week you press and hold **HOLD TO STAMP** for 1.4 seconds. The ring fills, the phone buzzes, and you approve once more. You can type a one-line note first; it stays on your phone. Then comes the confetti, a YOU SHOWED UP! stamp, and a line like "Couch: 0. You: 1."

Weeks close by themselves on the ritual screen. The settle key opens a missed week and settles every finished one, with no wallet prompt. A kept week returns your stake and gives you a KEPT receipt. A missed week sends that week's stake to the destination you chose and gets a MISSED stamp: "That's a week, not a verdict." You can watch it happen: on Demo speed, when the time runs out on a week you did not stamp, the ritual screen turns to MISSED. If you would rather use your wallet to settle, that button is still there.

Every closed week on the punch card opens its receipt. A KEPT receipt says "10 tSKR back to you" and shows your note. A MISSED receipt says "10 tSKR went to City Animal Shelter (demo)."

A missed demo week is sent only while that ritual's screen is open. Home does not settle weeks, and the app has no background settlement task. If you leave, the clock does not stop. The week still runs out, and leaving does not extend a stamp window or refund a miss.

Home is a grid of tiles, one colour per ritual, each with a punch card ("1 of 4 kept") and a status pill ("Stamp this week"). Each ritual gets one declared skip: call it before the week opens and that week's stake comes back to you. Night mode follows the phone, and there is a sun/moon toggle in the top bar.

On Real weeks the app also sends reminders. It schedules three for each week on the phone, from the on-chain schedule: when the week opens, with one day left, and in the last hour. Stamping clears them. No server is involved. On the Seeker, three alarms were scheduled and "Week 1 is open. Stamp it." arrived on time.

There are two speeds.

**Demo speed** is the default, so you can watch a whole ritual in a few minutes. Week 1 opens 60 seconds after you tap Lock it in. You get 45 seconds to stamp and 10 seconds of grace, and the next week opens 5 seconds later, so each week is one minute. The ritual screen says "Demo speed: a week here is 1 minute." A 2-week ritual runs start to finish in about 3 minutes, a 4-week one in about 5. The clock never pauses. Just before Lock it in, the app says: "Demo weeks keep running while you're away. Unstamped weeks are missed."

**Real weeks** open week 1 about a minute after you create. After that you can stamp on any day of a 6-day window, there are 23 hours of grace, and each week lasts 7 days. A finished week settles the next time you open that ritual, or when you use the wallet button. Reminders run on this speed only.

Every week's open time, deadline and resolution time is written on chain when you create the ritual. The program checks stamps and settlements against the chain clock, so nobody can click through weeks.

## What it costs

Rituals takes nothing. No share of stakes, no share of forfeits, no activation fee; the on-chain fee settings are 0 / 0 / 0.

You pay what the chain charges: network fees of about 0.000005 SOL per transaction, account rent (the vault's rent comes back when the ritual closes), and the settle-key pre-payment of 0.001 SOL plus 0.002 SOL per week, capped at 0.05 SOL. Creating a 4-week ritual costs roughly 0.01 to 0.02 SOL all in.

The stake itself is tSKR, a valueless devnet token with 6 decimals. On mainnet the plan is to offer USDC, SOL and SKR as stake options, after legal and security review. This is not a wager. There is no chance, no counterparty, and no one gains from your miss. The closest relative is a forfeitable deposit, the StickK and Beeminder idea, on chain.

## Try it

1. Install the APK from the GitHub release: <release-url>
2. In Seed Vault Wallet, go to Settings → Network → Devnet before you open Rituals.
3. Open Rituals and connect a wallet: Seed Vault Wallet or Phantom. Seed Vault Wallet shows the request as coming from Rituals at rituals.whoknowsman.com.
4. Start a ritual. On an empty Home tap **Start one**; otherwise tap **+ New ritual**. Type what you keep putting off and tap **Next**.
5. On step 2, tap **Get test tokens** if your wallet is short (it is also in Settings). The faucet sends 0.05 devnet SOL and 50 tSKR to your wallet in one transaction it pays itself; there is nothing to sign. It refuses a wallet that already holds at least 0.03 SOL and 10 tSKR. If it says it is empty, email <owner-email>.
6. Still on step 2, keep 2 weeks and Demo speed, tap 20, and choose where a missed week goes. Tap **Lock it in** and approve once: double-tap the side button and use your fingerprint. Approvals need to land within about 60 seconds. Seed Vault doesn't recognize the site yet, so tick "I trust this site" when you approve.
7. You land on the ritual screen. Week 1 opens 60 seconds after you tapped Lock it in. When it opens, type an optional note, then hold **HOLD TO STAMP** for 1.4 seconds and approve. You have 45 seconds.
8. Leave week 2 alone and stay on the ritual screen. When its time runs out the screen turns to MISSED with no wallet prompt, and that week's stake goes where you chose. Tap a closed week on the punch card to open its receipt.

### Known limits

- Devnet only. tSKR has no value.
- You need tSKR to try it. The in-app faucet hands out a small amount and refuses wallets that already hold enough. Its float is small (about 2 devnet SOL), and if it runs dry the app shows a contact email.
- Seed Vault Wallet has to be on Devnet. The app cannot detect the wallet's network setting.
- On Demo speed the clock never pauses. A week you are away for is a missed week, and its stake goes where you chose. A missed demo week is only sent while that ritual's screen is open.
- A wallet you choose as the destination must already hold a tSKR account.
- You stamp your own weeks. Nothing checks that you did the thing; the stake is the check. A witness is built but hidden.
- Reminders are for Real weeks only.
- The stamp note lives on the phone, not on chain.
- Some hidden features have rough edges. They are hidden for a reason.

## Under the hood

| Item | Devnet address |
|---|---|
| Rituals program (Anchor) | `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` |
| ProtocolConfig | `7LMgBSJmEFKkfYKh2znr6VSxcm5QEHEouNijXDENhMd1` |
| tSKR mint | `AaHgFh7ussUDor8QfaBCaRz2RHiPNCs7i2yuzdLbt9tc` |
| Demo cause: Northside Food Bank | `4adFBqT1x7AyBFF4bd8qVgeSjPbqhnaJVB4x5muMzbT5` |
| Demo cause: City Animal Shelter | `7axVhUouRPmMkUDELbSakXEAQitRMkZ1xLwXPaJCNkzQ` |
| Demo cause: Public Library Fund | `Bg6uNu6tzKUxUgNWB2tjiQU9K9zB8ycunECiP1MG3cZ5` |

The program was last upgraded on 2026-10-04 at slot 507505707.

- The app is React Native with Expo, in TypeScript. The program is Anchor.
- Wallet connection uses Mobile Wallet Adapter, with an explicit choice of wallet (Seed Vault Wallet or Phantom).
- Every prepared transaction carries compute-budget instructions.
- The app binds the wallet's signature to the exact bytes you reviewed. If a wallet rewrites the priority fee, the app verifies the landed transaction instead.
- In-flight actions are journaled, so an app that gets killed mid-flight recovers on restart.
- Account decoders are strict, and the app retries a bounded number of times on public-RPC 429s.
- The app's settle key is what lets weeks close with no wallet prompt.
- Reminders use expo-notifications and are scheduled on the phone from the on-chain schedule.
- Get test tokens calls our devnet faucet at faucet.whoknowsman.com (Vercel functions; source in whoknowsmann/rituals-faucet).
- Tests: 2,420 TypeScript tests and 206 native program tests. Three app-path devnet smokes (demo weeks, demo with a wallet fee rewrite, real weeks) were green on 2026-10-04, and the destination choice has since passed devnet smokes for a cause and for a wallet.

## What's next

Several things are built but hidden, and none of them is in the app today. Rituals with friends (two to six people who stake and confirm each other) has a program on devnet and a built flow that needs a UI pass. A witness who confirms without staking and Seasons of shared public rituals with honest counts are in the same state. After the hackathon come real donation rails through The Giving Block, and photo proof.

The program is mint-agnostic, so the stake asset is one config value. On mainnet the plan is to offer USDC, SOL and SKR as stake options, after legal and security review.

## Repository map

- `docs/PRODUCT.md`: what Rituals is, and why it is a commitment device and not gambling.
- `docs/ARCHITECTURE.md`: the mobile path and the on-chain boundary.
- `docs/SECURITY.md`: trust boundaries, wallet safety, and limits.
- `docs/DEVELOPMENT.md`: setup, quality gates and git workflow.
- `docs/STATUS.md`: where the project stands right now.
- `docs/submission/`: the fact sheet every number here traces to, plus the deck text, video script and store listing.
- `programs/`: the Anchor program.
- `src/`: the app.
- `scripts/`: devnet setup, smoke tests and build helpers.

## Built for CLOCK IN, the Solana Mobile hackathon

License: MIT (see `LICENSE`).
