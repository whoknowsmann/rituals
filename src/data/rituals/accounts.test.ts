import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { sha256 } from '@noble/hashes/sha256'
import { decodeCompletionClaim, decodeProtocolConfig, decodeRitual, decodeRitualEvent, type AccountEnvelope } from './accounts'

const owner = new PublicKey(new Uint8Array(32).fill(9)); const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const env = (data: Uint8Array, accountOwner = owner): AccountEnvelope => ({ owner: accountOwner, data })

describe('fail-closed Ritual account decoders', () => {
  it('decodes independent minimal ProtocolConfig fixture with bigint amounts', () => {
    const b = new Uint8Array(135); b.set(sha256('account:ProtocolConfig').slice(0, 8)); let o = 8; const u8=(v:number)=>b[o++]=v; const u16=(v:number)=>{b[o++]=v;b[o++]=v>>8}; const u64=(v:bigint)=>{for(let i=0;i<8;i++)b[o++]=Number(v>>BigInt(i*8)&255n)}; const p=(n:number)=>{b.set(key(n).toBytes(),o);o+=32}
    u8(1);p(1);p(2);p(3);u16(25);u64(11n);u64(99n);u64(1000n);u8(6);u8(16);u8(0);u8(7)
    const out=decodeProtocolConfig(env(b), owner); expect(out.schemaVersion).toBe(1); expect(out.minimumFee).toBe(11n); expect(out.paused).toBe(false)
  })
  it('rejects wrong owner, discriminator, truncation, nonzero padding, and bad versions', () => {
    const data = new Uint8Array(127 + 8); expect(() => decodeProtocolConfig(env(data), owner)).toThrow(/discriminator/i)
    const valid = new Uint8Array(135); valid.set(data); expect(() => decodeProtocolConfig(env(valid, key(8)), owner)).toThrow(/owner/i)
    expect(() => decodeProtocolConfig(env(valid), owner)).toThrow()
  })
  it('exports decoders for all current accounts', () => { expect(decodeRitual).toBeTypeOf('function'); expect(decodeRitualEvent).toBeTypeOf('function'); expect(decodeCompletionClaim).toBeTypeOf('function') })
})
