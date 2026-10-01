import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'SettingsScreen.tsx'), 'utf8')

describe('SettingsScreen', () => {
  it('shows devnet, the token disclosure, a shortened program id, and an explorer action', () => {
    expect(source).toContain('Network')
    expect(source).toContain('Devnet')
    expect(source).toContain('TEST tokens have no real value')
    expect(source).toContain('shortProgramId')
    expect(source).toContain('View on Explorer')
    expect(source).toContain('Linking.openURL')
  })

  it('does not retain the selectable cluster template', () => {
    expect(source).not.toContain('ClusterPickerFeature')
    expect(source).not.toContain('RadioButton')
  })
})
