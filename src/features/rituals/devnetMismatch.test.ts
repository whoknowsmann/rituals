import { describe, expect, it } from 'vitest'
import { shouldWarnDevnetMismatch } from './devnetMismatch'

const SEED_VAULT = 'com.solanamobile.wallet'
const PHANTOM = 'app.phantom'

describe('shouldWarnDevnetMismatch', () => {
  it('warns after a failed wallet step with Seed Vault Wallet, whatever the wallet called it', () => {
    expect(shouldWarnDevnetMismatch('error', 'wallet-rejected', SEED_VAULT)).toBe(true)
    expect(shouldWarnDevnetMismatch('error', 'submission', SEED_VAULT)).toBe(true)
    expect(shouldWarnDevnetMismatch('error', undefined, SEED_VAULT)).toBe(true)
  })
  it('stays quiet for Phantom, for non-error states, and for failures before the wallet opened', () => {
    expect(shouldWarnDevnetMismatch('error', 'wallet-rejected', PHANTOM)).toBe(false)
    expect(shouldWarnDevnetMismatch('awaiting-wallet', null, SEED_VAULT)).toBe(false)
    expect(shouldWarnDevnetMismatch('error', 'preparation', SEED_VAULT)).toBe(false)
    expect(shouldWarnDevnetMismatch('error', 'confirmation', SEED_VAULT)).toBe(false)
  })
})
