import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { RitualRpcError, type RitualBundleRead } from '../../../data/rituals/ritualsRpc'
import { applyWalletReminderPlan, reminderInputFromBundle, restoreRememberedReminders, walletReminderPlan } from './restore'
import { reminders } from './runtime'

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }))
vi.mock('./runtime', () => ({ clearRitualReminders: vi.fn(), reminders: { getPreferences: vi.fn(), restore: vi.fn(), silence: vi.fn() } }))
const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const known = (n: number) => ({ address: key(n).toBase58(), title: 'Read', requirement: 'Read a page' })
const start = 1_800_000_000
const schedule = Array.from({ length: 3 }, (_, n) => ({ opens: BigInt(start + 60 + n * 604800),
  deadline: BigInt(start + 518460 + n * 604800), resolution: BigInt(start + 601260 + n * 604800) }))
const bundle = (n = 1, overrides: Record<string, unknown> = {}, event: Record<string, unknown> | null = null, claims: unknown[] = []) => ({
  ritual: { address: key(n), account: { kind: 'Solo', status: 'Active', creator: key(9), currentEventIndex: 0,
    schedule, perEventAllocation: 5_000_000n, stakeDecimals: 6, forfeitDestination: key(8), skipDeclared: false, ...overrides } },
  event, claims,
}) as unknown as RitualBundleRead
const event = (eventIndex = 0, status = 'Claiming') => ({ account: { eventIndex, status } })
const claims = [{ member: key(9), account: { status: 'Confirmed' } }]

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(Date, 'now').mockReturnValue(start * 1000)
  vi.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify([known(1), known(2), known(3)]))
  vi.mocked(reminders.getPreferences).mockResolvedValue({ masterEnabled: true, permissionAsked: true,
    rituals: { [known(1).address]: { enabled: true, stampedWeeks: [] }, [known(2).address]: { enabled: false, stampedWeeks: [] } } })
  vi.mocked(reminders.restore).mockResolvedValue(true)
})
afterEach(() => vi.restoreAllMocks())

describe('chain-backed reminder restoration (mock reader; no RPC)', () => {
  it('refuses to restore reminders for another wallet or after disconnect', async () => {
    const getRitualBundle = vi.fn(async () => bundle())
    await restoreRememberedReminders({ getRitualBundle }, key(7))
    expect(reminders.restore).not.toHaveBeenCalled()
    await restoreRememberedReminders({ getRitualBundle }, null)
    expect(getRitualBundle).toHaveBeenCalledOnce()
  })
  it('does not schedule a result read across a wallet switch', async () => {
    let active = true
    const getRitualBundle = vi.fn(async () => { active = false; return bundle() })
    await restoreRememberedReminders({ getRitualBundle }, key(9), () => active)
    expect(reminders.restore).not.toHaveBeenCalled()
  })
  it('keeps exact chain windows, title and allocation rather than synthesizing a schedule', () => {
    const read = bundle()
    const input = reminderInputFromBundle(known(1), read, start)!
    expect(input.schedule).toBe(read.ritual.account.schedule)
    expect(input).toMatchObject({ ritualAddress: known(1).address, ritualTitle: 'Read', stakeLabel: '5 tSKR', enabled: true, stampedWeeks: [] })
  })
  it.each(['Funding', 'Completed', 'Cancelled'])('does not restore %s rituals', (status) => {
    expect(reminderInputFromBundle(known(1), bundle(1, { status }), start)).toBeNull()
  })
  it('rejects non-Solo or mismatched accounts', () => {
    expect(reminderInputFromBundle(known(1), bundle(1, { kind: 'Group' }), start)).toBeNull()
    expect(reminderInputFromBundle(known(1), bundle(2), start)).toBeNull()
  })
  it('excludes confirmed current stamps, skipped weeks and advanced indices', () => {
    expect(reminderInputFromBundle(known(1), bundle(1, {}, event(), claims), start)?.stampedWeeks).toEqual([0])
    expect(reminderInputFromBundle(known(1), bundle(1, { currentEventIndex: 1, skipDeclared: true, skipEventIndex: 0 }), start)?.stampedWeeks).toEqual([0])
    expect(reminderInputFromBundle(known(1), bundle(1, { skipDeclared: true, skipEventIndex: 1 }), start)?.stampedWeeks).toEqual([1])
  })
  it.each(['Settled', 'Voided'])('excludes a current %s event even without a confirmed stamp', (status) => {
    expect(reminderInputFromBundle(known(1), bundle(1, {}, event(0, status)), start)?.stampedWeeks).toEqual([0])
  })
  it('does not mistake a previous stamp or another member for a current stamp', () => {
    expect(reminderInputFromBundle(known(1), bundle(1, { currentEventIndex: 1 }, event(), claims), start)?.stampedWeeks).toEqual([0])
    expect(reminderInputFromBundle(known(1), bundle(1, {}, event(), [{ member: key(7), account: { status: 'Confirmed' } }]), start)?.stampedWeeks).toEqual([])
  })
  it('omits expired demo windows and keeps their original week identities', () => {
    const demo = [{ opens: 60n, deadline: 105n, resolution: 115n }, { opens: 120n, deadline: 165n, resolution: 175n }]
    expect(reminderInputFromBundle(known(1), bundle(1, { schedule: demo }), 106)?.stampedWeeks).toEqual([0])
  })
  it('reads only remembered opted-in rituals through the existing bundle reader', async () => {
    const getRitualBundle = vi.fn(async () => bundle())
    expect(await restoreRememberedReminders({ getRitualBundle }, key(9))).toBe(true)
    expect(getRitualBundle).toHaveBeenCalledExactlyOnceWith(key(1))
    expect(reminders.restore).toHaveBeenCalledExactlyOnceWith(reminderInputFromBundle(known(1), bundle(), start), expect.any(Function))
  })
  it('master off and unreadable preferences never start a chain read', async () => {
    const getRitualBundle = vi.fn()
    vi.mocked(reminders.getPreferences).mockResolvedValueOnce({ masterEnabled: false, permissionAsked: true, rituals: {} })
    expect(await restoreRememberedReminders({ getRitualBundle }, key(9))).toBe(true)
    vi.mocked(reminders.getPreferences).mockResolvedValueOnce(undefined)
    expect(await restoreRememberedReminders({ getRitualBundle }, key(9))).toBe(false)
    expect(getRitualBundle).not.toHaveBeenCalled()
  })
  it('skips completed and permanently unreadable accounts', async () => {
    const getRitualBundle = vi.fn(async () => bundle(1, { status: 'Completed' }))
    expect(await restoreRememberedReminders({ getRitualBundle }, key(9))).toBe(true)
    getRitualBundle.mockRejectedValueOnce(new RitualRpcError('not-found', 'gone'))
    expect(await restoreRememberedReminders({ getRitualBundle }, key(9))).toBe(true)
    expect(reminders.restore).not.toHaveBeenCalled()
  })
  it('reports RPC or native failures to the guarded Settings action, not a false restore success', async () => {
    const getRitualBundle = vi.fn(async () => bundle())
    getRitualBundle.mockRejectedValueOnce(new RitualRpcError('rpc', 'offline'))
    await expect(restoreRememberedReminders({ getRitualBundle }, key(9))).rejects.toThrow('offline')
    vi.mocked(reminders.restore).mockResolvedValueOnce(undefined)
    expect(await restoreRememberedReminders({ getRitualBundle }, key(9))).toBe(false)
  })
})

