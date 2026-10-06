import { describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { RitualsRpcReader } from './ritualsRpc'
import { RitualConfirmationError, RitualConfirmationVerifier, createCurrentRitualConfirmationVerifier, type RitualConfirmationTransport, type SubmittedRitualAction } from './ritualConfirmation'
import { lifecycleContext, lifecycleSource, fullyFundedContext } from './lifecycleBuilderTestHelpers'
import type { RitualBundleRead } from './ritualsRpc'

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function encodeBase58(bytes: Uint8Array): string {
  let digits = [0]
  for (const byte of bytes) {
    let carry = byte
    for (let i = 0; i < digits.length; i += 1) { const value = digits[i] * 256 + carry; digits[i] = value % 58; carry = Math.floor(value / 58) }
    while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58) }
  }
  let result = ''
  for (let i = 0; i < bytes.length && bytes[i] === 0; i += 1) result += '1'
  for (let i = digits.length - 1; i >= 0; i -= 1) result += ALPHABET[digits[i]]
  return result
}
const validSignature = encodeBase58(Uint8Array.from({ length: 64 }, (_, i) => i + 1))
const address = new PublicKey(new Uint8Array(32).fill(2))
const blockhash = new PublicKey(new Uint8Array(32).fill(1)).toBase58()
const action = (expectation: SubmittedRitualAction['expectation'], signature = validSignature): SubmittedRitualAction => ({ signature, blockhash, lastValidBlockHeight: 10, submittedContextSlot: 10, ritualAddress: address, expectation })

class FakeReader extends RitualsRpcReader {
  calls: Array<{ address: PublicKey; options: unknown }> = []
  constructor(private readonly bundle: RitualBundleRead) { super({ getMultipleAccountsInfoAndContext: async () => ({ context: { slot: 1 }, value: [] }) }, new PublicKey(new Uint8Array(32).fill(9))) }
  override async getRitualBundle(target: PublicKey, options?: { minContextSlot?: number }): Promise<RitualBundleRead> { this.calls.push({ address: target, options }); return this.bundle }
}
const bundleFor = (account: typeof lifecycleSource, slot = 50): RitualBundleRead => Object.freeze({ slot, ritual: Object.freeze({ slot, address, protocolConfigAddress: address, protocolConfig: {} as never, account: Object.freeze(account) }), event: null, claims: Object.freeze([]) })

