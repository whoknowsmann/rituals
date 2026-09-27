import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { buildApproveClaimInstruction, buildClaimCompletionInstruction } from './instructionsEvents'
import { decodeCompletionClaim, decodeRitual, decodeRitualEvent } from './accounts'
import { accountVectors, envelope, hexToBytes, ACCOUNT_VECTOR_OWNER } from './__fixtures__/accountVectors'
import { claimPda, eventPda, ritualPda } from './pdas'
import { VECTOR_PROGRAM_ID } from './__fixtures__/vectorProgramId'

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const programId = VECTOR_PROGRAM_ID
const decodedRitual = decodeRitual(envelope(accountVectors.ritual.hex), programId)
const ritualAddress = ritualPda(decodedRitual.creator, decodedRitual.nonce, programId)[0]
const ritual = { address: ritualAddress, account: { ...decodedRitual, season: key(77) } }
const decodedEvent = decodeRitualEvent(envelope(accountVectors.ritualEvent.hex), programId)
const eventAddress = eventPda(ritualAddress, decodedEvent.eventIndex, programId)[0]
const event = { address: eventAddress, account: decodedEvent }
const decodedClaim = decodeCompletionClaim(envelope(accountVectors.completionClaim.hex), programId)
const claimAddress = claimPda(eventAddress, decodedClaim.claimant, 0, programId)[0]
const claim = { address: claimAddress, account: decodedClaim }

describe('Season account metas on event actions', () => {
  it('includes the linked Season on claim and approval instructions', () => {
    const scheduled = { address: eventAddress, account: { ...decodedEvent, status: 'Scheduled' as const, claimedMembersBitmap: 0, confirmedMembersBitmap: 0, questionedMembersBitmap: 0 } }
    const claimInstruction = buildClaimCompletionInstruction({ programId, ritual, event: scheduled, claimant: decodedRitual.members[1] })
    const approvalInstruction = buildApproveClaimInstruction({ programId, ritual, event, claim, approver: decodedRitual.members[2] })
    expect(claimInstruction.keys.some((meta) => meta.pubkey.equals(ritual.account.season))).toBe(true)
    expect(approvalInstruction.keys.some((meta) => meta.pubkey.equals(ritual.account.season))).toBe(true)
  })

  it('decodes a confirmed solo witness claim with no member approval bitmap', () => {
    const data = hexToBytes(accountVectors.completionClaim.hex)
    data[108] = 1
    data[109] = 1
    data[110] = 0
    data[111] = 1
    const decoded = decodeCompletionClaim({ owner: new PublicKey(ACCOUNT_VECTOR_OWNER), data }, programId)
    expect(decoded.status).toBe('Confirmed')
    expect(decoded.requiredAdditionalConfirmations).toBe(1)
    expect(decoded.approvalCount).toBe(1)
    expect(decoded.approvalsBitmap).toBe(0)
  })
})
