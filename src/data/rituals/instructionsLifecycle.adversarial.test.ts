import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeRitual } from './accounts'
import { accountVectors, envelope } from './__fixtures__/accountVectors'
import { deriveCreateRitualAccounts, RitualInstructionBuildError, buildActivateRitualInstruction, buildCancelUnactivatedInstruction, buildCreateRitualInstruction, buildFundMemberInstruction, buildInitializeProtocolConfigInstruction } from './instructionsLifecycle'
import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const programId = LOCAL_PLACEHOLDER_PROGRAM_ID
const decoded = decodeRitual(envelope(accountVectors.ritual.hex), programId)
const addresses = deriveCreateRitualAccounts(programId, decoded.creator, decoded.nonce)
const funding = { address: addresses.ritual, account: { ...decoded, status: 'Funding' as const, activatedAt: 0n, cancelledAt: 0n, completedAt: 0n, currentEventIndex: 0, settledEventCount: 0, fundedMembersBitmap: 0, fundedMemberCount: 0, fundedStakeTotal: 0n, fundedFeeTotal: 0n } }
const funded = { address: addresses.ritual, account: { ...funding.account, fundedMembersBitmap: 7, fundedMemberCount: 3, fundedStakeTotal: decoded.memberTotalStake * 3n, fundedFeeTotal: decoded.lockedActivationFee } }
const create = { nonce: 7n, ruleDigest: '1f'.repeat(32) as never, members: decoded.members, memberTotalStake: 200n, schedule: decoded.schedule, additionalConfirmationThreshold: 2, feePayerMode: 'HOST' as const }
const init = { allowedStakeMint: decoded.stakeMint, feeRecipient: key(24), feeBasisPoints: 250, minimumFee: 11n, maximumFee: 999n, maximumMemberStake: 1000n }
const expectBuildError = (call: () => unknown, category?: string) => { try { call(); throw new Error('expected builder failure') } catch (error) { expect(error).toBeInstanceOf(RitualInstructionBuildError); if (category) expect((error as RitualInstructionBuildError).category).toBe(category) } }

