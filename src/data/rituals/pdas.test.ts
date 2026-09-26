import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { VECTOR_PROGRAM_ID } from './__fixtures__/vectorProgramId'
import { claimPda, CURRENT_CLAIM_VERSION, eventPda, feeVaultPda, protocolConfigPda, ritualPda, seasonPda, stakeVaultPda } from './pdas'

const pk = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const expected = {
  protocol: ['6m5qUBdZjKwsrx1jJpR84SnUVQq8hYUhsDLR8wr9sFri', 255],
  ritual0: ['56qqYFSNL8DigDgJzzE69dACMkg8V6BM5soH2psZ31A', 254],
  ritual7: ['7gBbsqQ6kDrezFt6tiLESXxfHtjdE42uHCHGdxLRDLvW', 255],
  stake: ['EUfajH79J35Qf4MY1eCBFjnP3dSEeYnHKqGtVvHmE3Hh', 253],
  fee: ['4NxDFE9RyjB8ubghexEGLiqK8DiQnGA9DPd911EyXBLs', 252],
  event1: ['6NdFN2VzV61wi1bRYz6RATyjumBkhR7M6GfxtW47Nu7u', 255],
  event15: ['H9PGU7zHkDskgyMk2oM6RUzT86pDGkjz7oT9G76Cj84w', 255],
  claim: ['3diycyyrPajbEtpf8dkCNuZsPqHaVWZH7TNswGdqr2TJ', 253],
  season: ['12vZafX2HFmqzzam9cq3Znv1vnP19sPxfxF8VQC821Lj', 253],
} as const

describe('canonical Rituals PDAs', () => {
  it('matches independent cross-language vectors', () => {
    expect([protocolConfigPda(VECTOR_PROGRAM_ID)[0].toBase58(), protocolConfigPda(VECTOR_PROGRAM_ID)[1]]).toEqual(expected.protocol)
    const V = VECTOR_PROGRAM_ID
    expect([ritualPda(pk(1), 0n, V)[0].toBase58(), ritualPda(pk(1), 0n, V)[1]]).toEqual(expected.ritual0)
    const ritual = ritualPda(pk(1), 7n, V)[0]
    expect([ritual.toBase58(), ritualPda(pk(1), 7n, V)[1]]).toEqual(expected.ritual7)
    expect([stakeVaultPda(ritual, V)[0].toBase58(), stakeVaultPda(ritual, V)[1]]).toEqual(expected.stake)
    expect([feeVaultPda(ritual, V)[0].toBase58(), feeVaultPda(ritual, V)[1]]).toEqual(expected.fee)
    const event1 = eventPda(ritual, 1, V)
    expect([event1[0].toBase58(), event1[1]]).toEqual(expected.event1)
    expect([eventPda(ritual, 15, V)[0].toBase58(), eventPda(ritual, 15, V)[1]]).toEqual(expected.event15)
    expect([claimPda(event1[0], pk(2), CURRENT_CLAIM_VERSION, V)[0].toBase58(), claimPda(event1[0], pk(2), CURRENT_CLAIM_VERSION, V)[1]]).toEqual(expected.claim)
    expect([seasonPda(new Uint8Array(32).fill(41), V)[0].toBase58(), seasonPda(new Uint8Array(32).fill(41), V)[1]]).toEqual(expected.season)
  })

  it('rejects invalid bounds and types, including the retired claim version', () => {
    expect(() => ritualPda(pk(1), -1n)).toThrow(/nonce/i)
    expect(() => ritualPda(pk(1), 2n ** 64n)).toThrow(/nonce/i)
    expect(() => ritualPda(pk(1), 1 as never)).toThrow(/nonce/i)
    expect(() => eventPda(pk(1), 16)).toThrow(/event/i)
    expect(() => eventPda(pk(1), 1.2)).toThrow(/event/i)
    expect(() => claimPda(pk(1), pk(2), 1)).toThrow(/claim version/i)
    expect(() => protocolConfigPda('bad' as never)).toThrow(/PublicKey/i)
    expect(() => seasonPda(new Uint8Array(31))).toThrow(/seasonId/i)
  })
})
