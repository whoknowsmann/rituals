import { PublicKey } from '@solana/web3.js'
import type { DevnetCluster } from '../../domain/rituals/types'

export const RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID = '8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB' as const
export const LOCAL_PLACEHOLDER_PROGRAM_ID = new PublicKey(RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID)
export type RitualsSupportedCluster = DevnetCluster
export const RITUALS_CURRENT_CONFIG = { cluster: 'devnet', programId: null, deployment: 'not-deployed' } as const
export function assertSupportedRitualsProgram(cluster: RitualsSupportedCluster, programId: PublicKey): void {
  if (cluster !== 'devnet') throw new Error(`Unsupported Rituals cluster: ${String(cluster)}`)
  if (!(programId instanceof PublicKey)) throw new Error('Rituals programId must be a PublicKey')
  throw new Error(`No authorized Rituals devnet deployment exists; ${programId.toBase58() === RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID ? 'local placeholder' : 'program mismatch'} is rejected`)
}
