import { expect } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeRitual } from './accounts'
import { accountVectors, envelope } from './__fixtures__/accountVectors'
import { deriveCreateRitualAccounts } from './instructionsLifecycle'
import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'

export const lifecycleProgramId = LOCAL_PLACEHOLDER_PROGRAM_ID
export const lifecycleSource = decodeRitual(envelope(accountVectors.ritual.hex), lifecycleProgramId)
export const lifecycleKey = (value: number) => new PublicKey(new Uint8Array(32).fill(value))

export const lifecycleAddresses = deriveCreateRitualAccounts(lifecycleProgramId, lifecycleSource.creator, lifecycleSource.nonce)

export function lifecycleContext(
  overrides: Partial<typeof lifecycleSource> = {},
): { address: PublicKey; account: typeof lifecycleSource } {
  const account = {
    ...lifecycleSource,
    status: 'Funding' as const,
    activatedAt: 0n,
    cancelledAt: 0n,
    completedAt: 0n,
    currentEventIndex: 0,
    settledEventCount: 0,
    fundedMembersBitmap: 0,
    fundedMemberCount: 0,
    fundedStakeTotal: 0n,
    fundedFeeTotal: 0n,
    ...overrides,
  }
  return { address: lifecycleAddresses.ritual, account }
}

export function fullyFundedContext(memberCount = lifecycleSource.members.length) {
  const members = memberSet(memberCount)
  return lifecycleContext({
    members,
    fundedMembersBitmap: (1 << memberCount) - 1,
    fundedMemberCount: memberCount,
    fundedStakeTotal: lifecycleSource.memberTotalStake * BigInt(memberCount),
    fundedFeeTotal: lifecycleSource.lockedActivationFee,
  })
}

export function memberSet(memberCount: number): PublicKey[] {
  if (memberCount <= lifecycleSource.members.length) return lifecycleSource.members.slice(0, memberCount)
  return [lifecycleSource.creator, ...Array.from({ length: memberCount - 1 }, (_, index) => lifecycleKey(61 + index))]
}

export function createInput(memberCount = lifecycleSource.members.length, nonce = 7n) {
  return {
    nonce,
    ruleDigest: '1f'.repeat(32) as never,
    members: memberSet(memberCount),
    memberTotalStake: memberCount === 0 ? 200n : 200n,
    schedule: lifecycleSource.schedule,
    additionalConfirmationThreshold: Math.min(2, memberCount - 1),
    feePayerMode: 'HOST' as const,
  }
}

export const validInitializeConfig = {
  allowedStakeMint: lifecycleSource.stakeMint,
  feeRecipient: lifecycleKey(24),
  feeBasisPoints: 250,
  minimumFee: 11n,
  maximumFee: 999n,
  maximumMemberStake: 1000n,
}

export const expectBuildError = (call: () => unknown) => {
  let caught: unknown
  try { call() } catch (error) { caught = error }
  if (caught === undefined) throw new Error('expected builder failure')
  const error = caught as Error
  expect(error).toMatchObject({ name: 'RitualInstructionBuildError' })
  expect(String(error.message)).not.toMatch(/TypeError|undefined|cannot read/i)
  return error
}
