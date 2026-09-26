/**
 * Ritual suggestions.
 *
 * Turns a short phrase like "run with my brother" into concrete, valid ritual
 * drafts the user can accept or edit.
 *
 * Deliberately on-device and deterministic rather than a hosted model call:
 *
 *   - it works offline, in a demo, with no API key and no latency;
 *   - it cannot hallucinate a stake amount, a schedule, or a rule;
 *   - every suggestion is a real RitualDraft that passes the same validation
 *     as hand-entered input, so a suggestion can never produce a ritual the
 *     app would otherwise reject.
 *
 * AI here only helps someone START. It never decides whether a ritual was
 * completed, never judges a claim, and never touches custody.
 */

import type { RitualDraft } from './draftForm'

export const SUGGESTION_INTENTS = [
  'movement',
  'reading',
  'family',
  'music',
  'study',
  'cooking',
  'general',
] as const

export type SuggestionIntent = (typeof SUGGESTION_INTENTS)[number]

export type RitualSuggestion = Readonly<{
  intent: SuggestionIntent
  rationale: string
  /** Short human label for how this ritual runs, e.g. "4 weeks · on your word". */
  shape: string
  draft: RitualDraft
}>

const KEYWORDS: Readonly<Record<Exclude<SuggestionIntent, 'general'>, readonly string[]>> = {
  movement: ['run', 'running', 'gym', 'walk', 'walking', 'workout', 'train', 'training', 'exercise', 'yoga', 'swim', 'ride', 'hike', 'lift', 'jiu', 'sport'],
  reading: ['read', 'reading', 'book', 'books', 'chapter', 'novel', 'pages'],
  family: ['family', 'mom', 'mum', 'dad', 'parents', 'sister', 'brother', 'call', 'dinner', 'kids', 'daughter', 'son'],
  music: ['music', 'guitar', 'piano', 'sing', 'song', 'practice', 'band', 'drum', 'write'],
  study: ['study', 'studying', 'learn', 'course', 'class', 'exam', 'language', 'spanish', 'homework', 'revise'],
  cooking: ['cook', 'cooking', 'meal', 'bake', 'baking', 'recipe', 'kitchen', 'eat'],
}

/** Best-effort intent detection. Never throws; unknown input maps to 'general'. */
export function parseIntent(input: string): SuggestionIntent {
  let text: string
  try {
    text = typeof input === 'string' ? input : String(input)
  } catch {
    return 'general'
  }
  const words = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'general'

  let best: SuggestionIntent = 'general'
  let bestScore = 0
  for (const intent of Object.keys(KEYWORDS) as Array<Exclude<SuggestionIntent, 'general'>>) {
    const score = words.filter((word) => KEYWORDS[intent].some((k) => word === k || word.startsWith(k))).length
    if (score > bestScore) {
      bestScore = score
      best = intent
    }
  }
  return best
}

type Blueprint = Readonly<{ title: string; requirement: string; events: string; mode: RitualDraft['confirmationMode'] }>