describe('lifecycle builder adversarial boundary', () => {
  it.each([
    ['null', null], ['number', 3], ['string', 'x'], ['array', []], ['undefined', undefined],
  ])('rejects malformed initialize args: %s', (_name, value) => expectBuildError(() => buildInitializeProtocolConfigInstruction(value as never), 'input'))
  it.each([
    ['null', null], ['number', 3], ['array', []], ['missing config', { programId, authority: key(1) }],
  ])('rejects malformed create args: %s', (_name, value) => expectBuildError(() => buildCreateRitualInstruction(value as never), 'input'))
  it.each([
    ['null', null], ['number', 3], ['array', []], ['missing ritual', { programId, member: key(1), memberSource: key(2) }],
  ])('rejects malformed fund args: %s', (_name, value) => expectBuildError(() => buildFundMemberInstruction(value as never), 'input'))
  it.each([
    ['null', null], ['number', 3], ['array', []], ['missing ritual', { programId }],
  ])('rejects malformed activate args: %s', (_name, value) => expectBuildError(() => buildActivateRitualInstruction(value as never), 'input'))
  it.each([
    ['null', null], ['number', 3], ['array', []], ['missing destinations', { programId, ritual: funding, caller: key(9) }],
  ])('rejects malformed cancel args: %s', (_name, value) => expectBuildError(() => buildCancelUnactivatedInstruction(value as never), 'input'))

  it.each([-1n, 0xffffffffffffffffn + 1n, '7', 7, null])('normalizes invalid derive nonce %s', nonce => expectBuildError(() => deriveCreateRitualAccounts(programId, decoded.creator, nonce as never), 'input'))
  it.each([0n, 0xffffffffffffffffn])('supports canonical boundary nonce %s', nonce => expect(() => deriveCreateRitualAccounts(programId, decoded.creator, nonce)).not.toThrow())

  it('rejects sparse create members and cancel destinations', () => {
    const members = [decoded.members[0], decoded.members[1], decoded.members[2]] as PublicKey[]
    delete members[1]
    expectBuildError(() => buildCreateRitualInstruction({ programId, creator: decoded.creator, stakeMint: decoded.stakeMint, feeRecipientToken: key(24), ritual: { ...create, members } }), 'input')
    const destinations = [key(41), key(42), key(43)] as PublicKey[]
    delete destinations[1]
    expectBuildError(() => buildCancelUnactivatedInstruction({ programId, ritual: funding, caller: key(9), destinationTokenAccounts: destinations }), 'input')
  })

  it.each(['protocolConfig', 'stakeVault', 'feeVault', 'bump', 'stakeVaultBump', 'feeVaultBump'] as const)('rejects noncanonical %s', field => {
    const account = { ...funding.account, [field]: field === 'bump' || field.endsWith('Bump') ? 0 : key(88) }
    expectBuildError(() => buildFundMemberInstruction({ programId, ritual: { address: addresses.ritual, account }, member: decoded.members[0], memberSource: key(32) }), 'canonical')
  })

  it('snapshots context fields and does not spread hostile account objects', () => {
    let reads = 0
    const account = new Proxy(funding.account, { get(target, property) { reads += 1; return Reflect.get(target, property) } })
    const instruction = buildFundMemberInstruction({ programId, ritual: { address: addresses.ritual, account }, member: decoded.members[0], memberSource: key(32) })
    expect(instruction.keys).toHaveLength(8)
    expect(reads).toBeLessThan(30)
  })

  it('rejects partial and wrong-status activation', () => {
    expectBuildError(() => buildActivateRitualInstruction({ programId, ritual: funding }), 'invariant')
    expectBuildError(() => buildActivateRitualInstruction({ programId, ritual: { address: addresses.ritual, account: { ...funded.account, status: 'Active' } } }), 'invariant')
  })

  it.each([
    ['nonmember', key(77), 0], ['already funded', decoded.members[0], 1], ['wrong status', decoded.members[0], 2],
  ])('rejects invalid funding state: %s', (_name, member, bitmap) => {
    const account = { ...funding.account, fundedMembersBitmap: bitmap, fundedMemberCount: bitmap === 1 ? 1 : 0, status: bitmap === 2 ? 'Active' as const : 'Funding' as const }
    expectBuildError(() => buildFundMemberInstruction({ programId, ritual: { address: addresses.ritual, account }, member, memberSource: key(32) }), 'invariant')
  })

  it('uses locked fee recipient and copies instruction-owned data', () => {
    const recipient = key(55)
    const account = { ...funded.account, lockedFeeRecipient: recipient }
    const instruction = buildActivateRitualInstruction({ programId, ritual: { address: addresses.ritual, account } })
    expect(instruction.keys[5].pubkey.equals(recipient)).toBe(true)
    const members = [...decoded.members]
    const args = { programId, creator: decoded.creator, stakeMint: decoded.stakeMint, feeRecipientToken: key(24), ritual: { ...create, members } }
    const built = buildCreateRitualInstruction(args)
    members[0] = key(99)
    expect(built.data.length).toBeGreaterThan(8)
  })

  it('accepts outsider cancellation but rejects duplicate, vault, and wrong-count destinations', () => {
    const valid = [key(41), key(42), key(43)]
    expect(() => buildCancelUnactivatedInstruction({ programId, ritual: funding, caller: key(99), destinationTokenAccounts: valid })).not.toThrow()
    for (const destinations of [[key(41), key(41), key(43)], [addresses.stakeVault, key(42), key(43)], [key(41), key(42)]]) expectBuildError(() => buildCancelUnactivatedInstruction({ programId, ritual: funding, caller: key(99), destinationTokenAccounts: destinations }), 'invariant')
  })
})
