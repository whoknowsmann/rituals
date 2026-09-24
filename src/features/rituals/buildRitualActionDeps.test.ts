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

function fakeClient(overrides: Record<string, unknown> = {}): any {
  return {
    programId: key(5),
    readRitual: vi.fn(async () => ({ address: ritual, account })),
    prepareFund: vi.fn(async () => prepared),
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

  it('uses activate preparation without a token source', async () => {
    const client = fakeClient()
    const deps = buildRitualActionDeps({ client, ritualAddress: ritual, actor, kind: 'activate' })
    const ref = await deps.prepare()
    expect(ref.kind).toBe('activate')
    expect(client.prepareActivate).toHaveBeenCalledWith(expect.objectContaining({ feePayer: actor }))
  })
})
