# Rituals: pitch deck content (CLOCK IN)

Seven slides, one idea each. Every line traces to docs/submission/FACTS.md (2026-10-08, d33). `**Image:**` lines are rendered by scripts/deck/build.py; screenshots are swapped for the d33 recording-run captures and a clean demo Home.

## Slide 1 — Title

**Image:** artifacts/shots/d27-receipt-w1.png

**On the slide:**

Rituals
Show up, or pay up.
A weekly promise with your money on it.

**Say:** Rituals is a commitment app for Solana Seeker. You put money on a weekly promise. Keep it and the money comes back.

## Slide 2 — Start

**Image:** artifacts/shots/d29-step1.png, artifacts/shots/d27-step2.png

**On the slide:**

Put money on it.
Name the ritual. Say what counts.
Pick the weeks and one total stake.
Pick where a missed week goes.
One approval locks it in.

**Say:** Two short steps. The stake is split across the weeks, and the destination for a missed week is chosen up front, before any money moves.

## Slide 3 — Every week

**Image:** artifacts/shots/now-jack.png

**On the slide:**

Hold to stamp.
One hold, one approval: double-tap and fingerprint in Seed Vault.
Week times are written on chain. Nobody clicks ahead.
Demo weeks last a minute, so the whole loop fits in five.

**Say:** Each week you hold the button and approve once. The program checks every stamp against the chain clock, and demo speed lets anyone see the full loop in a few minutes.

## Slide 4 — Outcomes

**Image:** artifacts/shots/d27-receipt-w1.png, artifacts/shots/d27-receipt-w2.png

**On the slide:**

Keep it, it comes back.
Miss it, it goes where you chose.
Every week ends in a receipt.
Rituals takes nothing.

**Say:** A kept week returns that week's stake. A missed week sends it to the cause or wallet picked at the start. No fees, no house, nobody profits from a miss.

## Slide 5 — Why it sticks

**Image:** artifacts/shots/d32-home.png

**On the slide:**

One job a week.
Home counts your stake coming back.
A reminder when the week opens, and before it closes.
You choose which reminders you get.

**Say:** Opening the app has a point every week: stamp, watch the money come back, read the receipt. Reminders run on the phone, and every kind can be turned off in Android settings.

## Slide 6 — Your money

**Image:** artifacts/shots/d31-end-1.png

**On the slide:**

Never trapped.
The stake sits in a vault only the program can move.
End early any time: what you haven't missed comes back.

**Say:** The stake lives in a vault that belongs to the ritual, not to us. Life changes, so ending early is always possible, and everything not already missed comes back in one approval.

## Slide 7 — Try it

**On the slide:**

Try it in five minutes.
Install the APK. Set Seed Vault to Devnet.
Tap Get test tokens, then Start one.
Next: friends, a witness, real donation rails.
rituals.whoknowsman.com · github.com/whoknowsmann/rituals

**Say:** It runs on devnet with a test token, and the app hands out tokens itself. Next come friends and a witness, then real donation rails and mainnet stakes after review. We'd like a place on the Solana dApp Store.

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
