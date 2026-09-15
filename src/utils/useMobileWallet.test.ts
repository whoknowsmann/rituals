import { describe, expect, it, vi } from 'vitest'
import { PublicKey, Transaction, VersionedTransaction, TransactionMessage, SystemProgram } from '@solana/web3.js'
import { authorizeAndSendTransaction, MobileWalletError } from './useMobileWallet'
import type { Account } from './useAuthorization'

const payer = Key(7)
function Key(value: number) { return new PublicKey(new Uint8Array(32).fill(value)) }
function account(publicKey: PublicKey): Account { return { address: 'AQ'.repeat(32) as never, publicKey } }
function legacy(payerKey = payer) { const tx = new Transaction(); tx.feePayer = payerKey; return tx }
function wallet() { return { signAndSendTransactions: vi.fn(async () => ['sig']) } }

const authorize = vi.fn(async () => account(payer))

describe('authorizeAndSendTransaction', () => {
  it('authorizes once and sends the same transaction with explicit safe MWA options', async () => {
    const session = wallet(); const tx = legacy()
    await expect(authorizeAndSendTransaction(session, authorize, tx, 12)).resolves.toBe('sig')
    expect(authorize).toHaveBeenCalledTimes(1)
    expect(session.signAndSendTransactions).toHaveBeenCalledWith({ transactions: [tx], minContextSlot: 12, commitment: 'confirmed', skipPreflight: false, maxRetries: 3, waitForCommitmentToSendNextTransaction: true })
  })
  it.each([undefined, PublicKey.default])('rejects legacy missing/default payer before wallet send', async (feePayer) => {
    const session = wallet(); const tx = legacy(); tx.feePayer = feePayer as PublicKey
    await expect(authorizeAndSendTransaction(session, authorize, tx, 12)).rejects.toMatchObject({ category: 'input' })
    expect(session.signAndSendTransactions).not.toHaveBeenCalled()
  })
  it('rejects a mismatched legacy payer before wallet send', async () => {
    const session = wallet(); const tx = legacy(Key(8))
    await expect(authorizeAndSendTransaction(session, authorize, tx, 12)).rejects.toMatchObject({ category: 'input' })
    expect(session.signAndSendTransactions).not.toHaveBeenCalled()
  })
  it('checks versioned payer against the authorized account', async () => {
    const message = new TransactionMessage({ payerKey: payer, recentBlockhash: Key(9).toBase58(), instructions: [SystemProgram.transfer({ fromPubkey: payer, toPubkey: Key(8), lamports: 1 })] }).compileToV0Message()
    const tx = new VersionedTransaction(message); const session = wallet()
    await expect(authorizeAndSendTransaction(session, authorize, tx, 1)).resolves.toBe('sig')
  })
  it('rejects invalid slots before authorization', async () => {
    const session = wallet(); const auth = vi.fn(authorize)
    await expect(authorizeAndSendTransaction(session, auth, legacy(), -1)).rejects.toMatchObject({ category: 'input' })
    expect(auth).not.toHaveBeenCalled(); expect(session.signAndSendTransactions).not.toHaveBeenCalled()
  })
  it('sanitizes authorization and wallet failures while retaining rejection category', async () => {
    const session = wallet(); const rejection = Object.assign(new Error('secret'), { name: 'UserRejectedRequestError' })
    await expect(authorizeAndSendTransaction(session, async () => { throw rejection }, legacy(), 1)).rejects.toMatchObject({ category: 'authorization' })
    session.signAndSendTransactions.mockRejectedValueOnce(new Error('secret'))
    const error = await authorizeAndSendTransaction(session, authorize, legacy(), 1).catch((value) => value)
    expect(error).toMatchObject({ category: 'wallet' })
    expect(error).not.toHaveProperty('message', 'secret')
  })
  it.each([[], {}, [undefined]])('rejects malformed wallet signatures', async (result) => {
    const session = wallet(); session.signAndSendTransactions.mockResolvedValueOnce(result as never)
    await expect(authorizeAndSendTransaction(session, authorize, legacy(), 1)).rejects.toBeInstanceOf(MobileWalletError)
  })
})
