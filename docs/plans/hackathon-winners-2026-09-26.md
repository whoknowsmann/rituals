# What wins Solana Mobile hackathons — implications for Rituals

**Research date:** 2026-09-26  
**Target:** CLOCK IN / Solana Mobile hackathon, submission deadline 2026-10-08  
**Product:** Rituals — “Show up, or pay up.” A self-directed commitment device, not a wager.

## Executive read

The evidence does **not** support the claim that Solana Mobile hackathons are won only by gambling apps. Prediction markets, trading games, fantasy markets, and other speculative products are overrepresented in the published winner lists, but the same lists repeatedly reward non-speculative products: a companion pet, GPS/location experiences, travel and commerce, payments, remittances, social messaging, an on-device AI agent, fitness, and ordinary mobile games.[1][2][4]

Solana’s broader Grizzlython Mobile results also included payments, identity, content, location, and developer tooling.[20]

The repeatable winning shape is:

1. **A one-sentence consumer use case with a visible repeat loop.** The user immediately understands what to do and why they would return.
2. **A real, finished mobile product rather than a port.** The strongest examples make the phone, location, camera, background service, wallet, or social graph part of the product—not just the screen that hosts a web app.[1][2][24]
3. **Solana that removes friction or proves ownership.** Winners use wallet signing, stablecoins, Seed Vault, device identity, onchain ownership, or a meaningful transaction in the core loop. They do not merely put a token logo in the UI.[1][2][13]

The mobile-specific documentation explains the wallet and device-identity mechanisms that make these integrations credible.[28][30]
4. **A short, legible demo.** CLOCK IN explicitly judges “Presentation and demo”; the earlier Mobile Hackathon judged completion, mobile optimization, creative Solana usage, and vision/clarity.[3][24]
5. **Enough polish that the judge can imagine distribution.** dApp Store placement and launch support are part of the prize, but the winning product still has to look like something a Seeker owner would keep.[1][2][3]

**Implication for Rituals:** Do not imitate a prediction market. Make the hero proof a real two-person commitment loop on a Seeker: create a ritual, fund it, claim the event, have a friend confirm, and show settlement. Lead with the human problem and the social payoff; use MWA, Seed Vault, SKR, and the dApp Store as proof that the product belongs on Seeker—not as the product’s identity.

## 1. Winner table

Classification below is analytical. “No clear wager” means the organizer’s description does not mention betting, chance-based payout, or market speculation; it does not mean the app is risk-free or legally classified. “Financial/speculative” includes DeFi, yield, prediction, token-market, or trading mechanics even where it is not gambling. The descriptions are taken from the organizer or official Solana announcement pages, not independent audits.

### Mobile-specific tracks and Solana Mobile hackathons

