import { describe, expect, it } from 'vitest'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { decodeCompletionClaim, decodeRitual, decodeRitualEvent } from './accounts'
import { accountVectors, envelope } from './__fixtures__/accountVectors'
import { claimPda, eventPda, ritualPda } from './pdas'
import { VECTOR_PROGRAM_ID } from './__fixtures__/vectorProgramId'
import { RITUAL_EVENT_RUST_MANIFESTS } from './instructionEvents.fixture'
import { buildApproveClaimInstruction, buildClaimCompletionInstruction, buildCloseTerminalVaultsInstruction, buildFinalizeEventInstruction, buildInitializeCurrentEventInstruction, buildQuestionClaimInstruction } from './instructionsEvents'

const programId = VECTOR_PROGRAM_ID
const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const manifest = (ix: { programId: PublicKey; keys: readonly { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[]; data: Uint8Array }) => `program=${ix.programId.toBase58()};${ix.keys.map(meta => `${meta.pubkey.toBase58()}:${meta.isWritable ? 'w' : 'r'}/${meta.isSigner ? 's' : 'n'};`).join('')}${Buffer.from(ix.data).toString('hex')}`
const decodedRitual = decodeRitual(envelope(accountVectors.ritual.hex), programId)
const ritualAddress = ritualPda(decodedRitual.creator, decodedRitual.nonce, programId)[0]
const ritual = { address: ritualAddress, account: decodedRitual }
const decodedEvent = decodeRitualEvent(envelope(accountVectors.ritualEvent.hex), programId)
const eventAddress = eventPda(ritualAddress, decodedEvent.eventIndex, programId)[0]
const event = { address: eventAddress, account: decodedEvent }
const decodedClaim = decodeCompletionClaim(envelope(accountVectors.completionClaim.hex), programId)
const claimAddress = claimPda(eventAddress, decodedClaim.claimant, 0, programId)[0]
const claim = { address: claimAddress, account: decodedClaim }
const destinations = [key(41), key(42), key(43)]

describe('Ritual event instruction builders', () => {
  it('matches the Rust meta and data vectors', () => {
    const scheduled = { address: eventAddress, account: { ...decodedEvent, status: 'Scheduled' as const, claimedMembersBitmap: 0, confirmedMembersBitmap: 0, questionedMembersBitmap: 0 } }
    const instructions = {
      initialize: buildInitializeCurrentEventInstruction({ programId, ritual, eventIndex: 0, payer: decodedRitual.creator }),
      claim: buildClaimCompletionInstruction({ programId, ritual, event: scheduled, claimant: decodedRitual.members[1] }),
      approve: buildApproveClaimInstruction({ programId, ritual, event, claim, approver: decodedRitual.members[2] }),
      question: buildQuestionClaimInstruction({ programId, ritual, event, claim, questioner: decodedRitual.members[2] }),
      finalize: buildFinalizeEventInstruction({ programId, ritual, event, destinationTokenAccounts: destinations }),
      close: buildCloseTerminalVaultsInstruction({ programId, ritual: { address: ritualAddress, account: { ...decodedRitual, status: 'Completed' as const, vaultsClosed: false } } }),
    }
    expect(Object.keys(instructions)).toHaveLength(6)
    expect(instructions.initialize.keys).toHaveLength(4)
    expect(instructions.claim.keys).toHaveLength(5)
    expect(instructions.approve.keys).toHaveLength(4)
    expect(instructions.question.keys).toHaveLength(4)
    expect(instructions.finalize.keys).toHaveLength(8)
    expect(instructions.close.keys).toHaveLength(5)
    expect(instructions.initialize.keys.at(-1)?.pubkey).toEqual(SystemProgram.programId)
    for (const [name, ix] of Object.entries(instructions)) { const actual = manifest(ix); expect(actual).toBe(RITUAL_EVENT_RUST_MANIFESTS[name as keyof typeof RITUAL_EVENT_RUST_MANIFESTS]) }
  })

  it('rejects claim completion from a Resolving event', () => {
    const resolving = { address: eventAddress, account: { ...decodedEvent, status: 'Resolving' as const, claimedMembersBitmap: 0, confirmedMembersBitmap: 0, questionedMembersBitmap: 0 } }
    expect(() => buildClaimCompletionInstruction({ programId, ritual, event: resolving, claimant: decodedRitual.members[1] })).toThrow(/invariant/)
  })

  it('requires an approver claim bit before approving', () => {
    const resolving = { address: eventAddress, account: { ...decodedEvent, status: 'Resolving' as const, claimedMembersBitmap: 0, confirmedMembersBitmap: 0, questionedMembersBitmap: 0 } }
    expect(() => buildApproveClaimInstruction({ programId, ritual, event: resolving, claim, approver: decodedRitual.members[2] })).toThrow(/invariant/)
  })

  it('requires a questioner claim bit before questioning', () => {
    const resolving = { address: eventAddress, account: { ...decodedEvent, status: 'Resolving' as const, claimedMembersBitmap: 0, confirmedMembersBitmap: 0, questionedMembersBitmap: 0 } }
    expect(() => buildQuestionClaimInstruction({ programId, ritual, event: resolving, claim, questioner: decodedRitual.members[2] })).toThrow(/invariant/)
  })
})
