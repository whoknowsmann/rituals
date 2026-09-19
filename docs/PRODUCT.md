# Product

Canonical description of what Rituals is and is not. Use it for copy, the pitch
deck, the submission form, and any app-review or classification question. Settled
2026-09-18; mirrors `Projects/Rituals/Product Framing.md` in Jack's Hub vault,
which is the decision authority.

## One line

**Show up, or pay up. You set the stake. You do the work. You get it back.**

## What it actually is

A **commitment device**. You put your own money behind a recurring commitment you
keep skipping. If you show up, you get it back. If you don't, you forfeit it.

The category is well established: StickK (founded by a Yale behavioural
economist), Beeminder, and similar forfeit-based goal tools. They are categorised
as productivity and self-improvement software.

Jack's framing, which is the clearest version: *you are the donkey pulling the
cart of your own goal, and you are putting the carrot on the stick yourself.*

## Why this is not gambling

Gambling requires three elements together: **consideration, chance, and prize**.
Rituals has no chance element.

- The outcome is determined entirely by whether the user performed the activity
  they committed to. Nothing is random.
- There is no counterparty. You are not wagering against your friends, the house,
  or the protocol.
- You cannot lose because someone else got lucky. You can only lose by not doing
  the thing you said you would do.
- Rituals takes **no share** of stakes or forfeitures. The protocol's only revenue
  is a separate, disclosed activation fee.

The closest legal analogue is a forfeitable deposit, not a wager.

## Friends are witnesses, not rivals

Members confirm that a claimant actually showed up. This is deliberately not
framed as competition, for two reasons:

1. **Product.** The research that selected Rituals over Pact Club found
   competitive framing carried a "disputes and betting-like framing" risk, and
   that social betting is a crowded lane. The open lane was tools where Solana
   coordinates a group rather than inviting speculation.

2. **Mechanism.** The protocol depends on honest attestation. If friends profited
   meaningfully from a member's failure, attesters would have a financial reason
   to lie. Keeping the framing self-directed keeps their incentive clean.

Forfeited allocations do redistribute to confirmed members, but that is a
consequence of the pool conserving value, not the point of the product. Copy
should never present taking a friend's money as the reward.

## Copy rules

Use:
- your stake, your follow-through, show up, keep your word
- friends confirm, friends verify, your crew
- get it back, recover your stake

Avoid:
- win, beat, versus, rival, opponent
- pot, jackpot, payout as the primary reward
- anything implying you profit from a friend's failure
- anything implying chance, odds, or luck

`src/screens/RitualsHomeScreen.test.ts` guards raw hex colours in screens; the
copy rules above are not machine-enforced, so check them by eye in review.

## Verified mechanics

From the devnet settlement proof (2026-09-18), asserted exactly rather than
loosely:

- Each member stakes an equal amount per event.
- A member who claims completion and is confirmed recovers their allocation.
- A member who does not claim forfeits that event's allocation, which is split
  among confirmed members.
- The pool conserves exactly. No remainder is stranded.
- The protocol takes nothing from stakes or forfeitures.

## Revenue model

Free: non-financial rituals, and one simple active group during initial testing.

Funded ritual: one activation fee after every member funds and terms lock.
Hypothesis is 2% of the committed pool, 0.50 TEST/USDC minimum and 5.00 maximum
per group, host-paid or split equally, selected before invitations. No completion
fee. No cut of forfeitures. Network fee displayed separately.

On-chain configuration currently matches this: `feeBasisPoints` 200,
`minimumFee` 500000, `maximumFee` 5000000 (6 decimals).

The exact fee is stored per ritual at activation, so later protocol configuration
changes cannot alter an existing commitment.

## Confirmation modes

`X` counts additional signatures beyond the claimant:

- Honor — `0`
- One friend — `1` (default)
- Group majority — `floor((N - 1) / 2) + 1`
- Unanimous — `N - 1`

Signatures prove who claimed and confirmed. Friends remain the oracle for
physical-world truth; the protocol never adjudicates whether someone told the
truth, and neither does any AI surface.
