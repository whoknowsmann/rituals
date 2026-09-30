# Product

Updated 2026-09-30 for the solo-first product (decisions: docs/plans/solo-first-2026-09-26.md).

Canonical description of what Rituals is and is not. Use it for copy, the pitch
deck, the submission form, and any app-review or classification question. The
framing was settled 2026-09-18 and mirrors `Projects/Rituals/Product Framing.md`
in the maintainer's private product notes, which are the decision authority. The solo-first pivot
(2026-09-26) changed who the product is for and where a missed stake goes; this
file reflects that. Where this file and the repo disagree about behaviour, the
repo wins (`docs/STATUS.md`).

## One line

**Show up, or pay up.**

Keep the tagline verbatim. It is Jack's line and it is pinned by a test.

## What it actually is

A **commitment device**. You make a promise to yourself, such as "run 3x a
week", and put a stake behind it in weekly slices. Show up and that week's slice
comes back to you. Miss a week and that week's slice goes to the destination you
chose before you started: a cause, or a person you pick. It never goes to
Rituals.

The category is well established: StickK (founded by a Yale behavioural
economist), Beeminder, and similar forfeit-based goal tools. They are categorised
as productivity and self-improvement software.

Jack's framing, which is the clearest version: *you are the donkey pulling the
cart of your own goal, and you are putting the carrot on the stick yourself.*

## Solo is the product

Solo-first is the decision of record (2026-09-26). Assume the user has no friends
on the app. The path is:

1. **The promise.** One sentence, in the user's words. A deterministic on-device
   picker offers templates. It is templating, not AI, and copy must never call it
   AI, an LLM, or smart.
2. **The weekly stake.** One stake per week, for a set number of weeks. Example:
   a 5 TEST stake for 16 weeks is 80 TEST committed, held in slices.
3. **Where a missed week goes.** Chosen and locked before the ritual starts. A
   cause comes first in the picker. "A person you pick" is the second option.
   Rituals never receives a missed stake, and there is no pool of strangers.
4. **How you check in.** The default is honor, shown in the app as "Just me":
   press and hold to ink a stamp, with a haptic. Optional, per ritual: one
   **non-staking witness** who confirms you showed up. A note can be attached as
   proof. Photo proof is not built.
5. **One declared skip.** Each ritual gets one skip, declared before that week
   opens. A declared week comes back to you in full.
6. **Weekly settlement and receipt.** Each week settles on chain. A kept week
   returns your slice and the receipt reads KEPT. A missed week sends the slice to
   your chosen destination and the receipt says it went there, with a quieter mark
   than KEPT. A missed week is framed as "That's a week, not a verdict."

Solo creation is one wallet approval: create, fund and activate are bundled.

### The witness

A witness is one person you trust: a partner, a coach, a sibling. They do not
stake and never receive money, so they have no financial reason to shade the
truth. If the witness never answers, or questions the check-in, the week is void
and your slice is refunded. An absent witness cannot confiscate your stake
(design: `docs/plans/solo-rituals.md` section 3).

### What a signature proves

A signature proves who checked in and who confirmed. It does not prove the run
happened. In "Just me" mode the check-in is your word, which is the point: you
are keeping your word to yourself. With a witness, the witness is the oracle for
physical-world truth. The protocol never adjudicates whether someone told the
truth, and neither does any AI surface.

## Seasons

A Season is a shared, app-wide ritual with one template and one schedule, for
example "October Run Club". It is the third layer after solo and groups.

- You join with your own stake and your own destination. Every participant is
  solo. Nothing is pooled.
- Nobody confirms anybody else. There are no money leaderboards and no rankings.
- The only social signal is an honest live count, such as "3 people checked in
  this week". It shows a number, never names.
- The counters move only when the thing is real. The participant count goes up
  when a ritual activates (after the stake is funded), not when someone taps
  Join. The checked-in count goes up in the same program instruction that turns a
  claim into a confirmed check-in. The count never touches money.
- Joining closes when week 1 opens, and a joined ritual follows the Season's
  schedule.

Why counts only: pooling strangers' misses is betting-adjacent and would give
confirmers a reason to lie, which is exactly what the framing below rules out.
Showing that other people are also keeping their word is motivation, not
competition.

