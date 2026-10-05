# Rituals: Solana dApp Store listing and privacy text

Paste-ready. Anything in angle brackets is for the owner to fill in.
Every claim traces to docs/submission/FACTS.md.

## 1. Listing

App name: Rituals

Tagline: Show up, or pay up.

Short description (under 80 characters):

Put a stake on a weekly promise. Keep it and you get it back.

Long description:

Rituals is for the thing you keep meaning to do. Name a ritual, choose how many weeks, set a stake per week, and see the cause that gets it if you miss. One approval in your wallet locks it in.

Each week, hold the big button until the ring fills and the week is stamped. Add a one-line note if you like; it stays on your phone. A SHOWED UP stamp lands, and when the week closes your stake comes back with a KEPT receipt. Miss the week and that week's stake goes to the cause you locked before you started. It's a week, not a verdict.

Weeks close by themselves. When you start, Rituals sets aside a small amount for the app's settle key, so later weeks finish without another wallet prompt. You get one declared skip per ritual: call it before the week opens and that week's stake comes back to you.

Rituals takes nothing. No fee, no share of stakes, no share of forfeits. This build runs on Solana devnet with a valueless TEST token, so you can try the whole loop with nothing real at stake.

Show up, or pay up.

Icon: `<icon path>`
Website: `<website>`
Source: github.com/whoknowsmann/rituals (public from Wed Oct 7, about 02:00 CDT)

## 2. Category and keywords

Category: Productivity (second choice: Lifestyle). Rituals is a forfeitable-deposit commitment tool, the same family as StickK and Beeminder, which are sold as productivity software.

Keywords: commitment, habits, accountability, weekly goals, stake, Solana

## 3. Screenshots

1. Home tiles: "Every ritual, one colour each."
2. Create step 1: "Name the thing you keep skipping."
3. Create step 2 with Demo speed · Real weeks: "Weeks, stake, cause. One approval."
4. HOLD to stamp: "Hold to stamp the week."
5. SHOWED UP stamp: "Showed up. Stamped."
6. KEPT receipt: "Kept. Stake back to you."

## 4. What's new (first release)

First release of Rituals, built for the CLOCK IN hackathon.
Start a ritual in two steps with one wallet approval; stamp each week with a hold.
Runs on Solana devnet with a valueless TEST token. Day and night themes included.

## 5. Privacy policy

Last updated: <date>

Rituals has no accounts, no servers and no analytics. Nothing about you is sent to us, because there is no "us" to receive it. The only data that leaves your phone is the public blockchain transactions you approve.

What the app keeps on your phone
- The addresses of the rituals you have started.
- Your stamp notes. The one-line note you can add when you stamp a week stays on the phone and is never written on chain.
- The app's settle key. It is a small key the app holds so it can close weeks for you; see the disclosures below.
- Your theme choice (day, night or follow the phone).
- A journal of actions in flight, so that if the app is killed mid-action it can recover on restart.

What goes on chain
Your ritual, its weeks, your stamps and the settlements are written to the Solana blockchain. That data is public and permanent. Anyone can read it.

What we never collect
Names, emails, phone numbers, location, contacts, advertising identifiers or usage analytics. No personal data leaves your phone except the public blockchain transactions described above.

Wallet
Rituals connects to your wallet through Mobile Wallet Adapter. Each approval happens inside your wallet app. Rituals never sees your seed phrase or your private keys.

Network
The app talks to a public Solana devnet RPC endpoint to read chain state and submit the transactions you approve. This build runs on devnet only, with a valueless TEST token.

Deleting your data
Uninstall the app and everything stored on the phone is removed, including notes, the settle key and the journal. Any SOL still held by the settle key (typically a few thousandths of a SOL after a ritual finishes) is lost with it, so finish or settle your rituals first. Data already on chain is public and permanent and cannot be deleted by us or by you.

Contact: `<owner-email>`

## 6. Disclosures for review

Devnet only. This build runs on Solana devnet and stakes a valueless TEST token. Nothing in it carries real-world value. The Seed Vault Wallet must be switched to Devnet, otherwise the wallet reports "Network mismatch".

A commitment device, not a wager. There is no chance in the outcome: a week is kept if you stamp it and missed if you don't. There is no counterparty, and no one gains from a miss. A missed week's stake goes to a cause the user locked before starting. Rituals takes no fee and no share of stakes or forfeits. The nearest comparison is a forfeitable deposit, as in StickK or Beeminder, recorded on chain.

The settle key. The app holds a settle key so weeks can close without a wallet prompt. The user pre-pays it inside their first approval (0.001 SOL plus 0.002 SOL per week, capped at 0.05 SOL). It only runs the open and settle steps, which anyone is allowed to run.

Approvals expire. A wallet approval must land within about a minute.

Timing. Demo speed (the default) compresses a week to 6.5 minutes. Real weeks last seven days; a finished real week settles the next time the app is opened, or through the wallet fallback button. Week timings are written on chain at creation and checked against the chain clock, so weeks cannot be clicked through.

Known gaps. The wallet shows the requester as "github.com" until the app identity moves to its own https origin. Testers need TEST tokens to try the app: `<how testers get TEST tokens>`.

## 7. Age rating

Suggested: Everyone (or the store's lowest tier). The app has no user-generated content shared with others, no chat, no violence or mature themes, and no chance-based mechanics. It does involve wallet transactions, so answer the store's questionnaire on financial features honestly: devnet, valueless token, no real money.
