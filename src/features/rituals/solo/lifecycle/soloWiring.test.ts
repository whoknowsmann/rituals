import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const screen = (name: string) => readFileSync(resolve(__dirname, '../../../../screens/solo', name), 'utf8').split('\n').filter((line) => !line.startsWith('import ')).join('\n')
const lifecycle = readFileSync(resolve(__dirname, 'soloActionDeps.ts'), 'utf8')
const sharedDeps = readFileSync(resolve(__dirname, '../../buildRitualActionDeps.ts'), 'utf8')

describe('solo lifecycle screen wiring', () => {
  it('wires the check-in hold, stamp, wallet handoff, skip, and settle actions', () => {
    const source = screen('SoloRitualScreen.tsx')
    expect(source).toContain('HoldButton')
    expect(source).toContain('Stamp')
    expect(source).toContain('walletHandoffNote(')
    expect(source).toContain('withWalletHandoff(')
    expect(source).toContain("buildRitualActionDeps")
    expect(source).toContain('buildSoloSkipDeps')
    expect(source).toContain("makeSharedDeps('finalize')")
    expect(lifecycle).toContain('prepareDeclareSkip')
    expect(sharedDeps).toContain('prepareInitializeAndClaim')
    expect(sharedDeps).toContain('prepareClaim')
    expect(sharedDeps).toContain('prepareFinalize')
  })

  it('wires receipt and witness readback states', () => {
    expect(screen('SoloReceiptScreen.tsx')).toContain('soloReceiptModel')
    const witness = screen('WitnessConfirmScreen.tsx')
    expect(witness).toContain('witnessConfirmModel')
    expect(witness).toContain("kind: 'approve'")
    expect(witness).toContain('withWalletHandoff(')
    expect(witness).toContain('Stamp')
  })
})