Season counters are proven on a local test validator. The first devnet proof
comes from the phone test. [PENDING PHONE TEST: Season participant_count and
checked_in_count observed on devnet]

## Why this is not gambling

Gambling requires three elements together: **consideration, chance, and prize**.
Rituals has no chance element.

- The outcome is determined entirely by whether the user performed the activity
  they committed to. Nothing is random.
- There is no counterparty. You are not wagering against your friends, other
  Season participants, the house, or the protocol.
- In solo, a missed slice goes to a destination you chose in advance. Nobody wins
  it. A cause or a person receiving it is a consequence you set for yourself, not
  a prize anyone competes for.
- You cannot lose because someone else got lucky. You can only lose a week by
  not doing the thing you said you would do.
- Rituals takes **no share** of stakes or missed slices. The protocol's only
  revenue is a separate, disclosed activation fee.

The closest legal analogue is a forfeitable deposit, not a wager. A solo miss is
a forfeited deposit that goes where you said it would go, decided before the
first week.

## The destination of a missed week

The destination is part of the commitment, so it is locked before the ritual
starts and cannot be changed afterwards.

- **A cause.** The stake-it-to-a-good-cause pattern used by StickK. On devnet the
  only cause is "Northside Food Bank (demo)", a labelled stand-in token account
  that Jack controls. It is not a real charity and nothing real is donated. A real
  donation rail is a mainnet-gate item, not built.
- **A person you pick.** Any token account of the stake mint that is not owned by
  the creator or the witness. The app checks this: you cannot route a miss back
  to yourself or to your witness.
- **Never Rituals.** The protocol does not receive a missed stake, and the
  creator cannot name themselves.

## With friends (secondary path)

The group mode is kept and works, but it is no longer the lead. It is the third
option in the create flow's "who keeps you honest" choice. Two to six people each
stake an equal amount per event, and friends confirm each other.

### Friends are witnesses, not rivals

Members confirm that a claimant actually showed up. This is deliberately not
framed as competition, for two reasons:

1. **Product.** The research that selected Rituals over Pact Club found
   competitive framing carried a "disputes and betting-like framing" risk, and
   that social betting is a crowded lane. The open lane was tools where Solana
   coordinates a group rather than inviting speculation.

2. **Mechanism.** The protocol depends on honest attestation. If friends profited
   meaningfully from a member's failure, attesters would have a financial reason
   to lie. Keeping the framing self-directed keeps their incentive clean.

In a group, forfeited allocations do redistribute to confirmed members, but that
is a consequence of the pool conserving value, not the point of the product. Copy
should never present taking a friend's money as the reward. This redistribution
is group-only: solo and Season rituals never pay a missed slice to other
participants.

### Group confirmation modes

`X` counts additional signatures beyond the claimant:

- Honor: `0`
- One friend: `1` (group default)
- Group majority: `floor((N - 1) / 2) + 1`
- Unanimous: `N - 1`

A solo ritual uses `0` (honor) or `1` (one non-staking witness).

## Copy rules

Use:
- your promise, your stake, your follow-through, show up, keep your word
- a week, a slice (of your stake), kept, went to the cause, went to the person you chose
- friends confirm, friends verify, your crew (group mode only)
- a witness confirms, your witness (solo)
- get it back, recover your stake
- "demo cause" and "devnet" wherever the demo cause or the TEST token appears

Avoid:
- win, beat, versus, rival, opponent
- pot, jackpot, payout as the primary reward
- anything implying you profit from a friend's failure
- anything implying chance, odds, or luck

Added for the solo-first product:
- Never frame a cause or a person receiving a missed week as a reward, a win, a
  donation drive, or charity marketing. It is the consequence you chose. Say
  "went to the cause", not "you helped".
- Never imply a real charity is involved on devnet. The cause is "Northside Food
  Bank (demo)", labelled as a demo cause every time it is shown.
- Never say Rituals keeps, takes or receives a missed stake. It does not.
- Never frame a miss as failure or shame. Use "That's a week, not a verdict."
  No red, and a miss gets a different, quieter mark than KEPT.
- Seasons show a count, never names, ranks or amounts. Do not use "leaderboard",
  "top", "ahead of" or "behind" about other participants.
