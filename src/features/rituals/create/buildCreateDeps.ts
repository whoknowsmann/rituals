/**
 * Binds the Create state machine to a real RitualClient.
 *
 * Pure and framework-free so the whole Create journey stays testable without a
 * renderer, a wallet, or a deployed program. React only supplies the client.
 *
 * The machine deliberately speaks in small display-only refs rather than live
 * client objects. The real PreparedRitualAction and submission handle are held
 * in this closure, so opaque runtime handles never leak into UI state where a
 * reload or a serialization attempt could corrupt them.
 */

import { PublicKey } from '@solana/web3.js'
import type { RitualClient } from '../../../data/rituals/ritualClient'
import type { PreparedRitualAction } from '../../../data/rituals/ritualPreparedAction'
import type { SubmittedRitualActionHandle } from '../../../data/rituals/ritualSubmission'
import type { CreateRitualDeps } from './runCreateRitual'
import type { ValidatedRitualDraft } from './draftForm'
import { makePendingActionRecord, withPendingActionSignature, type PendingActionStore } from '../recovery/pendingAction'
import { createRitualInvite, encodeRitualInvite } from '../invite/inviteCodec'
import { generateRitualNonce } from '../../../domain/rituals/nonce'
import { generateRitualSchedule, type RitualCadence } from '../../../domain/rituals/schedule'
import { digestRulesSync, type LockedRitualRules } from '../../../domain/rituals/draft'
import { deriveGroupPool, quoteActivationFee } from '../../../domain/rituals/money'
import { RITUAL_FEE_CONFIG } from './draftForm'
import type { PublicKeyText } from '../../../domain/rituals/types'

export type CreateDepsParams = Readonly<{
  client: RitualClient
  creator: PublicKey
  /** Full roster including the creator, in canonical order. */
  members: readonly PublicKey[]
  draft: ValidatedRitualDraft
  cadence: RitualCadence
  /** Unix seconds for the first event. Callers pass it so schedules stay deterministic. */
  firstEventAt: number
  /** Optional durable recovery journal used around wallet handoff. */
  pendingActionStore?: PendingActionStore
  now?: () => number
}>

export class CreateDepsError extends Error {
  readonly submitted: boolean
  constructor(message: string, submitted = false) {
    super(message)
    this.name = 'CreateDepsError'
    this.submitted = submitted
  }
}

const fail = (message: string): never => {
  throw new CreateDepsError(message)
}

export function buildCreateRitualDeps(params: CreateDepsParams): CreateRitualDeps {
  const { client, creator, members, draft, cadence, firstEventAt, pendingActionStore, now = () => Date.now() } = params

  if (!(creator instanceof PublicKey)) fail('creator must be a PublicKey')
  if (!Array.isArray(members) || members.length !== draft.memberCount) {
    fail('member roster must match the drafted member count')
  }
  if (!members.every((member) => member instanceof PublicKey)) fail('every member must be a PublicKey')
  if (!members[0]?.equals(creator)) fail('the creator must be the first member')

  // Held across steps so opaque client objects never enter UI state.
  let prepared: PreparedRitualAction | null = null
  let handle: SubmittedRitualActionHandle | null = null
  let pendingRecord: ReturnType<typeof makePendingActionRecord> | null = null
  let lockedRules: LockedRitualRules | null = null

  return {
    async prepare() {
      // Authoritative source of the stake mint and fee recipient. Never trust
      // UI-supplied values for these: they decide where funds go.
      const config = await client.getProtocolConfig()
      if (config.account.paused) fail('the protocol is paused; creating is not currently allowed')

      const schedule = generateRitualSchedule({
        firstEventAt,
        eventCount: draft.eventCount,
        cadence,
      })

      // Must match what the chain will charge: the domain layer rejects a
      // funded ritual carrying a zero activation fee.
      const activationFee = quoteActivationFee(
        deriveGroupPool(draft.memberTotalStakeAtomic, draft.memberCount),
        RITUAL_FEE_CONFIG,
      )

      const rules: LockedRitualRules = {
        schemaVersion: 1,
        cluster: 'devnet',
        title: draft.title,
        requirement: draft.requirement,
        schedule,
        members: members.map((member) => member.toBase58() as PublicKeyText),
        memberTotalStake: draft.memberTotalStakeAtomic,
        stakeMint: config.account.allowedStakeMint.toBase58() as PublicKeyText,
        tokenDecimals: RITUAL_FEE_CONFIG.tokenDecimals,
        confirmationMode: draft.confirmationMode,
        additionalConfirmationThreshold: draft.additionalConfirmationThreshold,
        activationFee,
        feePayerMode: draft.feePayerMode,
      }

      // Digest binds every reviewed term; the chain stores it so the rules a
      // member agreed to cannot be swapped afterwards.
      const ruleDigest = digestRulesSync(rules)
      lockedRules = rules

      const action = await client.prepareCreate({
        programId: client.programId,
        creator,
        stakeMint: config.account.allowedStakeMint,
        feeRecipientToken: config.account.feeRecipient,
        ritual: {
          nonce: generateRitualNonce(),
          ruleDigest,
          members: [...members],
          memberTotalStake: draft.memberTotalStakeAtomic,
          schedule: schedule.map((entry) => ({
            opens: BigInt(entry.claimOpensAt),
            deadline: BigInt(entry.claimDeadlineAt),
            resolution: BigInt(entry.resolutionDeadlineAt),
          })),
          additionalConfirmationThreshold: draft.additionalConfirmationThreshold,
          feePayerMode: draft.feePayerMode,
        },
      } as never)

      prepared = action
      return {
        kind: 'create' as const,
        messageDigest: action.messageDigest,
        ritualAddress: action.ritualAddress,
      }
    },

    async submit() {
      const action = prepared
      // Explicit throw (not the fail() helper) so TypeScript narrows the type.
      if (action === null) throw new CreateDepsError('cannot submit before preparing')
      if (pendingActionStore) {
        pendingRecord = makePendingActionRecord(action, now())
        await pendingActionStore.upsert(pendingRecord)
      }
      try {
        handle = await client.submitPrepared(action)
      } catch (error) {
        throw error
      }
      if (pendingActionStore && pendingRecord) {
        try {
          pendingRecord = withPendingActionSignature(pendingRecord, handle.signature)
          await pendingActionStore.upsert(pendingRecord)
        } catch {
          throw new CreateDepsError('transaction submitted but recovery could not be saved', true)
        }
      }
      // Opaque handle stays in this closure; the machine only needs an id.
      return { id: action.messageDigest }
    },

    async confirm() {
      const submitted = handle
      if (submitted === null) throw new CreateDepsError('cannot confirm before submitting')
      const result = await client.confirmSubmitted(submitted)
      let invite: string | undefined
      const authoritativeRitual = result.confirmed?.bundle?.ritual
      if (lockedRules && authoritativeRitual) {
        const candidate = createRitualInvite(authoritativeRitual.address.toBase58(), lockedRules)
        if (candidate.ruleDigest !== authoritativeRitual.account.ruleDigest) throw new CreateDepsError('authoritative Create readback did not match the reviewed rules', true)
        invite = encodeRitualInvite(candidate)
      }
      if (pendingActionStore && pendingRecord) {
        try { await pendingActionStore.remove(pendingRecord) } catch { /* recovery can resolve it on the next launch */ }
      }
      return { signature: result.signature, messageDigest: result.messageDigest, ...(invite === undefined ? {} : { invite }) }
    },
  }
}
