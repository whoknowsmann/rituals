import type { RitualClient } from '../../../data/rituals/ritualClient'
import type { PublicKey } from '@solana/web3.js'
import type { RitualBundleRead } from '../../../data/rituals/ritualsRpc'
import { listKnownRituals, readKnownRitualBundles, type KnownRitual } from '../authoritativeRituals'
import { formatAtomic } from '../displayFormat'
import { labelSoloDestination } from '../solo/lifecycle/soloRitualModel'
import { observedReminderWeeks } from './planner'
import { reminders } from './runtime'
import type { CreateReminderInput } from './service'

/** Reuse confirmed chain windows and exclusions, never infer a fresh schedule. */
export function reminderInputFromBundle(known: KnownRitual, bundle: RitualBundleRead, nowSeconds: number): CreateReminderInput | null {
  const account = bundle.ritual.account
  if (account.kind !== 'Solo' || account.status !== 'Active' || bundle.ritual.address.toBase58() !== known.address) return null
  const event = bundle.event?.account
  const stamped = event?.eventIndex === account.currentEventIndex && (event.status === 'Settled' || event.status === 'Voided'
    || bundle.claims.some((claim) => claim.member.equals(account.creator) && claim.account?.status === 'Confirmed'))
  return {
    ritualAddress: known.address, ritualTitle: known.title, schedule: account.schedule, enabled: true,
    stakeLabel: formatAtomic(account.perEventAllocation, account.stakeDecimals),
    causeLabel: labelSoloDestination(account.forfeitDestination),
    stampedWeeks: observedReminderWeeks({ eventIndex: account.currentEventIndex, stamped,
      skippedEventIndex: account.skipDeclared ? account.skipEventIndex : undefined,
      schedule: account.schedule, nowSeconds }),
  }
}

/** Only an explicit master-on action reads the chain; never on mount/resume. */
export async function restoreRememberedReminders(client: Pick<RitualClient, 'getRitualBundle'>, wallet: PublicKey | null, mayContinue: () => boolean = () => true): Promise<boolean> {
  if (!wallet || !mayContinue()) return true
  const preferences = await reminders.getPreferences()
  if (!preferences) return false
  if (!preferences.masterEnabled) return true
  const known = (await listKnownRituals()).filter((item) => preferences.rituals[item.address]?.enabled)
  const loaded = await readKnownRitualBundles(known, (address) => client.getRitualBundle(address))
  let ok = true
  for (const item of loaded) {
    if (!mayContinue()) return false
    if (!item.bundle.ritual.account.creator.equals(wallet)) continue
    const input = reminderInputFromBundle(item, item.bundle, Math.floor(Date.now() / 1000))
    if (input && !await reminders.restore(input, mayContinue)) ok = false
  }
  return ok
}

export type WalletReminderPlan = Readonly<{ key: string; silence: readonly string[]; restore: readonly CreateReminderInput[] }>

/**
 * Reminders act only for the connected wallet, from a read the caller already
 * holds (Home's), never a new one. Every other wallet's ritual, and every
 * ritual while none is connected, is silenced but keeps its choice; the
 * connected wallet's are rescheduled, which also drops weeks stamped, skipped
 * or closed while their screen was not open. Restore keeps opt-outs and the
 * master switch, and never asks for permission.
 */
export function walletReminderPlan(loaded: readonly (KnownRitual & { bundle: RitualBundleRead })[], wallet: PublicKey | null, nowSeconds: number): WalletReminderPlan {
  const silence: string[] = []
  const restore: CreateReminderInput[] = []
  for (const item of loaded) {
    if (!wallet || !item.bundle.ritual.account.creator.equals(wallet)) { silence.push(item.address); continue }
    const input = reminderInputFromBundle(item, item.bundle, nowSeconds)
    if (input) restore.push(input)
  }
  const key = JSON.stringify([wallet?.toBase58() ?? null, silence, restore.map((input) => [input.ritualAddress, input.stampedWeeks])])
  return Object.freeze({ key, silence: Object.freeze(silence), restore: Object.freeze(restore) })
}

/** False when the wallet changed part-way; the next plan finishes the job. */
export async function applyWalletReminderPlan(plan: WalletReminderPlan, mayContinue: () => boolean): Promise<boolean> {
  for (const address of plan.silence) {
    if (!mayContinue()) return false
    await reminders.silence(address)
  }
  for (const input of plan.restore) {
    if (!mayContinue()) return false
    await reminders.restore(input, mayContinue)
  }
  return mayContinue()
}
