# UI warmth research — Rituals

**Date:** 2026-09-26  
**Product:** Rituals — “Show up, or pay up.”  
**Scope:** Research and buildable design moves for an Expo SDK 52 / React Native commitment device on Seeker. No code changes are proposed here.

## Executive read

Rituals already has a stronger point of view than the old UI: warm paper, Fraunces + Figtree, host-colour posters, and friends as witnesses. The risk is that a good visual system still reads sterile when it is rendered as static cards, abstract wallet identities, explanatory protocol copy, and empty space without signs of lived-in crew activity. Warmth will come less from adding decoration than from showing specific people, specific moments, and small responsive acknowledgements.

**Working thesis:** make the app feel like a small group of people keeping a promise together—not a dashboard describing a protocol. Every high-value screen should expose one human detail, one timely state, and one responsive consequence.

**Priority rule for the 12-day runway:** spend effort on the first complete social loop—create, fund, claim, friend confirms, settle—before adding a new feature, dependency, or ornamental illustration. A small number of authored details repeated consistently will feel more human than a large library of generic components.

## Research basis and limitations

- Local product evidence: `docs/DESIGN.md` (Crew rules), `docs/plans/ui-direction-2026-09.md` (prior diagnosis; not repeated here), `docs/plans/hackathon-winners-2026-09-26.md` (hackathon implications), and the supplied device screenshots in `artifacts/shots/`.
- External product pages were read for observable product language and interaction patterns: Partiful [33], Forfeit [34], Beeminder [35], Finch [37], How We Feel [38], BeReal [39], Duolingo’s editorial surface [40], Strava [41], and anti-generic design analyses from SmoothUI [42] and Curio [43].
- These are product-page observations, not controlled usability studies. Claims about why a move feels warm are design interpretation. Where a recommendation is practitioner knowledge rather than a source-backed product observation, it is marked **(practitioner knowledge, unsourced)**.
- stickK was not used for findings because the site returned a bot-verification page rather than product content [36].

## 1. Diagnosis: why a clean Crew-style app can still read sterile

### What is already working

The current Crew direction has the right raw materials: a warm off-white background, high-character Fraunces display type, Figtree UI text, lime action color, colored ritual identity, and a clear “one hero per screen” rule. The empty home screenshot already feels more authored than the prior dark-card UI: “Rituals” has a recognizable wordmark, the tagline is visible, and the lime action is decisive. This is a real foundation, not a redesign-from-zero problem. (Local evidence: `docs/DESIGN.md`; `artifacts/shots/crew-home-2.png`.)

### Where the screenshots still lose warmth

1. **The home is an invitation card, not yet a crew.** `crew-home-2.png` shows “No rituals yet,” two polished buttons, a wallet chip, and a large field of unused paper. It is clean and legible, but there is no person, recent action, shared history, or sign that another human is waiting. The wallet chip is the most concrete identity on the screen, and it is an address abbreviation rather than a person.
2. **The suggest screen is a catalog of templates.** `suggest-results.png` repeats “Visit Grandma” in two nearly identical white cards, with the same title hierarchy, description treatment, and “Use this” control. The colored rails add identity, but the screen still reads as generated options rather than someone’s lived commitment. “8 TEST each” also makes the money louder than the relationship.
3. **The funding lobby is a terms sheet wearing warm colors.** `lobby1.png` duplicates “Funding lobby” in the navigation header and hero title, then spends its first paragraph explaining onchain funding. The roster is “Host” plus truncated address and “Member” plus truncated address; no names, initials, or member colors appear. “Activation would require every member to fund onchain” is red even though nobody has failed—the screenshot violates the Crew rule that red means something is wrong. “DEMO MODE · accelerated…” is useful for a test build but developer-facing in the primary flow.
4. **The system overuses static surfaces.** Rounded white cards, hairlines, and pill buttons are appropriate components, but when every state is another quiet card with no change in density, posture, or response, the interface becomes interchangeable. This is the same structural problem described by anti-generic design references: generic output often converges on repeated card grids and safe, average patterns rather than a point of view [42][43].
5. **The type is expressive but the behavior is not.** Fraunces gives the app voice, yet the screenshots show no action consequence: no check-in filling, no person appearing, no confirmation arriving, no tactile moment. Motion should confirm a user-caused state change, not decorate the screen; this follows the existing Crew spec. (Local evidence: `docs/DESIGN.md`.)
6. **Copy explains the product instead of speaking to the person.** “Everyone reviews the same terms before any onchain funding” and the long “Ready to create” paragraph describe implementation and procedure. Warm products tend to make the next human action obvious and reserve mechanics for the detail layer. **(Practitioner knowledge, unsourced.)**
7. **The empty state is visually finished but socially empty.** Empty states are not a reason to add illustration by default. They need a believable next moment: a named invite, a waiting friend, or a concrete example of what will appear after the first action. Otherwise polished whitespace amplifies the sense that no one is home. **(Practitioner knowledge, unsourced.)**

