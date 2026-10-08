import { describe, expect, it } from 'vitest'
import { createMachineInitialState, createMachineReducer, type CreateMachineState } from '../../create/createMachine'
import { showCreateBalanceHelp } from './balanceVisibility'

const prepared = { kind: 'create' as const, ritualAddress: 'ritual', messageDigest: 'digest' }
const idle = createMachineInitialState()
const preparing = createMachineReducer(idle, { type: 'PREPARE' })
const awaiting = createMachineReducer(preparing, { type: 'PREPARED', prepared })
const submitted = createMachineReducer(awaiting, { type: 'SUBMITTED', handle: { id: 'handle' } })
const confirming = createMachineReducer(submitted, { type: 'CONFIRMING' })
const confirmed = createMachineReducer(confirming, { type: 'CONFIRMED', result: { signature: 'signature', messageDigest: prepared.messageDigest } })
const uncertain = createMachineReducer(awaiting, { type: 'FAILED', category: 'confirmation', message: 'unknown' })
const recovered = createMachineReducer(uncertain, { type: 'READBACK_OBSERVED', ritualAddress: prepared.ritualAddress })

const hidden: readonly CreateMachineState[] = [preparing, awaiting, submitted, confirming, confirmed, recovered, uncertain]

describe('create balance-help visibility', () => {
  it.each(hidden)('hides balance, shortage and faucet controls while $status', (state) => {
    expect(showCreateBalanceHelp(state)).toBe(false)
  })

  it('keeps the lower post-create balance hidden through confirmation and navigation readback', () => {
    for (const state of [preparing, awaiting, submitted, confirming, confirmed, recovered]) {
      for (const balance of [null, 0n, 1n, 50_000_000n]) {
        const short = balance !== null && balance < 33_300_000n
        expect(showCreateBalanceHelp(state) && (balance === null || short)).toBe(false)
      }
    }
  })

  it('offers help only while idle or after a safe pre-submission failure or proven expiry', () => {
    const declined = createMachineReducer(awaiting, { type: 'FAILED', category: 'wallet-rejected', message: 'Nothing was sent.' })
    const preparationFailed = createMachineReducer(preparing, { type: 'FAILED', category: 'preparation', message: 'Nothing was sent.' })
    const expired = createMachineReducer(uncertain, { type: 'EXPIRY_OBSERVED', ritualAddress: prepared.ritualAddress })
    for (const state of [idle, declined, preparationFailed, expired]) expect(showCreateBalanceHelp(state)).toBe(true)
  })
})
