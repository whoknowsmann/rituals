import { describe, expect, it, vi } from 'vitest'
import { ClusterNetwork } from '../../../components/cluster/cluster-data-access'
import { resolveRitualClientState } from './useRitualClient'

const client = Object.freeze({ readRitual: vi.fn() }) as never
const deployed = { deployment: 'deployed' as const, programId: {} }
const unavailable = { deployment: 'not-deployed' as const, programId: null }

describe('Ritual client readiness', () => {
  it('reports not-deployed on devnet without touching dependencies', () => {
    const create = vi.fn(() => client)
    const state = resolveRitualClientState(ClusterNetwork.Devnet, unavailable, create)
    expect(state).toEqual({ status: 'not-deployed', reason: 'No authorized Rituals deployment is configured' })
    expect(create).not.toHaveBeenCalled()
    expect(Object.isFrozen(state)).toBe(true)
  })
  it.each([ClusterNetwork.Testnet, ClusterNetwork.Mainnet, ClusterNetwork.Custom])('reports unsupported cluster before deployment', (cluster) => {
    const create = vi.fn(() => client)
    const state = resolveRitualClientState(cluster, deployed, create)
    expect(state.status).toBe('unsupported-cluster')
    expect(create).not.toHaveBeenCalled()
  })
  it('only creates a client for a configured devnet deployment', () => {
    const create = vi.fn(() => client)
    const state = resolveRitualClientState(ClusterNetwork.Devnet, deployed, create)
    expect(state).toEqual({ status: 'ready', client })
    expect(create).toHaveBeenCalledTimes(1)
    expect(Object.isFrozen(state)).toBe(true)
  })
  it('does not treat the local placeholder as a deployment', () => {
    const create = vi.fn(() => client)
    const state = resolveRitualClientState(ClusterNetwork.Devnet, { deployment: 'deployed', programId: '8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB' }, create)
    expect(state.status).toBe('not-deployed')
    expect(create).not.toHaveBeenCalled()
  })
  it('does not expose transaction or wallet operations while unavailable', () => {
    const state = resolveRitualClientState(ClusterNetwork.Devnet, unavailable, () => client)
    expect(state).not.toHaveProperty('client')
    expect(state).not.toHaveProperty('signAndSendTransaction')
    expect(state).not.toHaveProperty('transaction')
  })
})
