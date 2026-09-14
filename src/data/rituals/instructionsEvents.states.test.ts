import { describe, expect, it } from 'vitest'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { decodeCompletionClaim, decodeRitual, decodeRitualEvent, type CompletionClaimAccountView, type RitualAccountView, type RitualEventAccountView } from './accounts'
import { accountVectors, envelope } from './__fixtures__/accountVectors'
import { claimPda, eventPda, ritualPda } from './pdas'
import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'
import { RitualInstructionBuildError } from './instructionsLifecycle'
import { buildApproveClaimInstruction, buildClaimCompletionInstruction, buildCloseTerminalVaultsInstruction, buildFinalizeEventInstruction, buildInitializeCurrentEventInstruction, buildQuestionClaimInstruction } from './instructionsEvents'

const programId = LOCAL_PLACEHOLDER_PROGRAM_ID
const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const ritualAccount = decodeRitual(envelope(accountVectors.ritual.hex), programId)
const ritualAddress = ritualPda(ritualAccount.creator, ritualAccount.nonce, programId)[0]
const eventAccount = decodeRitualEvent(envelope(accountVectors.ritualEvent.hex), programId)
const eventAddress = eventPda(ritualAddress, eventAccount.eventIndex, programId)[0]
const claimAccount = decodeCompletionClaim(envelope(accountVectors.completionClaim.hex), programId)
const claimAddress = claimPda(eventAddress, claimAccount.claimant, 0, programId)[0]
const destinations = [key(41), key(42), key(43)]
const ritual = { address: ritualAddress, account: ritualAccount }
const event = { address: eventAddress, account: eventAccount }
const claim = { address: claimAddress, account: claimAccount }
const scheduled = { address: eventAddress, account: { ...eventAccount, status: 'Scheduled' as const, claimedMembersBitmap: 0, confirmedMembersBitmap: 0, questionedMembersBitmap: 0 } }
const claimed = { address: eventAddress, account: { ...eventAccount, status: 'Claiming' as const, claimedMembersBitmap: 2, confirmedMembersBitmap: 0, questionedMembersBitmap: 0 } }
const terminalRitual = (status: 'Completed' | 'Cancelled', vaultsClosed = false) => ({ address: ritualAddress, account: { ...ritualAccount, status, vaultsClosed } })
const args = {
  initialize: { programId, ritual, eventIndex: 0, payer: ritualAccount.creator },
  claim: { programId, ritual, event: scheduled, claimant: ritualAccount.members[1] },
  approve: { programId, ritual, event: claimed, claim, approver: ritualAccount.members[2] },
  question: { programId, ritual, event: claimed, claim, questioner: ritualAccount.members[2] },
  finalize: { programId, ritual, event, destinationTokenAccounts: destinations },
  close: { programId, ritual: terminalRitual('Completed') },
} as const
const failBuild = (fn: () => unknown) => { expect(fn).toThrow(RitualInstructionBuildError) }
const withRitual = (change: Partial<RitualAccountView>) => ({ ...args.initialize, ritual: { address: ritualAddress, account: { ...ritualAccount, ...change } } })
const withEvent = (change: Partial<RitualEventAccountView>) => ({ ...args.approve, event: { address: eventAddress, account: { ...claimed.account, ...change } } })
const withClaim = (change: Partial<CompletionClaimAccountView>) => ({ ...args.approve, claim: { address: claimAddress, account: { ...claimAccount, ...change } } })
const withQuestionClaim = (change: Partial<CompletionClaimAccountView>) => ({ ...args.question, claim: { address: claimAddress, account: { ...claimAccount, ...change } } })

