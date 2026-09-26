# Crew home implementation plan

## Slice

Rebuild `RitualsHomeScreen` in the Crew/C2 language using the existing authoritative ritual bundle loader, and add an un-wired reusable `HoldButton` with a tested hold-progress helper.

## Files

- `src/screens/RitualsHomeScreen.tsx`: loading/error/empty states, poster for the selected ritual, claim feed derived from bundle event/claims, and existing create/join/detail routes.
- `src/components/crew/HoldButton.tsx`: accessible press-and-hold control with a 700 ms animated progress fill and screen-reader tap fallback.
- `src/components/crew/holdButtonLogic.ts`: pure duration/progress/fallback helpers.
- `src/components/crew/HoldButton.test.ts`: pure helper unit tests.
- `src/components/crew/index.tsx`: re-export the standalone HoldButton without changing the existing crew kit API.
- `docs/DESIGN.md`: record the implemented home-screen slice and the deliberate no-wiring-yet boundary.

## Acceptance criteria

- Home uses light warm Crew tokens, host colour `memberColor(0)`, poster + crew feed, and no developer/explainer copy in primary UI.
- Feed entries are computed only from `loadKnownRitualBundles` event/claim data; unavailable data gets an honest empty state.
- `Start a ritual`, `Join with a link`, and existing ritual detail navigation remain wired.
- Loading/error retry behavior and safe error copy remain accessible and test-compatible.
- HoldButton exposes button role/hint, completes after about 700 ms, cancels early release, and invokes a tap fallback when `AccessibilityInfo.isScreenReaderEnabled()` resolves true. It is not wired into claiming.

## Verification

Run focused HoldButton tests, `npx tsc --noEmit`, `npx vitest run`, and `npx expo export --platform android --output-dir "$TMPDIR/crew-export"`. Do not use adb or the connected phone; visual verification is optional and may be reported as skipped.

## Limitations

The authoritative bundle has member keys and claim status but no profile names or timestamps, so the feed uses deterministic `Host`/`Friend N` labels and omits invented timing or notes. Solo rituals remain out of scope.
