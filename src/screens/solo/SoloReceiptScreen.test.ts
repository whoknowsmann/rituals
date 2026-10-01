import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'SoloReceiptScreen.tsx'), 'utf8')

describe('SoloReceiptScreen proof note', () => {
  it('reads the ritual notes and shows a kept-week note label', () => {
    expect(source).toContain('readSoloNotes(')
    expect(source).toContain('YOUR NOTE')
    expect(source).toContain('receiptNote')
    expect(source).toContain('fonts.hand')
  })
})
