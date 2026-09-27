import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import type { RitualClient } from '../../../../data/rituals/ritualClient'
import type { PreparedRitualAction } from '../../../../data/rituals/ritualPreparedAction'
import type { SubmittedRitualActionHandle } from '../../../../data/rituals/ritualSubmission'
import { deriveGroupPool, quoteActivationFee } from '../../../../domain/rituals/money'
import { generateRitualNonce } from '../../../../domain/rituals/nonce'
import { RITUAL_FEE_CONFIG } from '../../../rituals/create/draftForm'
import { CreateDepsError } from '../../../rituals/create/buildCreateDeps'
import type { CreateRitualDeps } from '../../../rituals/create/runCreateRitual'
import type { SoloScheduleSelection } from './schedule'
import { scheduleWindows } from './schedule'
import { soloRuleDigest } from './digest'
import { validatePersonDestination, publicKeyFromCanonical, type SoloDestination, type SoloWitnessMode } from './validation'
import type { PublicKeyText } from '../../../../domain/rituals/types'

export type SoloCreateDepsParams = Readonly<{
  client: RitualClient
  creator: PublicKey
  title: string
  requirement: string
  eventCount: number
  stakePerWeekAtomic: bigint
  schedule: SoloScheduleSelection
  witnessMode: SoloWitnessMode
  witnessAddress?: string
  destination: SoloDestination
  causeTokenAccount?: PublicKey | null
  personAddress?: string
  seasonAddress?: PublicKey | null
  /** Used to reject a wallet account switch while Phantom is open. */
  authorizedActor?: () => PublicKey | null
  getBlockHeight?: () => Promise<number>
}>

function fail(message: string): never {
  throw new CreateDepsError(message)
}

function assertPublicKey(value: PublicKey | null, name: string): PublicKey {
  if (!(value instanceof PublicKey) || value.equals(PublicKey.default)) fail(`${name} is not available`)
  return value
}

/**
 * Binds the one-approval solo bundle to the existing Create state machine.
 * Proof notes stay client-side for now; they intentionally never enter the
 * on-chain rules or custody path.
 */
export function buildSoloCreateDeps(params: SoloCreateDepsParams): CreateRitualDeps {
  const {
    client,
    creator,
    title,
    requirement,
    eventCount,
    stakePerWeekAtomic,
    schedule,
    witnessMode,
    witnessAddress,
    destination,
    causeTokenAccount,
    personAddress,
    seasonAddress,
    authorizedActor,
    getBlockHeight,
  } = params
  if (!(creator instanceof PublicKey)) fail('creator is not available')
  if (schedule.schedule.length !== eventCount) fail('Season schedule does not match this ritual.')

  const witness = witnessMode === 'one-witness'
    ? assertPublicKey(publicKeyFromCanonical(witnessAddress ?? ''), 'witness')
    : null
  if (witness?.equals(creator)) fail('You cannot witness your own ritual.')

  let prepared: PreparedRitualAction | null = null
  let handle: SubmittedRitualActionHandle | null = null

  const assertAuthorized = () => {
    if (authorizedActor) {
      const actor = authorizedActor()
      if (!actor || !actor.equals(creator)) fail('the authorized wallet account changed before signing')
    }
  }

  return {
    async prepare() {
      assertAuthorized()
      const config = await client.getProtocolConfig()
      if (config.account.paused) fail('Rituals are paused')

      const person = destination === 'person' ? publicKeyFromCanonical(personAddress ?? '') : null
      if (destination === 'person') {
        const error = validatePersonDestination(personAddress ?? '', creator, witness)
        if (error) fail(error)
        if (!person) fail('the person destination is not available')
      }
      const forfeitDestination = destination === 'cause'
        ? assertPublicKey(causeTokenAccount ?? null, 'the selected cause')
        : getAssociatedTokenAddressSync(
          config.account.allowedStakeMint,
          assertPublicKey(person, 'the person destination'),
        )

      const memberTotalStake = stakePerWeekAtomic * BigInt(eventCount)
      if (memberTotalStake <= 0n) fail('stake must be greater than zero')
      const activationFee = quoteActivationFee(deriveGroupPool(memberTotalStake, 1), RITUAL_FEE_CONFIG)
      const members = [creator.toBase58() as PublicKeyText]
      const rules = {
        schemaVersion: 1 as const,
        cluster: 'devnet' as const,
        title,
        requirement,
        schedule: schedule.schedule,
        members,
        memberTotalStake,
        stakeMint: config.account.allowedStakeMint.toBase58() as PublicKeyText,
        tokenDecimals: RITUAL_FEE_CONFIG.tokenDecimals,
        confirmationMode: witness ? 'ONE_FRIEND' as const : 'HONOR' as const,
        additionalConfirmationThreshold: witness ? 1 : 0,
        activationFee,
        feePayerMode: 'HOST' as const,
      }
      const ruleDigest = soloRuleDigest(rules)
      const nonce = generateRitualNonce()
      const action = await client.prepareCreateSoloFundAndActivate({
        programId: client.programId,
        creator,
        stakeMint: config.account.allowedStakeMint,
        feeRecipientToken: config.account.feeRecipient,
        forfeitDestination,
        season: seasonAddress ?? null,
        memberSource: getAssociatedTokenAddressSync(config.account.allowedStakeMint, creator),
        lockedActivationFee: activationFee,
        ritual: {
          nonce,
          ruleDigest,
          memberTotalStake,
          schedule: scheduleWindows(schedule),
          witness,
        },
      })
      prepared = action
      return { kind: 'create' as const, messageDigest: action.messageDigest, ritualAddress: action.ritualAddress }
    },

    async submit() {
      if (!prepared) throw new CreateDepsError('cannot submit before preparing')
      assertAuthorized()
      if (getBlockHeight) {
        const current = await getBlockHeight()
        if (Number.isSafeInteger(current) && current > prepared.lastValidBlockHeight) {
          throw Object.assign(new CreateDepsError('prepared transaction expired before signing'), { blockhashExpired: true })
        }
      }
      handle = await client.submitPrepared(prepared)
      return { id: prepared.messageDigest }
    },

    async confirm() {
      if (!handle) throw new CreateDepsError('cannot confirm before submitting')
      const result = await client.confirmSubmitted(handle)
      return { signature: result.signature, messageDigest: result.messageDigest }
    },
  }
}
