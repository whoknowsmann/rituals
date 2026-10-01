import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'ReviewRitualScreen.tsx'), 'utf8')

describe('ReviewRitualScreen copy', () => {
  it('does not promise an edit flow or imply creation before the funding lobby', () => {
    expect(source).toContain('Nothing is created until the funding lobby.')
    expect(source).not.toContain('Go back to edit any term')
  })

  it('calls the invalid route action Start over', () => {
    expect(source).toContain('Start over')
  })
})
