import { describe, expect, it } from 'vitest'
import { PublicKey, SystemProgram } from '@solana/web3.js'

import {
  buildActivateRitualInstruction,
  buildCancelUnactivatedInstruction,
  buildCreateRitualInstruction,
  buildFundMemberInstruction,
  buildInitializeProtocolConfigInstruction,
  deriveCreateRitualAccounts,
  RitualInstructionBuildError,
} from './instructionsLifecycle'
import {
  createInput,
  expectBuildError,
  fullyFundedContext,
  lifecycleAddresses,
  lifecycleKey,
  lifecycleProgramId as programId,
  lifecycleSource as source,
  lifecycleContext,
  memberSet,
  validInitializeConfig,
} from './lifecycleBuilderTestHelpers'

const bytes = (value: Uint8Array) => Buffer.from(value).toString('hex')
const destinations = (count: number) => Array.from({ length: count }, (_, index) => lifecycleKey(41 + index))
const initialize = (overrides: Record<string, unknown> = {}) => ({ programId, authority: source.creator, config: { ...validInitializeConfig, ...overrides } })
const create = (memberCount = 3, nonce = 7n, overrides: Record<string, unknown> = {}) => ({ programId, creator: source.creator, stakeMint: source.stakeMint, feeRecipientToken: lifecycleKey(24), ritual: { ...createInput(memberCount, nonce), ...overrides } })
const fund = (overrides: Record<string, unknown> = {}) => ({ programId, ritual: lifecycleContext(), member: source.members[0], memberSource: lifecycleKey(32), ...overrides })
const activate = (overrides: Record<string, unknown> = {}) => ({ programId, ritual: fullyFundedContext(), ...overrides })
const cancel = (count = source.members.length, overrides: Record<string, unknown> = {}) => ({ programId, ritual: lifecycleContext(), caller: lifecycleKey(99), destinationTokenAccounts: destinations(count), ...overrides })

function expectInputError(call: () => unknown) {
  const error = expectBuildError(call)
  expect(error).toBeInstanceOf(RitualInstructionBuildError)
  expect((error as RitualInstructionBuildError).category).toBe('input')
}
function expectInvariantError(call: () => unknown) {
  const error = expectBuildError(call)
  expect((error as RitualInstructionBuildError).category).toBe('invariant')
}

