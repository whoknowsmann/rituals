import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicKey, Transaction } from '@solana/web3.js'
import { useMobileWallet } from './useMobileWallet'

const mocks = vi.hoisted(() => ({ transact: vi.fn(), authorize: vi.fn(), current: vi.fn(), send: vi.fn(), hint: vi.fn() }))
vi.mock('react', () => ({ useCallback: (callback: unknown) => callback, useMemo: (factory: () => unknown) => factory() }))
vi.mock('@solana-mobile/mobile-wallet-adapter-protocol-web3js', () => ({ transact: mocks.transact }))
vi.mock('./useAuthorization', () => ({ useAuthorization: () => ({ authorizeSession: mocks.authorize, getCurrentAccount: mocks.current, walletPackage: 'com.solanamobile.wallet' }) }))
vi.mock('./walletSession', () => ({ withWalletSession: (run: () => unknown) => run() }))
vi.mock('./networkMismatchHint', () => ({ showNetworkMismatchHint: mocks.hint }))
vi.mock('./diagnostics', () => ({ logFailure: vi.fn() }))

const payer = new PublicKey(new Uint8Array(32).fill(7))
const account = { publicKey: payer, address: Buffer.from(payer.toBytes()).toString('base64') }
const timeout = Object.assign(new Error('java.util.concurrent.TimeoutException: Timed out waiting for response with id=2'), { name: 'java.util.concurrent.ExecutionException', code: 'Timed out waiting for response' })
const send = () => {
  const transaction = new Transaction()
  transaction.feePayer = payer
  return useMobileWallet().signAndSendTransaction(transaction, 12)
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.current.mockReturnValue(account)
  mocks.authorize.mockResolvedValue(account)
  mocks.send.mockResolvedValue(['signature'])
  mocks.transact.mockImplementation((run) => run({ signAndSendTransactions: mocks.send }))
})

describe('MWA session timeout phases', () => {
  it('does not mark a failed association as a possible broadcast or a decline', async () => {
    mocks.transact.mockRejectedValue(timeout)
    await expect(send()).rejects.toMatchObject({ userRejected: false, submitted: false })
    expect(mocks.authorize).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.hint).not.toHaveBeenCalled()
  })
  it('keeps an authorization timeout pre-signing', async () => {
    mocks.authorize.mockRejectedValue(timeout)
    await expect(send()).rejects.toMatchObject({ category: 'authorization', userRejected: false, submitted: false })
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.hint).not.toHaveBeenCalled()
  })
  it('keeps a signing timeout uncertain through the outer session catch', async () => {
    mocks.send.mockRejectedValue(timeout)
    await expect(send()).rejects.toMatchObject({ userRejected: false, submitted: true })
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.hint).not.toHaveBeenCalled()
  })
  it('retains signing-phase evidence if the outer native session loses its response', async () => {
    mocks.transact.mockImplementation(async (run) => { await run({ signAndSendTransactions: mocks.send }); throw timeout })
    await expect(send()).rejects.toMatchObject({ userRejected: false, submitted: true })
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.hint).not.toHaveBeenCalled()
  })
  it('still recognizes the native decline as nothing submitted, and names the likely Devnet mismatch', async () => {
    mocks.send.mockRejectedValue(new Error('java.util.concurrent.CancellationException'))
    await expect(send()).rejects.toMatchObject({ userRejected: true, submitted: false })
    expect(mocks.hint).toHaveBeenCalledExactlyOnceWith('com.solanamobile.wallet')
  })
})
