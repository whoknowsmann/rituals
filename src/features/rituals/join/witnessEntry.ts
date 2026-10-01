import { PublicKey } from '@solana/web3.js'

export const INVALID_JOIN_INPUT_MESSAGE = "That doesn't look like a Rituals invite. Ask your friend to send it again."

export const WITNESS_ENTRY_MESSAGES = Object.freeze({
  connect: 'Connect your wallet to confirm as their witness.',
  different: "This promise names a different witness. Check you're on the right account.",
})

export type WitnessRitualRead = Readonly<{
  address: PublicKey
  kind: 'Solo' | 'Group'
  creator: PublicKey
  witness: PublicKey | null
  currentEventIndex: number
}>

export type WitnessEntryDecision =
  | Readonly<{ kind: 'witness'; ritualId: string; eventIndex: number }>
  | Readonly<{ kind: 'creator'; ritualId: string }>
  | Readonly<{ kind: 'message'; message: string }>
  | Readonly<{ kind: 'not-ritual' }>

const BASE58_TOKEN = /[1-9A-HJ-NP-Za-km-z]{32,44}/g

/** Find the last token that is both base58-shaped and a valid Solana public key. */
export function extractLastValidPublicKey(input: string): PublicKey | null {
  if (typeof input !== 'string') return null
  const candidates = input.match(BASE58_TOKEN) ?? []
  let found: PublicKey | null = null
  for (const candidate of candidates) {
    try {
      found = new PublicKey(candidate)
    } catch {
      // A base58-shaped word is not necessarily a 32-byte public key.
    }
  }
  return found
}

export function decideWitnessEntry(ritual: WitnessRitualRead, wallet: PublicKey | null): WitnessEntryDecision {
  const ritualId = ritual.address.toBase58()
  if (ritual.kind !== 'Solo') return { kind: 'not-ritual' }
  if (ritual.creator.equals(wallet ?? PublicKey.default)) return { kind: 'creator', ritualId }
  if (ritual.witness === null) return { kind: 'not-ritual' }
  if (!Number.isInteger(ritual.currentEventIndex) || ritual.currentEventIndex < 0 || ritual.currentEventIndex > 15) return { kind: 'not-ritual' }
  if (wallet === null) return { kind: 'message', message: WITNESS_ENTRY_MESSAGES.connect }
  if (ritual.witness.equals(wallet)) return { kind: 'witness', ritualId, eventIndex: ritual.currentEventIndex }
  return { kind: 'message', message: WITNESS_ENTRY_MESSAGES.different }
}
