import { SeasonReadError } from './readSeason'

export type SeasonLoadStatus = 'not-found' | 'error'

export function seasonStatusForError(error: unknown): SeasonLoadStatus {
  return error instanceof SeasonReadError && error.message === 'Season account was not found' ? 'not-found' : 'error'
}