| Event / placement | Winner | Category | One-line description | Gambling / speculation read |
|---|---|---|---|---|
| Grizzlython 2023, Mobile 1st | Tap | Mobile | Cash-app-style sending, spending, and earning with Solana and USDC. | **No clear wager**; payments. |
| Grizzlython 2023, Mobile 2nd | AquaID | Mobile | Self-custody human identity protocol. | **No clear wager**. |
| Grizzlython 2023, Mobile 3rd | dReader | Mobile | Onchain comic-book store. | **No clear wager**; commerce/content. |
| Grizzlython 2023, Mobile 4th | Proto | Mobile | Spatial data and proof-of-location API. | **No clear wager**; infrastructure. |
| Grizzlython 2023, Mobile 5th | SAGAnize | Mobile | Mobile tools, SDKs, and libraries for Solana-native dApps. | **No clear wager**; developer tooling. |
| Breakout 2025, Solana Mobile Award | LootGo | Mobile Award | Best project integrating Solana Mobile for release on the Seeker dApp Store. | **Unclear from winner announcement**; inspect the submitted product before using it as a product analogue. |
| First Solana Mobile Hackathon, Grand Prize | Nomadz | Consumer/travel | Gamified Web3 travel-booking aggregator with 320 partners and 2.8M stays. | **No clear wager**; gamification is not described as betting. |
| First Solana Mobile Hackathon, Grand Prize | Gib Meme | Game/trading | Memecoin trading-card game with cash rewards and market-movement predictions. | **Speculative**; market prediction and cash rewards. |
| First Solana Mobile Hackathon, Grand Prize | Blormmy | Commerce | AI/crypto commerce for buying more than one billion items with stablecoins. | **No clear wager**; commerce. |
| First Solana Mobile Hackathon, Grand Prize | SP3ND | Commerce | Stablecoin checkout for Amazon and other retailers. | **No clear wager**; payments/commerce. |
| First Solana Mobile Hackathon, Grand Prize | Plutus | DeFi | Mobile creation, aggregation, and management of LP positions and strategies. | **Financial/speculative**; DeFi risk. |
| First Solana Mobile Hackathon, Grand Prize | Memeshot | Game | Mobile PvP game aimed at Gen Z traders and casual users. | **Game; wager not stated**. “Traders” makes the positioning adjacent to speculation. |
| First Solana Mobile Hackathon, Grand Prize | dePlay | Music/markets | Music capital markets where fans predict future hits. | **Speculative**; prediction/market framing. |
| First Solana Mobile Hackathon, Grand Prize | DojoDuel | Game/social | Competitive PvP game for dueling friends with characters. | **Game; wager not stated**. |
| First Solana Mobile Hackathon, Grand Prize | Scrolly | Social/game | Playable social feed containing multiple mobile game experiences. | **No clear wager**; social/game loop. |
| First Solana Mobile Hackathon, Grand Prize | Mattle | Game | Skill-based survival game with points and onchain engagement rewards. | **Game; wager not stated**. |
| First Solana Mobile Hackathon, Honorary | encryptSIM | Utility | Web3 eSIM provisioning with dVPN integration. | **No clear wager**. |
| First Solana Mobile Hackathon, Honorary | iVaults | DeFi | One-tap onchain asset vaults. | **Financial/speculative**; asset exposure. |
| First Solana Mobile Hackathon, Honorary | Send Guys | Game | Multiplayer elimination game for up to five players. | **Game; wager not stated**. |
| First Solana Mobile Hackathon, Honorary | Crypto Fantasy League | Game/markets | Fantasy sports for crypto tokens with PvP competition and market-linked movement. | **Speculative**; token-market/PvP framing. |
| First Solana Mobile Hackathon, Honorary | Xelio | Payments | Send money to any phone number through SMS. | **No clear wager**; remittance. |
| First Solana Mobile Hackathon, Honorary | Amp Pay | Payments | Stablecoin-first self-custodial wallet with transfers and Visa spending. | **No clear wager**; payments. |
| First Solana Mobile Hackathon, Honorary | Block Stranding | Game | Onchain MMORPG with real-time performance. | **Game; wager not stated**. |
| First Solana Mobile Hackathon, Honorary | Trepa | Finance/social | Mobile forecasting arena for real-world data. | **Speculative**; forecasting-market framing. |
| First Solana Mobile Hackathon, Honorary | Lince | DeFi | Robo-advisor with allocation strategies based on user risk. | **Financial/speculative**. |
| First Solana Mobile Hackathon, Honorary | DOLERO | Game | 1v1 competitive Blackjack on Solana. | **Explicit gambling-like**. |
| First Solana Mobile Hackathon, BONK prize | Rampa | Remittance/DeFi | Stablecoin remittance platform with DeFi and education. | **No clear wager** in the announcement; DeFi component remains financial. |
| Monolith, Grand Prize | NOMI | Consumer/pet | 3D onchain companion pet that reacts to how the owner treats it. | **No clear wager**; strongest “ordinary consumer app” analogue. |
| Monolith, Grand Prize | Echo Protocol | Location/rewards | GPS-placed token rewards that users claim by physically showing up; claims signed through Seed Vault. | **No clear wager**; location/reward loop. |
| Monolith, Grand Prize | Pumpville | Social/game | Native Android real-time multiplayer world with daily sessions and player economy. | **Game; wager not stated**. |
| Monolith, Grand Prize | Tramplin | Staking | Premium staking with random reward distribution and onchain proof. | **Speculative / chance-like**; closest to gambling optics despite transparency. |
| Monolith, Grand Prize | PredictTok | Social/markets | TikTok-style feed for prediction markets with AI insights and portfolio/leaderboard views. | **Speculative**; prediction markets. |
| Monolith, Grand Prize | Cue | Social/markets | Cultural prediction markets with gas sponsorship and wallet abstraction. | **Speculative**. |
| Monolith, Grand Prize | Backyard Fi | DeFi | Stablecoin strategies across multiple vaults. | **Financial/speculative**. |
| Monolith, Grand Prize | Foresee | Social/markets | Social prediction market for predicting with friends and earning rewards. | **Speculative**; especially risky for Rituals’ positioning. |
| Monolith, Grand Prize | SeekerClaw | AI/utility | On-device, always-on AI agent with persistent memory, tools, and Solana actions. | **No clear wager**; strong device-native analogue. |
| Monolith, Grand Prize | Cashflow | DeFi/mobile | Mobile yield aggregator across Solana lenders; SKR staking unlocks gas-free transactions. | **Financial/speculative**. |
| Monolith, SKR Track | Seek | Location/social | GPS scavenger hunts designed around using the Seeker in the real world with friends. | **No clear wager**; strong location/social analogue. |
| Monolith, Honorable Mention | Cherry | Social | Wallet-as-handle social app with communities, DMs, and private group chats. | **No clear wager**; organizer reports 7,000+ verified owners and 3,500+ five-star dApp Store reviews. |
| Monolith, Honorable Mention | Timebent | Game | Native Seeker action RPG with tokenized inventory and soulbound characters. | **Game; wager not stated**. |
| Monolith, Honorable Mention | Kickr | Sports/trading | Soccer trading app surfacing prediction-market signals at the point of trade. | **Speculative**. |
| Monolith, Honorable Mention | Kinlog | Fitness | Camera-based squat recognition, daily streaks, and NFT badges. | **No clear wager**; strong productivity/fitness analogue. |
| Monolith, Honorable Mention | The Hunters of Faenora | Game | Pixel-art mobile tactics RPG with token swaps and competitive token rewards. | **Game with financial/speculative layer**; no explicit wager in the description. |

