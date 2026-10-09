import { PublicKey } from '@solana/web3.js'
import { describe, expect, it, vi } from 'vitest'
import type { RitualClient } from '../../../../data/rituals/ritualClient'
import type { PendingActionRecord, PendingActionStore } from '../../recovery/pendingAction'
import { buildSoloSkipDeps } from './soloActionDeps'

const key = (byte: number) => new PublicKey(new Uint8Array(32).fill(byte))
const SIGNATURE = '5'.repeat(88)

describe('solo declare-skip dependencies', () => {
  it.each(['blockheight', 'journal'])('stops signing after a wallet switch during %s', async (pause) => {
    let actor: PublicKey | null = key(1)
    const prepared = { kind: 'declare-skip', ritualAddress: key(10).toBase58(), messageDigest: 'b'.repeat(64), blockhash: key(11).toBase58(), lastValidBlockHeight: 100 }
    const client = {
      programId: key(9), readRitual: async () => ({ address: key(10), account: {} }),
      prepareDeclareSkip: async () => prepared, submitPrepared: vi.fn(async () => ({ signature: SIGNATURE })),
    } as unknown as RitualClient
    const deps = buildSoloSkipDeps({ client, ritualAddress: key(10), actor: key(1), eventIndex: 0,
      authorizedActor: () => actor,
      getBlockHeight: async () => { if (pause === 'blockheight') actor = null; return 10 },
      pendingActionStore: { list: async () => [], remove: async () => undefined,
        upsert: async () => { if (pause === 'journal') actor = key(2) } },
    })
    await expect(deps.submit(await deps.prepare())).rejects.toThrow(/changed/)
    expect(client.submitPrepared).not.toHaveBeenCalled()
  })
  it('journals the declare-skip action around the wallet handoff and clears it on confirmation', async () => {
    const records = new Map<string, PendingActionRecord>()
    const calls: string[] = []
    const store: PendingActionStore = {
      list: async () => [...records.values()],
      upsert: async (record) => { calls.push(`upsert:${record.transactionSignature === undefined ? 'unsigned' : 'signed'}`); records.set(record.messageDigest, record) },
      remove: async (record) => { calls.push('remove'); records.delete(record.messageDigest) },
    }
    const prepared = { kind: 'declare-skip', ritualAddress: key(10).toBase58(), messageDigest: 'b'.repeat(64), blockhash: key(11).toBase58(), lastValidBlockHeight: 100 }
    const client = {
      programId: key(9),
      readRitual: async () => ({ address: key(10), account: {} }),
      prepareDeclareSkip: async () => prepared,
      submitPrepared: vi.fn(async () => { calls.push('submitPrepared'); return { signature: SIGNATURE } }),
      confirmSubmitted: vi.fn(async () => { calls.push('confirmSubmitted'); return { signature: SIGNATURE, messageDigest: 'b'.repeat(64) } }),
    } as unknown as RitualClient
    const deps = buildSoloSkipDeps({ client, ritualAddress: key(10), actor: key(1), eventIndex: 0, pendingActionStore: store, now: () => 1_700_000_000 })
    const ref = await deps.prepare()
    await deps.submit(ref)
    expect(calls).toEqual(['upsert:unsigned', 'submitPrepared', 'upsert:signed'])
    expect([...records.values()][0]?.actionKind).toBe('declare-skip')
    await deps.confirm({ id: 'b'.repeat(64) })
    expect(records.size).toBe(0)
  })
})
