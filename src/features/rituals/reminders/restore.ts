import type { RitualClient } from '../../../data/rituals/ritualClient'
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
export async function restoreRememberedReminders(client: Pick<RitualClient, 'getRitualBundle'>): Promise<boolean> {
  const preferences = await reminders.getPreferences()
  if (!preferences) return false
  if (!preferences.masterEnabled) return true
  const known = (await listKnownRituals()).filter((item) => preferences.rituals[item.address]?.enabled)
  const loaded = await readKnownRitualBundles(known, (address) => client.getRitualBundle(address))
  let ok = true
  for (const item of loaded) {
    const input = reminderInputFromBundle(item, item.bundle, Math.floor(Date.now() / 1000))
    if (input && !await reminders.restore(input)) ok = false
  }
  return ok
}
