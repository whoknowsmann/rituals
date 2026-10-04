import { describe, expect, it } from 'vitest'
import { stateWhileReloading } from './authoritativeRituals'

describe('stateWhileReloading', () => {
  const ready = { status: 'ready' as const }
  const loading = { status: 'loading' as const }
  it('keeps the last good read when re-reading the same ritual (no remount, no double celebration)', () => {
    expect(stateWhileReloading<{ status: string }>(ready, true, loading)).toBe(ready)
  })
  it('shows loading for a different ritual or when nothing was read yet', () => {
    expect(stateWhileReloading<{ status: string }>(ready, false, loading)).toBe(loading)
    expect(stateWhileReloading<{ status: string }>({ status: 'error' }, true, loading)).toBe(loading)
  })
})
