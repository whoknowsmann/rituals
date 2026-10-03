import { useMemo } from 'react'
import { PublicKey } from '@solana/web3.js'
import { useCluster, type ClusterNetwork } from '../../../components/cluster/cluster-data-access'
import { useConnection } from '../../../utils/ConnectionProvider'
import { useMobileWallet } from '../../../utils/useMobileWallet'
import { createCurrentRitualClient, type RitualClient } from '../../../data/rituals/ritualClient'
import { RITUALS_CURRENT_CONFIG, RITUALS_PROGRAM_ID } from '../../../data/rituals/programIds'
import { makeRitualTransport } from './ritualTransport'

export type RitualDeploymentConfig = Readonly<{ deployment: 'deployed' | 'not-deployed'; programId: unknown }>
export type RitualClientState =
  | Readonly<{ status: 'ready'; client: RitualClient }>
  | Readonly<{ status: 'not-deployed'; reason: string }>
  | Readonly<{ status: 'unsupported-cluster'; reason: string }>

type ClientFactory = () => RitualClient

export function resolveRitualClientState(cluster: ClusterNetwork, deployment: RitualDeploymentConfig, createClient: ClientFactory): RitualClientState {
  if (cluster !== 'devnet') return Object.freeze({ status: 'unsupported-cluster', reason: `Rituals are not enabled on ${String(cluster)}` })
  let validProgram = false
  try {
    validProgram = deployment.programId instanceof PublicKey && !deployment.programId.equals(PublicKey.default) && deployment.programId.equals(RITUALS_PROGRAM_ID)
  } catch { validProgram = false }
  if (deployment.deployment !== 'deployed' || !validProgram) return Object.freeze({ status: 'not-deployed', reason: 'No authorized Rituals deployment is configured' })
  return Object.freeze({ status: 'ready', client: createClient() })
}

// Reads (including confirmation polling) are retried on transient public-RPC
// failures inside makeRitualTransport. Submission is never retried.
const makeTransport = makeRitualTransport

/** Safe application boundary: unavailable states never perform RPC or wallet work. */
export function useRitualClient(): RitualClientState {
  const { connection } = useConnection()
  const { selectedCluster } = useCluster()
  const { signAndSendTransaction } = useMobileWallet()
  return useMemo(() => resolveRitualClientState(selectedCluster.network, RITUALS_CURRENT_CONFIG, () => {
    const transport = makeTransport(connection, signAndSendTransaction)
    return createCurrentRitualClient(transport, transport)
  }), [connection, selectedCluster.network, signAndSendTransaction])
}
