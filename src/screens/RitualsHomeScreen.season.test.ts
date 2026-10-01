import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'RitualsHomeScreen.tsx'), 'utf8')

describe('RitualsHomeScreen Season states', () => {
  it('does not claim a live Season for missing or failed reads', () => {
    expect(source).toContain("aside={season ? 'LIVE NOW' : undefined}")
    expect(source).toContain('No Season running right now.')
    expect(source).toContain("Couldn't load the Season.")
  })

  it('offers a quiet retry for failed Season reads', () => {
    expect(source).toContain('label="Try again"')
    expect(source).toContain('onPress={onRetry}')
  })
})