// These rows deliberately use decoded-view-shaped objects, not raw account fixtures.
describe('event builders: canonical cross-account matrix', () => {
  it.each([
    ['ritual address', () => buildInitializeCurrentEventInstruction({ ...withRitual({}), ritual: { address: key(90), account: ritualAccount } })],
    ['ritual nonce', () => buildInitializeCurrentEventInstruction(withRitual({ nonce: ritualAccount.nonce + 1n }))],
    ['creator', () => buildInitializeCurrentEventInstruction(withRitual({ creator: key(90) }))],
    ['protocol config', () => buildInitializeCurrentEventInstruction(withRitual({ protocolConfig: key(90) }))],
    ['stake vault', () => buildInitializeCurrentEventInstruction(withRitual({ stakeVault: key(90) }))],
    ['fee vault', () => buildInitializeCurrentEventInstruction(withRitual({ feeVault: key(90) }))],
    ['ritual bump', () => buildInitializeCurrentEventInstruction(withRitual({ bump: (ritualAccount.bump + 1) % 256 }))],
    ['stake vault bump', () => buildInitializeCurrentEventInstruction(withRitual({ stakeVaultBump: (ritualAccount.stakeVaultBump + 1) % 256 }))],
    ['fee vault bump', () => buildInitializeCurrentEventInstruction(withRitual({ feeVaultBump: (ritualAccount.feeVaultBump + 1) % 256 }))],
    ['member count', () => buildApproveClaimInstruction(withEvent({ memberCount: 2 }))],
    ['event ritual', () => buildApproveClaimInstruction(withEvent({ ritual: key(90) }))],
    ['event index', () => buildApproveClaimInstruction(withEvent({ eventIndex: 1 }))],
    ['window opens', () => buildApproveClaimInstruction(withEvent({ window: { ...claimed.account.window, opens: claimed.account.window.opens + 1n } }))],
    ['window deadline', () => buildApproveClaimInstruction(withEvent({ window: { ...claimed.account.window, deadline: claimed.account.window.deadline + 1n } }))],
    ['window resolution', () => buildApproveClaimInstruction(withEvent({ window: { ...claimed.account.window, resolution: claimed.account.window.resolution + 1n } }))],
    ['event address', () => buildApproveClaimInstruction({ ...withEvent({}), event: { ...withEvent({}).event, address: key(90) } })],
    ['event bump', () => buildApproveClaimInstruction(withEvent({ bump: (eventAccount.bump + 1) % 256 }))],
    ['claim address', () => buildApproveClaimInstruction({ ...args.approve, claim: { ...claim, address: key(90) } })],
    ['claim ritual', () => buildApproveClaimInstruction(withClaim({ ritual: key(90) }))],
    ['claim event', () => buildApproveClaimInstruction(withClaim({ event: key(90) }))],
    ['claim event index', () => buildApproveClaimInstruction(withClaim({ eventIndex: 1 }))],
    ['claimant/member relation', () => buildApproveClaimInstruction(withClaim({ claimant: ritualAccount.members[0] }))],
    ['claim member index', () => buildApproveClaimInstruction(withClaim({ memberIndex: 0 }))],
    ['claim version', () => buildApproveClaimInstruction(withClaim({ claimVersion: 1 }))],
    ['claim threshold', () => buildApproveClaimInstruction(withClaim({ requiredAdditionalConfirmations: 1 }))],
    ['claim bump', () => buildApproveClaimInstruction({ ...withClaim({}), claim: { ...withClaim({}).claim, account: { ...claimAccount, bump: (claimAccount.bump + 1) % 256 } } })],
    ['program mismatch', () => buildInitializeCurrentEventInstruction({ ...args.initialize, programId: key(90) })],
    ['invalid event index runtime type', () => buildInitializeCurrentEventInstruction({ ...args.initialize, eventIndex: '0' } as never)],
    ['invalid payer runtime type', () => buildInitializeCurrentEventInstruction({ ...args.initialize, payer: 'payer' } as never)],
    ['invalid destination runtime type', () => buildFinalizeEventInstruction({ ...args.finalize, destinationTokenAccounts: [key(41), 'bad', key(43)] } as never)],
  ])('rejects %s', (_name, build) => failBuild(build))
})

