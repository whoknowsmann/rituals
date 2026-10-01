import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import {
  INVALID_JOIN_INPUT_MESSAGE,
  WITNESS_ENTRY_MESSAGES,
  decideWitnessEntry,
  extractLastValidPublicKey,
  type WitnessRitualRead,
} from './witnessEntry'

const key = (byte: number) => new PublicKey(new Uint8Array(32).fill(byte))
const ritual = key(8)
const creator = key(1)
const witness = key(2)
const shareMessage = `Be my witness for "Morning miles" on Rituals. Open Rituals, tap Join with a link, and paste this:\n${ritual.toBase58()}`

const soloRead = (overrides: Partial<WitnessRitualRead> = {}): WitnessRitualRead => ({
  address: ritual,
  kind: 'Solo',
  creator,
  witness,
  currentEventIndex: 3,
  ...overrides,
})

describe('witness entry parsing', () => {
  it('extracts the last valid Solana address from the exact creator share message', () => {
    expect(extractLastValidPublicKey(shareMessage)?.toBase58()).toBe(ritual.toBase58())
  })

  it('uses the last valid address when a message contains multiple candidates', () => {
    const first = key(3)
    expect(extractLastValidPublicKey(`${first.toBase58()} then ${shareMessage}`)?.toBase58()).toBe(ritual.toBase58())
  })

  it('ignores text that has no valid Solana address', () => {
    expect(extractLastValidPublicKey('Ask your friend to send the invite again.')).toBeNull()
  })
})

describe('witness entry routing', () => {
  it('routes the named witness to the current event confirmation screen', () => {
    expect(decideWitnessEntry(soloRead(), witness)).toEqual({
      kind: 'witness',
      ritualId: ritual.toBase58(),
      eventIndex: 3,
    })
  })

  it('explains that a wallet is needed when no account is connected', () => {
    expect(decideWitnessEntry(soloRead(), null)).toEqual({ kind: 'message', message: WITNESS_ENTRY_MESSAGES.connect })
  })

  it('rejects a connected account that is not the named witness', () => {
    expect(decideWitnessEntry(soloRead(), key(4))).toEqual({ kind: 'message', message: WITNESS_ENTRY_MESSAGES.different })
  })

  it('routes the creator to their solo ritual instead of witness confirmation', () => {
    expect(decideWitnessEntry(soloRead(), creator)).toEqual({ kind: 'creator', ritualId: ritual.toBase58() })
  })

  it('still routes the creator when the ritual has no current event to confirm', () => {
    expect(decideWitnessEntry(soloRead({ currentEventIndex: 16 }), creator)).toEqual({ kind: 'creator', ritualId: ritual.toBase58() })
  })

  it('routes the creator even when their solo ritual has no witness', () => {
    expect(decideWitnessEntry(soloRead({ witness: null }), creator)).toEqual({ kind: 'creator', ritualId: ritual.toBase58() })
  })

  it('rejects group, malformed, and witnessless reads as non-invites', () => {
    expect(decideWitnessEntry(soloRead({ kind: 'Group' }), witness)).toEqual({ kind: 'not-ritual' })
    expect(decideWitnessEntry(soloRead({ witness: null }), witness)).toEqual({ kind: 'not-ritual' })
    expect(decideWitnessEntry(soloRead({ currentEventIndex: 16 }), witness)).toEqual({ kind: 'not-ritual' })
    expect(INVALID_JOIN_INPUT_MESSAGE).toBe("That doesn't look like a Rituals invite. Ask your friend to send it again.")
  })
})