**What this table says:** mobile judges will reward speculation when it is the category’s product, but they also repeatedly select products whose value is social, practical, physical, or playful. Rituals is closer to Echo, Seek, Kinlog, Cherry, NOMI, and SeekerClaw than to PredictTok, Foresee, Tramplin, or DOLERO.

### Important date/data caveat

The official pages have republished or inconsistent date metadata: the page describing the 2025 inaugural event is currently dated July 14, 2026, and the Monolith page also carries a July 14, 2026 page date while describing a February–March 2026 event.[1][2][24] The winner names and descriptions are usable as organizer-published evidence; exact page-date metadata should not be treated as an independent event chronology.

## 2. Patterns among non-gambling winners

### A. The winning product is legible before the blockchain is explained

The clearest non-speculative examples have a one-line action loop:

- **NOMI:** care for a pet; it reacts.
- **Echo:** put a reward somewhere; go there and claim it.
- **Seek:** use your phone to explore and compete in a scavenger hunt.
- **Kinlog:** do squats; the phone counts them and builds a streak.
- **Cherry:** use your wallet as your social identity and join communities.
- **Xelio / Amp Pay / SP3ND:** send or spend stablecoins in familiar payment flows.

That is exactly what CLOCK IN’s published rubric calls “stickiness and product-market fit”: a real problem and a reason for Seeker users to come back.[3] The first Mobile Hackathon’s rubric likewise separated completion, mobile optimization, creative Solana usage, and vision/clarity, rather than awarding technical complexity alone.[24]

