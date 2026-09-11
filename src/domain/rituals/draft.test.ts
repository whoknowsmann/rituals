import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import {
  RITUAL_RULE_SCHEMA_VERSION,
  assertValidLockedRitualRules,
  canonicalizeRules,
  digestRules,
  digestRulesSync,
  type LockedRitualRules,
} from './draft'
import type { PublicKeyText } from './types'
import { RITUAL_RULE_SCHEMA_VERSION as BARREL_RULE_SCHEMA_VERSION } from './index'

const key = (byte: number) => new PublicKey(new Uint8Array(32).fill(byte)).toBase58() as PublicKeyText
const members = [key(1), key(2)] as const
const validRules = (): LockedRitualRules => ({
  schemaVersion: RITUAL_RULE_SCHEMA_VERSION,
  cluster: 'devnet',
  title: 'Morning ritual',
  requirement: 'Share proof of the morning walk.',
  schedule: [{ eventIndex: 0, claimOpensAt: 100, claimDeadlineAt: 200, resolutionDeadlineAt: 300 }],
  members,
  memberTotalStake: 10n,
  stakeMint: key(3),
  tokenDecimals: 6,
  confirmationMode: 'ONE_FRIEND',
  additionalConfirmationThreshold: 1,
  activationFee: 1n,
  feePayerMode: 'HOST',
})

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

