import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { canBundleFundAndActivate } from './fundActivationSelection'

const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const host = key(1)
const friend = key(2)
const account = (overrides: Record<string, unknown> = {}) => ({
  status: 'Funding' as const,
  members: [host, friend],
  fundedMembersBitmap: 1,
  fundedMemberCount: 1,
  schedule: [{ opens: 100n, deadline: 200n, resolution: 300n }],
  ...overrides,
})

describe('last-member fund plus activate selection', () => {
  it('selects the bundle only for the last unfunded member before the first window', () => {
    expect(canBundleFundAndActivate(account(), friend, 99)).toBe(true)
  })

  it.each([
    ['not the last member', host, 99, {}],
    ['window already open', friend, 100, {}],
    ['ritual is no longer funding', friend, 99, { status: 'Active' }],
    ['funding count disagrees with bitmap', friend, 99, { fundedMemberCount: 0 }],
    ['bitmap contains an unknown member', friend, 99, { fundedMembersBitmap: 5 }],
  ])('uses standalone funding when %s', (_label, member, now, overrides) => {
    expect(canBundleFundAndActivate(account(overrides), member, now)).toBe(false)
  })
})
