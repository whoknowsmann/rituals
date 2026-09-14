import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeProtocolConfig, decodeRitual } from './accounts'
import { accountVectors, envelope, hexToBytes, ACCOUNT_VECTOR_OWNER } from './__fixtures__/accountVectors'
import { protocolConfigPda, ritualPda } from './pdas'
import { createRitualsRpcReader, type RitualRpcTransport } from './ritualsRpc'
import { RitualConfirmationVerifier, type RitualConfirmationTransport } from './ritualConfirmation'
import { action, blockhash, created, StubReader } from './ritualConfirmation.adversarial.helpers'

const programId = new PublicKey(ACCOUNT_VECTOR_OWNER)
const protocolConfigAddress = protocolConfigPda(programId)[0]
const protocolConfigBytes = hexToBytes(accountVectors.protocolConfig.hex)
const protocolConfig = decodeProtocolConfig({ owner: programId, data: protocolConfigBytes, executable: false }, programId)
const activeBytes = hexToBytes(accountVectors.ritual.hex)
const activeAccount = decodeRitual({ owner: programId, data: activeBytes, executable: false }, programId, protocolConfig.allowedStakeMint)
const ritualAddress = ritualPda(activeAccount.creator, activeAccount.nonce, programId)[0]

function fundingBytes(): Uint8Array {
  const bytes = new Uint8Array(activeBytes)
  bytes[422] = 0
  bytes[423] = 0
  bytes.fill(0, 424, 440)
  bytes[440] = 0
  bytes[441] = 0
  bytes[442] = 0
  bytes.fill(0, 451, 475)
  bytes[475] = 0
  return bytes
}

type RpcCall = { keys: string[]; config: unknown }
class FakeConfirmedRpc {
  readonly calls: RpcCall[] = []
  async getMultipleAccountsInfoAndContext(keys: PublicKey[], config: unknown) {
    this.calls.push({ keys: keys.map(key => key.toBase58()), config })
    return {
      context: { slot: 51 },
      value: keys.map(key => {
        if (key.equals(protocolConfigAddress)) return { owner: programId, data: protocolConfigBytes, executable: false }
        if (key.equals(ritualAddress)) return { owner: programId, data: fundingBytes(), executable: false }
        return null
      }),
    }
  }
}

class FakeConfirmation {
  readonly calls: Array<{ strategy: unknown; commitment: unknown }> = []
  constructor(private readonly result: Promise<unknown> | unknown = { context: { slot: 50 }, value: { err: null } }) {}
  async confirmTransaction(this: FakeConfirmation, strategy: unknown, commitment: unknown) {
    this.calls.push({ strategy, commitment })
    return await this.result
  }
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function decodeBase58(value: string): Uint8Array {
  const bytes = [0]
  for (const character of value) {
    let carry = BASE58_ALPHABET.indexOf(character)
    for (let index = 0; index < bytes.length; index += 1) {
      const product = bytes[index] * 58 + carry
      bytes[index] = product & 0xff
      carry = product >>> 8
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>>= 8 }
  }
  const leadingZeros = value.match(/^1*/)?.[0].length ?? 0
  const decoded = new Uint8Array(leadingZeros + (bytes.length === 1 && bytes[0] === 0 ? 0 : bytes.length))
  for (let index = 0; index < bytes.length; index += 1) decoded[decoded.length - 1 - index] = bytes[index]
  return decoded
}

const realAction = () => ({
  ...action(created),
  blockhash,
  ritualAddress,
  expectation: { kind: 'created' as const, creator: activeAccount.creator, nonce: activeAccount.nonce },
})

describe('Ritual confirmation integration', () => {
  it('confirms before reading and verifies a Funding account through the real RPC reader', async () => {
    const confirmationGate = Promise.withResolvers<unknown>()
    const rpc = new FakeConfirmedRpc()
    const confirmation = new FakeConfirmation(confirmationGate.promise)
    const reader = createRitualsRpcReader(rpc as unknown as RitualRpcTransport, programId)
    const pending = new RitualConfirmationVerifier(reader, confirmation as unknown as RitualConfirmationTransport).confirmAndReadRitual(realAction())

    await Promise.resolve()
    expect(rpc.calls).toHaveLength(0)
    confirmationGate.resolve({ context: { slot: 50 }, value: { err: null } })

    const result = await pending
    expect(result).toMatchObject({ signature: realAction().signature, confirmationSlot: 50, expectationKind: 'created' })
    expect(result.bundle.slot).toBe(51)
    expect(result.bundle.ritual.account.status).toBe('Funding')
    expect(result.bundle.ritual.address.equals(ritualAddress)).toBe(true)
    expect(result.bundle.ritual.account.creator.equals(activeAccount.creator)).toBe(true)
    expect(result.bundle.ritual.account.nonce).toBe(activeAccount.nonce)
    expect(confirmation.calls).toEqual([{ strategy: { signature: realAction().signature, blockhash, lastValidBlockHeight: 10 }, commitment: 'confirmed' }])
    expect(rpc.calls).toEqual([{ keys: [protocolConfigAddress.toBase58(), ritualAddress.toBase58()], config: { commitment: 'confirmed', minContextSlot: 50 } }])
  })

  it('accepts exactly 64 zero bytes encoded as the all-one signature boundary', async () => {
    const zeroSignature = '1'.repeat(64)
    const decoded = decodeBase58(zeroSignature)
    expect(decoded).toHaveLength(64)
    expect([...decoded].every(byte => byte === 0)).toBe(true)

    const confirmation = new FakeConfirmation()
    const reader = new StubReader()
    const result = await new RitualConfirmationVerifier(reader, confirmation as unknown as RitualConfirmationTransport).confirmAndReadRitual(action(created, { signature: zeroSignature }))

    expect(result.signature).toBe(zeroSignature)
    expect(confirmation.calls).toHaveLength(1)
    expect((confirmation.calls[0].strategy as { signature: string }).signature).toBe(zeroSignature)
  })

  it('keeps the result pending while the post-confirmation readback is deferred', async () => {
    let resolveReadback!: (value: never) => void
    const readback = new Promise<never>(resolve => { resolveReadback = resolve })
    const reader = new StubReader()
    reader.deferred = readback
    const pending = new RitualConfirmationVerifier(reader, new FakeConfirmation() as unknown as RitualConfirmationTransport).confirmAndReadRitual(action(created))
    let settled = false
    void pending.then(() => { settled = true })

    await Promise.resolve()
    await Promise.resolve()
    expect(reader.calls).toHaveLength(1)
    expect(settled).toBe(false)
    resolveReadback(reader.bundle as never)
    await pending
    expect(settled).toBe(true)
  })
})
