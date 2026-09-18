import { describe, expect, it } from 'vitest'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { decodeRitual } from './accounts'
import { accountVectors, envelope } from './__fixtures__/accountVectors'
import { RITUAL_LIFECYCLE_RUST_MANIFESTS } from './instructionLifecycle.fixture'
import { buildActivateRitualInstruction, buildCancelUnactivatedInstruction, buildCreateRitualInstruction, buildFundMemberInstruction, buildInitializeProtocolConfigInstruction } from './instructionsLifecycle'
import { deriveCreateRitualAccounts } from './instructionsLifecycle'
import { VECTOR_PROGRAM_ID } from './__fixtures__/vectorProgramId'

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const programId = VECTOR_PROGRAM_ID
const manifest = (instruction: { programId: PublicKey; keys: readonly { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[]; data: Uint8Array }) => `program=${instruction.programId.toBase58()};${instruction.keys.map(meta => `${meta.pubkey.toBase58()}:${meta.isWritable ? 'w' : 'r'}/${meta.isSigner ? 's' : 'n'};`).join('')}${Buffer.from(instruction.data).toString('hex')}`

const source = decodeRitual(envelope(accountVectors.ritual.hex), programId)
const addresses = deriveCreateRitualAccounts(programId, source.creator, source.nonce)
const baseFunding = { ...source, status: 'Funding' as const, activatedAt: 0n, cancelledAt: 0n, completedAt: 0n, currentEventIndex: 0, settledEventCount: 0 }
const ritual = { address: addresses.ritual, account: baseFunding }
const partial = { address: addresses.ritual, account: { ...baseFunding, fundedMembersBitmap: 1, fundedMemberCount: 1, fundedStakeTotal: source.memberTotalStake, fundedFeeTotal: source.lockedActivationFee } }
const funded = { address: addresses.ritual, account: { ...baseFunding, fundedMembersBitmap: 7, fundedMemberCount: 3, fundedStakeTotal: source.memberTotalStake * 3n, fundedFeeTotal: source.lockedActivationFee } }
const destinations = [key(41), key(42), key(43)]

describe('Ritual lifecycle instruction builders', () => {
  it('matches Rust account-meta and data manifests for all lifecycle instructions', () => {
    const instructions = {
      initialize: buildInitializeProtocolConfigInstruction({ programId, authority: source.creator, config: { allowedStakeMint: source.stakeMint, feeRecipient: key(24), feeBasisPoints: 250, minimumFee: 11n, maximumFee: 999n, maximumMemberStake: 1000n } }),
      create: buildCreateRitualInstruction({ programId, creator: source.creator, stakeMint: source.stakeMint, feeRecipientToken: key(24), ritual: { nonce: 7n, ruleDigest: '1f'.repeat(32) as never, members: source.members, memberTotalStake: 200n, schedule: source.schedule, additionalConfirmationThreshold: 2, feePayerMode: 'HOST' } }),
      fund: buildFundMemberInstruction({ programId, ritual: partial, member: source.members[1], memberSource: key(32) }),
      activate: buildActivateRitualInstruction({ programId, ritual: funded }),
      cancel: buildCancelUnactivatedInstruction({ programId, ritual, caller: key(99), destinationTokenAccounts: destinations }),
    }
    expect(Object.keys(instructions)).toHaveLength(5)
    expect(instructions.initialize.keys).toHaveLength(3)
    expect(instructions.create.keys).toHaveLength(9)
    expect(instructions.fund.keys).toHaveLength(8)
    expect(instructions.activate.keys).toHaveLength(7)
    expect(instructions.cancel.keys).toHaveLength(9)
    expect(instructions.initialize.keys.at(-1)?.pubkey.equals(SystemProgram.programId)).toBe(true)
    expect(instructions.create.keys.at(-1)?.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true)
    expect(instructions.fund.keys.at(-1)?.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true)
    expect(instructions.activate.keys.at(-1)?.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true)
    expect(instructions.cancel.keys.at(-4)?.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true)
    for (const [name, instruction] of Object.entries(instructions)) { const actual = manifest(instruction); const expected = RITUAL_LIFECYCLE_RUST_MANIFESTS[name as keyof typeof RITUAL_LIFECYCLE_RUST_MANIFESTS]; if (actual !== expected) console.log('MISMATCH', name, actual); expect(actual).toBe(expected) }
  })

  it('lets an outsider caller build; chain time authorization remains onchain', () => {
    const instruction = buildCancelUnactivatedInstruction({ programId, ritual, caller: key(99), destinationTokenAccounts: destinations })
    expect(instruction.keys[1]).toMatchObject({ pubkey: key(99), isSigner: true, isWritable: false })
  })
})
