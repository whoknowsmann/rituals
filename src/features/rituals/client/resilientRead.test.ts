import { describe, expect, it, vi } from 'vitest'
import { isTransientRpcError, withReadRetry } from './resilientRead'

const noSleep = async () => {}

describe('isTransientRpcError', () => {
  it.each([
    ['429 Too Many Requests', true],
    ['Server responded with 429', true],
    ['failed to get info about account: Minimum context slot has not been reached', true],
    ['{"code":-32016,"message":"Minimum context slot has not been reached"}', true],
    ['fetch failed', true],
    ['Network request failed', true],
    ['ECONNRESET', true],
    ['503 Service Unavailable', true],
    ['Invalid param: WrongSize', false],
    ['account not found', false],
  ])('%s -> %s', (message, expected) => {
    expect(isTransientRpcError(new Error(message))).toBe(expected)
  })

  it('recognises the JSON-RPC min-context-slot code on structured errors', () => {
    expect(isTransientRpcError({ code: -32016, message: 'x' })).toBe(true)
  })
})

describe('withReadRetry', () => {
  it('returns the first success without retrying', async () => {
    const read = vi.fn(async (n: number) => n * 2)
    const wrapped = withReadRetry(read, { sleep: noSleep })
    await expect(wrapped(21)).resolves.toBe(42)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('retries transient failures and then succeeds', async () => {
    let calls = 0
    const read = vi.fn(async () => {
      calls += 1
      if (calls < 3) throw new Error('Minimum context slot has not been reached')
      return 'ok'
    })
    const wrapped = withReadRetry(read, { sleep: noSleep })
    await expect(wrapped()).resolves.toBe('ok')
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('does not retry non-transient failures', async () => {
    const read = vi.fn(async () => { throw new Error('Invalid param: WrongSize') })
    const wrapped = withReadRetry(read, { sleep: noSleep })
    await expect(wrapped()).rejects.toThrow('WrongSize')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('gives up after the attempt budget and rethrows the last error', async () => {
    const read = vi.fn(async () => { throw new Error('429 Too Many Requests') })
    const wrapped = withReadRetry(read, { attempts: 4, sleep: noSleep })
    await expect(wrapped()).rejects.toThrow('429')
    expect(read).toHaveBeenCalledTimes(4)
  })

  it('passes arguments through unchanged on every attempt', async () => {
    const seen: unknown[][] = []
    let calls = 0
    const read = vi.fn(async (...args: unknown[]) => {
      seen.push(args)
      calls += 1
      if (calls === 1) throw new Error('fetch failed')
      return 'ok'
    })
    const wrapped = withReadRetry(read, { sleep: noSleep })
    const config = { commitment: 'confirmed', minContextSlot: 7 }
    await wrapped(['a'], config)
    expect(seen).toEqual([[['a'], config], [['a'], config]])
  })

  it('backs off with increasing delays', async () => {
    const delays: number[] = []
    const read = vi.fn(async () => { throw new Error('429') })
    const wrapped = withReadRetry(read, { attempts: 4, baseDelayMs: 100, sleep: async (ms) => { delays.push(ms) } })
    await expect(wrapped()).rejects.toThrow()
    expect(delays).toEqual([100, 200, 400])
  })
})