**Rituals translation:** the first screen should communicate “make a commitment with your crew; show up; get your stake back,” not “manage a pool/position.” A judge should understand the value before seeing an address, token amount, or protocol diagram.

### B. Mobile is part of the behavior, not a smaller web viewport

The organizer descriptions repeatedly point to mobile-native behavior: GPS and physical presence in Echo and Seek, native Android and quick daily sessions in Pumpville, an on-device background agent in SeekerClaw, camera motion recognition in Kinlog, wallet/Seed Vault signing, and wallet abstraction.[1][2]

The prior Mobile Hackathon explicitly asked for functional Android applications demonstrating deep Solana integration, mobile-focused functionality, and Solana Mobile Stack tools such as Mobile Wallet Adapter.[24]

**Rituals translation:** a real Seeker recording matters. Show the user leaving the app for wallet approval and returning to a clear, authoritative state. Show the crew/confirmation workflow, reminders, and the compact one-handed screens. Do not make the demo a desktop browser or a static mockup wrapped in Expo.

### C. The strongest blockchain use is a friction reducer or proof, not decoration

The first Mobile Hackathon says winners showed deep Solana integration, mobile-focused functionality, and effective use of the Solana Mobile Stack, including SMS and MWA.[1] Monolith gives concrete examples: Echo uses Seed Vault for claims; Cue uses gas sponsorship and wallet abstraction; Cashflow uses SKR to unlock gas-free transactions; SeekerClaw runs Solana actions from an on-device agent.[2]

The official developer docs describe MWA as the standard protocol for authorization and transaction/message signing between a mobile app and wallet app.[28] Seed Vault is hardware-level custody whose keys stay in the secure execution environment, while dApps generally reach it indirectly through MWA.[13]

**Rituals translation:** MWA + Seed Vault approval is a real part of the commitment action. Use it once in the hero flow, then get back to the human result. Do not build a direct Seed Vault wallet integration; the docs say dApps should use MWA, while the Seed Vault SDK is for wallet developers.[13]

### D. Traction helps, but the public evidence is uneven

The organizer calls Cherry the top-ranked social app on Seeker and reports 7,000+ verified owners and 3,500+ five-star dApp Store reviews. It reports Echo live on devnet with 207 Echos across 34 cities and The Hunters of Faenora with 4,000+ hackathon players.[2] These are useful signals of distribution and repeat use, but they are organizer-provided claims, not independently audited metrics.

The Solana Mobile Builder Grants page says dApps can reach their first 10,000–20,000 users in weeks and asks for products that activate Seeker users, feel viral or sticky, improve the Seeker experience, or use SKR for meaningful payments, incentives, or perks.[19] It also explicitly says the goal is not merely to distribute SKR to an existing user base.

**Rituals translation:** even without real user traction before submission, demonstrate a believable repeat loop: weekly cadence, next occurrence, crew feed, confirmation inbox, receipt, and a reason to invite one more friend. A two-person live demo is stronger than a claim that “social accountability could scale.”

### E. The record does not support a strong claim about demo-video style

The official materials require a demo video and judge presentation/demo, and the older rubric asks how well the video demonstrates a functional application.[3][24] However, the public winner announcements do not provide a comparable corpus of winner videos, watch-time data, video lengths, or judge commentary on editing style. It would be overclaiming to say that winners share a known cinematic format.

The defensible conclusion is narrower: **the video must make the working product and why it matters obvious quickly.** As an outside mobile-hackathon comparison, RevenueCat’s 2026 Shipaton requires essential demo footage to stay within two minutes and to show the app running on the target device.[32] That is not a CLOCK IN rule, but it is a useful ceiling for Rituals.

