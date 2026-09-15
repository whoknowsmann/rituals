import { describe, expect, it, vi } from 'vitest'
import {
  CombinedSubmitter,
  InvalidSubmittedActionError,
  SplitSubmitter,
  type PreparedAction,
  type ProgressEvent,
  type Wallet,
} from './progressBoundary'

const prepared: PreparedAction = Object.freeze({
  message: 'ritual:create:nonce-7',
  custody: Object.freeze({ ritual: 'ritual-7', amount: 100n }),
})

function walletFor(events: string[] = []): Wallet {
  return {
    signAndSend: vi.fn(async (action) => {
      events.push(`wallet:${action.message}`)
      return { signature: 'sig-7' }
    }),
  }
}

function validator(message: string, signature: string): boolean {
  return message === prepared.message && signature === 'sig-7'
}

function confirm(events: string[] = [], failure?: Error) {
  return vi.fn(async (signature: string) => {
    events.push(`confirm:${signature}`)
    if (failure) throw failure
    return { signature, slot: 42, ritual: 'ritual-7' }
  })
}

describe('Ritual submission progress boundary comparison', () => {
  it('split design signs once and validates before exposing submitted', async () => {
    const events: string[] = []
    const progress: ProgressEvent[] = []
    const submitter = new SplitSubmitter(walletFor(events), validator, confirm(events))

    const handle = await submitter.submit(prepared, event => { progress.push(event) })

    expect(events).toEqual(['wallet:ritual:create:nonce-7'])
    expect(progress.map(event => event.phase)).toEqual(['wallet', 'submitted'])
    expect(handle.signature).toBe('sig-7')
  })

  it('combined observer sees submitted before confirming', async () => {
    const phases: string[] = []
    const submitter = new CombinedSubmitter(walletFor(), validator, confirm())

    const result = await submitter.submitAndConfirm(prepared, event => { phases.push(event.phase) })

    expect(phases).toEqual(['wallet', 'submitted', 'confirming', 'confirmed'])
    expect(result.ritual).toBe('ritual-7')
  })

  it('split confirmation rejects a structurally forged plain object', async () => {
    const submitter = new SplitSubmitter(walletFor(), validator, confirm())
    await submitter.submit(prepared)

    await expect(submitter.confirm({ signature: 'sig-7' } as unknown as never)).rejects.toBeInstanceOf(InvalidSubmittedActionError)
  })

  it('duplicate confirmation shares one promise and never confirms twice', async () => {
    let release!: (value: { signature: string; slot: number; ritual: string }) => void
    const confirmation = vi.fn(() => new Promise<{ signature: string; slot: number; ritual: string }>(resolve => { release = resolve }))
    const submitter = new SplitSubmitter(walletFor(), validator, confirmation)
    const handle = await submitter.submit(prepared)

    const first = submitter.confirm(handle)
    const second = submitter.confirm(handle)
    expect(first).toBe(second)
    await Promise.resolve()
    expect(confirmation).toHaveBeenCalledTimes(1)
    release({ signature: 'sig-7', slot: 42, ritual: 'ritual-7' })
    await expect(first).resolves.toMatchObject({ signature: 'sig-7' })
  })

  it('confirmation errors emit error and never confirmed', async () => {
    const phases: string[] = []
    const submitter = new CombinedSubmitter(walletFor(), validator, confirm([], new Error('expired')))

    await expect(submitter.submitAndConfirm(prepared, event => { phases.push(event.phase) })).rejects.toThrow('expired')
    expect(phases).toEqual(['wallet', 'submitted', 'confirming', 'error'])
    expect(phases).not.toContain('confirmed')
  })

  it('observer cannot mutate custody-bearing prepared data', async () => {
    let observed: ProgressEvent | undefined
    const submitter = new CombinedSubmitter(walletFor(), validator, confirm())
    await submitter.submitAndConfirm(prepared, event => {
      observed = event
      expect(() => ((event as { phase: string }).phase = 'confirmed')).toThrow()
      expect(() => ((event as { signature?: string }).signature = 'forged')).toThrow()
    })

    expect(prepared.custody).toEqual({ ritual: 'ritual-7', amount: 100n })
    expect(observed?.signature).toBe('sig-7')
  })

  it('observer exceptions do not alter custody or interrupt the operation', async () => {
    const onProgress = vi.fn(() => { throw new Error('component callback failed') })
    const submitter = new CombinedSubmitter(walletFor(), validator, confirm())

    await expect(submitter.submitAndConfirm(prepared, onProgress)).resolves.toMatchObject({ ritual: 'ritual-7' })
    expect(onProgress).toHaveBeenCalledTimes(4)
  })

  it('unmounted components can unsubscribe without affecting confirmation', async () => {
    const phases: string[] = []
    const submitter = new SplitSubmitter(walletFor(), validator, confirm())
    const unsubscribe = submitter.subscribe(event => { phases.push(event.phase) })
    unsubscribe()

    const handle = await submitter.submit(prepared)
    await submitter.confirm(handle)
    expect(phases).toEqual([])
  })

  it('combined compatibility API composes split submit and confirm primitives', async () => {
    const wallet = walletFor()
    const confirmation = confirm()
    const split = new SplitSubmitter(wallet, validator, confirmation)
    const combined = new CombinedSubmitter(wallet, validator, confirmation, split)

    await combined.submitAndConfirm(prepared)
    expect(wallet.signAndSend).toHaveBeenCalledTimes(1)
    expect(confirmation).toHaveBeenCalledTimes(1)
  })

  it('invalid signatures never produce submitted progress', async () => {
    const phases: string[] = []
    const submitter = new CombinedSubmitter(walletFor(), () => false, confirm())

    await expect(submitter.submitAndConfirm(prepared, event => { phases.push(event.phase) })).rejects.toThrow(/signature/i)
    expect(phases).toEqual(['wallet', 'error'])
  })
})
