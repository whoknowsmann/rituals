import { describe, expect, it } from 'vitest'
import { SeasonReadError } from './readSeason'
import { seasonStatusForError } from './seasonState'

describe('seasonStatusForError', () => {
  it('keeps a missing Season account as an honest empty state', () => {
    expect(seasonStatusForError(new SeasonReadError('Season account was not found'))).toBe('not-found')
  })

  it('keeps failed reads separate from an empty Season state', () => {
    expect(seasonStatusForError(new SeasonReadError('Season account could not be read'))).toBe('error')
    expect(seasonStatusForError(new Error('RPC unavailable'))).toBe('error')
  })
})
