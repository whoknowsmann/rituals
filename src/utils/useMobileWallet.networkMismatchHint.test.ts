import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert } from 'react-native'
import { PublicKey, Transaction } from '@solana/web3.js'
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
import { useAuthorization } from './useAuthorization'

vi.mock('react', () => ({ useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn() }))
vi.mock('./useAuthorization', () => ({ useAuthorization: vi.fn() }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }))
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }))
vi.mock('@solana-mobile/mobile-wallet-adapter-protocol-web3js', () => ({ transact: vi.fn() }))
vi.mock('./diagnostics', () => ({ logFailure: vi.fn() }))

const seedVault = 'com.solanamobile.wallet'
const payer = new PublicKey(new Uint8Array(32).fill(7))
const account = { address: 'test-address', publicKey: payer, chains: ['solana:devnet'] }
const nativeWallet = { signAndSendTransactions: vi.fn() }
let hook: typeof import('./useMobileWallet')
let authorization: ReturnType<typeof useAuthorization>
const transaction = () => { const tx = new Transaction(); tx.feePayer = payer; return tx }
/** Lets any fire-and-forget storage read and alert finish before asserting. */
const flush = () => new Promise((done) => setTimeout(done, 0))

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.mocked(AsyncStorage.getItem).mockResolvedValue(null)
  vi.mocked(AsyncStorage.setItem).mockResolvedValue()
  nativeWallet.signAndSendTransactions.mockResolvedValue(['test-signature'])
  vi.mocked(transact).mockImplementation(async (run) => run(nativeWallet as never))
  authorization = {
    walletPackage: seedVault,
    authorizeSession: vi.fn(async () => account),
    deauthorizeSession: vi.fn(async () => {}),
    clearAuthorization: vi.fn(async () => {}),
    getCurrentAccount: vi.fn(() => account),
  } as unknown as ReturnType<typeof useAuthorization>
  vi.mocked(useAuthorization).mockImplementation(() => authorization)
  hook = await vi.importActual<typeof import('./useMobileWallet')>('./useMobileWallet')
})

describe('Seed Vault Devnet popup: never on an approval that goes through', () => {
  it.each([seedVault, 'app.phantom'])('hands the exact transaction to %s at once, with no popup and no stored flag', async (walletPackage) => {
    authorization = { ...authorization, walletPackage }
    const tx = transaction()
    await expect(hook.useMobileWallet().signAndSendTransaction(tx, 12)).resolves.toBe('test-signature')
    expect(transact).toHaveBeenCalledExactlyOnceWith(expect.any(Function), { walletPackage })
    expect(nativeWallet.signAndSendTransactions).toHaveBeenCalledOnce()
    expect(nativeWallet.signAndSendTransactions.mock.calls[0][0].transactions[0]).toBe(tx)
    expect(nativeWallet.signAndSendTransactions.mock.calls[0][0].minContextSlot).toBe(12)
    await flush()
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(AsyncStorage.getItem).not.toHaveBeenCalled()
    expect(AsyncStorage.setItem).not.toHaveBeenCalled()
  })

  it('still blocks an explicit chain mismatch without sending; the screen shows that alert', async () => {
    vi.mocked(authorization.authorizeSession).mockResolvedValue({ ...account, chains: ['solana:mainnet'] })
    await expect(hook.useMobileWallet().signAndSendTransaction(transaction(), 12)).rejects.toMatchObject({ category: 'network-mismatch' })
    expect(nativeWallet.signAndSendTransactions).not.toHaveBeenCalled()
    await flush()
    expect(Alert.alert).not.toHaveBeenCalled()
  })

  it('covers create, stamp, skip, settle fallback and End early through their one shared wallet client', () => {
    const source = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf8')
    for (const file of ['screens/solo/SoloCreateScreen.tsx', 'screens/solo/SoloRitualScreen.tsx', 'features/rituals/eject/EndEarly.tsx']) {
      expect(source(file)).toContain('useRitualClient()')
    }
    expect(source('features/rituals/client/useRitualClient.ts')).toContain('const { signAndSendTransaction } = useMobileWallet()')
    expect(source('features/rituals/client/useRitualClient.ts')).toContain('makeTransport(connection, signAndSendTransaction)')
  })
})
