import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'SeasonScreen.tsx'), 'utf8')

describe('SeasonScreen wiring', () => {
  it('reads the Season account and known rituals instead of inventing counts', () => {
    expect(source).toContain('readSeason(connection, address, client.client.programId)')
    expect(source).toContain('listKnownRituals()')
    expect(source).toContain('client.client.readRitual')
  })

  it('polls only while focused', () => {
    expect(source).toContain('useIsFocused')
    expect(source).toContain('setInterval(refresh, 15_000)')
    expect(source).toContain('if (!focused) return')
  })

  it('keeps the join route tied to this Season address', () => {
    expect(source).toContain("navigation.navigate('SoloCreate', { seasonAddress: address.toBase58() })")
    expect(source).toContain('SeasonCard')
  })

  it('hides Join once the Season has started instead of sending the user into a create that fails', () => {
    expect(source).toContain('model.joinOpen')
  })
})