### The diagnosis in one sentence

Crew is currently **warm in surface language but cold in evidence of life**: the palette and type say “human,” while the roster, copy, timing, and lack of response still say “template.”

## 2. App-by-app findings

| App / reference | Specific move observed | Why it works for Rituals | Source |
|---|---|---|---|
| **Partiful** | Treat the invite as an expressive social object: customizable backgrounds, fonts, animations, posters, guest list, comments, reactions, text blasts, and a shared photo album. The product page repeatedly frames coordination around “your guests” and “friends,” not event administration. | A Ritual invite can be a small authored poster with the ritual’s color, title, cadence, and host name. After sharing, it should become a social object with “Maya joined” or “Sam confirmed,” not a dead URL. Keep the asset system bounded; do not build a general theme editor. | [33] |
| **Forfeit** | State the contract in a concrete sentence—what, when, what happens if missed—then make evidence submission and review visible. The page also shows appeals, flexible schedules, human review, and an evidence chat. | Rituals can make the promise and claim window legible, then show a calm “waiting for a witness” state. Borrow the humane appeal/recovery pattern, not the punitive tone or AI adjudication. Friends confirm; the app should never pretend it can judge a person’s effort from an image. | [34] |
| **Beeminder** | Use one plain rule and one visible boundary: “Mind the Bright Red Line.” Quantifiable goals are tied to a line the user can understand, with the consequence stated directly. | Rituals should have one deterministic weekly strip: done, current, future, missed. Put the stake and rule in a quiet secondary line. A visible “next check-in” is more human and useful than a dashboard of abstract metrics. | [35] |
| **Finch** | Frame self-care as caring for a companion: “take care of your pet by taking care of yourself.” The product gives the routine a friendly character and a small repeated reward loop. | Give the crew and ritual a little character through names, member colors, and short acknowledgements (“Maya saw this”). Do not copy a pet or add a gamified creature; the human witness relationship is Rituals’ native warmth. | [37] |
| **How We Feel** | Make the core action a check-in, then help the user spot patterns and learn a useful next step. The site calls it a journal for wellbeing and presents the app as a precise, supportive tool rather than a performance dashboard. | After a claim or miss, allow one optional human reflection (“How did it go?”) or a short note to the crew. Keep it skippable and brief; the ritual action must remain primary. | [38] |
| **BeReal** | Build a recognizable recurring ritual around a timely prompt: a random two-minute window, front-and-back context, and seeing what friends are actually doing. Its page explicitly rejects staging and says “no AIs allowed.” | Give each occurrence a clear “your turn” moment and let the confirmation show a real person’s name and time. Borrow immediacy and imperfection, not forced camera proof: Rituals is about witness and trust, not surveillance. | [39] |
| **Strava** | Connect personal goals with community: track progress, create challenges, and invite friends. The page presents group activity as motivation while still supporting individual improvement. | Show the user’s own weekly history and the crew’s confirmations without a leaderboard. Friends are witnesses, not rivals; use “3 of 4 showed up” only as coordination context, never as ranking or a prize mechanic. | [41] |
| **Duolingo** | The official editorial surface maintains a conversational, human voice through advice columns, expert bylines, and learner-specific questions instead of generic product copy. | Write Rituals like a person who knows the ritual context: “Your Sunday run is waiting” or “This week got away; next one starts Monday.” A small vocabulary of authored states will feel more alive than autogenerated coaching. **(The UI translation is practitioner knowledge, unsourced.)** | [40] |
| **SmoothUI / Curio** | Both critiques identify generic AI UI as statistical averaging: repeated card grids, safe sans typography, gradient/glass defaults, and one-shot generation. Their proposed fix is an explicit style system plus a build → critique → fix → re-check loop [42]; Curio emphasizes concrete palette, type, spacing, shape, and component rules over vague adjectives [43]. | Crew already supplies the style grammar. Add an anti-sterility acceptance pass to every changed screen: name at least one person, show one timely state, remove one explanatory sentence, and verify the action visibly responds. | [42][43] |