const BLUEPRINTS: Readonly<Record<SuggestionIntent, readonly Blueprint[]>> = {
  movement: [
    { title: 'Weekly run', requirement: 'Go for a run and share the route or how it felt.', events: '4', mode: 'ONE_FRIEND' },
    { title: 'Move every week', requirement: 'Any deliberate movement counts. Check in when it is done.', events: '6', mode: 'ONE_FRIEND' },
  ],
  reading: [
    { title: 'Weekly reading', requirement: 'Read at least one chapter and share what stood out.', events: '4', mode: 'ONE_FRIEND' },
    { title: 'Finish the book', requirement: 'Keep reading and report progress each week.', events: '6', mode: 'HONOR' },
  ],
  family: [
    { title: 'Family check-in', requirement: 'Make real time for family and check in afterwards.', events: '4', mode: 'HONOR' },
    { title: 'Sunday dinner', requirement: 'Share a meal together and mark it done.', events: '4', mode: 'ONE_FRIEND' },
  ],
  music: [
    { title: 'Practice week', requirement: 'Practice deliberately and share a clip or a note.', events: '4', mode: 'ONE_FRIEND' },
    { title: 'Make something', requirement: 'Create or finish a small piece each week.', events: '4', mode: 'MAJORITY' },
  ],
  study: [
    { title: 'Study session', requirement: 'Complete a focused study block and check in.', events: '6', mode: 'ONE_FRIEND' },
    { title: 'Learn it properly', requirement: 'Study, then explain one thing you learned.', events: '4', mode: 'MAJORITY' },
  ],
  cooking: [
    { title: 'Cook it yourself', requirement: 'Make a meal from scratch and share the result.', events: '4', mode: 'ONE_FRIEND' },
    { title: 'New recipe week', requirement: 'Try something you have never cooked before.', events: '6', mode: 'ONE_FRIEND' },
  ],
  general: [
    { title: 'Weekly ritual', requirement: 'Do the thing you committed to and check in with the group.', events: '4', mode: 'ONE_FRIEND' },
    { title: 'Keep the streak', requirement: 'Show up each week and tell your friends you did.', events: '6', mode: 'HONOR' },
  ],
}

const RATIONALES: Readonly<Record<SuggestionIntent, string>> = {
  movement: 'Movement works well weekly — frequent enough to build a habit, forgiving enough to miss a bad week.',
  reading: 'Reading suits a longer run of smaller events, so progress stays visible.',
  family: 'Family rituals do better on honour or a single confirmation. Heavy verification makes it feel transactional.',
  music: 'Creative practice benefits from a friend confirming, since sharing the work is half the point.',
  study: 'Study goals work best with more, shorter events to keep momentum.',
  cooking: 'Cooking is easy to evidence and easy to share, which makes confirmation natural.',
  general: 'A weekly rhythm with one friend confirming is the most reliable starting shape.',
}

/**
 * Stake selection.
 *
 * Two hard protocol constraints apply and are enforced here so every
 * suggestion validates identically to hand-entered input:
 *
 *   1. the per-member total must divide evenly across the event count;
 *   2. the stake must be positive -- free rituals are not supported.
 *
 * Deliberately modest amounts: a suggestion must never nudge someone toward
 * risking more than they intended. HONOR mode gets the smallest viable stake,
 * because money plus no verification is the combination most likely to strain
 * a friendship.
 */
const stakeForEvents = (eventCount: string, honor: boolean): string => {
  const events = Number(eventCount)
  // 1 TEST per event normally, and the minimum that still divides for honour
  // mode, keeping the amount symbolic rather than meaningful.
  const perEvent = honor ? 1 : 2
  return String(events * perEvent)
}

// ---------------------------------------------------------------------------
// Titles in the user's own words
// ---------------------------------------------------------------------------

const TITLE_MAX = 40

/** Leading filler that isn't the commitment itself. Longest first. */
const LEADING_FILLER = [
  'i would like to', "i'd like to", 'i want to', 'i need to', 'i wanna', 'i should', 'i will', "i'll",
  'i am going to', "i'm going to", 'want to', 'need to', 'try to', 'finally', 'actually', 'really', 'to',
]

/** Where the commitment ends and its frequency starts. */
const FREQUENCY_MARKERS = new Set(['every', 'each', 'daily', 'weekly', 'nightly', 'once', 'twice', 'more', 'again', 'regularly', 'often'])

/** Family words that read as names when they follow "my": "call my mom" → "Call Mom". */
const FAMILY_NAMES: Readonly<Record<string, string>> = {
  mom: 'Mom', mum: 'Mum', mama: 'Mama', dad: 'Dad', papa: 'Papa',
  grandma: 'Grandma', grandpa: 'Grandpa', nana: 'Nana', granny: 'Granny',
}

/** Words a title shouldn't end on after trimming. */
const DANGLING = new Set(['a', 'an', 'the', 'and', 'or', 'with', 'to', 'for', 'of', 'in', 'on', 'at', 'my', 'your', 'our', 'around', 'before', 'after', 'about', 'into', 'by', 'from'])

