export type ReminderKind = 'open' | 'day' | 'hour'

/** Authored copy only. No random draws: an address/week keeps its voice. */
export const REMINDER_LINES = {
  open: [
    'Week {week} is open. Stamp it.',
    'Week {week} is open. Future you is checking.',
    'Week {week} is open. Keep your word.',
    'New week {week}. Same ritual. Show up.',
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
