import { describe, expect, it, vi } from 'vitest'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { Keypair, PublicKey, type Connection } from '@solana/web3.js'
import { readTestTokenBalance } from './testTokenBalance'

const owner = Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey
const mint = new PublicKey(new Uint8Array(32).fill(8))
const reader = () => ({ getTokenAccountBalance: vi.fn<Connection['getTokenAccountBalance']>() })

describe('shared Home/create tSKR balance read', () => {
  it.each(['0', '19000000', '50000000', '9007199254740993'])('reads the configured mint ATA at confirmed commitment exactly: %s', async (amount) => {
    const connection = reader()
    connection.getTokenAccountBalance.mockResolvedValue({ context: { slot: 1 }, value: { amount, decimals: 6, uiAmount: null } })
    await expect(readTestTokenBalance(connection, mint, owner)).resolves.toBe(BigInt(amount))
    expect(connection.getTokenAccountBalance).toHaveBeenCalledExactlyOnceWith(getAssociatedTokenAddressSync(mint, owner), 'confirmed')
  })

  it.each(['Invalid param: could not find account', 'Account not found'])('treats a genuinely missing ATA as zero: %s', async (message) => {
    const connection = reader()
    connection.getTokenAccountBalance.mockRejectedValue(new Error(message))
    await expect(readTestTokenBalance(connection, mint, owner)).resolves.toBe(0n)
  })

  it.each(['RPC unavailable', '429: too many requests', 'Invalid param: not a Token account'])('never invents a zero balance from a failed read: %s', async (message) => {
    const connection = reader()
    const error = new Error(message)
    connection.getTokenAccountBalance.mockRejectedValue(error)
    await expect(readTestTokenBalance(connection, mint, owner)).rejects.toBe(error)
  })

  it('rejects malformed amounts so the screen can leave the balance unknown', async () => {
    const connection = reader()
    connection.getTokenAccountBalance.mockResolvedValue({ context: { slot: 1 }, value: { amount: 'not-an-amount', decimals: 6, uiAmount: null } })
    await expect(readTestTokenBalance(connection, mint, owner)).rejects.toThrow()
  })
})