/**
 * Turns what someone typed into a short title in their own words.
 * "call my mom" → "Call Mom"; "I want to practice guitar every week" →
 * "Practice guitar". Returns null when nothing usable is left.
 */
export function titleFromIntention(input: string): string | null {
  if (typeof input !== 'string') return null
  const cleaned = input.replace(/[^\p{L}\p{N}'’\s-]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (!/\p{L}/u.test(cleaned)) return null
  const shouting = cleaned.length >= 2 && cleaned === cleaned.toUpperCase()
  let words = (shouting ? cleaned.toLowerCase() : cleaned).split(' ')
  const lower = () => words.map((w) => w.toLowerCase())

  // 1. Drop leading filler ("I want to", "finally", …), repeatedly.
  for (let changed = true; changed;) {
    changed = false
    for (const filler of LEADING_FILLER) {
      const parts = filler.split(' ')
      if (words.length > parts.length && parts.every((p, i) => lower()[i] === p)) {
        words = words.slice(parts.length)
        changed = true
        break
      }
    }
  }

  // 2. Cut at the first frequency marker, but never down to a single word
  //    ("read more" stays "Read more").
  const cut = lower().findIndex((w, i) => i > 0 && (FREQUENCY_MARKERS.has(w) || (w === 'three' || w === 'two' || w === 'four') && lower()[i + 1] === 'times'))
  if (cut >= 2) words = words.slice(0, cut)

  // 3. "my mom" → "Mom"; "this book" → "the book".
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase()
    const next = words[i + 1]?.toLowerCase()
    if (w === 'my' && next && FAMILY_NAMES[next]) { out.push(FAMILY_NAMES[next]); i++; continue }
    if (w === 'this' && next) { out.push('the'); continue }
    if (w === 'i') { out.push('I'); continue }
    out.push(words[i])
  }
  words = out

  // 4. Keep it a title: prefer cutting before a preposition, else at a word boundary.
  const length = (ws: string[]) => ws.join(' ').length
  if (length(words) > TITLE_MAX) {
    let best = -1
    for (let i = 2; i < words.length; i++) {
      if (DANGLING.has(words[i].toLowerCase()) && length(words.slice(0, i)) <= TITLE_MAX) best = i
    }
    if (best > 0) words = words.slice(0, best)
    else while (words.length > 1 && length(words) > TITLE_MAX) words = words.slice(0, -1)
  }
  while (words.length > 1 && DANGLING.has(words[words.length - 1].toLowerCase())) words = words.slice(0, -1)

  let title = words.join(' ').slice(0, TITLE_MAX).trim()
  if (!/\p{L}/u.test(title)) return null
  title = title[0].toUpperCase() + title.slice(1)
  return title
}

const MODE_LABEL: Readonly<Record<RitualDraft['confirmationMode'], string>> = {
  HONOR: 'on your word',
  ONE_FRIEND: 'a friend confirms',
  MAJORITY: 'most of the crew confirms',
  UNANIMOUS: 'everyone confirms',
}

const shapeLabel = (blueprint: Blueprint): string => `${blueprint.events} weeks · ${MODE_LABEL[blueprint.mode]}`

export function suggestRituals(input: string): readonly RitualSuggestion[] {
  const intent = parseIntent(input)
  const blueprints = BLUEPRINTS[intent] ?? BLUEPRINTS.general
  const ownTitle = titleFromIntention(input)

  return Object.freeze(
    blueprints.map((blueprint) =>
      Object.freeze({
        intent,
        rationale: RATIONALES[intent],
        shape: shapeLabel(blueprint),
        draft: Object.freeze({
          title: ownTitle ?? blueprint.title,
          requirement: blueprint.requirement,
          memberCount: '2',
          eventCount: blueprint.events,
          memberTotalStake: stakeForEvents(blueprint.events, blueprint.mode === 'HONOR'),
          confirmationMode: blueprint.mode,
          feePayerMode: 'HOST' as const,
        }) as RitualDraft,
      }),
    ),
  )
}
