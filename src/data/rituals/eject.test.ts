import { describe, expect, it } from 'vitest'
import { ComputeBudgetProgram, PublicKey } from '@solana/web3.js'
import { decodeRitual, decodeRitualEvent, RitualAccountDecodeError } from './accounts'
import { accountVectors, hexToBytes } from './__fixtures__/accountVectors'
import { encodeEjectRitualData, INSTRUCTION_DISCRIMINATORS } from './instructionData'
import { buildEjectRitualInstruction } from './instructionsEvents'
import { RITUAL_EJECT_RUST_MANIFEST } from './instructionEvents.fixture'
import { eventPda, protocolConfigPda } from './pdas'
import { EJECT_COMPUTE_UNIT_LIMIT, RitualActionPreparer } from './ritualPreparedAction'
import { RitualsRpcReader, RitualRpcError } from './ritualsRpc'
import { RitualConfirmationVerifier } from './ritualConfirmation'
import { ejectAmounts } from './ejectQuote'
import { makePendingActionRecord, parsePendingAction } from '../../features/rituals/recovery/pendingAction'
import { readPendingAction } from '../../features/rituals/recovery/readPendingAction'
import type { RitualClient } from './ritualClient'
import { ALLOCATION, ejectCreator, ejectDestination, ejectKey, ejectProgramId, ejectRitualAddress, ejectVaults, eventBytes, memoryChain, ritualBytes, settledEvent, soloAccount, soloEvent } from './ejectTestHelpers'
import { FakeConfirm, validSignatures, blockhash } from './ritualConfirmation.adversarial.helpers'

