import { PublicKey } from '@solana/web3.js'

export type SoloWitnessMode = 'just-me' | 'one-witness'
export type SoloProofMode = 'none' | 'note'
export type SoloDestination = 'cause' | 'person'

export type SoloCreateDraft = Readonly<{
  intention: string
  title: string
  requirement: string
  witnessMode: SoloWitnessMode
  witnessAddress: string
  proofMode: SoloProofMode
  stakePerWeek: string
  destination: SoloDestination
  personAddress: string
}>

export const SOLO_CREATE_MESSAGES = Object.freeze({
  titleRequired: 'Name what you are promising.',
  requirementRequired: 'Say what counts as showing up.',
  witnessRequired: 'Enter a witness wallet address.',
  witnessInvalid: 'That witness address is not valid.',
  witnessCreator: 'You cannot witness your own ritual.',
  stakeRequired: 'Stake must be greater than 0 TEST per week.',
  causeUnavailable: 'This cause is not available yet. Choose a person instead.',
  personRequired: 'Enter the person’s wallet address.',
  personInvalid: 'That destination address is not valid.',
  personCreator: 'Choose someone other than yourself.',
  personWitness: 'Choose someone other than the witness.',
} as const)

function canonicalPublicKey(value: string): PublicKey | null {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) return null
  try {
    const key = new PublicKey(value)
    if (key.equals(PublicKey.default) || key.toBase58() !== value) return null
    return key
  } catch {
    return null
  }
}

export function validateWitnessAddress(address: string, creator: PublicKey): string | null {
  if (address.length === 0) return SOLO_CREATE_MESSAGES.witnessRequired
  const key = canonicalPublicKey(address)
  if (!key) return SOLO_CREATE_MESSAGES.witnessInvalid
  if (key.equals(creator)) return SOLO_CREATE_MESSAGES.witnessCreator
  return null
}

export function validatePersonDestination(address: string, creator: PublicKey, witness: PublicKey | null): string | null {
  if (address.length === 0) return SOLO_CREATE_MESSAGES.personRequired
  const key = canonicalPublicKey(address)
  if (!key) return SOLO_CREATE_MESSAGES.personInvalid
  if (key.equals(creator)) return SOLO_CREATE_MESSAGES.personCreator
  if (witness && key.equals(witness)) return SOLO_CREATE_MESSAGES.personWitness
  return null
}

function validStake(value: string): boolean {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) return false
  return Number(value) > 0
}

export function validateSoloCreateStep(step: 1 | 2 | 3, draft: SoloCreateDraft, creator?: PublicKey): readonly string[] {
  const errors: string[] = []
  if (step === 1) {
    if (draft.title.trim().length === 0) errors.push(SOLO_CREATE_MESSAGES.titleRequired)
    if (draft.requirement.trim().length === 0) errors.push(SOLO_CREATE_MESSAGES.requirementRequired)
  }
  if (step === 2) {
    if (draft.witnessMode === 'one-witness') {
      const error = creator ? validateWitnessAddress(draft.witnessAddress, creator) : (draft.witnessAddress.length === 0 ? SOLO_CREATE_MESSAGES.witnessRequired : null)
      if (error) errors.push(error)
    }
  }
  if (step === 3) {
    if (!validStake(draft.stakePerWeek)) errors.push(SOLO_CREATE_MESSAGES.stakeRequired)
    if (draft.destination === 'cause') {
      // Availability is checked by the screen using the configured cause account.
      // The disabled cause row remains first even when setup has not happened.
    } else {
      const witness = creator && draft.witnessMode === 'one-witness' ? canonicalPublicKey(draft.witnessAddress) : null
      const error = creator ? validatePersonDestination(draft.personAddress, creator, witness) : (draft.personAddress.length === 0 ? SOLO_CREATE_MESSAGES.personRequired : null)
      if (error) errors.push(error)
    }
  }
  return Object.freeze(errors)
}

export type DestinationChoice = Readonly<{
  kind: SoloDestination
  label: string
  detail: string
  disabled: boolean
}>

export function destinationChoices(cause: Readonly<{ label: string; tokenAccount: PublicKey | null }>): readonly DestinationChoice[] {
  return Object.freeze([
    Object.freeze({
      kind: 'cause' as const,
      label: cause.label,
      detail: cause.tokenAccount ? 'Selected first' : 'Available after setup',
      disabled: cause.tokenAccount === null,
    }),
    Object.freeze({ kind: 'person' as const, label: 'A person you pick', detail: 'Choose someone you trust', disabled: false }),
  ])
}

export function publicKeyFromCanonical(value: string): PublicKey | null {
  return canonicalPublicKey(value)
}
