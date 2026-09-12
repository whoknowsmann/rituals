import type { RitualsHomeSnapshot } from '../../../data/rituals/RitualsRepository'

type LoadingSnapshot = { readonly state: 'loading' }
export type HomeSnapshotInput = RitualsHomeSnapshot | LoadingSnapshot

export interface HomeViewModel {
  readonly kind: 'loading' | 'populated' | 'empty' | 'error'
  readonly identity: { readonly title: string; readonly valueProposition: string }
  readonly disclosure: string
  readonly activeRituals: readonly {
    readonly title: string
    readonly requirement: string
    readonly memberProgress: string
    readonly stakeAtRisk: string
    readonly nextEvent: string
    readonly confirmationMode: string
  }[]
  readonly confirmations: { readonly count: number; readonly actionLabel: string }
  readonly funding: { readonly progress: string }
  readonly completedReceipt?: { readonly title: string; readonly amount: string }
  readonly errorMessage?: string
}

function formatAtomicUnits(amount: bigint, decimals: number, symbol: string): string {
  const negative = amount < 0n
  const absolute = negative ? -amount : amount
  const base = 10n ** BigInt(decimals)
  const whole = absolute / base
  const fraction = absolute % base
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const fractionText = decimals === 0 ? '' : `.${fraction.toString().padStart(decimals, '0')}`
  return `${negative ? '-' : ''}${grouped}${fractionText} ${symbol}`
}

const emptyView = (kind: HomeViewModel['kind'], disclosure: string, errorMessage?: string): HomeViewModel => ({
  kind,
  identity: { title: 'Rituals', valueProposition: 'show up together, make progress together.' },
  disclosure,
  activeRituals: [],
  confirmations: { count: 0, actionLabel: 'Open confirmations' },
  funding: { progress: '0 of 0 funded' },
  errorMessage,
})

export function buildHomeViewModel(snapshot: HomeSnapshotInput): HomeViewModel {
  if (snapshot.state === 'loading') return emptyView('loading', 'DEVNET · TEST TOKENS · FIXTURE DATA')
  if (snapshot.state === 'empty') return emptyView('empty', 'DEVNET · TEST TOKENS · FIXTURE DATA')
  if (snapshot.state === 'error') return emptyView('error', 'DEVNET · TEST TOKENS · FIXTURE DATA', snapshot.errorMessage)

  const ritual = snapshot.activeRitual
  return {
    kind: 'populated',
    identity: { title: 'Rituals', valueProposition: 'show up together, make progress together.' },
    disclosure: 'DEVNET · TEST TOKENS · FIXTURE DATA',
    activeRituals: ritual ? [{
      title: ritual.title,
      requirement: ritual.requirement,
      memberProgress: `${ritual.members.funded} of ${ritual.members.total} members ready`,
      stakeAtRisk: formatAtomicUnits(ritual.stakeAtomicUnits, ritual.tokenDecimals, ritual.tokenSymbol),
      nextEvent: ritual.nextEvent,
      confirmationMode: ritual.confirmationMode === 'ONE_FRIEND' ? 'One friend confirms' : ritual.confirmationMode,
    }] : [],
    confirmations: { count: snapshot.confirmations?.count ?? 0, actionLabel: 'Review confirmations' },
    funding: { progress: `${snapshot.funding?.funded ?? 0} of ${snapshot.funding?.total ?? 0} funded` },
    completedReceipt: snapshot.completedReceipt && { title: snapshot.completedReceipt.title, amount: formatAtomicUnits(snapshot.completedReceipt.amountAtomicUnits, snapshot.completedReceipt.tokenDecimals, snapshot.completedReceipt.tokenSymbol) },
  }
}
