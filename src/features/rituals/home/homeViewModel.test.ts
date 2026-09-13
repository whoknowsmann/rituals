import { describe, expect, it } from 'vitest'
import type { HomeRitualSnapshot, RitualsHomeSnapshot } from '../../../data/rituals/RitualsRepository'
import { FixtureRitualsRepository } from '../../../data/rituals/FixtureRitualsRepository'
import type { RitualId, TokenAtomicUnits } from '../../../domain/rituals/types'
import { buildHomeViewModel, safeErrorMessage } from './homeViewModel'

const activeRitual = {
  id: 'ritual-test' as RitualId,
  title: 'Test ritual',
  requirement: 'Show up together.',
  members: { funded: 4, total: 4 },
  stakeAtomicUnits: 1_250_000_000n as TokenAtomicUnits,
  tokenDecimals: 6,
  tokenSymbol: 'TEST',
  nextEvent: 'Tomorrow',
  confirmationMode: 'ONE_FRIEND',
  status: 'ACTIVE',
} satisfies HomeRitualSnapshot

const canonicalSnapshot = {
  state: 'populated',
  mode: 'fixture',
  source: 'devnet',
  disclosure: 'NO REAL VALUE',
  activeRitual,
  confirmations: { count: 0 },
  funding: { funded: 4, total: 4 },
  completedReceipt: undefined,
  errorMessage: undefined,
} satisfies RitualsHomeSnapshot

const snapshotWith = (changes: Partial<RitualsHomeSnapshot>): RitualsHomeSnapshot => ({ ...canonicalSnapshot, ...changes })

const emptyView = (state: 'loading' | 'empty' | 'error') => buildHomeViewModel(
  state === 'loading'
    ? { state }
    : snapshotWith({ state, activeRitual: undefined, confirmations: undefined, funding: undefined, completedReceipt: undefined, errorMessage: state === 'error' ? 'Offline fixture error' : undefined }),
)

