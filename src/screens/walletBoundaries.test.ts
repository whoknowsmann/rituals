import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// RN/Expo modules are not executable in Vitest's Node environment. These source
// guards pin the render boundary; the data/action paths have separate hook tests.
const screen = (name: string) => readFileSync(`${__dirname}/${name}.tsx`, 'utf8')
describe('wallet-local screen boundaries', () => {
  it('wires the behavior-tested wallet balance hook to Create and its faucet', () => {
    const create = screen('solo/SoloCreateScreen')
    expect(create).toContain('useCreateBalance(client, connection, selectedAccount?.publicKey ?? null)')
    expect(create).toContain('useDevnetFaucet(selectedAccount?.publicKey.toBase58() ?? null, onFaucetSent)')
  })
  it('remounts Settings lists and any open End early flow when the wallet changes', () => {
    expect(screen('SettingsScreen')).toContain('<WalletSettings key={selectedAccount?.publicKey.toBase58() ?? \'disconnected\'} />')
  })
  it('keeps detail notes, celebrations and receipts behind chain-backed wallet ownership', () => {
    const detail = screen('solo/SoloRitualScreen'); const receipt = screen('solo/SoloReceiptScreen')
    expect(detail).toContain('<WalletSoloRitual key={selectedAccount?.publicKey.toBase58() ?? \'disconnected\'} route={route} />')
    expect(detail).toContain('useReminders(ownsRitual ? {')
    expect(detail.indexOf('if (!ownsRitual) return')).toBeGreaterThan(0)
    expect(detail.indexOf('if (!ownsRitual) return')).toBeLessThan(detail.indexOf('const readyBundle = state.bundle'))
    expect(receipt).toContain('if (!selectedAccount || !state.bundle.ritual.account.creator.equals(selectedAccount.publicKey)) return')
    expect(receipt.indexOf('if (!selectedAccount ||')).toBeLessThan(receipt.indexOf('const receiptNote ='))
  })
  it('wires Home snapshots into the behavior-tested reminder hook', () => {
    const home = screen('RitualsHomeScreen')
    expect(home).toContain("useWalletReminders(homeState.status === 'ready' ? homeState.rituals : null,")
    expect(home).toContain('selectedAccount?.publicKey.toBase58() ?? null, walletLoading)')
  })
})