### What the comparison set has in common

The warmest patterns are not “cute decoration.” They are **specificity, recurrence, evidence of other people, and response**: a guest list, an evidence chat, a line to follow, a companion, a timed check-in, a friend activity, or a voice that remembers the context. That is the part Rituals should copy.

## 3. Top 10 ranked moves for Rituals

Effort assumes one developer plus AI agents, roughly 12 days, and the existing Crew components. “No new native dependency” means the move can use the approved Expo SDK 52 stack: `expo-haptics`, `react-native-reanimated` ~3.16, `react-native-svg` 15.8, and `expo-font`. The current `package.json` already lists `expo-haptics`, `expo-font`, and `react-native-svg`; verify/add the approved Reanimated package before implementation. A **new native dependency** means a package outside that set that would create build or device risk.

### 1. Put named people and witness presence in the first viewport

- **Looks like:** Home shows a ritual poster with “You + Maya,” member-color tiles, and one recent line such as “Maya confirmed last Sunday.” Detail shows names and initials first; shortened addresses move behind a copy/details tap. Funding lobby says “Waiting on Maya” rather than “Member 98W4z…9WjLa.”
- **Build:** Use the existing `MemberTile`, roster order, member colors, and local display-name fields. Add a small `lastAction`/status presentation helper; keep raw addresses out of primary layout. **Effort: M (1–2 days).**
- **Dependency:** No new native dependency.
- **Demo impact:** **Very high.** A judge immediately sees this is a crew product, not an escrow dashboard.

### 2. Turn every important state into a human event, not a card label

- **Looks like:** A home feed item reads “Sam showed up · 8:12 AM”; a confirmation item reads “Maya is waiting for your eyes”; settlement reads “This week, closed.” Each event has one small person-colored marker and one action.
- **Build:** Add a thin event-view model over existing authoritative lifecycle bundles; render only the latest 1–3 meaningful events. Use Reanimated only for insert/confirmation transitions, not a looping feed. **Effort: M (1–2 days).**
- **Dependency:** No new native dependency; Reanimated is approved but currently should be verified in `package.json`.
- **Demo impact:** **Very high.** It makes the recurring loop visible in a 90-second walkthrough.

### 3. Make check-in a tactile, authored moment

- **Looks like:** On Ritual detail, the 700 ms `HoldButton` fills with the host color; a small ring closes, the device gives a success haptic, and the label changes from “Hold to check in” to “You showed up.” The next frame adds the user’s member tile to the week strip.
- **Build:** Wire the existing accessible `HoldButton`; use `expo-haptics` for success and `react-native-svg`/approved Reanimated for the ring. Respect reduced-motion and screen-reader states. **Effort: M (1–2 days).**
- **Dependency:** No new native dependency.
- **Demo impact:** **Very high.** It proves the app has a behavior, not just a visual theme.

### 4. Make friend confirmation feel like a warm handoff

