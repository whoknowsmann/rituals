import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'
import { claimPda, eventPda, feeVaultPda, protocolConfigPda, ritualPda, stakeVaultPda } from './pdas'

const pk = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
describe('canonical Rituals PDAs', () => {
  it('derives every PDA with the Rust seed order and encodings', () => {
    expect(protocolConfigPda(LOCAL_PLACEHOLDER_PROGRAM_ID)).toEqual(PublicKey.findProgramAddressSync([Buffer.from('protocol-config')], LOCAL_PLACEHOLDER_PROGRAM_ID))
    expect(ritualPda(pk(1), 0n, LOCAL_PLACEHOLDER_PROGRAM_ID)).toEqual(PublicKey.findProgramAddressSync([Buffer.from('ritual'), pk(1).toBytes(), Buffer.alloc(8)], LOCAL_PLACEHOLDER_PROGRAM_ID))
    const ritual = ritualPda(pk(1), 7n, LOCAL_PLACEHOLDER_PROGRAM_ID)[0]
    expect(stakeVaultPda(ritual, LOCAL_PLACEHOLDER_PROGRAM_ID)).toEqual(PublicKey.findProgramAddressSync([Buffer.from('stake-vault'), ritual.toBytes()], LOCAL_PLACEHOLDER_PROGRAM_ID))
    expect(feeVaultPda(ritual, LOCAL_PLACEHOLDER_PROGRAM_ID)).toEqual(PublicKey.findProgramAddressSync([Buffer.from('fee-vault'), ritual.toBytes()], LOCAL_PLACEHOLDER_PROGRAM_ID))
    expect(eventPda(ritual, 15, LOCAL_PLACEHOLDER_PROGRAM_ID)).toEqual(PublicKey.findProgramAddressSync([Buffer.from('event'), ritual.toBytes(), Buffer.from([15])], LOCAL_PLACEHOLDER_PROGRAM_ID))
    expect(claimPda(eventPda(ritual, 1, LOCAL_PLACEHOLDER_PROGRAM_ID)[0], pk(2), 1, LOCAL_PLACEHOLDER_PROGRAM_ID)).toEqual(PublicKey.findProgramAddressSync([Buffer.from('claim'), eventPda(ritual, 1, LOCAL_PLACEHOLDER_PROGRAM_ID)[0].toBytes(), pk(2).toBytes(), Buffer.from([1])], LOCAL_PLACEHOLDER_PROGRAM_ID))
  })
  it('rejects invalid bounds and non-PublicKey inputs', () => {
    expect(() => ritualPda(pk(1), -1n)).toThrow(/nonce/i); expect(() => ritualPda(pk(1), 2n ** 64n)).toThrow(/nonce/i)
    expect(() => eventPda(pk(1), 16)).toThrow(/event/i); expect(() => claimPda(pk(1), pk(2), 0)).toThrow(/version/i)
    expect(() => protocolConfigPda('bad' as never)).toThrow(/PublicKey/i)
  })
})
