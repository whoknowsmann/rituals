import { describe, expect, it } from 'vitest'
import { parseTokenAmount } from '../create/decimal'
import { DEFAULT_STAKE_TOTAL } from '../solo/create/schedule'
import type { FaucetResult } from '../faucet/devnetFaucet'
import { homePrimaryAction } from './homeFaucet'

const emptyHome = { connected: true, hasActiveRituals: false, testBalance: 0n, faucetResult: null }
const sent = (confirmed: boolean): FaucetResult => ({ kind: 'sent', signature: 'test-signature', confirmed, explorer: null })

describe('Home faucet-first primary decision', () => {
  it.each(['0', '5', '10', '19.999999'])('offers the faucet to a connected, empty Home below the default stake: %s tSKR', (balance) => {
    expect(homePrimaryAction({ ...emptyHome, testBalance: parseTokenAmount(balance) })).toBe('faucet')
  })

  it('returns to Start one at the default total stake, not the faucet cutoff or per-week stake', () => {
    const defaultTotal = parseTokenAmount(DEFAULT_STAKE_TOTAL)
    expect(homePrimaryAction({ ...emptyHome, testBalance: defaultTotal - 1n })).toBe('faucet')
    expect(homePrimaryAction({ ...emptyHome, testBalance: defaultTotal })).toBe('start')
    expect(homePrimaryAction({ ...emptyHome, testBalance: parseTokenAmount('50') })).toBe('start')
  })

  it.each([true, false])('returns to Start after a send even while balance readback catches up (confirmed=%s)', (confirmed) => {
    expect(homePrimaryAction({ ...emptyHome, faucetResult: sent(confirmed) })).toBe('start')
    expect(homePrimaryAction({ ...emptyHome, faucetResult: sent(confirmed), testBalance: null })).toBe('start')
    expect(homePrimaryAction({ ...emptyHome, faucetResult: sent(confirmed), testBalance: parseTokenAmount('50') })).toBe('start')
  })

  it('fails open on a pending/failed balance read', () => {
    expect(homePrimaryAction({ ...emptyHome, testBalance: null })).toBe('start')
  })

  it('leaves disconnected Home and Home with active rituals unchanged', () => {
    expect(homePrimaryAction({ ...emptyHome, connected: false })).toBe('start')
    expect(homePrimaryAction({ ...emptyHome, hasActiveRituals: true })).toBe('start')
  })

  it.each<FaucetResult>([
    { kind: 'empty', contact: null }, { kind: 'disabled' }, { kind: 'limited' }, { kind: 'unreachable' }, { kind: 'already-funded' },
  ])('keeps a retryable faucet primary after $kind; the view also offers Start one', (faucetResult) => {
    expect(homePrimaryAction({ ...emptyHome, faucetResult })).toBe('faucet')
    expect(homePrimaryAction({ ...emptyHome, faucetResult, testBalance: null })).toBe('start')
  })
})
