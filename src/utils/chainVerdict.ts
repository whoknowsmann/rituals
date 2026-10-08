/**
 * After a wallet sheet is cancelled once signing began, only the chain can say
 * whether the action went through. The screen's background check reports its
 * first answer here; the "Network mismatch?" hint waits for it.
 */
let pending: ((landed: boolean) => void) | null = null

/** True only if the chain shows the action landed; false after `waitMs` without an answer. */
export function awaitChainVerdict(waitMs: number): Promise<boolean> {
  pending?.(false)
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = (landed: boolean) => {
      if (timer !== undefined) clearTimeout(timer)
      if (pending === settle) pending = null
      resolve(landed)
    }
    pending = settle
    timer = setTimeout(() => settle(false), waitMs)
  })
}

/** The chain's first answer for the action whose wallet sheet was cancelled. */
export function reportChainVerdict(landed: boolean): void {
  pending?.(landed)
}
