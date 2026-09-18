import { PublicKey } from '@solana/web3.js'
import type { DevnetCluster } from '../../domain/rituals/types'

/**
 * Canonical Rituals program identity.
 *
 * This matches `declare_id!` in programs/rituals/src/lib.rs and the deploy
 * keypair at target/deploy/rituals-keypair.json. The frozen IDL snapshot pins
 * the same address, and src/data/rituals/idl.test.ts asserts all three agree.
 */
export const RITUALS_PROGRAM_ID_BASE58 = '2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p' as const
export const RITUALS_PROGRAM_ID = new PublicKey(RITUALS_PROGRAM_ID_BASE58)

/**
 * Back-compat aliases. The identity is no longer a throwaway placeholder — it is
 * the address the program actually deploys to — but existing call sites and PDA
 * defaults still import these names.
 */
export const RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID = RITUALS_PROGRAM_ID_BASE58
export const LOCAL_PLACEHOLDER_PROGRAM_ID = RITUALS_PROGRAM_ID

export type RitualsSupportedCluster = DevnetCluster

/**
 * Current deployment configuration.
 *
 * `deployment` stays 'not-deployed' until the program is actually live on devnet
 * AND verified. The application facade fails closed while it is, so no RPC or
 * wallet work can happen against an unverified deployment.
 */
export const RITUALS_CURRENT_CONFIG = { cluster: 'devnet', programId: null, deployment: 'not-deployed' } as const

export function assertSupportedRitualsProgram(cluster: RitualsSupportedCluster, programId: PublicKey): void {
  if (cluster !== 'devnet') throw new Error(`Unsupported Rituals cluster: ${String(cluster)}`)
  if (!(programId instanceof PublicKey)) throw new Error('Rituals programId must be a PublicKey')
  // Fails closed: no authorized deployment is configured yet, so every program id
  // is rejected — including the canonical one.
  throw new Error(`No authorized Rituals devnet deployment exists; ${programId.toBase58() === RITUALS_PROGRAM_ID_BASE58 ? 'canonical program id' : 'program mismatch'} is rejected`)
}
