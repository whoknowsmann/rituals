import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { RitualRpcError, RitualsRpcReader } from './ritualsRpc'
import { RitualConfirmationError, RitualConfirmationVerifier, type RitualConfirmationTransport } from './ritualConfirmation'
import { lifecycleContext, lifecycleSource, fullyFundedContext } from './lifecycleBuilderTestHelpers'
import { FakeConfirm, StubReader, action, address, blockhash, bundleFor, created, encodeBase58, expectations, funded, validSignatures } from './ritualConfirmation.adversarial.helpers'

const ok = (account = lifecycleContext().account, slot = 50) => ({ reader: Object.assign(new StubReader(), { bundle: bundleFor(account, slot) }), transport: new FakeConfirm() })
const invalidSignatures: unknown[][] = ['', '1'.repeat(63), '1'.repeat(65), '1'.repeat(87), '1'.repeat(91), '0'.repeat(64), 'O'.repeat(64), 'I'.repeat(64), 'l'.repeat(64), ` ${validSignatures[0]}`, `${validSignatures[0]} `, 1, null].map((signature) => [signature])
const expectInput = async (value: unknown, field?: string) => {
  const { reader, transport } = ok()
  await expect(new RitualConfirmationVerifier(reader, transport).confirmAndReadRitual(value)).rejects.toMatchObject({ category: 'input' })
  expect(reader.calls).toHaveLength(0)
  if (field) expect(transport.calls).toHaveLength(0)
}

