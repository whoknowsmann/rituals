import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'SoloReceiptScreen.tsx'), 'utf8')

describe('SoloReceiptScreen proof note', () => {
  it('lets the SKIPPED stamp speak without the repeated narration', () => {
    expect(source).toContain('<Stamp kind="skipped" note="Your stake comes back." animate={false} />')
    expect(source).not.toContain('This week was declared skipped before it opened.')
  })
  it('uses one amount line per outcome beside the stamp, without duplicate headings or rows', () => {
    expect(source).toContain('{formatAtomic(receipt.amount, decimals)} back to you')
    expect(source).toContain('{formatAtomic(receipt.amount, decimals)} went to {receipt.destinationLabel}.')
    expect(source).toContain('useSoloDestinationOwner(')
    for (const removed of ['Your stake is', 'This week was missed', 'Missed stake', '<Row']) expect(source).not.toContain(removed)
  })
  it('returns to the ritual, not Home', () => {
    expect(source).toContain('tone="link" label="Back to ritual" onPress={() => navigation.goBack()}')
    expect(source).not.toContain('Back to rituals')
  })
  it('reads the ritual notes and shows a kept-week note label', () => {
    expect(source).toContain('readSoloNotes(')
    expect(source).toContain('YOUR NOTE')
    expect(source).toContain('receiptNote')
    expect(source).toContain('fonts.hand')
  })
})
