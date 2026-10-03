import { Connection, Keypair, Transaction } from '@solana/web3.js'
import { createCurrentRitualClient, type RitualClient } from '../../../../data/rituals/ritualClient'
import { makeRitualTransport } from '../../client/ritualTransport'

/**
 * A Rituals client whose "wallet" is the app's settle key: it signs locally and
 * sends raw, with no wallet prompt. Used only for permissionless steps.
 */
export function createSettlerClient(connection: Connection, settler: Keypair): RitualClient {
  const transport = makeRitualTransport(connection, async (transaction: Transaction, minContextSlot: number) => {
    if (!transaction.feePayer?.equals(settler.publicKey)) throw new Error('settle transaction fee payer is not the settle key')
    transaction.partialSign(settler)
    // Simulation before send runs at the connection's own commitment.
    return connection.sendRawTransaction(transaction.serialize(), { minContextSlot })
  })
  return createCurrentRitualClient(transport, transport)
}
