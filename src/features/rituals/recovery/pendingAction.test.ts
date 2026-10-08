import { describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { parsePendingAction, resolvePendingAction, type PendingActionRecord } from './pendingAction'
import { readPendingAction } from './readPendingAction'

const ritual = new PublicKey(new Uint8Array(32).fill(7)).toBase58()
const signature = '1'.repeat(64)
const base: PendingActionRecord = Object.freeze({
  version: 1,
  actionKind: 'create',
  ritualAddress: ritual,
  messageDigest: 'a'.repeat(64),
  transactionSignature: signature,
  blockhash: new PublicKey(new Uint8Array(32).fill(8)).toBase58(),
  lastValidBlockHeight: 100,
  createdAt: 1_700_000_000,
})

describe('pending action records', () => {
  it('persists the fund-and-activate recovery journal kind', () => {
    expect(parsePendingAction({ ...base, actionKind: 'fund-and-activate' })?.actionKind).toBe('fund-and-activate')
  })

  it('persists every solo action kind, so a killed app can recover a solo create or skip', () => {
    for (const kind of ['create-solo', 'create-solo-fund-and-activate', 'declare-skip'] as const) {
      expect(parsePendingAction({ ...base, actionKind: kind })?.actionKind).toBe(kind)
    }
  })

  it('still rejects an unknown action kind', () => {
    expect(parsePendingAction({ ...base, actionKind: 'withdraw-everything' })).toBeNull()
  })
})

describe('resolvePendingAction', () => {
  it('recovers a create killed after broadcast but before the signature was saved', async () => {
    const { transactionSignature: _ignored, ...unsigned } = base
    const result = await resolvePendingAction(unsigned, { getBlockHeight: async () => 200,
      getSignatureStatus: vi.fn(), readRitual: async () => ({ slot: 120, actionObserved: true }) })
    expect(result.status).toBe('confirmed')
  })
  it('does not invent expiry from a lost status or a lagging confirmed read', async () => {
    for (const status of [null, { slot: 120, err: null, confirmationStatus: 'confirmed' as const }]) {
      const result = await resolvePendingAction(base, { getBlockHeight: async () => 200,
        getSignatureStatus: async () => status, readRitual: async () => ({ slot: 100, actionObserved: true }) })
      expect(result.status).toBe('still-unknown')
    }
  })
  it('does not infer a legacy unsigned stamp from mere ritual existence', async () => {
    const { transactionSignature: _ignored, ...unsigned } = base
    const result = await resolvePendingAction({ ...unsigned, actionKind: 'claim' }, { getBlockHeight: async () => 200,
      getSignatureStatus: vi.fn(), readRitual: async () => ({ slot: 120, actionObserved: true }) })
    expect(result.status).toBe('still-unknown')
  })
  it('persists and reads the exact actor/week for a signatureless stamp', async () => {
    const { transactionSignature: _ignored, ...unsigned } = base
    const record = parsePendingAction({ ...unsigned, actionKind: 'initialize-event-and-claim', actor: ritual, eventIndex: 2 })!
    expect(record.eventIndex).toBe(2)
    expect(parsePendingAction({ ...record, eventIndex: 16 })).toBeNull()
    const getEventBundle = vi.fn(async () => ({ slot: 120, event: {}, claims: [{ member: new PublicKey(ritual), account: { status: 'Confirmed' } }] }))
    const client = { readRitual: async () => ({ slot: 120, account: {} }), getEventBundle } as never
    const result = await resolvePendingAction(record, { getBlockHeight: async () => 200, getSignatureStatus: vi.fn(),
      readRitual: (address, target) => readPendingAction(client, address, target) })
    expect(result.status).toBe('confirmed')
    expect(getEventBundle).toHaveBeenCalledWith(new PublicKey(ritual), 2)
  })
  it('confirms only after the signature and authoritative ritual readback agree', async () => {
    const readRitual = vi.fn(async () => ({ slot: 12, actionObserved: true }))
    const result = await resolvePendingAction(base, {
      getSignatureStatus: vi.fn(async () => ({ slot: 11, err: null, confirmationStatus: 'confirmed' as const })),
      getBlockHeight: vi.fn(async () => 90),
      readRitual,
    })
    expect(result).toEqual({ status: 'confirmed', record: base, slot: 12 })
    expect(readRitual).toHaveBeenCalledWith(new PublicKey(ritual), base)
  })

  it('classifies a landed transaction with failed status as failed', async () => {
    const result = await resolvePendingAction(base, {
      getSignatureStatus: vi.fn(async () => ({ slot: 11, err: { InstructionError: [0, 'Custom'] }, confirmationStatus: 'confirmed' as const })),
      getBlockHeight: vi.fn(async () => 90),
      readRitual: vi.fn(),
    })
    expect(result.status).toBe('failed')
  })

  it('classifies a never-sent record as expired once its blockheight is long past and the readback is empty', async () => {
    const { transactionSignature: _ignored, ...neverSent } = base
    const result = await resolvePendingAction(neverSent, {
      getSignatureStatus: vi.fn(),
      getBlockHeight: vi.fn(async () => 100 + 151),
      readRitual: vi.fn(async () => ({ slot: 251, actionObserved: false })),
    })
    expect(result).toEqual({ status: 'expired', record: neverSent })
  })

  it('does not trust a lagging node: an unsigned create stays unknown until 150 blocks past its last valid height', async () => {
    const { transactionSignature: _ignored, ...unsigned } = base
    const create = { ...unsigned, actionKind: 'create-solo-fund-and-activate' as const }
    const notFound = async () => ({ slot: 0, actionObserved: false })
    for (const height of [101, 250]) {
      expect((await resolvePendingAction(create, { getBlockHeight: async () => height, getSignatureStatus: vi.fn(), readRitual: notFound })).status).toBe('still-unknown')
    }
    expect((await resolvePendingAction(create, { getBlockHeight: async () => 251, getSignatureStatus: vi.fn(), readRitual: notFound })).status).toBe('expired')
    expect((await resolvePendingAction(create, { getBlockHeight: async () => 251, getSignatureStatus: vi.fn(), readRitual: async () => ({ slot: 300, actionObserved: true }) })).status).toBe('confirmed')
    expect((await resolvePendingAction(create, { getBlockHeight: async () => { throw new Error('RPC unavailable') }, getSignatureStatus: vi.fn(), readRitual: notFound })).status).toBe('still-unknown')
  })

  it('keeps a signed but not-yet-landed transaction unknown before expiry', async () => {
    const result = await resolvePendingAction(base, {
      getSignatureStatus: vi.fn(async () => null),
      getBlockHeight: vi.fn(async () => 100),
      readRitual: vi.fn(),
    })
    expect(result.status).toBe('still-unknown')
  })

  it('does not claim confirmation when the authoritative readback is not observed', async () => {
    const result = await resolvePendingAction(base, {
      getSignatureStatus: vi.fn(async () => ({ slot: 11, err: null, confirmationStatus: 'finalized' as const })),
      getBlockHeight: vi.fn(async () => 90),
      readRitual: vi.fn(async () => ({ slot: 12, actionObserved: false })),
    })
    expect(result.status).toBe('still-unknown')
  })
  it('lets a long-dead request go instead of saying "still checking" forever (phone, 2026-10-06)', async () => {
    const lost = await resolvePendingAction(base, { getBlockHeight: async () => 100 + 151,
      getSignatureStatus: async () => null, readRitual: async () => ({ slot: 300, actionObserved: false }) })
    expect(lost.status).toBe('expired')
    const landed = await resolvePendingAction(base, { getBlockHeight: async () => 100 + 151,
      getSignatureStatus: async () => null, readRitual: async () => ({ slot: 300, actionObserved: true }) })
    expect(landed.status).toBe('still-unknown')
    const { transactionSignature: _ignored, ...unsigned } = base
    const legacyStamp = await resolvePendingAction({ ...unsigned, actionKind: 'claim' }, { getBlockHeight: async () => 100 + 151,
      getSignatureStatus: vi.fn(), readRitual: async () => ({ slot: 120, actionObserved: true }) })
    expect(legacyStamp.status).toBe('expired')
  })
})
