# Rituals pitch deck outline (DRAFT, solo-first)

Rewritten 2026-09-30 for the solo-first product. Replaces the 2026-09-23 group-first outline.

Length: 10 slides, about 3 minutes spoken, then cut to the demo video. Slides carry a few words each. The notes carry the argument.

Tagline, used verbatim on slides 1 and 10: **Show up, or pay up.**

Sources of truth: docs/STATUS.md (measured state), docs/PRODUCT.md (copy rules), docs/DESIGN.md (visuals), docs/plans/solo-first-2026-09-26.md (decisions).

## Visual system for every slide

- Warm paper background (#F4EFE6 from DESIGN.md) with a little grain. No dark mode, no gradients, no neon.
- Type: Fraunces for titles, Figtree for small text. One line of handwriting (Fraunces 600 italic) only on the promise slide, same rule as the app.
- The hand-made ink stamps are the recurring motif: PROMISE MADE, SHOWED UP, KEPT in deep-green ink; SKIPPED and MISSED in quiet warm grey. Slightly rotated, double-ruled, as in the app. Never red.
- Real Seeker screenshots in a plain phone frame. No stock photos, no isometric blockchain art, no glowing cubes, no token logos as decoration.
- People before addresses. Where a wallet must appear, show a short form (`Da59…VmV`) small, in a caption.
- Every slide that shows live-chain material carries a small footer: "Devnet · test tokens".

---

## Slide 1. Title

**Idea:** the whole product in one line.

**On slide**

- Rituals
- Show up, or pay up.
- Footer: Solana Mobile · Clock In · Devnet · test tokens

**Speaker notes**

I'm Jack, and I built Rituals alone. It is a commitment device. You make a promise to yourself, put a stake behind it, and choose where the money goes if you miss. The rest of this deck is how that works and what is real today.

**Visual:** paper background. The tagline set large in Fraunces. A SHOWED UP stamp pressed off-center in the corner, as if someone just did it. Nothing else.

---

## Slide 2. The problem

**Idea:** people break promises to themselves, and most have no group who will all join.

**On slide**

- "I'll run three times a week."
- You said it in January too.
- Most of us don't have five friends who will all sign up.

**Speaker notes**

Everyone has a promise they keep skipping. Habit apps count streaks, but skipping costs nothing. The tools that add a real cost, like StickK and Beeminder, have been around for years. The social versions ask for a crew of friends who all commit at once, and most people do not have that. So I made the solo case the main case.

**Visual:** a handwritten-looking list of a promise crossed out and rewritten three times on paper texture. Small caption: "commitment devices: StickK, Beeminder". No phone yet.

---

## Slide 3. The promise, the stake, the destination

**Idea:** you choose the stake and where a miss goes, before you start. It never goes to Rituals.

**On slide**

- Promise: run 3x a week
- Stake: 5 TEST a week, 16 weeks
- If you miss: it goes to a cause, or a person you pick
- Never to Rituals
- PROMISE MADE

**Speaker notes**

Three choices, one screen each. What you are promising. How much you put behind each week. And where a missed week's slice goes. A cause comes first in the list; a person you choose is the second option. That choice is locked before you start, so you cannot bargain with yourself later. Rituals never receives a missed stake. One wallet approval creates, funds and starts it.

**Visual:** the real promise card from the Seeker (handwriting face for the promise line), with the PROMISE MADE stamp landing on it. Screenshot: [PENDING PHONE TEST: solo create screenshot with wallet approval].

---

## Slide 4. The stamp

**Idea:** checking in is a physical gesture, and "Just me" is the default.

**On slide**

- Press and hold.
- Ink the stamp.
- Just me is the default. Add one witness if you want one.
- One declared skip per ritual.

**Speaker notes**

The default check-in is honor. You press and hold, the stamp inks in, and the phone taps back. If you want someone watching, you can add one witness. A witness does not stake and never receives money, so they have no reason to lie. You also get one declared skip, called before the week opens, and that week comes back to you. A strict rule with no give gets abandoned in week three.

**Visual:** the hold ring filling, then SHOWED UP stamped on the week strip. Three-frame sequence, hand-drawn arrows. Screenshots: [PENDING PHONE TEST: hold-to-stamp on the Seeker].

---

## Slide 5. The receipt

**Idea:** every week ends with a plain, calm statement of where the money went.

**On slide**

- KEPT. Back to you.
- Or: MISSED. Went to Northside Food Bank (demo).
- "That's a week, not a verdict."

**Speaker notes**

Each week settles on chain. A kept week returns your slice, and you get a KEPT stamp. A missed week sends exactly that week's slice to the destination you chose, and the receipt says so by name. The two outcomes get different marks, and a miss is never red. The food bank here is a demo stand-in on devnet, not a real charity. I checked both outcomes on devnet on September 28: a kept week returned the stake exactly, and a missed week sent exactly one week's stake to the demo cause.

**Visual:** two receipts side by side on paper, KEPT stamp in green ink and MISSED in warm grey. Real app screenshots if the phone test produces them: [PENDING PHONE TEST: kept and missed receipt screenshots]. Until then, use the layouts with a caption "devnet smoke, Sept 28".

---

## Slide 6. Seasons

**Idea:** a shared ritual with an honest count and nothing else social.

**On slide**

- October Run Club
- 3 people checked in this week
- Your own stake. Your own destination.
- No names. No leaderboard. Never pooled.

**Speaker notes**

Seasons are app-wide rituals that everyone can join, like an October run club. You join with your own stake and your own destination. Nobody's money is pooled, and nobody confirms anyone else. The only signal is a count: how many people checked in this week. That number goes up on chain only when a check-in is actually confirmed, so it cannot be padded. The count is proven on a local test validator. Its first devnet proof is the phone test.

**Visual:** the Season card: title, one count line, a Join button. Beside it, crossed out in pencil, a hand-drawn leaderboard with the note "not here". Screenshot: [PENDING PHONE TEST: Season count on devnet, "1 person in" then "1 checked in this week"].

---

## Slide 7. Why Solana

**Idea:** the rules are locked in a program, nobody holds the money, and approval is one tap on the phone.

**On slide**

- Rules locked before week 1.
- Stake held by the program. Not by us.
- One approval through Mobile Wallet Adapter.
- Tested on a Solana Seeker with Phantom and Seed Vault Wallet.
- [DECISION PENDING: SKR fee discount. Not wired into the app yet; keep this bullet only if it ships]

**Speaker notes**

A commitment device only works if you believe you cannot quietly change the rules, and nobody can quietly keep the money. On Solana the program holds the stake and enforces the schedule and destination. There is no Rituals server in the money path. The app talks to your wallet through Mobile Wallet Adapter, and on the Seeker you pick Phantom or Seed Vault Wallet. The SKR balance read is real code and it reduces the activation fee, in tiers from 10 to 50 percent. Real SKR does not exist on devnet, so today it reads a labelled stand-in mint. That fee is the only thing Rituals charges, and it is disclosed before you approve.

**Visual:** a simple ink-drawn diagram: you, a locked box labelled "the program", two arrows out labelled "kept: back to you" and "missed: your destination". No chain logos. Small caption with the devnet program id.

---

## Slide 8. What is real today

**Idea:** a candid line between what is proven and what is not.

**On slide**

Proven

- Program on devnet: `2Myc…CB9p`
- 2,146 TypeScript tests pass. 197 native program tests.
- Devnet smoke: kept week returned the stake exactly. Missed week sent exactly one week's stake to the cause.
- Wallet signing on a real Seeker for the group flow.

Not yet

- Solo flow signed on the phone: [PENDING PHONE TEST: signature / screenshot]
- Season counters on devnet
- Mainnet. Devnet only, valueless TEST token.

**Speaker notes**

Here is the honest version. The program is deployed on devnet, the tests pass, and the settlement numbers are exact. I have signed real wallet approvals on a Seeker for the group path. The solo path on the phone is the test I am running next, and the slide gets updated with its result. Everything here uses a valueless test token. Nothing is on mainnet.

**Visual:** two columns on paper. Left column entries each get a small green ink check. Right column entries get a pencil circle, no red. Keep it the densest slide and still under 60 words.

Update this slide last, after Phase D. Replace each PENDING marker with the real result, or keep it in the "Not yet" column.

---

## Slide 9. What comes next

**Idea:** mainnet is gated on review, not on ambition.

**On slide**

- Before real money:
- Independent security review of the program
- Legal and dApp Store publisher-policy review
- A real cause partner, with a real donation path
- Then: release APK, dApp Store listing, public repo

**Speaker notes**

I am not putting real money into this on a hackathon timeline. Before mainnet I need an independent review of the program, legal and publisher-policy review, and a real cause partner so that a missed week lands somewhere real. Today the cause is a labelled demo. After that comes the release build and the dApp Store. Groups stay in the app as the secondary path, for people who do have friends.

**Visual:** a hand-drawn checklist with three unticked boxes, pencil ink. Short and plain.

---

## Slide 10. Close

**Idea:** land the tagline.

**On slide**

- Show up, or pay up.
- Rituals
- [TODO: repo URL, demo video URL, APK link once public]

**Speaker notes**

You make the promise. You choose where a miss goes. You press and hold, and the week settles on its own. That is the whole product. Thank you.

**Visual:** same as slide 1, with a KEPT stamp over the tagline corner.

---

## Rubric map

The four published Clock In criteria (docs/plans/hackathon-winners-2026-09-26.md, section 3). Terms section 8.1 weights them equally.

| Criterion | Slides that serve it | How |
|---|---|---|
| Stickiness and product-market fit | 2, 3, 6, 9 | A real problem, a weekly loop for 16 weeks, a Season that gives a reason to come back |
| User experience | 3, 4, 5 | One-approval create, press-and-hold stamp, calm receipts with different marks for kept and missed |
| Innovation | 4, 6, 7 | Hold-to-stamp as the check-in, a witness who does not stake, an honest count that only moves on a confirmed check-in, rules held by a program |
| Presentation and demo | 1, 5, 8, 10 | Plain pitch, real devnet numbers, a candid proven/not-yet slide, tagline |

Also served: Solana Mobile fit (slide 7: MWA, Seeker, Seed Vault Wallet, SKR fee discount only if it ships).

## Production checklist

- Copy rules from docs/PRODUCT.md apply to every line. Avoid win, beat, versus, rival, pot, jackpot, odds, luck, and anything about profiting from a miss. A missed stake going to a cause is a consequence, never a reward.
- Do not call the ritual suggestion picker AI. It is deterministic, on-device templating. The deck makes no AI claim.
- Label the demo cause as a demo everywhere it appears.
- Do not claim users, revenue, retention or adoption. None is measured.
- Use real screenshots only. Anything that depends on the phone test stays marked until it has run.
- Re-verify the numbers (tests, slot, program id) with the STATUS.md one-minute check on the day the deck is finalized.
- Put repo, APK, video and privacy-policy links in only when they are live and public.
