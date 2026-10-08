# Rituals: pitch deck content (CLOCK IN)

Six slides. Every line traces to docs/submission/FACTS.md (2026-10-08, d32+). Rebuilt from the Sonnet deck review (docs/overnight/2026-10-08-deck-review.md): real phone screenshots beside the words. `**Image:**` lines are rendered by scripts/deck/build.py; screenshots get swapped for the d33 recording-run captures.

## Slide 1 — Title

**Image:** artifacts/shots/d32-home.png

**On the slide:**

Rituals
Show up, or pay up.
Put a stake on a weekly promise. Keep it and you get it back.
Reminders get ignored. A stake you can lose doesn't.

**Say:** Rituals is a commitment app for Solana Seeker. You put a stake on a weekly promise, stamp the week to get it back, and a missed week goes where you chose.

## Slide 2 — How it works

**Image:** artifacts/shots/d29-step1.png, artifacts/shots/now-jack.png

**On the slide:**

Lock it in. Hold to stamp.
Name it. Pick weeks. Set a stake.
Choose where a miss goes.
One approval locks it in. One more for each stamp.
Demo speed: a week is 1 minute. Real weeks: seven days.

**Say:** Two short steps and one approval lock every week's stake in a vault. Each week you hold the button for a second and a half, approve once, and get YOU SHOWED UP!.

## Slide 3 — Money is honest

**Image:** artifacts/shots/d27-receipt-w1.png, artifacts/shots/d27-receipt-w2.png

**On the slide:**

One promise. Both outcomes.
Show up: your stake comes back.
Miss a week: that week's stake goes where you chose.
End early any time: what you haven't missed comes back.
Rituals takes nothing.

**Say:** Show up and your stake comes back. Miss and it goes to the cause or wallet you picked before you started. You can always end early and get back everything you haven't already missed. Rituals takes nothing either way.

## Slide 4 — Why it sticks

**Image:** artifacts/shots/d32-finished.png

**On the slide:**

A reason to open it every week.
One job a week: stamp it.
Home shows how much of your stake is back.
Every closed week leaves a receipt.
Real weeks remind you: opens, one day left, last hour.

**Say:** One job a week, a receipt for every week that closes, and reminders on real weeks. We have no retention data yet and claim none. A stake that comes back is a reason to return.

## Slide 5 — Built for Seeker

**Image:** artifacts/shots/d31-end-1.png

**On the slide:**

Built for the Seeker.
Seed Vault Wallet: double-tap, fingerprint.
One approval to start, one per stamp.
Week times are on chain. Nobody clicks through.
Your stake sits in a vault only the program can move.

**Say:** Every approval is Seed Vault Wallet's double-tap and fingerprint on a Seeker running Android 16. Each week's times are written on chain, a small capped settle key closes finished weeks, and the stake sits in a vault only the program controls.

## Slide 6 — The ask

**On the slide:**

Publish it on the Solana dApp Store.
Try it: install the APK, set Seed Vault to Devnet, tap Get test tokens.
Next: friends, a witness, real donation rails.
rituals.whoknowsman.com
github.com/whoknowsmann/rituals

**Say:** Friends, a witness and Seasons are built but hidden until they're polished. Donation rails come next, and mainnet stakes in USDC, SOL and SKR come after a legal and security review. We're asking for a place on the Solana dApp Store.

## Q&A you should expect

**Is this gambling?**
No. There is no chance in it, no counterparty, and nobody gains from a miss. The outcome depends only on whether you stamped the week. The closest analogue is a forfeitable deposit, as StickK and Beeminder use, here on chain. Today it is also a valueless tSKR token on devnet.

**How do you make money?**
We don't. Rituals takes no share of stakes or forfeits, and since October 4 there is no activation fee; the on-chain fee settings are 0, 0, 0. Users pay only what the chain charges: network fees, account rent, and the small settle-key pre-payment (0.001 SOL plus 0.002 per week, capped at 0.05).

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
In the app. A connected wallet with no tSKR sees Get test tokens as the main button on Home (also on the create screen when short, and in Settings). Our devnet faucet sends 0.05 devnet SOL and 50 tSKR in one transaction it pays itself, so a wallet that holds nothing can start a ritual without signing anything first. It refuses a wallet that already holds enough. tSKR is a valueless devnet token. Seed Vault Wallet must be switched to Devnet first. Seed Vault does not tell the app its network, so the app shows a one-time "Set Seed Vault to Devnet" popup before the first approval; on Mainnet the wallet itself shows "Network mismatch".

**Can I get my money out early?**
Yes. Settings, Your rituals, End early. You see exactly what comes back before you sign, type the ritual's name, and approve once. Everything you have not already missed comes back to your wallet in that same transaction, and the ritual ends. A week whose stamp window already closed unstamped goes where you chose, as it would have anyway. Proven on devnet three ways (stamped week, settled week, missed week).

**What can the settle key do?**
Only the open and settle steps, which anyone is allowed to run. It is funded with a small capped amount of SOL inside your first approval so finished weeks close without asking your wallet. It cannot move your stake anywhere the program does not already send it.
