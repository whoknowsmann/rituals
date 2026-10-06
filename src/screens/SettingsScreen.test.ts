import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'SettingsScreen.tsx'), 'utf8')

describe('SettingsScreen', () => {
  it('puts test tokens first and leaves Settings to the navigation title', () => {
    expect(source.indexOf('accessibilityLabel="Test tokens"')).toBeLessThan(source.indexOf('accessibilityLabel="Network information"'))
    expect(source).not.toContain('<Hero>Settings</Hero>')
  })
  it('reuses the wallet chooser at the faucet instead of a disconnected dead end', () => {
    expect(source).toContain('<WalletChoiceButtons')
    expect(source).toContain('Set your wallet to Devnet.')
    expect(source).not.toContain('Connect a wallet first.')
  })
  it('shows devnet, the token disclosure, a shortened program id, and an explorer action', () => {
    expect(source).toContain('Network')
    expect(source).toContain('Devnet')
    expect(source).toContain('tSKR is a test token with no real value')
    expect(source).toContain('shortProgramId')
    expect(source).toContain('View on Explorer')
    expect(source).toContain('Linking.openURL')
  })

  it('does not retain the selectable cluster template', () => {
    expect(source).not.toContain('ClusterPickerFeature')
    expect(source).not.toContain('RadioButton')
  })
})
