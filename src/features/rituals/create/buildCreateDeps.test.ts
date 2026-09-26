import { describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { buildCreateRitualDeps, CreateDepsError } from './buildCreateDeps'
import { WEEKLY_CADENCE } from '../../../domain/rituals/schedule'
import type { PendingActionStore } from '../recovery/pendingAction'
import type { ValidatedRitualDraft } from './draftForm'

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const CREATOR = key(1)
const FRIEND = key(2)
const MINT = key(3)
const FEE_RECIPIENT = key(4)
const PROGRAM = key(5)

const draft: ValidatedRitualDraft = {
  title: 'Morning run',
  requirement: 'Run two miles before work.',
  memberCount: 2,
  eventCount: 2,
  memberTotalStake: '2',
  memberTotalStakeAtomic: 2_000_000n,
  confirmationMode: 'ONE_FRIEND',
  feePayerMode: 'HOST',
  additionalConfirmationThreshold: 1,
} as ValidatedRitualDraft

const config = {
  slot: 10,
  address: PROGRAM,
  account: {
    allowedStakeMint: MINT,
    feeRecipient: FEE_RECIPIENT,
    feeBasisPoints: 200,
    paused: false,
  },
}

function client(overrides: Record<string, unknown> = {}) {
  return {
    programId: PROGRAM,
    getProtocolConfig: vi.fn(async () => config),
    prepareCreate: vi.fn(async () => ({
      kind: 'create',
      messageDigest: 'a'.repeat(64),
      ritualAddress: key(9).toBase58(),
    })),
    submitPrepared: vi.fn(async () => ({ opaque: true })),
    confirmSubmitted: vi.fn(async () => ({
      signature: 's'.repeat(88),
      messageDigest: 'a'.repeat(64),
    })),
    ...overrides,
  } as never
}

const params = (over: Record<string, unknown> = {}) => ({
  client: client(),
  creator: CREATOR,
  members: [CREATOR, FRIEND],
  draft,
  cadence: WEEKLY_CADENCE,
  firstEventAt: 1_800_000_000,
  ...over,
}) as never

describe('buildCreateRitualDeps: authoritative sourcing', () => {
  it('takes the stake mint and fee recipient from ProtocolConfig, never from the draft', async () => {
    const c = client()
    const deps = buildCreateRitualDeps(params({ client: c }))
    await deps.prepare()
    const call = (c as never as { prepareCreate: { mock: { calls: unknown[][] } } }).prepareCreate.mock.calls[0][0] as Record<string, PublicKey>
    expect(call.stakeMint.equals(MINT)).toBe(true)
    expect(call.feeRecipientToken.equals(FEE_RECIPIENT)).toBe(true)
  })

  it('uses the program id reported by the authoritative read', async () => {
    const c = client()
    const deps = buildCreateRitualDeps(params({ client: c }))
    await deps.prepare()
    const call = (c as never as { prepareCreate: { mock: { calls: unknown[][] } } }).prepareCreate.mock.calls[0][0] as Record<string, PublicKey>
    expect(call.programId.equals(PROGRAM)).toBe(true)
  })

  it('uses the atomic create-and-fund preparation when the creator ATA is available', async () => {
    const c = client({ prepareCreateAndFund: vi.fn(async () => ({ kind: 'create-and-fund', messageDigest: 'a'.repeat(64), ritualAddress: key(9).toBase58() })) })
    const deps = buildCreateRitualDeps(params({ client: c, creatorTokenAccount: key(7) }))
    await deps.prepare()
    expect((c as never as { prepareCreateAndFund: { mock: { calls: unknown[][] } } }).prepareCreateAndFund.mock.calls[0][0]).toMatchObject({ creator: CREATOR, memberSource: key(7), lockedActivationFee: expect.any(BigInt) })
    expect((c as never as { prepareCreate: { mock: { calls: unknown[][] } } }).prepareCreate).toBeDefined()
  })

  it('refuses to prepare while the protocol is paused', async () => {
    const paused = client({
      getProtocolConfig: vi.fn(async () => ({ ...config, account: { ...config.account, paused: true } })),
    })
    const deps = buildCreateRitualDeps(params({ client: paused }))
    await expect(deps.prepare()).rejects.toThrow(/paused/i)
  })

  it('generates a schedule matching the drafted event count', async () => {
    const c = client()
    const deps = buildCreateRitualDeps(params({ client: c }))
    await deps.prepare()
    const call = (c as never as { prepareCreate: { mock: { calls: unknown[][] } } }).prepareCreate.mock.calls[0][0] as { ritual: { schedule: unknown[] } }
    expect(call.ritual.schedule).toHaveLength(2)
  })

  it('draws a fresh nonce on each preparation', async () => {
    const c = client()
    const deps = buildCreateRitualDeps(params({ client: c }))
    await deps.prepare()
    await deps.prepare()
    const calls = (c as never as { prepareCreate: { mock: { calls: unknown[][] } } }).prepareCreate.mock.calls
    const first = (calls[0][0] as { ritual: { nonce: bigint } }).ritual.nonce
    const second = (calls[1][0] as { ritual: { nonce: bigint } }).ritual.nonce
    expect(first).not.toBe(second)
  })
})

describe('buildCreateRitualDeps: roster validation', () => {
  it('rejects a roster that does not match the drafted member count', () => {
    expect(() => buildCreateRitualDeps(params({ members: [CREATOR] }))).toThrow(CreateDepsError)
  })

  it('rejects a roster whose first member is not the creator', () => {
    expect(() => buildCreateRitualDeps(params({ members: [FRIEND, CREATOR] }))).toThrow(/creator/i)
  })

  it('rejects a non-PublicKey member', () => {
    expect(() => buildCreateRitualDeps(params({ members: [CREATOR, 'nope'] }))).toThrow(/PublicKey/i)
  })
})

describe('buildCreateRitualDeps: step ordering', () => {
  it('refuses to submit before preparing', async () => {
    const deps = buildCreateRitualDeps(params())
    await expect(deps.submit({} as never)).rejects.toThrow(/before preparing/i)
  })

  it('refuses to confirm before submitting', async () => {
    const deps = buildCreateRitualDeps(params())
    await expect(deps.confirm({} as never)).rejects.toThrow(/before submitting/i)
  })

  it('completes prepare -> submit -> confirm and returns the signature', async () => {
    const deps = buildCreateRitualDeps(params())
    const prepared = await deps.prepare()
    const handle = await deps.submit(prepared)
    const result = await deps.confirm(handle)
    expect(result.signature).toBe('s'.repeat(88))
  })

  it('persists the reviewed action before wallet handoff and adds the signature after return', async () => {
    const store = {
      list: vi.fn(async () => []),
      upsert: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    } as PendingActionStore
    const c = client({
      prepareCreate: vi.fn(async () => ({
        kind: 'create',
        messageDigest: 'a'.repeat(64),
        ritualAddress: key(9).toBase58(),
        blockhash: key(8).toBase58(),
        lastValidBlockHeight: 77,
      })),
      submitPrepared: vi.fn(async () => ({ signature: '1'.repeat(64) })),
    })
    const deps = buildCreateRitualDeps(params({ client: c, pendingActionStore: store, now: () => 1234 }))
    const prepared = await deps.prepare()
    const handle = await deps.submit(prepared)
    expect(store.upsert).toHaveBeenCalledTimes(2)
    expect((store.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty('transactionSignature')
    expect((store.upsert as ReturnType<typeof vi.fn>).mock.calls[1][0]).toMatchObject({ transactionSignature: '1'.repeat(64), lastValidBlockHeight: 77 })
    await deps.confirm(handle)
    expect(store.remove).toHaveBeenCalledTimes(1)
  })

  it('fails before signing when the authorized creator account changes', async () => {
    let current = CREATOR
    const deps = buildCreateRitualDeps(params({ authorizedActor: () => current }))
    const prepared = await deps.prepare()
    current = FRIEND
    await expect(deps.submit(prepared)).rejects.toThrow(/authorized wallet account changed/i)
  })

  it('rejects an expired prepared blockhash before submission', async () => {
    const c = client({
      prepareCreate: vi.fn(async () => ({ kind: 'create', messageDigest: 'a'.repeat(64), ritualAddress: key(9).toBase58(), blockhash: key(8).toBase58(), lastValidBlockHeight: 77 })),
      submitPrepared: vi.fn(async () => ({ signature: '1'.repeat(64) })),
    })
    const deps = buildCreateRitualDeps(params({ client: c, getBlockHeight: async () => 78 }))
    const prepared = await deps.prepare()
    await expect(deps.submit(prepared)).rejects.toMatchObject({ blockhashExpired: true })
    expect((c as unknown as { submitPrepared: ReturnType<typeof vi.fn> }).submitPrepared).not.toHaveBeenCalled()
  })

  it('never exposes the opaque submission handle to the caller', async () => {
    const deps = buildCreateRitualDeps(params())
    const prepared = await deps.prepare()
    const handle = await deps.submit(prepared)
    expect(Object.keys(handle)).toEqual(['id'])
    expect((handle as unknown as Record<string, unknown>).opaque).toBeUndefined()
  })
})

