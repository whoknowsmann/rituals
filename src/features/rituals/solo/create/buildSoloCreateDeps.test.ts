import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'
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
      getProtocolConfig: async () => ({ slot: 1, address: key(4), account: { allowedStakeMint: mint, feeRecipient: key(5), paused: false } }),
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
  })

  it('refuses an unavailable cause before preparing a wallet action', async () => {
    let preparedCalls = 0
    const client = {
      programId: key(9),
      getProtocolConfig: async () => ({ slot: 1, address: key(4), account: { allowedStakeMint: key(3), feeRecipient: key(5), paused: false } }),
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
})
