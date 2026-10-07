import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'useChainTime.ts'), 'utf8')

// Every return from the wallet used to blank the clock, which swapped the
// whole ritual screen for "Checking the week clock…" and replayed the stamp.
describe('useChainTime across a pause', () => {
  it('keeps the last reading through an AppState change and re-reads on return', () => {
    expect(source).not.toContain('setNow(null)')
    expect(source).toMatch(/addEventListener\('change', \(state\) => \{\n\s+generation\+\+\n\s+if \(state !== 'active'\) return\n\s+setNow\(estimate\(\)\)\n\s+void sync\(\)/)
  })
  it('bounds the kept reading by both clocks and never reads while away or unfocused', () => {
    expect(source).toContain('estimatedChainTime(kept.current?.sample ?? null, performance.now(), Date.now())')
    expect(source).toContain("if (!focused || AppState.currentState !== 'active') return")
    expect(source).toContain('if (alive && focused) setNow(estimate())')
  })
  it('re-reads after a read that was in flight when the app paused', () => {
    expect(source).toContain('if (reading) { again = true; return }')
    expect(source).toContain('if (again && alive) { again = false; void sync() }')
  })
})
