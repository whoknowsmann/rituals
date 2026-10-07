import { Buffer } from 'buffer'
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { encodeEjectRitualData } from './instructionData'
import { buildInitializeCurrentEventInstruction } from './instructionsEvents'
import { RitualInstructionBuildError, type RitualAccountContext } from './instructionsLifecycle'
import { eventPda } from './pdas'

export type BuildEjectRitualArgs = Readonly<{
  programId: PublicKey
  ritual: RitualAccountContext
  creator: PublicKey
  creatorDestination: PublicKey
  expectedForfeit: bigint
}>

export function buildEjectRitualInstruction(args: BuildEjectRitualArgs): TransactionInstruction {
  const { programId, ritual, creator, creatorDestination, expectedForfeit } = args
  const a = ritual.account
  // Reuse the canonical ritual/vault/schedule checks, without initializing anything.
  buildInitializeCurrentEventInstruction({ programId, ritual, payer: creator, eventIndex: a.currentEventIndex })
  if (a.kind !== 'Solo' || a.members.length !== 1 || !a.creator.equals(creator)) throw new RitualInstructionBuildError('authorization', 'only the solo creator can end a ritual')
  if (!(creatorDestination instanceof PublicKey) || creatorDestination.equals(PublicKey.default) || [a.stakeVault, a.feeVault, a.forfeitDestination].some(k => k.equals(creatorDestination))) throw new RitualInstructionBuildError('input', 'invalid creator destination')
  if (expectedForfeit > a.fundedStakeTotal) throw new RitualInstructionBuildError('invariant', 'forfeit exceeds the remaining stake')
  const meta = (pubkey: PublicKey, isWritable = true, isSigner = false) => ({ pubkey: new PublicKey(pubkey.toBytes()), isWritable, isSigner })
  return new TransactionInstruction({ programId: new PublicKey(programId.toBytes()), data: Buffer.from(encodeEjectRitualData(expectedForfeit)), keys: [
    meta(ritual.address), meta(creator, true, true), meta(a.stakeMint, false), meta(a.stakeVault), meta(a.feeVault),
    meta(creatorDestination), meta(a.forfeitDestination), meta(TOKEN_PROGRAM_ID, false), meta(SystemProgram.programId, false),
    ...a.schedule.slice(a.currentEventIndex).map((_, offset) => meta(eventPda(ritual.address, a.currentEventIndex + offset, programId)[0])),
  ] })
}
