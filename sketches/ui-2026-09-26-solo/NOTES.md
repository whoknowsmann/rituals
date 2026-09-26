# Rituals · solo-first sketch notes

## What this set covers

One self-contained HTML sketch at `index.html` with a scrollable screen rail. Every frame is a 390×844 phone shell and can be opened directly in a browser. The rail moves through the full solo journey, then the secondary group path and the app-wide Season layer.

## Solo journey, step by step

1. **First run / empty home** — Jack sees one clear invitation: make a promise with just himself. A small October Run Club card makes Seasons feel alive without pretending the empty home has a large community.
2. **Name the thing** — Jack types the thing he keeps meaning to do. Suggestions mirror his words rather than presenting a generic template catalog.
3. **Choose the honesty mode** — `Just me` is selected by default. A witness is an optional person who confirms but never stakes. Photo or note is optional proof, not an adjudicator. `With friends` is present, but intentionally secondary.
4. **Set the consequence** — Jack chooses a quiet weekly stake, locks the destination (`A cause` first, or `A person you pick`), and gets one declared skip per ritual. The final approval is styled as signing a promise and ends in a `PROMISE MADE` stamp.
5. **Active home** — Two solo rituals are visible as personal posters. A Season card gives social motivation through a live count, not a money leaderboard.
6. **Check in** — On the ritual detail, Jack presses and holds for 700 ms. The before state is a single dark hold hero; the after state becomes an ink stamp with “You showed up.”
7. **Optional witness** — A separate witness view asks “Did Jack make it?” and makes the human confirmation the hero. Witnesses never stake and never receive money.
8. **Humane exception / miss** — The same screen rail shows both a declared skip (refund) and an ordinary missed week (calm, neutral recovery copy). A real forfeiture is shown plainly as a destination receipt, not disguised as a recovery state.
9. **Season** — October Run Club shows an honest live counter and a join CTA. Everyone remains solo with their own stake and destination; participants never confirm one another.
10. **Settlement** — The receipt has two states: stake returned after showing up, and missed stake sent to the chosen cause. Both end with a stamp and keep the money line secondary to the closed week.
11. **Group entry** — `With friends` is a warm secondary doorway for 2–6 stakers. The card explains that friends confirm one another; the solo path remains the front door.

## Chain / authoritative data each screen needs

The HTML is a visual prototype, not a fake lifecycle. In the app, each state below should be rendered from an authoritative readback rather than optimistic copy.

| Screen | Chain / indexer inputs | Write / approval needed |
|---|---|---|
| Empty home | Wallet identity as `You`; active ritual count; Season directory and current member/check-in count | None until create or join |
| Create step 1 | Client-only draft intention and cadence | None |
| Create step 2 | Client-only confirmation mode; optional witness public key; proof mode | Resolve a witness contact to a wallet/person record; no witness stake |
| Create step 3 | Stake amount; cadence; `forfeit_destination`; one-skip eligibility; exact rule digest; ritual kind | Create ritual, lock the destination/rules, fund the user's allocation, and record any activation fee separately |
| Active home | Ritual id; poster identity; schedule; current event/window; claim status; settlement status; destination label; optional witness name; last event | None for read view |
| Check-in before | Ritual/event id; claim window open/close; whether already claimed; current proof attachment if any | Claim/check-in transaction; optional photo/note upload is a separate client/storage concern |
| Check-in after | Authoritative claim signature/status and timestamp; witness-required flag; settlement eligibility | Read back claim before showing the settled outcome |
| Witness view | Claimant display name; ritual/event id; claim timestamp; claim/proof note; witness authorization | `approve_claim` signed by witness; never add witness to payout/member list |
| Declared skip | Ritual/event id; current time relative to `claim_opens`; skip already used; skip count | `declare_skip` before window opens; read back the skip record and refund rule |
| Missed week | Event deadline; absence of claim; settlement state; locked destination | Settlement branch sends the event allocation to the locked destination; no silent conversion of a pending/questioned claim into a forfeit |
| Season | Season id/template; cadence; dates; real participant/check-in count; user's linked ritual id/status | Join Season record; create/link a personal solo ritual; each participant funds independently |
| Receipt | Settlement id/event id; exact outcome; amount returned or sent; destination; network/activation fee; transaction signature | Settlement transaction; read back the exact target/outcome before showing a final receipt |
| Group entry | Ritual kind; 2–6 member roster; each member's funding status; confirmation mode | Group create/invite/fund flow; all members fund before activation; group majority/unanimous rules as configured |

### Important protocol decisions still required

