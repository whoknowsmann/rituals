/**
 * "Get test tokens": asks the project's devnet faucet to send 0.05 devnet SOL
 * and 50 tSKR to the connected wallet in one faucet-paid transaction. The
 * wallet signs nothing. A judge installs, taps once, and can create a ritual.
 *
 * Fails open: whatever the faucet does, creating a ritual is never blocked by
 * it. Everything here is pure so it can be tested without the network; the
 * screen passes `fetch` in.
 */
export const DEVNET_FAUCET_URL = 'https://faucet.whoknowsman.com'

export type FaucetResult =
  | Readonly<{ kind: 'sent'; signature: string; confirmed: boolean; explorer: string | null }>
  | Readonly<{ kind: 'already-funded' }>
  | Readonly<{ kind: 'empty'; contact: string | null }>
  | Readonly<{ kind: 'disabled' }>
  | Readonly<{ kind: 'limited' }>
  | Readonly<{ kind: 'unreachable' }>

type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ status: number; json: () => Promise<unknown> }>

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 && value.length < 200 ? value : null)

/** One POST, bounded to ~30 s; every failure shape becomes a result, never a throw. */
export async function requestTestTokens(fetchImpl: FetchLike, address: string, url: string = DEVNET_FAUCET_URL): Promise<FaucetResult> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), 30_000) : null
  try {
    const response = await fetchImpl(`${url}/api/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ address }),
      signal: controller?.signal,
    })
    let body: Record<string, unknown> = {}
    try { const parsed = await response.json(); if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown> } catch { /* non-JSON: handled by status */ }
    return interpretFaucetResponse(response.status, body)
  } catch {
    return Object.freeze({ kind: 'unreachable' })
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function interpretFaucetResponse(status: number, body: Record<string, unknown>): FaucetResult {
  const error = text(body.error)
  if (status === 200 && text(body.signature)) {
    return Object.freeze({ kind: 'sent', signature: text(body.signature)!, confirmed: body.confirmed === true, explorer: text(body.explorer) })
  }
  if (status === 409 || error === 'ALREADY_FUNDED') return Object.freeze({ kind: 'already-funded' })
  if (error === 'EMPTY') return Object.freeze({ kind: 'empty', contact: text(body.contact) })
  if (error === 'DISABLED') return Object.freeze({ kind: 'disabled' })
  if (status === 429) return Object.freeze({ kind: 'limited' })
  return Object.freeze({ kind: 'unreachable' })
}

/** One short line for the screen. No jargon; the signature is behind "View". */
export function faucetLine(result: FaucetResult): string {
  switch (result.kind) {
    case 'sent': return result.confirmed ? 'Sent: 50 tSKR and 0.05 SOL.' : 'Checking whether it went through…'
    case 'already-funded': return 'The faucet reports this wallet is already funded.'
    case 'empty': return result.contact ? `The faucet is empty. Email ${result.contact} for tSKR.` : 'The faucet is empty right now.'
    case 'disabled': return 'The faucet is off right now.'
    case 'limited': return 'Too many requests from here. Try again in a few minutes.'
    case 'unreachable': return 'Could not confirm the faucet request. Check your balance before trying again.'
  }
}

/** "Already funded" can follow a send that landed after the last balance read: read it again too. */
export function balanceMayHaveChanged(result: FaucetResult): boolean {
  return result.kind === 'sent' || result.kind === 'already-funded' || result.kind === 'unreachable'
}
