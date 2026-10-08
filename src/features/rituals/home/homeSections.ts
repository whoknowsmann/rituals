import type { RitualBundleRead } from '../../../data/rituals/ritualsRpc'
import { soloRitualModel } from '../solo/lifecycle/soloRitualModel'
import { laterWeekOpenAt, stampedWeekClosingLabel, tileStatus, type TileStatus } from './tileStatus'

export function homeTilePresentation(bundle: RitualBundleRead, now: number | null): { status: TileStatus; closingLine: string | null } {
  const account = bundle.ritual.account
  // Terminal labels do not depend on the clock being available.
  if (account.status === 'Completed' || account.status === 'Ended') return { status: { text: account.status === 'Completed' ? 'Finished' : 'Ended', act: false }, closingLine: null }
  if (account.kind !== 'Solo' || account.status === 'Cancelled') return { status: { text: account.status, act: false }, closingLine: null }
  if (now === null) return { status: { text: 'Checking time…', act: false }, closingLine: null }
  const model = soloRitualModel(bundle, now, account.members[0] ?? null)
  const laterOpen = laterWeekOpenAt(account.schedule, account.currentEventIndex, now)
  return { status: tileStatus(model, laterOpen), closingLine: model.catchupLine ?? (laterOpen ? null : stampedWeekClosingLabel(model, now)) }
}

/**
 * Home shows the connected wallet's rituals only (Jack, 2026-10-08: rituals belong
 * to a wallet, not to the phone). Remembered records are kept on the phone, so
 * reconnecting the same wallet brings them back. No wallet → nothing.
 */
export function ritualsForWallet<T extends { bundle: RitualBundleRead }>(rituals: readonly T[], wallet: { equals(other: unknown): boolean } | null | undefined): T[] {
  if (!wallet) return []
  return rituals.filter((ritual) => {
    const account = ritual.bundle.ritual.account
    return wallet.equals(account.creator) || account.members.some((member) => wallet.equals(member))
  })
}

/** Stable within each section; colour assignment still uses the remembered order. */
export function homeSections<T extends { bundle: RitualBundleRead }>(rituals: readonly T[], now: number | null): { active: T[]; finished: T[] } {
  const needsStamp: T[] = []
  const otherActive: T[] = []
  const finished: T[] = []
  for (const ritual of rituals) {
    const status = ritual.bundle.ritual.account.status
    if (status === 'Completed' || status === 'Ended' || homeTilePresentation(ritual.bundle, now).status.text === 'Finished') finished.push(ritual)
    else if (homeTilePresentation(ritual.bundle, now).status.act) needsStamp.push(ritual)
    else otherActive.push(ritual)
  }
  return { active: [...needsStamp, ...otherActive], finished }
}
