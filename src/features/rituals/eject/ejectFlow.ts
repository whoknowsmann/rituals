import type { PublicKey } from '@solana/web3.js'
import type { RitualAccountView } from '../../../data/rituals/accounts'
import type { EjectAmounts } from '../../../data/rituals/ejectQuote'
import { formatAtomic } from '../displayFormat'

export type EndableRitual = Readonly<{ address: string; title: string }>
type LoadedRitual = Readonly<{ address: string; title: string; bundle: Readonly<{ ritual: Readonly<{ account: Pick<RitualAccountView, 'kind' | 'status' | 'creator'> }> }> }>

/** Settings lists the active solo rituals on this phone that the connected wallet made. */
export function endableRituals(loaded: readonly LoadedRitual[], wallet: PublicKey | null): readonly EndableRitual[] {
  if (!wallet) return Object.freeze([])
  return Object.freeze(loaded
    .filter(({ bundle: { ritual: { account } } }) => account.kind === 'Solo' && account.status === 'Active' && account.creator.equals(wallet))
    .map(({ address, title }) => Object.freeze({ address, title })))
}

export type EjectRow = Readonly<{ label: string; value: string }>

/**
 * One money fact: what comes back now (Jack, 2026-10-09). A missed week's stake
 * is that week's history and stays on its receipt, even when this transaction is
 * what settles it (a lapsed, unstamped week not yet closed); Back to you already
 * leaves it out.
 */
export function ejectRows(amounts: Pick<EjectAmounts, 'backToYou' | 'pendingForfeit'>, decimals: number): readonly EjectRow[] {
  const rows: EjectRow[] = [Object.freeze({ label: 'Back to you', value: formatAtomic(amounts.backToYou, decimals) })]
  // This transaction also settles a lapsed, unstamped week: say so (Hermes, 2026-10-09 — no silent transfer).
  if (amounts.pendingForfeit > 0n) rows.push(Object.freeze({ label: 'Missed week, sent', value: formatAtomic(amounts.pendingForfeit, decimals) }))
  return Object.freeze(rows)
}

export const ejectTitle = (name: string): string => `End ${name} early?`

/** Typing the ritual's name enables the last button; case and outer spaces do not matter. */
export function nameConfirmed(typed: string, name: string): boolean {
  const wanted = name.trim().toLocaleLowerCase()
  return wanted.length > 0 && typed.trim().toLocaleLowerCase() === wanted
}
