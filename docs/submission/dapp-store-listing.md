# Rituals: Solana dApp Store listing and privacy text

Paste-ready. Anything in angle brackets is for the owner to fill in.
Every claim traces to docs/submission/FACTS.md.

## 1. Listing

App name: Rituals

Tagline: Show up, or pay up.

Short description (under 80 characters):

Put a stake on a weekly promise. Keep it and you get it back.

Long description:

Rituals is for the thing you keep meaning to do. Name a ritual, choose how many weeks (1 to 16), put in one stake for the whole thing, and pick where a missed week goes: one of three demo causes, or a wallet you choose. One approval in your wallet locks it in.

Each week, hold the big button until the ring fills and the week is stamped. Add a one-line note if you like; it stays on your phone. A YOU SHOWED UP! stamp lands, and when the week closes your stake comes back with a KEPT receipt. Miss the week and that week's stake goes where you chose, and the MISSED receipt says where. It's a week, not a verdict.

Weeks close by themselves. When you start, Rituals sets aside a small amount for the app's settle key, so later weeks finish without another wallet prompt. Stay on the ritual screen and you can watch a missed week turn MISSED. You get one declared skip per ritual: call it before the week opens and that week's stake comes back to you. On Real weeks, the phone also reminds you when a week opens, with one day left, and in the last hour.

Demo speed, the default, makes a week one minute long, so you can watch a whole ritual in a few minutes. Real weeks last seven days.

Rituals takes nothing. No fee, no share of stakes, no share of forfeits. This build runs on Solana devnet with a valueless tSKR token, so you can try the whole loop with nothing real at stake.

Show up, or pay up.

Icon: `<icon path>`
Website: https://rituals.whoknowsman.com
Source: github.com/whoknowsmann/rituals

## 2. Category and keywords

Category: Productivity (second choice: Lifestyle). Rituals is a forfeitable-deposit commitment tool, the same family as StickK and Beeminder, which are sold as productivity software.

Keywords: commitment, habits, accountability, weekly goals, stake, Solana

## 3. Screenshots

1. Home tiles: "Every ritual, one colour each."
2. Create step 1: "Name the thing you keep skipping."
3. Create step 2: "Weeks, one stake, and where a miss goes."
4. HOLD TO STAMP with the countdown: "Hold to stamp the week."
5. YOU SHOWED UP! stamp: "You showed up. Stamped."
6. KEPT receipt: "Kept. Stake back to you."
7. MISSED receipt: "Missed. It went where you chose."

## 4. What's new (first release)

First release of Rituals, built for the CLOCK IN hackathon.
Start a ritual in two steps with one wallet approval: the weeks, one total stake, and where a missed week goes. Hold to stamp each week. Every closed week has a KEPT or MISSED receipt.
Demo speed (1-minute weeks) and Real weeks (7 days, with reminders).
Runs on Solana devnet with a valueless tSKR token. Day and night themes included.

## 5. Privacy policy

Last updated: <date>

Rituals has no accounts and no analytics. Nothing about you is sent to us, with one exception: the Get test tokens button. When you tap it, the app sends your wallet's public address to our devnet faucet (faucet.whoknowsman.com), which sends test tokens to that address. The only other data that leaves your phone is the public blockchain transactions you approve.

What the app keeps on your phone
- The addresses of the rituals you have started, and the wallet you chose for missed weeks.
- Your stamp notes. The one-line note you can add when you stamp a week stays on the phone and is never written on chain.
- The app's settle key. It is a small key the app holds so it can close weeks for you; see the disclosures below.
- Your reminder settings and the alarms scheduled for them (Real weeks only).
- Your theme choice (day, night or follow the phone).
- A journal of actions in flight, so that if the app is killed mid-action it can recover on restart.

What goes on chain
Your ritual, its weeks, where missed weeks go, your stamps and the settlements are written to the Solana blockchain. That data is public and permanent. Anyone can read it.

What we never collect
Names, emails, phone numbers, location, contacts, advertising identifiers or usage analytics. No personal data leaves your phone except the public blockchain transactions described above and the Get test tokens request, which carries your wallet's public address.

Wallet
Rituals connects to your wallet through Mobile Wallet Adapter. Each approval happens inside your wallet app, which shows the request as coming from Rituals at rituals.whoknowsman.com. Rituals never sees your seed phrase or your private keys.

Network
The app talks to a public Solana devnet RPC endpoint to read chain state and submit the transactions you approve, and to our faucet when you tap Get test tokens. This build runs on devnet only, with a valueless tSKR token.

Deleting your data
Uninstall the app and everything stored on the phone is removed, including notes, the settle key, reminders and the journal. Any SOL still held by the settle key (typically a few thousandths of a SOL after a ritual finishes) is lost with it, so finish or settle your rituals first. Data already on chain is public and permanent and cannot be deleted by us or by you.

Contact: `<owner-email>`

## 6. Disclosures for review

Devnet only. This build runs on Solana devnet and stakes a valueless tSKR token. Nothing in it carries real-world value. The Seed Vault Wallet must be switched to Devnet, otherwise the wallet reports "Network mismatch". The app cannot see which network the wallet is set to.

A commitment device, not a wager. There is no chance in the outcome: a week is kept if you stamp it and missed if you don't. There is no counterparty, and no one gains from a miss. A missed week's stake goes to the destination the user chose before starting: one of three demo causes (labelled demo in the app, devnet token accounts, not real charities) or a wallet the user picks. Rituals takes no fee and no share of stakes or forfeits. The nearest comparison is a forfeitable deposit, as in StickK or Beeminder, recorded on chain.

The settle key. The app holds a settle key so weeks can close without a wallet prompt. The user pre-pays it inside their first approval (0.001 SOL plus 0.002 SOL per week, capped at 0.05 SOL). It only runs the open and settle steps, which anyone is allowed to run.

Approvals expire. A wallet approval must land within about a minute.

Timing. Demo speed (the default) makes a week one minute: week 1 opens 60 seconds after the user taps Lock it in, with 45 seconds to stamp and 10 seconds of grace, and the next week opens 5 seconds later. Demo weeks keep running while the user is away, and the app says so before Lock it in. A missed demo week is sent only while that ritual's screen is open. Real weeks last seven days; a finished real week settles the next time the user opens that ritual, or through the wallet fallback button. Week timings are written on chain at creation and checked against the chain clock, so weeks cannot be clicked through.

Wallet identity. The wallet shows the requester as Rituals at rituals.whoknowsman.com.

Known gaps. Stamps are self-reported: nothing checks that the user did the thing. The stamp note lives on the phone, not on chain. Testers get tSKR tokens in the app: the Get test tokens button (create screen or Settings) asks our devnet faucet for 0.05 devnet SOL and 50 tSKR, paid by the faucet; nothing to sign.

## 7. Age rating

Suggested: Everyone (or the store's lowest tier). The app has no user-generated content shared with others, no chat, no violence or mature themes, and no chance-based mechanics. It does involve wallet transactions, so answer the store's questionnaire on financial features honestly: devnet, valueless token, no real money.
