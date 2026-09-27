import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PublicKey } from '@solana/web3.js'
import { claimShapeMatchesRitual } from './accounts'

const witness = new PublicKey('98W4zJfQDk9F5qjtLTgWTYBRdETT3JgUqY7dBNT9WjLa')
const witnessConfirmed = { status: 'Confirmed', requiredAdditionalConfirmations: 1, approvalsBitmap: 0, approvalCount: 1 } as const
const memberConfirmed = { status: 'Confirmed', requiredAdditionalConfirmations: 1, approvalsBitmap: 0b10, approvalCount: 1 } as const
const honor = { status: 'Confirmed', requiredAdditionalConfirmations: 0, approvalsBitmap: 0, approvalCount: 0 } as const

describe('claimShapeMatchesRitual: the bitmap-free witness confirmation is solo-only', () => {
  it('accepts it for a solo ritual with a witness', () => {
    expect(claimShapeMatchesRitual(witnessConfirmed, { kind: 'Solo', witness })).toBe(true)
  })
  it('rejects it for a group ritual (approvals must be member bits there)', () => {
    expect(claimShapeMatchesRitual(witnessConfirmed, { kind: 'Group', witness: null })).toBe(false)
  })
  it('rejects it for a solo honor ritual (no witness to have approved)', () => {
    expect(claimShapeMatchesRitual(witnessConfirmed, { kind: 'Solo', witness: null })).toBe(false)
  })
  it('leaves ordinary shapes alone', () => {
    expect(claimShapeMatchesRitual(memberConfirmed, { kind: 'Group', witness: null })).toBe(true)
    expect(claimShapeMatchesRitual(honor, { kind: 'Solo', witness: null })).toBe(true)
    expect(claimShapeMatchesRitual(honor, { kind: 'Group', witness: null })).toBe(true)
  })
})

describe('every RPC claim read enforces it', () => {
  const rpc = readFileSync(resolve(__dirname, 'ritualsRpc.ts'), 'utf8')
  it('is called at each decodeCompletionClaim site', () => {
    const decodes = rpc.split('decodeCompletionClaim(').length - 1
    const checks = rpc.split('claimShapeMatchesRitual(').length - 1
    expect(decodes).toBe(3)
    expect(checks).toBe(decodes)
  })
})