- **Looks like:** Confirmation inbox has one hero prompt: “Maya says she showed up.” The action is “I saw it,” with a light haptic and a confirmation chip that turns lime. Afterward, the row says “You confirmed Maya · just now.”
- **Build:** Reuse `ConfirmationInboxScreen` and existing confirmation lifecycle; add optimistic visual state only after the authoritative action succeeds, then animate the chip. **Effort: M (1–2 days).**
- **Dependency:** No new native dependency.
- **Demo impact:** **Very high.** This is the clearest proof of witnesses-not-rivals.

### 5. Replace explanatory helper paragraphs with authored, stateful microcopy

- **Looks like:** Home empty state: “Make a promise with your people.” Funding lobby: “Everyone adds their stake before this starts.” Missed state: “This week slipped. Next one starts Monday.” Mechanics remain behind “Details.”
- **Build:** Create a tested state-to-copy map; remove duplicate title and long narration from the three supplied screens. Keep one helper line per section per Crew rules. **Effort: S (0.5–1 day).**
- **Dependency:** No new native dependency.
- **Demo impact:** **High.** The app sounds authored and confident immediately.

### 6. Give the week a visible, personal rhythm

- **Looks like:** The ritual poster’s week strip is the hero: “Sun · Read one chapter,” with done/current/future cells and the next occurrence in natural language (“Next up · Sunday at 7:00 PM”). A missed week uses a calm neutral state; danger is reserved for actual forfeiture.
- **Build:** Extend the existing `WeekStrip` and schedule formatter; use local time and a small “next” label. Avoid countdown timers unless they are needed for the real claim window. **Effort: M (1–2 days).**
- **Dependency:** No new native dependency.
- **Demo impact:** **High.** It communicates why the app is recurring rather than a one-time funding flow.

### 7. Make the funding lobby a shared preparation room

- **Looks like:** One hero title: “Get the crew ready.” A roster of named member tiles shows “You · ready,” “Maya · waiting,” and a quiet progress line “1 of 2 ready.” Terms collapse below as “The promise,” with stake and fee separated. Demo timing lives in a muted footer.
- **Build:** Recompose `RitualFundingLobbyScreen` using existing cards/tiles, move terms below the roster, replace red normal-state warning with muted waiting text, and hide internal words from the first viewport. **Effort: M (1–2 days).**
- **Dependency:** No new native dependency.
- **Demo impact:** **High.** It repairs the most visibly sterile screenshot and clarifies what the second wallet must do.

### 8. Give the invite/share artifact a little authored life

- **Looks like:** Share sheet preview is the same ritual poster identity: “Sunday run · 4 weeks · You + Maya,” one host color, one short promise, one “Join our crew” action. On return, the home feed says “Invite ready to send.”
- **Build:** Use an in-app preview and the platform share path already available; do not build a poster editor. If native share is not already wired, treat it as a platform capability check rather than adding a new design dependency. **Effort: S–M (1 day).**
- **Dependency:** **Flag:** a new share library would be unnecessary native risk; use existing platform/API support or defer actual share and ship a copy-link affordance.
- **Demo impact:** **Medium–high.** It gives the social graph a visible entry point.

### 9. Design the missed week as recovery, not a red error wall

- **Looks like:** Ritual detail says “This week slipped” in muted text, shows the next week still open, and offers “Tell the crew” or “Start again next week.” If the protocol has actually forfeited the stake, show that separately and plainly: “Stake forfeited · receipt.”
- **Build:** Add a distinct missed/recovery presentation to `RitualDetailScreen` and `SettlementReceiptScreen`; keep domain truth authoritative and never relabel an actual forfeiture as a recoverable miss. **Effort: M (1 day).**
- **Dependency:** No new native dependency.
- **Demo impact:** **High.** Humane failure is memorable and differentiates Rituals from punishment-first habit apps.

### 10. Make settlement a personal receipt, not a transaction dump

- **Looks like:** Receipt hero: “Week closed.” Below: “Your stake returned,” “Network fee,” and “What happened” with the ritual name, week, witness, and time. A small stamp/check animation and success haptic happen once; signature and address details live behind “View transaction.”
- **Build:** Recompose `SettlementReceiptScreen` around the existing authoritative settlement data; use SVG for a simple stamp/check and `expo-haptics` on confirmed readback. No confetti, token rain, or looping celebration. **Effort: M (1–2 days).**
- **Dependency:** No new native dependency.
- **Demo impact:** **Very high.** It makes money legible without making money the emotional headline and closes the story cleanly.

