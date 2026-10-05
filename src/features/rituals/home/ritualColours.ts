import { ritualPalette, ritualTint } from '../../../theme/tokens'

/**
 * One colour per ritual on this phone. Colours follow the order rituals were
 * remembered, so no two tiles share a colour until the palette (8) runs out.
 * The address hash was fine for one ritual and collided at four ("two orange
 * tiles for two different rituals", Jack 2026-10-05). A ritual this phone does
 * not remember keeps the hash colour.
 */
export function ritualTintAmong(address: string, known: readonly { address: string }[]): string {
  const index = known.findIndex((item) => item.address === address)
  return index >= 0 ? ritualPalette[index % ritualPalette.length] : ritualTint(address)
}
