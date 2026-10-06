# Rituals — pitch deck content (CLOCK IN)

Eight slides. Every line traces to docs/submission/FACTS.md (verified 2026-10-04). Layout is the owner's; the words are here.

## Slide 1 — Title

**On the slide:**

Rituals
Show up, or pay up.
Put a stake on a weekly promise. Keep it and you get it back.

**Say:**
Rituals is a commitment app for Solana Seeker. You put a stake behind something you keep skipping. Stamp the week and the stake comes back. Miss it and that week's stake goes to a cause you chose. Rituals takes nothing. Everything you see today runs on devnet with a valueless TEST token, and I will say that again where it matters.

## Slide 2 — The problem

**On the slide:**

You said you would. You didn't.
A reminder costs nothing, so it gets ignored.
A stake you can lose does not.

**Say:**
Everyone has a thing they keep meaning to do: read, train, call someone. Reminders fail because ignoring one is free. The idea that works is old. StickK and Beeminder use a forfeitable deposit: your own money, returned if you follow through, gone if you don't. Rituals is that idea on chain, with the cause locked before you start.

## Slide 3 — The loop

**On the slide:**

Start. One approval. Lock it in.
Stamp. One hold. SHOWED UP.
Weeks close themselves.
Receipts: KEPT, or "That's a week, not a verdict."

**Say:**
Starting takes two steps and one wallet approval: name the ritual, pick weeks (1 to 16), a stake per week, and see the locked cause. That one approval creates the ritual and locks every week's stake in a vault. Stamping a week is one approval too, a 1.4-second hold, then confetti and a SHOWED UP stamp. After that the weeks settle without asking you again, and you get a receipt. A miss gets a quiet stamp and the line you see here, not a red alarm.

## Slide 4 — Why it is a Seeker app

**On the slide:**

Seed Vault Wallet: double-tap, fingerprint.
A settle key, so you never sign bookkeeping.
Weeks written on chain. Nobody clicks through.
Night mode that follows the phone.

**Say:**
Every approval is the Seed Vault Wallet's double-tap on the side button and a fingerprint, proven on a Seeker running Android 16. At create, the app pre-pays its own settle key a small amount, 0.001 SOL plus 0.002 SOL per week, capped at 0.05, so later weeks close with no wallet prompt. Each week's open time, deadline and resolution are written on chain when you create the ritual, and the program checks against the chain clock. There is a wallet button as a fallback.

## Slide 5 — Money is honest

**On the slide:**

Show up: your stake comes back.
Miss a week: that week's stake goes to the cause you chose.
Rituals takes nothing. No fee at all.
Devnet. TEST token, no value.

**Say:**
The stake is yours and you get it back when you keep the week. Only the missed week's stake moves, to a cause token account that is locked before you start. Fees on chain are set to 0, 0, 0, and since October 4 there is no activation fee. What you pay is network fees of about 0.000005 SOL per transaction, account rent that returns when the ritual closes, and the settle-key pre-payment. A four-week create comes to roughly 0.01 to 0.02 SOL all in. All of it is devnet, and TEST has no value.

## Slide 6 — Proof

**On the slide:**

Proven on a Solana Seeker, Android 16, Seed Vault Wallet.
Anchor program on devnet.
2,275 TypeScript tests. 206 native program tests.
Three devnet smokes, green: demo weeks, demo with wallet fee rewrite, real weeks.

**Say:**
The whole loop has been run on a Seeker with Seed Vault Wallet. The program is an Anchor program on devnet at 2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p, upgraded October 4. The app binds the wallet's signature to the exact bytes you reviewed, and in-flight actions are journaled so a killed app recovers after a restart. The three smokes drive the real app path against devnet and all passed on October 4.

## Slide 7 — Why it sticks

**On the slide:**

A reason to open the app every week.
The receipt is what you come back for.
Demo speed: a week is 2 minutes.
Real weeks: seven days.

**Say:**
A ritual runs for as many weeks as you set, up to 16, and each week has one job: stamp it. At the end of a week there is a receipt, KEPT with your note, or MISSED with where the stake went. Demo speed exists so judges can watch a whole ritual in minutes. Real weeks are the product for life. We have no retention data to show and are not going to claim any. The idea is simple: a stake that comes back is a reason to return.

## Slide 8 — What's next, and the ask

**On the slide:**

Coming soon: with friends, a witness, Seasons, real donation rails, photo proof, reminders.
The stake asset is one config value; a mainnet asset comes after review.
The ask: publish Rituals on the Solana dApp Store.

**Say:**
Code for these exists but is hidden, because it has rough edges: friends who stake and confirm each other, a witness who confirms without staking, Seasons with honest public counts, picking a person as the destination. Real donation rails come after the hackathon through The Giving Block. The program is mint-agnostic, so the stake asset on mainnet (a stablecoin, or SKR) is one config value, after legal and security review. What we are asking for is a place on the Solana dApp Store.

---

## Q&A you should expect

**Is this gambling?**
No. There is no chance in it, no counterparty, and nobody gains from a miss. The outcome depends only on whether you stamped the week. The closest analogue is a forfeitable deposit, as StickK and Beeminder use, here on chain. Today it is also a valueless TEST token on devnet.

**How do you make money?**
We don't. Rituals takes no share of stakes or forfeits, and since October 4 there is no activation fee; the on-chain fee settings are 0, 0, 0. Users pay only what the chain charges: network fees, account rent that comes back when the ritual closes, and the small settle-key pre-payment.

**Why devnet?**
Because a mainnet stablecoin stake needs a legal and security review we have not done. TEST has no value, so a judge can try every path with nothing at risk. The program is mint-agnostic, so changing the stake asset is one config value.

**Who verifies the user did the thing?**
Nobody does yet, and we say so. In the solo version you stamp the week yourself, with a hold and an optional note that stays on your phone, not on chain. The stake is the check on yourself. A witness who confirms, friends who confirm each other, and photo proof are built or planned but hidden for now.

**What stops someone clicking through weeks?**
Every week's open time, deadline and resolution is written on chain when the ritual is created, and the program checks stamps and settlements against the chain clock. You can only stamp inside the week's stamp period. Nobody can skip ahead.

**What happens if the app is closed when a week ends?**
Nothing moves until the ritual is opened again, on either speed. The week's outcome was fixed on chain when its deadline passed, so waiting changes nothing. When you open the ritual, the app's settle key closes every finished week with no wallet prompt; the wallet button is the fallback. In-flight actions are journaled, so an app killed mid-action recovers after a restart.

**How do judges get test tokens?**
In the app. On the create screen, when the wallet is short, there is a Get test tokens button (also in Settings). Our devnet faucet sends 0.05 devnet SOL and 50 TEST in one transaction it pays itself, so a wallet that holds nothing can start a ritual without signing anything first. It refuses a wallet that already holds enough. TEST is a valueless devnet token, and Seed Vault Wallet must be switched to Devnet, otherwise it shows "Network mismatch".
