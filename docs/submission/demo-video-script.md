# Rituals demo-video script and shot list (DRAFT)

**Target duration:** 2:15–2:45 for the full cut. **Device:** physical Seeker.
**Network:** Solana devnet with valueless TEST assets. **Tone:** calm, concrete,
accountability—not competition or financial hype.

This script is a filming target, not evidence that every mobile step is already
proven. Record the full sequence only after the phone-signed Create gate, the
wallet-signed two-member lifecycle, and the visible claim/confirm/settle screens
have each been exercised. Never replace a missing live step with a fixture while
calling the result live.

## Before recording

- Use fresh disposable devnet wallets. The wallet owner selects accounts in the
  wallet prompt; do not touch personal wallets or Seed Vault material.
- Fund the host and friend with devnet SOL and valueless TEST tokens.
- Prepare a two-member ritual: **Read 50 pages each week**, one friend confirms,
  equal stake, and a short event count suitable for the demo.
- Enable the **devnet-only accelerated cadence**. The normal weekly schedule and
  48-hour claim window are compressed to seconds for filming, with the resolution
  grace compressed as well. The UI must visibly say “Demo cadence — devnet only.”
  The override must be impossible to activate against mainnet and must not change
  custody, threshold, or settlement math.
- Clear notifications and unrelated apps. Turn on a screen recorder that does not
  expose wallet secrets. Capture an optional second recording of the explorer or
  transaction IDs only after the phone shot.
- Keep the reload-recovery path out of the recording unless it has been separately
  proven. Do not background/reload during a wallet action for the sake of drama.

## Full cut: 2:15–2:45

| Time | Shot | On-screen action | Spoken line / audio |
|---|---|---|---|
| 0:00–0:12 | 1. Hook | Seeker home screen, open Rituals. Hold on the tagline and devnet label. | “We all say we’ll read, study, practice, and show up. Rituals puts a small stake behind the promise—and gives it back when you follow through.” |
| 0:12–0:28 | 2. Choose a ritual | Scroll the template picker: Reading, Study, Practice, Family, Walk. Select **Read 50 pages**. | “This is a private commitment device for two to six friends. The templates are deterministic on-device suggestions, not an AI judge.” |
| 0:28–0:46 | 3. Create and review | Set two members, equal stake, one-friend confirmation, accelerated cadence. Show the review card: refundable stake, activation fee, network fee, maximum at risk per missed event. | “Before anyone signs, the rules and money are explicit: the stake is separate from the activation fee, and Rituals takes no share of forfeited allocations.” |
| 0:46–1:00 | 4. Host signs Create | Tap Create. Show MWA wallet approval. Return to Rituals and wait for confirmed readback. Show the ritual address or short transaction ID. | “The host creates the ritual through Mobile Wallet Adapter. The program records the roster, schedule, threshold, and escrow terms on Solana devnet.” |
| 1:00–1:14 | 5. Invite | Open the digest-bound invite/share sheet. On the second prepared device/account, open the invite and show the matching terms. | “The invite is bound to the same rule digest, so the friend reviews the exact terms before joining.” |
| 1:14–1:32 | 6. Friend funds | Switch to the friend wallet, join, review the equal allocation and fee split, approve Fund. Return to the host view and show **1 of 2 funded**, then both funded. | “Both members fund the same event allocation. The wallet, not the app, approves each transaction.” |
| 1:32–1:45 | 7. Activate | Tap Activate after the roster is funded. Show the activation-fee line and confirmed state. Keep the “Demo cadence — devnet only” label visible. | “Once everyone funds, the terms lock and the ritual activates. For this video only, devnet advances the event in seconds instead of a week.” |
| 1:45–1:58 | 8. Claim | Switch to the claimant view. Tap **I did it**, review the event and deadline, approve the claim with MWA. Show **Pending — 0 of 1 friends confirmed**. | “Showing up starts with a signed, event-specific claim. A signature says who claimed; it does not pretend the blockchain saw the real-world activity.” |
| 1:58–2:10 | 9. Friend confirms | Switch to the friend view. Open the confirmation inbox, show claimant, requirement, and threshold. Tap Confirm and sign. Show **1 of 1 confirmed**. | “The friend checks the claim in ordinary human context, then co-signs. The program enforces the threshold and rejects duplicates or self-confirmation.” |
| 2:10–2:27 | 10. Settle | Wait for the accelerated resolution point. Tap Settle/Finalize. Show the confirmed member’s returned allocation and the clearly unclaimed member’s event allocation redistributed, if the prepared demo state includes one. | “Settlement is deterministic. Confirmed members recover their event allocation. Only clearly unclaimed allocations move; pending or questioned claims are not silently confiscated.” |
| 2:27–2:40 | 11. Receipt | Scroll the receipt: principal returned, any deterministic redistribution, remaining recoverable stake, next event, transaction/ritual/claim identifiers. | “The receipt explains what happened and leaves future event principal tracked. Rituals earns the same activation fee whether the group completes or not.” |
| 2:40–2:50 | 12. Close | Hold on receipt and devnet/no-real-value label. Optional cut to explorer showing the final transaction. | “You sign that you did it. Your friends co-sign. The contract handles the rest. This build is devnet-only; mainnet is gated on legal, publisher-policy, and independent security review.” |

## Capture notes

- Prefer direct screen capture plus a short physical-device framing shot at the
  opening and close. Keep wallet prompts readable but do not show account recovery,
  private identifiers, or unrelated balances.
- Use the same member labels and abbreviated public keys throughout. Avoid implying
  that redistribution is a reward for taking a friend’s money; it is a consequence
  of event-pool conservation after a clearly unclaimed allocation.
- When showing an explorer, show the program, event, claim, confirmation, and final
  transaction identifiers—not a wallet secret or a fabricated screenshot.
- If the accelerated cadence is not working, stop the take. Do not hand-edit a
  receipt, skip the threshold, or narrate a fixture as onchain settlement.
- If MWA signing from the Seeker remains unproven, the honest fallback is a shorter
  product walkthrough that says “phone signing pending”; it is not a complete hero
  demo and should not be submitted as one.

## 30-second cut

| Time | Shot | Audio |
|---|---|---|
| 0:00–0:05 | Open Rituals; show tagline and devnet label. | “Rituals puts a small stake behind the commitments we keep skipping.” |
| 0:05–0:10 | Select **Read 50 pages**; show exact review terms. | “You set the rule, stake, schedule, and friend-confirmation threshold before signing.” |
| 0:10–0:15 | Host Create and friend Fund MWA prompts; quick confirmed states. | “Two friends fund equal allocations through their wallets.” |
| 0:15–0:21 | Claim screen, then friend confirmation screen changing to **1 of 1 confirmed**. | “You sign that you did it. Your friend co-signs.” |
| 0:21–0:27 | Accelerated settle and receipt. | “The purpose-built escrow returns confirmed allocations and handles only clearly unclaimed events.” |
| 0:27–0:30 | Receipt plus devnet disclaimer. | “No chance, no platform cut of forfeitures, and no mainnet funds in this demo.” |

The 30-second cut must retain the visible devnet/no-real-value disclosure and must
not imply that the phone flow, reload recovery, or mainnet safety is proven unless
the corresponding gate has been independently verified.
