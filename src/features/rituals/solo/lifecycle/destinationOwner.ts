import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { PublicKey, type Connection } from '@solana/web3.js'
import { publicKeyFromCanonical } from '../create/validation'

/** Display only: never mistake the locked token account for its wallet owner. */
export async function resolveSoloDestinationOwner(
  connection: Pick<Connection, 'getParsedAccountInfo'>,
  destination: PublicKey,
  mint: PublicKey,
  localOwner?: string,
): Promise<PublicKey | null> {
  const saved = localOwner ? publicKeyFromCanonical(localOwner) : null
  if (saved) {
    try {
      if (getAssociatedTokenAddressSync(mint, saved).equals(destination)) return saved
    } catch { /* An invalid or unrelated local owner must not label this destination. */ }
  }
  try {
    const { value } = await connection.getParsedAccountInfo(destination, 'confirmed')
    if (!value || !value.owner.equals(TOKEN_PROGRAM_ID) || !('parsed' in value.data)) return null
    const parsed = value.data.parsed
    if (parsed?.type !== 'account' || parsed.info?.mint !== mint.toBase58() || typeof parsed.info?.owner !== 'string') return null
    return publicKeyFromCanonical(parsed.info.owner)
  } catch {
    return null // Offline, closed, or unparseable: omit the address, never guess.
  }
}
