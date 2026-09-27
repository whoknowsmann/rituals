import { sha256 } from '@noble/hashes/sha256'
import { digestRulesSync, type LockedRitualRules } from '../../../../domain/rituals/draft'
import type { PublicKeyText, RuleDigest } from '../../../../domain/rituals/types'

type SoloDigestRules = Omit<LockedRitualRules, 'members'> & Readonly<{ members: readonly PublicKeyText[] }>

function canonicalValue(rules: SoloDigestRules): Record<string, unknown> {
  return {
    schemaVersion: rules.schemaVersion,
    cluster: rules.cluster,
    title: rules.title,
    requirement: rules.requirement,
    schedule: rules.schedule.map((entry) => ({ eventIndex: entry.eventIndex, claimOpensAt: entry.claimOpensAt, claimDeadlineAt: entry.claimDeadlineAt, resolutionDeadlineAt: entry.resolutionDeadlineAt })),
    members: [...rules.members],
    memberTotalStake: rules.memberTotalStake.toString(10),
    stakeMint: rules.stakeMint,
    tokenDecimals: rules.tokenDecimals,
    confirmationMode: rules.confirmationMode,
    additionalConfirmationThreshold: rules.additionalConfirmationThreshold,
    activationFee: rules.activationFee.toString(10),
    feePayerMode: rules.feePayerMode,
  }
}

/**
 * The digest bytes and canonical JSON are intentionally the same as the group
 * create path. The only extra allowance is one member, which the shared group
 * validator quite correctly rejects because groups need at least two members.
 */
export function soloRuleDigest(rules: SoloDigestRules): RuleDigest {
  if (rules.members.length >= 2) return digestRulesSync(rules as LockedRitualRules)
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalValue(rules)))
  return Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('') as RuleDigest
}
