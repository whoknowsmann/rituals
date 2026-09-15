import { describe, expect, it } from 'vitest'
import { Keypair, PublicKey } from '@solana/web3.js'
import * as api from './index'
import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'
import type { RitualRpcTransport } from './ritualsRpc'
import type { RitualPreparationTransport } from './ritualPreparedAction'
import type { RitualConfirmationTransport } from './ritualConfirmation'
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
  })

  it('returns a facade with no internal objects or wallet signing methods', () => {
    const client = api.createLocalTestRitualClient({ ...rpc, ...prep, ...confirmation }, wallet, LOCAL_PLACEHOLDER_PROGRAM_ID)
    expect(Object.keys(client)).toEqual([])
    expect(client).not.toHaveProperty('reader')
    expect(client).not.toHaveProperty('preparer')
    expect(client).not.toHaveProperty('confirmer')
    expect(client).not.toHaveProperty('submitter')
    expect(client).not.toHaveProperty('signAndSendTransaction')
    expect(client).toHaveProperty('submitAndConfirm')
  })

  it('checks current deployment before reading hostile dependencies', () => {
    expect(() => api.createCurrentRitualClient(hostile as never, hostile as never)).toThrowError(/deployment/)
  })

  it('provides every read, preparation, and safe submission operation', () => {
    const client = api.createLocalTestRitualClient({ ...rpc, ...prep, ...confirmation }, wallet, LOCAL_PLACEHOLDER_PROGRAM_ID)
    expect(['readRitual', 'getRitualBundle', 'getEventBundle', 'prepareCreate', 'prepareFund', 'prepareActivate', 'prepareCancel', 'prepareClose', 'prepareInitializeEvent', 'prepareClaim', 'prepareApprove', 'prepareQuestion', 'prepareFinalize', 'submitAndConfirm'].every(name => typeof (client as unknown as Record<string, unknown>)[name] === 'function')).toBe(true)
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
