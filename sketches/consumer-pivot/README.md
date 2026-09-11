# Clock In consumer-pivot mockups

These are disposable interactive HTML sketches, not production code. They test three distinct product theses before the Android app is rescaled.

| Concept | Strongest dimension | Weakest dimension | Interaction to try |
|---|---|---|---|
| Rituals | Best overall balance: emotional hook, recurring use, mobile proof, optional settlement | May feel like coordination overhead; stakes can poison the ritual | Create a ritual, select a ritual family, continue |
| QuestTable | Best 30-second judge demo and clearest premium-content purchase | Phone use can undermine an in-person gathering; repeat frequency is lower | Open final quest, add the verdict, watch the artifact become ready |
| StudyGuild | Strongest recurring need and post-hackathon retention/business | Familiar AI-study category; Solana role is less immediately necessary | Start the note quiz and choose Hyperconjugation |

## My current take

1. Rituals is the leading product thesis.
2. QuestTable is the leading presentation thesis and could overtake it if the interaction feels socially additive.
3. StudyGuild is the pragmatic fallback, but it needs the most differentiation work.

I would not combine them. Their value is that they test three different reasons a consumer returns: relationship ritual, live social event, and recurring study accountability.

## Open on Windows

- `\\wsl.localhost\Ubuntu\home\hound\projects\preflight\sketches\consumer-pivot\001-rituals\index.html`
- `\\wsl.localhost\Ubuntu\home\hound\projects\preflight\sketches\consumer-pivot\002-questtable\index.html`
- `\\wsl.localhost\Ubuntu\home\hound\projects\preflight\sketches\consumer-pivot\003-studyguild\index.html`

If the WSL distribution is named differently on Windows, open the corresponding files from WSL or run a temporary HTTP server in this directory.

## Verification

All three pages were served locally, rendered through Windows Chrome headless at a mobile-sized viewport, captured, and visually inspected. The first capture exposed right-edge frame cropping in the test viewport; responsive widths were corrected and the second capture showed complete frames with no major clipping or overlap.

Reference captures are in `screenshots/`.
