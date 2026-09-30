# Rituals privacy notes and dApp Store listing (DRAFT, solo-first)

Rewritten 2026-09-30 for the solo-first product. Replaces the 2026-09-23 group-first draft.

This is product documentation, not legal advice. It needs owner review before any public release. Bracketed fields are placeholders.

- App: Rituals
- Operator and privacy contact: [TODO: Jack's legal name or entity, and a privacy contact address]
- Effective date: [TODO: date of public release]
- Scope: the devnet hackathon build. A mainnet release needs this document re-verified first.

---

# Part 1. Privacy notes

## 1. What Rituals does

Rituals is a commitment device. You make a promise to yourself, stake a small amount of a token in weekly slices, and choose where a missed week's slice goes: a cause, or a person you pick. You check in by pressing and holding to ink a stamp. Each week settles on the Solana blockchain. The app talks to your wallet through Mobile Wallet Adapter.

This build runs on Solana devnet with a valueless TEST token. The cause in the app, "Northside Food Bank (demo)", is a devnet stand-in. It is not a real charity and receives nothing of value.

## 2. Where data lives

### On chain (public, permanent)

When you approve a transaction, Solana records it publicly. For Rituals that includes:

- your wallet address, and the addresses of a witness or destination person if you choose one
- the ritual's schedule, the stake per week, and the activation fee
- the destination account for a missed week
- check-in claims, witness approvals, declared skips, settlement results
- for a Season: a participant count and a check-in count per week. These are counters only, with no names attached. The Season still exists as an account that anyone can read.
- transaction signatures and timestamps

The ritual's title and requirement text are not written to the chain. The chain stores a digest (a hash) of the rule, and the Season stores a digest of its title. A digest lets the app check that text matches, without publishing the text. [TODO: confirm exactly which ritual fields are hashed into the on-chain rule digest, from programs/rituals/src/lib.rs, before publication.]

Because the ritual is linked to your wallet address, anyone who knows your address can see that the address has a ritual, its stake, and whether weeks were kept or missed. Treat your address as public. Use a wallet you are comfortable having associated with this.

Rituals cannot delete or edit data on the chain.

### On your device

The app keeps a small amount of local state, using Android app storage (AsyncStorage), verified in source:

- a list of your known rituals: the ritual's chain address, its title, and its requirement text (key `@rituals/known-rituals/v1`)
- a journal of pending wallet actions so an interrupted approval can be recovered (key `@rituals/pending-actions/v1`)
- the wallet authorization cache from Mobile Wallet Adapter (key `authorization-cache`)

Your ritual titles and requirement text therefore live on your device only. Clearing the app's data or uninstalling removes them. Your rituals stay on chain, and the app can be pointed back at them by address, but the title text would need to be re-entered. [TODO: verify whether notes or a proof note are stored anywhere; the current source search found none.]

### Nowhere

Rituals does not collect or store: seed phrases, private keys, wallet passwords, email addresses, phone numbers, contacts, location, camera or microphone data, or photos. The app never asks for a seed phrase or private key. Do not type one into any app.

## 3. Accounts, servers and analytics

- There is no Rituals account, sign-up or email. Your wallet is your identity.
- There is no Rituals server in the money path and no Rituals-run database of users. The app reads chain state from a Solana RPC endpoint. [TODO: verify that no Rituals-operated backend exists in the release build, and name the RPC provider the release build uses. The public devnet RPC is used in development.]
- Analytics and crash reporting: the app's package.json lists no analytics or crash-reporting library, and a search of the source for common ones (Firebase, Sentry, Amplitude, Mixpanel, Crashlytics) found no direct dependency. Sentry packages appear in package-lock.json as transitive dependencies of build tooling. [TODO: verify against the release APK: list its dependencies and decoded manifest permissions, and confirm nothing phones home. Also confirm that the Expo dev client is not in the release build.]
- Notifications: [TODO: state whether the release build schedules any local reminders. The package list has no notifications library.]

## 4. Who else sees what

- Your wallet app (Phantom or Seed Vault Wallet) sees the transactions you ask it to sign. See their policies.
- The Solana RPC provider sees the public requests the app makes, including your IP address as it does for any network request. [TODO: name the provider for the release build.]
- Anyone can read the public chain.

Rituals does not sell data. It has no advertising.

## 5. Your stake, plainly

- Your stake is held by the program for the ritual, not by Rituals and not by an account Rituals controls.
- A missed week's slice goes to the destination you locked in before you started. Rituals never receives it.
- The only money Rituals takes is a separate, disclosed activation fee, shown before you approve. Stakes and missed slices carry no Rituals cut. [TODO: confirm the activation fee terms for a solo ritual. The group fee configuration on chain is 2 percent of the committed amount with a 0.50 to 5.00 floor and cap. Confirm the solo amount from the app's review card once the phone test has run.]
- SKR holders get a fee discount, tiered at 10, 25 or 50 percent for balances of 100, 1,000 or 10,000 SKR (src/domain/rituals/skrDiscount.ts). On devnet this reads a labelled stand-in mint because real SKR does not exist on devnet.
- A signature proves who did something. It does not prove you actually ran. In "Just me" mode the check-in is your word. With a witness, the witness confirms. Rituals does not judge whether you told the truth.

## 6. Retention and deletion

Chain data cannot be removed. Local data is removed by clearing app storage or uninstalling. Because Rituals holds no server-side data, there is nothing on our side to delete. [TODO: revisit if any backend is added.]

## 7. Age and sensitive use

The app is not for children. Do not put health, location, workplace or other sensitive information in a ritual title: the title stays on your device, but a witness you choose may see it [TODO: verify what a witness sees]. Stakes in this build are valueless TEST tokens. Age, financial and publisher disclosures for a real-money release are open questions, listed below.

## 8. Changes and contact

If the data boundary changes (for example, a backend, notifications through a service, photo proof, or analytics), this document changes before that release. Contact: [TODO: privacy contact].

---

# Part 2. Solana dApp Store listing copy

## App name

Rituals

## Short description

The dApp Store guide gives a 30-character limit for the short description (the old draft cited docs.solanamobile.com/dapp-store/listing-page-guidelines). The user brief for this task said 80 characters. [TODO: re-check the current limit in the publisher portal before submission.] Options are given at both lengths.

80-character options:

1. Make a promise to yourself. Put a stake on it. Show up, or pay up. (68)
2. A weekly promise with a stake behind it. Keep it and it comes back. (68)
3. Stake a small amount on a weekly habit. A miss goes to a cause you pick. (73)

30-character fallbacks, if the limit is 30:

1. Show up, or pay up. (20)
2. Stake a promise to yourself (27)
3. A promise with a stake (22)

Recommendation: option 1 at 80 characters, and "Show up, or pay up." at 30.

## Long description (about 210 words)

Show up, or pay up.

You keep skipping the thing you said you would do. Rituals puts something behind it.

Make a promise, like "run 3 times a week". Put a stake on it, in weekly slices, for the length you choose. Pick where a missed week's slice goes: a cause, or a person you choose. It never goes to Rituals. You lock that choice before you start.

Each week, press and hold to ink a stamp. That is the check-in. Want someone to confirm? Add one witness who does not stake. Need a break? You get one declared skip, and that week comes back to you.

Each week settles on Solana. A kept week returns your slice. A missed week sends it to the destination you chose. You get a clear receipt either way.

Join a Season, such as a shared October run, with your own stake and your own destination. Nothing is pooled. The only social signal is an honest count of how many people checked in this week. No names and no leaderboard.

Creating a ritual takes one wallet approval, through Mobile Wallet Adapter. Works with Phantom and Seed Vault Wallet on Seeker. SKR holders get an activation-fee discount.

This build runs on Solana devnet with a valueless TEST token. The cause shown is a demo. No real money moves.

## Feature bullets

- Promise, stake and destination chosen up front, then locked
- Press and hold to ink a check-in stamp
- One declared skip per ritual
- Optional witness who never stakes and never receives money
- Weekly settlement on Solana with a plain receipt: kept, or went to the cause
- Seasons: shared rituals with an honest live count, your own stake, nothing pooled
- One wallet approval to create, fund and start
- SKR balance lowers the activation fee
- With friends mode for 2 to 6 people who confirm each other
- No account, no email. Your wallet is your identity
- Devnet build with a valueless TEST token

## Category suggestion

Primary: Productivity or Health and Fitness, whichever the portal offers. [TODO: read the portal's actual category list.] Not a Finance or Games category. The listing should describe Rituals as a commitment device and self-improvement tool.

## Listing assets still needed

- 512x512 icon [TODO]
- Screenshots of the solo flow on the Seeker, at least 1080 px each side, one orientation [PENDING PHONE TEST: screenshots]
- Preview video MP4 [TODO: demo video does not exist yet]
- Privacy policy URL, public and stable [TODO: no hosted URL yet]
- Support contact [TODO]
- Signed release APK [TODO: none yet]

## Content and financial disclosure notes

Lines to show in the listing, on first run, and before wallet signing:

- Network: Solana devnet only in this build.
- Asset: a valueless TEST token. No mainnet funds.
- The demo cause is a stand-in, not a real charity. Nothing is donated.
- Wallet: every approval happens in your own wallet through Mobile Wallet Adapter.
- Public ledger: wallet addresses, schedules, stakes, check-ins and settlement are public on chain.
- A missed week's stake goes to the destination you chose. Rituals takes no share of it.
- The activation fee is separate from the stake.
- Not a game of chance: no randomness, no counterparty, no odds. The outcome depends only on whether you checked in.
- A signature does not prove you did the activity.

## Open questions for dApp Store policy (do not guess)

1. Is a commitment device that moves a user's own staked token to a chosen destination subject to any contest, gambling, or financial-services disclosure in the Publisher Policy? Jack's draft email to the organizers (Hub: Clock In Organizer Questions.md) asks this. No answer is logged there yet. [TODO: record the answer with date and exact wording if one arrives.]
2. Does the store accept a devnet-only build, for a winner who must publish within 30 days of announcement? Same email, same status. The hackathon requirements say a winning app must be publicly available in the dApp Store within 30 calendar days of the announcement.
3. Does paying a missed stake to a named charity require any charity or fundraising disclosure, even a demo one? Unknown.
4. Age rating, and whether a staking feature needs an adult-only rating. Unknown.
5. Publisher KYC or KYB and wallet requirements (from the old draft, citing the submit-new-app page): publisher profile, verification, a browser-extension wallet, about 0.2 SOL for fees and uploads, review time 3 to 5 business days. [TODO: re-read the current page before acting.]
6. Wallet identity: Phantom shows the app as "github.com" during approval. Known Phase E fix, needs a Rituals-owned HTTPS origin once the repo is public.

If there is no answer by submission, proceed as planned: devnet, valueless token, disclosures shown, risk accepted knowingly.

## Publisher checklist (carried over, still accurate)

These came from the old draft and cite the Solana Mobile docs: submit-new-app, listing-page-guidelines, build-and-sign-an-apk, publishing-from-google-play, publisher-policy, privacy-policy. Not re-verified in this rewrite. [TODO: re-verify each against the live docs before acting.]

- Create a publisher account and complete verification.
- Build a signed release APK and keep the keystore outside Git with a backup. Losing it blocks future updates.
- Verify with `apksigner verify --print-certs <apk>`.
- Confirm package name (currently com.whoknowsmann.rituals), version code, and MWA identity.
- Install the exact release APK on a physical Seeker and run it.
- Keep a copy of the submitted metadata, APK hash, screenshots and transaction signatures.
