# Deck review: Rituals, CLOCK IN (2026-10-08, submitting tonight)

Review only; the deck and build.py are untouched. Checked against FACTS, README, STATUS, the 10-07/10-08 overnight reports, the eject smoke logs and the git log. I can't view images, so shot picks come from filenames, your descriptions and file times.

## 1. Verdict
- Works: the argument is tight and honest (a stake you can lose where a reminder fails; "Rituals takes nothing"; devnet said plainly; "That's a week, not a verdict."), and the lines trace to FACTS.
- Weak: eight text-only slides for a visual app; old 4 and 6 read like a changelog (settle key, test counts); and the build has moved past both the deck and FACTS (section 5).
- Biggest fix: a real phone beside every explaining slide, cut to six. The screenshots carry the loop, and the words shrink to a handful of short lines.

## 2. Proposed deck: six slides
"|" = line break on the slide; the first line is the big headline. Merge map: old 1+2 → 1 · old 3 → 2 · old 5 + the receipts from 3 + the "landed" proof from 6 → 3 · old 7 → 4 · old 4 + the Seeker lines of 6 → 5 · old 8 → 6.
Take shots from one ritual where you can: the video tells one story (stamp week 1, miss week 2) and the deck should tell the same one.

### 1. Rituals (dark title; old 1+2)
On slide: Rituals | Show up, or pay up. | Put a stake on a weekly promise. Keep it and you get it back. | Reminders get ignored. A stake you can lose doesn't.
Image: d32-home.png, phone at right, 5.5 in tall (about 20% of slide width).
Say: Rituals is a commitment app for Solana Seeker: stake something on a weekly promise, stamp the week to get it back, and a missed week goes where you chose, all on devnet.

### 2. How it works (old 3, plus the Demo speed line from old 7)
On slide: Lock it in. Hold to stamp. | Name it. Pick weeks. Set a stake. | Choose where a miss goes. | One approval locks it in. | One more for each stamp. | Demo speed: a week is 1 minute. | Real weeks: seven days.
Images: two phones at right, 5 in tall (about 38% of width together): d27-step2.png, then a NEW d32 capture of the ritual screen ("Ns left", HOLD TO STAMP, a short punch card).
now-jack.png is that screen, but it sits just before d32 in time and the NOW-wrap fix credits "Jack's screenshot, 10-08": probably the bug shot. Look at it; if NOW wraps, retake during tonight's video run.
Say: Two steps and one approval lock every week's stake in a vault; then each week you hold the button for 1.4 seconds, approve once, and get YOU SHOWED UP!.

### 3. Money is honest (old 5, plus the receipts from old 3 and the proof from old 6)
On slide: One promise. Both outcomes. | Show up: your stake comes back. | Miss a week: that week's stake goes where you chose. | Rituals takes nothing. | On a Seeker, 10 tSKR landed in the wallet you chose.
Images: two phones at right, 5 in tall: d27-receipt-w1.png (KEPT), d27-receipt-w2.png (MISSED). STATUS suggests d27's miss went to a bare wallet ("fT9Xe…"), which reads worse than a cause. Stills from tonight's shelter run are clearer; if you swap, reword the last line to match.
Say: Show up and your stake comes back; miss and it goes where you chose, which on a real Seeker run was 10 tSKR landing in the chosen wallet (9.125 to 19.125, read from the chain), and Rituals takes nothing either way.
After FACTS has an End early entry, add one line: End early: weeks you haven't missed come back.

### 4. Why it sticks (old 7)
On slide: A reason to open it every week. | One job a week: stamp it. | Home shows how much of your stake is back. | Every closed week leaves a receipt. | Real weeks remind you: opens, one day left, last hour.
Image: d32-finished.png, phone at right, 5.5 in tall (if it looks too much like slide 1, use d27-read-finished.png, the ✓ ✕ punch card).
Say: One job a week, a receipt for every closed week, reminders on Real weeks: we have no retention data and claim none, only that a stake that comes back is a reason to return.

