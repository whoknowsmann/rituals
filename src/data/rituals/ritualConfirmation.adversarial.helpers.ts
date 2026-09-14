import { PublicKey } from '@solana/web3.js'
import { RitualsRpcReader, type RitualBundleRead } from './ritualsRpc'
import type { RitualConfirmationTransport } from './ritualConfirmation'
import { lifecycleContext, lifecycleSource } from './lifecycleBuilderTestHelpers'

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export function encodeBase58(bytes: Uint8Array): string {
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
export const validSignatures = [1, 2, 3].map((seed) => encodeBase58(Uint8Array.from({ length: 64 }, (_, i) => (i + seed) & 255)))
export const address = new PublicKey(new Uint8Array(32).fill(2))
export const blockhash = new PublicKey(new Uint8Array(32).fill(1)).toBase58()
export const programId = new PublicKey(new Uint8Array(32).fill(9))

export class FakeConfirm {
  readonly calls: Array<{ strategy: unknown; commitment: unknown }> = []
  readonly confirmTransaction: RitualConfirmationTransport['confirmTransaction'] = async function (this: FakeConfirm, strategy, commitment) {
    this.calls.push({ strategy, commitment })
    return { context: { slot: 50 }, value: { err: null } }
  }
}

export class StubReader extends RitualsRpcReader {
  readonly calls: Array<{ address: PublicKey; options: unknown }> = []
  bundle: unknown = bundleFor(lifecycleContext().account)
  error: unknown
  deferred: Promise<unknown> | undefined
  constructor() { super({ getMultipleAccountsInfoAndContext: async () => ({ context: { slot: 1 }, value: [] }) }, programId) }
  override async getRitualBundle(target: PublicKey, options?: { minContextSlot?: number }): Promise<RitualBundleRead> {
    this.calls.push({ address: target, options })
    if (this.deferred) return await this.deferred as RitualBundleRead
    if (this.error !== undefined) throw this.error
    return this.bundle as RitualBundleRead
  }
}

export function bundleFor(account: typeof lifecycleSource, slot = 50): RitualBundleRead {
  return Object.freeze({ slot, ritual: Object.freeze({ slot, address, protocolConfigAddress: address, protocolConfig: {} as never, account: Object.freeze(account) }), event: null, claims: Object.freeze([]) })
}

export function action(expectation: any, overrides: Record<string, unknown> = {}): any {
  return { signature: validSignatures[0], blockhash, lastValidBlockHeight: 10, submittedContextSlot: 10, ritualAddress: address, expectation, ...overrides }
}

export const created = { kind: 'created', creator: lifecycleSource.creator, nonce: lifecycleSource.nonce }
export const funded = { kind: 'funded', member: lifecycleSource.members[0], expectedFundedMemberCount: lifecycleSource.members.length, expectedFundedStakeTotal: lifecycleSource.memberTotalStake * BigInt(lifecycleSource.members.length), expectedFundedFeeTotal: lifecycleSource.lockedActivationFee }
export const expectations = [created, funded, { kind: 'activated' }, { kind: 'cancelled' }, { kind: 'vaults-closed' }] as const
