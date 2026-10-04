import type { SoloRitualUiState } from '../solo/lifecycle/soloRitualModel'

export type TileStatus = Readonly<{ text: string; act: boolean }>

/**
 * The one line at the bottom of a Home tile: what this ritual wants from you
 * now. `act` = there is something to do (stamp this week), shown as a pill.
 */
export function tileStatus(model: Readonly<{ state: SoloRitualUiState; showedUp: boolean; nextOpensLabel: string | null }>): TileStatus {
  switch (model.state) {
    case 'claimable':
    case 'open-not-initialized':
      return model.showedUp ? { text: 'Stamped ✓', act: false } : { text: 'Stamp this week', act: true }
    case 'waiting': return { text: model.nextOpensLabel ? `Opens ${model.nextOpensLabel}` : 'Opens soon', act: false }
    case 'closing':
    case 'resolving/settle': return { text: model.showedUp ? 'Stamped ✓ · closing' : 'Closing…', act: false }
    case 'missed': return { text: 'Missed last week', act: false }
    case 'skipped': return { text: 'Skipped last week', act: false }
    case 'completed': return { text: 'Finished', act: false }
    case 'awaiting-witness': return { text: 'Waiting on witness', act: false }
    case 'funding': return { text: 'Not active yet', act: false }
  }
}
