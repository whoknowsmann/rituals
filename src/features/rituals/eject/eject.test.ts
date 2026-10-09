import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PublicKey } from '@solana/web3.js'
import { ejectRows, ejectTitle, endableRituals, nameConfirmed } from './ejectFlow'
import { buildEjectDeps, EjectAmountsChangedError } from './ejectDeps'
import { runLifecycleAction } from '../runLifecycleAction'
import { lifecycleInitialState, lifecycleReducer } from '../lifecycleMachine'
import { watchActionReconciliation } from '../recovery/reconcilePendingAction'
import type { RitualClient } from '../../../data/rituals/ritualClient'
import type { PendingActionRecord } from '../recovery/pendingAction'
import { tileStatus } from '../home/tileStatus'
import { soloRitualModel, type SoloRitualBundle } from '../solo/lifecycle/soloRitualModel'
import { showDemoSpeedNotice } from '../../../screens/solo/weekHero'

const me = new PublicKey(new Uint8Array(32).fill(7))
const other = new PublicKey(new Uint8Array(32).fill(8))
const ritualAddress = new PublicKey(new Uint8Array(32).fill(6))
const loaded = (title: string, kind: 'Solo' | 'Group', status: string, creator: PublicKey) => ({ address: `${title}-address`, title, bundle: { ritual: { account: { kind, status, creator } } } }) as never

describe('end early: what Settings lists and shows', () => {
  it('lists only active solo rituals the connected wallet made', () => {
    const rituals = [loaded('Run', 'Solo', 'Active', me), loaded('Read', 'Solo', 'Completed', me), loaded('Swim', 'Solo', 'Ended', me), loaded('Crew', 'Group', 'Active', me), loaded('Theirs', 'Solo', 'Active', other)]
    expect(endableRituals(rituals, me)).toEqual([{ address: 'Run-address', title: 'Run' }])
    expect(endableRituals(rituals, null)).toEqual([])
  })

  it('shows money only: what comes back, and the destination only when it gets anything', () => {
    expect(ejectTitle('Run')).toBe('End Run early?')
    expect(ejectRows({ backToYou: 15_000_000n, destinationTotal: 0n }, 'Northside Food Bank (demo)', 6)).toEqual([{ label: 'Back to you', value: '15 tSKR' }])
    expect(ejectRows({ backToYou: 10_000_000n, destinationTotal: 5_000_000n }, 'Northside Food Bank (demo)', 6)).toEqual([{ label: 'Back to you', value: '10 tSKR' }, { label: 'Northside Food Bank (demo)', value: '5 tSKR' }])
    expect(ejectRows({ backToYou: 0n, destinationTotal: 2_500_000n }, 'the wallet you chose · fT9Xe…LJgo1', 6)[1]).toEqual({ label: 'The wallet you chose · fT9Xe…LJgo1', value: '2.5 tSKR' })
  })

  it('enables the last button only for the ritual’s own name', () => {
    expect(nameConfirmed('run', 'Run')).toBe(true)
    expect(nameConfirmed('  Run ', 'Run')).toBe(true)
    expect(nameConfirmed('Ru', 'Run')).toBe(false)
    expect(nameConfirmed('', '')).toBe(false)
  })
})

