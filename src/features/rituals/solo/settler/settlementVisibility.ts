import type { SoloRitualModel } from '../lifecycle/soloRitualModel'

/** Visibility delays the transfer, never the chain deadline or its outcome. */
export function settlementVisibleEnough(model: Pick<SoloRitualModel, 'demoSpeedNotice' | 'showedUp'>, focused: boolean, appState: string | null): boolean {
  return !model.demoSpeedNotice || model.showedUp || (focused && appState === 'active')
}

export const DEMO_CLOCK_WARNING = 'Demo weeks keep running while you’re away. Unstamped weeks are missed.'