describe('locked Ritual rules', () => {
  it('exports the rules API from the public barrel', () => {
    expect(BARREL_RULE_SCHEMA_VERSION).toBe(RITUAL_RULE_SCHEMA_VERSION)
  })

  it('accepts the canonical minimum and emits the exact canonical JSON fixture', async () => {
    const rules = validRules()
    expect(() => assertValidLockedRitualRules(rules)).not.toThrow()
    expect(text(canonicalizeRules(rules))).toBe(
      '{"schemaVersion":1,"cluster":"devnet","title":"Morning ritual","requirement":"Share proof of the morning walk.","schedule":[{"eventIndex":0,"claimOpensAt":100,"claimDeadlineAt":200,"resolutionDeadlineAt":300}],"members":["4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi","8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR"],"memberTotalStake":"10","stakeMint":"CktRuQ2mttgRGkXJtyksdKHjUdc2C4TgDzyB98oEzy8","tokenDecimals":6,"confirmationMode":"ONE_FRIEND","additionalConfirmationThreshold":1,"activationFee":"1","feePayerMode":"HOST"}',
    )
    expect(await digestRules(rules)).toBe('552e35ec43fb2d51d0caddb64c32d00ee19bc630d2fead90989a81d7552f85b3')
  })

  it('rejects unknown private evidence fields and malformed structures', () => {
    const rules = validRules() as unknown as Record<string, unknown>
    rules.evidence = 'photo'
    expect(() => assertValidLockedRitualRules(rules)).toThrow()
    expect(() => assertValidLockedRitualRules(null)).toThrow()
    expect(() => assertValidLockedRitualRules([])).toThrow()
    expect(() => assertValidLockedRitualRules({ ...validRules(), cluster: 'mainnet-beta' })).toThrow()
    expect(() => assertValidLockedRitualRules({ ...validRules(), schemaVersion: 2 })).toThrow()
  })

  it('canonicalizes independently of insertion order without mutating input', () => {
    const rules = validRules()
    const before = { members: [...rules.members], schedule: [...rules.schedule] }
    const reordered = {
      feePayerMode: rules.feePayerMode, activationFee: rules.activationFee,
      additionalConfirmationThreshold: rules.additionalConfirmationThreshold, confirmationMode: rules.confirmationMode,
      tokenDecimals: rules.tokenDecimals, stakeMint: rules.stakeMint, memberTotalStake: rules.memberTotalStake,
      members: rules.members, schedule: rules.schedule, requirement: rules.requirement, title: rules.title,
      cluster: rules.cluster, schemaVersion: rules.schemaVersion,
    }
    expect(canonicalizeRules(rules)).toEqual(canonicalizeRules(reordered))
    expect(rules.members).toEqual(before.members)
    expect(rules.schedule).toEqual(before.schedule)
  })

  it('rejects economic, address, field-size, and schedule violations', () => {
    const base = validRules()
    const cases: unknown[] = [
      { ...base, title: '😀'.repeat(81) },
      { ...base, requirement: 'x'.repeat(281) },
      { ...base, memberTotalStake: 11n, schedule: [{ eventIndex: 0, claimOpensAt: 1, claimDeadlineAt: 2, resolutionDeadlineAt: 3 }, { eventIndex: 1, claimOpensAt: 4, claimDeadlineAt: 5, resolutionDeadlineAt: 6 }] },
      { ...base, memberTotalStake: 1n, activationFee: 0n },
      { ...base, stakeMint: 'not-a-key' },
      { ...base, tokenDecimals: 256 },
      { ...base, schedule: [{ eventIndex: 1, claimOpensAt: 1, claimDeadlineAt: 2, resolutionDeadlineAt: 3 }] },
      { ...base, schedule: [{ eventIndex: 0, claimOpensAt: 3, claimDeadlineAt: 4, resolutionDeadlineAt: 5 }, { eventIndex: 1, claimOpensAt: 5, claimDeadlineAt: 6, resolutionDeadlineAt: 7 }] },
    ]
    for (const candidate of cases) expect(() => assertValidLockedRitualRules(candidate)).toThrow()
  })

  it('rejects sparse arrays and serialized-away array properties', () => {
    const base = validRules()
    const sparseSchedule = new Array(1) as unknown as LockedRitualRules['schedule']
    const sparseMembers = new Array(2) as unknown as LockedRitualRules['members']
    const namedSchedule = [base.schedule[0]] as unknown as Record<string, unknown>
    namedSchedule.note = 'hidden'
    const symbolSchedule = [base.schedule[0]] as unknown as Record<PropertyKey, unknown>
    symbolSchedule[Symbol('hidden')] = true
    const namedMembers = [...base.members] as unknown as Record<string, unknown>
    namedMembers.note = 'hidden'
    const symbolMembers = [...base.members] as unknown as Record<PropertyKey, unknown>
    symbolMembers[Symbol('hidden')] = true
    for (const schedule of [sparseSchedule, namedSchedule, symbolSchedule]) {
      expect(() => assertValidLockedRitualRules({ ...base, schedule })).toThrow()
    }
    for (const members of [sparseMembers, namedMembers, symbolMembers]) {
      expect(() => assertValidLockedRitualRules({ ...base, members })).toThrow()
    }
  })

  it('rejects symbol keys on rules and schedule entries', () => {
    const rules = validRules() as unknown as Record<PropertyKey, unknown>
    rules[Symbol('private')] = true
    expect(() => assertValidLockedRitualRules(rules)).toThrow()
    const entry = { ...validRules().schedule[0] } as Record<PropertyKey, unknown>
    entry[Symbol('private')] = true
    expect(() => assertValidLockedRitualRules({ ...validRules(), schedule: [entry] })).toThrow()
  })

  it('rejects explicit schema, cluster, event index, and threshold violations', () => {
    const base = validRules()
    expect(() => assertValidLockedRitualRules({ ...base, schemaVersion: 2 })).toThrow()
    expect(() => assertValidLockedRitualRules({ ...base, cluster: 'mainnet-beta' })).toThrow()
    expect(() => assertValidLockedRitualRules({ ...base, schedule: [{ ...base.schedule[0], eventIndex: 1 }] })).toThrow()
    expect(() => assertValidLockedRitualRules({ ...base, additionalConfirmationThreshold: 0 })).toThrow()
  })

  it('rejects accessor-backed rules before invoking a changing title getter', async () => {
    const base = validRules()
    let reads = 0
    const rules = { ...base } as Record<string, unknown>
    Object.defineProperty(rules, 'title', {
      get: () => { reads += 1; return reads === 1 ? base.title : 'Changed after validation' },
      enumerable: true,
    })
    expect(() => assertValidLockedRitualRules(rules)).toThrow()
    expect(() => canonicalizeRules(rules as unknown as LockedRitualRules)).toThrow()
    expect(() => digestRulesSync(rules as unknown as LockedRitualRules)).toThrow()
    await expect(digestRules(rules as unknown as LockedRitualRules)).rejects.toThrow()
    expect(reads).toBe(0)
  })

  it('rejects accessor-backed schedule fields and array indices without invoking getters', () => {
    const base = validRules()
    let reads = 0
    const entry = { ...base.schedule[0] } as Record<string, unknown>
    Object.defineProperty(entry, 'claimDeadlineAt', { get: () => { reads += 1; return 2 }, enumerable: true })
    expect(() => assertValidLockedRitualRules({ ...base, schedule: [entry] })).toThrow()
    const schedule = [...base.schedule] as unknown[]
    Object.defineProperty(schedule, '0', { get: () => { reads += 1; return base.schedule[0] }, enumerable: true })
    expect(() => assertValidLockedRitualRules({ ...base, schedule } as LockedRitualRules)).toThrow()
    const memberList = [...base.members] as unknown[]
    Object.defineProperty(memberList, '0', { get: () => { reads += 1; return base.members[0] }, enumerable: true })
    expect(() => assertValidLockedRitualRules({ ...base, members: memberList } as LockedRitualRules)).toThrow()
    expect(reads).toBe(0)
  })

  it('accepts frozen ordinary data-descriptor rules', () => {
    const base = validRules()
    Object.freeze(base.schedule[0])
    Object.freeze(base.schedule)
    Object.freeze(base.members)
    Object.freeze(base)
    expect(() => assertValidLockedRitualRules(base)).not.toThrow()
    expect(() => canonicalizeRules(base)).not.toThrow()
  })

  it('accepts both free zero-zero and funded positive-positive fee pairs', () => {
    const base = validRules()
    expect(() => assertValidLockedRitualRules({ ...base, memberTotalStake: 0n, activationFee: 0n })).not.toThrow()
    expect(() => assertValidLockedRitualRules({ ...base, memberTotalStake: 0n, activationFee: 1n })).toThrow()
    expect(() => assertValidLockedRitualRules({ ...base, memberTotalStake: 10n, activationFee: 1n })).not.toThrow()
  })

  it('changes its SHA-256 digest for every valid digest-bearing mutation', async () => {
    const base = validRules()
    const mutations: LockedRitualRules[] = [
      { ...base, title: 'Evening ritual' }, { ...base, requirement: 'Different' },
      { ...base, schedule: [{ ...base.schedule[0], claimOpensAt: 0 }] },
      { ...base, schedule: [{ ...base.schedule[0], claimDeadlineAt: 201 }] },
      { ...base, schedule: [{ ...base.schedule[0], resolutionDeadlineAt: 301 }] },
      { ...base, members: [base.members[1], base.members[0]] }, { ...base, memberTotalStake: 20n },
      { ...base, confirmationMode: 'MAJORITY', additionalConfirmationThreshold: 1 }, { ...base, stakeMint: key(4) }, { ...base, tokenDecimals: 7 },
      { ...base, activationFee: 2n }, { ...base, feePayerMode: 'SPLIT' },
    ]
    const original = await digestRules(base)
    for (const mutation of mutations) expect(await digestRules(mutation)).not.toBe(original)
    expect(original).toMatch(/^[0-9a-f]{64}$/)
    expect(digestRulesSync(base)).toBe(original)
  })
})