describe('initialize current event state matrix', () => {
  it.each([
    ['Funding', 'Funding'], ['Completed', 'Completed'], ['Cancelled', 'Cancelled'],
    ['wrong current index', 1], ['outside schedule', ritualAccount.schedule.length], ['event index mismatch', 1],
    ['default payer', PublicKey.default], ['non-key payer', 'payer'],
  ])('rejects %s', (name, value) => {
    const change = typeof value === 'string' && ['Funding', 'Completed', 'Cancelled'].includes(value) ? { status: value as RitualAccountView['status'] } : {}
    const input = name === 'non-key payer' ? { ...args.initialize, payer: value } : typeof value === 'number' ? { ...args.initialize, eventIndex: value } : value instanceof PublicKey ? { ...args.initialize, payer: value } : { ...args.initialize, ritual: { address: ritualAddress, account: { ...ritualAccount, ...change } } }
    failBuild(() => buildInitializeCurrentEventInstruction(input as never))
  })
  it('accepts a coherent current event at index one', () => {
    const account = { ...ritualAccount, currentEventIndex: 1 as const }
    expect(() => buildInitializeCurrentEventInstruction({ ...args.initialize, eventIndex: 1, ritual: { address: ritualAddress, account } })).not.toThrow()
  })
  it('requires a signer payer and exact event PDA metas', () => {
    const ix = buildInitializeCurrentEventInstruction(args.initialize)
    expect(ix.keys.map(k => [k.pubkey.toBase58(), k.isWritable, k.isSigner])).toEqual([
      [ritualAddress.toBase58(), true, false], [eventAddress.toBase58(), true, false], [ritualAccount.creator.toBase58(), true, true], [SystemProgram.programId.toBase58(), false, false],
    ])
  })
})