### Suggested implementation order

Do **1 → 5 → 3 → 4 → 7 → 6 → 10 → 9 → 8 → 2** if the full lifecycle is already stable. If the lifecycle is not stable, do 1, 5, 7, and 10 as visual shells only around proven authoritative states; never fake a confirmed or settled state for the demo. The minimum winning bundle is **named people + tactile check-in + friend confirmation + humane receipt**.

## 4. Voice & microcopy guide

### Voice rules

- Speak to one person and one moment: “Your Sunday run is next,” not “The schedule is configured.”
- Prefer verbs and names: “Maya confirmed,” “You showed up,” “Everyone is ready.”
- Keep money accurate but quiet: “Your stake,” “stake returned,” “network fee,” “forfeited.” Never imply that another person receives a failed member’s stake unless that is literally the protocol rule.
- Friends are **crew, people, witnesses, or confirmers**—never rivals, opponents, winners, or losers.
- Preserve the tagline exactly: **“Show up, or pay up.”**
- No win/beat/pot/jackpot/odds/luck/payout language. Avoid “compete,” “take their money,” and “punish yourself.”
- Demo acceleration belongs in a muted footer: “Demo speed · 3 min weeks,” not a hero warning.

### Before → after lines

| Surface | Before | After |
|---|---|---|
| Home empty | No rituals yet | **Nothing on the board yet.** |
| Home empty helper | Start something with your people, or join from a link. | **Make a promise with your people—or join theirs.** |
| Home CTA | Start a ritual | **Make a promise** |
| Home secondary CTA | Join with a link | **Join your crew** |
| Wallet identity | `Da59…8VmV` as the most prominent identity | **You**; keep `Da59…8VmV` behind wallet details |
| Suggest heading | Two ways to do it | **Pick your rhythm** |
| Suggest description | Do the thing you committed to and check in with the group. | **Do it, then let your people know.** |
| Suggest description | Show up each week and tell your friends you did. | **Show up each week. Your crew will see it.** |
| Suggest price | 8 TEST each | **Your stake · 8 TEST** |
| Create CTA | Use this | **Make it yours** |
| Create scratch | Or start from scratch | **Or make your own** |
| Funding title | Funding lobby | **Get the crew ready** |
| Funding helper | Everyone reviews the same terms before any onchain funding. | **Everyone sees the same promise before it starts.** |
| Funding count | 0 of 2 funded | **Waiting on 2 people** |
| Funding warning | Activation would require every member to fund onchain | **Everyone adds their stake before this starts.** |
| Roster role | Host | **You** |
| Roster role | Member | **Maya** (or the saved display name) |
| Roster state | Not funded | **Stake not added yet** |
| Terms heading | Terms | **The promise** |
| Schedule heading | Schedule | **Your rhythm** |
| Demo footer | DEMO MODE · accelerated: every 180s · 90s to check in · 60s to confirm | **Demo speed · 3 min weeks** |
| Ready section | Ready to create | **Ready to make it real?** |
| Ready helper | Review every term. Creating locks the rules and puts in your own stake and the activation fee in the same approval. | **Everyone gets the same promise before it starts.** |
| Check-in action | Hold to check in | **Hold to show up** |
| Check-in success | Check-in complete | **You showed up.** |
| Claim prompt | Claim completion | **Mark this week** |
| Friend confirmation | Confirm | **I saw it** |
| Confirmation success | Confirmation submitted | **You confirmed Maya.** |
| Confirmation inbox | Pending confirmations | **A friend is waiting on you** |
| Invite CTA | Copy invite link | **Send the invite** |
| Invite helper | Share this ritual with another wallet | **Bring one more person in.** |
| Active ritual | Current week | **This week** |
| Next occurrence | Next occurrence | **Next up · Sunday at 7 PM** |
| Missed state | Missed | **This week slipped.** |
| Recovery CTA | Retry | **Start next week** |
| Forfeiture state | User failed | **Stake forfeited · see receipt** |
| Receipt heading | Settlement receipt | **Week closed** |
| Receipt line | Amount returned | **Your stake is back** |
| Receipt line | Protocol fee | **Network fee** |
| Receipt detail | Transaction signature | **View transaction** |
| Normal wait | Awaiting activation | **Waiting for the crew** |
| Empty confirmation feed | No confirmations yet | **Your crew’s first check-in will land here.** |
| Error | Transaction failed | **That didn’t go through. Your stake is still here.** |
| Wallet handoff | Approve transaction | **Approve your stake** |
| Footer environment | DEVNET · TEST TOKENS | **Demo network · test tokens** (muted footer only) |

