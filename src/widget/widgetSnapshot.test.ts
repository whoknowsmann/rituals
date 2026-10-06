import { describe, expect, it } from 'vitest'
import { createWidgetPublisher, decodeWidgetSnapshot, readWidgetSnapshot, writeWidgetSnapshot, WIDGET_STORAGE_KEY, type WidgetStorage } from './widgetSnapshot'
import { selectWidgetSnapshot, type WidgetOutcome } from './widgetModel'

const known = [{ address: 'older', title: 'Read' }, { address: 'newer', title: 'Train' }]
const outcome: WidgetOutcome = { address: 'newer', stakeLabel: '5 TEST / WK', cells: ['done', 'missed', 'now', 'future'], active: true, state: 'waiting', showedUp: false, terminalCurrent: false, opens: 100, deadline: 200 }
const snapshot = selectWidgetSnapshot(known, [outcome])!
const memory = () => {
  const data = new Map<string, string>()
  const storage: WidgetStorage = { getItem: async (key) => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value) } }
  return { data, storage }
}

describe('widget snapshot', () => {
  it('round trips all explicit v2 fields including ordered cells through storage', async () => {
    const { storage, data } = memory()
    await writeWidgetSnapshot(storage, snapshot)
    expect(data.has('@rituals/widget/v2')).toBe(true)
    expect(await readWidgetSnapshot(storage)).toEqual(snapshot)
    expect(Object.keys(JSON.parse(data.get(WIDGET_STORAGE_KEY)!)).sort()).toEqual(['address', 'title', 'stakeLabel', 'cells', 'active', 'state', 'showedUp', 'terminalCurrent', 'opens', 'deadline', 'tint'].sort())
    await writeWidgetSnapshot(storage, null)
    expect(await readWidgetSnapshot(storage)).toBeNull()
  })
  it.each([null, '', '{', 'null', '[]', '{}', '42'])('handles empty or corrupt storage: %s', (raw) => expect(decodeWidgetSnapshot(raw)).toBeNull())
  it.each([
    { state: 'unknown' }, { cells: [] }, { cells: ['nope'] }, { cells: ['now', 'now'] }, { cells: Array(17).fill('done') },
    { cells: null }, { cells: [1] }, { active: false }, { active: 'true' }, { showedUp: 1 }, { terminalCurrent: null }, { stakeLabel: '' },
    { opens: 201 }, { deadline: '200' }, { tint: 'red' }, { tint: ['#ffffff'] }, { address: '' }, { title: null }, { opens: 1.5 },
  ])('rejects an invalid snapshot: %o', (override) => expect(decodeWidgetSnapshot(JSON.stringify({ ...snapshot, ...override }))).toBeNull())
  it('does not invent ordered cells from a legacy v1 aggregate record', async () => {
    const { storage, data } = memory()
    const legacy = { address: 'newer', title: 'Train', weekIndex: 2, weekCount: 4, kept: 1, missed: 1, status: 'open', opens: 100, deadline: 200, tint: '#13917A' }
    data.set('@rituals/widget/v1', JSON.stringify(legacy))
    expect(decodeWidgetSnapshot(JSON.stringify(legacy))).toBeNull()
    expect(await readWidgetSnapshot(storage)).toBeNull()
    await createWidgetPublisher(storage)(known, [outcome], true)
    expect(await readWidgetSnapshot(storage)).toEqual(snapshot)
  })
  it('drops extraneous fields and tolerates storage errors', async () => {
    expect(decodeWidgetSnapshot(JSON.stringify({ ...snapshot, secret: 'not copied' }))).toEqual(snapshot)
    expect(await readWidgetSnapshot({ getItem: async () => { throw Error('offline') }, setItem: async () => {} })).toBeNull()
  })
  it('serializes concurrent writes so an older screen cannot replace the newest active ritual', async () => {
    const { storage } = memory()
    const publish = createWidgetPublisher(storage)
    await Promise.all([publish(known, [outcome]), publish(known, [{ ...outcome, address: 'older' }])])
    expect((await readWidgetSnapshot(storage))?.address).toBe('newer')
  })
  it('seeds selection from disk after a process restart', async () => {
    const { storage } = memory()
    await writeWidgetSnapshot(storage, snapshot)
    await createWidgetPublisher(storage)(known, [{ ...outcome, address: 'older' }])
    expect((await readWidgetSnapshot(storage))?.address).toBe('newer')
  })
  it('switches to the next active ritual after the newest finishes', async () => {
    const { storage } = memory()
    const publish = createWidgetPublisher(storage)
    await publish(known, [outcome, { ...outcome, address: 'older' }], true)
    await publish(known, [{ ...outcome, active: false, state: 'completed', cells: ['done', 'done', 'done', 'done'] }])
    expect((await readWidgetSnapshot(storage))?.address).toBe('older')
  })
  it('Home replaces vanished candidates; removing all rituals clears the snapshot', async () => {
    const { storage } = memory()
    const publish = createWidgetPublisher(storage)
    await publish(known, [outcome])
    await publish(known, [{ ...outcome, address: 'older' }], true)
    expect((await readWidgetSnapshot(storage))?.address).toBe('older')
    await publish([], [], true)
    expect(await readWidgetSnapshot(storage)).toBeNull()
  })
  it('recovers after a failed write', async () => {
    const { storage } = memory()
    let failed = false
    const publish = createWidgetPublisher({ ...storage, setItem: async (key, value) => { if (!failed) { failed = true; throw Error('disk') }; return storage.setItem(key, value) } })
    await expect(publish(known, [outcome])).rejects.toThrow('disk')
    await publish(known, [outcome])
    expect(await readWidgetSnapshot(storage)).toEqual(snapshot)
  })
})
