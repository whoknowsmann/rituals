import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import type { SoloRitualBundle } from './soloRitualModel'
import { soloReceiptModel } from './soloReceiptModel'

const me = new PublicKey(new Uint8Array(32).fill(7))
const address = new PublicKey(new Uint8Array(32).fill(6))
const destination = new PublicKey(new Uint8Array(32).fill(9))
const bundle = (status: string, overrides: Record<string, unknown> = {}, claimStatus?: string) => ({ ritual: { address, account: { stakeDecimals: 6, perEventAllocation: 5_000_000n, forfeitDestination: destination, members: [me] } }, event: { account: { status, eventIndex: 0, forfeitedTotal: 0n, ...overrides } }, claims: [{ member: me, account: claimStatus ? { status: claimStatus } : null }] }) as unknown as SoloRitualBundle

describe('soloReceiptModel', () => {
  it('waits until the event is terminal', () => {
    expect(soloReceiptModel(bundle('Resolving'), me).state).toBe('pending')
  })
  it('maps a confirmed settled claim to kept and the allocation amount', () => {
    expect(soloReceiptModel(bundle('Settled', {}, 'Confirmed'), me)).toMatchObject({ state: 'kept', amount: 5_000_000n, copy: 'back to you' })
  })
  it('maps a forfeited settled event to missed and its destination', () => {
    expect(soloReceiptModel(bundle('Settled', { forfeitedTotal: 5_000_000n }), me)).toMatchObject({ state: 'missed', copy: expect.stringContaining('went to') })
  })
  it('maps a declared skip to skipped', () => {
    expect(soloReceiptModel(bundle('Voided', { voidReason: 'DeclaredSkip' }), me).state).toBe('skipped')
  })
})
