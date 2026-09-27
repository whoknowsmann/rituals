import { PublicKey } from '@solana/web3.js'
import type { DevnetCluster } from '../../domain/rituals/types'

/**
 * Canonical Rituals program identity.
 *
 * Matches `declare_id!` in programs/rituals/src/lib.rs, the deploy keypair, and
 * the frozen IDL snapshot. src/data/rituals/idl.test.ts asserts they agree.
 */
export const RITUALS_PROGRAM_ID_BASE58 = '2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p' as const
export const RITUALS_PROGRAM_ID = new PublicKey(RITUALS_PROGRAM_ID_BASE58)

/** Back-compat aliases; existing call sites and PDA defaults still import these. */
export const RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID = RITUALS_PROGRAM_ID_BASE58
export const LOCAL_PLACEHOLDER_PROGRAM_ID = RITUALS_PROGRAM_ID

export type RitualsSupportedCluster = DevnetCluster

/**
 * Authorized devnet deployment.
 *
 * First deployed 2026-09-18 (slot 500137332). Upgraded 2026-09-27 to the solo +
 * Seasons build (slot 504946601, upgrade tx 3sgj1H6m…). Upgrade authority
 * ETQ9czekQJSebxkWn986Hao15FfEbe1345cZZDrHhXbx. See docs/STATUS.md.
 *
 * Devnet only with valueless SPL test assets. Mainnet requires independent
 * security and legal review and is NOT part of this configuration.
 */
export const RITUALS_CURRENT_CONFIG = {
  cluster: 'devnet',
  programId: RITUALS_PROGRAM_ID,
  deployment: 'deployed',
} as const

/** Valueless devnet TEST stake mint. See deployment/devnet-mint.json. */
export const RITUALS_DEVNET_STAKE_MINT_BASE58 = 'AaHgFh7ussUDor8QfaBCaRz2RHiPNCs7i2yuzdLbt9tc' as const
export const RITUALS_DEVNET_STAKE_MINT = new PublicKey(RITUALS_DEVNET_STAKE_MINT_BASE58)
export const RITUALS_DEVNET_STAKE_DECIMALS = 6 as const

/** Fee-recipient TOKEN ACCOUNT (ProtocolConfig.feeRecipient stores a token account). */
export const RITUALS_DEVNET_FEE_RECIPIENT_BASE58 = 'CD2gkjrNr6cp6asMzYXjPD2uxYkz97Hrmgw7z6c6Z8UJ' as const
export const RITUALS_DEVNET_FEE_RECIPIENT = new PublicKey(RITUALS_DEVNET_FEE_RECIPIENT_BASE58)

/**
 * Fails closed on anything that is not the authorized devnet program.
 * Cluster is checked before identity so a wrong-cluster call never looks valid.
 */
export function assertSupportedRitualsProgram(cluster: RitualsSupportedCluster, programId: PublicKey): void {
  if (cluster !== 'devnet') throw new Error(`Unsupported Rituals cluster: ${String(cluster)}`)
  if (!(programId instanceof PublicKey)) throw new Error('Rituals programId must be a PublicKey')
  if (!programId.equals(RITUALS_PROGRAM_ID)) {
    throw new Error('Rituals program mismatch; only the authorized devnet deployment is accepted')
  }
}