## 3. What organizers and judges say they want

### CLOCK IN’s published rubric

The official CLOCK IN announcement names four criteria:[3]

- **Stickiness and product-market fit:** real problem and reason for a Seeker user to return.
- **User experience:** intuitive, polished, and fun to use.
- **Innovation:** fresh idea or new use of mobile.
- **Presentation and demo:** show what was built and why it matters.

CLOCK IN requires a functional Android APK, GitHub repository, demo video, and pitch deck.[3] Winners must publish on the Solana dApp Store to claim the prize.[3]

### The prior Solana Mobile rubric

The earlier Mobile Hackathon emphasized:[24]

- completion — the video must demonstrate a functional app;
- technical depth — visible in the codebase and implementation;
- mobile optimization;
- creative Solana usage;
- vision and clarity.

It also offered a useful strategic warning: the target was functional Android software that demonstrates mobile-first blockchain development, not a pitch for a future product.[24]

### Current Solana Mobile builder guidance

Solana Mobile’s builder-grant guidance is aligned with the above. It asks for mobile-first products that can leverage native Android features, clear use of MWA and Seed Vault, and creative SKR use for payments, incentives, or exclusive experiences. It says strong teams contribute a meaningful consumer experience, developer tool, or infrastructure product to the broader ecosystem.[19]

### What this means for the rubric uncertainty in the local submission notes

The local status notes record a conflict between the four-category terms rubric and a live API rubric that adds AI and SKR. The official CLOCK IN announcement is the stronger public evidence for judging: it names the four equal categories above.[3] The prudent hedge is still:

- build the real hero flow first; it serves all four published categories;
- keep the existing real SKR activation-fee discount visible and honest;
- add AI only if it summarizes confirmed history without adjudicating whether a person showed up;
- do not add decorative AI scores or a speculative token mechanic to chase an uncertain API field.

## 4. Concrete implications for Rituals

### Demo video recommendation: 90–120 seconds, real Seeker, no title-card runway

This is a recommendation, not a published CLOCK IN duration limit. The two-minute ceiling is borrowed from the comparable RevenueCat mobile-hackathon requirement.[32]

**First 10 seconds:** show the real Seeker screen with an active ritual and the line:

> “You keep skipping the thing you said you would do. Put your own stake behind it. Show up, or pay up.”

Immediately show the crew/ritual state and a visible next event. Do not open with a logo animation, architecture diagram, terminal, or a wallet address.

**Suggested sequence:**

| Time | What the judge should see | Why it matters |
|---|---|---|
| 0:00–0:10 | Active Crew screen, human problem, tagline, next event. | Product clarity and stickiness. |
| 0:10–0:25 | Create a weekly ritual: commitment, stake, confirmation mode, and explicit “your stake returns when confirmed” copy. | Shows the commitment-device mechanism without betting language. |
| 0:25–0:40 | MWA wallet handoff on the Seeker, Seed Vault/biometric approval, return to “created.” | Real mobile/Solana integration; proves the wallet path. |
| 0:40–0:58 | Second wallet joins/funds or the prepared two-person flow; show the crew member, not a truncated address. | Social coordination and usable identity. |
| 0:58–1:15 | Accelerated demo event: member claims, friend opens confirmation inbox, confirms. | Makes the recurring behavior and witness role concrete. |
| 1:15–1:32 | Settlement receipt with transaction confirmation, recovered stake, transparent destination/forfeit rule, and “protocol takes no stake” if accurate in the build. | Separates Rituals from a house, pot, or wager. |
| 1:32–1:48 | Crew feed / next occurrence / reminder or invite loop. | Answers “why come back next week?” |
| 1:48–2:00 | One clean Seeker-native close: MWA, SKR fee discount, and “built for Seeker / ready for dApp Store” only if true. | Ecosystem fit without token theater. |