describe('Ritual confirmation adversarial transport and snapshots', () => {
  it.each([
    ['reader null', null], ['reader primitive', 1], ['reader array', []], ['reader plain', {}],
    ['transport null', null], ['transport primitive', 1], ['transport array', []], ['transport missing', {}],
    ['transport nonfunction', { confirmTransaction: 1 }],
  ])('rejects malformed dependency: %s', (_name, value) => {
    if (String(_name).startsWith('reader')) expect(() => new RitualConfirmationVerifier(value as never, new FakeConfirm())).toThrow(RitualConfirmationError)
    else expect(() => new RitualConfirmationVerifier(new StubReader(), value as never)).toThrow(RitualConfirmationError)
  })
  it('reads and binds the transport method once', async () => {
    const calls: string[] = []; const transportCalls: unknown[] = []
    const method = function (this: unknown, strategy: unknown, commitment: unknown) { expect(this).toBe(transport); transportCalls.push(strategy, commitment); return Promise.resolve({ context: { slot: 50 }, value: { err: null } }) }
    const transport = Object.defineProperty({}, 'confirmTransaction', { get() { calls.push('get'); return method } })
    const result = await new RitualConfirmationVerifier(ok().reader, transport as never).confirmAndReadRitual(action(created))
    expect(result.signature).toBe(validSignatures[0]); expect(calls).toEqual(['get']); expect(transportCalls).toHaveLength(2)
  })
  it('binds confirmTransaction this and does not touch production dependencies', () => {
    const target = new FakeConfirm(); const transport = { confirmTransaction: target.confirmTransaction }
    expect(() => new RitualConfirmationVerifier(new StubReader(), transport)).not.toThrow()
    const hostile = new Proxy({}, { get() { throw new Error('touched') } })
    expect(() => { new (require('./ritualConfirmation').RitualConfirmationVerifier)(hostile, hostile) }).toThrow()
  })
  it('sanitizes a revoked reader proxy and a throwing transport getter', () => {
    const target = new StubReader(); const revoked = Proxy.revocable(target, {}); revoked.revoke()
    expect(() => new RitualConfirmationVerifier(revoked.proxy as never, new FakeConfirm())).toThrowError(RitualConfirmationError)
    const transport = Object.defineProperty({}, 'confirmTransaction', { get() { throw new Error('secret') } })
    expect(() => new RitualConfirmationVerifier(target, transport as never)).toThrowError(RitualConfirmationError)
  })

  const malformedActions: Array<[string, unknown]> = [
    ['action null', null], ['action primitive', 1], ['action array', []], ['action missing', {}],
    ...(['signature', 'blockhash', 'lastValidBlockHeight', 'submittedContextSlot', 'ritualAddress', 'expectation'] as const).map((field) => [field + ' missing', { ...action(created), [field]: undefined }] as [string, unknown]),
    ['height negative', action(created, { lastValidBlockHeight: -1 })], ['height fraction', action(created, { lastValidBlockHeight: 1.5 })], ['height nan', action(created, { lastValidBlockHeight: NaN })], ['height infinity', action(created, { lastValidBlockHeight: Infinity })], ['height string', action(created, { lastValidBlockHeight: '1' })], ['height unsafe', action(created, { lastValidBlockHeight: Number.MAX_SAFE_INTEGER + 1 })],
    ['submitted negative', action(created, { submittedContextSlot: -1 })], ['submitted fraction', action(created, { submittedContextSlot: 1.5 })], ['submitted nan', action(created, { submittedContextSlot: NaN })], ['submitted infinity', action(created, { submittedContextSlot: Infinity })], ['submitted string', action(created, { submittedContextSlot: '1' })], ['submitted unsafe', action(created, { submittedContextSlot: Number.MAX_SAFE_INTEGER + 1 })],
    ['blockhash default', action(created, { blockhash: PublicKey.default.toBase58() })], ['blockhash invalid alphabet', action(created, { blockhash: '0'.repeat(44) })], ['blockhash short', action(created, { blockhash: '1' })], ['blockhash long', action(created, { blockhash: '1'.repeat(45) })], ['blockhash wrong type', action(created, { blockhash: 1 })],
    ['ritual default', action(created, { ritualAddress: PublicKey.default })], ['ritual wrong type', action(created, { ritualAddress: {} })], ['expectation null', action(null)], ['expectation array', action([])], ['expectation unknown', action({ kind: 'unknown' })],
  ]
  it.each(malformedActions)('rejects malformed action snapshot: %s', async (_name, value) => expectInput(value))
  it('reads each action field once and rejects throwing getters without leaking', async () => {
    const reads = new Map<string, number>(); const hostile = new Proxy(action(created), { get(_target, property) { const name = String(property); reads.set(name, (reads.get(name) ?? 0) + 1); throw new Error('secret') } })
    await expectInput(hostile); expect([...reads.values()]).toEqual([1])
  })
  it('rejects a revoked action proxy as input without calling dependencies', async () => {
    const revoked = Proxy.revocable(action(created), {}); revoked.revoke()
    await expectInput(revoked.proxy)
  })
  it('rejects a revoked expectation proxy as input without calling dependencies', async () => {
    const revoked = Proxy.revocable(created, {}); revoked.revoke()
    await expectInput(action(revoked.proxy))
  })

  it.each(invalidSignatures.map(([signature]) => ({ signature })))('rejects noncanonical signature %s', async ({ signature }) => expectInput(action(created, { signature })))
  it('accepts independent varying-length valid signatures', async () => {
    for (const signature of validSignatures) { const { reader, transport } = ok(); const result = await new RitualConfirmationVerifier(reader, transport).confirmAndReadRitual(action(created, { signature })); expect(result.signature).toBe(signature) }
  })
  it.each([0, Number.MAX_SAFE_INTEGER])('accepts safe boundary last-valid height %s', async (height) => {
    const { reader, transport } = ok(); const result = await new RitualConfirmationVerifier(reader, transport).confirmAndReadRitual(action(created, { lastValidBlockHeight: height, submittedContextSlot: 0 }))
    expect(result.confirmationSlot).toBe(50)
  })
  it('accepts zero submitted context slot', async () => {
    const { reader, transport } = ok(); await expect(new RitualConfirmationVerifier(reader, transport).confirmAndReadRitual(action(created, { submittedContextSlot: 0 }))).resolves.toBeDefined()
  })

  it.each([
    ['creator default', { creator: PublicKey.default }], ['creator wrong', { creator: 'x' }], ['nonce negative', { nonce: -1n }], ['nonce too large', { nonce: 0x10000000000000000n }], ['nonce wrong', { nonce: 1 }],
  ])('rejects created expectation: %s', async (_name, patch) => expectInput(action({ ...created, ...patch })))
  it.each([
    ['member default', { member: PublicKey.default }], ['count zero', { expectedFundedMemberCount: 0 }], ['count seven', { expectedFundedMemberCount: 7 }], ['count fraction', { expectedFundedMemberCount: 1.5 }], ['stake zero', { expectedFundedStakeTotal: 0n }], ['stake negative', { expectedFundedStakeTotal: -1n }], ['stake too large', { expectedFundedStakeTotal: 0x10000000000000000n }], ['stake wrong', { expectedFundedStakeTotal: 1 }], ['fee negative', { expectedFundedFeeTotal: -1n }], ['fee too large', { expectedFundedFeeTotal: 0x10000000000000000n }], ['fee wrong', { expectedFundedFeeTotal: 1 }],
  ])('rejects funded expectation: %s', async (_name, patch) => expectInput(action({ ...funded, ...patch })))

  it('snapshots action and expectation before deferred confirmation resolves', async () => {
    const gate = Promise.withResolvers<unknown>(); const { reader, transport } = ok()
    const pending = new RitualConfirmationVerifier(reader, { confirmTransaction(strategy, commitment) { transport.calls.push({ strategy, commitment }); return gate.promise as never } })
    const original = action({ ...created }); const promise = pending.confirmAndReadRitual(original); original.signature = validSignatures[1]; original.blockhash = new PublicKey(new Uint8Array(32).fill(3)).toBase58(); (original.expectation as any).nonce = 99n; gate.resolve({ context: { slot: 50 }, value: { err: null } }); const result = await promise
    expect((transport.calls[0].strategy as any).signature).toBe(validSignatures[0]); expect((transport.calls[0].strategy as any).blockhash).toBe(blockhash); expect(result.expectationKind).toBe('created')
  })
  it('does not read back until confirmation resolves', async () => { const gate = Promise.withResolvers<unknown>(); const reader = new StubReader(); const promise = new RitualConfirmationVerifier(reader, { confirmTransaction: () => gate.promise as never }).confirmAndReadRitual(action(created)); await Promise.resolve(); expect(reader.calls).toHaveLength(0); gate.resolve({ context: { slot: 50 }, value: { err: null } }); await promise; expect(reader.calls).toHaveLength(1) })

  it.each([
    ['generic rejection', new Error('secret')], ['sentinel rejection', { name: 'TransactionExpired' }], ['hostile name', new Proxy({}, { get() { throw new Error('secret') } })],
  ])('sanitizes transport rejection: %s', async (_name, error) => { const { reader } = ok(); const transport = { confirmTransaction: async () => { throw error } }; await expect(new RitualConfirmationVerifier(reader, transport).confirmAndReadRitual(action(created))).rejects.toMatchObject({ category: 'confirmation', message: 'transaction confirmation failed' }) })
  it.each(['TransactionExpiredBlockheightExceededError', 'TransactionExpiredTimeoutError', 'TransactionExpiredNonceInvalidError'])('does not assert expiry without signature history: %s', async (name) => { const { reader } = ok(); await expect(new RitualConfirmationVerifier(reader, { confirmTransaction: async () => { throw { name } } }).confirmAndReadRitual(action(created))).rejects.toMatchObject({ category: 'confirmation' }) })

  it.each([
    null, [], 1, { context: null, value: { err: null } }, { context: [], value: { err: null } }, { context: { slot: -1 }, value: { err: null } }, { context: { slot: 1.5 }, value: { err: null } }, { context: { slot: '1' }, value: { err: null } }, { context: { slot: Number.MAX_SAFE_INTEGER + 1 }, value: { err: null } }, { context: { slot: 50 }, value: null }, { context: { slot: 50 }, value: [] }, { context: { slot: 50 }, value: {} },
  ])('rejects malformed confirmation response %o', async (response) => { const { reader } = ok(); await expect(new RitualConfirmationVerifier(reader, { confirmTransaction: async () => response as never }).confirmAndReadRitual(action(created))).rejects.toMatchObject({ category: 'confirmation' }); expect(reader.calls).toHaveLength(0) })
  it('rejects a revoked confirmation response without calling the reader', async () => {
    const { reader } = ok(); const revoked = Proxy.revocable({ context: { slot: 50 }, value: { err: null } }, {}); revoked.revoke()
    await expect(new RitualConfirmationVerifier(reader, { confirmTransaction: async () => revoked.proxy as never }).confirmAndReadRitual(action(created))).rejects.toMatchObject({ category: 'confirmation' })
    expect(reader.calls).toHaveLength(0)
  })
  it.each([undefined, 'failed', {}, [], new Error('x')])('maps non-null transaction err to confirmation failure: %o', async (err) => { const { reader } = ok(); await expect(new RitualConfirmationVerifier(reader, { confirmTransaction: async () => ({ context: { slot: 50 }, value: { err } }) }).confirmAndReadRitual(action(created))).rejects.toMatchObject({ category: 'confirmation', message: 'transaction failed' }) })
  it('rejects inherited err and reads response getters once', async () => { const { reader } = ok(); const value = Object.create({ err: null }); await expect(new RitualConfirmationVerifier(reader, { confirmTransaction: async () => ({ context: { slot: 50 }, value }) as never }).confirmAndReadRitual(action(created))).rejects.toMatchObject({ category: 'confirmation' })
    let reads = 0; const response = { get context() { reads++; return { slot: 50 } }, get value() { reads++; return { err: null } } }; await new RitualConfirmationVerifier(reader, { confirmTransaction: async () => response as never }).confirmAndReadRitual(action(created)); expect(reads).toBe(2) })
  it('rejects stale confirmation without reader call', async () => { const { reader } = ok(); await expect(new RitualConfirmationVerifier(reader, { confirmTransaction: async () => ({ context: { slot: 9 }, value: { err: null } }) }).confirmAndReadRitual(action(created))).rejects.toMatchObject({ category: 'readback' }); expect(reader.calls).toHaveLength(0) })

  it.each([
    ['rpc', new RitualRpcError('rpc', 'secret')], ['not-found', new RitualRpcError('not-found', 'secret')], ['stale', new RitualRpcError('stale', 'secret')], ['decode', new RitualRpcError('decode', 'secret')], ['canonical', new RitualRpcError('canonical', 'secret')], ['unstable', new RitualRpcError('unstable', 'secret')], ['generic', new Error('secret')],
  ])('maps reader error %s without leaking details', async (category, error) => { const { reader, transport } = ok(); reader.error = error; await expect(new RitualConfirmationVerifier(reader, transport).confirmAndReadRitual(action(created))).rejects.toMatchObject({ category: category === 'rpc' ? 'rpc' : 'readback', message: 'Ritual authoritative readback failed' }) })
  it.each([null, [], 1, { slot: 49 }, { slot: '50' }, { slot: -1 }])('rejects malformed or stale bundle %o', async (bundle) => { const { reader, transport } = ok(); reader.bundle = bundle as never; await expect(new RitualConfirmationVerifier(reader, transport).confirmAndReadRitual(action(created))).rejects.toMatchObject({ category: 'readback' }) })

  it.each([
    ['created status', lifecycleContext({ status: 'Active' }).account, created], ['created creator', lifecycleContext({ creator: new PublicKey(new Uint8Array(32).fill(44)) }).account, created], ['created nonce', lifecycleContext({ nonce: lifecycleSource.nonce + 1n }).account, created],
    ['funded status', fullyFundedContext().account, { ...funded, expectedFundedMemberCount: 1 }], ['funded absent', fullyFundedContext().account, { ...funded, member: new PublicKey(new Uint8Array(32).fill(44)) }], ['funded bit', lifecycleContext({ members: lifecycleSource.members, fundedMemberCount: 1, fundedMembersBitmap: 0, fundedStakeTotal: lifecycleSource.memberTotalStake, fundedFeeTotal: lifecycleSource.lockedActivationFee }).account, funded], ['funded count', lifecycleContext({ fundedMemberCount: 1, fundedMembersBitmap: 1, fundedStakeTotal: lifecycleSource.memberTotalStake, fundedFeeTotal: lifecycleSource.lockedActivationFee }).account, funded], ['funded stake', fullyFundedContext().account, { ...funded, expectedFundedStakeTotal: 1n }], ['funded fee', fullyFundedContext().account, { ...funded, expectedFundedFeeTotal: 1n }],
    ['activated status', lifecycleContext({ status: 'Funding' }).account, { kind: 'activated' }], ['activated at', lifecycleContext({ status: 'Active', activatedAt: 0n, fundedMemberCount: lifecycleSource.members.length, fundedMembersBitmap: 3 }).account, { kind: 'activated' }], ['activated count', lifecycleContext({ status: 'Active', activatedAt: 1n, fundedMemberCount: 1, fundedMembersBitmap: 3 }).account, { kind: 'activated' }], ['activated bitmap', lifecycleContext({ status: 'Active', activatedAt: 1n, fundedMemberCount: 2, fundedMembersBitmap: 1 }).account, { kind: 'activated' }],
    ['cancelled status', lifecycleContext({ status: 'Funding' }).account, { kind: 'cancelled' }], ['cancelled stake', lifecycleContext({ status: 'Cancelled', fundedStakeTotal: 1n, fundedFeeTotal: 0n }).account, { kind: 'cancelled' }], ['cancelled fee', lifecycleContext({ status: 'Cancelled', fundedStakeTotal: 0n, fundedFeeTotal: 1n }).account, { kind: 'cancelled' }],
    ['vault status', lifecycleContext({ status: 'Funding', vaultsClosed: true }).account, { kind: 'vaults-closed' }], ['vault flag', lifecycleContext({ status: 'Completed', vaultsClosed: false }).account, { kind: 'vaults-closed' }],
  ] as const)('rejects exact expectation mismatch: %s', async (_name, account, expectation) => { const { reader, transport } = ok(account); await expect(new RitualConfirmationVerifier(reader, transport).confirmAndReadRitual(action(expectation))).rejects.toMatchObject({ category: 'readback' }) })
  it.each([['Completed', true], ['Cancelled', true], ['Completed', false]])('applies vault closure status %s/%s', async (status, vaultsClosed) => { const { reader, transport } = ok(lifecycleContext({ status: status as any, vaultsClosed }).account); const p = new RitualConfirmationVerifier(reader, transport).confirmAndReadRitual(action({ kind: 'vaults-closed' })); if (!vaultsClosed) await expect(p).rejects.toMatchObject({ category: 'readback' }); else await expect(p).resolves.toBeDefined() })

  it('returns a frozen result with exact signature, slot, kind, and bundle pointer', async () => { const { reader, transport } = ok(); const bundle = reader.bundle; const result = await new RitualConfirmationVerifier(reader, transport).confirmAndReadRitual(action(created)); expect(Object.isFrozen(result)).toBe(true); expect(result.bundle).toBe(bundle); expect(result).toMatchObject({ signature: validSignatures[0], confirmationSlot: 50, expectationKind: 'created' }); const second = await new RitualConfirmationVerifier(reader, transport).confirmAndReadRitual(action(created)); expect(second).not.toBe(result)
  })

  it('keeps the web3 confirm method structurally compatible at compile time', () => { const transport: RitualConfirmationTransport = { confirmTransaction: async () => ({ context: { slot: 1 }, value: { err: null } }) }; expect(typeof transport.confirmTransaction).toBe('function') })
})
