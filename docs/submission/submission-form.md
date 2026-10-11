# Rituals: hackathon submission form (CLOCK IN)

Paste-ready. Anything in angle brackets is for the owner to fill in.
Every claim traces to docs/submission/FACTS.md.

## Project name

Rituals

## Tagline

Show up, or pay up.

## One-sentence description (max 140 characters)

A Solana Mobile app: put a stake on a weekly promise, stamp the week to keep it, and a missed week goes where you chose (devnet).

## Short description (max 500 characters)

Rituals is a commitment app for Solana Mobile. You name a ritual, pick 1 to 16 weeks, and put one stake behind it. Each week you hold a button to stamp it, with one wallet approval. Stamp the week and your stake comes back. Miss it and that week's stake goes where you chose: a demo cause, or a wallet you pick. Rituals takes nothing. It runs on Solana devnet with a valueless test token (tSKR). Demo speed makes a week one minute.

## Long description (about 250 words)

You know the thing you keep meaning to do. Rituals puts a stake on it.

You say what you will do each week, pick 1 to 16 weeks, and lock in one total stake, split evenly across the weeks. You also choose where a missed week goes: one of three demo causes, or a wallet you pick. One approval in your wallet creates the ritual and locks every week's stake in a vault.

Each week you press and hold HOLD TO STAMP for 1.4 seconds and approve once. You get confetti and a YOU SHOWED UP! stamp, and when the week closes your stake comes back with a KEPT receipt. If you let a week run out, the app's own settle key closes it with no wallet prompt. The stake goes where you chose, and the MISSED receipt says so.

Demo speed makes a week one minute long, so a 2-week ritual, one week kept and one missed, takes about three minutes. Real weeks last seven days and send reminders. Every week's times are on chain, so nobody can click through weeks. End early, in Settings, returns everything you haven't missed in one approval.

Rituals takes nothing: the on-chain fees are all 0, and there is no activation fee. Nobody gains from a miss. It is a forfeitable deposit on chain, not a wager.

This build runs on Solana devnet with a valueless test token, tSKR. Get test tokens in the app gives a wallet 0.05 devnet SOL and 50 tSKR.

## How it uses Solana Mobile, Seed Vault and Mobile Wallet Adapter

- The full loop has been run on a Solana Seeker (Android 16) with Seed Vault Wallet. The latest run, on 2026-10-09, is readable on chain: one wallet approval created a 6-week ritual, five stamps followed, and six settle transactions were signed by the app's settle key, none by the wallet.
- Mobile Wallet Adapter connects the app to the wallet. The app connects to Seed Vault Wallet, built into every Seeker.
- Every approval is Seed Vault Wallet's double-tap on the side button and a fingerprint. Starting a ritual takes one approval. Each stamp takes one more. An approval has to land within about 60 seconds.
- The app binds the wallet's signature to the exact bytes the user reviewed. If the wallet rewrites the priority fee, the app checks the landed transaction instead.
- A lost wallet reply, or a cancel after the signing sheet opened, is treated as "may have gone through" and checked against the chain. A create keeps one nonce, so a retry cannot make a second ritual.
- Seed Vault Wallet shows the request as coming from Rituals at rituals.whoknowsman.com.
- Closing weeks needs no wallet. The first approval pre-pays a small settle key that the app holds on the phone (0.001 SOL plus 0.002 SOL per week), and that key opens and settles weeks.
- Reminders are scheduled on the phone from the on-chain schedule, with Android notification channels. No server sends them.
- If the app is killed in the middle of an approval, a journal of in-flight actions lets it recover on restart.

## What is novel

- One approval starts a ritual and the app closes the weeks itself. The first approval creates the ritual, locks every week's stake in a vault and pre-pays the settle key. After that, a missed week settles with no signature.
- You choose where a miss goes, before you start: one of three demo causes, or a wallet that already holds a tSKR account. The choice is fixed when you lock the ritual in.
- The weeks are on chain. Every week's open time, deadline and resolution time is written when the ritual is created, and the program checks stamps and settlements against the chain clock.
- It is a commitment device, not a wager. There is no chance and no counterparty, and nobody gains from a miss. The closest relative is a forfeitable deposit (StickK, Beeminder), on chain.
- A judge can watch the whole thing. Demo speed makes a week one minute, so one kept week and one missed week take about three minutes.

## What's next

In this order: daily rituals (the same mechanics with shorter windows; the program already takes any window length), a home-screen widget (designed), then friends (two to six people who stake and confirm each other), a witness who confirms without staking, and Seasons of shared public rituals with honest counts, which are built and hidden because they have rough edges. Then real donation rails through The Giving Block. The program is mint-agnostic, so the stake asset is one config value. On mainnet the plan is to offer USDC, SOL and SKR as stake options, after legal and security review. We would like to publish Rituals on the Solana dApp Store.

## Built with

React Native, Expo, TypeScript, an Anchor program on Solana devnet, Mobile Wallet Adapter, Seed Vault Wallet, expo-notifications. 2,863 TypeScript tests and 224 native program tests.

## How to try it

1. Install the APK: <release-url>
2. In Seed Vault Wallet, go to Settings → Network → Devnet before you open Rituals.
3. Open Rituals, tap Connect, and on Home tap Get test tokens (0.05 devnet SOL and 50 tSKR, nothing to sign). If it says it is empty, email <owner-email>. Then tap Start one.
4. Type a name, tap Next, keep 2 weeks and Demo speed, tap 20, choose where a missed week goes, tap Lock it in, and approve once. Seed Vault doesn't recognize the site yet, so tick "I trust this site" when you approve.
5. Week 1 opens 60 seconds after you tap Lock it in. Hold HOLD TO STAMP for 1.4 seconds and approve. You have 45 seconds.
6. Stay on the ritual screen and leave week 2 alone. It turns MISSED by itself, and the stake goes where you chose.

## Anything else judges should know

- Devnet only. tSKR has no value, and no real money moves.
- Rituals takes no fee. Users still pay network fees (about 0.000005 SOL per stamp or settle), account rent (about 0.009 SOL per ritual, not refunded when a ritual finishes), and the settle-key pre-payment.
- Nothing runs while the app is closed: there is no server and no background task. A missed week's money moves the next time the app is opened.
- You stamp your own weeks. Nothing checks that you did the thing; the stake is the check.
- Friends, witness and Seasons are not in the app, and are not part of this submission.

## Links

- Repository: https://github.com/whoknowsmann/rituals
- Product page: https://rituals.whoknowsman.com
- Demo video: <video-url>
- APK (GitHub release): <release-url>
- Pitch deck (PDF): artifacts/deck/rituals-deck.pdf

## Team

Jack, solo builder (GitHub: whoknowsmann). X: <x-handle>