Use on-screen captions for every state transition. Keep wallet approval screens short; a judge needs to see that the handoff is real, not watch a biometric prompt for 20 seconds. Record a clean fallback take with the transaction signatures and explorer confirmation ready, but do not splice fake success over an unconfirmed flow.

### Features to emphasize

1. **The complete social commitment loop:** Create → Fund → Activate → Claim → Friend Confirm → Settle. This is the product, the network interaction, and the presentation story.
2. **Witnesses, not rivals:** call friends “witnesses,” “confirmers,” or “crew.” Never present a friend’s forfeiture as a prize, and never show a leaderboard of who took the most money.
3. **The recurring loop:** next occurrence, local time with offset, claim window, reminder, and a one-tap route back to the active ritual.
4. **A receipt that explains the money:** returned stake, any forfeited allocation, destination, fee, and network fee as separate lines. The user must be able to see that the protocol is not betting against them.
5. **Human-readable social UI:** names/roles and avatars before wallet addresses. Truncated addresses belong behind a detail affordance.
6. **One real failure path:** a declined wallet approval or late claim should produce a comprehensible state. This is more convincing than pretending all transactions are instant.
7. **The device:** phone-sized layout, haptics/notifications if already stable, deep-link return from the wallet, and an actual APK installed on the Seeker.

### Solana Mobile features: priority order for the remaining days

| Feature | Recommendation | Cost/risk judgment |
|---|---|---|
| MWA | **Must show.** Keep it as the signing path and make the wallet handoff understandable. | Already central; do not replace it. MWA is the standard mobile wallet connection path.[28] |
| Seed Vault | **Show indirectly through the wallet approval.** Say “Seed Vault-backed wallet” only when that is the wallet actually used. | Cheap to demonstrate; direct SDK work is the wrong scope because dApps normally use MWA.[13] |
| SKR | **Use the existing real activation-fee discount.** Show the balance read and the fee branch in one receipt/setting, not as a speculative reward token. | Low incremental cost if the current branch is stable; high credibility value. The organizer wants meaningful SKR use, not distribution theater.[3][19] |
| dApp Store | **Prepare store-ready assets and submission metadata.** Include APK, icon, screenshots, description, support/privacy URLs, and an honest network description. | Worth doing because winners must publish to claim the prize and the store is pre-installed on Seeker.[3][15][16] Do not make store publication the only demo feature. |
| Seeker Genesis Token | **Optional cheap add:** verify ownership and show a non-financial “Seeker crew” badge or one-time device-native template. Do not gate core rituals. | The official docs provide an anti-sybil ownership pattern; a read-only badge is plausible in under ten days, but only if RPC and wallet reads are reliable.[30] Avoid a gimmick that distracts from commitment. |
| `.skr` identity | **Defer.** Use display names and crew names first. | Nice-to-have; not needed to prove Rituals’ core loop. |
| Direct Seed Vault integration | **Do not build.** | Wallet-developer scope; use MWA instead.[13] |
| AI recap | **Only if the confirmed-history path is already green.** Summarize completed rituals and produce a shareable recap; never judge truth. | Optional rubric hedge. Do not trade a reliable lifecycle for decorative AI. |

The Solana Mobile Stack is broader than a token: official docs describe the combination of dApp Store, MWA, SKR, Seeker Genesis Token, Seeker hardware, and Seed Vault.[29] Rituals should show the subset that strengthens its actual commitment behavior.

### Polish bar

The local status notes already identify the visible risks: duplicate titles, narration under everything, developer copy, red normal states, addresses instead of people, four screens to create one ritual, and a broken-looking Suggest surface. These are not secondary cleanup items under CLOCK IN’s UX and presentation criteria.[3]

The final pass should therefore prioritize:

- one clear title per screen;
- one primary action per state;
- no “DEMO MODE,” “deployment ready,” or internal terminology in the hero path except the explicitly labeled accelerated demo clock;
- no raw hex addresses in the first-order UI;
- a calm, social Crew home and a clear active-ritual card;
- consistent normal/success/error colors;
- a short copy pass that removes protocol narration from user-facing surfaces;
- a complete two-wallet test on the actual Seeker before filming.

