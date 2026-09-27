import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import type { SoloRitualBundle } from './soloRitualModel'
import { witnessConfirmModel } from './witnessConfirmModel'

const claimant = new PublicKey(new Uint8Array(32).fill(7))
const witness = new PublicKey(new Uint8Array(32).fill(8))
const address = new PublicKey(new Uint8Array(32).fill(6))
const bundle = (claimStatus = 'Pending') => ({ ritual: { address, account: { members: [claimant], witness, additionalConfirmationThreshold: 1 } }, event: { account: { status: 'Claiming', claimedMembersBitmap: 1, confirmedMembersBitmap: claimStatus === 'Confirmed' ? 1 : 0 } }, claims: [{ member: claimant, account: { status: claimStatus } }] }) as unknown as SoloRitualBundle

describe('witnessConfirmModel', () => {
  it('authorizes only the ritual witness', () => {
    expect(witnessConfirmModel(bundle(), witness, 'Run three miles').authorized).toBe(true)
    expect(witnessConfirmModel(bundle(), claimant, 'Run three miles').authorized).toBe(false)
  })
  it('uses people-first copy and preserves a known requirement', () => {
    expect(witnessConfirmModel(bundle(), witness, 'Run three miles')).toMatchObject({ name: expect.stringContaining('your friend'), requirement: 'Run three miles' })
  })
  it('recognizes the confirmed readback', () => {
    expect(witnessConfirmModel(bundle('Confirmed'), witness, null).state).toBe('confirmed')
  })
})