describe('end early through the shared action path', () => {
  const quote = (backToYou: bigint, pendingForfeit: bigint, currentEventIndex = 1) => ({
    ritual: { address: ritualAddress, account: { creator: me, currentEventIndex } }, creatorDestination: other, creatorBalance: 3n,
    backToYou, pendingForfeit, destinationTotal: pendingForfeit, missingReceiptCount: pendingForfeit > 0n ? 1 : 0, now: 1n,
  })
  const fakeClient = (fresh: ReturnType<typeof quote>) => {
    const prepareEject = vi.fn(async () => ({ kind: 'eject', messageDigest: 'd'.repeat(64), ritualAddress: ritualAddress.toBase58(), blockhash: new PublicKey(new Uint8Array(32).fill(1)).toBase58(), lastValidBlockHeight: 50 }))
    const client = { programId: other, getEjectQuote: vi.fn(async () => fresh), prepareEject, submitPrepared: vi.fn(async () => ({ signature: '5'.repeat(88) })), confirmSubmitted: vi.fn(async () => ({ signature: 'sig', messageDigest: 'd'.repeat(64) })) }
    return client as unknown as RitualClient & { prepareEject: typeof prepareEject; submitPrepared: ReturnType<typeof vi.fn> }
  }

  it('signs only what a fresh chain read still shows, binding the shown forfeit and the creator’s refund', async () => {
    const client = fakeClient(quote(10n, 5n))
    const records: PendingActionRecord[] = []
    const store = { list: async () => records, upsert: async (record: PendingActionRecord) => { records.push(record) }, remove: async () => undefined }
    const events: string[] = []
    const outcome = await runLifecycleAction(buildEjectDeps({ client, ritualAddress, actor: me, shown: quote(10n, 5n), pendingActionStore: store, now: () => 1, getBlockHeight: async () => 10 }), (event) => events.push(event.type))
    expect(outcome.ok).toBe(true)
    expect(client.prepareEject).toHaveBeenCalledWith(expect.objectContaining({ creator: me, creatorDestination: other, expectedForfeit: 5n, expectedRefund: 10n, creatorBalanceBefore: 3n, missingReceiptCount: 1 }))
    expect(records[0]).toMatchObject({ actionKind: 'eject', actor: me.toBase58(), eventIndex: 1 })
    expect(events).toEqual(['PREPARE', 'PREPARED', 'SUBMITTED', 'CONFIRMING', 'CONFIRMED'])
  })

  it('shows the new amounts instead of signing when a deadline passed since they were shown', async () => {
    const client = fakeClient(quote(5n, 10n))
    const onAmountsChanged = vi.fn()
    const deps = buildEjectDeps({ client, ritualAddress, actor: me, shown: quote(10n, 5n), onAmountsChanged })
    await expect(deps.prepare()).rejects.toBeInstanceOf(EjectAmountsChangedError)
    expect(onAmountsChanged).toHaveBeenCalledWith(expect.objectContaining({ backToYou: 5n, pendingForfeit: 10n }))
    expect(client.prepareEject).not.toHaveBeenCalled()
    expect(client.submitPrepared).not.toHaveBeenCalled()
  })

  it('checks the chain after a lost End early reply and reaches Ended without a second send', async () => {
    vi.useFakeTimers()
    try {
      const client = fakeClient(quote(10n, 5n))
      client.submitPrepared.mockRejectedValue(Object.assign(new Error('wallet submission outcome is unknown'), { submitted: true }))
      const readRitual = vi.fn(async () => ({ slot: 120, address: ritualAddress, account: { status: 'Ended', creator: me } }))
      const deps = buildEjectDeps({ client: { ...client, readRitual } as unknown as RitualClient, ritualAddress, actor: me, shown: quote(10n, 5n), getBlockHeight: async () => 10 })
      let state = lifecycleInitialState()
      await runLifecycleAction(deps, (event) => { state = lifecycleReducer(state, event) })
      expect(state).toMatchObject({ status: 'error', retryable: false })
      const stop = watchActionReconciliation(deps.reconcile!, (event) => { state = lifecycleReducer(state, event) })
      await vi.advanceTimersByTimeAsync(0)
      expect(state.status).toBe('recovered')
      expect(readRitual).toHaveBeenCalledWith(ritualAddress)
      expect(client.submitPrepared).toHaveBeenCalledOnce()
      stop()
    } finally { vi.useRealTimers() }
    const flow = readFileSync(resolve(__dirname, 'EndEarly.tsx'), 'utf8')
    expect(flow).toContain("if (eject.state.status === 'confirmed' || eject.state.status === 'recovered') ended()")
    expect(flow).toContain('eject.state.submitted || eject.state.unresolved ||')
    expect(flow).toContain('getSignatureStatus: async (signature) =>')
    expect(flow).not.toContain('setInterval(')
  })

  it.each(['blockheight', 'journal'])('stops End early signing after a wallet switch during %s', async (pause) => {
    let actor: PublicKey | null = me
    const client = fakeClient(quote(10n, 0n))
    const deps = buildEjectDeps({ client, ritualAddress, actor: me, shown: quote(10n, 0n),
      authorizedActor: () => actor,
      getBlockHeight: async () => { if (pause === 'blockheight') actor = null; return 10 },
      pendingActionStore: { list: async () => [], remove: async () => undefined,
        upsert: async () => { if (pause === 'journal') actor = other } },
    })
    await expect(deps.submit(await deps.prepare())).rejects.toThrow(/changed/)
    expect(client.submitPrepared).not.toHaveBeenCalled()
  })

  it('refuses another wallet and a wallet switch before signing', async () => {
    await expect(buildEjectDeps({ client: fakeClient(quote(10n, 0n)), ritualAddress, actor: other, shown: quote(10n, 0n) }).prepare()).rejects.toThrow(/creator/)
    await expect(buildEjectDeps({ client: fakeClient(quote(10n, 0n)), ritualAddress, actor: me, shown: quote(10n, 0n), authorizedActor: () => other }).prepare()).rejects.toThrow(/changed/)
  })
})