## 5. Risks that could make judges dismiss Rituals

### 1. It looks like a betting app

This is the existential product risk. Words such as “pot,” “jackpot,” “payout,” “win,” “beat,” “versus,” “opponent,” “odds,” “luck,” or “take your friend’s money” collapse the distinction between a self-directed forfeitable deposit and a wager. The published winner lists contain enough prediction-market and gambling-like products that a judge can pattern-match quickly.[1][2][4]

The broader Radar consumer list shows the same pattern of betting and token-market products.[6]

**Mitigation:** use “your stake,” “recover your stake,” “friends confirm,” “keep your word,” and “no chance, no counterparty.” Show the deterministic rule and the protocol’s separate fee. Never show a reward animation for another member’s failure.

### 2. It is blockchain theater

A token badge, SKR logo, or Seed Vault mention that does not change the user experience will look bolted on. The organizer specifically asks for deep Solana integration and meaningful mobile functionality.[1][24]

**Mitigation:** show the real MWA handoff, real onchain state, real settlement receipt, and real SKR discount. If a feature is not reliable on device, omit it rather than stage it.

### 3. The app is polished in slides but not in the hand

CLOCK IN judges UX, polish, and demo. A flow that needs repeated approvals, exposes internal jargon, or leaves the user unsure whether money moved will lose trust even if the protocol is sound.[3]

**Mitigation:** shorten the signature journey where possible, test wallet return/reload/decline states, and record from the physical Seeker. Do not hide a failed two-wallet path behind a dashboard mock.

### 4. The video starts with implementation instead of value

The judge needs to know what Rituals does before seeing Anchor, RPC, PDAs, or a GitHub tree. A long title sequence or architecture lecture spends the presentation budget without proving product-market fit.

**Mitigation:** active ritual in the first frame; human problem in the first sentence; complete claim/confirmation/settle loop before technical detail.

### 5. The recurring loop is missing

If the demo shows only Create and one transaction, Rituals looks like a one-time escrow primitive. CLOCK IN explicitly asks why users come back.[3]

**Mitigation:** show next occurrence, reminder, crew feed, confirmation inbox, and receipt history. One finished weekly loop is more persuasive than five half-built templates.

### 6. The app overclaims readiness

The local status says MWA Create has landed on the Seeker, while the full two-wallet lifecycle remains the remaining proof gate. The submission should not claim the full loop is proven until that exact flow has been re-run on device.

**Mitigation:** keep the video scope honest. If the full path is not ready, show the proven path and label any accelerated/devnet behavior. Do not fabricate user traction, mainnet use, or store publication.

### 7. SKR or AI displaces the core product

The official CLOCK IN rubric does not require AI, and SKR is an optional separate integration prize.[3] A shallow AI recap or token reward could make a clear commitment product look like rubric chasing.

**Mitigation:** ship the lifecycle and UX first. Keep AI to confirmed facts and SKR to a real fee discount or a genuinely useful, non-speculative perk.

## Bottom line for the submission

Rituals should present itself as a **Seeker-native social commitment device**:

> “Your crew sees whether you showed up. You stake your own money, not against them. Keep the commitment and recover it.”

The winning comparison set is not the prediction-market set. It is Echo’s physical proof, Kinlog’s phone-as-sensor behavior, Cherry’s social identity, NOMI’s simple repeat interaction, and SeekerClaw’s convincing device-native execution.[2]

Make one loop feel finished, humane, and trustworthy. Make the wallet, device, and chain visible exactly where they remove doubt. Everything else is optional.

## Research scope and cross-checks

I also checked the Colosseum Cypherpunk winner list and Solana’s broader hackathon index to avoid treating the two Solana Mobile announcements as the whole ecosystem.[5][8]

