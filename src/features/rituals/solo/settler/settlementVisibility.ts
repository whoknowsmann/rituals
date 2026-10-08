import type { SoloRitualModel } from '../lifecycle/soloRitualModel'

/** Visibility delays the transfer, never the deadline. Home may close a demo miss too. */
export function settlementVisibleEnough(model: Pick<SoloRitualModel, 'demoSpeedNotice' | 'showedUp' | 'weekSkipped'>, focused: boolean, appState: string | null, homeFocused = false): boolean {
  return !model.demoSpeedNotice || model.showedUp || model.weekSkipped || ((focused || homeFocused) && appState === 'active')
}

export const DEMO_CLOCK_WARNING = 'Demo weeks keep running while you’re away. Unstamped weeks are missed.'