describe('claim, approve, and question state matrix', () => {
  it.each([
    ['claim Resolving', () => buildClaimCompletionInstruction({ ...args.claim, event: { ...claimed, account: { ...claimed.account, status: 'Resolving' } } })],
    ['claim Settled', () => buildClaimCompletionInstruction({ ...args.claim, event: { ...scheduled, account: { ...scheduled.account, status: 'Settled' } } })],
    ['claim Voided', () => buildClaimCompletionInstruction({ ...args.claim, event: { ...scheduled, account: { ...scheduled.account, status: 'Voided' } } })],
    ['claim nonmember', () => buildClaimCompletionInstruction({ ...args.claim, claimant: key(90) })],
    ['claim unfunded', () => buildClaimCompletionInstruction({ ...args.claim, claimant: ritualAccount.members[0], ritual: { ...ritual, account: { ...ritualAccount, fundedMembersBitmap: 2 } } })],
    ['claim already claimed', () => buildClaimCompletionInstruction({ ...args.claim, event: { ...scheduled, account: { ...scheduled.account, claimedMembersBitmap: 2 } } })],
    ['approve Settled', () => buildApproveClaimInstruction({ ...args.approve, event: { ...claimed, account: { ...claimed.account, status: 'Settled' } } })],
    ['approve Confirmed', () => buildApproveClaimInstruction(withClaim({ status: 'Confirmed' }))],
    ['approve threshold', () => buildApproveClaimInstruction(withClaim({ approvalCount: claimAccount.requiredAdditionalConfirmations }))],
    ['approve missing claimed bit', () => buildApproveClaimInstruction({ ...args.approve, event: { ...claimed, account: { ...claimed.account, claimedMembersBitmap: 0 } } })],
    ['approve confirmed claimant', () => buildApproveClaimInstruction({ ...args.approve, event: { ...claimed, account: { ...claimed.account, confirmedMembersBitmap: 2 } } })],
    ['approve questioned claimant', () => buildApproveClaimInstruction({ ...args.approve, event: { ...claimed, account: { ...claimed.account, questionedMembersBitmap: 2 } } })],
    ['approve self', () => buildApproveClaimInstruction({ ...args.approve, approver: claimAccount.claimant })],
    ['approve nonmember', () => buildApproveClaimInstruction({ ...args.approve, approver: key(90) })],
    ['approve duplicate', () => buildApproveClaimInstruction({ ...args.approve, claim: { ...claim, account: { ...claimAccount, approvalsBitmap: 4, approvalCount: 1 } } })],
    ['approve unfunded prior approval', () => buildApproveClaimInstruction({ ...args.approve, ritual: { ...ritual, account: { ...ritualAccount, fundedMembersBitmap: 3 } }, approver: ritualAccount.members[0], claim: { ...claim, account: { ...claimAccount, approvalsBitmap: 4, approvalCount: 1 } } })],
    ['approve claimed before window', () => buildApproveClaimInstruction(withClaim({ claimedAt: claimed.account.window.opens - 1n }))],
    ['approve claimed after window', () => buildApproveClaimInstruction(withClaim({ claimedAt: claimed.account.window.deadline + 1n }))],
    ['question Settled', () => buildQuestionClaimInstruction({ ...args.question, event: { ...claimed, account: { ...claimed.account, status: 'Settled' } } })],
    ['question Confirmed', () => buildQuestionClaimInstruction(withClaim({ status: 'Confirmed' }) as never)],
    ['question missing claimed bit', () => buildQuestionClaimInstruction({ ...args.question, event: { ...claimed, account: { ...claimed.account, claimedMembersBitmap: 0 } } })],
    ['question terminal claimant bit', () => buildQuestionClaimInstruction({ ...args.question, event: { ...claimed, account: { ...claimed.account, confirmedMembersBitmap: 2 } } })],
    ['question self', () => buildQuestionClaimInstruction({ ...args.question, questioner: claimAccount.claimant })],
    ['question nonmember', () => buildQuestionClaimInstruction({ ...args.question, questioner: key(90) })],
    ['question prior approval', () => buildQuestionClaimInstruction({ ...args.question, claim: { ...claim, account: { ...claimAccount, approvalsBitmap: 4, approvalCount: 1 } } })],
    ['question unfunded prior approval', () => buildQuestionClaimInstruction({ ...args.question, ritual: { ...ritual, account: { ...ritualAccount, fundedMembersBitmap: 3 } }, questioner: ritualAccount.members[0], claim: { ...claim, account: { ...claimAccount, approvalsBitmap: 4, approvalCount: 1 } } })],
    ['question claimed before window', () => buildQuestionClaimInstruction(withQuestionClaim({ claimedAt: claimed.account.window.opens - 1n }) as never)],
    ['question claimed after window', () => buildQuestionClaimInstruction(withQuestionClaim({ claimedAt: claimed.account.window.deadline + 1n }) as never)],
  ])('rejects %s', (_name, build) => failBuild(build))
  it.each(['Claiming', 'Resolving'] as const)('accepts approve in %s', status => expect(() => buildApproveClaimInstruction({ ...args.approve, event: { ...claimed, account: { ...claimed.account, status } } })).not.toThrow())
  it.each(['Claiming', 'Resolving'] as const)('accepts question in %s', status => expect(() => buildQuestionClaimInstruction({ ...args.question, event: { ...claimed, account: { ...claimed.account, status } } })).not.toThrow())
  it('emits exact approval/question signer flags and data', () => {
    for (const ix of [buildApproveClaimInstruction(args.approve), buildQuestionClaimInstruction(args.question)]) {
      expect(ix.keys).toHaveLength(4); expect(ix.keys[3].isSigner).toBe(true); expect(ix.keys[3].isWritable).toBe(false); expect(ix.data).toHaveLength(9)
    }
  })
  it.each([claimed.account.window.opens, claimed.account.window.deadline])('accepts claimedAt boundary %s', claimedAt => {
    expect(() => buildApproveClaimInstruction(withClaim({ claimedAt }))).not.toThrow()
    expect(() => buildQuestionClaimInstruction(withQuestionClaim({ claimedAt }) as never)).not.toThrow()
  })
  it('accepts a scheduled or claiming unclaimed event for every funded claimant index with derived claim meta', () => {
    for (const status of ['Scheduled', 'Claiming'] as const) {
      for (let index = 0; index < ritualAccount.members.length; index += 1) {
        const eventView = { ...scheduled, account: { ...scheduled.account, status, claimedMembersBitmap: 0 } }
        const ix = buildClaimCompletionInstruction({ ...args.claim, event: eventView, claimant: ritualAccount.members[index] })
        expect(ix.keys[2].pubkey).toEqual(claimPda(eventAddress, ritualAccount.members[index], 0, programId)[0])
      }
    }
  })
  it('rejects unfunded actors for approval and question independently', () => {
    const partial = { ...ritual, account: { ...ritualAccount, fundedMembersBitmap: 2 } }
    failBuild(() => buildApproveClaimInstruction({ ...args.approve, ritual: partial, approver: ritualAccount.members[0] }))
    failBuild(() => buildQuestionClaimInstruction({ ...args.question, ritual: partial, questioner: ritualAccount.members[0] }))
  })
})

