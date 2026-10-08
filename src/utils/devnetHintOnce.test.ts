import { beforeEach, describe, expect, it, vi } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert } from 'react-native'

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }))
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }))

const seedVault = 'com.solanamobile.wallet'
let flag: string | null
let hint: typeof import('./devnetHintOnce')
beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  flag = null
  vi.mocked(AsyncStorage.getItem).mockImplementation(async () => flag)
  vi.mocked(AsyncStorage.setItem).mockImplementation(async (_key, value) => { flag = value })
  hint = await vi.importActual<typeof import('./devnetHintOnce')>('./devnetHintOnce')
})

async function tapDone() {
  await vi.waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1))
  await vi.mocked(Alert.alert).mock.calls[0][2]![0].onPress!()
}

describe('one-time Seed Vault Devnet hint', () => {
  it('shows the exact native popup once, then continues the original action exactly once after Done', async () => {
    const result = { signature: 'test-result' }
    const start = vi.fn(async () => result)
    const action = hint.withDevnetHintOnce(seedVault, start)
    await vi.waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1))
    expect(Alert.alert).toHaveBeenCalledWith('Set Seed Vault to Devnet', 'Seed Vault Wallet → Settings → Network → Devnet.', [{ text: 'Done', onPress: expect.any(Function) }], { cancelable: false })
    expect(start).not.toHaveBeenCalled()
    expect(AsyncStorage.setItem).not.toHaveBeenCalled()
    await tapDone()
    await tapDone() // a repeated native callback must not replay the tap
    await expect(action).resolves.toBe(result)
    expect(start).toHaveBeenCalledTimes(1)
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('@rituals/devnet-hint/v1')
    expect(AsyncStorage.setItem).toHaveBeenCalledExactlyOnceWith('@rituals/devnet-hint/v1', 'shown')
    await hint.withDevnetHintOnce(seedVault, start)
    expect(start).toHaveBeenCalledTimes(2)
    expect(Alert.alert).toHaveBeenCalledTimes(1)
  })

  it.each(['app.phantom', null, undefined, 'unknown.wallet'])('never shows or touches the flag for %s', async (walletPackage) => {
    const start = vi.fn(async () => 'continued')
    await expect(hint.withDevnetHintOnce(walletPackage, start)).resolves.toBe('continued')
    expect(start).toHaveBeenCalledTimes(1)
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(AsyncStorage.getItem).not.toHaveBeenCalled()
    expect(AsyncStorage.setItem).not.toHaveBeenCalled()
  })

  it('does not show when the phone has the stored flag, including after an app restart', async () => {
    const first = hint.withDevnetHintOnce(seedVault, () => 'first')
    await tapDone()
    await expect(first).resolves.toBe('first')
    vi.resetModules()
    const restarted = await vi.importActual<typeof import('./devnetHintOnce')>('./devnetHintOnce')
    const start = vi.fn(() => 'after restart')
    await expect(restarted.withDevnetHintOnce(seedVault, start)).resolves.toBe('after restart')
    expect(Alert.alert).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(2)
  })

  it.each(['read', 'write', 'both'])('fails open on a storage %s failure: shows, continues, and remembers Done in memory', async (failure) => {
    if (failure !== 'write') vi.mocked(AsyncStorage.getItem).mockRejectedValue(new Error('storage read failed'))
    if (failure !== 'read') vi.mocked(AsyncStorage.setItem).mockRejectedValue(new Error('storage write failed'))
    const start = vi.fn(async () => 'continued')
    const action = hint.withDevnetHintOnce(seedVault, start)
    await tapDone()
    await expect(action).resolves.toBe('continued')
    expect(start).toHaveBeenCalledTimes(1)
    await hint.withDevnetHintOnce(seedVault, start)
    expect(start).toHaveBeenCalledTimes(2)
    expect(Alert.alert).toHaveBeenCalledTimes(1)
  })

  it('shares a pending popup without replaying either caller', async () => {
    const first = vi.fn(() => 'first')
    const second = vi.fn(() => 'second')
    const one = hint.withDevnetHintOnce(seedVault, first)
    const two = hint.withDevnetHintOnce(seedVault, second)
    await tapDone()
    await expect(Promise.all([one, two])).resolves.toEqual(['first', 'second'])
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(Alert.alert).toHaveBeenCalledTimes(1)
  })

  it('passes an action failure through without retrying it or showing the hint again', async () => {
    const error = new Error('wallet declined')
    const start = vi.fn(async () => { throw error })
    const action = hint.withDevnetHintOnce(seedVault, start)
    const rejection = expect(action).rejects.toBe(error)
    await tapDone()
    await rejection
    expect(start).toHaveBeenCalledTimes(1)
    await expect(hint.withDevnetHintOnce(seedVault, () => 'next tap')).resolves.toBe('next tap')
    expect(Alert.alert).toHaveBeenCalledTimes(1)
  })
})
