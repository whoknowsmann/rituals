import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import type { Connection, PublicKey } from '@solana/web3.js'

/** Same tSKR ATA read for Home and create; only a missing account means zero. */
export async function readTestTokenBalance(connection: Pick<Connection, 'getTokenAccountBalance'>, mint: PublicKey, owner: PublicKey): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(mint, owner)
  try {
    const read = await connection.getTokenAccountBalance(ata, 'confirmed')
    return BigInt(read.value.amount)
  } catch (error) {
    const message = String((error as Error)?.message ?? error).toLowerCase()
    if (message.includes('could not find account') || message.includes('account not found')) return 0n
    throw error // callers keep failed reads unknown, never a guessed empty balance
  }
}