const programId = ejectProgramId
const creatorToken = ejectKey(31)
const manifest = (ix: { programId: PublicKey; keys: readonly { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[]; data: Uint8Array }) => `program=${ix.programId.toBase58()};${ix.keys.map((meta) => `${meta.pubkey.toBase58()}:${meta.isWritable ? 'w' : 'r'}/${meta.isSigner ? 's' : 'n'};`).join('')}${Buffer.from(ix.data).toString('hex')}`
const context = (overrides = {}) => ({ address: ejectRitualAddress, account: soloAccount(overrides) })
const decodeEvent = (bytes: Uint8Array, endedAt?: bigint) => decodeRitualEvent({ owner: programId, data: bytes }, programId, endedAt)
const decode = (bytes: Uint8Array) => decodeRitual({ owner: programId, data: bytes }, programId)

function chainFor(account = soloAccount(), now = 990n, stake = account.fundedStakeTotal, fee = 0n) {
  const chain = memoryChain()
  chain.putRaw(protocolConfigPda(programId)[0], programId, hexToBytes(accountVectors.protocolConfig.hex))
  chain.putRitual(account)
  chain.putClock(now)
  chain.putToken(ejectVaults.stake, account.stakeMint, ejectRitualAddress, stake)
  chain.putToken(ejectVaults.fee, account.stakeMint, ejectRitualAddress, fee)
  chain.putToken(creatorToken, account.stakeMint, account.creator, 7n)
  chain.putToken(ejectDestination, account.stakeMint, ejectKey(44), 0n)
  return chain
}
const quote = (chain: ReturnType<typeof memoryChain>) => new RitualsRpcReader(chain.transport, programId).getEjectQuote(ejectRitualAddress, creatorToken)
const money = (value: Awaited<ReturnType<typeof quote>>) => [value.backToYou, value.pendingForfeit, value.destinationTotal, value.missingReceiptCount]

describe('eject_ritual instruction', () => {
  it('encodes sha256("global:eject_ritual")[0..8] then the forfeit as a little-endian u64', () => {
    expect(Array.from(INSTRUCTION_DISCRIMINATORS.eject_ritual)).toEqual([0x96, 0x75, 0xe0, 0x3d, 0xca, 0x4a, 0x6d, 0x3b])
    expect(Buffer.from(encodeEjectRitualData(500n)).toString('hex')).toBe('9675e03dca4a6d3bf401000000000000')
    expect(() => encodeEjectRitualData(-1n)).toThrow(/overflow/)
    expect(() => encodeEjectRitualData(1n << 64n)).toThrow(/overflow/)
  })

  it('matches the Rust manifest: the named accounts in program order, then every unsettled week', () => {
    const ix = buildEjectRitualInstruction({ programId, ritual: context({ currentEventIndex: 1, settledEventCount: 1, fundedStakeTotal: ALLOCATION * 2n }), creator: ejectCreator, creatorDestination: creatorToken, expectedForfeit: 500n })
    expect(manifest(ix)).toBe(RITUAL_EJECT_RUST_MANIFEST)
  })

  it('refuses anyone but the creator, a group or inactive ritual, and a vault, the destination or the wallet as the creator account', () => {
    const args = { programId, ritual: context(), creator: ejectCreator, creatorDestination: creatorToken, expectedForfeit: 0n }
    expect(() => buildEjectRitualInstruction({ ...args, creator: ejectKey(12) })).toThrow(/authorization/)
    expect(() => buildEjectRitualInstruction({ ...args, ritual: context({ status: 'Completed' }) })).toThrow(/invariant/)
    expect(() => buildEjectRitualInstruction({ ...args, ritual: { address: ejectRitualAddress, account: { ...decode(hexToBytes(accountVectors.ritual.hex)) } } })).toThrow(/invariant/)
    for (const creatorDestination of [ejectVaults.stake, ejectVaults.fee, ejectDestination, ejectCreator]) expect(() => buildEjectRitualInstruction({ ...args, creatorDestination })).toThrow(/invariant/)
  })
})

describe('Ended ritual and eject receipts decode', () => {
  const ended = (overrides = {}) => soloAccount({ status: 'Ended', fundedStakeTotal: 0n, vaultsClosed: true, ...overrides })

  it('accepts Ended with every lapsed week settled, plus the open week only when it was stamped', () => {
    expect(decode(ritualBytes(ended({ currentEventIndex: 0, settledEventCount: 0, completedAt: 990n }))).status).toBe('Ended')
    expect(decode(ritualBytes(ended({ currentEventIndex: 2, settledEventCount: 2, completedAt: 1125n }))).currentEventIndex).toBe(2)
    // Week 1 stamped and settled as kept inside its own window.
    expect(decode(ritualBytes(ended({ currentEventIndex: 1, settledEventCount: 1, completedAt: 1010n }))).status).toBe('Ended')
    for (const bad of [
      ended({ currentEventIndex: 1, settledEventCount: 1, completedAt: 990n }), // a week that had not opened
      ended({ currentEventIndex: 1, settledEventCount: 1, completedAt: 1125n }), // a lapsed week left unsettled
      ended({ currentEventIndex: 0, settledEventCount: 0, completedAt: 990n, fundedStakeTotal: 1n }),
      ended({ currentEventIndex: 0, settledEventCount: 0, completedAt: 990n, vaultsClosed: false }),
    ]) expect(() => decode(ritualBytes(bad))).toThrow(RitualAccountDecodeError)
  })

  it('accepts a receipt settled before its resolution only at the ended ritual’s exact timestamp', () => {
    const inGrace = eventBytes(settledEvent(0, 'missed', 1050n, ALLOCATION * 2n))
    const keptEarly = eventBytes(settledEvent(0, 'kept', 1010n, ALLOCATION * 2n))
    expect(() => decodeEvent(inGrace)).toThrow(/terminal state/)
    expect(decodeEvent(inGrace, 1050n).forfeitedTotal).toBe(ALLOCATION)
    expect(() => decodeEvent(inGrace, 1051n)).toThrow(/terminal state/)
    expect(decodeEvent(keptEarly, 1010n).payoutTotal).toBe(ALLOCATION)
    expect(decodeEvent(eventBytes(settledEvent(0, 'kept', 1056n, ALLOCATION * 2n))).status).toBe('Settled')
  })
})

describe('end-early quote (one chain snapshot)', () => {
  it('before week 1 opens everything comes back and nothing goes to the destination', async () => {
    expect(money(await quote(chainFor()))).toEqual([ALLOCATION * 3n, 0n, 0n, 0])
  })

  it('an open, unstamped week comes back; dust in either vault comes back too', async () => {
    expect(money(await quote(chainFor(soloAccount(), 1045n, ALLOCATION * 3n + 2n, 3n)))).toEqual([ALLOCATION * 3n + 5n, 0n, 0n, 0])
  })

  it('a kept week waiting to settle comes back; a lapsed unstamped week goes to the destination and needs a receipt', async () => {
    const chain = chainFor(soloAccount(), 1125n)
    chain.putEvent(soloEvent(0, { claimedMembersBitmap: 1, confirmedMembersBitmap: 1 }))
    const value = await quote(chain)
    expect(money(value)).toEqual([ALLOCATION * 2n, ALLOCATION, ALLOCATION, 1])
    expect(value.now).toBe(1125n)
    expect(value.creatorBalance).toBe(7n)
    expect(value.ritual.account.status).toBe('Active')
  })

  it('the destination total includes weeks already missed; a lapsed declared skip comes back', async () => {
    const settled = soloAccount({ currentEventIndex: 1, settledEventCount: 1, fundedStakeTotal: ALLOCATION * 2n, skipDeclared: true, skipEventIndex: 1 })
    const chain = chainFor(settled, 1110n)
    chain.putEvent(settledEvent(0, 'missed', 1056n, ALLOCATION * 2n))
    expect(money(await quote(chain))).toEqual([ALLOCATION * 2n, 0n, ALLOCATION, 1])
  })

  it('a lamport-only event address is still a week nobody opened', async () => {
    const chain = chainFor(soloAccount(), 1050n)
    chain.putRaw(eventPda(ejectRitualAddress, 0, programId)[0], PublicKey.default, new Uint8Array(0))
    expect(money(await quote(chain))).toEqual([ALLOCATION * 2n, ALLOCATION, ALLOCATION, 1])
  })

  it('refuses a ritual that is not active, and a creator account it does not own', async () => {
    await expect(quote(chainFor(soloAccount({ status: 'Ended', fundedStakeTotal: 0n, vaultsClosed: true, completedAt: 990n })))).rejects.toBeInstanceOf(RitualRpcError)
    const chain = chainFor()
    chain.putToken(creatorToken, soloAccount().stakeMint, ejectKey(45), 7n)
    await expect(quote(chain)).rejects.toThrow(/money accounts/)
  })

  it('stops at the first week still open, exactly like the program', () => {
    const account = soloAccount()
    const events = [null, null, null]
    expect(ejectAmounts(account, events, 1046n, ALLOCATION * 3n, 0n).pendingForfeit).toBe(ALLOCATION)
    expect(ejectAmounts(account, events, 1045n, ALLOCATION * 3n, 0n).pendingForfeit).toBe(0n)
    expect(() => ejectAmounts(account, events, 990n, ALLOCATION * 3n - 1n, 0n)).toThrow()
  })
})

describe('prepared eject, readback and recovery', () => {
  const transport = () => ({
    getLatestBlockhashAndContext: async () => ({ context: { slot: 12 }, value: { blockhash, lastValidBlockHeight: 100 } }),
    getFeeForMessage: async () => ({ context: { slot: 12 }, value: 5000 }),
    getMinimumBalanceForRentExemption: async (length: number) => length * 10,
  })
  const sixteen = Object.freeze(Array.from({ length: 16 }, (_, index) => Object.freeze({ opens: 1000n + 60n * BigInt(index), deadline: 1045n + 60n * BigInt(index), resolution: 1055n + 60n * BigInt(index) })))

  it('keeps the sixteen-week worst case under the 1232-byte packet limit with the eject compute limit', async () => {
    const preparer = new RitualActionPreparer(transport(), programId)
    const ritual = { address: ejectRitualAddress, account: soloAccount({ schedule: sixteen, memberTotalStake: ALLOCATION * 16n, fundedStakeTotal: ALLOCATION * 16n }) }
    const prepared = await preparer.prepareEject({ programId, ritual, creator: ejectCreator, creatorDestination: creatorToken, expectedForfeit: ALLOCATION * 16n, expectedRefund: 0n, creatorBalanceBefore: 7n, missingReceiptCount: 16 })
    const wallet = preparer.getTransactionForWallet(prepared)
    expect(wallet.transaction.instructions[0].keys).toHaveLength(9 + 16)
    expect(wallet.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).length).toBeLessThanOrEqual(1232)
    const limit = wallet.transaction.instructions.find((ix) => ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 2)
    expect(Buffer.from(limit!.data).toString('hex')).toBe(Buffer.from(ComputeBudgetProgram.setComputeUnitLimit({ units: EJECT_COMPUTE_UNIT_LIMIT }).data).toString('hex'))
    expect(prepared.expectation).toEqual({ kind: 'ejected', creatorDestination: creatorToken.toBase58(), minimumCreatorBalance: 7n })
    expect(prepared.summary.estimatedRentLamports).toBe(16n * 139n * 10n)
    expect(prepared.summary.escrowSettlementTransfer).toBe(ALLOCATION * 16n)
    const record = makePendingActionRecord(prepared, 1)
    expect(parsePendingAction({ ...record, actor: ejectCreator.toBase58(), eventIndex: 0 })?.actionKind).toBe('eject')
  })

  it('reads back Ended with both vaults gone and the creator paid; a vault left behind is a mismatch', async () => {
    const chain = chainFor(soloAccount({ status: 'Ended', currentEventIndex: 2, settledEventCount: 2, fundedStakeTotal: 0n, vaultsClosed: true, completedAt: 1125n }))
    chain.remove(ejectVaults.stake); chain.remove(ejectVaults.fee)
    const verifier = new RitualConfirmationVerifier(new RitualsRpcReader(chain.transport, programId), new FakeConfirm())
    const action = (minimumCreatorBalance: bigint) => ({ signature: validSignatures[0], blockhash, lastValidBlockHeight: 10, submittedContextSlot: 10, ritualAddress: ejectRitualAddress, expectation: { kind: 'ejected', creatorDestination: creatorToken, minimumCreatorBalance } })
    expect((await verifier.confirmAndReadRitual(action(7n))).bundle.ritual.account.status).toBe('Ended')
    await expect(verifier.confirmAndReadRitual(action(8n))).rejects.toThrow(/balances/)
    chain.putToken(ejectVaults.fee, soloAccount().stakeMint, ejectRitualAddress, 0n)
    await expect(verifier.confirmAndReadRitual(action(7n))).rejects.toThrow(/balances/)
  })

  it('recovery sees an eject only once the ritual reads Ended for its creator', async () => {
    const record = { version: 1 as const, actionKind: 'eject' as const, ritualAddress: ejectRitualAddress.toBase58(), messageDigest: 'a'.repeat(64), blockhash, lastValidBlockHeight: 10, createdAt: 1, actor: ejectCreator.toBase58(), eventIndex: 0 }
    const client = (status: string, creator = ejectCreator) => ({ readRitual: async () => ({ slot: 9, account: { status, creator } }) }) as unknown as RitualClient
    expect(await readPendingAction(client('Ended'), ejectRitualAddress, record)).toEqual({ slot: 9, actionObserved: true })
    expect(await readPendingAction(client('Active'), ejectRitualAddress, record)).toEqual({ slot: 9, actionObserved: false })
    expect(await readPendingAction(client('Ended', ejectKey(12)), ejectRitualAddress, record)).toEqual({ slot: 9, actionObserved: false })
  })
})
