# Rituals pitch deck outline (DRAFT)

**Recommended length:** 10 slides, 3–4 minutes with the demo. **Core line:**
**Show up, or pay up. You set the stake. You do the work. You get it back.**

The deck should optimize for the governing Clock In terms’ four equal criteria:
Stickiness & Product-Market Fit, User Experience, Innovation / X-Factor, and
Presentation & Demo. The live Align API has separately listed AI and SKR scoring;
Rituals should show the real SKR integration but must not invent an AI feature or
let either rubric assumption distort the product.

## Slide 1 — The promise: make your own commitment harder to break

**On slide**

- Rituals
- **Show up, or pay up.**
- “You set the stake. You do the work. You get it back.”
- A phone mockup of a completed receipt.

**Speaker notes**

“Most of us do not need another goal tracker. We need a consequence that makes a
promise feel real. Rituals lets a small group put a modest, fixed stake behind a
recurring commitment, then recover it when they follow through. The product is
self-directed: you are putting your own money behind your own word.”

**Rubric work:** presentation, stickiness, category clarity.

## Slide 2 — The problem and the category

**On slide**

- Intent is easy; follow-through is the scarce resource.
- Existing commitment-device category: StickK, Beeminder, and related tools.
- Rituals adds private-group attestations and transparent settlement.
- Not a fitness-only product: reading, study, practice, family, and attendance.

**Speaker notes**

“Rituals sits in the commitment-device and self-improvement category. The initial
user already knows the other members and wants a little more accountability for a
repeated promise. The group can read 50 pages, practice guitar, study, attend yoga,
call family, or create together. The group is there to witness follow-through, not
to compete.”

## Slide 3 — The loop: Create → invite → fund → activate → claim → confirm → settle

**On slide**

1. Choose the ritual and schedule.
2. Lock equal member stakes and a confirmation threshold.
3. Each member funds through a wallet.
4. Claim completion; eligible friends confirm.
5. Purpose-built escrow settles the current event and prints a receipt.

**Speaker notes**

“Every funded member commits the same amount for the same event cycle. A member
signs a completion claim. The rule can require honor, one friend, majority, or
unanimous confirmation. When the threshold is met, the program returns that
member’s event allocation. Only clearly unclaimed allocations are redistributed.
Pending or questioned claims use the no-confiscation path.”

**Visual:** six simple screens, with a small “1 of 1 confirmed” threshold marker.

## Slide 4 — Why this is not gambling

**On slide**

- No chance element: the outcome depends on follow-through.
- No counterparty: users are not wagering against friends or the protocol.
- No platform share of stakes or forfeitures.
- Revenue is a separate, disclosed activation fee.
- Friends are witnesses, not rivals.

**Speaker notes**

“This distinction is central. Nothing random determines the outcome. Nobody loses
because another person got lucky. A wallet signature proves who claimed and who
confirmed; it does not prove that a friend read a chapter or attended a class.
Rituals makes the agreement and settlement auditable without pretending human
friendship can be made trustless.”

**Design rule:** never use betting-market visuals, competitive rankings, or
language about profiting from a friend’s failure.

## Slide 5 — The Solana primitive: threshold attestations controlling escrow

**On slide**

```text
Claimant signature
        + X eligible friend confirmations
        → program-enforced claim state
        → deterministic event settlement
        → receipt and remaining stake
```

- Program-owned stake and fee vaults.
- Immutable ritual terms and member order.
- Duplicate, self, nonmember, and replayed approvals rejected.
- No Rituals administrator required for ordinary settlement.

**Speaker notes**

“This is not a generic multisig wallet. Confirmers can authorize only the named
claim transition allowed by the Rituals program. They cannot choose a recipient,
change the amount, withdraw a future event, or rewrite the rule. Solana gives us
compact, auditable state transitions and a deterministic settlement receipt.”

## Slide 6 — Why Solana Mobile and Seeker

**On slide**

- Native Android experience on the Seeker.
- Mobile Wallet Adapter for wallet authorization and signing.
- Solana program controls the escrow; no backend custody.
- Devnet proof with public program/config/mint addresses.
- Exact transaction summary and authoritative read-after-write verification.

**Speaker notes**

“The phone is the product surface, not a web page wrapped in a shell. MWA keeps
wallet approval in the user’s wallet. The app prepares exact account metas and
instruction bytes, binds the returned signature to the prepared message, waits for
confirmation, and reads the target state back. The current submission is devnet-
only with valueless TEST assets while mainnet remains gated.”

