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
- Rituals takes **nothing**: no share of stakes or forfeitures, and since
  2026-10-04 no activation fee either (the on-chain fee settings are 0 / 0 / 0).

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

None. Rituals is free (Jack's decision, 2026-10-04). Users pay only what the
chain charges them: network fees, account rent (vault rent comes back when a
ritual closes), and a small pre-payment to the app's settle key so weeks close
without a wallet prompt. The fee funded nothing (no servers, no fee key we
run), it was charged even on fully kept rituals, and "missed stakes go to a
cause; Rituals takes nothing" is the honest pitch.

Mechanically the program still supports a fee: `ProtocolConfig` holds
`feeBasisPoints` / `minimumFee` / `maximumFee`, and the config authority can
change them with `update_protocol_config` (no redeploy). The live devnet
settings are **0 / 0 / 0**, asserted by `scripts/verify-devnet-config.ts`.
The exact fee is still locked per ritual at creation, so a later change can
never alter an existing commitment; rituals created before the change paid
the fee they locked (2 % of the pool, 0.5–5 TEST).

## Confirmation modes

`X` counts additional signatures beyond the claimant:

- Honor — `0`
- One friend — `1` (default)
- Group majority — `floor((N - 1) / 2) + 1`
- Unanimous — `N - 1`

Signatures prove who claimed and confirmed. Friends remain the oracle for
physical-world truth; the protocol never adjudicates whether someone told the
truth, and neither does any AI surface.
