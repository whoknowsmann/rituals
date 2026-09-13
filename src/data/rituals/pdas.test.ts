import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'
import { claimPda, CURRENT_CLAIM_VERSION, eventPda, feeVaultPda, protocolConfigPda, ritualPda, stakeVaultPda } from './pdas'

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
} as const

describe('canonical Rituals PDAs', () => {
  it('matches independent cross-language vectors', () => {
    expect([protocolConfigPda(LOCAL_PLACEHOLDER_PROGRAM_ID)[0].toBase58(), protocolConfigPda(LOCAL_PLACEHOLDER_PROGRAM_ID)[1]]).toEqual(expected.protocol)
    expect([ritualPda(pk(1), 0n)[0].toBase58(), ritualPda(pk(1), 0n)[1]]).toEqual(expected.ritual0)
    const ritual = ritualPda(pk(1), 7n)[0]
    expect([ritual.toBase58(), ritualPda(pk(1), 7n)[1]]).toEqual(expected.ritual7)
    expect([stakeVaultPda(ritual)[0].toBase58(), stakeVaultPda(ritual)[1]]).toEqual(expected.stake)
    expect([feeVaultPda(ritual)[0].toBase58(), feeVaultPda(ritual)[1]]).toEqual(expected.fee)
    const event1 = eventPda(ritual, 1)
    expect([event1[0].toBase58(), event1[1]]).toEqual(expected.event1)
    expect([eventPda(ritual, 15)[0].toBase58(), eventPda(ritual, 15)[1]]).toEqual(expected.event15)
    expect([claimPda(event1[0], pk(2), CURRENT_CLAIM_VERSION)[0].toBase58(), claimPda(event1[0], pk(2), CURRENT_CLAIM_VERSION)[1]]).toEqual(expected.claim)
  })

  it('rejects invalid bounds and types, including the retired claim version', () => {
    expect(() => ritualPda(pk(1), -1n)).toThrow(/nonce/i)
    expect(() => ritualPda(pk(1), 2n ** 64n)).toThrow(/nonce/i)
    expect(() => ritualPda(pk(1), 1 as never)).toThrow(/nonce/i)
    expect(() => eventPda(pk(1), 16)).toThrow(/event/i)
    expect(() => eventPda(pk(1), 1.2)).toThrow(/event/i)
    expect(() => claimPda(pk(1), pk(2), 1)).toThrow(/claim version/i)
    expect(() => protocolConfigPda('bad' as never)).toThrow(/PublicKey/i)
  })
})
