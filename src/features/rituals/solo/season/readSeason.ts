import { PublicKey } from '@solana/web3.js'
import { decodeSeason, type SeasonAccountView } from '../../../../data/rituals/accounts'

export interface SeasonConnection {
  getAccountInfo: (address: PublicKey, commitment?: 'confirmed') => Promise<Readonly<{ owner: PublicKey; data: Uint8Array; executable?: boolean }> | null>
}

export type SeasonRead = Readonly<{ address: PublicKey; account: SeasonAccountView }>

export class SeasonReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SeasonReadError'
  }
}

/** Read and decode one Season PDA; this helper has no signing or write capability. */
export async function readSeason(connection: SeasonConnection, seasonAddress: PublicKey, programId: PublicKey): Promise<SeasonRead> {
  if (!(connection && typeof connection.getAccountInfo === 'function') || !(seasonAddress instanceof PublicKey) || seasonAddress.equals(PublicKey.default) || !(programId instanceof PublicKey) || programId.equals(PublicKey.default)) {
    throw new SeasonReadError('Season account could not be read')
  }

  let info: Readonly<{ owner: PublicKey; data: Uint8Array; executable?: boolean }> | null
  try {
    info = await connection.getAccountInfo(new PublicKey(seasonAddress.toBytes()), 'confirmed')
  } catch {
    throw new SeasonReadError('Season account could not be read')
  }
  if (info === null) throw new SeasonReadError('Season account was not found')
  try {
    if (!(info.owner instanceof PublicKey) || !info.owner.equals(programId) || info.executable === true || !(info.data instanceof Uint8Array)) throw new Error('invalid Season account')
    const account = decodeSeason({ owner: info.owner, data: new Uint8Array(info.data) }, programId, seasonAddress)
    return Object.freeze({ address: new PublicKey(seasonAddress.toBytes()), account })
  } catch {
    throw new SeasonReadError('Season account could not be read')
  }
}
