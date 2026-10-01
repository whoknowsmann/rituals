import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'JoinRitualScreen.tsx'), 'utf8')

describe('JoinRitualScreen witness entry wiring', () => {
  it('reads address text through the pure parser and routes each supported result', () => {
    expect(source).toContain('extractLastValidPublicKey')
    expect(source).toContain('decideWitnessEntry')
    expect(source).toContain("navigation.navigate('WitnessConfirm'")
    expect(source).toContain("navigation.navigate('SoloRitual'")
  })

  it('keeps witness addresses out of remembered rituals and explains the input', () => {
    expect(source).toContain('Paste the invite your friend sent, or the address your friend shared.')
    expect(source).toContain('await rememberRitual({ address: invite.ritual')
  })
})
