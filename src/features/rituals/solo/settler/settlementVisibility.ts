import type { SoloRitualModel } from '../lifecycle/soloRitualModel'

/** Visibility delays the transfer, never the chain deadline or its outcome. A kept or skipped week only returns the stake. */
export function settlementVisibleEnough(model: Pick<SoloRitualModel, 'demoSpeedNotice' | 'showedUp' | 'weekSkipped'>, focused: boolean, appState: string | null): boolean {
  return !model.demoSpeedNotice || model.showedUp || model.weekSkipped || (focused && appState === 'active')
}

export const DEMO_CLOCK_WARNING = 'Demo weeks keep running while you’re away. Unstamped weeks are missed.'
