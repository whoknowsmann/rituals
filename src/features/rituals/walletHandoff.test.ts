import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { walletDisplayName, walletHandoffNote, withWalletHandoff } from './walletHandoff'

const progress = { title: 'Approve in your wallet', body: 'Check the details.', tone: 'progress' as const }

describe('B3: wallet handoff copy', () => {
  it('names the wallet the session will open', () => {
    expect(walletDisplayName('app.phantom')).toBe('Phantom')
    expect(walletDisplayName('com.solanamobile.wallet')).toBe('Seed Vault Wallet')
    expect(walletDisplayName(null)).toBe('your wallet')
    expect(walletDisplayName('com.unknown')).toBe('your wallet')
  })

  it('warns before the tap that the wallet opens and the user comes back', () => {
    const note = walletHandoffNote('app.phantom')
    expect(note).toContain('opens Phantom')
    expect(note).toMatch(/come back/i)
  })

  it('replaces the awaiting-wallet copy with an explicit "Opening <wallet>" handoff', () => {
    const copy = withWalletHandoff(progress, 'awaiting-wallet', 'app.phantom')
    expect(copy.title).toBe('Opening Phantom…')
    expect(copy.body).toMatch(/come back to Rituals/i)
    expect(copy.body).toMatch(/swipe Rituals away/i)
    expect(copy.body).toMatch(/notifications/i)
    expect(copy.tone).toBe('progress')
  })

  it('leaves every other state untouched', () => {
    for (const status of ['idle', 'preparing', 'submitted', 'confirming', 'confirmed', 'error']) {
      expect(withWalletHandoff(progress, status, 'app.phantom')).toBe(progress)
    }
  })
})

describe('B3: every wallet-signing screen shows the handoff', () => {
  for (const file of ['RitualFundingLobbyScreen.tsx', 'RitualActionScreen.tsx', 'ClaimCompletionScreen.tsx', 'ConfirmationInboxScreen.tsx']) {
    it(file, () => {
      const source = readFileSync(resolve(__dirname, '../../screens', file), 'utf8')
      expect(source).toContain('withWalletHandoff(')
      expect(source).toContain('walletHandoffNote(')
    })
  }
})
