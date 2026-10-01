import { describe, expect, it } from 'vitest'
import { witnessShareMessage } from './witnessShare'

describe('witness share message', () => {
  it('keeps the exact join instructions and ritual address format', () => {
    expect(witnessShareMessage('Call Mom', '9abc123')).toBe('Be my witness for "Call Mom" on Rituals. Open Rituals, tap Join with a link, and paste this:\n9abc123')
  })
})
