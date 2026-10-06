import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import { describe, expect, it, vi } from 'vitest'
import type { PendingActionRecord, PendingActionStore } from '../../recovery/pendingAction'
import type { RitualClient } from '../../../../data/rituals/ritualClient'
import { DEMO_CADENCE } from '../../../../domain/rituals/schedule'
import { buildSoloCreateDeps } from './buildSoloCreateDeps'
import { selectSoloSchedule } from './schedule'

const key = (byte: number) => new PublicKey(new Uint8Array(32).fill(byte))
const CREATOR = new PublicKey('Da59UWdaoBej5xdX9atiaZahMYLxJNsdXHVY6GMh8VmV')
const PERSON = new PublicKey('98W4zJfQDk9F5qjtLTgWTYBRdETT3JgUqY7dBNT9WjLa')
const prepared = {
  kind: 'create-solo-fund-and-activate',
  programId: key(9).toBase58(),
  ritualAddress: key(10).toBase58(),
  feePayer: key(1).toBase58(),
  blockhash: key(11).toBase58(),
  blockhashContextSlot: 1,
  lastValidBlockHeight: 100,
  messageDigest: 'a'.repeat(64),
  summary: {},
  expectation: { kind: 'bundle', expectations: [] },
} as never

describe('solo create transaction dependencies', () => {
  it('derives a person destination ATA from the configured stake mint', async () => {
    const creator = CREATOR
    const person = PERSON
    const mint = key(3)
    let args: any
    const client = {
      programId: key(9),
      getProtocolConfig: async () => ({ slot: 1, address: key(4), account: { allowedStakeMint: mint, feeRecipient: key(5), feeBasisPoints: 200, minimumFee: 500_000n, maximumFee: 5_000_000n, paused: false } }),
      prepareCreateSoloFundAndActivate: async (value: unknown) => { args = value; return prepared },
    } as unknown as RitualClient
    const schedule = selectSoloSchedule({ cadence: DEMO_CADENCE, referenceSeconds: 1_000, eventCount: 4 })
    const deps = buildSoloCreateDeps({
      client, creator, title: 'Weekly run', requirement: 'Run and check in.', eventCount: 4,
      stakePerWeekAtomic: 5_000_000n, schedule, witnessMode: 'just-me', destination: 'person', personAddress: person.toBase58(),
    })
    await deps.prepare()
    expect(args.forfeitDestination).toEqual(getAssociatedTokenAddressSync(mint, person))
    expect(args.ritual.witness).toBeNull()
    // 20 tSKR pool × 200 bps = 0.4 tSKR, clamped up to the chain's 0.5 tSKR minimum.
    expect(args.lockedActivationFee).toBe(500_000n)
  })

  it('takes the activation fee from the live ProtocolConfig: a free protocol locks 0, not the client constant', async () => {
    let args: any
    const client = {
      programId: key(9),
      getProtocolConfig: async () => ({ slot: 1, address: key(4), account: { allowedStakeMint: key(3), feeRecipient: key(5), feeBasisPoints: 0, minimumFee: 0n, maximumFee: 0n, paused: false } }),
      prepareCreateSoloFundAndActivate: async (value: unknown) => { args = value; return prepared },
    } as unknown as RitualClient
    const schedule = selectSoloSchedule({ cadence: DEMO_CADENCE, referenceSeconds: 1_000, eventCount: 4 })
    const deps = buildSoloCreateDeps({
      client, creator: CREATOR, title: 'Weekly run', requirement: 'Run and check in.', eventCount: 4,
      stakePerWeekAtomic: 5_000_000n, schedule, witnessMode: 'just-me', destination: 'cause', causeTokenAccount: key(7),
    })
    await deps.prepare()
    expect(args.lockedActivationFee).toBe(0n)
    expect(args.ritual.memberTotalStake).toBe(20_000_000n)
  })

  it('refuses an unavailable cause before preparing a wallet action', async () => {
    let preparedCalls = 0
    const client = {
      programId: key(9),
      getProtocolConfig: async () => ({ slot: 1, address: key(4), account: { allowedStakeMint: key(3), feeRecipient: key(5), feeBasisPoints: 200, minimumFee: 500_000n, maximumFee: 5_000_000n, paused: false } }),
      prepareCreateSoloFundAndActivate: async () => { preparedCalls += 1; return prepared },
    } as unknown as RitualClient
    const schedule = selectSoloSchedule({ cadence: DEMO_CADENCE, referenceSeconds: 1_000, eventCount: 4 })
    const deps = buildSoloCreateDeps({
      client, creator: key(1), title: 'Weekly run', requirement: 'Run and check in.', eventCount: 4,
      stakePerWeekAtomic: 5_000_000n, schedule, witnessMode: 'just-me', destination: 'cause', causeTokenAccount: null,
    })
    await expect(deps.prepare()).rejects.toThrow('the selected cause is not available')
    expect(preparedCalls).toBe(0)
  })

  describe('pending-action recovery journal', () => {
    const SIGNATURE = '5'.repeat(88)
    const realPrepared = { ...(prepared as object), lastValidBlockHeight: 100 } as never
    const makeStore = () => {
      const records = new Map<string, PendingActionRecord>()
      const calls: string[] = []
      const store: PendingActionStore = {
        list: async () => [...records.values()],
        upsert: async (record) => { calls.push(`upsert:${record.transactionSignature === undefined ? 'unsigned' : 'signed'}`); records.set(record.messageDigest, record) },
        remove: async (record) => { calls.push('remove'); records.delete(record.messageDigest) },
      }
      return { store, records, calls }
    }
    const makeClient = (calls: string[], submit: () => Promise<unknown>) => ({
      programId: key(9),
      getProtocolConfig: async () => ({ slot: 1, address: key(4), account: { allowedStakeMint: key(3), feeRecipient: key(5), feeBasisPoints: 200, minimumFee: 500_000n, maximumFee: 5_000_000n, paused: false } }),
      prepareCreateSoloFundAndActivate: async () => realPrepared,
      submitPrepared: vi.fn(async () => { calls.push('submitPrepared'); return submit() }),
      confirmSubmitted: vi.fn(async () => { calls.push('confirmSubmitted'); return { signature: SIGNATURE, messageDigest: 'a'.repeat(64) } }),
    }) as unknown as RitualClient
    const depsFor = (client: RitualClient, store: PendingActionStore) => buildSoloCreateDeps({
      client, creator: CREATOR, title: 'Weekly run', requirement: 'Run and check in.', eventCount: 4,
      stakePerWeekAtomic: 5_000_000n, schedule: selectSoloSchedule({ cadence: DEMO_CADENCE, referenceSeconds: 1_000, eventCount: 4 }),
      witnessMode: 'just-me', destination: 'cause', causeTokenAccount: key(20), pendingActionStore: store, now: () => 1_700_000_000,
    })

    it('journals before the wallet handoff, adds the signature after, and clears it on confirmation', async () => {
      const { store, records, calls } = makeStore()
      const client = makeClient(calls, async () => ({ signature: SIGNATURE }))
      const deps = depsFor(client, store)
      const ref = await deps.prepare()
      await deps.submit(ref as never)
      expect(calls).toEqual(['upsert:unsigned', 'submitPrepared', 'upsert:signed'])
      const journaled = [...records.values()][0]
      expect(journaled.actionKind).toBe('create-solo-fund-and-activate')
      expect(journaled.ritualAddress).toBe(key(10).toBase58())
      expect(journaled.transactionSignature).toBe(SIGNATURE)
      await deps.confirm({ id: 'a'.repeat(64) } as never)
      expect(calls.slice(-2)).toEqual(['confirmSubmitted', 'remove'])
      expect(records.size).toBe(0)
    })

    it('keeps the wallet-returned signature when submission fails after the wallet answered', async () => {
      const { store, records, calls } = makeStore()
      const client = makeClient(calls, async () => { throw Object.assign(new Error('verification failed'), { submitted: true, signature: SIGNATURE }) })
      const deps = depsFor(client, store)
      const ref = await deps.prepare()
      await expect(deps.submit(ref as never)).rejects.toThrow('verification failed')
      expect([...records.values()][0]?.transactionSignature).toBe(SIGNATURE)
    })
  })
})
