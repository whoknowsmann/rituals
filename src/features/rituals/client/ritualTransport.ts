import type { RitualClientTransport } from '../../../data/rituals/ritualClient'
import type { RitualWalletSubmissionTransport } from '../../../data/rituals/ritualSubmission'
import { feeForMessageAtSlot, withReadRetry } from './resilientRead'

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
  }
}
