import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeCompletionClaim, decodeRitual, decodeRitualEvent } from './accounts'
import { accountVectors, envelope } from './__fixtures__/accountVectors'
import { claimPda, eventPda, ritualPda } from './pdas'
import { VECTOR_PROGRAM_ID } from './__fixtures__/vectorProgramId'
import { RitualInstructionBuildError } from './instructionsLifecycle'
import { buildApproveClaimInstruction, buildClaimCompletionInstruction, buildCloseTerminalVaultsInstruction, buildFinalizeEventInstruction, buildInitializeCurrentEventInstruction, buildQuestionClaimInstruction } from './instructionsEvents'

const programId = VECTOR_PROGRAM_ID
const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const ritualAccount = decodeRitual(envelope(accountVectors.ritual.hex), programId)
const ritualAddress = ritualPda(ritualAccount.creator, ritualAccount.nonce, programId)[0]
const ritual = { address: ritualAddress, account: ritualAccount }
const eventAccount = decodeRitualEvent(envelope(accountVectors.ritualEvent.hex), programId)
const eventAddress = eventPda(ritualAddress, eventAccount.eventIndex, programId)[0]
const event = { address: eventAddress, account: eventAccount }
const claimAccount = decodeCompletionClaim(envelope(accountVectors.completionClaim.hex), programId)
const claimAddress = claimPda(eventAddress, claimAccount.claimant, 0, programId)[0]
const claim = { address: claimAddress, account: claimAccount }
const scheduled = { address: eventAddress, account: { ...eventAccount, status: 'Scheduled' as const, claimedMembersBitmap: 0, confirmedMembersBitmap: 0, questionedMembersBitmap: 0 } }
const bases = {
  initialize: { programId, ritual, eventIndex: 0, payer: ritualAccount.creator },
  claim: { programId, ritual, event: scheduled, claimant: ritualAccount.members[1] },
  approve: { programId, ritual, event, claim, approver: ritualAccount.members[2] },
  question: { programId, ritual, event, claim, questioner: ritualAccount.members[2] },
  finalize: { programId, ritual, event, destinationTokenAccounts: [key(41), key(42), key(43)] },
  close: { programId, ritual: { address: ritualAddress, account: { ...ritualAccount, status: 'Completed' as const, vaultsClosed: false } } },
} as const
const builders = {
  initialize: (args: unknown) => buildInitializeCurrentEventInstruction(args as never),
  claim: (args: unknown) => buildClaimCompletionInstruction(args as never),
  approve: (args: unknown) => buildApproveClaimInstruction(args as never),
  question: (args: unknown) => buildQuestionClaimInstruction(args as never),
  finalize: (args: unknown) => buildFinalizeEventInstruction(args as never),
  close: (args: unknown) => buildCloseTerminalVaultsInstruction(args as never),
}
const malformed = [
  ['null args', null], ['array args', []], ['missing program', {}], ['null program', { programId: null }],
  ['array program', { programId: [] }], ['missing ritual', { ritual: undefined }], ['null ritual', { ritual: null }],
  ['array ritual', { ritual: [] }], ['missing account', { ritual: { address: ritualAddress, account: undefined } }],
  ['null account', { ritual: { address: ritualAddress, account: null } }], ['array account', { ritual: { address: ritualAddress, account: [] } }],
  ['default program', { programId: PublicKey.default }],
] as const

describe('event builder malformed-argument matrix', () => {
  for (const [name, value] of malformed) {
    for (const kind of Object.keys(builders) as (keyof typeof builders)[]) {
      it(`${kind} rejects ${name} with a stable BuildError`, () => {
        const args = value === null || Array.isArray(value) || Object.keys(value).length === 0
          ? value
          : { ...bases[kind], ...value }
        try { builders[kind](args) ; throw new Error('expected builder failure') } catch (error) {
          expect(error).toBeInstanceOf(RitualInstructionBuildError)
          expect(String((error as Error).message)).not.toMatch(/TypeError|undefined|cannot read/i)
        }
      })
    }
  }
})

const destinationCases: readonly [readonly PublicKey[]][] = [
  [[]], [[key(41)]], [[key(41), key(42)]], [[key(41), key(42), key(43), key(44)]],
  [(() => { const a: PublicKey[] = []; a.length = 3; return a })()],
]

describe('event builder destination shape matrix', () => {
  it.each(destinationCases)('finalize rejects malformed destination list', (destinationTokenAccounts) => {
    expect(() => buildFinalizeEventInstruction({ ...bases.finalize, destinationTokenAccounts })).toThrow(RitualInstructionBuildError)
  })
})