**Optional footer:** `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` (devnet program).

## Slide 7 — Fair economics and real SKR utility

**On slide**

- Funded ritual activation fee: **2% of committed pool**.
- **0.50–5.00 USDC-equivalent** floor/cap, selected before invitations.
- Host-paid or split equally; shown before signing.
- No completion fee; no percentage of forfeited allocations.
- SKR balance read enables a real activation-fee discount.

**Speaker notes**

“Rituals’ revenue does not depend on whether a member misses an event. One
activation fee is disclosed before the group signs. The protocol takes no cut of
stakes or redistributed allocations. SKR is not decorative: the app reads the
current SKR balance and uses it for the fee-discount branch. The discount never
controls claim truth or settlement.”

**Visual:** a pre-signing card with refundable stake, activation fee, network fee,
and maximum at risk per missed event.

## Slide 8 — Traction and the live demo

**On slide**

**Proven now**

- Program deployed and ProtocolConfig verified on devnet.
- Complete CLI-signed lifecycle with 17/17 assertions.
- Exact event-pool conservation and zero protocol forfeiture share.
- APK installs and launches on a physical Seeker.
- 1,906 JS/TS tests across 65 files documented; 180 native program test functions.

**Still pending**

- Phone-signed Create through MWA.
- Wallet-signed two-member lifecycle from the device.
- Full visible invite/fund/claim/confirm/receipt wiring.

**Speaker notes**

“Here is the credibility boundary. The protocol and typed client are real and
proven on devnet. The APK launches on a Seeker. The remaining mobile proof is the
phone-signed gate and the visible two-wallet path. We will show the complete hero
flow only after those gates pass. Until then, the deck calls them pending rather
than turning fixtures into fake traction.”

**Demo transition:** cut to the Seeker script; keep “Demo cadence — devnet only”
visible and avoid reload recovery unless separately proven.

## Slide 9 — Roadmap and release gates

**On slide**

**Now / P0**

- Devnet group rituals, valueless TEST assets, MWA, threshold claims, receipts.
- Seeker acceptance, standalone APK, complete visible lifecycle.

**Next / P1**

- Solo rituals with a pre-committed non-platform destination for missed tranches.
- Better private recaps, notifications, dispute/liveness UX.

**Later / P2**

- Public challenge templates only after separate moderation, sybil, privacy,
  reward-source, and publisher-policy design.

**Mainnet gate**

- Independent program/security review.
- Legal and publisher-policy review.
- Privacy, dispute, operational, and two-wallet acceptance review.

**Speaker notes**

“We are deliberately not rushing valuable funds onto mainnet. Solo rituals are a
P1 extension of the commitment-device thesis, but missed-tranche custody must go
to a non-platform destination and unresolved claims must remain safe. Public
challenges are P2 because strangers, moderation, sybil resistance, and reward
sources change the risk model.”

## Slide 10 — The ask: help us turn one honest loop into a habit

**On slide**

- Try the devnet ritual with a small private group.
- Review the program, client, and settlement conservation.
- Help validate Seeker UX and the publisher-policy path.
- Follow the public repo, demo, and release gates.

**Closing line**

> “You sign that you did it. Your friends co-sign. The contract handles the rest.”

**Speaker notes**

“Our ask is not for permission to call a fixture traction. It is for judges and
friends to test whether this loop is useful enough to repeat every week: choose a
commitment, put a modest stake behind it, show up, confirm one another, and get the
stake back. That is the product’s x-factor: Solana coordinates a human agreement
without taking custody or turning the group into a betting market.”

## Deck production checklist

- Keep all screenshots on the Seeker or in a consistent Seeker frame.
- Show the exact review/fee card before any wallet prompt.
- Use “stake,” “show up,” “get it back,” and “friends confirm.”
- Avoid “win,” “beat,” “rival,” “pot,” “jackpot,” “odds,” “luck,” and any claim that
  users profit from a friend’s failure.
- Label every live-chain screenshot `DEVNET / NO REAL VALUE`.
- Do not call deterministic template suggestions AI.
- Do not claim users, revenue, retention, adoption, or other traction metrics that
  have not been measured.
- Put the public repository, APK, demo video, and privacy policy links on the final
  submission version only after they are actually accessible.
