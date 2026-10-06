import type { PublicKey } from '@solana/web3.js'
import type { RitualClient } from '../../../../data/rituals/ritualClient'
import { buildRitualActionDeps } from '../../buildRitualActionDeps'
import { runLifecycleAction } from '../../runLifecycleAction'

export type AutoSettleInput = Readonly<{
  /** A client whose signer is the settle key (createSettlerClient). */
  client: RitualClient
  ritualAddress: PublicKey
  settler: PublicKey
  eventIndex: number
  /** Nobody checked in, so the week's event account must be opened first. */
  needsEventInit: boolean
  /** Member token accounts; finalize appends the locked solo destination itself. */
  destinationTokenAccounts: readonly PublicKey[]
  getBlockHeight?: () => Promise<number>
  mayContinue?: () => boolean
}>

export type AutoSettleResult =
  | Readonly<{ ok: true; signatures: readonly string[] }>
  | Readonly<{ ok: false; step: 'initialize-event' | 'finalize'; category: string }>

type Run = typeof runLifecycleAction
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Closes a finished week with no wallet prompt: opens it if nobody checked in,
 * then settles it, both signed by the app's settle key. Preparation is retried
 * briefly because the read right after opening can hit a lagging RPC node.
 */
export async function autoSettleWeek(input: AutoSettleInput, run: Run = runLifecycleAction, wait: (ms: number) => Promise<void> = pause): Promise<AutoSettleResult> {
  const noop = () => undefined
  const deps = (kind: 'initialize-event' | 'finalize') => buildRitualActionDeps({
    client: input.client,
    ritualAddress: input.ritualAddress,
    actor: input.settler,
    kind,
    eventIndex: input.eventIndex,
    claimant: input.settler,
    destinationTokenAccounts: kind === 'finalize' ? [...input.destinationTokenAccounts] : undefined,
    authorizedActor: () => input.settler,
    getBlockHeight: input.getBlockHeight,
  })
  const signatures: string[] = []
  if (input.needsEventInit) {
    if (input.mayContinue && !input.mayContinue()) return { ok: false, step: 'initialize-event', category: 'not-visible' }
    const opened = await run(deps('initialize-event'), noop)
    if (!opened.ok) return { ok: false, step: 'initialize-event', category: opened.category }
    signatures.push(opened.result.signature)
  }
  for (let attempt = 0; ; attempt += 1) {
    if (input.mayContinue && !input.mayContinue()) return { ok: false, step: 'finalize', category: 'not-visible' }
    const settled = await run(deps('finalize'), noop)
    if (settled.ok) { signatures.push(settled.result.signature); return { ok: true, signatures } }
    if (settled.category !== 'preparation' || attempt >= 3) return { ok: false, step: 'finalize', category: settled.category }
    await wait(2000)
  }
}
