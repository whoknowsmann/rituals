# Rituals · warmer UI iterations

All three directions keep the Crew system from `DESIGN.md`: warm paper `#F4EFE6`, Fraunces 900 display, Figtree UI, lime primary, host-colour ritual posters, coloured member tiles, quiet TEST copy, witness—not rival—language, and a dark action dock. Each HTML file is a self-contained 390×844 phone-frame sketch with a screen rail for six reachable states.

## 01 · Hand-made

**Warmth moves (five specific changes)**
1. Add a very low-contrast SVG `feTurbulence` paper grain over the warm background and a slightly uneven ink edge on cards/posters.
2. Circle the current week and important dates with hand-drawn SVG loops rather than perfect UI outlines.
3. Use a small Caveat annotation layer for human notes like “Sam said he’ll meet you at 6:30” and “leave room for a bad day”. Fraunces/Figtree remain the structural type.
4. Turn completion into an ink stamp moment (`SHOWED UP`) and use tiny rotated paper stickers for witness confirmations.
5. Make the missed-week state compassionate and physical: a crossed-out empty square, a note from the crew, and one clear “start again” action instead of a red failure card.

**Build cost in this codebase**
Low. Grain, marks, stamps, rotation, and the rail are CSS/SVG. `react-native-svg` can reproduce the circles, underlines, and stamp; `react-native-reanimated` can animate the stamp in after the existing hold gesture; `expo-haptics` can fire on hold start and stamp completion. Caveat would need an additional bundled font or a handwritten system fallback.

**Risks**
Too many marks can become craft-store decoration or reduce scanability. Grain must stay subtle and should not sit under text at high contrast. Handwritten copy must remain short and accessible to screen readers.

## 02 · Proof & people

**Warmth moves (five specific changes)**
1. Make the check-in proof the hero: a camera-shaped proof card with Jack’s “river path / open mat” moment, not a generic status panel.
2. Present the activity feed as a group chat: message bubbles, timestamps, initials, and short replies from Sam and Maya.
3. Let witnesses react with small emoji/sticker chips (“👏”, “I saw you”, “🔥”) after confirming; the reaction is social acknowledgement, not a score.
4. Show real-looking initials and names everywhere—Jack, Sam, Maya, and Dad—rather than addresses or anonymous member 2 labels.
5. Give the missed state a humane group reply (“Want to take Thursday as a reset?”) and preserve the thread, so a lapse is part of the relationship rather than a dead end.

**Build cost in this codebase**
Medium. Chat bubbles, avatar tiles, reaction chips, and local fake proof states are straightforward RN views. A real camera capture would add `expo-camera` (or the platform camera module), permission handling, image persistence, and a proof upload/verification decision. Keep a “choose from library” or demo placeholder fallback until that dependency is accepted.

**Risks**
Photo proof can imply that the app adjudicates truth; copy must say “share proof with your witnesses,” never “AI verified.” Camera permission friction can block the core loop. Emoji reactions could feel like a leaderboard if counts or rankings appear.

## 03 · Ritual object

**Warmth moves (five specific changes)**
1. Give each ritual a generated SVG emblem built from category + host colour: a phone/sun for Call Mom, a path/runner for Run with my brother, and a mat/star for Open mat Thursdays.
2. Replace the abstract week strip with a tactile punch card: four paper cells, punched holes, and one outlined current punch.
3. Make the ritual poster feel like an object with a little serial number, keeper name, and “kept by Jack + Sam” line.
4. Use a receipt-like settlement view with perforated edge, itemized “stake returned,” and a stamped “back in your wallet” line.
5. Let witnesses sign the object with an initial badge and a short note, so confirmation leaves a trace that can be revisited.

**Build cost in this codebase**
Low–medium. The emblems are inline SVG paths/shapes and map cleanly to `react-native-svg`; punch-card state is ordinary view state; receipt is a normal RN layout. Reanimated can animate a punch hole appearing and a receipt sliding up. No new native dependency is required.

**Risks**
An emblem generator can become visual noise or imply categories the user did not choose. The object metaphor must not hide the primary action or make TEST look like a financial statement. Keep the large type and dark dock from Crew.

## Recommendation

Combine **Proof & people’s chat/feed + Hand-made’s restrained paper grain and annotations + Ritual object’s emblem and settlement receipt**. Use proof as the one loud thing on check-in day, the emblem as persistent ritual identity, and hand-made marks only at commitment moments. Do not combine all three heroes on one screen. The strongest demo sequence is: a friendly illustrated home → tap Open mat → hold to check in → share a proof moment → Sam confirms with “I saw you” → receipt shows the stake returned. Build the camera as an optional follow-on; ship a proof card with a local image/placeholder first so the core witness loop stays dependable.

## Rendered review images

- `handmade.png`
- `proof-people.png`
- `ritual-object.png`

The images are generated from the three HTML files at a 430×1000 review viewport; each contains the requested 390×844 phone frame. The browser used the local file loader. No app source code was modified.
