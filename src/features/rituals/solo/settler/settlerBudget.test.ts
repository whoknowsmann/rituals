import { describe, expect, it } from 'vitest'
import { createSolNeededLamports, settlerBudgetLamports, settlerTopUpLamports } from './settlerBudget'

describe('settle-key top-up (2026-10-11)', () => {
  it('sends only the shortfall, nothing when the key already holds the budget, and the full budget when unread', () => {
    expect(settlerBudgetLamports(2)).toBe(5_000_000n)
    expect(settlerTopUpLamports(2, null)).toBe(5_000_000n)
    expect(settlerTopUpLamports(2, 5_000_000n)).toBe(0n)
    expect(settlerTopUpLamports(2, 37_000_000)).toBe(0n)
    expect(settlerTopUpLamports(6, 3_000_000n)).toBe(10_000_000n)
  })
  it('estimates the SOL a create needs: rent for three accounts, the fee and the top-up', () => {
    expect(createSolNeededLamports(6, 13_000_000n)).toBe(5_781_040n + 2n * 1_488_440n + 25_000n + 13_000_000n)
    expect(createSolNeededLamports(6, 0n)).toBe(8_782_920n)
  })
})
