# Rituals: pitch deck content (CLOCK IN)

Eight slides, one idea each. Every claim traces to docs/submission/FACTS.md (2026-10-12, d51). `**Image:**` lines are read by scripts/deck/build.py, which stops if an image is missing, so add a new capture before renaming one. Screenshots: slides 1 to 4 from the 2026-10-12 recording run (d51), slide 5 Home from d32, slide 6 End early from d31 (screens unchanged since).

## Slide 1 — Title

**Image:** artifacts/shots/take-receipt-1.png

**On the slide:**

Rituals
Show up, or pay up.
Put a stake on a weekly promise.

**Say:** Welcome to Rituals. Show up, or pay up. It's a Solana Mobile app for the Seeker where you put a stake on a weekly promise. React Native and Expo on the phone, an Anchor program on devnet.

## Slide 2 — Why

**On the slide:**

Put your money where your mouth is.
You know what you should do each week. Following through is the hard part.
Rituals lets you stake money against your promises.
Keep your word, keep your money. Miss it, and your stake goes to the cause you chose.

**Say:** You know what you should do each week. Following through is the hard part. So this time, put your money where your mouth is. Rituals lets you stake money against your promises: keep your word, keep your money; miss it, and your stake goes to the cause you chose. Nobody else gains from a miss, so there's nothing to game. Just a real reason to show up.

## Slide 3 — Start

**Image:** artifacts/shots/deck-step1.png, artifacts/shots/take-step2.png

**On the slide:**

One approval starts it.
Name it. You decide what counts.
1 to 16 weeks, one stake, even split.
Pick where a missed week goes.

**Say:** Two steps. Step one, I name it and decide what counts. Step two: how many weeks, how many tokens, and where the stake goes if I miss a week. That's a demo cause, or any wallet I choose. One approval creates it, stakes it and activates it.

## Slide 4 — Every week

**Image:** artifacts/shots/take-w1.png

**On the slide:**

Hold to stamp.
One hold, one approval. Double-tap, fingerprint.
Honor system, for now. You stamp your own week.
Week times are on chain. Nobody can click ahead.
Demo weeks are 90 seconds. Real weeks are 7 days.

**Say:** Now I hold, and the ring fills up. One approval. It's the honor system for now: nothing checks that I went outside. A witness and friends who confirm are built but hidden. What the chain does check is time: every week's open, deadline and resolution are written on chain when I create it, so nobody can click ahead. Demo weeks are 90 seconds, real weeks 7 days.

## Slide 5 — Outcomes

**Image:** artifacts/shots/take-receipt-1.png, artifacts/shots/take-receipt-2.png

**On the slide:**

Same promise, two outcomes.
KEPT: that week's share comes back.
MISSED: it goes where you chose.
Every receipt links to Solana Explorer.
Rituals takes nothing.

**Say:** Side by side. KEPT: that week's share comes back to me, with my note. MISSED: it goes where I said at the start. Same promise, two outcomes. Rituals takes no fee and no share.

## Slide 6 — Every week has a point

**Image:** artifacts/shots/d32-home.png

**On the slide:**

Weeks get away from you.
Real-week reminders: week opens, one day left, last hour.
While the app is open, weeks close by themselves.
No wallet prompt.
Home shows a dot per week and what's come back.

**Say:** My weeks get away from me: toddler this and that, snack, bath, twelve books for bedtime. So the phone nudges me. Real weeks get three reminders, demo speed one, and they're phone-local, no server. If I still don't stamp, the week closes by itself while the app is open. Its own settle key signs it, so no wallet prompt.

## Slide 7 — Your stake

**Image:** artifacts/shots/d31-end-1.png

**On the slide:**

Plans change. End early.
One approval returns everything not already missed.
The screen shows Back to you before you sign.

**Say:** Plans change, so there's a way out. End early shows what comes back before I sign, and one approval returns everything not already missed.

## Slide 8 — Try it

**On the slide:**

