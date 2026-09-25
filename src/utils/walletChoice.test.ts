import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  WALLET_OPTIONS,
  associationConfigFor,
  reusableAuthToken,
  walletNotFound,
  walletOptionById,
  walletOptionByPackage,
} from './walletChoice'

describe('wallet choice', () => {
  it('offers Seed Vault Wallet first, then Phantom, with real Android packages', () => {
    expect(WALLET_OPTIONS.map((w) => w.id)).toEqual(['seed-vault', 'phantom'])
    expect(walletOptionById('seed-vault')?.androidPackage).toBe('com.solanamobile.wallet')
    expect(walletOptionById('phantom')?.androidPackage).toBe('app.phantom')
    expect(Object.isFrozen(WALLET_OPTIONS)).toBe(true)
  })

  it('pins the association intent only for a known wallet', () => {
    expect(associationConfigFor('app.phantom')).toEqual({ walletPackage: 'app.phantom' })
    expect(associationConfigFor('com.solanamobile.wallet')).toEqual({ walletPackage: 'com.solanamobile.wallet' })
    expect(associationConfigFor(undefined)).toEqual({})
    expect(associationConfigFor('com.evil.wallet')).toEqual({})
    expect(walletOptionByPackage('')).toBeUndefined()
  })

  it('never hands one wallet the auth token another wallet issued', () => {
    const seedVault = { authToken: 'sv-token', walletPackage: 'com.solanamobile.wallet' }
    expect(reusableAuthToken(seedVault, 'com.solanamobile.wallet')).toBe('sv-token')
    expect(reusableAuthToken(seedVault, 'app.phantom')).toBeUndefined()
    // Pre-picker cache entries have no package; they belong to the implicit default only.
    expect(reusableAuthToken({ authToken: 'old' }, 'app.phantom')).toBeUndefined()
    expect(reusableAuthToken({ authToken: 'old' }, undefined)).toBe('old')
    expect(reusableAuthToken(null, 'app.phantom')).toBeUndefined()
  })

  it('recognises the native wallet-not-installed rejection', () => {
    expect(walletNotFound({ code: 'ERROR_WALLET_NOT_FOUND' })).toBe(true)
    expect(walletNotFound({ code: 4001 })).toBe(false)
    expect(walletNotFound(null)).toBe(false)
  })

  it('native patch script targets the startSession intent with setPackage', () => {
    const script = readFileSync('scripts/patch-mwa-wallet-package.mjs', 'utf8')
    expect(script).toContain('intent.setPackage(walletPackage)')
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts.postinstall).toContain('patch-mwa-wallet-package.mjs')
  })
})

describe('brand line', () => {
  it('keeps "Show up, or pay up." as the home tagline', () => {
    // Jack's call: the punchy line stays. It was once swapped for "Show up. Get it back." — don't.
    const home = readFileSync('src/screens/RitualsHomeScreen.tsx', 'utf8')
    expect(home).toContain('Show up, or pay up.')
    expect(home).not.toContain('Show up. Get it back.')
  })

  it('offers every wallet option at each connect point', () => {
    for (const file of ['src/components/wallet/ConnectWalletCard.tsx', 'src/screens/RitualRosterScreen.tsx']) {
      expect(readFileSync(file, 'utf8')).toContain('WalletChoiceButtons')
    }
    expect(readFileSync('src/components/top-bar/top-bar-ui.tsx', 'utf8')).toContain('WALLET_OPTIONS.map')
    // No bare connect() left anywhere: it would fall back to Android's default wallet.
    for (const file of ['src/components/wallet/ConnectWalletCard.tsx', 'src/screens/RitualRosterScreen.tsx', 'src/components/top-bar/top-bar-ui.tsx']) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/(?<!dis)connect\(\)/)
    }
  })
})
