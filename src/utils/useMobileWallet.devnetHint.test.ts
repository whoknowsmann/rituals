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

const seedVault = 'com.solanamobile.wallet'
const payer = new PublicKey(new Uint8Array(32).fill(7))
const account = { address: 'test-address', publicKey: payer, chains: ['solana:devnet'] }
const nativeWallet = { signAndSendTransactions: vi.fn() }
let hook: typeof import('./useMobileWallet')
let authorization: ReturnType<typeof useAuthorization>
const transaction = () => { const tx = new Transaction(); tx.feePayer = payer; return tx }

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

async function tapDone() {
  await vi.waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1))
  await vi.mocked(Alert.alert).mock.calls[0][2]![0].onPress!()
}

describe('Devnet hint at the shared action handoff', () => {
  it('pauses before MWA, keeps the session guard, and hands off the exact transaction once after Done', async () => {
    const mobile = hook.useMobileWallet()
    const tx = transaction()
    const action = mobile.signAndSendTransaction(tx, 12)
    await vi.waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1))
    expect(transact).not.toHaveBeenCalled()
    expect(authorization.authorizeSession).not.toHaveBeenCalled()
    expect(nativeWallet.signAndSendTransactions).not.toHaveBeenCalled()
    await expect(mobile.signAndSendTransaction(transaction(), 13)).rejects.toThrow('Finish the open wallet request first.')
    await expect(mobile.connect('app.phantom')).rejects.toThrow('Finish the open wallet request first.')
    await expect(mobile.disconnect()).rejects.toThrow('Finish the open wallet request first.')
    await tapDone()
    await expect(action).resolves.toBe('test-signature')
    expect(transact).toHaveBeenCalledExactlyOnceWith(expect.any(Function), { walletPackage: seedVault })
    expect(nativeWallet.signAndSendTransactions).toHaveBeenCalledTimes(1)
    expect(nativeWallet.signAndSendTransactions.mock.calls[0][0].transactions[0]).toBe(tx)
    expect(nativeWallet.signAndSendTransactions.mock.calls[0][0].minContextSlot).toBe(12)
    await mobile.signAndSendTransaction(transaction(), 14)
    expect(Alert.alert).toHaveBeenCalledTimes(1)
    expect(nativeWallet.signAndSendTransactions).toHaveBeenCalledTimes(2)
  })

  it('leaves Phantom handoffs untouched', async () => {
    authorization = { ...authorization, walletPackage: 'app.phantom' }
    await expect(hook.useMobileWallet().signAndSendTransaction(transaction(), 12)).resolves.toBe('test-signature')
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(AsyncStorage.getItem).not.toHaveBeenCalled()
    expect(transact).toHaveBeenCalledExactlyOnceWith(expect.any(Function), { walletPackage: 'app.phantom' })
  })

  it('uses a saved phone flag before the handoff without alerting', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue('shown')
    await expect(hook.useMobileWallet().signAndSendTransaction(transaction(), 12)).resolves.toBe('test-signature')
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(nativeWallet.signAndSendTransactions).toHaveBeenCalledTimes(1)
  })

  it('continues once with absent chains even when both storage operations fail', async () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValue(new Error('unreadable'))
    vi.mocked(AsyncStorage.setItem).mockRejectedValue(new Error('unwritable'))
    vi.mocked(authorization.authorizeSession).mockResolvedValue({ ...account, chains: undefined })
    const mobile = hook.useMobileWallet()
    const action = mobile.signAndSendTransaction(transaction(), 12)
    await tapDone()
    await expect(action).resolves.toBe('test-signature')
    expect(nativeWallet.signAndSendTransactions).toHaveBeenCalledTimes(1)
    await mobile.signAndSendTransaction(transaction(), 13)
    expect(Alert.alert).toHaveBeenCalledTimes(1)
  })

  it.each([null, { ...account, publicKey: new PublicKey(new Uint8Array(32).fill(8)) }])('rejects a stale action before spending the hint when the current account is %j', async (current) => {
    vi.mocked(authorization.getCurrentAccount).mockReturnValue(current)
    await expect(hook.useMobileWallet().signAndSendTransaction(transaction(), 12)).rejects.toThrow('Connect the wallet that started this request.')
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(AsyncStorage.getItem).not.toHaveBeenCalled()
    expect(transact).not.toHaveBeenCalled()
  })

  it('does not spend the action hint on connect or disconnect', async () => {
    const mobile = hook.useMobileWallet()
    await mobile.connect(seedVault)
    await mobile.disconnect()
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(AsyncStorage.getItem).not.toHaveBeenCalled()
    const action = mobile.signAndSendTransaction(transaction(), 12)
    await tapDone()
    await action
    expect(Alert.alert).toHaveBeenCalledTimes(1)
  })

  it('still blocks an explicit chain mismatch after Done without sending', async () => {
    vi.mocked(authorization.authorizeSession).mockResolvedValue({ ...account, chains: ['solana:mainnet'] })
    const action = hook.useMobileWallet().signAndSendTransaction(transaction(), 12)
    const rejection = expect(action).rejects.toMatchObject({ category: 'network-mismatch' })
    await tapDone()
    await rejection
    expect(nativeWallet.signAndSendTransactions).not.toHaveBeenCalled()
  })

  it('covers create, stamp, skip, settle fallback and End early through their existing shared client', () => {
    const source = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf8')
    for (const file of ['screens/solo/SoloCreateScreen.tsx', 'screens/solo/SoloRitualScreen.tsx', 'features/rituals/eject/EndEarly.tsx']) {
      expect(source(file)).toContain('useRitualClient()')
      expect(source(file)).not.toContain('withDevnetHintOnce') // no screen-local duplicates
    }
    expect(source('features/rituals/client/useRitualClient.ts')).toContain('const { signAndSendTransaction } = useMobileWallet()')
    expect(source('features/rituals/client/useRitualClient.ts')).toContain('makeTransport(connection, signAndSendTransaction)')
    expect(source('utils/useMobileWallet.tsx')).toContain('transaction, minContextSlot, () => { signAndSendInvoked = true; }), true)')
  })
})
