/**
 * What the submission shows. Plan of record: docs/plans/single-blade-2026-10-02.md.
 *
 * SOLO_ONLY hides every way into anything but the solo loop (make a promise,
 * stamp it, settle, see the receipt). The group flow, witness, Join, Seasons
 * and the person destination keep their code, routes, tests and program
 * support; only their entry points are switched off here. Flip the flag to
 * bring them all back. Never replace a hidden entry with a tappable
 * "coming soon" button.
 */
export const SOLO_ONLY = true

export type ProductScope = Readonly<{
  /** Home "With friends" → TemplatePicker → group screens. */
  homeFriends: boolean
  /** Home "Join with a link". */
  homeJoin: boolean
  /** Home Seasons section, its Season read, and the Season → create path. */
  seasons: boolean
  /** "+ One witness" at create and the "Your witness" card on the ritual. */
  witness: boolean
  /** "With friends" option inside solo create. */
  groupFromCreate: boolean
  /** "A person you pick" as the missed-week destination. */
  personDestination: boolean
  /** None / Note chooser at create. When hidden, the note line is offered at every stamp. */
  proofChooser: boolean
}>

export function scopeFor(soloOnly: boolean): ProductScope {
  const all = !soloOnly
  return Object.freeze({
    homeFriends: all,
    homeJoin: all,
    seasons: all,
    witness: all,
    groupFromCreate: all,
    personDestination: all,
    proofChooser: all,
  })
}

export const SCOPE: ProductScope = scopeFor(SOLO_ONLY)

/** One plain, untappable line on Home while the rest is hidden. */
export const COMING_SOON_LINE = 'With friends: coming soon.'
