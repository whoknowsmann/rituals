import type { PublicKey } from '@solana/web3.js'
import type { RitualClient } from '../../../../data/rituals/ritualClient'
import { buildRitualActionDeps } from '../../buildRitualActionDeps'
import { runLifecycleAction } from '../../runLifecycleAction'

export type AutoSettleInput = Readonly<{
  client: RitualClient
  ritualAddress: PublicKey
  settler: PublicKey
  eventIndex: number
  needsEventInit: boolean
  destinationTokenAccounts: readonly PublicKey[]
  getBlockHeight?: () => Promise<number>
  mayContinue?: () => boolean
}>

export type AutoSettleResult =
  | Readonly<{ ok: true; signatures: readonly string[] }>
  | Readonly<{ ok: false; step: 'finalize'; category: string }>

/** One atomic close, including initialization if absent. The runner owns retries. */
export async function autoSettleWeek(input: AutoSettleInput, run: typeof runLifecycleAction = runLifecycleAction): Promise<AutoSettleResult> {
  if (input.mayContinue && !input.mayContinue()) return { ok: false, step: 'finalize', category: 'not-visible' }
  const deps = buildRitualActionDeps({
    client: input.client, ritualAddress: input.ritualAddress, actor: input.settler,
    kind: 'finalize', eventIndex: input.eventIndex,
    initializeBeforeFinalize: input.needsEventInit,
    destinationTokenAccounts: input.destinationTokenAccounts,
    authorizedActor: () => !input.mayContinue || input.mayContinue() ? input.settler : null,
    getBlockHeight: input.getBlockHeight,
  })
  const result = await run(deps, () => undefined)
  return result.ok ? { ok: true, signatures: [result.result.signature] }
    : { ok: false, step: 'finalize', category: result.category }
}
