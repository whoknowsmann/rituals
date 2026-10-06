import { describe, expect, it } from 'vitest'
import { faucetLine, interpretFaucetResponse, requestTestTokens } from './devnetFaucet'

const fakeFetch = (status: number, body: unknown) => async () => ({ status, json: async () => body })

describe('devnet faucet client', () => {
  it('reads a successful claim', async () => {
    const result = await requestTestTokens(fakeFetch(200, { signature: 'sig123', confirmed: true, explorer: 'https://explorer.solana.com/tx/sig123?cluster=devnet' }), 'Da59UWdaoBej5xdX9atiaZahMYLxJNsdXHVY6GMh8VmV')
    expect(result).toEqual({ kind: 'sent', signature: 'sig123', confirmed: true, explorer: 'https://explorer.solana.com/tx/sig123?cluster=devnet' })
    expect(faucetLine(result)).toBe('Sent: 50 tSKR and 0.05 SOL.')
  })
  it('maps every documented failure to a line and never throws', async () => {
    expect(interpretFaucetResponse(409, { error: 'ALREADY_FUNDED', sol: '0.2', test: '93.8' }).kind).toBe('already-funded')
    expect(interpretFaucetResponse(503, { error: 'EMPTY', contact: 'jack@example.com' })).toEqual({ kind: 'empty', contact: 'jack@example.com' })
    expect(interpretFaucetResponse(503, { error: 'DISABLED' }).kind).toBe('disabled')
    expect(interpretFaucetResponse(429, { error: 'IP_LIMIT' }).kind).toBe('limited')
    expect(interpretFaucetResponse(502, { error: 'SEND_FAILED' }).kind).toBe('unreachable')
    expect(interpretFaucetResponse(200, { nonsense: true }).kind).toBe('unreachable')
    const down = await requestTestTokens(async () => { throw new Error('network') }, 'Da59UWdaoBej5xdX9atiaZahMYLxJNsdXHVY6GMh8VmV')
    expect(down.kind).toBe('unreachable')
    expect(faucetLine(down)).toMatch(/Could not reach/)
  })
  it('posts the address as JSON to /api/claim', async () => {
    let seen: { url: string; body: string } | null = null
    await requestTestTokens(async (url, init) => { seen = { url, body: init.body }; return { status: 200, json: async () => ({ signature: 's' }) } }, 'addr', 'https://faucet.example')
    expect(seen).toEqual({ url: 'https://faucet.example/api/claim', body: '{"address":"addr"}' })
  })
})
