import { useMemo } from 'react'
import { useCluster, type ClusterNetwork } from '../../../components/cluster/cluster-data-access'
import { useConnection } from '../../../utils/ConnectionProvider'
import { useMobileWallet } from '../../../utils/useMobileWallet'
import { createCurrentRitualClient, type RitualClient, type RitualClientTransport } from '../../../data/rituals/ritualClient'
import { RITUALS_CURRENT_CONFIG, RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID } from '../../../data/rituals/programIds'
import type { RitualWalletSubmissionTransport } from '../../../data/rituals/ritualSubmission'

export type RitualDeploymentConfig = Readonly<{ deployment: 'deployed' | 'not-deployed'; programId: unknown }>
export type RitualClientState =
  | Readonly<{ status: 'ready'; client: RitualClient }>
  | Readonly<{ status: 'not-deployed'; reason: string }>
  | Readonly<{ status: 'unsupported-cluster'; reason: string }>

type ClientFactory = () => RitualClient

export function resolveRitualClientState(cluster: ClusterNetwork, deployment: RitualDeploymentConfig, createClient: ClientFactory): RitualClientState {
  if (cluster !== 'devnet') return Object.freeze({ status: 'unsupported-cluster', reason: `Rituals are not enabled on ${String(cluster)}` })
  let placeholder = deployment.programId === RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID
  try { placeholder = placeholder || (typeof deployment.programId === 'object' && deployment.programId !== null && 'toBase58' in deployment.programId && (deployment.programId as { toBase58: () => string }).toBase58() === RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID) } catch { placeholder = true }
  if (deployment.deployment !== 'deployed' || deployment.programId === null || placeholder) return Object.freeze({ status: 'not-deployed', reason: 'No authorized Rituals deployment is configured' })
  return Object.freeze({ status: 'ready', client: createClient() })
}

function makeTransport(connection: any, signAndSendTransaction: RitualWalletSubmissionTransport['signAndSendTransaction']): RitualClientTransport & RitualWalletSubmissionTransport {
  return {
    getMultipleAccountsInfoAndContext: connection.getMultipleAccountsInfoAndContext.bind(connection),
    getLatestBlockhashAndContext: connection.getLatestBlockhashAndContext.bind(connection),
    getFeeForMessage: connection.getFeeForMessage.bind(connection),
    getMinimumBalanceForRentExemption: connection.getMinimumBalanceForRentExemption.bind(connection),
    confirmTransaction: connection.confirmTransaction.bind(connection),
    signAndSendTransaction,
  }
}

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
