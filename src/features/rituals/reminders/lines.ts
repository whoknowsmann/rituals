export type ReminderKind = 'open' | 'day' | 'hour'

/** Demo weeks last a minute and Android may deliver a local alert late, so
 * the line names the stamp deadline in the phone's own time, short and
 * readable ("Week 2: stamp by 6:52:30 PM."; never "is open", which a late alert would get wrong), never "UTC" or a date. */
export function demoReminderLine(week: number, deadlineSeconds: number): string {
  const at = new Date(deadlineSeconds * 1000)
  const hours = at.getHours()
  const time = `${hours % 12 === 0 ? 12 : hours % 12}:${String(at.getMinutes()).padStart(2, '0')}:${String(at.getSeconds()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
  return `Week ${week}: stamp by ${time}.`
}

/** Authored copy only. No random draws: an address/week keeps its voice. */
export const REMINDER_LINES = {
  open: [
    'Week {week} is open. Stamp it.',
    'Week {week} is open. Future you is checking.',
    'Week {week} is open. Keep your word.',
    'Week {week} is open. Show up.',
    'Week {week} is open. Your stamp belongs here.',
    'Week {week} is open. Make time for your ritual.',
  ],
  day: [
    'One day left on week {week}. {stake} is on the clock.',
    'One day left on week {week}. Future you is checking.',
    'Week {week}: one day left. Your {stake} has opinions.',
    'One day left on week {week}. Keep your word.',
    'Week {week}: one day left. Make room for a stamp.',
    'One day left on week {week}. Show up for your ritual.',
  ],
  hour: [
    'Last hour on week {week}. Stamp it.',
    'Last hour on week {week}. Keep your word.',
    'Last hour. No stamp? Your stake goes to {cause}.',
    'Week {week}: last hour. Your {stake} has opinions.',
    'Last hour on week {week}. Future you is checking.',
    'Week {week}: last hour. One stamp still matters.',
  ],
} as const

function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619)
  return value >>> 0
}

export function reminderLine(kind: ReminderKind, address: string, week: number, stakeLabel: string, causeLabel: string): string {
  const lines = REMINDER_LINES[kind]
  const template = lines[hash(`${address}:${week}:${kind}`) % lines.length]
  const line = template.replace('{week}', String(week)).replace('{stake}', () => stakeLabel).replace('{cause}', () => causeLabel)
  // Never truncate an amount or a cause into a different one. Long labels get
  // an honest generic line instead; the title still identifies the ritual.
  if (Array.from(line).length <= 60) return line
  return kind === 'open' ? `Week ${week} is open. Stamp it.`
    : kind === 'day' ? `One day left on week ${week}. Keep your word.`
      : `Last hour on week ${week}. Keep your word.`
}
