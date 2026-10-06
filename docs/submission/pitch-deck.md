# Rituals: pitch deck content (CLOCK IN)

Eight slides. Every line traces to docs/submission/FACTS.md (updated 2026-10-06 for d27). Layout is the owner's; the words are here.

## Slide 1 — Title

**On the slide:**

Rituals
Show up, or pay up.
Put a stake on a weekly promise. Keep it and you get it back.

**Say:**
Rituals is a commitment app for Solana Seeker. You put a stake behind something you keep skipping. Stamp the week and the stake comes back. Miss it and that week's stake goes where you chose. Rituals takes nothing. Everything you see today runs on devnet with a valueless tSKR token, and I will say that again where it matters.

## Slide 2 — The problem

**On the slide:**

You said you would. You didn't.
A reminder costs nothing, so it gets ignored.
A stake you can lose does not.

**Say:**
Everyone has a thing they keep meaning to do: read, train, call someone. Reminders fail because ignoring one costs nothing. The old fix is the forfeitable deposit that StickK and Beeminder use: your own money, returned if you follow through, gone if you don't. Rituals is that idea on chain. You choose where a miss goes, and you choose it before you start.

## Slide 3 — The loop

**On the slide:**

Start. One approval. Lock it in.
You choose where a missed week goes.
Hold to stamp. YOU SHOWED UP!
Weeks close themselves. Receipts: KEPT, or "That's a week, not a verdict."

**Say:**
Starting takes two steps and one wallet approval. Name the ritual. Pick the weeks, 1 to 16. Put in one total stake; the app splits it across the weeks. Choose where a missed week goes: a demo cause, or a wallet you pick. That one approval creates the ritual and locks every week's stake in a vault. Stamping a week is one approval too: you hold the button for 1.4 seconds, then you get confetti and a YOU SHOWED UP! stamp. After that the weeks close without asking you again, and every closed week has a receipt. A miss gets a quiet stamp and the line you see here, not a red alarm.

## Slide 4 — Why it is a Seeker app

**On the slide:**

Seed Vault Wallet: double-tap, fingerprint.
A settle key, so you never sign bookkeeping.
Real weeks: reminders scheduled on the phone.
Weeks written on chain. Nobody clicks through.

**Say:**
Every approval is the Seed Vault Wallet's double-tap on the side button and a fingerprint, proven on a Seeker running Android 16. The wallet names the app: Rituals, at rituals.whoknowsman.com. At create, the app pre-pays its own settle key a small amount, 0.001 SOL plus 0.002 SOL per week, capped at 0.05, so later weeks close with no wallet prompt. On Real weeks, reminders are scheduled on the phone from the on-chain schedule: week opens, one day left, last hour. No server sends them. Each week's open time, deadline and resolution are written on chain when you create the ritual, and the program checks against the chain clock. There is a wallet button as a fallback.

## Slide 5 — Money is honest

**On the slide:**

Show up: your stake comes back.
Miss a week: that week's stake goes where you chose.
Rituals takes nothing. No fee, no share of a miss.
Devnet. tSKR token, no value.

**Say:**
The stake is yours, and you get it back when you keep the week. You type one total and the app splits it evenly across the weeks. Only a missed week's stake moves, and it goes where you chose before you started: one of three demo causes, or a wallet you pick. Fees on chain are set to 0, 0, 0, and since October 4 there is no activation fee. What you pay is network fees of about 0.000005 SOL per transaction, account rent that returns when the ritual closes, and the settle-key pre-payment. A four-week create comes to roughly 0.01 to 0.02 SOL all in. All of it is devnet, and tSKR has no value.

## Slide 6 — Proof

**On the slide:**

Proven on a Solana Seeker, Android 16, Seed Vault Wallet.
A missed week, on the phone: 10 tSKR landed in the chosen wallet.
Anchor program on devnet.
2,420 TypeScript tests. 206 native program tests.

**Say:**
The whole loop has been run on a Seeker with Seed Vault Wallet. On one run, week 2 turned MISSED on the screen and 10 tSKR landed in the wallet the user had chosen: 9.125 before, 19.125 after, read from the chain. The program is an Anchor program on devnet at 2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p, upgraded October 4. The app binds the wallet's signature to the exact bytes you reviewed, and in-flight actions are journaled so a killed app recovers after a restart. Three app-path smokes passed on October 4, and the destination choice has since passed devnet smokes for a cause and for a wallet. The test counts are 2,420 TypeScript tests and 206 native program tests.

