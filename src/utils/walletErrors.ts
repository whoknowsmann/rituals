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
/** The wallet's own JSON-RPC answer: the native 'JSON_RPC_ERROR' code, or a numeric MWA/EIP-1193 code. */
export const isWalletRpcError = (error: unknown): boolean => {
  try { const code = (error as { code?: unknown } | null)?.code; return code === 'JSON_RPC_ERROR' || typeof code === 'number' } catch { return false }
}
