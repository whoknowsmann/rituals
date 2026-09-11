import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import {
  RITUAL_RULE_SCHEMA_VERSION,
  assertValidLockedRitualRules,
  canonicalizeRules,
  digestRules,
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

  it('changes its SHA-256 digest for every rule field mutation', async () => {
    const base = validRules()
    const mutations: LockedRitualRules[] = [
      { ...base, title: 'Evening ritual' }, { ...base, requirement: 'Different' },
      { ...base, schedule: [{ ...base.schedule[0], claimDeadlineAt: 201 }] },
      { ...base, members: [base.members[1], base.members[0]] }, { ...base, memberTotalStake: 20n },
      { ...base, confirmationMode: 'MAJORITY', additionalConfirmationThreshold: 1 }, { ...base, stakeMint: key(4) }, { ...base, tokenDecimals: 7 },
      { ...base, activationFee: 2n }, { ...base, feePayerMode: 'SPLIT' },
    ]
    const original = await digestRules(base)
    for (const mutation of mutations) expect(await digestRules(mutation)).not.toBe(original)
    expect(original).toMatch(/^[0-9a-f]{64}$/)
  })
})
