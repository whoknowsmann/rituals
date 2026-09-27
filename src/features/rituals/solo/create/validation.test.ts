import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import {
  SOLO_CREATE_MESSAGES,
  destinationChoices,
  validatePersonDestination,
  validateSoloCreateStep,
  validateWitnessAddress,
} from './validation'

const creator = new PublicKey(new Uint8Array(32).fill(1))
const witness = new PublicKey(new Uint8Array(32).fill(2))
const other = new PublicKey(new Uint8Array(32).fill(3))

const base = {
  intention: 'Run three times a week',
  title: 'Weekly run',
  requirement: 'Go for a run and check in.',
  witnessMode: 'just-me' as const,
  witnessAddress: '',
  proofMode: 'none' as const,
  stakePerWeek: '5',
  destination: 'cause' as const,
  personAddress: '',
}

describe('solo create validation', () => {
  it('uses exact messages for the three step boundaries', () => {
    expect(validateSoloCreateStep(1, { ...base, title: '', requirement: '' })).toEqual([
      SOLO_CREATE_MESSAGES.titleRequired,
      SOLO_CREATE_MESSAGES.requirementRequired,
    ])
    expect(validateSoloCreateStep(2, { ...base, witnessMode: 'one-witness', witnessAddress: '' })).toEqual([
      SOLO_CREATE_MESSAGES.witnessRequired,
    ])
    expect(validateSoloCreateStep(3, { ...base, destination: 'person', personAddress: '', stakePerWeek: '0' })).toEqual([
      SOLO_CREATE_MESSAGES.stakeRequired,
      SOLO_CREATE_MESSAGES.personRequired,
    ])
  })

  it('accepts Just me without asking for a witness', () => {
    expect(validateSoloCreateStep(2, base)).toEqual([])
  })

  it('rejects malformed, creator, and canonicality-invalid witness addresses', () => {
    expect(validateWitnessAddress('', creator)).toBe(SOLO_CREATE_MESSAGES.witnessRequired)
    expect(validateWitnessAddress('not-a-key', creator)).toBe(SOLO_CREATE_MESSAGES.witnessInvalid)
    expect(validateWitnessAddress(creator.toBase58(), creator)).toBe(SOLO_CREATE_MESSAGES.witnessCreator)
    expect(validateWitnessAddress(witness.toBase58(), creator)).toBeNull()
    expect(validateWitnessAddress(new PublicKey(new Uint8Array(32)).toBase58(), creator)).toBe(SOLO_CREATE_MESSAGES.witnessInvalid)
  })

  it('keeps a person destination distinct from both creator and witness', () => {
    expect(validatePersonDestination('', creator, witness)).toBe(SOLO_CREATE_MESSAGES.personRequired)
    expect(validatePersonDestination('not-a-key', creator, witness)).toBe(SOLO_CREATE_MESSAGES.personInvalid)
    expect(validatePersonDestination(creator.toBase58(), creator, witness)).toBe(SOLO_CREATE_MESSAGES.personCreator)
    expect(validatePersonDestination(witness.toBase58(), creator, witness)).toBe(SOLO_CREATE_MESSAGES.personWitness)
    expect(validatePersonDestination(other.toBase58(), creator, witness)).toBeNull()
  })

  it('lists the cause first and disables an unavailable cause honestly', () => {
    expect(destinationChoices({ label: 'Cause', tokenAccount: null })[0]).toEqual({
      kind: 'cause', label: 'Cause', detail: 'Available after setup', disabled: true,
    })
    expect(destinationChoices({ label: 'Cause', tokenAccount: other })[0].disabled).toBe(false)
    expect(destinationChoices({ label: 'Cause', tokenAccount: other })[1].kind).toBe('person')
  })
})
