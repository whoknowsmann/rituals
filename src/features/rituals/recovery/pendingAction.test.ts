import { describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { resolvePendingAction, type PendingActionRecord } from './pendingAction'

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

describe('resolvePendingAction', () => {
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

  it('classifies a never-sent record as expired after its blockheight passes', async () => {
    const { transactionSignature: _ignored, ...neverSent } = base
    const result = await resolvePendingAction(neverSent, {
      getSignatureStatus: vi.fn(),
      getBlockHeight: vi.fn(async () => 101),
      readRitual: vi.fn(),
    })
    expect(result).toEqual({ status: 'expired', record: neverSent })
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
})
