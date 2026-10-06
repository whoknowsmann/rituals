import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }))
vi.mock('./runtime', () => ({ clearRitualReminders: vi.fn(async () => undefined) }))
import AsyncStorage from '@react-native-async-storage/async-storage'
import { forgetRitual, KNOWN_RITUALS_STORAGE_KEY } from '../authoritativeRituals'
import { clearRitualReminders } from './runtime'

const source = (path: string) => readFileSync(resolve('src/features/rituals/reminders', path), 'utf8')

describe('reminder integration pins (not native UI tests)', () => {
  it('only renders the default-on reminder toggle for Real weeks, below the speed pills', () => {
    const create = source('../../../screens/solo/SoloCreateScreen.tsx')
    expect(create).toContain('const [remindWeekly, setRemindWeekly] = useState(true)')
    expect(create).toMatch(/\{speed === 'real' && \(\s*<View style=\{styles.presets\}>\s*<Pressable[^\n]*accessibilityRole="switch"[^\n]*accessibilityLabel="Remind me each week"/)
    expect(create.indexOf("{speed === 'real' && (")).toBeGreaterThan(create.indexOf('SOLO_SPEEDS.map'))
    expect(create).toContain('styles.preset, remindWeekly && styles.presetChosen')
    expect(create).toContain("enabled: speed === 'real' && remindWeekly")
  })
  it('schedules only after confirmed readback and uses its chain schedule', () => {
    const create = source('../../../screens/solo/SoloCreateScreen.tsx')
    expect(create).toContain("create.state.status === 'confirmed' ? create.state.ritualAddress : null")
    expect(create.indexOf('void scheduleReminders(')).toBeGreaterThan(create.indexOf('void rememberRitual('))
    expect(create).toContain('schedule: read.account.schedule')
    expect(create).toContain('stakeLabel: formatAtomic(read.account.perEventAllocation, read.account.stakeDecimals)')
  })
  it('cancels the captured confirmed stamp week, and reconciles an observed chain stamp or skip', () => {
    const ritual = source('../../../screens/solo/SoloRitualScreen.tsx')
    expect(ritual).toMatch(/claim.state.status === 'confirmed'[\s\S]*?const eventIndex = claimEventIndex.current\s*if \(eventIndex !== null && ritualAddress\) void cancelWeekReminders\(ritualAddress.toBase58\(\), eventIndex\)/)
    expect(ritual).toContain('stamped: Boolean(model?.showedUp)')
    expect(ritual).toContain('skippedEventIndex: read?.ritual.account.skipDeclared ? read.ritual.account.skipEventIndex : undefined')
    expect(source('./useReminders.ts')).toContain('void reminders.afterStamp(address, Number(week))')
  })
  it('registers the native plugin without push registration', () => {
    expect(JSON.parse(source('../../../../app.json')).expo.plugins).toContain('expo-notifications')
    const native = source('./native.ts')
    expect(native).toContain('Notifications.SchedulableTriggerInputTypes.DATE')
    expect(native).toContain('Notifications.AndroidImportance.DEFAULT')
    expect(native).not.toMatch(/getExpoPushToken|getDevicePushToken/)
    expect(source('./runtime.ts')).toContain("require('./native')")
  })
  it('forgetRitual invokes cleanup after removing the phone record', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue('[]')
    vi.mocked(AsyncStorage.setItem).mockResolvedValue(undefined)
    await forgetRitual('ritual-A')
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(KNOWN_RITUALS_STORAGE_KEY, '[]')
    expect(clearRitualReminders).toHaveBeenCalledWith('ritual-A')
    expect(vi.mocked(AsyncStorage.setItem).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(clearRitualReminders).mock.invocationCallOrder[0])
  })
})
