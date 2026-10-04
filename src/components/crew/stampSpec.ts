/**
 * The solo stamp vocabulary. Pure data so the rules are testable:
 * success marks are ink; a missed or skipped week gets a quiet mark and never
 * the success word (DESIGN.md rule 4: red/success are not for normal misses).
 */
export const STAMP_KINDS = ['promise', 'showed-up', 'kept', 'skipped', 'missed'] as const
export type StampKind = (typeof STAMP_KINDS)[number]

export type StampSpec = Readonly<{ label: string; tone: 'ink' | 'quiet'; rotateDeg: number }>

const SPECS: Record<StampKind, StampSpec> = {
  promise: { label: 'RITUAL STARTED', tone: 'ink', rotateDeg: -6 },
  'showed-up': { label: 'SHOWED UP', tone: 'ink', rotateDeg: -4 },
  kept: { label: 'KEPT', tone: 'ink', rotateDeg: 5 },
  skipped: { label: 'SKIPPED', tone: 'quiet', rotateDeg: -3 },
  missed: { label: 'MISSED', tone: 'quiet', rotateDeg: 3 },
}

export function stampSpec(kind: StampKind): StampSpec {
  return SPECS[kind]
}
