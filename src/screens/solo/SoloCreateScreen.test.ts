import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'SoloCreateScreen.tsx'), 'utf8')

describe('SoloCreateScreen transaction and commitment wiring', () => {
  it('warns before the wallet handoff and replaces copy while the wallet is open', () => {
    expect(source).toContain('walletHandoffNote(')
    expect(source).toContain('withWalletHandoff(')
  })

  it('advances from a typed promise and shows step errors on every step, not only step 3', () => {
    expect(source).toContain('applyTypedIntention(')
    const errorLines = source.match(/stepErrors\.map\(/g) ?? []
    expect(errorLines.length).toBeGreaterThanOrEqual(3)
  })

  it('does not describe solo suggestions as friend-confirmed (the group shape label says "a friend confirms")', () => {
    expect(source).not.toContain('suggestion.shape}')
    expect(source).toContain('suggestion.draft.eventCount} weeks')
  })

  it('journals the one-approval solo create so a killed app can recover it', () => {
    expect(source).toContain('pendingActionStore: asyncStoragePendingActionStore')
  })

  it('uses the atomic solo create, fund, and activate preparation', () => {
    expect(source).toContain('prepareCreateSoloFundAndActivate')
  })

  it('shows the promise stamp only after confirmed readback and remembers the ritual', () => {
    expect(source).toContain('<Stamp kind="promise"')
    expect(source).toContain('rememberRitual(')
    expect(source).toContain("navigation.navigate('SoloRitual'")
  })
})