// The matrix deliberately passes runtime-shaped values, not typed values.
describe('Ritual lifecycle builder states and boundaries', () => {
  it.each([
    ['initialize program', () => buildInitializeProtocolConfigInstruction({ ...initialize(), programId: 'bad' } as never)],
    ['initialize default program', () => buildInitializeProtocolConfigInstruction({ ...initialize(), programId: PublicKey.default } as never)],
    ['create program', () => buildCreateRitualInstruction({ ...create(), programId: 'bad' } as never)],
    ['create default program', () => buildCreateRitualInstruction({ ...create(), programId: PublicKey.default } as never)],
    ['fund program', () => buildFundMemberInstruction(fund({ programId: 'bad' } as never))],
    ['fund default program', () => buildFundMemberInstruction(fund({ programId: PublicKey.default } as never))],
    ['activate program', () => buildActivateRitualInstruction(activate({ programId: 'bad' } as never))],
    ['activate default program', () => buildActivateRitualInstruction(activate({ programId: PublicKey.default } as never))],
    ['cancel program', () => buildCancelUnactivatedInstruction(cancel(3, { programId: 'bad' } as never))],
    ['cancel default program', () => buildCancelUnactivatedInstruction(cancel(3, { programId: PublicKey.default } as never))],
  ])('rejects invalid programId directly: %s', (_name, call) => expectInputError(call))

  it.each([
    ['authority', () => buildInitializeProtocolConfigInstruction({ ...initialize(), authority: PublicKey.default })],
    ['creator', () => buildCreateRitualInstruction({ ...create(), creator: PublicKey.default })],
    ['stake mint', () => buildCreateRitualInstruction({ ...create(), stakeMint: PublicKey.default })],
    ['recipient', () => buildCreateRitualInstruction({ ...create(), feeRecipientToken: PublicKey.default })],
    ['member', () => buildFundMemberInstruction(fund({ member: PublicKey.default } as never))],
    ['member source', () => buildFundMemberInstruction(fund({ memberSource: PublicKey.default } as never))],
    ['caller', () => buildCancelUnactivatedInstruction(cancel(3, { caller: PublicKey.default } as never))],
  ])('rejects default direct key: %s', (_name, call) => expectInputError(call))

  it.each([
    ['authority', () => buildInitializeProtocolConfigInstruction({ ...initialize(), authority: 'bad' } as never)],
    ['creator', () => buildCreateRitualInstruction({ ...create(), creator: 'bad' } as never)],
    ['stake mint', () => buildCreateRitualInstruction({ ...create(), stakeMint: 'bad' } as never)],
    ['recipient', () => buildCreateRitualInstruction({ ...create(), feeRecipientToken: 'bad' } as never)],
    ['member', () => buildFundMemberInstruction(fund({ member: 'bad' } as never))],
    ['member source', () => buildFundMemberInstruction(fund({ memberSource: 'bad' } as never))],
    ['caller', () => buildCancelUnactivatedInstruction(cancel(3, { caller: 'bad' } as never))],
  ])('rejects invalid direct key type: %s', (_name, call) => expectInputError(call))

  it.each([
    ['null', null], ['number', 3], ['string', 'x'], ['array', []], ['undefined', undefined],
  ])('normalizes malformed top-level initialize args: %s', (_name, value) => expectInputError(() => buildInitializeProtocolConfigInstruction(value as never)))

  it.each([
    ['null ritual', { ritual: null }], ['null account', { ritual: { address: lifecycleAddresses.ritual, account: null } }],
    ['wrong address', { ritual: { ...lifecycleContext(), address: lifecycleKey(88) } }],
    ['wrong protocol', { ritual: lifecycleContext({ protocolConfig: lifecycleKey(88) }) }],
    ['program mismatch', { programId: lifecycleKey(88) }],
    ['sparse members', { ritual: lifecycleContext({ members: Object.assign([...source.members], { 3: undefined }) }) }],
    ['duplicate members', { ritual: lifecycleContext({ members: [source.members[0], source.members[0], source.members[2]] }) }],
  ])('rejects malformed/corrupt ritual context: %s', (_name, overrides) => expectInputOrInvariantOrCanonical(() => buildFundMemberInstruction(fund(overrides as never))))

  it.each(['Funding', 'Active', 'Completed', 'Cancelled'] as const)('cancel accepts only Funding state, rejects %s', status => {
    if (status === 'Funding') expect(() => buildCancelUnactivatedInstruction(cancel())).not.toThrow()
    else expectInvariantError(() => buildCancelUnactivatedInstruction(cancel(3, { ritual: lifecycleContext({ status }) })))
  })

  it('initialize encodes the exact valid config and fixed SystemProgram meta', () => {
    const instruction = buildInitializeProtocolConfigInstruction(initialize())
    expect(instruction.keys).toHaveLength(3)
    expect(instruction.keys[0].isWritable).toBe(true)
    expect(instruction.keys[1]).toMatchObject({ pubkey: source.creator, isSigner: true, isWritable: true })
    expect(instruction.keys[2].pubkey).toEqual(SystemProgram.programId)
    expect(instruction.data.length).toBe(98)
  })

  it.each([
    ['bps string', { feeBasisPoints: '250' }], ['minimum zero', { minimumFee: 0n }], ['maximum below minimum', { minimumFee: 9n, maximumFee: 8n }], ['stake string', { maximumMemberStake: '1000' }],
  ])('initialize rejects invalid raw fee config with stable BuildError: %s', (_name, values) => expectInputError(() => buildInitializeProtocolConfigInstruction(initialize(values))))

  it('create rejects missing creator membership and preserves exact direct mint/recipient metas', () => {
    expectInvariantError(() => buildCreateRitualInstruction({ ...create(), ritual: { ...createInput(), members: [lifecycleKey(61), lifecycleKey(62), lifecycleKey(63)] } }))
    const instruction = buildCreateRitualInstruction(create())
    expect(instruction.keys).toHaveLength(9)
    expect(instruction.keys[3].pubkey).toEqual(source.stakeMint)
    expect(instruction.keys[4].pubkey).toEqual(lifecycleKey(24))
  })

  it.each([2, 6] as const)('create builds valid N%s with exact nine metas', memberCount => {
    const instruction = buildCreateRitualInstruction(create(memberCount))
    expect(instruction.keys).toHaveLength(9)
    expect(instruction.data[8]).toBe(7)
    expect(instruction.keys[1].pubkey).toEqual(deriveCreateRitualAccounts(programId, source.creator, 7n).ritual)
  })

  it.each([0n, 0xffffffffffffffffn])('create nonce boundary derives matching ritual PDA: %s', nonce => {
    const instruction = buildCreateRitualInstruction(create(3, nonce))
    expect(instruction.keys[1].pubkey).toEqual(deriveCreateRitualAccounts(programId, source.creator, nonce).ritual)
  })

  it.each([
    ['duplicate', [source.creator, source.creator]],
    ['default', [source.creator, PublicKey.default]],
    ['sparse', Object.assign([source.creator, lifecycleKey(61)], { 1: undefined })],
  ])('create rejects %s members', (_name, members) => { expectBuildError(() => buildCreateRitualInstruction(create(3, 7n, { members } as never))) })

  it('create snapshots members, schedule, and immutable digest into fresh instruction data', () => {
    const input = create()
    const before = buildCreateRitualInstruction(input)
    const beforeData = bytes(before.data)
    const mutableMembers = [...input.ritual.members]
    const mutableSchedule = input.ritual.schedule.map(window => ({ ...window }))
    const mutableInput = { ...input, ritual: { ...input.ritual, members: mutableMembers, schedule: mutableSchedule, ruleDigest: input.ritual.ruleDigest } }
    const built = buildCreateRitualInstruction(mutableInput)
    mutableMembers[0] = lifecycleKey(77); mutableSchedule[0].opens = 101n
    expect(bytes(built.data)).toBe(beforeData)
    expect(built.data).not.toBe(before.data)
  })

  it.each([0, 1, 2] as const)('fund builds signer/member meta for each unfunded N3 member index: %s', index => {
    const context = lifecycleContext({ fundedMembersBitmap: index === 0 ? 0 : (1 << index) - 1, fundedMemberCount: index })
    const instruction = buildFundMemberInstruction(fund({ ritual: context, member: source.members[index] }))
    expect(instruction.keys[2]).toMatchObject({ pubkey: source.members[index], isSigner: true, isWritable: false })
    expect(instruction.keys[4]).toMatchObject({ pubkey: lifecycleKey(32), isWritable: true, isSigner: false })
  })

  it.each([
    ['already funded', 1, 1], ['nonmember', 0, 0, lifecycleKey(77)], ['count mismatch', 1, 0], ['out of mask', 8, 0],
  ])('fund rejects invalid Funding bitmap/member state: %s', (_name, bitmap, count, member = source.members[0]) => expectInvariantError(() => buildFundMemberInstruction(fund({ member, ritual: lifecycleContext({ fundedMembersBitmap: bitmap, fundedMemberCount: count }) }))))

  it.each(['Active', 'Completed', 'Cancelled'] as const)('fund rejects wrong status %s', status => expectInvariantError(() => buildFundMemberInstruction(fund({ ritual: lifecycleContext({ status }) }))))
  it.each(['stakeVault', 'feeVault'] as const)('fund rejects ritual vault source %s', field => expectInvariantError(() => buildFundMemberInstruction(fund({ memberSource: field === 'stakeVault' ? lifecycleAddresses.stakeVault : lifecycleAddresses.feeVault }))))

  it('activate accepts coherent fully-funded HOST and SPLIT contexts and uses locked recipient', () => {
    for (const context of [fullyFundedContext(3), fullyFundedContext(6)]) {
      for (const feePayerMode of ['Host', 'Split'] as const) {
        const recipient = lifecycleKey(55)
        const instruction = buildActivateRitualInstruction({ programId, ritual: { ...context, account: { ...context.account, feePayerMode, lockedFeeRecipient: recipient } } })
        expect(instruction.keys).toHaveLength(8)
        expect(instruction.keys[6]).toMatchObject({ pubkey: recipient, isWritable: true, isSigner: false })
      }
    }
  })

  it.each([
    ['partial bitmap', { fundedMembersBitmap: 3, fundedMemberCount: 2 }], ['count mismatch', { fundedMembersBitmap: 7, fundedMemberCount: 2 }], ['out of mask', { fundedMembersBitmap: 8, fundedMemberCount: 3 }],
    ['Active', { status: 'Active' }], ['Completed', { status: 'Completed' }], ['Cancelled', { status: 'Cancelled' }],
  ])('activate rejects invalid state: %s', (_name, overrides) => expectInvariantError(() => buildActivateRitualInstruction(activate({ ritual: lifecycleContext(overrides as never) }))))

  it.each([2, 6] as const)('cancel preserves destination order and exact writable nonsigner metas for N%s', count => {
    const values = destinations(count)
    const instruction = buildCancelUnactivatedInstruction(cancel(count, { ritual: lifecycleContext({ members: memberSet(count) }), destinationTokenAccounts: values }))
    expect(instruction.keys).toHaveLength(count + 6)
    expect(instruction.keys.slice(6).map(meta => meta.pubkey.toBase58())).toEqual(values.map(value => value.toBase58()))
    expect(instruction.keys.slice(6).every(meta => meta.isWritable && !meta.isSigner)).toBe(true)
  })

  it.each([
    ['duplicate', [lifecycleKey(41), lifecycleKey(41), lifecycleKey(43)]], ['default', [lifecycleKey(41), PublicKey.default, lifecycleKey(43)]], ['stake vault', [lifecycleAddresses.stakeVault, lifecycleKey(42), lifecycleKey(43)]], ['fee vault', [lifecycleKey(41), lifecycleAddresses.feeVault, lifecycleKey(43)]], ['wrong count', [lifecycleKey(41), lifecycleKey(42)]],
  ])('cancel rejects invalid destinations: %s', (_name, value) => { expectBuildError(() => buildCancelUnactivatedInstruction(cancel(3, { destinationTokenAccounts: value }))) })

  it('cancel snapshots destination keys and keeps caller signer separate from destination metas', () => {
    const values = destinations(3)
    const instruction = buildCancelUnactivatedInstruction(cancel(3, { destinationTokenAccounts: values }))
    values[0] = lifecycleKey(88)
    expect(instruction.keys[1]).toMatchObject({ pubkey: lifecycleKey(99), isSigner: true, isWritable: false })
    expect(instruction.keys[6].pubkey).toEqual(lifecycleKey(41))
  })

  it('fresh builds do not alias data, keys, or public keys', () => {
    const first = buildCancelUnactivatedInstruction(cancel())
    const second = buildCancelUnactivatedInstruction(cancel())
    expect(first).not.toBe(second)
    expect(first.data).not.toBe(second.data)
    expect(first.keys).not.toBe(second.keys)
    expect(first.keys[0].pubkey).not.toBe(second.keys[0].pubkey)
  })

  it('reads named account fields once and survives a hostile account getter', () => {
    const reads = new Map<string, number>()
    const context = lifecycleContext()
    const account = new Proxy(context.account, { get(target, property, receiver) { const name = String(property); reads.set(name, (reads.get(name) ?? 0) + 1); return Reflect.get(target, property, receiver) } })
    buildFundMemberInstruction(fund({ ritual: { address: context.address, account } }))
    for (const field of ['creator', 'nonce', 'protocolConfig', 'stakeMint', 'stakeVault', 'feeVault', 'bump', 'stakeVaultBump', 'feeVaultBump', 'status', 'fundedMembersBitmap', 'fundedMemberCount', 'lockedFeeRecipient', 'members']) expect(reads.get(field)).toBe(1)
  })
})

function expectInputOrInvariantOrCanonical(call: () => unknown) {
  const error = expectBuildError(call) as RitualInstructionBuildError
  expect(['input', 'invariant', 'canonical']).toContain(error.category)
}
