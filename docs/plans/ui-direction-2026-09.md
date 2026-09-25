# UI direction research (2026-09-25)

Why the current app reads as "AI-coded", what the research says, and three
directions sketched for Jack to pick from. Sketches: `sketches/ui-2026-09/`
(serve with `python3 -m http.server 8765` in that folder, then
`./scripts/adb.sh reverse tcp:8765 tcp:8765` and open http://127.0.0.1:8765 on the phone).

## Diagnosis of the current UI (from device screenshots)

- Every screen is the same template: page title, grey subtitle, stack of
  identical dark rounded cards, full-width pill button. Material/Paper defaults
  with a gold swap. That sameness *is* the AI tell.
- System font only; no typographic voice. Headline and body differ by size alone.
- Explanatory copy under everything ("Everyone reviews the same terms before any
  onchain funding"). The app narrates itself instead of showing state.
- Red used for normal states; developer strings leak (DEMO MODE, Deployment ready).
- Addresses instead of people. No faces, no colour per member.
- Zero motion or haptics. Nothing happens when you do the one thing the app is
  for (check in).
- Four screens for creating one ritual.

## What the research says

- "AI slop" is statistical averaging under vague direction: default fonts
  (Inter/Roboto), identical card grids, gradient + glass, a bounce on
  everything. The fix is making decisions: one typeface pairing with character,
  one loud thing per screen, and a written design spec the builder follows
  (smoothui.dev, ui-ux-pro-max, Muzli/8080.ai, MindStudio, 2026).
- The 2026 patterns that are actually shipping are structural, not visual:
  surface the user's most common action first, gesture/haptic feedback that
  confirms an action before the eyes do, progressive disclosure (Muzli, Apr 2026).
- Craft signal in RN specifically comes from Reanimated + Skia + haptics:
  Callie (Expo "Most Creative App" 2025) did it as a one-person team, using motion
  that responds to input rather than canned Lottie (Expo blog, Jan 2026).
- Streak/commitment apps: the streak alone isn't retention; recovery and social
  context are. Headspace frames a miss as recoverable; Strava's social layer
  sustains streaks; Duolingo's freezes give 4.5x longer streaks (Trophy, 2026).
  For Rituals, this maps to friends-as-witnesses and a humane "missed" state.

## Three directions (each a stance, not a colour swap)

A. The Receipt — the commitment as a physical ticket. Instrument Serif +
   JetBrains Mono, paper on black, week boxes, a rubber stamp on check-in.
   Serious and crafted; the money feels real. Weakest at warmth.

B. The Ring — one big number and a segmented progress ring, chunky 3D button,
   streak flame, confetti + haptics on check-in. Bricolage Grotesque. Most
   dopamine; closest to Duolingo/Opal. Risk: reads as a game about money.

C. The Crew — light theme, a feed of friends showing up, colour per person,
   sticky "Your turn" dock, confirm-a-friend inline. Fraunces + Figtree. Most
   on-message for "friends are witnesses", most unlike a crypto app.

All three share: one hero per screen, people not addresses, the check-in as the
primary action with motion + haptics, and almost no explanatory copy.

## Implementation notes (whichever wins)

Expo SDK 52 bundles everything needed without an SDK change:
expo-font (+ @expo-google-fonts), react-native-reanimated ~3.16,
@shopify/react-native-skia 1.5, expo-haptics, react-native-svg, expo-linear-gradient.
Write the chosen direction as a short DESIGN.md (type scale, palette, the one
loud element per screen, motion rules) before touching screens, then rebuild
screens against it and review each on-device by screenshot.
