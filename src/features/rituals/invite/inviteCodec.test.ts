import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { digestRulesSync, type LockedRitualRules } from '../../../domain/rituals/draft'
import { createRitualInvite, decodeRitualInvite, encodeRitualInvite, onchainInviteView } from './inviteCodec'
import type { PublicKeyText } from '../../../domain/rituals/types'

const key = (byte: number) => new PublicKey(new Uint8Array(32).fill(byte)).toBase58() as PublicKeyText
const rules = (): LockedRitualRules => ({
  schemaVersion: 1, cluster: 'devnet', title: 'Morning ritual', requirement: 'Walk before work.',
  schedule: [{ eventIndex: 0, claimOpensAt: 100, claimDeadlineAt: 200, resolutionDeadlineAt: 300 }],
  members: [key(1), key(2)], memberTotalStake: 2_000_000n, stakeMint: key(3), tokenDecimals: 6,
  confirmationMode: 'ONE_FRIEND', additionalConfirmationThreshold: 1, activationFee: 500_000n, feePayerMode: 'HOST',
})

describe('inviteCodec', () => {
  it('creates a digest-bound invite and round-trips it through a deep-link payload', () => {
    const ritual = key(4)
    const invite = createRitualInvite(ritual, rules())
    expect(invite.ruleDigest).toBe(digestRulesSync(rules()))
    const decoded = decodeRitualInvite(encodeRitualInvite(invite))
    expect(decoded).toEqual(invite)
  })

  it('reconstructs the on-chain comparison view from an authoritative ritual read', () => {
    const invite = createRitualInvite(key(4), rules())
    const view = onchainInviteView({ address: new PublicKey(key(4)), account: { ruleDigest: invite.ruleDigest } } as never)
    expect(view).toEqual({ address: key(4), cluster: 'devnet', ruleDigest: invite.ruleDigest })
  })

  it('rejects malformed, wrong-prefix, and tampered payloads', () => {
    const invite = createRitualInvite(key(4), rules())
    const encoded = encodeRitualInvite(invite)
    expect(() => decodeRitualInvite('not-an-invite')).toThrow()
    expect(() => decodeRitualInvite(encoded.replace(/.$/, 'x'))).toThrow()
    expect(() => decodeRitualInvite(encoded.replace('rituals://join?invite=', 'https://evil/?invite='))).toThrow()
  })
})
