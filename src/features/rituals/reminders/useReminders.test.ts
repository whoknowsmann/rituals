import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { reminders } from './runtime'
import { useReminders } from './useReminders'

vi.mock('react', () => ({ useEffect: vi.fn() }))
vi.mock('./runtime', () => ({ reminders: {
  prepare: vi.fn(async () => undefined), afterCreate: vi.fn(async () => undefined),
  afterStamp: vi.fn(async () => undefined), forget: vi.fn(async () => undefined),
} }))

// Exercise registered effect bodies/dependencies, not a native React renderer.
let previous: readonly unknown[][] = []
function render(observed?: Parameters<typeof useReminders>[0]) {
  vi.mocked(useEffect).mockClear()
  const result = useReminders(observed)
  const calls = vi.mocked(useEffect).mock.calls
  calls.forEach(([effect, deps], index) => {
    if (!previous[index] || deps?.some((value, position) => !Object.is(value, previous[index][position]))) effect()
  })
  previous = calls.map(([, deps]) => [...deps ?? []])
  return result
}

beforeEach(() => { vi.clearAllMocks(); previous = [] })

describe('reminder hook effects (mocked React)', () => {
  it('never prompts or schedules on mount, rerender, or remount', () => {
    expect(render()).toBe(reminders)
    render()
    previous = []
    render()
    expect(reminders.prepare).toHaveBeenCalledTimes(2)
    expect(reminders.afterCreate).not.toHaveBeenCalled()
    expect(reminders.afterStamp).not.toHaveBeenCalled()
  })
  it('deduplicates unchanged observed weeks on rerender and clears the same stamp on remount', () => {
    const observed = { ritualAddress: 'A', eventIndex: 0, stamped: true }
    render(observed)
    render({ ...observed })
    expect(reminders.afterStamp).toHaveBeenCalledExactlyOnceWith('A', 0)
    previous = []
    render(observed)
    expect(reminders.afterStamp).toHaveBeenCalledTimes(2)
    expect(reminders.afterCreate).not.toHaveBeenCalled()
  })
  it('clears newly expired demo weeks without rescheduling on clock ticks or account rerenders', () => {
    const observed = { ritualAddress: 'A', eventIndex: 0, stamped: false,
      schedule: [{ opens: 60, deadline: 105, resolution: 115 }, { opens: 120, deadline: 165, resolution: 175 }] }
    render({ ...observed, nowSeconds: 105 })
    expect(reminders.afterStamp).not.toHaveBeenCalled()
    render({ ...observed, nowSeconds: 106 })
    render({ ...observed, nowSeconds: 107 })
    expect(reminders.afterStamp).toHaveBeenCalledExactlyOnceWith('A', 0)
    render({ ...observed, completed: true, nowSeconds: 176 })
    expect(reminders.afterStamp).toHaveBeenLastCalledWith('A', 1)
    expect(reminders.afterCreate).not.toHaveBeenCalled()
  })
  it('namespaces cleanup when the observed ritual changes, independent of the selected wallet', () => {
    render({ ritualAddress: 'A', eventIndex: 0, stamped: true })
    render({ ritualAddress: 'B', eventIndex: 0, stamped: true })
    expect(vi.mocked(reminders.afterStamp).mock.calls).toEqual([['A', 0], ['B', 0]])
    expect(reminders.afterCreate).not.toHaveBeenCalled()
  })
})