describe('Ritual confirmation verifier', () => {
  it.each(['confirmed', 'finalized'])('reads a landed %s action after the wallet returns past blockhash expiry', async (confirmationStatus) => {
    const reader = new FakeReader(bundleFor(lifecycleContext().account))
    const statuses = vi.fn(async () => ({ value: [{ slot: 50, err: null, confirmationStatus }] }))
    const result = await new RitualConfirmationVerifier(reader, {
      confirmTransaction: async () => { throw { name: 'TransactionExpiredBlockheightExceededError' } },
      getSignatureStatuses: statuses,
    }).confirmAndReadRitual(action({ kind: 'created', creator: lifecycleSource.creator, nonce: lifecycleSource.nonce }))
    expect(statuses).toHaveBeenCalledWith([validSignature], { searchTransactionHistory: true })
    expect(result.confirmationSlot).toBe(50)
    expect(reader.calls[0].options).toEqual({ minContextSlot: 50 })
  })

  it('retries a lagging status node, but still rejects a mismatched authoritative readback', async () => {
    const statuses = vi.fn().mockResolvedValueOnce({ value: [null] }).mockResolvedValue({ value: [{ slot: 50, err: null, confirmationStatus: 'confirmed' }] })
    const reader = new FakeReader(bundleFor(lifecycleContext().account))
    await expect(new RitualConfirmationVerifier(reader, {
      confirmTransaction: async () => { throw { name: 'TransactionExpiredBlockheightExceededError' } }, getSignatureStatuses: statuses,
    }).confirmAndReadRitual(action({ kind: 'activated' }))).rejects.toMatchObject({ category: 'readback' })
    expect(statuses).toHaveBeenCalledTimes(2)
  })

  it.each([
    [null, 'expired', 3],
    [{ slot: 50, err: { InstructionError: [0, 'x'] }, confirmationStatus: 'confirmed' }, 'confirmation', 1],
    [{ slot: 50, err: null, confirmationStatus: 'processed' }, 'confirmation', 3],
  ])('only calls an absent signature expired after bounded history checks (%j)', async (status, category, calls) => {
    const reader = new FakeReader(bundleFor(lifecycleContext().account))
    const statuses = vi.fn(async () => ({ value: [status] }))
    await expect(new RitualConfirmationVerifier(reader, {
      confirmTransaction: async () => { throw { name: 'TransactionExpiredBlockheightExceededError' } }, getSignatureStatuses: statuses,
    }).confirmAndReadRitual(action({ kind: 'created', creator: lifecycleSource.creator, nonce: lifecycleSource.nonce }))).rejects.toMatchObject({ category })
    expect(statuses).toHaveBeenCalledTimes(calls)
    expect(reader.calls).toHaveLength(0)
  })

  it('exposes a verifier for blockheight confirmation and readback', () => {
    expect(RitualConfirmationVerifier).toBeDefined()
    const action: SubmittedRitualAction = {
      signature: validSignature,
      blockhash: new PublicKey(new Uint8Array(32).fill(1)).toBase58(),
      lastValidBlockHeight: 1,
      submittedContextSlot: 1,
      ritualAddress: new PublicKey(new Uint8Array(32).fill(2)),
      expectation: { kind: 'activated' },
    }
    expect(action.expectation.kind).toBe('activated')
    expect(RitualsRpcReader).toBeDefined()
  })

  it.each(['1'.repeat(87), '1'.repeat(63), '1'.repeat(65), '', '0'.repeat(64), 'O'.repeat(64), 'I'.repeat(64), 'l'.repeat(64), ` ${validSignature}`, `${validSignature} `, '1'.repeat(91)])('rejects a signature that is not a canonical 64-byte base58 value', async (signature) => {
    const verifier = new RitualConfirmationVerifier(new FakeReader(bundleFor(lifecycleContext().account)), { confirmTransaction: async () => ({ context: { slot: 50 }, value: { err: null } }) })
    await expect(verifier.confirmAndReadRitual(action({ kind: 'created', creator: lifecycleSource.creator, nonce: lifecycleSource.nonce }, signature))).rejects.toMatchObject({ category: 'input' })
  })

  it('accepts a canonical 64-byte signature and confirms before reading back', async () => {
    const calls: unknown[] = []
    const transport: RitualConfirmationTransport = { confirmTransaction: async (strategy: Readonly<{ signature: string; blockhash: string; lastValidBlockHeight: number }>, commitment: 'confirmed') => { calls.push(strategy, commitment); return { context: { slot: 50 }, value: { err: null } } } }
    const reader = new FakeReader(bundleFor(lifecycleContext().account))
    const result = await new RitualConfirmationVerifier(reader, transport).confirmAndReadRitual(action({ kind: 'created', creator: lifecycleSource.creator, nonce: lifecycleSource.nonce }))
    expect(calls).toEqual([{ signature: validSignature, blockhash, lastValidBlockHeight: 10 }, 'confirmed'])
    expect(reader.calls).toEqual([{ address, options: { minContextSlot: 50 } }])
    expect(Object.isFrozen(result)).toBe(true)
    expect(result).toMatchObject({ signature: validSignature, confirmationSlot: 50, expectationKind: 'created' })
  })

  it.each([
    ['created', lifecycleContext({ status: 'Funding', creator: lifecycleSource.creator, nonce: lifecycleSource.nonce }), { kind: 'created', creator: lifecycleSource.creator, nonce: lifecycleSource.nonce }],
    ['funded', fullyFundedContext(), { kind: 'funded', member: lifecycleSource.members[0], expectedFundedMemberCount: lifecycleSource.members.length, expectedFundedStakeTotal: lifecycleSource.memberTotalStake * BigInt(lifecycleSource.members.length), expectedFundedFeeTotal: lifecycleSource.lockedActivationFee }],
    ['activated', lifecycleContext({ status: 'Active', activatedAt: 1n, fundedMembersBitmap: (1 << lifecycleSource.members.length) - 1, fundedMemberCount: lifecycleSource.members.length }), { kind: 'activated' }],
    ['cancelled', lifecycleContext({ status: 'Cancelled', fundedStakeTotal: 0n, fundedFeeTotal: 0n }), { kind: 'cancelled' }],
    ['vaults-closed', lifecycleContext({ status: 'Completed', vaultsClosed: true }), { kind: 'vaults-closed' }],
  ] as const)('proves the %s confirmation readback path', async (_name, context, expectation) => {
    const reader = new FakeReader(bundleFor(context.account))
    const result = await new RitualConfirmationVerifier(reader, { confirmTransaction: async () => ({ context: { slot: 50 }, value: { err: null } }) }).confirmAndReadRitual(action(expectation))
    expect(result.bundle.ritual.account.status).toBe(context.account.status)
  })

  it('rejects a successful signature when authoritative readback mismatches', async () => {
    const reader = new FakeReader(bundleFor(lifecycleContext({ status: 'Cancelled', fundedStakeTotal: 0n, fundedFeeTotal: 0n }).account))
    await expect(new RitualConfirmationVerifier(reader, { confirmTransaction: async () => ({ context: { slot: 50 }, value: { err: null } }) }).confirmAndReadRitual(action({ kind: 'activated' }))).rejects.toMatchObject({ category: 'readback' })
  })

  it('rejects zero expected funded stake', async () => {
    const reader = new FakeReader(bundleFor(lifecycleContext().account))
    await expect(new RitualConfirmationVerifier(reader, { confirmTransaction: async () => ({ context: { slot: 50 }, value: { err: null } }) }).confirmAndReadRitual(action({ kind: 'funded', member: lifecycleSource.members[0], expectedFundedMemberCount: 1, expectedFundedStakeTotal: 0n, expectedFundedFeeTotal: 0n }))).rejects.toMatchObject({ category: 'input' })
  })

  it('builds a confirmation verifier for the authorized deployment', () => {
    const fakeReader = new FakeReader(bundleFor(lifecycleSource))
    const fakeTransport: RitualConfirmationTransport = {
      confirmTransaction: async () => ({ context: { slot: 1 }, value: { err: null } }),
    } as never
    const verifier = createCurrentRitualConfirmationVerifier(fakeReader, fakeTransport)
    expect(verifier).toBeInstanceOf(RitualConfirmationVerifier)
  })
})
