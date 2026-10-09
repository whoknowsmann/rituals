import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// RN/Expo modules are not executable in Vitest's Node environment. These source
// guards pin the render boundary; the data/action paths have separate hook tests.
const screen = (name: string) => readFileSync(`${__dirname}/${name}.tsx`, 'utf8')
describe('wallet-local screen boundaries', () => {
  it('never uses the previous wallet balance on create, even before the read effect runs', () => {
    const create = screen('solo/SoloCreateScreen')
    // The former bigint survived A→B until B's RPC completed, blocking B on A's zero balance.
    expect(create).toContain('balanceRead?.wallet === walletAddress ? balanceRead.amount : null')
    expect(create).toContain('setBalanceRead({ wallet: selectedAccount.publicKey.toBase58(), amount: balance })')
  })
  it('invalidates the old create balance immediately when a faucet request may have landed', () => {
    const create = screen('solo/SoloCreateScreen')
    const callback = create.slice(create.indexOf('const onFaucetSent ='), create.indexOf('const faucet ='))
    expect(callback).toContain('setBalanceRead(null)')
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
  it('scopes phone reminders to the connected wallet from Home\'s own read, once the stored wallet has loaded', () => {
    const home = screen('RitualsHomeScreen')
    // Home is the stack root, so this also runs for a switch made in Settings or create, and on resume while Home is open.
    const effect = home.slice(home.indexOf('// Reminders act only for the connected wallet'), home.indexOf('const disclosure ='))
    expect(effect).toContain("if (homeState.status !== 'ready' || walletLoading) return")
    expect(effect).toContain('walletReminderPlan(homeState.rituals, walletKey ? new PublicKey(walletKey) : null,')
    expect(effect).toContain('applyWalletReminderPlan(plan, () => walletKeyRef.current === walletKey)')
    expect(effect).not.toContain('getRitualBundle')
  })
})
