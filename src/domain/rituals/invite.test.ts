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

  it('rejects malformed input without throwing', () => {
    expect(verifyInvite(null, null)).toEqual({ ok: false, reason: 'invalid_input' })
    expect(verifyInvite({}, {})).toEqual({ ok: false, reason: 'invalid_input' })
  })
})
