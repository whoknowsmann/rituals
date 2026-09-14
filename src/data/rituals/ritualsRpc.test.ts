import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeProtocolConfig, decodeRitual } from './accounts'
import { accountVectors, hexToBytes, ACCOUNT_VECTOR_OWNER } from './__fixtures__/accountVectors'
import { claimPda, eventPda, protocolConfigPda, ritualPda } from './pdas'
import { createCurrentRitualsRpcReader, createRitualsRpcReader, RitualRpcError } from './ritualsRpc'

const programId = new PublicKey(ACCOUNT_VECTOR_OWNER)
const config = { owner: programId, data: hexToBytes(accountVectors.protocolConfig.hex), executable: false }
const configView = decodeProtocolConfig(config, programId)
const ritualBytes = hexToBytes(accountVectors.ritual.hex)
const ritualView = decodeRitual({ owner: programId, data: ritualBytes }, programId, configView.allowedStakeMint)
const [ritualAddress] = ritualPda(ritualView.creator, ritualView.nonce, programId)
const [protocolConfigAddress] = protocolConfigPda(programId)
const [eventAddress] = eventPda(ritualAddress, 0, programId)
const [claimAddress] = claimPda(eventAddress, new PublicKey(accountVectors.completionClaim.expected.claimant), 0, programId)
const event = { owner: programId, data: hexToBytes(accountVectors.ritualEvent.hex), executable: false }
const claim = { owner: programId, data: hexToBytes(accountVectors.completionClaim.hex), executable: false }

class FakeConnection {
  calls: Array<{ keys: string[]; config: unknown }> = []
  async getMultipleAccountsInfoAndContext(keys: PublicKey[], requestConfig: unknown) {
    this.calls.push({ keys: keys.map(key => key.toBase58()), config: requestConfig })
    const values = keys.map(key => {
      const address = key.toBase58()
      if (address === protocolConfigAddress.toBase58()) return config
      if (address === ritualAddress.toBase58()) return { owner: programId, data: ritualBytes, executable: false }
      if (address === eventAddress.toBase58()) return event
      if (address === claimAddress.toBase58()) return claim
      return null
    })
    return { context: { slot: 42 }, value: values }
  }
}

describe('confirmed read-only Rituals RPC reader', () => {
  it('reads the config, ritual, event, and claim using confirmed snapshots', async () => {
    const connection = new FakeConnection()
    const reader = createRitualsRpcReader(connection, programId)
    const protocol = await reader.getProtocolConfig({ minContextSlot: 40 })
    const ritual = await reader.getRitual(ritualAddress, { minContextSlot: 40 })
    const eventRead = await reader.getEvent(ritual, 0, { minContextSlot: 40 })
    const claimRead = await reader.getClaim(ritual, eventRead, new PublicKey(accountVectors.completionClaim.expected.claimant), { minContextSlot: 40 })
    expect(protocol.address.equals(protocolConfigAddress)).toBe(true)
    expect(ritual.address.equals(ritualAddress)).toBe(true)
    expect(eventRead.address.equals(eventAddress)).toBe(true)
    expect(claimRead.address.equals(claimAddress)).toBe(true)
    expect(connection.calls).toHaveLength(4)
    for (const call of connection.calls) expect(call.config).toEqual({ commitment: 'confirmed', minContextSlot: 40 })
    expect(Object.isFrozen(protocol)).toBe(true)
    expect(Object.isFrozen(ritual)).toBe(true)
    expect(Object.isFrozen(eventRead)).toBe(true)
    expect(Object.isFrozen(claimRead)).toBe(true)
  })

  it('rejects the current not-deployed configuration before touching the transport', () => {
    let called = false
    const connection = { getMultipleAccountsInfoAndContext: async () => { called = true; return { context: { slot: 1 }, value: [] } } }
    expect(() => createCurrentRitualsRpcReader(connection)).toThrowError(RitualRpcError)
    expect(() => createCurrentRitualsRpcReader(connection)).toThrowError(/deployment/)
    expect(called).toBe(false)
  })

  it('does not expose signing or transaction methods', () => {
    const reader = createRitualsRpcReader(new FakeConnection(), programId) as unknown as Record<string, unknown>
    expect(Object.keys(reader).some(key => /sign|send|transaction/i.test(key))).toBe(false)
  })
})