describe('an ended ritual on Home and on its screen', () => {
  const bundle = {
    ritual: { address: ritualAddress, account: { kind: 'Solo', status: 'Ended', members: [me], creator: me, witness: null, season: null, schedule: [{ opens: 100n, deadline: 200n, resolution: 300n }, { opens: 400n, deadline: 500n, resolution: 600n }, { opens: 700n, deadline: 800n, resolution: 900n }], currentEventIndex: 1, skipDeclared: false, skipEventIndex: 0, forfeitDestination: other, perEventAllocation: 5n, stakeDecimals: 6 } },
    event: null, claims: [],
    history: [{ ritual: { address: ritualAddress }, event: { account: { eventIndex: 0, status: 'Settled', forfeitedTotal: 0n, voidReason: 'None' } }, claims: [{ member: me, account: { status: 'Confirmed' } }] }],
  } as unknown as SoloRitualBundle

  it('has nothing to stamp, skip or count down, keeps its receipts, and reads Ended', () => {
    const model = soloRitualModel(bundle, 450, me)
    expect(model.state).toBe('ended')
    expect([model.canSkip, model.nextOpensLabel, model.stampTimeLeftLabel, model.needsEventInit]).toEqual([false, null, null, false])
    expect(model.weekCells).toEqual(['done', 'future', 'future'])
    expect(model.lastClosedEventIndex).toBe(0)
    expect(tileStatus(model)).toEqual({ text: 'Ended', act: false })
    expect(showDemoSpeedNotice({ ...model, demoSpeedNotice: 'Demo speed: a week here is 1 minute.' }, false)).toBe(false)
  })

  it('wires the hidden Settings entry, the two confirmations and the Ended screen', () => {
    const settings = readFileSync(resolve(__dirname, '../../../screens/SettingsScreen.tsx'), 'utf8')
    const flow = readFileSync(resolve(__dirname, 'EndEarly.tsx'), 'utf8')
    const ritual = readFileSync(resolve(__dirname, '../../../screens/solo/SoloRitualScreen.tsx'), 'utf8')
    expect(settings.indexOf('<YourRituals onEnd={setEnding} />')).toBeGreaterThan(settings.indexOf('accessibilityLabel="Program information"'))
    expect(settings).toContain('<EndEarly ritual={ending} onClose={() => setEnding(null)} />')
    for (const copy of ['>End early<', 'label="Continue"', "'End and get it back'", 'placeholder={ritual.title}', "'Nothing was sent.'", 'clearRitualReminders(ritual.address)', "navigation.navigate('SoloRitual', { ritualId: ritual.address })"]) expect(flow).toContain(copy)
    expect(flow + readFileSync(resolve(__dirname, 'ejectFlow.ts'), 'utf8')).not.toMatch(/missed weeks stay missed/i)
    expect(ritual).toContain("ended ? 'Ended'")
    expect(ritual).toContain('showDemoSpeedNotice(model, stampPending) &&')
  })
})