The Seeker Season roundup, the Monolith launch post, and the later SKR recap are consistent with a direction centered on mobile-first apps, consumer finance, games, AI agents, and mobile-native social products.[7][21][22]

For historical context, the Solana Renaissance announcement, the Solana Mobile documentation hub, and the current developer landing page were checked for continuity in how Solana Mobile frames consumer apps, publishing, and builder support.[14][18][25]

The historical winner announcement provides an additional cross-check on the mobile-track pattern.[26] The SKR overview and Seeker Tracker were checked as context for the current distribution/incentive environment, but their current metrics are not used as decisive evidence here.[17][23]

OpenAI Build Week is a useful non-Solana comparison: its winners were selected on technical implementation, design/UX, impact, and idea quality, with several winners grounded in a specific lived workflow rather than a generic demo.[31] This supports the same practical lesson for Rituals, but is not evidence about Solana Mobile judges.

Secondary reporting was used only as a cross-check on Monolith and CLOCK IN prize framing; the recommendations above rely primarily on official Solana Mobile, Solana, and Colosseum pages.[9][10][11]

The prize-framing cross-check also included one additional secondary report.[12] The Pi winner announcement was reviewed as a non-Solana comparison source, but it is not used to infer Solana Mobile judging behavior.[27]

## Sources

[1] https://solanamobile.com/blog/solana-mobile-hackathon-winners-announced
[2] https://solanamobile.com/blog/solana-mobile-monolith-hackathon-winners-announced
[3] https://solanamobile.com/blog/clock-in-the-solana-mobile-hackathon
[4] https://blog.colosseum.com/announcing-the-winners-of-the-solana-breakout-hackathon
[5] https://blog.colosseum.com/announcing-the-winners-of-the-solana-cypherpunk-hackathon
[6] https://solana.com/news/solana-radar-winners
[7] https://blog.solanamobile.com/post/seeker-season-10-dapps-you-should-download-right-now
[8] https://hackathons.solana.com
[9] https://solanamobile.radiant.nexus
[10] https://startupfortune.com/solana-mobile-and-radiantsdao-just-showed-what-crypto-native-apps-can-do-on-a-phone
[11] https://solanafloor.com/news/solana-mobile-names-winners-monolith-hackathon-distributes-125k
[12] https://cryptobriefing.com/solana-mobile-clock-in-hackathon-135000-prizes
[13] https://docs.solanamobile.com/solana-mobile-stack/seed-vault
[14] https://docs.solanamobile.com/solana-mobile-stack/seeker
[15] https://docs.solanamobile.com/solana-mobile-stack/dapp-store
[16] https://docs.solanamobile.com/dapp-store/submit-new-app
[17] https://solanamobile.com/skr
[18] https://solanamobile.com/developers
[19] https://solanamobile.com/blog/solana-mobile-builder-grants-bring-your-best-seeker-and-skr-ideas
[20] https://solana.com/tr/news/solana-grizzlython-winners
[21] https://solanamobile.com/blog/the-monolith-solana-mobile-hackathon
[22] https://solanamobile.com/blog/skr-season-1-claims-wrap-monolith-crowns-winners-and-seeker-goes-shopping
[23] https://seekertracker.com
[24] https://solanamobile.com/blog/the-solana-mobile-hackathon-is-here
[25] https://solanamobile.com/blog/solana-mobile-documentation-hub-ais7f
[26] https://solana.com/news/solana-renaissance-winners
[27] https://minepi.com/blog/hackathon-2025-winners
[28] https://docs.solanamobile.com/solana-mobile-stack/mobile-wallet-adapter
[29] https://docs.solanamobile.com/solana-mobile-stack/overview
[30] https://docs.solanamobile.com/solana-mobile-stack/seeker-genesis-token
[31] https://developers.openai.com/blog/build-week-winners
[32] https://revenuecat-shipaton-2026.devpost.com
