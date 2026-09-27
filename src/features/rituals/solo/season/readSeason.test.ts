import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { readSeason } from './readSeason'

const programId = new PublicKey(new Uint8Array(32).fill(9))
const seasonAddress = new PublicKey(new Uint8Array(32).fill(8))

describe('readSeason', () => {
  it('reports a missing Season account honestly', async () => {
    const connection = { getAccountInfo: async () => null }
    await expect(readSeason(connection, seasonAddress, programId)).rejects.toThrow('Season account was not found')
  })

  it('does not decode an account owned by another program', async () => {
    const connection = {
      getAccountInfo: async () => ({ owner: new PublicKey(new Uint8Array(32).fill(7)), data: new Uint8Array(610), executable: false }),
    }
    await expect(readSeason(connection, seasonAddress, programId)).rejects.toThrow('Season account could not be read')
  })
})
