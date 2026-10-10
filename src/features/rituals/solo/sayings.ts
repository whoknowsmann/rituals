/**
 * Lines for the celebration stamps (Jack, 2026-10-04: "a basket of sayings,
 * kinda tongue in cheek"). Picked deterministically from a seed so a stamp
 * never changes while you look at it, and the week's stamp and its receipt
 * say the same thing. Misses keep their one kind line; never mock a miss.
 */
// Pruned 2026-10-05: no "winner" (PRODUCT.md copy rules), no meme lines.
export const KEPT_SAYINGS = Object.freeze([
  'Promises made, promises kept.',
  'Future you says thanks.',
  'Couch: 0. You: 1.',
  'Same time next week.',
  'Your word is good. Who knew?',
  'Showed up. Barely complained.',
  'Stake safe. Ego slightly inflated.',
  // Added 2026-10-09 (Jack: no repeats inside a 6-week ritual).
  'Week done. Excuses: none.',
  'Look at you, being reliable.',
  'You did the thing.',
  'Your stake stays home.',
  'Nobody had to nag you.',
  'Past you made a deal. You kept it.',
  'Quietly impressive.',
  'Proof you meant it.',
  'Called your own bluff.',
  'Week kept. Wallet intact.',
  'Consistency looks good on you.',
  'Another week in the books.',
  'Didn’t even need a reminder. Probably.',
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

/** The ritual's own order of the kept lines: a seeded shuffle, so weeks never repeat until the list runs out. */
function keptOrder(ritualAddress: string): string[] {
  const order = [...KEPT_SAYINGS]
  let state = hash(`${ritualAddress}:kept-order`) || 1
  for (let index = order.length - 1; index > 0; index -= 1) {
    state ^= state << 13; state >>>= 0
    state ^= state >>> 17
    state ^= state << 5; state >>>= 0
    const swap = state % (index + 1)
    ;[order[index], order[swap]] = [order[swap], order[index]]
  }
  return order
}

/**
 * Week N of a ritual gets the Nth line of the ritual's shuffled order, so a ritual
 * (max 16 weeks) never repeats a line (Jack, 2026-10-09). The final week never says
 * "Same time next week."; it takes the slot a next week would have used instead,
 * which no week of this ritual uses.
 */
export const keptSaying = (ritualAddress: string, eventIndex: number, weekCount?: number) => {
  const order = keptOrder(ritualAddress)
  const line = order[eventIndex % order.length]
  if (weekCount !== undefined && eventIndex >= weekCount - 1 && line === 'Same time next week.') return order[(eventIndex + 1) % order.length]
  return line
}
export const startedSaying = (ritualAddress: string) => pickSaying(STARTED_SAYINGS, `${ritualAddress}:started`)