describe('finalize and close state/shape matrix', () => {
  it.each(['Settled', 'Voided'] as const)('rejects finalize %s', status => failBuild(() => buildFinalizeEventInstruction({ ...args.finalize, event: { ...event, account: { ...eventAccount, status } } })))
  it.each([
    ['settlement version', { settlementVersion: 1 }], ['resolvedAt', { resolvedAt: 1n }], ['receipt event pool', { eventPool: 1n }],
    ['forfeited total', { forfeitedTotal: 1n }], ['payout total', { payoutTotal: 1n }], ['refunded total', { refundedTotal: 1n }],
    ['confirmed member count', { confirmedMemberCount: 1 }], ['remainder units', { remainderUnits: 1n }], ['remaining stake total after', { remainingStakeTotalAfter: 1n }], ['void reason', { voidReason: 'Other' }],
    ['duplicate destinations', { destinationTokenAccounts: [key(41), key(41), key(43)] }], ['stake vault destination', { destinationTokenAccounts: [key(41), ritualAccount.stakeVault, key(43)] }],
    ['fee vault destination', { destinationTokenAccounts: [key(41), ritualAccount.feeVault, key(43)] }], ['sparse destinations', { destinationTokenAccounts: Object.assign([], { 2: key(43), length: 3 }) }],
  ])('rejects finalize %s', (_name, change) => failBuild(() => {
    const value = change as Record<string, unknown>
    if ('destinationTokenAccounts' in value) return buildFinalizeEventInstruction({ ...args.finalize, destinationTokenAccounts: value.destinationTokenAccounts as never })
    return buildFinalizeEventInstruction({ ...args.finalize, event: { ...event, account: { ...eventAccount, ...value } } })
  }))
  it('accepts Scheduled, Claiming, and Resolving and copies destinations', () => {
    for (const status of ['Scheduled', 'Claiming', 'Resolving'] as const) {
      const list = [key(41), key(42), key(43)]
      const ix = buildFinalizeEventInstruction({ ...args.finalize, event: { ...event, account: { ...eventAccount, status } }, destinationTokenAccounts: list })
      list[0] = key(99); expect(ix.keys[5].pubkey).toEqual(key(41))
    }
  })
  it('accepts coherent N2 and N6 routing views with exact destination order and flags', () => {
    for (const count of [2, 6]) {
      const members = Array.from({ length: count }, (_, index) => key(60 + index))
      members[0] = ritualAccount.members[0]
      const ritualView = { address: ritualAddress, account: { ...ritualAccount, members, fundedMembersBitmap: (1 << count) - 1 } }
      const eventView = { address: eventAddress, account: { ...eventAccount, memberCount: count, claimedMembersBitmap: 0, confirmedMembersBitmap: 0, questionedMembersBitmap: 0 } }
      const destinationList = members.map((_, index) => key(100 + index))
      const ix = buildFinalizeEventInstruction({ ...args.finalize, ritual: ritualView, event: eventView, destinationTokenAccounts: destinationList })
      expect(ix.keys).toHaveLength(5 + count)
      expect(ix.keys.slice(5).map(meta => meta.pubkey)).toEqual(destinationList)
      expect(ix.keys.slice(5).every(meta => meta.isWritable && !meta.isSigner)).toBe(true)
      destinationList[0] = key(199)
      expect(ix.keys[5].pubkey).toEqual(key(100))
    }
  })
  it.each(['Completed', 'Cancelled'] as const)('accepts decoded-view-shaped terminal context %s', status => expect(() => buildCloseTerminalVaultsInstruction({ ...args.close, ritual: terminalRitual(status) })).not.toThrow())
  it.each(['Funding', 'Active'] as const)('rejects nonterminal ritual %s', status => failBuild(() => buildCloseTerminalVaultsInstruction({ ...args.close, ritual: { address: ritualAddress, account: { ...ritualAccount, status } } })))
  it('rejects already closed vaults and emits immutable creator rent meta', () => {
    failBuild(() => buildCloseTerminalVaultsInstruction({ ...args.close, ritual: terminalRitual('Completed', true) }))
    const ix = buildCloseTerminalVaultsInstruction(args.close)
    expect(ix.keys).toHaveLength(5); expect(ix.keys[3].pubkey).toEqual(ritualAccount.creator); expect(ix.keys[3].isWritable).toBe(true); expect(ix.keys[3].isSigner).toBe(false)
  })
})