### 5. Built for Seeker (old 4, plus the Seeker lines of old 6)
On slide: Built for the Seeker. | Seed Vault Wallet: double-tap, fingerprint. | One approval to start, one per stamp. | A capped settle key (0.05 SOL max) closes weeks. | Week times are on chain. Nobody clicks through. | Proven on a Seeker, Android 16. Anchor program, devnet.
Image: none. Wallet screens record black, and a mock-up is worse than no picture. Once End early is in FACTS, d31-end-1.png with "End early shows what comes back before you sign." fits here.
Say: Every approval is Seed Vault Wallet's double-tap and fingerprint on a Seeker, and a small capped settle key closes finished weeks on the ritual screen, so you approve only to start and to stamp.

### 6. The ask (dark; old 8)
On slide: Publish it on the Solana dApp Store. | Try it: install the APK, set Seed Vault Wallet to Devnet, tap Get test tokens. | Next: friends, a witness, real donation rails. | rituals.whoknowsman.com | github.com/whoknowsmann/rituals
Image: none. Add the video URL once it exists. Check every link logged out (the repo is private until you flip it).
Say: Friends, a witness and Seasons are built but hidden until polished, donation rails and photo proof come next, mainnet stakes come after legal and security review, and we ask for a place on the Solana dApp Store.

## 3. Cut entirely
- Old 2 and old 6 as slides: the thesis is one line on new 1; old 6 is a changelog, and its useful facts now sit on new 3 and 5.
- "2,420 TypeScript tests. 206 native program tests.": stale (section 5), and no judge scores it. Let the README carry a re-measured number.
- "upgraded October 4" and the three-smokes sentence (old 6 Say): process detail, and the date is wrong. "account rent that returns when the ritual closes" (old 5 Say, Q&A): unsupported (section 5).
- "so you never sign bookkeeping": jargon, and "never" overreaches (the wallet fallback and End early both ask you to sign).
- "Seasons" and "photo proof" from the on-slide next line (each needs a sentence to explain; keep them in the Say), and presenter filler ("I will say that again where it matters").

