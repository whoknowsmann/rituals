import type { RitualClientTransport } from '../../../data/rituals/ritualClient'
import type { RitualWalletSubmissionTransport } from '../../../data/rituals/ritualSubmission'
import { feeForMessageAtSlot, withReadRetry } from './resilientRead'

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Waits up to ~30 s for a just-broadcast transaction and returns its message bytes. */
async function landedMessage(connection: any, signature: string): Promise<Uint8Array | null> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const landed = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
      if (landed) return Uint8Array.from(landed.transaction.message.serialize())
    } catch { /* lagging node or 429: retry */ }
    await pause(1500)
  }
  return null
}

/**
 * Chain transport shared by the wallet client and the app's settle-key client.
 * Kept free of React and native modules so devnet scripts can use it too.
 */
export function makeRitualTransport(connection: any, signAndSendTransaction: RitualWalletSubmissionTransport['signAndSendTransaction']): RitualClientTransport & RitualWalletSubmissionTransport {
  return {
    getMultipleAccountsInfoAndContext: withReadRetry(connection.getMultipleAccountsInfoAndContext.bind(connection)),
    getLatestBlockhashAndContext: withReadRetry(connection.getLatestBlockhashAndContext.bind(connection)),
    getFeeForMessage: feeForMessageAtSlot(connection.getFeeForMessage.bind(connection)),
    getMinimumBalanceForRentExemption: withReadRetry(connection.getMinimumBalanceForRentExemption.bind(connection)),
    confirmTransaction: withReadRetry(connection.confirmTransaction.bind(connection)),
    signAndSendTransaction,
    getLandedTransactionMessage: (signature: string) => landedMessage(connection, signature),
  }
}
