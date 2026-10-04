/**
 * Lines for the celebration stamps (Jack, 2026-10-04: "a basket of sayings,
 * kinda tongue in cheek"). Picked deterministically from a seed so a stamp
 * never changes while you look at it, and the week's stamp and its receipt
 * say the same thing. Misses keep their one kind line; never mock a miss.
 */
export const KEPT_SAYINGS = Object.freeze([
  'Promises made, promises kept.',
  'Way to show up for yourself!',
  'Winner winner, chicken dinner.',
  'Look at you, adulting.',
  'Future you says thanks.',
  'Couch: 0. You: 1.',
  'Hell yeah. Same time next week.',
  'Discipline unlocked.',
  'Your word is good. Who knew?',
  'Showed up. Barely complained.',
  'Main character energy.',
  'Stake safe. Ego slightly inflated.',
])

export const STARTED_SAYINGS = Object.freeze([
  'Signed, sealed, staked.',
  'No take-backs.',
  'Skin in the game.',
  'Money where your mouth is.',
  'It’s on now.',
  'Future you is watching.',
])

/** FNV-1a: small, stable, good enough to spread seeds over a short list. */
function hash(seed: string): number {
  let value = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  return value
}

export function pickSaying(list: readonly string[], seed: string): string {
  return list[hash(seed) % list.length]
}

export const keptSaying = (ritualAddress: string, eventIndex: number) => pickSaying(KEPT_SAYINGS, `${ritualAddress}:${eventIndex}:kept`)
export const startedSaying = (ritualAddress: string) => pickSaying(STARTED_SAYINGS, `${ritualAddress}:started`)
