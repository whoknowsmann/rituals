export const HOLD_DURATION_MS = 700

export function holdProgress(elapsedMs: number, durationMs: number = HOLD_DURATION_MS): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1
  return Math.min(1, elapsedMs / durationMs)
}

export function shouldUseTapFallback(screenReaderEnabled: boolean): boolean {
  return screenReaderEnabled === true
}