Show up, or pay up.
Install the APK. Set Seed Vault Wallet to Devnet.
Tap Get test tokens. Nothing to sign.
Next: a journal of your weeks, hands-free stamps, daily rituals, a home-screen widget.
Then rituals with friends, a witness who confirms, app-wide Seasons, and real donation rails.
rituals.whoknowsman.com · github.com/whoknowsmann/rituals

**Say:** Install the APK and set Seed Vault Wallet to Devnet. It warns that it doesn't recognize this domain, because the APK is sideloaded. Fresh wallet, nothing in it? Tap Get test tokens: 50 tSKR and a little devnet SOL, nothing to sign. Then start one. Next, in order: a journal of every week's stamps and notes on one page; hands-free stamps (authorize once at create, then HOLD is the only step); daily rituals; a widget; friends, a witness and Seasons; real donation rails. On mainnet the plan is USDC, SOL and SKR stakes, after legal and security review. That's it. All devnet, all test tokens, and Rituals takes nothing. I'd like Rituals on the Solana dApp Store. Show up, or pay up.

## Q&A you should expect

**Is this gambling?**
No. It's a forfeitable deposit, like StickK, on chain. No chance, no counterparty, nobody gains from a miss: the outcome depends only on whether you stamped. And on devnet it's a valueless tSKR token anyway.

**How do you make money?**
Rituals takes nothing: no fee, no share of stakes or forfeits (on-chain fee config 0/0/0). You pay devnet network fees, account rent and a small settle-key pre-payment (0.033 SOL at most).

**Where does a missed stake go?**
Where you chose before starting: Northside Food Bank, City Animal Shelter or Public Library Fund, or any wallet. The three causes are labelled demo and aren't real charities. On devnet all three pay into the faucet's wallet, so a missed stake becomes the next judge's test tokens. Real donation rails come later, through The Giving Block.

**Why devnet?**
A stake with real value needs a legal and security review that hasn't happened. tSKR is valueless, so a judge can try every path with nothing at risk. The program is mint-agnostic: changing the stake asset is one config value.

**Who verifies the user did the thing?**
Nobody yet. It's the honor system: you stamp your own week with a hold and an optional note, which stays on the phone, not on chain. The stake is the check on yourself. A witness and friends who confirm are built but hidden.

**What stops someone clicking through weeks?**
Every week's open, deadline and resolution time is written on chain at creation, and the program checks stamps and settlements against the chain clock. You can only stamp inside that week's stamp period.

**What happens if the app is closed when a week ends?**
The clock doesn't stop. Nothing runs while the app is closed (no server, no background task), so a missed week's money moves the next time you open it. The app's settle key then closes every overdue week, one transaction each, no wallet prompt. Waiting doesn't extend a stamp period or refund a miss.

**Do the reminders need a server?**
No. The phone schedules them from the on-chain schedule: three on Real weeks (it opens, one day left, last hour), one on Demo speed (it opens). Stamping clears that week's alarms. Delivery is best effort. On the Seeker on 2026-10-06, Real-week alarms were scheduled, delivered and cleared by the stamp.

**How do judges get test tokens?**
In the app. With under 20 tSKR, Get test tokens is the main button on Home (also on the create screen and in Settings). The faucet sends 50 tSKR and 0.05 devnet SOL in one transaction it pays for itself, so there's nothing to sign. It refuses a wallet that already holds at least 0.03 SOL and 10 tSKR. Set Seed Vault Wallet to Devnet first: the app can't see the wallet's network, and on the wrong one the wallet itself shows "Network mismatch".

**Can I get my money out early?**
Yes. Settings, Your rituals, End early. The screen shows "Back to you" before you sign; you type the ritual's name and approve once. Everything not already missed comes back in that transaction. A week that already closed unstamped still goes where you chose. Three devnet runs: plain, after a settled week, after a missed week.

**Why does 20 tSKR over 6 weeks say 3.33 a week?**
The chain locks 3.333333 a week, 19.999998 in all. Screens round to two decimals.

**What can the settle key do?**
Only the open and settle steps, which anyone may run. It's funded inside the approval that creates the ritual (0.001 SOL plus 0.002 SOL a week, 0.033 SOL at most) so finished weeks close without asking your wallet. It can't send your stake anywhere the ritual doesn't already say.
