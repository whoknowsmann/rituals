import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { mergeSoloNotesStorage, parseSoloNotesStorage, trimSoloWeekNote } from './soloNotes'

const address = new PublicKey(new Uint8Array(32).fill(9)).toBase58()

describe('solo notes storage parsing', () => {
  it('ignores corrupt roots and malformed ritual records', () => {
    expect(parseSoloNotesStorage('not json')).toEqual({})
    expect(parseSoloNotesStorage({ 'not-an-address': { proofMode: 'note', notes: {} } })).toEqual({})
    expect(parseSoloNotesStorage({ [address]: { proofMode: 'photo', notes: {} } })).toEqual({})
    expect(parseSoloNotesStorage({ [address]: { proofMode: 'note', notes: { '0': 'kept' }, extra: true } })).toEqual({
      [address]: { proofMode: 'note', notes: { '0': 'kept' } },
    })
  })

  it('merges proof mode and notes without retaining an empty week note', () => {
    const withMode = mergeSoloNotesStorage({}, address, { proofMode: 'note' })
    expect(withMode[address]).toEqual({ proofMode: 'note', notes: {} })
    const withNote = mergeSoloNotesStorage(withMode, address, { eventIndex: 2, text: '  A line  ' })
    expect(withNote[address]).toEqual({ proofMode: 'note', notes: { '2': 'A line' } })
    const withoutNote = mergeSoloNotesStorage(withNote, address, { eventIndex: 2, text: '   ' })
    expect(withoutNote[address]).toEqual({ proofMode: 'note', notes: {} })
  })

  it('trims notes to 280 characters', () => {
    expect(trimSoloWeekNote(`  ${'x'.repeat(300)}  `)).toHaveLength(280)
    expect(Array.from(trimSoloWeekNote('🙂'.repeat(300))).length).toBe(280)
  })
})
