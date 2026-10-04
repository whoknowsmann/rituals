/** Long enough to feel the button fill (Jack, 2026-10-03), short enough not to drag. */
export const HOLD_DURATION_MS = 1400

export function holdProgress(elapsedMs: number, durationMs: number = HOLD_DURATION_MS): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1
  return Math.min(1, elapsedMs / durationMs)
}

export function shouldUseTapFallback(screenReaderEnabled: boolean): boolean {
  return screenReaderEnabled === true
}

/** How many of the 25 / 50 / 75 % marks a progress step crossed (for haptic ticks). */
export function quartersCrossed(previous: number, next: number): number {
  if (!(next > previous)) return 0
  return [0.25, 0.5, 0.75].filter((mark) => previous < mark && next >= mark).length
}
