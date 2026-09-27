import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'SoloCreateScreen.tsx'), 'utf8')

describe('SoloCreateScreen transaction and commitment wiring', () => {
  it('warns before the wallet handoff and replaces copy while the wallet is open', () => {
    expect(source).toContain('walletHandoffNote(')
    expect(source).toContain('withWalletHandoff(')
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
