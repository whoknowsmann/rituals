import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'SoloRitualScreen.tsx'), 'utf8')

describe('SoloRitualScreen proof and witness controls', () => {
  it('loads and saves per-week notes around a confirmed claim', () => {
    expect(source).toContain('readSoloNotes(')
    expect(source).toContain('saveWeekNote(')
    expect(source).toContain('A line about this week (optional)')
    expect(source).toContain('maxLength={280}')
  })

  it('shows the saved note with the handwriting face after showing up', () => {
    expect(source).toContain('fontFamily: fonts.hand')
    expect(source).toContain('weekNote')
  })

  it('shares the exact witness handoff and offers copying the ritual address', () => {
    expect(source).toContain('Share.share({ message: witnessShareMessage(')
    expect(source).toContain('Send to your witness')
    expect(source).toContain('Clipboard.setStringAsync(shareAddress)')
    expect(source).toContain('readyBundle.ritual.account.creator.equals(selectedAccount.publicKey)')
  })
})
