# Rituals

**Show up, or pay up.**

Rituals is a commitment device for one person, built for Solana Mobile. You make a promise to yourself, like "run 3x a week". You put a small stake on it, one slice per week. You also pick where a missed week's slice goes: a cause, or a person you choose. It never goes to Rituals.

Kept weeks return your slice. Missed weeks send it where you said. Each week settles on chain and ends in a plain receipt.

> Devnet only. The stake is a valueless "TEST" token. Nothing here touches mainnet or real money. The demo cause is a stand-in, not a real charity.

[SCREENSHOT: active solo ritual on the home screen]

## How it works

1. **Make a promise.** Type your own, or start from a suggestion. The suggestions are on-device templates, not AI.
2. **Set the stake and the destination.** For example, 5 TEST a week for 16 weeks. Pick where a missed week goes: a cause first, or a person you choose. You also get one declared skip.
3. **Approve once.** One wallet approval creates the ritual, funds it, and starts it. The rules are locked before any money moves. The app shows PROMISE MADE.
4. **Hold to stamp.** When you do the thing, press and hold to ink a stamp. The default check-in is honor ("Just me"). You can add one witness who confirms, but they never stake anything.
5. **The week settles.** When the week closes, you settle it with one more approval. The program sends your slice back, or to the destination you chose.
6. **Get a receipt.** KEPT, or "went to" the cause you chose. A missed week reads "That's a week, not a verdict."

[SCREENSHOT: PROMISE MADE stamp]
[SCREENSHOT: hold-to-stamp]
[SCREENSHOT: KEPT receipt]

### Seasons

A Season is an app-wide shared ritual, like "October Run Club". You join with your own stake and your own destination. Nothing is pooled and nobody confirms anybody else. The only shared signal is an honest count, such as "3 people checked in this week". It goes up on chain only when a check-in is actually confirmed. There are no names and no leaderboards.

[SCREENSHOT: Season screen with live count]

### With friends

A second path exists for groups of 2 to 6. Friends confirm each other's check-ins under a rule the group picks before funding. It is secondary to the solo path. See `docs/PRODUCT.md`.

## What's real today

Measured 2026-09-30.

- The Anchor program is deployed on **Solana devnet**: `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` (solo + Seasons build, slot 504946601).
- The stake is a valueless devnet SPL TEST token. Nothing is on mainnet.
- 2,146 TypeScript tests across 99 files pass. Typecheck is clean. The native program has 197 tests.
- Devnet smoke test, 2026-09-28: a kept week returned the stake exactly. A missed week sent exactly one week's stake to the demo cause "Northside Food Bank (demo)", and the creator got nothing.
- Wallet signing through Mobile Wallet Adapter was done on a physical Solana Seeker for the group flow (create plus stake in one approval, and the last member's fund plus start in one approval), 2026-09-25 and 09-26. The app works with Phantom and Seed Vault Wallet; the user picks.
- SKR: a balance reader and holder fee-discount tiers are built and unit-tested, but they are not wired into any screen yet, and real SKR does not exist on devnet. No discount is live. [DECISION PENDING: wire it into the create review before submission, or drop this line]

Not done yet:

- The solo flow on the phone (join a Season, hold to stamp, settle, receipt) has not been run with wallet signatures. [PENDING PHONE TEST: signatures, screenshots, result]
- Season counters are proven on a local test validator, not yet on devnet. [PENDING PHONE TEST: devnet "1 person in" and "1 checked in this week"]
- No release APK, no dApp Store listing, no demo video. [PENDING: APK link, video link]
- Phantom currently labels the app "github.com" during approval. This is a known fix tied to going public.

## Why on-chain

The rules are locked before money moves. Amount, schedule, witness, and where a missed week goes are fixed at creation and cannot be changed later by you, by Rituals, or by anyone else.

The stake sits in escrow owned by the program, not in an account Rituals controls. The program has no instruction that pays Rituals out of a stake, and no server sits in the middle. A missed week can only go to the destination you chose.

One caveat, stated plainly: on devnet the program is still upgradeable, and the upgrade authority is our deploy key. Before any mainnet launch that authority gets frozen or put behind a multisig with a timelock, so "nobody can change the rules" holds for the code as well as for each ritual.

The receipt is verifiable. The kept or missed result and the transfer are on a public ledger, so you do not have to trust our word that the money went where we said.

## Architecture

- Expo / React Native app for Android.
- Mobile Wallet Adapter hands every signature to the user's wallet app. The app never holds keys.
- An Anchor program on Solana holds escrow, schedules, claims, settlement, and Season counters.
- A typed TypeScript client builds and decodes every instruction and account, and reads state back after each write before showing success.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Product framing and copy rules: [docs/PRODUCT.md](docs/PRODUCT.md). Live status: [docs/STATUS.md](docs/STATUS.md).

## Run it

```bash
npm ci
npm test
npm run typecheck
npm run doctor
```

Native wallet signing needs a custom Android build, not Expo Go. `npm run build` makes an EAS development APK, and `npm run build:local` does the same locally. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

Devnet checks:

```bash
npx tsx scripts/verify-devnet-config.ts
```

[TODO: install instructions for the release APK once it exists]

Use disposable devnet wallets only. Never put seed phrases or keys in this app or repo.

## Honest limits

This is a hackathon prototype on devnet. A wallet signature proves who acted, not that the run happened. Honor check-in trusts you, and a witness trusts one person. Mainnet is blocked on independent program review and policy review. The repo's [docs/PRODUCT.md](docs/PRODUCT.md) explains why this is a forfeitable deposit and not a wager: no chance, no counterparty, and no cut of missed stakes.

## License

[TODO: confirm license before the repo goes public]