## Slide 7 — Why it sticks

**On the slide:**

A reason to open the app every week.
Every closed week gets a receipt: KEPT, or MISSED.
Real weeks remind you: week opens, one day left, last hour.
Demo speed: a week is 1 minute. Real weeks: seven days.

**Say:**
A ritual runs for as many weeks as you set, up to 16, and each week has one job: stamp it. When a week closes there is a receipt: KEPT with your note and "10 tSKR back to you", or MISSED with where the stake went. On Real weeks the phone reminds you when a week opens, with one day left, and in the last hour. A reminder alone is easy to ignore, as slide 2 says. This one has a stake behind it. Demo speed exists so judges can watch a whole ritual in minutes; a week there is one minute. Real weeks are seven days, and they are the real product. We have no retention data to show and are not going to claim any. The idea is simple: a stake that comes back is a reason to return.

## Slide 8 — What's next, and the ask

**On the slide:**

Coming soon: with friends, a witness, Seasons, real donation rails, photo proof.
Mainnet stake options after review: USDC, SOL and SKR.
The ask: publish Rituals on the Solana dApp Store.

**Say:**
Code for three of these exists but is hidden, because it has rough edges: friends who stake and confirm each other, a witness who confirms without staking, and Seasons with honest public counts. After the hackathon come real donation rails through The Giving Block, and photo proof. Reminders already ship on Real weeks, so they are not on this list. The program is mint-agnostic, so the stake asset is one config value. On mainnet the plan is to offer USDC, SOL and SKR as stake options, after legal and security review. What we are asking for is a place on the Solana dApp Store.

---

## Q&A you should expect

**Is this gambling?**
No. There is no chance in it, no counterparty, and nobody gains from a miss. The outcome depends only on whether you stamped the week. The closest analogue is a forfeitable deposit, as StickK and Beeminder use, here on chain. Today it is also a valueless tSKR token on devnet.

**How do you make money?**
We don't. Rituals takes no share of stakes or forfeits, and since October 4 there is no activation fee; the on-chain fee settings are 0, 0, 0. Users pay only what the chain charges: network fees, account rent that comes back when the ritual closes, and the small settle-key pre-payment.

**Where does a missed stake go?**
Where the user chose before starting: Northside Food Bank, City Animal Shelter or Public Library Fund, or a wallet they pick. The three causes are labelled demo in the app. They are devnet token accounts, not real charities. Real donation rails come after the hackathon, through The Giving Block.

**Why devnet?**
Because a mainnet stablecoin stake needs a legal and security review we have not done. tSKR has no value, so a judge can try every path with nothing at risk. The program is mint-agnostic, so changing the stake asset is one config value.

**Who verifies the user did the thing?**
Nobody does yet, and we say so. In the solo version you stamp the week yourself, with a hold and an optional note that stays on your phone, not on chain. The stake is the check on yourself. A witness who confirms and friends who confirm each other are built but hidden for now, and photo proof is planned.

**What stops someone clicking through weeks?**
Every week's open time, deadline and resolution is written on chain when the ritual is created, and the program checks stamps and settlements against the chain clock. You can only stamp inside the week's stamp period. Nobody can skip ahead.

**What happens if the app is closed when a week ends?**
The clock does not stop. On Demo speed, a week you do not stamp is a missed week, and the app says so before you lock in. Nothing is sent until you open that ritual again: missed demo weeks are only sent while the ritual's screen is open, and the app has no background settlement task. Waiting does not extend a stamp window or refund a miss. When you open the ritual, the app's settle key closes every finished week with no wallet prompt; the wallet button is the fallback. In-flight actions are journaled, so an app killed mid-action recovers after a restart.

**Do the reminders need a server?**
No. On Real weeks the phone schedules them from the on-chain schedule: week opens, one day left, last hour. Stamping clears that week's alarms. On the Seeker, three alarms were scheduled and "Week 1 is open. Stamp it." arrived on time.

**How do judges get test tokens?**
In the app. On the create screen, when the wallet is short or empty, there is a Get test tokens button (also in Settings). Our devnet faucet sends 0.05 devnet SOL and 50 tSKR in one transaction it pays itself, so a wallet that holds nothing can start a ritual without signing anything first. It refuses a wallet that already holds enough. tSKR is a valueless devnet token. Seed Vault Wallet must be switched to Devnet first. The app cannot see the wallet's network setting, so nothing warns you; on Mainnet the wallet shows "Network mismatch".