describe('buildHomeViewModel', () => {
  it('presents loading with disclosure and no cards or CTAs', () => {
    const view = buildHomeViewModel({ state: 'loading' })

    expect(view.kind).toBe('loading')
    expect(view.disclosure).toBe('DEVNET · TEST TOKENS · FIXTURE DATA')
    expect(view.activeRituals).toEqual([])
    expect(view.cards).toEqual({ activeRitual: false, funding: false, confirmations: false, completedReceipt: false })
    expect(view.ctas).toEqual({ fundRitual: false, reviewConfirmations: false, createRitual: false })
  })

  it('presents an active populated ritual without funding or confirmation actions', async () => {
    const view = buildHomeViewModel(await new FixtureRitualsRepository('populated').getHomeSnapshot())

    expect(view.kind).toBe('active')
    expect(view.activeRituals[0]).toMatchObject({
      title: 'Saturday morning miles',
      memberProgress: '4 of 4 members ready',
      stakeAtRisk: '1,250.000000 TEST',
    })
    expect(view.ctas.fundRitual).toBe(false)
    expect(view.ctas.reviewConfirmations).toBe(false)
    expect(view.cards.funding).toBe(false)
    expect(view.cards.confirmations).toBe(false)
    expect(view.disclosure).toBe('DEVNET · TEST TOKENS · FIXTURE DATA')
  })

  it('presents funding progress and only the fund CTA', async () => {
    const view = buildHomeViewModel(await new FixtureRitualsRepository('funding').getHomeSnapshot())

    expect(view.kind).toBe('funding')
    expect(view.activeRituals[0].memberProgress).toBe('2 of 4 members ready')
    expect(view.funding.progress).toBe('2 of 4 funded')
    expect(view.cards).toMatchObject({ activeRitual: true, funding: true, confirmations: false, completedReceipt: false })
    expect(view.ctas).toEqual({ fundRitual: true, reviewConfirmations: false, createRitual: false })
  })

  it('presents pending confirmations and only the confirmation CTA', async () => {
    const view = buildHomeViewModel(await new FixtureRitualsRepository('pending-confirmation').getHomeSnapshot())

    expect(view.kind).toBe('pending-confirmation')
    expect(view.confirmations).toMatchObject({ count: 1, actionLabel: 'Review confirmations' })
    expect(view.cards).toMatchObject({ activeRitual: true, funding: false, confirmations: true, completedReceipt: false })
    expect(view.ctas).toEqual({ fundRitual: false, reviewConfirmations: true, createRitual: false })
  })

  it('presents the completed receipt without active ritual cards or CTAs', async () => {
    const view = buildHomeViewModel(await new FixtureRitualsRepository('completed').getHomeSnapshot())

    expect(view.kind).toBe('completed')
    expect(view.completedReceipt).toEqual({ ritualId: 'ritual-book-club', eventIndex: 0, title: 'February book club', amount: '1,500.000000 TEST' })
    expect(view.activeRituals).toEqual([])
    expect(view.cards).toEqual({ activeRitual: false, funding: false, confirmations: false, completedReceipt: true })
    expect(view.ctas).toEqual({ fundRitual: false, reviewConfirmations: false, createRitual: false })
  })

  it('presents empty with only the create CTA', () => {
    const view = emptyView('empty')

    expect(view.kind).toBe('empty')
    expect(view.activeRituals).toEqual([])
    expect(view.ctas).toEqual({ fundRitual: false, reviewConfirmations: false, createRitual: true })
    expect(view.cards).toEqual({ activeRitual: false, funding: false, confirmations: false, completedReceipt: false })
  })

  it('presents an error without actions', () => {
    const view = emptyView('error')

    expect(view.kind).toBe('error')
    expect(view.errorMessage).toBe('Unable to load rituals right now.')
    expect(view.ctas).toEqual({ fundRitual: false, reviewConfirmations: false, createRitual: false })
    expect(view.disclosure).toBe('DEVNET · TEST TOKENS · FIXTURE DATA')
  })

  it.each([
    ['HONOR', 'Honor system'],
    ['ONE_FRIEND', 'One friend confirms'],
    ['MAJORITY', 'Majority confirms'],
    ['UNANIMOUS', 'Everyone confirms'],
  ] as const)('uses the friendly label for %s', (confirmationMode, label) => {
    const snapshot = snapshotWith({ activeRitual: { ...activeRitual, confirmationMode } })

    expect(buildHomeViewModel(snapshot).activeRituals[0].confirmationMode).toBe(label)
  })

  it('formats very large atomic values exactly without floating point', () => {
    const snapshot = snapshotWith({ activeRitual: { ...activeRitual, stakeAtomicUnits: 900719925474099312345n as TokenAtomicUnits } })

    expect(buildHomeViewModel(snapshot).activeRituals[0].stakeAtRisk).toBe('900,719,925,474,099.312345 TEST')
  })

  it('formats zero-decimal tokens without a decimal point', () => {
    const snapshot = snapshotWith({ activeRitual: { ...activeRitual, stakeAtomicUnits: 123456789n as TokenAtomicUnits, tokenDecimals: 0 } })

    expect(buildHomeViewModel(snapshot).activeRituals[0].stakeAtRisk).toBe('123,456,789 TEST')
  })

  it.each([-1, 1.5, 256])('uses a safe invalid amount for decimals %s', (tokenDecimals) => {
    const snapshot = snapshotWith({ activeRitual: { ...activeRitual, tokenDecimals } })

    expect(buildHomeViewModel(snapshot).activeRituals[0].stakeAtRisk).toBe('Invalid amount')
  })

  it('rejects negative values before formatting, including at 255 decimals', () => {
    const snapshot = snapshotWith({ activeRitual: { ...activeRitual, stakeAtomicUnits: -123n as TokenAtomicUnits, tokenDecimals: 255 } })

    const amount = buildHomeViewModel(snapshot).activeRituals[0].stakeAtRisk
    expect(amount).toBe('Invalid amount')
  })

  it('preserves the stable ritual id in the active item', async () => {
    const view = buildHomeViewModel(await new FixtureRitualsRepository('populated').getHomeSnapshot())

    expect(view.activeRituals[0].id).toBe('ritual-weekly-run')
  })

  it('keeps duplicate titles distinct with stable ids', () => {
    const second = { ...activeRitual, id: 'ritual-second' as RitualId }
    const view = buildHomeViewModel(snapshotWith({ activeRitual: undefined, activeRituals: [activeRitual, second] }))

    expect(view.activeRituals.map((ritual) => ({ id: ritual.id, title: ritual.title }))).toEqual([
      { id: 'ritual-test', title: 'Test ritual' },
      { id: 'ritual-second', title: 'Test ritual' },
    ])
  })

  it.each([
    [new Error('private backend detail'), 'Unable to load rituals right now.'],
    ['not an error', 'Unable to load rituals right now.'],
    [null, 'Unable to load rituals right now.'],
  ] as const)('maps arbitrary errors to a safe fixed message', (error, message) => {
    expect(safeErrorMessage(error)).toBe(message)
  })

  it('includes disclosure on every presentation', () => {
    const snapshots: readonly RitualsHomeSnapshot[] = [
      snapshotWith({ state: 'populated' }),
      snapshotWith({ state: 'funding' }),
      snapshotWith({ state: 'pending-confirmation' }),
      snapshotWith({ state: 'completed', activeRitual: undefined }),
      snapshotWith({ state: 'empty', activeRitual: undefined }),
      snapshotWith({ state: 'error', activeRitual: undefined, errorMessage: 'Offline' }),
    ]

    for (const snapshot of snapshots) expect(buildHomeViewModel(snapshot).disclosure).toBe('DEVNET · TEST TOKENS · FIXTURE DATA')
    expect(buildHomeViewModel({ state: 'loading' }).disclosure).toBe('DEVNET · TEST TOKENS · FIXTURE DATA')
  })
})
