# Rituals: submission fact sheet

Verified 2026-10-09 against `feat/solo-screens` @ 7262b24. The d41 APK (built 20:53 CDT, installed on the Seeker at 20:54) comes after that commit; the phone runs Android 16 (read from the device). Every sentence in the README, submission form, release notes, store listing, video script and deck must trace to a line here. If a claim is not here, it is not made.

Status tags: **[Seeker]** run on the Seeker · **[Devnet]** app-path smoke on devnet · **[Chain]** read from devnet on 2026-10-09 · **[Code]** read in the source and covered by unit tests, not walked on the phone. Logs named here are local files in `artifacts/logs/` (not in git).

## Pinned strings

Never reworded: **Show up, or pay up.** (the tagline, pinned by test) and **YOU SHOWED UP!** (the stamp). Names used in every doc: HOLD TO STAMP, Lock it in, Get test tokens, Start one, + New ritual, End early, Finished · N.

## One line

Rituals puts a stake on a weekly promise. Stamp the week to keep it. Miss it and that week's stake goes where you chose: a demo cause, or a wallet you pick. Rituals takes nothing.

## Evidence

- **Seeker run, 2026-10-09, build d40** (built 14:02 CDT, after that morning's stake-precision and End early changes) [Seeker][Chain].
  - Wallet `Dzgu65A3N1tRgXSVS4hmXLgvaag8mFzswhcvFaNKzj2V` (Seed Vault Wallet) took 50 tSKR from the faucet, then created a 6-week demo ritual at 20 tSKR: ritual `3SkSfZHu6hYffP6v4ddJCMPdvyQfk4GShmoFMAPyBbFU`, create tx `2suny5tNXyvAzrtxXidB9aF6B3gJM1uvRqNwpftoF1wGzfgSYPwKFmyrPRJRQspK7CgekNALqcLLbCUk3Bbhirsd`, one wallet signature (CreateSoloRitual, FundMember, ActivateRitual in one transaction).
  - The create locked 19.999998 tSKR (6 × 3.333333) and paid 0.013 SOL to the settle key (`BRyggHTk9oEN5xjFr3KPHWYri3pHiDqbMs4LcoraejLX`).
  - The wallet then signed five stamps. Six settle transactions followed, one a minute, every one signed by the settle key and none by the wallet. Five returned 3.333333 each. Week 2 was left unstamped: one settle-key transaction (InitializeCurrentEvent, FinalizeEvent) sent its 3.333333 to Northside Food Bank (168.983333 → 172.316666).
  - Final wallet balance 46.666667 = 50 − 19.999998 + 5 × 3.333333. The ritual reads Completed, 6 weeks, 3,333,333 a week, activation fee 0.
- **Seeker run, 2026-10-06, build d26** [Seeker]: a 2-week demo ritual; week 2 turned MISSED on the screen and 10 tSKR landed in the chosen wallet (9.125 → 19.125 on chain). Source: `docs/STATUS.md`.
- **Devnet smokes** (the app's own create, stamp and settle code, driven by script) [Devnet]: create → stamp → the settle key closes week 1 → week 2 lapses and the settle key sends it to the cause. Passed on 2026-10-09 at 3.333333 a week (ritual `J3u6FXjZG3p9zMwKmG97iVbe3mdc5uvS8w8PXxotY1gC`, `smoke-fullprecision-2026-10-09.log`) and on 2026-10-08 (`smoke-catchup-2026-10-08.log`). End early: three smokes on 2026-10-07 (plain, after a settled week, after a missed week).
- **Tests** (2026-10-11, 59869f7): 2,930 TypeScript tests in 169 files, all green (vitest). 224 native program tests pass, 0 fail, 1 ignored (see Tech).
- **Bug hunt, 2026-10-08**: a class-based hunt (`docs/overnight/2026-10-08-bughunt-astra.md`) fixed about 25 issues: 23 distinct bugs in the report's two tables plus four later fixes (the count is approximate). Covered by unit tests; the report's device checks have not been run.
- **Tested in code only** (not walked on the phone): create step 1 (heading, two fields, examples) and the 20 stamp sayings, both new in d41 (built 20:53 CDT on 2026-10-09); the "Missed week, sent" End early row; Demo-week reminders, the Android channels, the Remind me switch and the per-ritual toggle (d28 screenshots of Settings and the channels exist in `artifacts/shots/`, not reviewed here); wallet scoping of reminders and screens; the "Network mismatch?" alert; chain checks after a lost wallet reply; Skip's Real-weeks rule.

## The loop

### 1. Start a ritual: 2 screens, 1 wallet approval

The progress line reads "NEW RITUAL · 1 OF 2" and "· 2 OF 2". The Home button is **Start one** (empty Home) or **+ New ritual** [Code].

- **Step 1**, heading **What will you do each week?** Field **NAME** (required, 60 characters) and field **WHAT COUNTS (OPTIONAL)** (renamed from "WHAT COUNTS AS A WEEK", Jack 2026-10-11: that read as a unit question; the placeholder "Describe what counts as showing up" explains it) (140 characters). Greyed examples show in both fields and vanish when you type. One of five pairs is picked at random each time the screen opens: Go for a run / Three runs, any distance · Read / 100 pages · Call mom / One real call · Gym / Three sessions · No takeout / Cook every dinner. The name is cleaned ("to read" → "Read", "I'll call mom." → "Call mom"). If the second field is empty the app stores a plain rule ("Do it, then check in before the week closes.") and does not show it; anything you write shows under the title on the ritual screen. No suggestions, no preset weeks.
- **Step 2**, heading **Your stake**:
  - **HOW MANY WEEKS**: − / +, 1 to 16. The default is 2 on Demo speed and 4 on Real weeks until you touch it.
  - **Demo speed** (default) or **Real weeks**.
  - A **Remind me each week** switch (default on).
  - **TOTAL STAKE**: type it (up to 6 decimals) or tap 5, 10, 20 or 50. The default is 20.
  - One quiet schedule line, for example "2 demo weeks · 1 min each · 10 tSKR a week" or "5 tSKR a week · ends Sun, Nov 1".
  - **IF YOU MISS A WEEK, IT GOES TO**: Northside Food Bank (demo, the default), City Animal Shelter (demo), Public Library Fund (demo), or **A wallet you choose**. A pasted wallet must already hold a tSKR account; Get test tokens creates one.
  - On Demo speed, above Lock it in: "Demo weeks keep running while you’re away. Unstamped weeks are missed."
  - When the wallet's tSKR is unknown, short or empty, the screen offers Get test tokens. When it is short it also says "Not enough tSKR: this needs 20 tSKR." and Lock it in is disabled. With no wallet connected, Lock it in gives way to "Set your wallet to Devnet." and the wallet buttons.
- **The single approval** creates the ritual, locks every week's stake in a vault, activates it, and pre-pays the app's settle key: 0.001 SOL plus 0.002 SOL per week (0.013 SOL for 6 weeks, 0.033 SOL at most) [Seeker][Chain]. Then the app opens the ritual screen directly.

### 2. Stamp a week: 1 approval

Press and hold **HOLD TO STAMP** for 1.4 s (a ring fills, light haptics) and approve once [Seeker]. An optional one-line note (280 characters) stays on the phone and never goes on chain. Then confetti, the **YOU SHOWED UP!** stamp and a saying. The stamp stays the hero until the next week opens, with one ticking line: "Week 2 opens in 38s". The last week counts to its close instead ("Week closes in 30s", then "Closing…") [Code].

### 3. Sayings

20 kept-week lines, shuffled per ritual, so a ritual (16 weeks at most) never repeats one. A stamp and its receipt show the same line. The last week never gets "Same time next week." [Code]. A missed week that is not the last keeps the line "That's a week, not a verdict." The last week gets no saying.

### 4. Outcomes

- **Kept**: that week's stake returns to the wallet; the KEPT receipt reads "{amount} back to you" and shows the note.
- **Missed**: that week's stake goes to the destination fixed at create; MISSED stamp. On a week that is not the last, the receipt and (until the next week opens) the screen say "{amount} went to {destination}."
- **The last week** is different [Code]. The screen reads Finished and shows one totals line, "{back} of {total} tSKR back · {sent} tSKR to {destination}", with the sent part left out when nothing was sent. The last week's receipt shows the same line. A 2-week ritual with week 2 missed reads "10 of 20 tSKR back · 10 tSKR to City Animal Shelter (demo)".
- Tapping any closed week on the punch card opens its receipt. A wallet destination reads "the wallet you chose · fT9Xe…LJgo1": the owner, never the token account.

### 5. Home

- Two-column tiles, one colour per ritual. A tile shows a money line ("X of Y tSKR back" from settled weeks; just the total until outcomes are read), the title, one dot per week (filled kept, ✕ missed, hollow upcoming, ring for the current week, − skipped) and a status pill ("Stamp this week", "Opens in …", "Stamped", "Closing…", "Missed last week", "Finished", "Ended") [Code].
- Rituals that need a stamp come first; "+ New ritual" ends the grid. Finished and Ended rituals sit under a collapsed "Finished · N" row. An Ended ritual's tile counts the refund in "X of Y tSKR back".
- Home shows only the connected wallet's rituals. Another wallet's stay on the phone's list and return when that wallet reconnects.
- An empty Home says "Start a ritual?" While the connected wallet holds under 20 tSKR, Get test tokens is the main button and Start one a link beside it.
- Home also closes overdue weeks (see "When weeks close").

### 6. End early

Settings → Your rituals → End early (the list shows the connected wallet's active rituals). One approval returns everything not already missed and ends the ritual ("Ended") [Devnet]. The vault accounts close in the same transaction and their rent returns [Devnet].

- The confirm screen "End {name} early?" shows **Back to you · X tSKR**. If a week has just closed unstamped and is not yet settled, a second row **Missed week, sent · Y tSKR** appears, and that week's share goes to the destination in the same transaction [Code].
- You type the ritual's name before the last button, **End and get it back**, enables.

### 7. Skip (Real weeks only)

One declared skip per ritual. **Skip week N** appears from week 2 on, between the previous week's settlement and one minute before week N opens (on Real weeks, the last hour before it opens). That week's stake comes back and the stamp reads SKIPPED, "Your stake comes back." Never offered on Demo speed or on a 1-week ritual [Code].

### 8. Other

- Night mode follows the phone; the sun/moon button in the top bar overrides it and is remembered. The top bar also holds Connect and Settings.
- A finished ritual can be removed from the phone's list ("Remove from this phone"); the chain is untouched.

## When weeks close

- The app's own settle key closes weeks. It holds a small SOL balance and signs only the open and settle steps. Anyone may run those steps, and the program sends money only where the ritual already says (the member's token account, or the destination locked at create) [Chain][Code].
- **Nothing runs while the app is closed.** There is no server and no background task. The settle key works only while Home or that ritual's screen is open in the foreground. A missed week's money moves the next time the app is opened. Waiting does not extend a stamp window or refund a miss.
- On open, the screen shows each week's outcome at once (kept ✓, missed ✕, Finished). The app then closes every overdue week back to back, one transaction per week, with no wallet prompt; the status line reads "Closing…" or "Closing weeks 2–6…" meanwhile. Money lines update as each week settles (money text uses settled weeks only) [Code]. Home does this too.
- After three failed tries, or if the settle key's balance is too low, a **Settle this week** (or **Close this week**) wallet button remains as the fallback.
- On Demo speed the ritual screen turns to MISSED at the deadline. The settle transaction lands after the 10 s of grace plus a few seconds: 16 to 17 s after the deadline in the 10-09 run [Seeker][Chain].

## Speeds

- **Demo speed** (default; devnet only). Week 1 opens 60 s after the create is prepared, which is when Lock it in is tapped (wallet approval time counts). 45 s to stamp, 10 s of grace, and the next week opens 5 s later, so a week is one minute. A 2-week ritual runs in about 3 minutes, a 4-week one in under 5, a 6-week one in about 7. The ritual screen says "Demo speed: a week here is 1 minute. Unstamped weeks are missed." in the lead and in an open week that still needs a stamp. The clock never pauses [Seeker].
- **Real weeks**. Week 1 opens 60 s after the create is prepared. Stamp any time in a 6-day window from the opening, then 23 h of grace; the period is 7 days.
- Every week's opening, deadline and resolution time is written on chain at create, and the program checks stamps and settlements against the chain clock. Nobody can click through weeks.

## Money (devnet, valueless tSKR, 6 decimals)

- **The stake is tSKR.** One total is split evenly across the weeks at full token precision: each week gets the total divided by the weeks, rounded down to the smallest unit. What locks is never more than the total and short of it by less than one unit a week. 20 over 6 weeks locks 19.999998 (6 × 3.333333) [Seeker][Chain].
- **Display.** Every amount on screen rounds to 2 decimals (half to even) and drops trailing zeros. Sums are made in the smallest unit first and rounded once, so kept plus sent shows as the total for every pick of 5, 10, 20 and 50 over 1 to 16 weeks and every number of kept weeks (608 cases) [Code]. 20 over 6 weeks reads "6 demo weeks · 1 min each · 3.33 tSKR a week" at create, and a finished ritual with one kept week reads "3.33 of 20 tSKR back · 16.67 tSKR to Northside Food Bank (demo)". Seed Vault's approval sheet may show 20 or 19.999998; not captured (wallet screens record black).
- **Kept or missed.** Kept: that week's stake back. Missed: that week's stake to the destination locked at create, a demo cause or a wallet. The three causes are labelled "(demo)", not real charities; on devnet all three send to the faucet's tSKR account `2JTKtgKaGE6DaGmsNGsRd8oipsw9UQB1Cdu6f9D25HtY` (since 2026-10-11, build d45), so a missed stake refills the pool that funds the next judge. The stake sits in a vault token account whose authority is the ritual account (a program-derived address), so only the program moves it [Code].
- **Rituals takes nothing**: no share of stakes or forfeits and no activation fee. ProtocolConfig fee settings are 0 / 0 / 0 (read 2026-10-09), and the 10-09 create locked exactly the stake [Chain].
- **What the user pays, in devnet SOL** [Chain]:
  - Network fees: a stamp or a settle 0.0000052 SOL; a create 0.000025 SOL.
  - Account rent for the ritual and its two vault accounts: 0.00875792 SOL, about 0.009 (5,781,040 + 2 × 1,488,440 lamports; every ritual account is 1,010 bytes). It stays with those accounts when a ritual finishes: the app does not close them, and the finished rituals above still show vaultsClosed false. End early closes the vaults and returns their 0.00297688 SOL [Devnet].
  - The settle-key pre-payment, 0.001 SOL plus 0.002 SOL per week. The settle key spends it on fees and on the rent of a week nobody stamped (about 0.0019 SOL).
- **Create all-in**: about 0.014 SOL for 2 weeks, 0.018 for 4, 0.022 for 6 (measured on the Seeker: 0.02178292, or 0.0218), 0.042 for 16. The faucet's 0.05 SOL covers any ritual.
- **Not a wager**: no chance, no counterparty, nobody gains from a miss. The closest analogue is a forfeitable deposit (StickK, Beeminder), on chain.
- The name and description of a ritual stay on the phone. The chain stores a SHA-256 digest of them together with the rules [Code].

## Reminders

- Phone-local (expo-notifications), scheduled from the on-chain schedule; no server. The **Remind me each week** switch at create is on by default. Each active ritual screen has a **Reminders: on/off** link. Settings has a **Remind me** master switch, a permission line and a **Notification settings** link that opens Android's settings.
- **Real weeks**: three a week (week opens, one day left, last hour). **Demo speed**: one a week, when the week opens, worded "Week 2: stamp by 6:52:30 PM." on a quiet channel. Delivery is best effort; an alert can arrive late.
- Android notification channels, grouped under "Rituals": **Week opens**, **One day left**, **Last hour** (default importance) and **Demo weeks** (low).
- A stamp, a skip or a finished week clears that week's alerts.
- Reminders follow the connected wallet: disconnect or switch wallets and the other wallet's alerts stop; reconnect and Home restores the future ones [Code].
- Proof: Real-week alarms were scheduled, delivered ("Week 1 is open. Stamp it.") and cleared by the stamp on the Seeker on 2026-10-06 [Seeker]. This is recorded in `docs/STATUS.md`; the logcat for that run is not in the artifacts. Everything else in this section is [Code].

## Wallet handling

- **Wallet**: Seed Vault Wallet (approve = double-tap the side button + fingerprint), pinned through Mobile Wallet Adapter. Connect offers only Seed Vault Wallet (2026-10-10); every recorded run used it. Phantom support is in the code but not offered. Approvals must land within about 60 s.
- **Identity**: Seed Vault shows the requester as **Rituals** at https://rituals.whoknowsman.com. Its approval sheet says it does not recognize the site and offers "I trust this site"; the box appears on every approval [Seeker].
- **Network**: Seed Vault does not tell apps its network, so the app cannot detect a wrong setting. The guard is the README step "Settings → Network → Devnet". With the wrong setting Seed Vault shows its own "Network mismatch" sheet. When Seed Vault cancels after its signing sheet opened (a decline, or its own mismatch sheet; the app cannot tell which), the app shows **Network mismatch?** / "Rituals runs on Devnet. In Seed Vault Wallet: Settings → Network → Devnet. Then try again." [OK], at most twice per phone. Never on success, a timeout, a cancel before signing, or Phantom. It waits up to 4 s for the chain and stays silent if the action went through. There is no pop-up before an approval [Code].
- **Lost replies**: a lost wallet reply, or a cancel after signing began, is treated as "may have gone through" and checked against the chain. If it landed, the action shows as done with no second approval. A create keeps one nonce per create screen, so a retry targets the same ritual address and cannot make a second ritual. For about a second a stamp, skip, settle or End early can still show "Nothing was sent. Try again." before the chain read lands. In-flight actions are journaled, so a killed app recovers on restart [Code].
- **Binding**: the app binds the wallet's signature to the exact bytes the user reviewed; if a wallet rewrites the priority fee, it verifies the landed transaction instead [Code]. The app never sees the wallet's seed phrase or private keys (Mobile Wallet Adapter).

## Faucet

- **Get test tokens** (Home when empty and short; create step 2 when the balance is unknown, short or empty; Settings) POSTs the wallet address to https://faucet.whoknowsman.com/api/claim. The faucet sends 0.05 devnet SOL and 50 tSKR in one transaction it pays; the wallet signs nothing and can hold nothing.
- It refuses a wallet that already holds at least 0.03 SOL and 10 tSKR (HTTP 409). That is a balance check, not a one-per-wallet record. Limit: 5 requests per IP per 10 minutes. Health check 2026-10-09: HTTP 200, 4.74 devnet SOL, 4,750 tSKR, 90 claims possible [Chain]. When it is empty the app shows the contact email.
- The faucet receives the wallet address; nothing else leaves the phone except Solana RPC traffic.
- Source: `whoknowsmann/rituals-faucet` (Vercel functions). The repo is private today.
- Product page https://rituals.whoknowsman.com answered HTTP 200 on 2026-10-09.

## Hidden, and what's next

Hidden in the app (code kept; described as "built, hidden" and nothing more): With friends (2 to 6 people stake and confirm each other; program deployed on devnet, flow built, needs a UI pass), a witness who confirms without staking, Seasons (shared public rituals with honest counts).

What's next, in this order:
1. Daily rituals: same mechanics with shorter windows. The program already takes any window length; Demo speed runs one-minute weeks.
2. A home-screen widget (designed).
3. Friends, a witness and Seasons (built, hidden).
4. Real donation rails (The Giving Block).
5. On mainnet the plan is to offer USDC, SOL and SKR as stake options, after legal and security review. The program is mint-agnostic: the stake asset is one config value.

## Tech

- Anchor program on **devnet**: `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p`, last upgraded 2026-10-07 (slot 508611515, for End early) [Chain]. ProtocolConfig `7LMgBSJmEFKkfYKh2znr6VSxcm5QEHEouNijXDENhMd1` (max 16 weeks, not paused). tSKR mint `AaHgFh7ussUDor8QfaBCaRz2RHiPNCs7i2yuzdLbt9tc`. Demo causes (all three, since d45): the faucet's tSKR account `2JTKtgKaGE6DaGmsNGsRd8oipsw9UQB1Cdu6f9D25HtY`, owned by the faucet hot wallet `FDjXc5KeLbWf9UaMr3y6uUe5ZQDqJYctWuMW7CdnRK8q`. Before d45: `4adFBqT1…`, `7axVhUou…`, `Bg6uNu6t…` (devnet-only keys in `.keys/`).
- App: React Native / Expo, TypeScript. Every prepared transaction carries compute-budget instructions. Strict account decoders; bounded retry on public-RPC 429s.
- Privacy: no accounts and no analytics (none in `package.json`), and no server of ours except the faucet. On the phone the app keeps each remembered ritual (address, name, description, destination wallet), stamp notes, the settle key, reminder settings, the theme choice and the in-flight journal. Uninstalling removes all of it, including any SOL left in the settle key. A kept week leaves its 0.002 SOL pre-payment in the key (the stamp is paid by the wallet), and a missed week uses about 0.0019 SOL of it. Balances from several rituals add up in one key: the test phone's key held 0.025 SOL on 2026-10-09 [Chain][Code].
- Native program tests: `cargo test --manifest-path program-tests/Cargo.toml --locked` passes 224, fails 0, ignores 1 (the compute-unit test, which runs only with `--ignored`); CI runs this suite. Separately, one unit test inside `programs/rituals/src/lib.rs` (`settlement_rejects_invalid_inputs_and_overflow`) fails under a plain `cargo test` at the repo root: it still expects a 1-member ritual to be rejected, which solo rituals made valid. It is not among the 224 and CI does not run it.
- Repo: `github.com/whoknowsmann/rituals` is **private** (checked 2026-10-11); judges read it through the organizer's GitHub app, and making it public is optional (Jack's call at submission). `main` is fast-forwarded to `feat/solo-screens` before submitting. The APK ships as GitHub release `v0.1.0-clockin` (sha256 in `release-notes.md`). License: MIT (`LICENSE`).

## Honest gaps (say them)

- Devnet only; tSKR has no value. Seed Vault Wallet must be set to Devnet.
- Nothing checks that you did the thing: you stamp your own weeks, and the stake is the check. A witness is built but hidden.
- Nothing runs while the app is closed (see "When weeks close").
- The Demo speed clock never pauses, so a week you are away for is missed.
- A wallet destination must already hold a tSKR account.
- The stamp note lives on the phone, not on chain.
- Reminder delivery is best effort.
- The faucet's float is finite and it can run dry.
- Hidden features have rough edges; they are hidden for a reason.

## Words

Use: your stake, show up, keep your word, get it back, stamp, ritual, week, cause. Never: win, beat, versus, rival, pot, jackpot, payout, odds, luck, "profit from", "gets you off your phone" (not what Rituals is; Jack 2026-10-10), AI, mainnet as if it were live (we are devnet only; "on mainnet the plan is USDC, SOL and SKR, after review" is allowed in what's next), SKR except as tSKR (the devnet stand-in) or that plan, "live" for anything hidden.

Check a doc with `grep -niE '\b(win|wins|winning|beat|beats|beating|pot|jackpot|payout|odds|luck|lucky|versus|rival|opponent|AI|mainnet|SKR|live)\b|profit from' FILE` and explain every hit. This section is the only place the banned words may sit, plus the one allowed plan sentence.

## Hackathon

CLOCK IN, the Solana Mobile Hackathon with RadiantsDAO. Submissions close Mon Oct 12, 2026, 6:59 AM CDT (extended; organizer Event Info, seen 10-08). Judging Oct 12 to Nov 9; winners announced Nov 10. Required: a functional Android APK, the GitHub repository, a demo video, a pitch deck. Judged on: stickiness and product-market fit · user experience · innovation · presentation and demo. Winners publish on the Solana dApp Store. A token-integration prize is optional and separate; we are not entering it.

Judges: Anatoly Yakovenko, Mert Mumtaz, Chase Barker, Akshay Rajan, Beeman, Voynich and A2nkF (EthelSec).
