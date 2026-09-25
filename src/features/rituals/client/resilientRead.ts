/**
 * Bounded retry for READ-ONLY RPC calls.
 *
 * Public RPC endpoints are load-balanced: immediately after a transaction
 * confirms, the next read can land on a node that has not reached the
 * confirmation slot yet ("Minimum context slot has not been reached", JSON-RPC
 * -32016), or be rate-limited (429). Without a retry, the client's
 * authoritative readback reports a transaction that DID land as unconfirmed.
 *
 * Only idempotent reads may be wrapped. Never wrap sendTransaction or
 * signAndSendTransaction: retrying a submission can double-submit.
 */

export type ReadRetryOptions = Readonly<{
  attempts?: number
  baseDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}>

const TRANSIENT_PATTERNS = [
  '429',
  'too many requests',
  'minimum context slot',
  '-32016',
  'fetch failed',
  'network request failed',
  'econnreset',
  'etimedout',
  'socket hang up',
  '502',
  '503',
  '504',
]

export function isTransientRpcError(error: unknown): boolean {
  if (error !== null && typeof error === 'object') {
    const code = (error as { code?: unknown }).code
    if (code === -32016 || code === 429) return true
  }
  let message: string
  try {
    message = error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : String(error)
  } catch {
    return false
  }
  const lower = message.toLowerCase()
  return TRANSIENT_PATTERNS.some((pattern) => lower.includes(pattern))
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function withReadRetry<A extends unknown[], R>(
  read: (...args: A) => Promise<R>,
  options: ReadRetryOptions = {},
): (...args: A) => Promise<R> {
  const attempts = Math.max(1, options.attempts ?? 5)
  const baseDelayMs = options.baseDelayMs ?? 400
  const sleep = options.sleep ?? defaultSleep
  return async (...args: A): Promise<R> => {
    let lastError: unknown
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await read(...args)
      } catch (error) {
        lastError = error
        if (!isTransientRpcError(error) || attempt === attempts - 1) throw error
        await sleep(baseDelayMs * 2 ** attempt)
      }
    }
    throw lastError
  }
}

type FeeResponse = Readonly<{ context: { slot: number }; value: number | null }>
type FeeConfig = Readonly<{ commitment?: string; minContextSlot?: number }> | string | undefined

/**
 * getFeeForMessage that honours minContextSlot.
 *
 * web3.js 1.x takes a commitment string for this call, so a config object's
 * minContextSlot never reaches the server. Public devnet load-balances reads,
 * so the fee often comes from a node behind the one that issued the blockhash;
 * the preparer then (correctly) rejects it as "fee context is stale" and Create
 * fails before the wallet ever opens. Re-ask until a node at or past the slot
 * answers. Read-only, so retrying is safe.
 */
export function feeForMessageAtSlot(
  getFee: (message: unknown, commitment?: string) => Promise<FeeResponse>,
  options: ReadRetryOptions = {},
): (message: unknown, config?: FeeConfig) => Promise<FeeResponse> {
  const attempts = Math.max(1, options.attempts ?? 8)
  const baseDelayMs = options.baseDelayMs ?? 250
  const sleep = options.sleep ?? defaultSleep
  const read = withReadRetry(getFee, options)
  return async (message, config) => {
    const commitment = typeof config === 'string' ? config : config?.commitment
    const minSlot = typeof config === 'object' && config !== null ? config.minContextSlot : undefined
    let last: FeeResponse | undefined
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      last = await read(message, commitment)
      if (minSlot === undefined || last.context.slot >= minSlot) return last
      await sleep(baseDelayMs * (attempt + 1))
    }
    return last as FeeResponse
  }
}