describe('event builder snapshot and fresh-build guarantees', () => {
  it('reads every consumed account view through a stable snapshot', () => {
    const counts = new Map<string, number>()
    const proxy = <T extends object>(label: string, value: T): T => new Proxy(value, { get(target, property, receiver) { const name = String(property); counts.set(`${label}.${name}`, (counts.get(`${label}.${name}`) ?? 0) + 1); return Reflect.get(target, property, receiver) } })
    const ritualView = proxy('ritual', ritualAccount)
    const eventView = proxy('event', claimed.account)
    const claimView = proxy('claim', claimAccount)
    expect(() => buildApproveClaimInstruction({ ...args.approve, ritual: { address: ritualAddress, account: ritualView }, event: { address: eventAddress, account: eventView }, claim: { address: claimAddress, account: claimView } })).not.toThrow()
    for (const field of ['creator', 'nonce', 'protocolConfig', 'stakeMint', 'stakeVault', 'feeVault', 'members', 'schedule', 'status', 'currentEventIndex', 'bump', 'stakeVaultBump', 'feeVaultBump']) expect(counts.get(`ritual.${field}`)).toBe(1)
    for (const field of ['ritual', 'eventIndex', 'window', 'memberCount', 'status', 'claimedMembersBitmap', 'confirmedMembersBitmap', 'questionedMembersBitmap', 'resolvedAt', 'settlementVersion', 'voidReason', 'eventPool', 'forfeitedTotal', 'payoutTotal', 'refundedTotal', 'confirmedMemberCount', 'remainderUnits', 'remainingStakeTotalAfter', 'bump']) expect(counts.get(`event.${field}`)).toBe(1)
    for (const field of ['ritual', 'event', 'eventIndex', 'claimant', 'memberIndex', 'claimVersion', 'status', 'requiredAdditionalConfirmations', 'approvalsBitmap', 'approvalCount', 'claimedAt', 'bump']) expect(counts.get(`claim.${field}`)).toBe(1)
  })
  it('does not let a changing getter create validation/meta mismatch', () => {
    let reads = 0
    const changing = new Proxy(ritualAccount, { get(target, property, receiver) { if (property === 'status') reads += 1; return property === 'status' && reads > 1 ? 'Funding' : Reflect.get(target, property, receiver) } })
    expect(() => buildInitializeCurrentEventInstruction({ ...args.initialize, ritual: { address: ritualAddress, account: changing } })).not.toThrow(); expect(reads).toBe(1)
  })
  it('converts throwing getters to stable BuildError', () => {
    const broken = new Proxy(eventAccount, { get(_target, property) { if (property === 'status') throw new Error('boom'); return Reflect.get(eventAccount, property) } })
    failBuild(() => buildFinalizeEventInstruction({ ...args.finalize, event: { address: eventAddress, account: broken } }))
  })
  it('does not alias keys or data between fresh builds', () => {
    const first = buildFinalizeEventInstruction(args.finalize); const second = buildFinalizeEventInstruction(args.finalize)
    expect(first).not.toBe(second); expect(first.keys).not.toBe(second.keys); expect(first.data).not.toBe(second.data); expect(first.data).toEqual(second.data)
  })
})
