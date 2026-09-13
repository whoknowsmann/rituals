import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { sha256 } from '@noble/hashes/sha256'
import { ACCOUNT_DATA_LENGTHS, ACCOUNT_DISCRIMINATORS, decodeCompletionClaim, decodeProtocolConfig, decodeRitual, decodeRitualEvent, type AccountEnvelope } from './accounts'
import { accountVectors, envelope, hexToBytes } from './__fixtures__/accountVectors'

const owner = new PublicKey(new Uint8Array(32).fill(9)); const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n))
const env = (data: Uint8Array, accountOwner = owner): AccountEnvelope => ({ owner: accountOwner, data })

describe('fail-closed Ritual account decoders', () => {
  it('keeps account discriminators and lengths deeply immutable', () => {
    expect(Object.isFrozen(ACCOUNT_DISCRIMINATORS)).toBe(true)
    for (const discriminator of Object.values(ACCOUNT_DISCRIMINATORS)) {
      expect(Object.isFrozen(discriminator)).toBe(true)
      expect(Reflect.set(discriminator, 0, 0)).toBe(false)
    }
    expect(Object.isFrozen(ACCOUNT_DATA_LENGTHS)).toBe(true)
  })
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
  it('decodes every field of all four independently serialized Anchor vectors', () => {
    const protocol = decodeProtocolConfig(envelope(accountVectors.protocolConfig.hex), new PublicKey('8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB'))
    expect(protocol).toEqual({ ...accountVectors.protocolConfig.expected, authority: new PublicKey(accountVectors.protocolConfig.expected.authority), allowedStakeMint: new PublicKey(accountVectors.protocolConfig.expected.allowedStakeMint), feeRecipient: new PublicKey(accountVectors.protocolConfig.expected.feeRecipient) })
    const ritual = decodeRitual(envelope(accountVectors.ritual.hex), new PublicKey('8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB'), new PublicKey(accountVectors.ritual.expected.stakeMint))
    expect(ritual).toMatchObject({ ...accountVectors.ritual.expected, protocolConfig: new PublicKey(accountVectors.ritual.expected.protocolConfig), creator: new PublicKey(accountVectors.ritual.expected.creator), stakeMint: new PublicKey(accountVectors.ritual.expected.stakeMint), lockedFeeRecipient: new PublicKey(accountVectors.ritual.expected.lockedFeeRecipient), stakeVault: new PublicKey(accountVectors.ritual.expected.stakeVault), feeVault: new PublicKey(accountVectors.ritual.expected.feeVault), ruleDigest: accountVectors.ritual.expected.ruleDigest, members: accountVectors.ritual.expected.members.map(member => new PublicKey(member)) })
    expect(ritual.schedule).toEqual(accountVectors.ritual.expected.schedule)
    const event = decodeRitualEvent(envelope(accountVectors.ritualEvent.hex), new PublicKey('8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB'))
    expect(event).toEqual({ ...accountVectors.ritualEvent.expected, ritual: new PublicKey(accountVectors.ritualEvent.expected.ritual) })
    const claim = decodeCompletionClaim(envelope(accountVectors.completionClaim.hex), new PublicKey('8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB'))
    expect(claim).toEqual({ ...accountVectors.completionClaim.expected, ritual: new PublicKey(accountVectors.completionClaim.expected.ritual), event: new PublicKey(accountVectors.completionClaim.expected.event), claimant: new PublicKey(accountVectors.completionClaim.expected.claimant) })
  })
})
