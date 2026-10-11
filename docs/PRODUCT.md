# Product

What Rituals is and is not. Copy, the deck, the submission form and any
app-review or classification question are governed by
`docs/submission/FACTS.md`; this page is the framing behind it. Updated
2026-10-11 (solo product; the group framing from 2026-09-18 is in git history).

## One line

**Show up, or pay up.** Put a stake on a weekly promise. Stamp the week to keep
it. Miss it and that week's stake goes where you chose. Rituals takes nothing.

## What it actually is

A **commitment device**. You put your own money behind a weekly commitment you
keep skipping. Show up and stamp the week: that week's share comes back. Miss
it: that week's share goes to a destination you fixed before you started, a demo
cause or a wallet you pick.

The category is established: StickK, Beeminder and similar forfeit-based tools,
classed as productivity and self-improvement software. Jack's framing: *you are
the donkey pulling the cart of your own goal, and you put the carrot on the
stick yourself.*

Rituals is a stake on a weekly promise you keep; the promise is yours. It is not
pitched as a cure for phone use or as anything but that.

## Why this is not gambling

Gambling needs consideration, chance and a prize together. Rituals has no
chance element and no counterparty.

- The outcome depends only on whether you stamped the week. Nothing is random,
  and nothing verifies that the activity happened: the stake is the check on
  yourself (a witness who confirms is built, hidden).
- Nobody gains from a miss. A missed week's stake goes to the cause or wallet
  you chose; Rituals takes no share of stakes or forfeits and charges no
  activation fee (the on-chain fee settings are 0 / 0 / 0).
- The closest legal analogue is a forfeitable deposit, not a wager. Today it is
  also a valueless devnet token (tSKR).

## Verified mechanics

Measured on the Seeker and devnet (details and signatures in FACTS "Evidence"):

- One total stake, split evenly across 1 to 16 weeks at full token precision.
- One wallet approval creates, locks every week's stake in a program-owned
  vault, activates the ritual and pre-pays the app's settle key.
- One approval per stamp. Weeks close by themselves while the app is open; the
  settle key signs those, the wallet never does.
- Kept: that week's share back. Missed: that week's share to the destination.
  The pool conserves exactly; the protocol is never paid.
- End early: one approval returns everything not already missed and closes the
  vaults.

## Revenue model

None. Users pay only what the chain charges: network fees, account rent (kept
with the ritual's accounts when it finishes; End early closes the vaults and
returns their rent) and the small settle-key pre-payment. The program still
supports a protocol fee (`ProtocolConfig`, changeable by the config authority
with `update_protocol_config`, locked per ritual at creation so a later change
never alters an existing commitment); the current devnet settings are 0 / 0 / 0,
asserted by `scripts/verify-devnet-config.ts`.

## Hidden, and what's next

Built and hidden (code kept, `SOLO_ONLY` in `productScope.ts`): With friends
(2 to 6 people stake and confirm each other), a witness who confirms without
staking, Seasons (shared public rituals). They are described only as "built,
hidden". Then: daily rituals, a home-screen widget, real donation rails; on
mainnet the plan is USDC, SOL and SKR stakes after legal and security review.

## Words

Use the vocabulary in FACTS "Words" (your stake, show up, keep your word, get it
back, stamp, ritual, week, cause) and nothing from its banned list, which is the
only place those words are written down. The copy rules are not
machine-enforced (only the tagline and the stamp are pinned by test); check a
document with the grep given there.
