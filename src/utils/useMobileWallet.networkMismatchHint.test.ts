import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
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
let verdict: typeof import('./chainVerdict')
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
  verdict = await vi.importActual<typeof import('./chainVerdict')>('./chainVerdict')
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

const TITLE = 'Network mismatch?'
const BODY = 'Rituals runs on Devnet. In Seed Vault Wallet: Settings → Network → Devnet. Then try again.'
const cancellation = () => new Error('java.util.concurrent.CancellationException')
const timeout = () => Object.assign(new Error('java.util.concurrent.TimeoutException: Timed out waiting for response with id=2'), { name: 'java.util.concurrent.ExecutionException', code: 'Timed out waiting for response' })
const declined = { category: 'wallet', userRejected: true, submitted: false }
const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [])

describe('Seed Vault Devnet popup: after a cancelled signing sheet', () => {
  it('shows the exact native popup once the wallet has closed and the chain shows nothing landed, and keeps the quiet "nothing sent" result', async () => {
    const order: string[] = []
    vi.mocked(transact).mockImplementation(async (run) => { try { return await run(nativeWallet as never) } finally { order.push('wallet closed') } })
    vi.mocked(Alert.alert).mockImplementation(() => { order.push('popup') })
    nativeWallet.signAndSendTransactions.mockRejectedValue(cancellation())
    await expect(hook.useMobileWallet().signAndSendTransaction(transaction(), 12)).rejects.toMatchObject(declined)
    verdict.reportChainVerdict(false)
    await vi.waitFor(() => expect(Alert.alert).toHaveBeenCalledOnce())
    expect(Alert.alert).toHaveBeenCalledWith(TITLE, BODY, [{ text: 'OK' }])
    expect(order).toEqual(['wallet closed', 'popup'])
    expect(AsyncStorage.setItem).toHaveBeenCalledExactlyOnceWith('@rituals/network-mismatch-hint/v1', '1')
  })

  it('waits for the chain first, and stays silent when the action went through (Back on the success sheet)', async () => {
    nativeWallet.signAndSendTransactions.mockRejectedValue(cancellation())
    await expect(hook.useMobileWallet().signAndSendTransaction(transaction(), 12)).rejects.toMatchObject(declined)
    await flush()
    expect(Alert.alert).not.toHaveBeenCalled()
    verdict.reportChainVerdict(true)
    await flush()
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(AsyncStorage.getItem).not.toHaveBeenCalled()
    expect(AsyncStorage.setItem).not.toHaveBeenCalled()
  })

  it('shows it after 4 s if the chain has not answered', async () => {
    vi.useFakeTimers()
    try {
      nativeWallet.signAndSendTransactions.mockRejectedValue(cancellation())
      await expect(hook.useMobileWallet().signAndSendTransaction(transaction(), 12)).rejects.toMatchObject(declined)
      await vi.advanceTimersByTimeAsync(3999)
      expect(Alert.alert).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(Alert.alert).toHaveBeenCalledExactlyOnceWith(TITLE, BODY, [{ text: 'OK' }])
    } finally { vi.useRealTimers() }
  })

  it('shows at most twice per phone, including after an app restart', async () => {
    let stored: string | null = null
    vi.mocked(AsyncStorage.getItem).mockImplementation(async () => stored)
    vi.mocked(AsyncStorage.setItem).mockImplementation(async (_key, value) => { stored = value })
    nativeWallet.signAndSendTransactions.mockRejectedValue(cancellation())
    const mobile = hook.useMobileWallet()
    for (const shown of [1, 2, 2]) {
      await expect(mobile.signAndSendTransaction(transaction(), 12)).rejects.toMatchObject(declined)
      verdict.reportChainVerdict(false)
      await flush()
      expect(Alert.alert).toHaveBeenCalledTimes(shown)
    }
    expect(stored).toBe('2')
    vi.resetModules()
    const restarted = await vi.importActual<typeof import('./useMobileWallet')>('./useMobileWallet')
    const restartedVerdict = await vi.importActual<typeof import('./chainVerdict')>('./chainVerdict')
    await expect(restarted.useMobileWallet().signAndSendTransaction(transaction(), 12)).rejects.toMatchObject(declined)
    restartedVerdict.reportChainVerdict(false)
    await flush()
    expect(Alert.alert).toHaveBeenCalledTimes(2)
  })

  it.each(['read', 'write', 'both'])('fails open on a storage %s failure: still one popup per failure, and at most two', async (failure) => {
    if (failure !== 'write') vi.mocked(AsyncStorage.getItem).mockRejectedValue(new Error('unreadable'))
    if (failure !== 'read') vi.mocked(AsyncStorage.setItem).mockRejectedValue(new Error('unwritable'))
    nativeWallet.signAndSendTransactions.mockRejectedValue(cancellation())
    const mobile = hook.useMobileWallet()
    for (const shown of [1, 2, 2]) {
      await expect(mobile.signAndSendTransaction(transaction(), 12)).rejects.toMatchObject(declined)
      verdict.reportChainVerdict(false)
      await flush()
      expect(Alert.alert).toHaveBeenCalledTimes(shown)
    }
  })

  it('keeps the cap when failures overlap', async () => {
    let stored: string | null = null
    vi.mocked(AsyncStorage.getItem).mockImplementation(async () => stored)
    vi.mocked(AsyncStorage.setItem).mockImplementation(async (_key, value) => { stored = value })
    const { showNetworkMismatchHint } = await vi.importActual<typeof import('./networkMismatchHint')>('./networkMismatchHint')
    const shown = Promise.all([showNetworkMismatchHint(seedVault), showNetworkMismatchHint(seedVault), showNetworkMismatchHint(seedVault)])
    verdict.reportChainVerdict(false)
    await shown
    expect(Alert.alert).toHaveBeenCalledTimes(2)
    expect(stored).toBe('2')
  })

  it.each<[string, () => unknown, Record<string, unknown>]>([
    ['a timeout after the sheet opened', () => nativeWallet.signAndSendTransactions.mockRejectedValue(timeout()), { submitted: true }],
    ['a lost response after signing', () => vi.mocked(transact).mockImplementation(async (run) => { await run(nativeWallet as never); throw timeout() }), { submitted: true }],
    ['a cancel at authorize', () => vi.mocked(authorization.authorizeSession).mockRejectedValue(cancellation()), { category: 'authorization', userRejected: true }],
    ['a cancel before the wallet opened', () => vi.mocked(transact).mockRejectedValue(new Error('Session not established: Local association cancelled by user')), declined],
    ['a stale token at signing', () => nativeWallet.signAndSendTransactions.mockRejectedValue(new Error('-1/auth_token not valid for signing')), { category: 'authorization' }],
    ['a wallet error that is not a cancel', () => nativeWallet.signAndSendTransactions.mockRejectedValue(new Error('boom')), { category: 'wallet', userRejected: false }],
  ])('no popup on %s', async (_case, arrange, expected) => {
    arrange()
    await expect(hook.useMobileWallet().signAndSendTransaction(transaction(), 12)).rejects.toMatchObject(expected)
    await flush()
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(AsyncStorage.getItem).not.toHaveBeenCalled()
  })

  it.each(['app.phantom', null])('never shows for %s, even on the same cancellation', async (walletPackage) => {
    authorization = { ...authorization, walletPackage }
    nativeWallet.signAndSendTransactions.mockRejectedValue(cancellation())
    await expect(hook.useMobileWallet().signAndSendTransaction(transaction(), 12)).rejects.toMatchObject(declined)
    await flush()
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(AsyncStorage.getItem).not.toHaveBeenCalled()
  })

  it('never shows on a cancelled connect or disconnect', async () => {
    vi.mocked(authorization.authorizeSession).mockRejectedValue(cancellation())
    vi.mocked(authorization.deauthorizeSession).mockRejectedValue(cancellation())
    const mobile = hook.useMobileWallet()
    await expect(mobile.connect(seedVault)).rejects.toThrow('CancellationException')
    await expect(mobile.disconnect()).rejects.toThrow('CancellationException')
    await flush()
    expect(Alert.alert).not.toHaveBeenCalled()
  })

  it('is raised from one place: the wallet session every action shares', () => {
    const src = resolve(__dirname, '..')
    const callers = sourceFiles(src).filter((file) => !/\.test\.tsx?$/.test(file) && readFileSync(file, 'utf8').includes('showNetworkMismatchHint('))
    expect(callers.map((file) => relative(src, file)).sort()).toEqual(['utils/networkMismatchHint.ts', 'utils/useMobileWallet.tsx'])
  })
})
