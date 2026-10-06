# Rituals

**Show up, or pay up.**

Rituals puts a stake on a weekly promise. Stamp the week to keep it. Miss it and that week's stake goes to a cause you chose. Rituals takes nothing.

Demo video: <video-url>

## How it works

Everything below has been run end to end on a Solana Seeker (Android 16) with Seed Vault Wallet.

You start a ritual in two steps. First you type what it is; "to read" becomes "Read". Suggestions are optional and come from a fixed list on the device. Then you pick how many weeks (1 to 16), a speed, a stake per week (type it, or tap 1, 5, 10 or 25), and you see your wallet's TEST balance. If the stake won't fit, the button is blocked. The cause is already locked, and the card carries your ritual's name. Tap **Lock it in** and approve once. That one approval creates the ritual, locks every week's stake in a vault, activates it, and pre-pays the app's settle key so later weeks can close without asking your wallet again.

Each week you hold a big button for 1.4 seconds. The ring fills, the phone buzzes, and you approve once more. You can add a one-line note, which stays on your phone. Then comes the confetti, a SHOWED UP stamp, and a line like "Couch: 0. You: 1."

Weeks close by themselves. The settle key opens a missed week and settles every finished one. A kept week returns your stake and gives you a KEPT receipt with your note. A missed week sends that week's stake to the cause and gets a MISSED stamp: "That's a week, not a verdict." If you'd rather use your wallet to settle, that button is still there.

Home is a grid of tiles, one colour per ritual, each with a punch card ("1 of 4 kept") and a status pill ("Stamp this week"). Each ritual gets one declared skip: call it before the week opens and that week's stake comes back to you. Night mode follows the phone, and there is a sun/moon toggle in the top bar.

There are two speeds.

**Demo speed** is the default. The ritual screen says "Demo speed: a week here is 2 minutes." Week 1 opens about 90 seconds after you create, you get a 90-second stamp window and 20 seconds of grace, and the next week opens 10 seconds later.

**Real weeks** also open week 1 about 90 seconds after create, then give you any day in a 6-day window to stamp, 23 hours of grace, and 7-day weeks. A finished week settles the next time you open the app, or when you use the wallet button.

Every week's open time, deadline and resolution time is written on chain when you create the ritual. The program checks stamps and settlements against the chain clock, so nobody can click through weeks.

## What it costs

Rituals takes nothing. No share of stakes, no share of forfeits, no activation fee; the on-chain fee settings are 0 / 0 / 0.

You pay what the chain charges: network fees of about 0.000005 SOL per transaction, account rent (the vault's rent comes back when the ritual closes), and the settle-key pre-payment of 0.001 SOL plus 0.002 SOL per week, capped at 0.05 SOL. Creating a 4-week ritual costs roughly 0.01 to 0.02 SOL all in.

The stake itself is TEST, a valueless devnet token with 6 decimals. This is not a wager. There is no chance, no counterparty, and no one gains from your miss. The closest relative is a forfeitable deposit, the StickK and Beeminder idea, on chain.

## Try it

1. Install the APK from the GitHub release: <release-url>
2. In Seed Vault Wallet, switch the network to Devnet. Otherwise the app shows "Network mismatch".
3. Open **+ New ritual**, go to step 2 and tap **Get test tokens** (it is also in Settings). The faucet sends 0.05 devnet SOL and 50 TEST to your wallet in one transaction it pays itself; nothing to sign. If it says it is empty, email <owner-email>.
4. Create a ritual on Demo speed. Approve once (double-tap the side button and use your fingerprint). Approvals need to land within about 60 seconds.
5. Wait about 90 seconds for week 1 to open, then hold to stamp it.
6. Leave a later week alone and watch the settle key close it without a prompt.

### Known limits

- Devnet only. TEST has no value.
- You need TEST to try it; the in-app faucet (step 3) hands out a small amount and refuses wallets that already hold enough.
- The wallet shows the requester as "github.com" until the app's identity moves to its own https origin.
- The stamp note lives on the phone, not on chain.
- Some hidden features have rough edges. They are hidden for a reason.

## Under the hood

| Item | Devnet address |
|---|---|
| Rituals program (Anchor) | `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` |
| ProtocolConfig | `7LMgBSJmEFKkfYKh2znr6VSxcm5QEHEouNijXDENhMd1` |
| TEST mint | `AaHgFh7ussUDor8QfaBCaRz2RHiPNCs7i2yuzdLbt9tc` |
| Demo cause token account | `4adFBqT1x7AyBFF4bd8qVgeSjPbqhnaJVB4x5muMzbT5` |

The program was last upgraded on 2026-10-04 at slot 507505707.

- The app is React Native with Expo, in TypeScript. The program is Anchor.
- Wallet connection uses Mobile Wallet Adapter, with an explicit choice of wallet (Seed Vault Wallet or Phantom).
- Every prepared transaction carries compute-budget instructions.
- The app binds the wallet's signature to the exact bytes you reviewed. If a wallet rewrites the priority fee, the app verifies the landed transaction instead.
- In-flight actions are journaled, so an app that gets killed mid-flight recovers on restart.
- Account decoders are strict, and the app retries a bounded number of times on public-RPC 429s.
- The app's settle key is what lets weeks close with no wallet prompt.
- Tests: 2,275 TypeScript tests across 126 files, 206 native program tests, and three app-path devnet smokes (demo weeks, demo with a wallet fee rewrite, real weeks), all green on 2026-10-04.

## What's next

Several things are built but hidden, and none of them is in the app today. Rituals with friends (two to six people who stake and confirm each other) has a program on devnet and a finished flow that needs a UI pass. A witness who confirms without staking, Seasons of shared public rituals with honest counts, and picking a person as the destination are all in the same state. After the hackathon come real donation rails through The Giving Block, photo proof and reminders. A stablecoin stake follows only after legal and security review.

## Repository map

- `docs/PRODUCT.md`: what Rituals is, and why it is a commitment device and not gambling.
- `docs/ARCHITECTURE.md`: the mobile path and the on-chain boundary.
- `docs/SECURITY.md`: trust boundaries, wallet safety, and limits.
- `docs/DEVELOPMENT.md`: setup, quality gates and git workflow.
- `docs/STATUS.md`: where the project stands right now.
- `programs/`: the Anchor program.
- `src/`: the app.
- `scripts/`: devnet setup, smoke tests and build helpers.

## Built for CLOCK IN, the Solana Mobile hackathon

License: MIT (see `LICENSE`).
