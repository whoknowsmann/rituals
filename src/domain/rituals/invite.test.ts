import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { digestRules, type LockedRitualRules } from './draft'
import type { PublicKeyText } from './types'
import {
  RITUAL_INVITE_DOMAIN,
  RITUAL_INVITE_SCHEMA_VERSION,
  verifyInvite,
  type RitualInvite,
  type RitualAccountView,
} from './invite'

const key = (byte: number) => new PublicKey(new Uint8Array(32).fill(byte)).toBase58() as PublicKeyText
const rules = (): LockedRitualRules => ({
  schemaVersion: 1, cluster: 'devnet', title: 'Ritual', requirement: 'Walk',
  schedule: [{ eventIndex: 0, claimOpensAt: 1, claimDeadlineAt: 2, resolutionDeadlineAt: 3 }],
  members: [key(1), key(2)] as LockedRitualRules['members'], memberTotalStake: 0n, stakeMint: key(3) as LockedRitualRules['stakeMint'], tokenDecimals: 6,
  confirmationMode: 'HONOR', additionalConfirmationThreshold: 0, activationFee: 0n, feePayerMode: 'HOST',
})

async function fixture(): Promise<{ invite: RitualInvite; onchain: RitualAccountView }> {
  const locked = rules()
  const ruleDigest = await digestRules(locked)
  return {
    invite: { domain: RITUAL_INVITE_DOMAIN, schemaVersion: RITUAL_INVITE_SCHEMA_VERSION, cluster: 'devnet', ritual: key(4) as RitualInvite['ritual'], ruleDigest, rules: locked },
    onchain: { address: key(4) as RitualAccountView['address'], cluster: 'devnet', ruleDigest },
  }
}

describe('Ritual invitations', () => {
  it('verifies a matching invite against the on-chain account view', async () => {
    const { invite, onchain } = await fixture()
    expect(verifyInvite(invite, onchain)).toEqual({ ok: true })
  })

  it('fails closed for wrong domain, schema, ritual, cluster, digest, and private fields', async () => {
    const { invite, onchain } = await fixture()
    expect(verifyInvite({ ...invite, domain: 'evil' }, onchain)).toEqual({ ok: false, reason: 'wrong_domain' })
    expect(verifyInvite({ ...invite, schemaVersion: 2 }, onchain)).toEqual({ ok: false, reason: 'unsupported_schema' })
    expect(verifyInvite({ ...invite, rules: { ...invite.rules, evidence: 'photo' } }, onchain)).toEqual({ ok: false, reason: 'invalid_rules' })
    expect(verifyInvite(invite, { ...onchain, cluster: 'mainnet-beta' })).toEqual({ ok: false, reason: 'cluster_mismatch' })
    expect(verifyInvite({ ...invite, ritual: key(5) }, onchain)).toEqual({ ok: false, reason: 'ritual_mismatch' })
    expect(verifyInvite({ ...invite, ruleDigest: '0'.repeat(64) }, onchain)).toEqual({ ok: false, reason: 'digest_mismatch' })
    expect(verifyInvite({ ...invite, extra: true }, onchain)).toEqual({ ok: false, reason: 'invalid_input' })
  })

  it('rejects symbol keys on rules, invite, and on-chain views', async () => {
    const { invite, onchain } = await fixture()
    const rulesWithSymbol = { ...invite.rules } as Record<PropertyKey, unknown>
    rulesWithSymbol[Symbol('private')] = true
    expect(verifyInvite({ ...invite, rules: rulesWithSymbol }, onchain)).toEqual({ ok: false, reason: 'invalid_rules' })
    const inviteWithSymbol = { ...invite } as Record<PropertyKey, unknown>
    inviteWithSymbol[Symbol('private')] = true
    expect(verifyInvite(inviteWithSymbol, onchain)).toEqual({ ok: false, reason: 'invalid_input' })
    const onchainWithSymbol = { ...onchain } as Record<PropertyKey, unknown>
    onchainWithSymbol[Symbol('private')] = true
    expect(verifyInvite(invite, onchainWithSymbol)).toEqual({ ok: false, reason: 'invalid_input' })
  })

  it('normalizes hostile objects and throwing top-level getters to invalid_input', async () => {
    const { invite, onchain } = await fixture()
    const hostile = new Proxy({}, {
      getPrototypeOf: () => { throw new Error('prototype') },
      ownKeys: () => { throw new Error('keys') },
    })
    expect(verifyInvite(hostile, onchain)).toEqual({ ok: false, reason: 'invalid_input' })
    const throwingRules = Object.defineProperty({ ...invite }, 'rules', {
      get: () => { throw new Error('rules') }, enumerable: true,
    })
    expect(verifyInvite(throwingRules, onchain)).toEqual({ ok: false, reason: 'invalid_input' })
    const throwingOnchain = new Proxy(onchain, { get: () => { throw new Error('field') } })
    expect(verifyInvite(invite, throwingOnchain)).toEqual({ ok: false, reason: 'invalid_input' })
  })

  it('classifies invite and on-chain accessors as invalid_input without invoking getters', async () => {
    const { invite, onchain } = await fixture()
    for (const field of ['ruleDigest', 'ritual', 'rules'] as const) {
      let reads = 0
      const hostile = { ...invite }
      Object.defineProperty(hostile, field, { get: () => { reads += 1; return invite[field] }, enumerable: true })
      expect(verifyInvite(hostile, onchain)).toEqual({ ok: false, reason: 'invalid_input' })
      expect(reads).toBe(0)
    }
    for (const field of ['address', 'ruleDigest'] as const) {
      let reads = 0
      const hostile = { ...onchain }
      Object.defineProperty(hostile, field, { get: () => { reads += 1; return onchain[field] }, enumerable: true })
      expect(verifyInvite(invite, hostile)).toEqual({ ok: false, reason: 'invalid_input' })
      expect(reads).toBe(0)
    }
  })

  it('classifies accessor-backed rules as invalid_rules without invoking the getter', async () => {
    const { invite, onchain } = await fixture()
    let reads = 0
    const hostileRules = { ...invite.rules }
    Object.defineProperty(hostileRules, 'title', { get: () => { reads += 1; return invite.rules.title }, enumerable: true })
    expect(verifyInvite({ ...invite, rules: hostileRules }, onchain)).toEqual({ ok: false, reason: 'invalid_rules' })
    expect(reads).toBe(0)
  })

  it('accepts frozen ordinary data-descriptor invites and account views', async () => {
    const { invite, onchain } = await fixture()
    Object.freeze(invite.rules.schedule[0])
    Object.freeze(invite.rules.schedule)
    Object.freeze(invite.rules.members)
    Object.freeze(invite.rules)
    Object.freeze(invite)
    Object.freeze(onchain)
    expect(verifyInvite(invite, onchain)).toEqual({ ok: true })
  })

  it('rejects malformed input without throwing', () => {
    expect(verifyInvite(null, null)).toEqual({ ok: false, reason: 'invalid_input' })
    expect(verifyInvite({}, {})).toEqual({ ok: false, reason: 'invalid_input' })
  })
})
