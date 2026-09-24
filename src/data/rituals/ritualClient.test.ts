import { describe, expect, it, vi } from 'vitest'
import { Keypair, PublicKey, Transaction } from '@solana/web3.js'
import * as api from './index'
import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'
import type { RitualRpcTransport } from './ritualsRpc'
import type { RitualPreparationTransport } from './ritualPreparedAction'
import { RitualConfirmationVerifier, type RitualConfirmationTransport } from './ritualConfirmation'
import type { RitualWalletSubmissionTransport } from './ritualSubmission'
import type { BuildCreateRitualArgs } from './instructionsLifecycle'

const hostile = new Proxy({}, { get: () => { throw new Error('dependency touched') } })
const rpc: RitualRpcTransport = { getMultipleAccountsInfoAndContext: async () => ({ context: { slot: 1 }, value: [] }) }
const prep: RitualPreparationTransport = {
  getLatestBlockhashAndContext: async () => ({ context: { slot: 1 }, value: { blockhash: new PublicKey(new Uint8Array(32).fill(9)).toBase58(), lastValidBlockHeight: 2 } }),
  getFeeForMessage: async () => ({ context: { slot: 1 }, value: 1 }),
  getMinimumBalanceForRentExemption: async () => 1,
}
const wallet: RitualWalletSubmissionTransport = { signAndSendTransaction: async () => '' }
const confirmation: RitualConfirmationTransport = { confirmTransaction: async () => ({ context: { slot: 1 }, value: { err: null } }) }
const creator = Keypair.fromSeed(new Uint8Array(32).fill(7))
const member = new PublicKey(new Uint8Array(32).fill(4))
const createArgs: BuildCreateRitualArgs = {
  programId: LOCAL_PLACEHOLDER_PROGRAM_ID, creator: creator.publicKey, stakeMint: new PublicKey(new Uint8Array(32).fill(2)), feeRecipientToken: new PublicKey(new Uint8Array(32).fill(3)),
  ritual: { nonce: 7n, ruleDigest: '1f'.repeat(32) as never, members: [creator.publicKey, member], memberTotalStake: 100n, schedule: [{ opens: 10n, deadline: 20n, resolution: 30n }], additionalConfirmationThreshold: 0, feePayerMode: 'HOST' },
}
const base58 = (bytes: Uint8Array) => {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let digits = [0]
  for (const byte of bytes) { let carry = byte; for (let i = 0; i < digits.length; i++) { const value = digits[i] * 256 + carry; digits[i] = value % 58; carry = Math.floor(value / 58) }; while (carry) { digits.push(carry % 58); carry = Math.floor(carry / 58) } }
  let result = ''; for (let i = 0; i < bytes.length && bytes[i] === 0; i++) result += '1'; for (let i = digits.length - 1; i >= 0; i--) result += alphabet[digits[i]]; return result
}
const signingWallet = (calls: { count: number }): RitualWalletSubmissionTransport => ({
  signAndSendTransaction: async (transaction: Transaction) => {
    calls.count += 1
    transaction.partialSign(creator)
    return base58(transaction.signatures[0].signature as Uint8Array)
  },
})
describe('safe Ritual client facade', () => {
  it('does not expose confirmation or submission bypasses from the public barrel', () => {
    const runtimeApi = api as unknown as Record<string, unknown>
    expect(runtimeApi.RitualConfirmationVerifier).toBeUndefined()
    expect(runtimeApi.confirmAndReadRitual).toBeUndefined()
    expect(runtimeApi.createRitualConfirmationVerifier).toBeUndefined()
    expect(runtimeApi.createCurrentRitualConfirmationVerifier).toBeUndefined()
    expect(runtimeApi.RitualActionSubmitter).toBeUndefined()
    expect(runtimeApi.createRitualActionSubmitter).toBeUndefined()
    expect(runtimeApi.SubmittedRitualAction).toBeUndefined()
    expect(runtimeApi.SubmittedRitualActionHandle).toBeUndefined()
  })

  it('returns a facade with no internal objects or wallet signing methods', () => {
    const client = api.createLocalTestRitualClient({ ...rpc, ...prep, ...confirmation }, wallet, LOCAL_PLACEHOLDER_PROGRAM_ID)
    expect(Object.keys(client)).toEqual([])
    expect(client).not.toHaveProperty('reader')
    expect(client).not.toHaveProperty('preparer')
    expect(client).not.toHaveProperty('confirmer')
    expect(client).not.toHaveProperty('submitter')
    expect(client).not.toHaveProperty('signAndSendTransaction')
    expect(client).toHaveProperty('submitPrepared')
    expect(client).toHaveProperty('confirmSubmitted')
    expect(client).toHaveProperty('submitAndConfirm')
  })

  it('builds a client for the authorized deployment', () => {
    // The deployment is live, so the factory no longer fails closed. It binds
    // the authorized program id; transports stay the caller's responsibility.
    const built = api.createCurrentRitualClient({ ...rpc, ...prep, ...confirmation } as never, wallet as never)
    expect(typeof (built as unknown as Record<string, unknown>).prepareCreate).toBe('function')
  })

  it('provides every read, preparation, and safe submission operation', () => {
    const client = api.createLocalTestRitualClient({ ...rpc, ...prep, ...confirmation }, wallet, LOCAL_PLACEHOLDER_PROGRAM_ID)
    expect(['getProtocolConfig', 'readRitual', 'getRitualBundle', 'getEventBundle', 'prepareCreate', 'prepareFund', 'prepareActivate', 'prepareCancel', 'prepareClose', 'prepareInitializeEvent', 'prepareClaim', 'prepareApprove', 'prepareQuestion', 'prepareFinalize', 'submitPrepared', 'confirmSubmitted', 'submitAndConfirm'].every(name => typeof (client as unknown as Record<string, unknown>)[name] === 'function')).toBe(true)
  })

  it('keeps every facade method hidden and immutable', () => {
    const client = api.createLocalTestRitualClient({ ...rpc, ...prep, ...confirmation }, wallet, LOCAL_PLACEHOLDER_PROGRAM_ID) as unknown as Record<string, unknown>
    const names = ['getProtocolConfig', 'readRitual', 'getRitualBundle', 'getEventBundle', 'prepareCreate', 'prepareFund', 'prepareActivate', 'prepareCancel', 'prepareClose', 'prepareInitializeEvent', 'prepareClaim', 'prepareApprove', 'prepareQuestion', 'prepareFinalize', 'submitPrepared', 'confirmSubmitted', 'submitAndConfirm', 'programId']
    expect(Object.getOwnPropertyNames(client).sort()).toEqual(names.sort())
    expect(Object.isFrozen(client)).toBe(true)
    expect(Object.getPrototypeOf(client)).toBeNull()
    for (const name of names.filter((name) => name !== 'programId')) expect(Object.getOwnPropertyDescriptor(client, name)).toMatchObject({ enumerable: false, writable: false, configurable: false, value: expect.any(Function) })
    expect(Object.getOwnPropertyDescriptor(client, 'programId')).toMatchObject({ enumerable: false, writable: false, configurable: false, value: expect.any(PublicKey) })
  })

  it('round-trips split submission through one facade with one wallet and confirmation call', async () => {
    const calls = { count: 0 }
    const confirmed = { marker: 'authoritative facade readback' }
    const confirmationSpy = vi.spyOn(RitualConfirmationVerifier.prototype, 'confirmAndReadRitual').mockResolvedValue(confirmed as never)
    try {
      const client = api.createLocalTestRitualClient({ ...rpc, ...prep, ...confirmation }, signingWallet(calls), LOCAL_PLACEHOLDER_PROGRAM_ID)
      const prepared = await client.prepareCreate(createArgs)
      const handle = await client.submitPrepared(prepared)
      expect(handle).toMatchObject({ actionKind: 'create', expectationKind: 'created', ritualAddress: prepared.ritualAddress })
      await expect(client.confirmSubmitted(handle)).resolves.toMatchObject({ confirmed })
      expect(calls.count).toBe(1)
      expect(confirmationSpy).toHaveBeenCalledTimes(1)
    } finally { confirmationSpy.mockRestore() }
  })

  it('rejects another facade handle before confirmation work', async () => {
    const confirmationSpy = vi.spyOn(RitualConfirmationVerifier.prototype, 'confirmAndReadRitual').mockResolvedValue({ marker: 'should not run' } as never)
    try {
      const transport = { ...rpc, ...prep, ...confirmation }
      const first = api.createLocalTestRitualClient(transport, signingWallet({ count: 0 }), LOCAL_PLACEHOLDER_PROGRAM_ID)
      const second = api.createLocalTestRitualClient(transport, signingWallet({ count: 0 }), LOCAL_PLACEHOLDER_PROGRAM_ID)
      const handle = await second.submitPrepared(await second.prepareCreate(createArgs))
      await expect(first.confirmSubmitted(handle)).rejects.toMatchObject({ category: 'input' })
      expect(confirmationSpy).not.toHaveBeenCalled()
    } finally { confirmationSpy.mockRestore() }
  })

  it('keeps compatibility submission on the same facade path', async () => {
    const calls = { count: 0 }
    const confirmationSpy = vi.spyOn(RitualConfirmationVerifier.prototype, 'confirmAndReadRitual').mockResolvedValue({ marker: 'compatibility' } as never)
    try {
      const client = api.createLocalTestRitualClient({ ...rpc, ...prep, ...confirmation }, signingWallet(calls), LOCAL_PLACEHOLDER_PROGRAM_ID)
      await expect(client.submitAndConfirm(await client.prepareCreate(createArgs))).resolves.toMatchObject({ confirmed: { marker: 'compatibility' } })
      expect(calls.count).toBe(1)
      expect(confirmationSpy).toHaveBeenCalledTimes(1)
    } finally { confirmationSpy.mockRestore() }
  })

  it('rejects a prepared action from another facade before touching the wallet', async () => {
    const transport = { ...rpc, ...prep, ...confirmation }
    const first = api.createLocalTestRitualClient(transport, wallet, LOCAL_PLACEHOLDER_PROGRAM_ID)
    let walletCalls = 0
    const second = api.createLocalTestRitualClient(transport, { signAndSendTransaction: async () => { walletCalls += 1; return '' } }, LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await first.prepareCreate(createArgs)
    await expect(second.submitAndConfirm(prepared)).rejects.toMatchObject({ category: 'input' })
    expect(walletCalls).toBe(0)
  })

  it('uses the genuine submission path and forwards the prepared context slot', async () => {
    let submittedSlot: number | undefined
    const client = api.createLocalTestRitualClient({ ...rpc, ...prep, ...confirmation }, { signAndSendTransaction: async (_transaction, slot) => { submittedSlot = slot; return '' } }, LOCAL_PLACEHOLDER_PROGRAM_ID)
    const prepared = await client.prepareCreate(createArgs)
    await expect(client.submitAndConfirm(prepared)).rejects.toMatchObject({ category: 'signature' })
    expect(submittedSlot).toBe(1)
  })
})
