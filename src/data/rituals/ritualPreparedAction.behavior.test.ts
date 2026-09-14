import { describe, expect, it } from 'vitest'
import { ACCOUNT_SIZE } from '@solana/spl-token'
import { Message, PublicKey, Transaction } from '@solana/web3.js'
import { ACCOUNT_DATA_LENGTHS } from './accounts'
import { RitualActionPreparer, RitualPreparationError } from './ritualPreparedAction'
import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'
import type { BuildCreateRitualArgs } from './instructionsLifecycle'

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const blockhash = key(9).toBase58()
const baseArgs = (): BuildCreateRitualArgs => ({
  programId: LOCAL_PLACEHOLDER_PROGRAM_ID, creator: key(1), stakeMint: key(2), feeRecipientToken: key(3),
  ritual: { nonce: 7n, ruleDigest: '1f'.repeat(32) as never, members: [key(1), key(4)], memberTotalStake: 100n,
    schedule: [{ opens: 10n, deadline: 20n, resolution: 30n }], additionalConfirmationThreshold: 1, feePayerMode: 'HOST' },
})

class BehaviorTransport {
  readonly calls: string[] = []
  readonly messages: Message[] = []
  latest: any = () => { this.calls.push('latest'); return Promise.resolve({ context: { slot: 12 }, value: { blockhash, lastValidBlockHeight: 100 } }) }
  fee: any = (message: Message) => { this.calls.push('fee'); this.messages.push(message); return Promise.resolve({ context: { slot: 12 }, value: 5000 }) }
  rent: any = (length: number) => { this.calls.push(`rent${length}`); return Promise.resolve(length) }
  getLatestBlockhashAndContext(...args: any[]) { return this.latest(...args) }
  getFeeForMessage(...args: any[]) { return this.fee(...args) }
  getMinimumBalanceForRentExemption(...args: any[]) { return this.rent(...args) }
}
const prepare = (transport = new BehaviorTransport()) => {
  const preparer = new RitualActionPreparer(transport, LOCAL_PLACEHOLDER_PROGRAM_ID)
  return { transport, preparer }
}
const expectCategory = async (promise: Promise<unknown>, category: string) => {
  await expect(promise).rejects.toMatchObject({ category })
  try { await promise } catch (error) {
    expect(error).toBeInstanceOf(RitualPreparationError)
    expect((error as Error).message).not.toContain('sentinel')
    expect((error as Error).message).not.toContain('cause')
  }
}

 describe('Create preparation behavior contract', () => {
  it.each([
    ['latest', 'rpc', (t: BehaviorTransport) => { t.latest = () => { t.calls.push('latest'); throw new Error('sentinel') } }],
    ['fee', 'fee', (t: BehaviorTransport) => { t.fee = () => { t.calls.push('fee'); throw new Error('sentinel') } }],
    ['rent', 'rent', (t: BehaviorTransport) => { t.rent = (n: number) => { t.calls.push(`rent${n}`); throw new Error('sentinel') } }],
  ])('maps synchronous %s throws', async (_name, category, configure) => {
    const { transport, preparer } = prepare(); configure(transport)
    await expectCategory(preparer.prepareCreate(baseArgs()), category)
  })

  it.each([
    ['latest', 'rpc', (t: BehaviorTransport) => { t.latest = () => ({ context: { slot: 12 }, value: { blockhash, lastValidBlockHeight: 100 } }) }],
    ['fee', 'fee', (t: BehaviorTransport) => { t.fee = () => ({ context: { slot: 12 }, value: 5000 }) }],
    ['rent', 'rent', (t: BehaviorTransport) => { t.rent = () => 165 }],
  ])('handles plain non-Promise %s results without raw TypeError', async (_name, category, configure) => {
    const { transport, preparer } = prepare(); configure(transport)
    const result = await preparer.prepareCreate(baseArgs())
    expect(result.kind).toBe('create')
    expect(category).toMatch(/rpc|fee|rent/)
  })

  it('handles a thenable whose then getter/call throws', async () => {
    const { transport, preparer } = prepare()
    transport.latest = () => ({ then: () => { throw new Error('sentinel then') } })
    await expectCategory(preparer.prepareCreate(baseArgs()), 'rpc')
  })

  it('reads constructor methods once, binds this, and rejects hostile shapes', () => {
    const counts = { latest: 0, fee: 0, rent: 0 }; const target = new BehaviorTransport()
    const transport = new Proxy(target, { get(obj, prop, receiver) { if (prop === 'getLatestBlockhashAndContext') counts.latest += 1; if (prop === 'getFeeForMessage') counts.fee += 1; if (prop === 'getMinimumBalanceForRentExemption') counts.rent += 1; return Reflect.get(obj, prop, receiver) } })
    const preparer = new RitualActionPreparer(transport, LOCAL_PLACEHOLDER_PROGRAM_ID)
    expect(counts).toEqual({ latest: 1, fee: 1, rent: 1 })
    expect(() => new RitualActionPreparer([] as never, LOCAL_PLACEHOLDER_PROGRAM_ID)).toThrowError(RitualPreparationError)
    const revoked = Proxy.revocable({}, {}); revoked.revoke()
    expect(() => new RitualActionPreparer(revoked.proxy as never, LOCAL_PLACEHOLDER_PROGRAM_ID)).toThrowError(RitualPreparationError)
    void preparer
  })

  it.each(['context', 'value'])('maps throwing latest %s getter to rpc', async field => {
    const { transport, preparer } = prepare()
    const response: any = field === 'context' ? { value: { blockhash, lastValidBlockHeight: 100 } } : { context: { slot: 12 } }
    Object.defineProperty(response, field, { get: () => { throw new Error('sentinel getter') } })
    transport.latest = () => response
    await expectCategory(preparer.prepareCreate(baseArgs()), 'rpc')
  })

  it.each(['slot', 'blockhash', 'lastValidBlockHeight'])('maps throwing latest nested %s getter to rpc', async field => {
    const { transport, preparer } = prepare()
    const context: any = { slot: 12 }; const value: any = { blockhash, lastValidBlockHeight: 100 }
    Object.defineProperty(field === 'slot' ? context : value, field, { get: () => { throw new Error('sentinel nested') } })
    transport.latest = () => ({ context, value })
    await expectCategory(preparer.prepareCreate(baseArgs()), 'rpc')
  })

  it.each(['context', 'value', 'slot'])('maps throwing fee %s getter to fee', async field => {
    const { transport, preparer } = prepare()
    const context: any = { slot: 12 }; const response: any = { context, value: 5000 }
    Object.defineProperty(field === 'slot' ? context : response, field, { get: () => { throw new Error('sentinel fee getter') } })
    transport.fee = () => response
    await expectCategory(preparer.prepareCreate(baseArgs()), 'fee')
  })

  it('maps a revoked fee response and never creates a prepared action', async () => {
    const { transport, preparer } = prepare(); const response = Proxy.revocable({ context: { slot: 12 }, value: 5000 }, {})
    transport.fee = () => { response.revoke(); return response.proxy }
    await expectCategory(preparer.prepareCreate(baseArgs()), 'fee')
  })
  it('snapshots all Create inputs before the first await', async () => {
    const { transport, preparer } = prepare(); let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    transport.latest = () => gate.then(() => ({ context: { slot: 12 }, value: { blockhash, lastValidBlockHeight: 100 } }))
    const original = baseArgs(); const pending = preparer.prepareCreate(original)
    const mutable = original as any
    mutable.creator = key(8); mutable.stakeMint = key(8); mutable.feeRecipientToken = key(8)
    mutable.ritual.nonce = 99n; mutable.ritual.members = [key(8), key(7)]; mutable.ritual.ruleDigest = 'aa'.repeat(32) as never
    mutable.ritual.schedule[0].opens = 999n; mutable.ritual.feePayerMode = 'SPLIT'
    release(); const action = await pending; const wallet = preparer.getTransactionForWallet(action)
    expect(wallet.expectation.creator).toBe(key(1).toBase58()); expect(wallet.expectation.nonce).toBe(7n)
    expect(wallet.transaction.instructions[0].data[8]).toBe(7)
    expect(wallet.transaction.feePayer?.equals(key(1))).toBe(true)
  })

  it('sequences latest, fee, and all three rents with exact arguments', async () => {
    const { transport, preparer } = prepare(); const action = await preparer.prepareCreate(baseArgs())
    expect(transport.calls).toEqual(['latest', 'fee', 'rent909', 'rent165', 'rent165'])
    expect(transport.messages[0].serialize().length).toBeGreaterThan(0)
    expect(action.summary.estimatedNetworkFeeLamports).toBe(5000n)
  })

  it.each([
    ['latest', (t: BehaviorTransport) => { t.latest = () => { t.calls.push('latest'); return Promise.reject(new Error('sentinel')) } }],
    ['fee', (t: BehaviorTransport) => { t.fee = () => { t.calls.push('fee'); return Promise.reject(new Error('sentinel')) } }],
    ['rent1', (t: BehaviorTransport) => { let n = 0; t.rent = (length: number) => { t.calls.push(`rent${length}`); return ++n === 1 ? Promise.reject(new Error('sentinel')) : Promise.resolve(length) } }],
    ['rent2', (t: BehaviorTransport) => { let n = 0; t.rent = (length: number) => { t.calls.push(`rent${length}`); return ++n === 2 ? Promise.reject(new Error('sentinel')) : Promise.resolve(length) } }],
    ['rent3', (t: BehaviorTransport) => { let n = 0; t.rent = (length: number) => { t.calls.push(`rent${length}`); return ++n === 3 ? Promise.reject(new Error('sentinel')) : Promise.resolve(length) } }],
  ])('stops after %s failure', async (stage, configure) => {
    const { transport, preparer } = prepare(); configure(transport)
    await expectCategory(preparer.prepareCreate(baseArgs()), stage.startsWith('rent') ? 'rent' : stage === 'fee' ? 'fee' : 'rpc')
    const index = stage === 'latest' ? 1 : stage === 'fee' ? 2 : stage === 'rent1' ? 3 : stage === 'rent2' ? 4 : 5
    expect(transport.calls.length).toBe(index)
  })

  it.each([0, Number.MAX_SAFE_INTEGER])('adds rent %s as bigint exactly', async (rent) => {
    const { transport, preparer } = prepare(); transport.rent = () => rent
    const action = await preparer.prepareCreate(baseArgs())
    expect(action.summary.estimatedRentLamports).toBe(BigInt(rent) * 3n)
    expect(action.summary.totalEstimatedLamportOutflow).toBe(5000n + BigInt(rent) * 3n)
  })

  it('freezes and exposes only the documented summary/action fields', async () => {
    const { preparer } = prepare(); const action = await preparer.prepareCreate(baseArgs())
    expect(Object.isFrozen(action)).toBe(true); expect(Object.isFrozen(action.summary)).toBe(true); expect(Object.isFrozen(action.summary.creates)).toBe(true)
    expect(Object.keys(action).sort()).toEqual(['blockhashContextSlot', 'expectation', 'feePayer', 'kind', 'lastValidBlockHeight', 'messageDigest', 'programId', 'ritualAddress', 'summary'])
    expect(action.messageDigest).toMatch(/^[0-9a-f]{64}$/); expect(action.summary.networkFeeIsEstimate).toBe(true)
    expect('transaction' in action).toBe(false); expect('instruction' in action).toBe(false); expect('messageBytes' in action).toBe(false); expect('blockhash' in action).toBe(false)
    expect(Object.isFrozen(action.expectation)).toBe(true)
  })

  it('exposes canonical scalar metadata without mutable web3 objects or shared snapshots', async () => {
    const { preparer } = prepare(); const action = await preparer.prepareCreate(baseArgs())
    const wallet = preparer.getTransactionForWallet(action)
    const publicMetadata = { action, wallet: { ...wallet, transaction: undefined } }
    const forbidden = (value: unknown, seen = new Set<object>()): void => {
      if (value === null || typeof value !== 'object' || seen.has(value)) return
      seen.add(value)
      expect(value).not.toBeInstanceOf(PublicKey)
      expect(value).not.toBeInstanceOf(Uint8Array)
      expect(value).not.toBeInstanceOf(Transaction)
      for (const child of Object.values(value)) forbidden(child, seen)
    }
    forbidden(publicMetadata)
    expect(action.programId).toBe(LOCAL_PLACEHOLDER_PROGRAM_ID.toBase58())
    expect(action.ritualAddress).toBe(wallet.ritualAddress)
    expect(action.feePayer).toBe(key(1).toBase58())
    expect(action.summary.tokenMint).toBe(key(2).toBase58())
    expect(action.expectation.creator).toBe(key(1).toBase58())
    expect(wallet.expectation).toBe(action.expectation)
    for (const text of [action.programId, action.ritualAddress, action.feePayer, action.summary.tokenMint, action.expectation.creator, wallet.ritualAddress]) {
      expect(new PublicKey(text).toBase58()).toBe(text)
    }
  })

  it.each([
    ['recentBlockhash', (tx: Transaction) => { tx.recentBlockhash = key(8).toBase58() }],
    ['height+', (tx: Transaction) => { tx.lastValidBlockHeight = 101 }], ['height-', (tx: Transaction) => { tx.lastValidBlockHeight = 99 }],
    ['height undefined', (tx: Transaction) => { tx.lastValidBlockHeight = undefined }],
    ['fee payer', (tx: Transaction) => { tx.feePayer = key(8) }], ['fee payer null', (tx: Transaction) => { tx.feePayer = null as never }],
    ['second instruction', (tx: Transaction) => { tx.add(tx.instructions[0]) }], ['remove instruction', (tx: Transaction) => { tx.instructions.length = 0 }],
    ['program', (tx: Transaction) => { tx.instructions[0].programId = key(8) }], ['data', (tx: Transaction) => { tx.instructions[0].data[0] ^= 1 }],
    ['account pubkey', (tx: Transaction) => { tx.instructions[0].keys[0].pubkey = key(8) }], ['signer', (tx: Transaction) => { tx.instructions[0].keys[0].isSigner = !tx.instructions[0].keys[0].isSigner }],
    ['writable', (tx: Transaction) => { tx.instructions[0].keys[0].isWritable = !tx.instructions[0].keys[0].isWritable }],
    ['reorder accounts', (tx: Transaction) => { tx.instructions[0].keys.reverse() }], ['duplicate account', (tx: Transaction) => { tx.instructions[0].keys[0] = tx.instructions[0].keys[1] }],
  ])('rejects fresh wallet clone mutated at %s', async (_name, mutate) => {
    const { preparer } = prepare(); const action = await preparer.prepareCreate(baseArgs()); const tx = preparer.getTransactionForWallet(action).transaction
    mutate(tx); await expect(() => preparer.assertWalletTransactionUnchanged(action, tx)).toThrowError(RitualPreparationError)
    const clean = preparer.getTransactionForWallet(action).transaction; expect(() => preparer.assertWalletTransactionUnchanged(action, clean)).not.toThrow()
  })

  it('allows signatures to change without changing the prepared message', async () => {
    const { preparer } = prepare(); const action = await preparer.prepareCreate(baseArgs()); const wallet = preparer.getTransactionForWallet(action).transaction
    wallet.signatures.push({ publicKey: key(1), signature: Buffer.alloc(64) })
    preparer.assertWalletTransactionUnchanged(action, wallet)
    expect(Buffer.from(wallet.serializeMessage()).toString('hex')).toBe(Buffer.from(preparer.getTransactionForWallet(action).transaction.serializeMessage()).toString('hex'))
  })

  it.each([null, {}, [], new Transaction(), new Proxy(new Transaction(), {})])('rejects invalid wallet transaction %s stably', async value => {
    const { preparer } = prepare(); const action = await preparer.prepareCreate(baseArgs())
    await expect(() => preparer.assertWalletTransactionUnchanged(action, value as never)).toThrowError(RitualPreparationError)
  })

  it('rejects fee transport mutation of message and preserves no action', async () => {
    const { transport, preparer } = prepare(); transport.fee = (message: Message) => { message.instructions.length = 0; return { context: { slot: 12 }, value: 5000 } }
    await expectCategory(preparer.prepareCreate(baseArgs()), 'fee')
  })

  it('uses the final wallet message for fee estimation', async () => {
    const { transport, preparer } = prepare(); const action = await preparer.prepareCreate(baseArgs()); const wallet = preparer.getTransactionForWallet(action)
    expect(Buffer.from(transport.messages[0].serialize()).toString('hex')).toBe(Buffer.from(wallet.transaction.compileMessage().serialize()).toString('hex'))
  })
})
