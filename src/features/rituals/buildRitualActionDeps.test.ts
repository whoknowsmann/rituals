import { describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { buildRitualActionDeps } from './buildRitualActionDeps'
import type { PendingActionStore } from './recovery/pendingAction'

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const actor = key(1)
const ritual = key(2)
const mint = key(3)
const account = { stakeMint: mint, members: [actor], status: 'Funding', fundedMemberCount: 0, fundedMembersBitmap: 0 }
const prepared = { kind: 'fund' as const, messageDigest: 'a'.repeat(64), ritualAddress: ritual.toBase58(), blockhash: key(4).toBase58(), lastValidBlockHeight: 100 }
const bundledPrepared = { ...prepared, kind: 'fund-and-activate' as const }

function fakeClient(overrides: Record<string, unknown> = {}): any {
  return {
    programId: key(5),
    readRitual: vi.fn(async () => ({ address: ritual, account })),
    prepareFund: vi.fn(async () => prepared),
    prepareFundAndActivate: vi.fn(async () => bundledPrepared),
    prepareActivate: vi.fn(async () => ({ ...prepared, kind: 'activate' as const })),
    submitPrepared: vi.fn(async () => ({ signature: '1'.repeat(64) })),
    confirmSubmitted: vi.fn(async () => ({ signature: '1'.repeat(64), messageDigest: prepared.messageDigest })),
    ...overrides,
  } as never
}

describe('buildRitualActionDeps', () => {
  it('prepares funding from an authoritative ritual read and journals both handoff phases', async () => {
    const store = { list: vi.fn(async () => []), upsert: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) } as PendingActionStore
    const client = fakeClient()
    const deps = buildRitualActionDeps({ client, ritualAddress: ritual, actor, kind: 'fund', memberSource: key(6), pendingActionStore: store, now: () => 12 })
    const ref = await deps.prepare()
    await deps.submit(ref)
    await deps.confirm({ id: prepared.messageDigest })
    expect(client.readRitual).toHaveBeenCalledWith(ritual)
    expect(client.prepareFund).toHaveBeenCalledWith(expect.objectContaining({ member: actor, memberSource: key(6) }))
    expect(store.upsert).toHaveBeenCalledTimes(2)
    expect(store.remove).toHaveBeenCalledTimes(1)
  })

  it('bundles initialization when a claim is the first event action', async () => {
    const client = fakeClient({
      getEventBundle: vi.fn(async () => ({ event: null, claims: [] })),
      prepareInitializeAndClaim: vi.fn(async () => ({ ...prepared, kind: 'initialize-event-and-claim' as const })),
    })
    const deps = buildRitualActionDeps({ client, ritualAddress: ritual, actor, kind: 'claim', claimant: actor })
    const ref = await deps.prepare()
    expect(ref.kind).toBe('claim')
    expect(client.prepareInitializeAndClaim).toHaveBeenCalledWith(expect.objectContaining({ payer: actor, claimant: actor, eventIndex: 0 }))
  })
  it('selects fund plus activate for the last member only after vault and clock checks', async () => {
    const bundleAccount = {
      ...account,
      creator: actor,
      lockedActivationFee: 10n,
      memberTotalStake: 20n,
      fundedStakeTotal: 20n,
      fundedFeeTotal: 10n,
      feePayerMode: 'Host',
      members: [actor, key(6)],
      fundedMembersBitmap: 1,
      fundedMemberCount: 1,
      schedule: [{ opens: 100n, deadline: 200n, resolution: 300n }],
      stakeVault: key(7),
      feeVault: key(8),
    }
    const prepareFundAndActivate = vi.fn(async () => bundledPrepared)
    const prepareFund = vi.fn(async () => prepared)
    const upsert = vi.fn(async () => undefined)
    const client = fakeClient({ readRitual: vi.fn(async () => ({ address: ritual, account: bundleAccount })), prepareFundAndActivate, prepareFund })
    const store = { list: vi.fn(async () => []), upsert, remove: vi.fn(async () => undefined) } as PendingActionStore
    const deps = buildRitualActionDeps({ client, ritualAddress: ritual, actor: key(6), kind: 'fund', memberSource: key(9), pendingActionStore: store, getUnixTimestamp: async () => 99, getTokenAccountAmount: async (address) => address.equals(key(7)) ? 20n : 10n })
    const ref = await deps.prepare()
    await deps.submit(ref)
    expect(prepareFundAndActivate).toHaveBeenCalledTimes(1)
    expect(prepareFund).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ actionKind: 'fund-and-activate' }))
  })

  it('keeps standalone funding when the first window has opened', async () => {
    const bundleAccount = { ...account, creator: actor, lockedActivationFee: 10n, memberTotalStake: 20n, fundedStakeTotal: 20n, fundedFeeTotal: 10n, feePayerMode: 'Host', members: [actor, key(6)], fundedMembersBitmap: 1, fundedMemberCount: 1, schedule: [{ opens: 100n, deadline: 200n, resolution: 300n }], stakeVault: key(7), feeVault: key(8) }
    const prepareFund = vi.fn(async () => prepared)
    const client = fakeClient({ readRitual: vi.fn(async () => ({ address: ritual, account: bundleAccount })), prepareFund })
    const deps = buildRitualActionDeps({ client, ritualAddress: ritual, actor: key(6), kind: 'fund', memberSource: key(9), getUnixTimestamp: async () => 100, getTokenAccountAmount: async () => 10n })
    await deps.prepare()
    expect(prepareFund).toHaveBeenCalledTimes(1)
    expect(client.prepareFundAndActivate).not.toHaveBeenCalled()
  })

  it('uses activate preparation without a token source', async () => {
    const client = fakeClient()
    const deps = buildRitualActionDeps({ client, ritualAddress: ritual, actor, kind: 'activate' })
    const ref = await deps.prepare()
    expect(ref.kind).toBe('activate')
    expect(client.prepareActivate).toHaveBeenCalledWith(expect.objectContaining({ feePayer: actor }))
  })

  it('fails before wallet submission when the authorized account changes', async () => {
    const client = fakeClient()
    let current = actor
    const deps = buildRitualActionDeps({ client, ritualAddress: ritual, actor, kind: 'fund', memberSource: key(6), authorizedActor: () => current })
    const ref = await deps.prepare()
    current = key(9)
    await expect(deps.submit(ref)).rejects.toThrow('authorized wallet account changed')
    expect(client.submitPrepared).not.toHaveBeenCalled()
  })

  it('rejects an expired prepared blockhash before wallet submission', async () => {
    const client = fakeClient()
    const deps = buildRitualActionDeps({ client, ritualAddress: ritual, actor, kind: 'fund', memberSource: key(6), getBlockHeight: async () => 101 })
    const ref = await deps.prepare()
    await expect(deps.submit(ref)).rejects.toMatchObject({ blockhashExpired: true })
    expect(client.submitPrepared).not.toHaveBeenCalled()
  })
})
