/** Native MWA errors may put the exception in the name, code, or message. */
function matchesWalletError(error: unknown, pattern: RegExp): boolean {
  try {
    if (!error || typeof error !== 'object') return false
    return ['name', 'code', 'message'].some((key) => {
      const value = (error as Record<string, unknown>)[key]
      return typeof value === 'string' && pattern.test(value)
    })
  } catch { return false }
}

export const isWalletTimeout = (error: unknown): boolean => matchesWalletError(error, /TimeoutException|TimeoutError|timed?\s*out|timeout/i)
export const isWalletCancellation = (error: unknown): boolean => matchesWalletError(error, /CancellationException|cancel{1,2}ed/i)
