import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import type { WidgetModel, WidgetSnapshot } from './widgetModel'

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }))
vi.mock('./RitualWidget', () => ({ RitualWidget: () => null }))
import { widgetTaskHandler } from './widgetTaskHandler'

const snapshot: WidgetSnapshot = { rituals: [
  { address: 'older', title: 'Read', active: true, stakeLabel: '5 tSKR', causeLabel: 'Northside Food Bank (demo)', tint: '#13917A', weeks: [{ opens: 100, deadline: 400, outcome: 'pending' }] },
  { address: 'newer', title: 'Train', active: true, stakeLabel: '5 tSKR', causeLabel: 'Northside Food Bank (demo)', tint: '#2F6FE8', weeks: [{ opens: 100, deadline: 500, outcome: 'pending' }] },
] }
const invoke = async (action = 'WIDGET_UPDATE', name = 'RitualWidget', width = 160, height = 160) => {
  const renderWidget = vi.fn()
  await widgetTaskHandler({ widgetInfo: { widgetName: name, width, height }, widgetAction: action, renderWidget } as unknown as WidgetTaskHandlerProps)
  return renderWidget
}
afterEach(() => vi.restoreAllMocks())

describe('headless Android update', () => {
  it('projects fresh time and reselects from disk on periodic updates without writes', async () => {
    storage.getItem.mockResolvedValue(JSON.stringify(snapshot))
    storage.setItem.mockClear()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(100000)
    let render = await invoke()
    let props = (render.mock.calls[0][0] as React.ReactElement<{ model: WidgetModel }>).props
    expect(props.model).toMatchObject({ title: 'Read', state: 'open' })
    clock.mockReturnValue(355000)
    render = await invoke()
    props = render.mock.calls[0][0].props
    expect(props.model).toMatchObject({ title: 'Read', state: 'alarmed' })
    clock.mockReturnValue(401000)
    render = await invoke('WIDGET_RESIZED', 'RitualWidget', 320, 160)
    expect(render.mock.calls[0][0].props).toMatchObject({ width: 320, height: 160, model: { title: 'Train', state: 'concerned' } })
    expect(storage.setItem).not.toHaveBeenCalled()
  })
  it('renders an empty add and ignores deletion and other widget names', async () => {
    storage.getItem.mockResolvedValue(null)
    expect((await invoke('WIDGET_ADDED')).mock.calls[0][0].props.model.state).toBe('empty')
    storage.getItem.mockClear()
    expect(await invoke('WIDGET_DELETED')).not.toHaveBeenCalled()
    expect(await invoke('WIDGET_UPDATE', 'OtherWidget')).not.toHaveBeenCalled()
    expect(storage.getItem).not.toHaveBeenCalled()
  })
})
