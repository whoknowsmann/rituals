import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// d42 on the Seeker (2026-10-10): Home reloaded in a loop with a wallet connected (~500 RPC 429s in
// two minutes). Each mount refetched the stored authorization, which re-created the account objects,
// the wallet callbacks, the ritual client and Home's load. d43 device check: 0 loops, 0 429s.
describe('Home reload loop guards', () => {
  it('reads the stored wallet authorization once (later changes come through setQueryData)', () => {
    const source = readFileSync(resolve(__dirname, '../utils/useAuthorization.tsx'), 'utf8')
    expect(source).toMatch(/queryKey: \["wallet-authorization"\],[\s\S]{0,400}staleTime: Infinity/)
  })
  it('refreshes a Home that already shows rituals in place, and keeps them when a refresh fails', () => {
    const source = readFileSync(resolve(__dirname, 'RitualsHomeScreen.tsx'), 'utf8')
    expect(source).toContain("if (!quiet && !shownRef.current) { setHomeState(initialState); setOutcomes(new Map()) }")
    expect(source).toContain("generation === requestGeneration.current && !shownRef.current) setHomeState({ ...initialState, status: 'error'")
  })
})