- Do not call the suggestion picker AI, smart or an LLM. It is templating.
- Say "devnet" and "TEST token" plainly. Nothing in the demo is on mainnet and
  the token has no value.
- Do not claim a signature proves the activity happened.

`src/screens/RitualsHomeScreen.test.ts` guards raw hex colours in screens; the
copy rules above are not machine-enforced, so check them by eye in review.

## Verified mechanics

Measured 2026-09-30 (`docs/STATUS.md` wins if these drift): the Anchor program is
deployed on devnet at `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` (solo +
Seasons build, slot 504946601). The stake token is a valueless devnet SPL "TEST"
token. Nothing is on mainnet. 2,146 TypeScript tests across 99 files pass,
typecheck is clean, and the native program suite is 197 tests.

### Solo, devnet smoke (2026-09-28)

Run by script against the deployed program, without a Season, with a smoke owner
wallet:

- Honor path, 8 of 8 checks: create, check in, settle. The week settled, the
  claim was Confirmed, and the stake returned exactly (exact conservation).
- Missed path, 9 of 9 checks: the demo cause "Northside Food Bank (demo)"
  received exactly one week's stake and the creator received nothing for that
  week.
- The Season counters (`participant_count`, `checked_in_count`) are proven on a
  local test validator only (35 of 35), not on devnet.

[PENDING PHONE TEST: solo flow on the Seeker with wallet signatures. Join the
Season, hold to stamp, settle, receipt. Signatures and screenshots to be added.]

### Group, devnet settlement proof (2026-09-18)

Asserted exactly rather than loosely:

- Each member stakes an equal amount per event.
- A member who claims completion and is confirmed recovers their allocation.
- A member who does not claim forfeits that event's allocation, which is split
  among confirmed members.
- The pool conserves exactly. No remainder is stranded.
- The protocol takes nothing from stakes or forfeitures.

Wallet signing through Mobile Wallet Adapter was done on a physical Solana Seeker
for the group flow on 2026-09-25 and 2026-09-26: create plus stake in one
approval, and the last member's fund plus start in one approval. The app runs on
Android via Mobile Wallet Adapter and works with Phantom and Seed Vault Wallet.
The full group lifecycle also passed by script on devnet on 2026-09-26.

## Revenue model

Rituals takes no share of stakes, no cut of missed slices, and no completion
fee. The only revenue is one disclosed activation fee, charged when a ritual
activates. The network fee is displayed separately.

What the code shows today (`src/features/rituals/create/draftForm.ts`,
`src/features/rituals/solo/create/buildSoloCreateDeps.ts`):

- Fee configuration: `basisPoints` 200 (2%), `minimumFee` 500000, `maximumFee`
  5000000, with 6 decimals. That is 2% with a 0.50 minimum and a 5.00 maximum in
  TEST units. This matches the on-chain configuration.
- For a solo ritual the fee is quoted on the creator's total stake, using the
  same function as groups with one member, and it is paid by the creator. Worked
  example from the formula: 5 TEST for 16 weeks is 80 TEST, so 2% is 1.6 TEST,
  inside the bounds. [TODO: confirm solo activation fee: read the fee line on the
  app's review card after the phone test and whether the fee is part of the
  approved total.]
- The exact fee is stored per ritual at activation, so later protocol
  configuration changes cannot alter an existing commitment.
- A group ritual pays one fee after every member funds and terms lock, host-paid
  or split equally, chosen before invitations.

SKR: a holder discount on the activation fee is implemented in
`src/domain/rituals/skrDiscount.ts`, tiered at 10% off for 100 SKR, 25% for
1,000 and 50% for 10,000 (9 decimals). The discount is floored so payable plus
discount always equals the fee. Real SKR does not exist on devnet. The balance
reader (`src/features/rituals/create/skrBalance.ts`) gates on a devnet stand-in
mint that is currently `null`, so every wallet resolves to the base tier on
devnet today, and a search of `src` finds no screen that calls the balance reader.
Do not claim a live, user-visible SKR discount until that is wired and shown.
[TODO: confirm whether the SKR discount is wired into the create review screen,
and create the labelled devnet stand-in mint if it should be demonstrable.]

Free: non-financial rituals. [TODO: confirm whether the "one simple active group
free during initial testing" policy from the earlier draft still applies; it is
not visible in the code read.]
