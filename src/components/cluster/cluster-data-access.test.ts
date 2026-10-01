import { describe, expect, it } from 'vitest'
import { ClusterNetwork, defaultClusters } from './cluster-data-access'

describe('default clusters', () => {
  it('exposes only the supported devnet cluster', () => {
    expect(defaultClusters).toHaveLength(1)
    expect(defaultClusters[0].network).toBe(ClusterNetwork.Devnet)
    expect(defaultClusters[0].name).toBe('devnet')
  })
})
