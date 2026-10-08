import type { PublicKey } from '@solana/web3.js'
import { RitualRpcError, RitualsRpcReader, type ReadOptions, type RitualBundleRead, type RitualRpcResponse, type RitualRpcTransport } from './ritualsRpc'

type Request = {
  keys: PublicKey[]
  config: Parameters<RitualRpcTransport['getMultipleAccountsInfoAndContext']>[1]
  resolve: (response: RitualRpcResponse) => void
  reject: (error: unknown) => void
}

/**
 * Coalesce one bulk load's read waves, not signing/confirmation traffic.
 * Each reader request stays in ONE snapshot, even at a chunk boundary; shared
 * config keys are deduplicated and the strictest minimum slot is retained.
 * The underlying application transport already supplies bounded read retries.
 */
export function batchRitualReads(transport: RitualRpcTransport): RitualRpcTransport {
  const pending: Request[] = []
  let draining = false

  const drain = async () => {
    while (pending.length > 0) {
      const batch: Request[] = []
      const keys = new Map<string, PublicKey>()
      while (pending.length > 0) {
        const request = pending[0]
        const additions = new Map(request.keys.filter((key) => !keys.has(key.toBase58())).map((key) => [key.toBase58(), key]))
        if (keys.size + additions.size > 100) break
        pending.shift()
        batch.push(request)
        for (const [id, key] of additions) keys.set(id, key)
      }
      const addresses = [...keys.values()]
      const positions = new Map([...keys.keys()].map((id, index) => [id, index]))
      const slots = batch.flatMap((request) => request.config.minContextSlot === undefined ? [] : [request.config.minContextSlot])
      try {
        const response = await transport.getMultipleAccountsInfoAndContext(addresses, {
          commitment: 'confirmed', ...(slots.length ? { minContextSlot: Math.max(...slots) } : {}),
        })
        if (!Array.isArray(response.value) || response.value.length !== addresses.length) throw new RitualRpcError('rpc', 'Rituals RPC returned an unexpected account count')
        for (let i = 0; i < response.value.length; i += 1) if (!Object.hasOwn(response.value, i)) throw new RitualRpcError('rpc', 'Rituals RPC account value is missing')
        for (const request of batch) request.resolve({ context: response.context, value: request.keys.map((key) => response.value[positions.get(key.toBase58())!]) })
      } catch (error) {
        for (const request of batch) request.reject(error)
      }
    }
    draining = false
  }

  return {
    getMultipleAccountsInfoAndContext: (keys, config) => new Promise((resolve, reject) => {
      // Full bundle reads have at most nine keys. Never split an oversized request.
      if (keys.length === 0 || keys.length > 100) { reject(new RitualRpcError('input', 'Batch request must contain 1..100 keys')); return }
      pending.push({ keys, config, resolve, reject })
      if (!draining) {
        draining = true
        void Promise.resolve().then(drain)
      }
    }),
  }
}

/** Reuse every existing decoder, lifecycle retry and canonical/bitmap check. */
export async function readRitualBundlesBatched(transport: RitualRpcTransport, programId: PublicKey, addresses: readonly PublicKey[], options?: ReadOptions): Promise<readonly PromiseSettledResult<RitualBundleRead>[]> {
  const reader = new RitualsRpcReader(batchRitualReads(transport), programId)
  return Promise.allSettled(addresses.map((address) => reader.getRitualBundle(address, options)))
}
