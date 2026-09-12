import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/navigators/AppNavigator.tsx', 'utf8')
const homeSource = readFileSync('src/navigators/HomeNavigator.tsx', 'utf8')

describe('active mobile route', () => {
  it('starts on RitualsHome and does not import archived UX', () => {
    expect(source).toContain('initialRouteName="RitualsHome"')
    expect(source).toContain('name="RitualsHome"')
    expect(source).not.toContain('Pre' + 'flight')
    expect(homeSource).toContain('RitualsHomeScreen')
    expect(homeSource).not.toContain('Pre' + 'flightScreen')
  })
})
