# Rituals design system — "Crew" (C2)

Chosen 2026-09-25 from sketches in `sketches/ui-2026-09/` (C2 is the reference;
B2 is saved as the alternative). This file is the spec screens are built
against. If a screen disagrees with it, the screen is wrong.

## Stance

A group chat about showing up, not a bank. Friends are the interface; money is
a quiet fact on the card, never the headline. Light, warm, human.

## Rules

1. **One hero per screen.** Each screen has exactly one loud thing (the ritual
   poster, the hold button, the big title). Everything else is quiet.
2. **People, not addresses.** Members appear as a coloured tile with an initial
   and a name ("You", "Friend 2"). A raw address only appears behind a tap
   (copy), shortened `Da59…VmV`.
3. **No narration.** Do not explain the screen under its title. If copy is
   needed to act, it goes on or next to the button. Max one line of helper text
   per screen section.
4. **Red means something is wrong.** Normal states (not funded yet, waiting) use
   muted text. `danger` is for failures and forfeits only.
5. **Don't show plumbing.** No "devnet", "deployment", "fixture", "slot",
   "program" in primary UI. One small footer line may say "Devnet · test
   tokens". Demo timing is shown as "Demo speed" in muted text.
6. **Motion confirms, it doesn't decorate.** Animate state changes the user
   caused (check-in fills, a new post drops in, a confirmation chip turns
   green). Nothing loops. Nothing bounces on its own.
7. **Haptics on commitment moments only:** hold start (light), check-in
   complete (success), confirm a friend (light), error (warning).
8. **Copy rules from PRODUCT.md still apply** — no win/beat/pot/jackpot; the
   stake is yours and you get it back.

## Type

- Display: **Fraunces 900** (poster titles, screen hero) — tight tracking.
- Section: **Fraunces 600**.
- UI/body: **Figtree** 400 / 600 / 800.
- Scale (×1.25): 12 · 13 · 15 · 17 · 21 · 26 · 32 · 38.

## Colour

| token | hex | use |
|---|---|---|
| bg | #F4EFE6 | app background (warm paper) |
| card | #FFFDF8 | cards, chips |
| line | #E3DBCD | hairlines, chip borders |
| fg | #1D1A16 | text, dark dock, selected tab |
| muted | #7A7166 | secondary text |
| go | #C8F169 | primary action, confirmed chip |
| goDeep | #8FBF2A | go border / pressed |
| danger | #D6452B | failures, forfeits only |
| member colours | #FF7A59 #2F7BFF #9B6BFF #16A085 #F2A516 #E84393 | poster + member tiles, assigned by roster index |

A ritual's poster takes its **host's member colour** (roster index 0 is the
first colour), so each ritual has its own identity.

## Shape & space

Radius: chip 999 · tile 15 · card 20 · poster 28 · dock 28.
Spacing: 4 · 8 · 12 · 16 · 20 · 28.
Screen padding 18. Sticky primary actions live in a dark bottom **dock**.

## Components

- `Poster` — coloured hero card: kicker (uppercase, 12/800), Fraunces title,
  week strip, one money line.
- `WeekStrip` — N rounded cells; done = white with ✓, now = dashed, future = dim.
- `MemberTile` — colour square + initial; optional ✓ badge.
- `Chip` — pill; `ok` variant uses go.
- `Dock` — dark sticky bar with a one-line prompt and one action.
- `HoldButton` — press-and-hold ring (800 ms) for check-in; releases early cancel.
- `Screen` — bg + padding + optional hero title; no subtitle by default.