describe('reminders follow the connected wallet: A→none→B→A (Home read; no RPC here)', () => {
  const walletA = key(9)
  const walletB = key(7)
  const loaded = [{ ...known(1), bundle: bundle(1) }, { ...known(2), bundle: bundle(2, { creator: walletB }) }]
  it('silences every other wallet (all of them while none is connected) and reschedules only the connected wallet', () => {
    const a = walletReminderPlan(loaded, walletA, start)
    expect(a.silence).toEqual([known(2).address])
    expect(a.restore).toEqual([reminderInputFromBundle(known(1), bundle(1), start)])
    const none = walletReminderPlan(loaded, null, start)
    expect(none).toMatchObject({ silence: [known(1).address, known(2).address], restore: [] })
    const b = walletReminderPlan(loaded, walletB, start)
    expect(b.silence).toEqual([known(1).address])
    expect(b.restore.map((input) => input.ritualAddress)).toEqual([known(2).address])
    expect(new Set([a.key, none.key, b.key]).size).toBe(3)
    // Back to A: the same plan as before, so A's reminders return exactly.
    expect(walletReminderPlan(loaded, walletA, start)).toEqual(a)
  })
  it('changes when a week is stamped away from its screen, so that week is dropped', () => {
    const before = walletReminderPlan(loaded, walletA, start)
    const after = walletReminderPlan([{ ...known(1), bundle: bundle(1, {}, event(), claims) }, loaded[1]], walletA, start)
    expect(after.key).not.toBe(before.key)
    expect(after.restore[0].stampedWeeks).toEqual([0])
  })
  it('applies silences, then restores, and stops once the wallet changes', async () => {
    expect(await applyWalletReminderPlan(walletReminderPlan(loaded, walletA, start), () => true)).toBe(true)
    expect(reminders.silence).toHaveBeenCalledExactlyOnceWith(known(2).address)
    expect(reminders.restore).toHaveBeenCalledExactlyOnceWith(reminderInputFromBundle(known(1), bundle(1), start), expect.any(Function))
    expect(vi.mocked(reminders.silence).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(reminders.restore).mock.invocationCallOrder[0])
    vi.mocked(reminders.restore).mockClear()
    let active = true
    vi.mocked(reminders.silence).mockImplementationOnce(async () => { active = false })
    expect(await applyWalletReminderPlan(walletReminderPlan(loaded, walletB, start), () => active)).toBe(false)
    expect(reminders.restore).not.toHaveBeenCalled()
  })
})
