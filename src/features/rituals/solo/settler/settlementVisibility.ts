import type { SoloRitualModel } from '../lifecycle/soloRitualModel'

/** Visibility delays the transfer, never the chain deadline or its outcome. */
export function settlementVisibleEnough(model: Pick<SoloRitualModel, 'demoSpeedNotice' | 'showedUp'>, focused: boolean, appState: string | null): boolean {
  return !model.demoSpeedNotice || model.showedUp || (focused && appState === 'active')
}

export const DEMO_CLOCK_WARNING = 'Demo weeks run back to back, even while you’re away. Stay here to stamp each week. Miss one and its stake goes to your chosen destination. Leaving does not pause the clock.'
