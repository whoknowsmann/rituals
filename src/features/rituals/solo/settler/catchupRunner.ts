import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import type { PublicKey } from '@solana/web3.js'
import type { RitualBundleRead } from '../../../../data/rituals/ritualsRpc'
import { ritualsForWallet } from '../../home/homeSections'
import { autoSettleWeek, type AutoSettleInput } from './autoSettle'
import { settlerCanPay } from './settlerBudget'

export type CatchupLock = { current: boolean }
export type CatchupFailures = Map<string, number>
// Shared across Home/detail mounts, including a send still confirming after blur.
const runningRituals = new Set<string>()
export const catchupFailures: CatchupFailures = new Map()
export const failureKey = (bundle: RitualBundleRead): string => `${bundle.ritual.address.toBase58()}:${bundle.ritual.account.currentEventIndex}`
export function overdue(bundle: RitualBundleRead, now: number | null): boolean {
  const account = bundle.ritual.account
  const window = account.schedule[account.currentEventIndex]
  return account.kind === 'Solo' && account.status === 'Active' && now !== null && Boolean(window) && now > Number(window.resolution)
}

type Input = Omit<AutoSettleInput, 'eventIndex' | 'needsEventInit' | 'destinationTokenAccounts' | 'mayContinue'> & {
  bundle: RitualBundleRead
  lock: CatchupLock
  failures: CatchupFailures
  now: () => number | null
  mayContinue: (bundle: RitualBundleRead) => boolean
  getBalance: () => Promise<number>
}
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** No history/UI reload between weeks. Never send the next week before readback advances. */
export async function runCatchup(input: Input, settle = autoSettleWeek, wait = pause): Promise<{ changed: boolean; blocked: boolean; deferred?: boolean }> {
  const id = input.ritualAddress.toBase58()
  if (input.lock.current || runningRituals.has(id)) return { changed: false, blocked: false, deferred: true }
  input.lock.current = true
  runningRituals.add(id)
  let bundle = input.bundle
  let changed = false
  try {
    if (!overdue(bundle, input.now()) || !input.mayContinue(bundle)) return { changed, blocked: false }
    // Another screen may have finished a send while this snapshot was loading.
    const fresh = await input.client.getRitualBundle(input.ritualAddress, { minContextSlot: bundle.slot })
    changed = fresh.ritual.account.currentEventIndex !== bundle.ritual.account.currentEventIndex
    bundle = fresh
    while (overdue(bundle, input.now()) && input.mayContinue(bundle)) {
      const key = failureKey(bundle)
      if ((input.failures.get(key) ?? 0) >= 3) return { changed, blocked: true }
      try {
        const needsEventInit = bundle.event === null
        const balance = await input.getBalance()
        if (!input.mayContinue(bundle)) break
        if (!settlerCanPay(balance, needsEventInit)) return { changed, blocked: true }
        const index = bundle.ritual.account.currentEventIndex
        const account = bundle.ritual.account
        const result = await settle({ ...input, eventIndex: index, needsEventInit,
          destinationTokenAccounts: account.members.map((member) => getAssociatedTokenAddressSync(account.stakeMint, member)),
          mayContinue: () => input.mayContinue(bundle),
        })
        if (!input.mayContinue(bundle)) { changed ||= result.ok; break }
        // A failed/uncertain response may already have landed. Read before any retry.
        changed ||= result.ok
        let next = await input.client.getRitualBundle(input.ritualAddress, { minContextSlot: bundle.slot })
        if (result.ok) {
          for (let attempt = 0; next.ritual.account.currentEventIndex <= index && next.ritual.account.status === 'Active' && attempt < 2; attempt++) {
            if (!input.mayContinue(bundle)) return { changed, blocked: false }
            await wait(1000)
            next = await input.client.getRitualBundle(input.ritualAddress, { minContextSlot: bundle.slot })
          }
        }
        if (next.ritual.account.currentEventIndex > index || next.ritual.account.status !== 'Active') {
          changed = true
          bundle = next
          continue
        }
        // Confirmation succeeded but this node has not caught up: do not resend.
        if (result.ok) { input.failures.set(key, 3); return { changed, blocked: true } }
        bundle = next
      } catch { /* bounded retry; a fresh snapshot below reconciles uncertain sends */ }
      if (!input.mayContinue(bundle)) break
      input.failures.set(key, (input.failures.get(key) ?? 0) + 1)
      if ((input.failures.get(key) ?? 0) >= 3) return { changed, blocked: true }
      await wait(3000)
      if (!input.mayContinue(bundle)) break
      try {
        const next = await input.client.getRitualBundle(input.ritualAddress, { minContextSlot: bundle.slot })
        changed ||= next.ritual.account.currentEventIndex > bundle.ritual.account.currentEventIndex
        bundle = next
      } catch { return { changed, blocked: true } }
    }
    return { changed, blocked: false }
  } catch {
    return { changed, blocked: true }
  } finally {
    input.lock.current = false
    runningRituals.delete(id)
  }
}

/** Home never touches another wallet's rituals, and drains one ritual at a time. */
export async function runWalletCatchup<T extends { bundle: RitualBundleRead }>(rituals: readonly T[], wallet: PublicKey | null, mayContinue: () => boolean, run: (ritual: T) => Promise<unknown>): Promise<void> {
  for (const ritual of ritualsForWallet(rituals, wallet)) {
    if (!mayContinue()) return
    await run(ritual)
  }
}
