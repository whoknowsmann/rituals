import { describe, expect, it } from 'vitest'
import { createWidgetPublisher, decodeWidgetSnapshot, readWidgetSnapshot, writeWidgetSnapshot, WIDGET_STORAGE_KEY, type WidgetStorage } from './widgetSnapshot'
import { buildWidgetSnapshot, selectWidgetSnapshot, type WidgetOutcome } from './widgetModel'

const known = [{ address: 'older', title: 'Read' }, { address: 'newer', title: 'Train' }]
const outcome: WidgetOutcome = { address: 'newer', stakeLabel: '5 tSKR', causeLabel: 'Northside Food Bank (demo)', active: true, weeks: [{ opens: 100, deadline: 200, outcome: 'pending' }, { opens: 400, deadline: 500, outcome: 'pending' }] }
const snapshot = buildWidgetSnapshot(known, [outcome])!
const memory = () => {
  const data = new Map<string, string>()
  const storage: WidgetStorage = { getItem: async (key) => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value) } }
  return { data, storage }
}
const selected = async (storage: WidgetStorage, now = 150) => selectWidgetSnapshot(await readWidgetSnapshot(storage), now)?.address

describe('widget v3 snapshot', () => {
  it('round trips only explicit candidate fields and ordered windows/results', async () => {
    const { storage, data } = memory()
    await writeWidgetSnapshot(storage, snapshot)
    expect(data.has('@rituals/widget/v3')).toBe(true)
    expect(await readWidgetSnapshot(storage)).toEqual(snapshot)
    expect(Object.keys(JSON.parse(data.get(WIDGET_STORAGE_KEY)!).rituals[0]).sort()).toEqual(['address', 'title', 'stakeLabel', 'causeLabel', 'active', 'weeks', 'tint'].sort())
    const extra = { rituals: [{ ...snapshot.rituals[0], secret: 'no', weeks: [{ ...outcome.weeks[0], secret: 'no' }] }], secret: 'no' }
    expect(JSON.stringify(decodeWidgetSnapshot(JSON.stringify(extra)))).not.toContain('secret')
    await writeWidgetSnapshot(storage, null)
    expect(await readWidgetSnapshot(storage)).toBeNull()
  })
  it('rejects corrupt/old data, invalid windows/results and duplicate candidates', () => {
    for (const raw of [null, '', '{', 'null', '[]', '{}', '42', '{"rituals":[]}']) expect(decodeWidgetSnapshot(raw)).toBeNull()
    const ritual = snapshot.rituals[0]
    for (const override of [
      { address: '' }, { title: null }, { stakeLabel: '' }, { causeLabel: '' }, { active: 'true' }, { active: false }, { tint: 'red' },
      { weeks: [] }, { weeks: Array(17).fill(outcome.weeks[0]) }, { weeks: [{ opens: 100, deadline: 99, outcome: 'pending' }] },
      { weeks: [{ opens: 100, deadline: 100, outcome: 'pending' }] }, { weeks: [{ opens: 1.5, deadline: 200, outcome: 'pending' }] },
      { weeks: [{ opens: 100, deadline: 200, outcome: 'done' }] }, { weeks: [null] }, { weeks: [outcome.weeks[0], outcome.weeks[0]] },
    ]) expect(decodeWidgetSnapshot(JSON.stringify({ rituals: [{ ...ritual, ...override }] })), JSON.stringify(override)).toBeNull()
    expect(decodeWidgetSnapshot(JSON.stringify({ rituals: [ritual, ritual] }))).toBeNull()
    expect(decodeWidgetSnapshot(JSON.stringify({ address: 'newer', cells: ['done'], opens: 100, deadline: 200 }))).toBeNull()
  })
  it('does not migrate v2 and repopulates on a foreground read', async () => {
    const { storage, data } = memory()
    data.set('@rituals/widget/v2', JSON.stringify({ address: 'newer', cells: ['done'] }))
    expect(await readWidgetSnapshot(storage)).toBeNull()
    await createWidgetPublisher(storage)(known, [outcome], true)
    expect(await readWidgetSnapshot(storage)).toEqual(snapshot)
  })
  it('serializes concurrent writes and keeps all candidates across process restarts', async () => {
    const { storage } = memory()
    const older = { ...outcome, address: 'older', weeks: [{ opens: 100, deadline: 180, outcome: 'pending' as const }] }
    const publish = createWidgetPublisher(storage)
    await Promise.all([publish(known, [outcome]), publish(known, [older])])
    expect(await selected(storage)).toBe('older')
    expect(await selected(storage, 181)).toBe('newer')
    expect((await readWidgetSnapshot(storage))?.rituals.map((item) => item.address)).toEqual(['older', 'newer'])
    await createWidgetPublisher(storage)(known, [outcome])
    expect(await selected(storage)).toBe('older')
  })
  it('switches after a stamp, replaces vanished candidates, and clears forgotten rituals', async () => {
    const { storage } = memory()
    const publish = createWidgetPublisher(storage)
    await publish(known, [outcome, { ...outcome, address: 'older' }], true)
    await publish(known, [{ ...outcome, weeks: outcome.weeks.map((week) => ({ ...week, outcome: 'kept' })) }])
    expect(await selected(storage)).toBe('older')
    await publish(known, [outcome], true)
    expect((await readWidgetSnapshot(storage))?.rituals).toHaveLength(1)
    await publish([], [], true)
    expect(await readWidgetSnapshot(storage)).toBeNull()
  })
  it('contains read errors and recovers the write queue after a failed write', async () => {
    expect(await readWidgetSnapshot({ getItem: async () => { throw Error('disk') }, setItem: async () => {} })).toBeNull()
    const { storage } = memory()
    let failed = false
    const publish = createWidgetPublisher({ ...storage, setItem: async (key, value) => { if (!failed) { failed = true; throw Error('disk') }; return storage.setItem(key, value) } })
    await expect(publish(known, [outcome])).rejects.toThrow('disk')
    await publish(known, [outcome])
    expect(await readWidgetSnapshot(storage)).toEqual(snapshot)
  })
})
