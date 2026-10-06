import { describe, expect, it } from 'vitest'
import { shouldWarnDevnetMismatch, DEVNET_MISMATCH_BODY } from './devnetMismatch'
import { walletReportsNetworkMismatch } from '../../utils/walletNetwork'

const SEED_VAULT = 'com.solanamobile.wallet'

describe('evidence-only network mismatch', () => {
  it('requires an explicit non-empty chain list that excludes the requested chain', () => {
    expect(walletReportsNetworkMismatch(['solana:mainnet'])).toBe(true)
    expect(walletReportsNetworkMismatch(['solana:devnet', 'solana:mainnet'])).toBe(false)
    expect(walletReportsNetworkMismatch([])).toBe(false)
    expect(walletReportsNetworkMismatch(undefined)).toBe(false)
    expect(shouldWarnDevnetMismatch('error', 'network-mismatch', SEED_VAULT)).toBe(true)
    expect(shouldWarnDevnetMismatch('awaiting-wallet', 'network-mismatch', SEED_VAULT)).toBe(false)
    expect(DEVNET_MISMATCH_BODY).toMatch(/Nothing was sent.*Seed Vault Wallet.*Settings.*Devnet.*try again/)
  })
  it('never infers a mismatch from cancellation, timeout, or another failed step', () => {
    for (const category of ['wallet-rejected', 'submission', 'preparation', 'confirmation', 'blockhash-expired', undefined]) {
      expect(shouldWarnDevnetMismatch('error', category, SEED_VAULT)).toBe(false)
    }
  })
})
