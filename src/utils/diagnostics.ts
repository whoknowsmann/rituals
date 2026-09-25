/**
 * Developer diagnostics for failures the UI deliberately hides.
 *
 * User-facing copy never includes raw errors (they can carry RPC URLs or
 * transaction internals). That also made on-device failures undiagnosable:
 * "Could not create the ritual" with no cause. This logs only the error's name
 * and a truncated message under one grep-able tag, visible via
 * `adb logcat -s ReactNativeJS` — never keys, payloads, or signatures.
 */
export function logFailure(stage: string, error: unknown): void {
  let name = 'unknown'
  let message = ''
  try {
    if (error instanceof Error) { name = error.name; message = error.message }
    else if (error && typeof error === 'object') { name = String((error as { code?: unknown }).code ?? 'object'); message = String((error as { message?: unknown }).message ?? '') }
    else { message = String(error) }
  } catch { /* hostile error */ }
  console.warn(`[rituals] ${stage} failed: ${name}: ${message.slice(0, 300)}`)
}