## 4. Layout and build.py
- Frame: plain ink bezel (0.07 in, #1D1A16), 0.28 in radius, soft shadow, no stock device mock-up; #2B2B2B bezel on dark slides. Phones at the right, text at the left, on every image slide.
- Size: one phone 5.5 in tall (about 2.5 in wide); two phones 5 in tall with a 0.25 in gap. Max 2 per slide. On image slides h1 40 pt and body 22 pt: that gives about 49 characters a line with one phone and only 34 with two, so keep 2-up lines short.
- Colour: paper #F4EFE6 on slides 2-5, lime only on the dark title and closing slides (as now). build.py's lime and ink are a hair off DESIGN.md (#C8F560 vs #C8F169; #1B1A17 vs #1D1A16): align them. MISSED captions in quiet grey, never red.
- Footer (required, it replaces the old "Devnet. tSKR token, no value." line): make it "... · devnet, tSKR has no value" so the disclaimer rides every slide and the body lines stay short.
- Code, about 25 min: (1) parse(): `imgs = re.findall(r'\*\*Image:\*\*\s*(.+)', rest)`, split on commas; put `**Image:** a.png, b.png` under the "## Slide" heading, before "**On the slide:**", so the existing line parser never sees it.
  (2) render(): if imgs, add classes `has-shot` (+ `two` for 2), wrap kicker/h1/lines in `<div class="text">`, append `<div class="shots"><img src="file://ABS"></div>`. The title slide gets the same wrapper.
  (3) CSS, 8 rules: `.has-shot{display:flex;align-items:center;gap:.7in}` `.text{flex:1;min-width:0}` `.has-shot h1{font-size:40pt}` `.has-shot .lines p{max-width:none;font-size:22pt}` `.shots{display:flex;gap:.25in;flex:none}`
  `.shots img{height:5.5in;border:.07in solid #1D1A16;border-radius:.28in}` `.two img{height:5in}` `.slide.dark .shots img{border-color:#2B2B2B}`. (4) main(): exit 2 on a missing image, like the fonts.
- Optional, +15 min: `path | caption` for small KEPT / MISSED captions; lines starting `~ ` render small (the program address); `==phrase==` becomes a lime highlight (`<mark>`) behind one phrase per slide.
- Export: if the PDF passes ~15 MB, scale the PNGs to 800 px wide (`ffmpeg -vf scale=800:-1`). Eyeball every page for overflow (the 2-up text column is only ~5.5 in) and stray status-bar icons in the shots.

## 5. Stale or unsupported vs FACTS / d32
- End early: STALE (omission). It is in the tree (d31-end-1/2) and on devnet (program upgraded 10-07, three app-path smokes green: default, --settle-week-1, --miss-week-1), yet absent from README, form and deck, and from FACTS except the word "eject" inside the Home money line.
  Fix: a FACTS entry first (the only phone proof I found is the d31 confirmation screens), then one line on new 3 and a Q&A "Can I quit early?": Settings, Your rituals, End early; you see what comes back, type the name, approve once; weeks you haven't missed come back, a missed week stays missed. The release APK must be d31+ (d27 and older drop an Ended ritual from Home).
- Total stake, destination choice, 1-minute demo weeks: OK as written. Say "demo" wherever a cause is named (devnet token accounts, not charities). docs/submission/shots.json (video captions) still says 2-minute weeks and four weeks at five.
- Reminders: OK for Real weeks (device-proven 10-06 09:12). The d28 follow-up (Demo-week reminders, Settings switch, Android categories) is source-verified only in FACTS: keep the d28 shots out, and README "Real weeks only" no longer matches the build.
- rituals.whoknowsman.com: OK in the wallet line (FACTS 10-06; delete the old "github.com" gap line still in FACTS), but no slide links it. New 6 does. Link that host only; whoknowsman.com is the "Private for now" page.
- Test counts: STALE. Deck 2,420 TS / 206 native vs 2,614 TS / 151 files (home-polish report, 10-08) and 224 native (eject review); FACTS itself holds both 2,275 and 2,420. Cut them, or re-run both suites at export and update FACTS, README, form, release notes and deck together.
- Program date: STALE. "Upgraded October 4" (also README and FACTS, slot 507505707). Upgraded again 10-07 for End early: slot 508611515, tx 2AVGDfU2…. Fix or drop.
- Rent: UNSUPPORTED. "Rent returns when the ritual closes" (old 5 Say, Q&A, also README, FACTS and form). The 10-07 bughunt says the app never calls close_terminal_vaults (not fixed); only End early closes the vaults. Say "network fees, account rent and the settle-key pre-payment".
- Create step 1 and Home (FACTS, README): both still describe suggestions; since 10-07 step 1 is your own name plus an optional "what counts" line (check whether the "to read" → "Read" cleaning still runs; its test remains). "1 of 4 kept" became "X of Y tSKR back" and "Finished · N", which FACTS still calls unwalked. New 4 leans on it: record the d32 walk.
- Proof (old 6): the 10 tSKR landing is the d26 run (10-06 15:05); the release build is d32 or later. Re-cite tonight's recording run.
- Security judges: docs/SECURITY.md line 9 still says device MWA signing is "not yet proven". They will ask what the settle key can do; dapp-store-listing.md line 94 already says "only runs the open and settle steps, which anyone is allowed to run". Move that into FACTS and Q&A.
- pitch-deck.md header ("Eight slides… d27") needs the new count and build.

## Order of work tonight (about 75 min)
FACTS fixes (End early, step 1, Home, tests, rent) 15 · rewrite pitch-deck.md 20 · build.py 25 · captures during the video run · render, eyeball every page, logged-out link check 15.