- Extend the program to allow `members.len() == 1` for a solo ritual kind.
- Add an optional non-staking witness and accept the witness signature for solo claim approval.
- Lock a `forfeit_destination` account/value into the rule digest at create time.
- Implement the solo settlement branch: unclaimed → destination; pending/questioned → void/refund.
- Implement `declare_skip` before `claim_opens`, with exactly one eligible skip per ritual.
- Decide whether Seasons are represented by an on-chain cohort account or an indexer-backed directory. The count must be a real count even when it is only 3 or 4 in the demo.

## Warmth moves in this sketch

- **Specific people:** `Jack`, `Sam`, `Maya`, `Dad`, and `Northside Food Bank` replace raw addresses and abstract roles.
- **One human detail per state:** “small call, big deal,” “nice work, Jack,” “I saw you finish the last round,” and “A promise should bend before it breaks.”
- **Responsive consequences:** typing changes the suggestion in the user's own words; the promise ends in a stamp; hold-to-check-in becomes `You showed up`; witness confirmation changes the CTA; joining a Season changes the live count from 3 to 4.
- **Paper and ink:** subtle grain, hand-written notes only at commitment/recovery moments, and imperfect rotated stamps. The interface remains mostly Figtree/Fraunces so the handwriting does not become wallpaper.
- **Money is quiet:** stakes live in a secondary line, while the hero is the promise, check-in, person, or season. Settlement makes the exact amount visible without making it the emotional headline.
- **Humane failure:** skipped and missed states use muted paper tones. Red/orange is reserved for the actual destination consequence and receipt.
- **Honest small numbers:** the Season uses `3 people ran today`; the design does not need a fake crowd to feel alive.
- **No competition framing:** no leaderboard, shared pool, opponent language, or reward from another person's miss.

## Risky or expensive to build

1. **Solo on-chain mechanics:** program changes, account sizing/serialization, client builders/decoders, redeploy, and native tests are the largest risk.
2. **Settlement correctness:** the edge cases matter more than the screens: missed claim, late claim, absent witness, questioned claim, declared skip, and exact destination routing.
3. **Non-staking witness identity:** contact/invite UX, wallet association, permissions, and the rule that a witness never enters the payout path need careful modeling.
4. **Real Season counts:** a reliable cohort/indexer source and anti-double-counting logic are required. Do not hard-code the count in the shipping demo.
5. **Photo or note proof:** notes are cheap; camera proof needs an Expo-compatible camera/storage decision, permission handling, privacy expectations, upload/retention, and a clear statement that Rituals does not adjudicate truth. Mark as optional for the hackathon.
6. **Wallet approval flow:** the sketch compresses create + funding + rule lock into one emotional approval. The implementation may require several wallet prompts or a transaction bundle; keep the user-facing copy human while exposing needed approval detail in a secondary sheet.
7. **Haptics and press-and-hold:** `expo-haptics` plus RN Animated/SVG can deliver the tactile moment without a new dependency, but reduced motion, interruption, pointer cancellation, and screen reader behavior must be handled.
8. **Receipt honesty:** never show “stake returned” or “sent to cause” before reading back the settlement target and exact transaction outcome.

## What the owner may still be missing

- **Destination verification and beneficiary policy:** a displayed cause name needs a stable verified account/metadata path. A demo food-bank account is not a real donation rail.
- **Recovery after a missed week:** decide whether the ritual stays active automatically, whether the user can pause/cancel, and how a second consecutive miss is presented without false reassurance.
- **Witness timeout semantics:** the proposal says no answer or a question should refund/void; define claim expiry, notifications, and whether the claimant can switch witness later.
- **Privacy boundaries:** decide what a witness sees, who can see a photo/note, whether Seasons show names or only aggregate counts, and how long proof is retained.
- **Season membership lifecycle:** joining a Season should create/link a personal ritual with its own destination. Leaving, joining late, and changing the personal stake need explicit rules.
- **Fee disclosure:** “network fee” and any activation fee should be available before the final approval, even if quiet in the primary screen.
- **Demo truth:** use a demo-speed clock only if the state is still real on-chain state. Label accelerated windows as `Demo speed`, never as fabricated activity.
- **Empty-state re-entry:** the first run should preserve this solo invitation even if no friends are available; group invite is a secondary branch, not a prerequisite.

## Build notes

- Approved visual ingredients: warm paper `#F4EFE6`, lime `#C8F169`, Fraunces 900, Figtree, `react-native-svg`, RN Animated, `expo-haptics`, and `expo-font`.
- No app source files were changed by this sketch task.
- Photo proof is intentionally a visual placeholder; the prototype does not add a camera dependency.
- The exact tagline remains: **“Show up, or pay up.”**
