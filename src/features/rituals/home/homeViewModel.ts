import type { RitualsHomeSnapshot } from '../../../data/rituals/RitualsRepository'
import type { ConfirmationMode, EventIndex, RitualId } from '../../../domain/rituals/types'

type LoadingSnapshot = { readonly state: 'loading' }
export type HomeSnapshotInput = RitualsHomeSnapshot | LoadingSnapshot
export type HomePresentation = 'loading' | 'active' | 'funding' | 'pending-confirmation' | 'completed' | 'empty' | 'error'

export interface HomeViewModel {
  readonly kind: HomePresentation
  readonly presentation: HomePresentation
  readonly identity: { readonly title: string; readonly valueProposition: string }
  readonly disclosure: string
  readonly activeRituals: readonly {
    readonly id: RitualId
    readonly title: string
    readonly requirement: string
    readonly memberProgress: string
    readonly stakeAtRisk: string
    readonly nextEvent: string
    readonly confirmationMode: string
  }[]
  readonly confirmations: { readonly count: number; readonly actionLabel: string }
  readonly funding: { readonly progress: string }
  readonly cards: { readonly activeRitual: boolean; readonly funding: boolean; readonly confirmations: boolean; readonly completedReceipt: boolean }
  readonly ctas: { readonly fundRitual: boolean; readonly reviewConfirmations: boolean; readonly createRitual: boolean }
  readonly completedReceipt?: { readonly ritualId: RitualId; readonly eventIndex: EventIndex; readonly title: string; readonly amount: string }
  readonly errorMessage?: string
}

function format(amount: bigint, decimals: number, symbol: string): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) return 'Invalid amount'

  const negative = amount < 0n
  const absolute = negative ? -amount : amount
  const base = 10n ** BigInt(decimals)
  const whole = absolute / base
  const fraction = absolute % base
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  return `${negative ? '-' : ''}${grouped}${decimals === 0 ? '' : `.${fraction.toString().padStart(decimals, '0')}`} ${symbol}`
}

export const safeErrorMessage = (_error: unknown): string => 'Unable to load rituals right now.'

const disclosure = 'DEVNET · TEST TOKENS · FIXTURE DATA'
const identity = { title: 'Rituals', valueProposition: 'show up together, make progress together.' }
const labels: Record<ConfirmationMode, string> = {
  HONOR: 'Honor system',
  ONE_FRIEND: 'One friend confirms',
  MAJORITY: 'Majority confirms',
  UNANIMOUS: 'Everyone confirms',
}

const empty = (kind: HomePresentation, errorMessage?: string): HomeViewModel => ({
  kind,
  presentation: kind,
  identity,
  disclosure,
  activeRituals: [],
  confirmations: { count: 0, actionLabel: 'Open confirmations' },
  funding: { progress: '0 of 0 funded' },
  cards: { activeRitual: false, funding: false, confirmations: false, completedReceipt: false },
  ctas: { fundRitual: false, reviewConfirmations: false, createRitual: kind === 'empty' },
  errorMessage,
})

export function buildHomeViewModel(snapshot: HomeSnapshotInput): HomeViewModel {
  if (snapshot.state === 'loading') return empty('loading')
  if (snapshot.state === 'empty') return empty('empty')
  if (snapshot.state === 'error') return empty('error', safeErrorMessage(snapshot.errorMessage))
  if (snapshot.state === 'completed') {
    return {
      ...empty('completed'),
      cards: { activeRitual: false, funding: false, confirmations: false, completedReceipt: true },
      completedReceipt: snapshot.completedReceipt && {
        ritualId: snapshot.completedReceipt.ritualId,
        eventIndex: snapshot.completedReceipt.eventIndex,
        title: snapshot.completedReceipt.title,
        amount: format(snapshot.completedReceipt.amountAtomicUnits, snapshot.completedReceipt.tokenDecimals, snapshot.completedReceipt.tokenSymbol),
      },
    }
  }

  const rituals = snapshot.activeRituals ?? (snapshot.activeRitual ? [snapshot.activeRitual] : [])
  const kind: HomePresentation = snapshot.state === 'funding' ? 'funding' : snapshot.state === 'pending-confirmation' ? 'pending-confirmation' : 'active'
  const count = snapshot.confirmations?.count ?? 0

  return {
    kind,
    presentation: kind,
    identity,
    disclosure,
    activeRituals: rituals.map((ritual) => ({
      id: ritual.id,
      title: ritual.title,
      requirement: ritual.requirement,
      memberProgress: `${ritual.members.funded} of ${ritual.members.total} members ready`,
      stakeAtRisk: format(ritual.stakeAtomicUnits, ritual.tokenDecimals, ritual.tokenSymbol),
      nextEvent: ritual.nextEvent,
      confirmationMode: labels[ritual.confirmationMode],
    })),
    confirmations: { count, actionLabel: 'Review confirmations' },
    funding: { progress: `${snapshot.funding?.funded ?? 0} of ${snapshot.funding?.total ?? 0} funded` },
    cards: { activeRitual: rituals.length > 0, funding: kind === 'funding', confirmations: kind === 'pending-confirmation' && count > 0, completedReceipt: false },
    ctas: { fundRitual: kind === 'funding', reviewConfirmations: kind === 'pending-confirmation' && count > 0, createRitual: false },
  }
}
