import { useEffect } from 'react'
import type { SoloRitualBundle } from '../features/rituals/solo/lifecycle/soloRitualModel'
import { widgetOutcomeFromBundle } from './widgetBundle'
import type { WidgetOutcome } from './widgetModel'
import { publishWidgetOutcome } from './refreshWidget'

/** The screen's enriched bundle changes identity every second; write only on content changes. */
export function useWidgetSnapshot(address: string, bundle: SoloRitualBundle | null | undefined): void {
  const outcome = bundle ? widgetOutcomeFromBundle({ address, bundle }, Math.floor(Date.now() / 1000)) : null
  const serialized = outcome ? JSON.stringify(outcome) : null
  useEffect(() => {
    if (serialized) void publishWidgetOutcome(JSON.parse(serialized) as WidgetOutcome)
  }, [serialized])
}
