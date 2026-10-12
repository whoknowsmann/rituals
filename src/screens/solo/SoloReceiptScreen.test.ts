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
    expect(source).toContain('soloReceiptMoneyLine(state.bundle, destinationOwner)')
    expect(source).toContain('useSoloRitualBundle(client, route.params.ritualId, route.params.eventIndex)')
    expect(source.match(/\{moneyLine && <Text style=\{s\.muted\}>\{moneyLine\}<\/Text>\}/g)).toHaveLength(3)
    expect(source).not.toContain('formatAtomic(receipt.amount')
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

describe('on-chain proof (Jack, 2026-10-12)', () => {
  it('links every closed receipt to the week account on Solana Explorer (devnet), and never a pending one', () => {
    const source = readFileSync(resolve(__dirname, 'SoloReceiptScreen.tsx'), 'utf8')
    expect(source).toContain("receipt.state !== 'pending' && state.bundle.event && (")
    expect(source).toContain('label="View on Solana Explorer"')
    expect(source).toContain('https://explorer.solana.com/address/${address}?cluster=devnet')
    const ritual = readFileSync(resolve(__dirname, 'SoloRitualScreen.tsx'), 'utf8')
    expect(ritual).toMatch(/model\.state === 'completed' && readyBundle\.ritual\.address && <ActionButton tone="link" label="View on Solana Explorer"/)
  })
})