## 5. Avoid list

1. **Do not add decoration to compensate for missing people.** Confetti, gradients, glass, neon glows, stickers, or floating blobs will not make an empty roster warm.
2. **Do not make every surface the same card.** Use the poster, week strip, roster, feed event, and dock as distinct roles; one hero per screen still applies.
3. **Do not put wallet addresses in the first-order UI.** People and roles first; shortened addresses only behind detail/copy.
4. **Do not use red for waiting, not-yet-funded, or ordinary missed states.** Red is for actual failures and forfeitures only.
5. **Do not narrate implementation.** Remove “onchain,” “deployment,” “fixture,” “program,” “activation would require…” from the hero path. Keep necessary detail behind a disclosure.
6. **Do not turn friends into a leaderboard.** No rankings, head-to-head framing, “who is winning,” or celebration of someone else’s forfeiture.
7. **Do not make money the headline.** The stake is a commitment mechanism and a quiet fact on the card; the human promise is the hero.
8. **Do not imply the app adjudicates truth.** No AI judge, computer-vision proof, or automatic moral score. A witness confirms a friend; protocol state decides settlement.
9. **Do not force camera proof or public oversharing.** Borrow BeReal’s immediacy, not its capture requirement; Rituals should remain usable for private, ordinary commitments.
10. **Do not add a pet, mascot, or streak flame as a substitute for social context.** Characterful copy and witness activity are more native to Rituals.
11. **Do not use looping motion or bounce-on-everything.** Animate the user-caused transition once: hold, confirm, settle. Respect reduced motion.
12. **Do not put a subtitle under every title.** One useful helper line is enough; let the state and action carry the explanation.
13. **Do not build a theme editor in this sprint.** One authored poster identity per ritual beats infinite customization with no social activity.
14. **Do not introduce a new native dependency for warmth.** Use haptics, SVG, fonts, and approved Reanimated first; a new share, camera, analytics, animation, or AI package is a build-risk trade, not a polish shortcut.
15. **Do not fake the lifecycle for the demo.** If a wallet approval, confirmation, or settlement is not authoritative, label it as demo speed or show the proven state; never present fabricated success.

## Acceptance bar for each warmed screen

Before calling a screen done, check it on the real Seeker and in a screenshot:

- Is there a named person, role, or clearly intentional “You” state?
- Is the current moment obvious without a paragraph of explanation?
- Is there one hero and one primary action?
- Does the user-caused action produce a visible and, where appropriate, haptic response?
- Are normal waiting states neutral, and actual failures the only red states?
- Are addresses and chain mechanics secondary to people and the promise?
- Does the copy avoid gambling and competition language?
- If this is the demo, can a judge understand the next human action in two seconds?

## Sources

[33] https://partiful.com
[34] https://www.forfeit.app
[35] https://www.beeminder.com
[36] https://www.stickk.com
[37] https://finchcare.com
[38] https://howwefeel.org
[39] https://bereal.com
[40] https://blog.duolingo.com
[41] https://www.strava.com/features
[42] https://smoothui.dev/blog/ai-design-slop
[43] https://designbycurio.com/learn/why-ai-design-looks-generic
