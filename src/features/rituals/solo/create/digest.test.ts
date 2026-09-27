import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { digestRulesSync, type LockedRitualRules } from '../../../../domain/rituals/draft'
import { soloRuleDigest } from './digest'

const key = (byte: number) => new PublicKey(new Uint8Array(32).fill(byte)).toBase58() as LockedRitualRules['members'][number]
const rules: LockedRitualRules = {
  schemaVersion: 1,
  cluster: 'devnet',
  title: 'Weekly run',
  requirement: 'Go for a run and check in.',
  schedule: [{ eventIndex: 0, claimOpensAt: 100, claimDeadlineAt: 200, resolutionDeadlineAt: 300 }],
  members: [key(1), key(2)],
  memberTotalStake: 10n,
  stakeMint: key(3),
  tokenDecimals: 6,
  confirmationMode: 'ONE_FRIEND',
  additionalConfirmationThreshold: 1,
  activationFee: 2n,
  feePayerMode: 'HOST',
}

describe('solo create rule digest', () => {
  it('matches the group digest algorithm for identical rule fields', () => {
    expect(soloRuleDigest(rules)).toBe(digestRulesSync(rules))
  })

  it('also accepts the one-member solo rule set', () => {
    const solo = { ...rules, members: [key(1)], confirmationMode: 'HONOR' as const, additionalConfirmationThreshold: 0 }
    expect(soloRuleDigest(solo)).toMatch(/^[0-9a-f]{64}$/)
  })
})
