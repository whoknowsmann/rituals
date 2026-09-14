import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { decodeProtocolConfig, decodeRitual } from './accounts'
import { accountVectors, hexToBytes, ACCOUNT_VECTOR_OWNER } from './__fixtures__/accountVectors'
import { claimPda, eventPda, protocolConfigPda, ritualPda } from './pdas'
import { createRitualsRpcReader, type RitualRpcAccountInfo, type RitualRpcResponse } from './ritualsRpc'

const programId = new PublicKey(ACCOUNT_VECTOR_OWNER)
const configBytes = hexToBytes(accountVectors.protocolConfig.hex)
const ritualBytes = hexToBytes(accountVectors.ritual.hex)
const eventBytes = hexToBytes(accountVectors.ritualEvent.hex)
const config = { owner: programId, data: configBytes, executable: false }
const configView = decodeProtocolConfig(config, programId)
const ritualView = decodeRitual({ owner: programId, data: ritualBytes }, programId, configView.allowedStakeMint)
const [ritualAddress] = ritualPda(ritualView.creator, ritualView.nonce, programId)
const [configAddress] = protocolConfigPda(programId)
const key = (value: PublicKey) => value.toBase58()
const account = (data: Uint8Array) => ({ owner: programId, data, executable: false })
const copy = (data: Uint8Array) => new Uint8Array(data)
const putKey = (data: Uint8Array, offset: number, value: PublicKey) => data.set(value.toBytes(), offset)
const putU64 = (data: Uint8Array, offset: number, value: bigint) => new DataView(data.buffer, data.byteOffset, data.byteLength).setBigUint64(offset, value, true)

// These offsets are the serialized account layouts exercised by the decoders.
const ritualCurrentEventOffset = 441
const ritualSettledCountOffset = 442
const ritualFundedStakeOffset = 424
const ritualScheduleOffset = 265
const eventIndexOffset = 41
const eventWindowOffset = 42
const eventMemberCountOffset = 66
const eventStatusOffset = 67

// Anchor serializes the schedule vector before the scalar lifecycle fields. The
// fixture has two 24-byte windows; adding two windows shifts every later field
// by 48 bytes while preserving the fixed 909-byte allocation.
const ritualScheduleLengthOffset = 261
const ritualScheduleDataOffset = 265
const ritualScheduleWindowBytes = 24
const ritualScalarOffset = ritualScheduleDataOffset + 2 * ritualScheduleWindowBytes
const ritualUsedBytes = 477
const fourEventSchedule = [
  [100n, 200n, 300n],
  [400n, 500n, 600n],
  [700n, 800n, 900n],
  [1000n, 1100n, 1200n],
] as const

const putWindow = (data: Uint8Array, offset: number, window: readonly [bigint, bigint, bigint]) => {
  window.forEach((value, index) => putU64(data, offset + index * 8, value))
}

const fourEventActive = (eventIndex: number) => {
  if (!Number.isInteger(eventIndex) || eventIndex < 0 || eventIndex > 3) throw new Error('four-event active index must be 0..3')
  const data = new Uint8Array(ritualBytes.length)
  data.set(ritualBytes.slice(0, ritualScheduleLengthOffset))
  data[ritualScheduleLengthOffset] = 4
  fourEventSchedule.forEach((window, index) => putWindow(data, ritualScheduleDataOffset + index * ritualScheduleWindowBytes, window))
  data.set(ritualBytes.slice(ritualScalarOffset, ritualUsedBytes), ritualScalarOffset + 2 * ritualScheduleWindowBytes)

  // memberTotalStake remains 200; four events therefore require 50 per event.
  putU64(data, 253, 50n)
  const shifted = 2 * ritualScheduleWindowBytes
  const currentEventOffset = ritualCurrentEventOffset + shifted
  const settledCountOffset = ritualSettledCountOffset + shifted
  const fundedStakeOffset = ritualFundedStakeOffset + shifted
  const activatedAtOffset = 451 + shifted
  data[currentEventOffset] = eventIndex
  data[settledCountOffset] = eventIndex
  data[422 + shifted] = 7 // all three members funded
  data[423 + shifted] = 3
  putU64(data, fundedStakeOffset, BigInt(4 - eventIndex) * 50n * 3n)
  putU64(data, activatedAtOffset, 20n) // createdAt is 10; schedule opens at 100
  data.fill(0, ritualUsedBytes + shifted)
  return data
}

const activeRitual = (eventIndex: number, fundedStake: bigint) => {
  const data = copy(ritualBytes)
  data[ritualCurrentEventOffset] = eventIndex
  data[ritualSettledCountOffset] = eventIndex
  putU64(data, ritualFundedStakeOffset, fundedStake)
  return data
}

class ScriptedTransport {
  readonly calls: Array<{ keys: string[]; minContextSlot?: number }> = []
  private callIndex = 0
  constructor(private readonly script: (call: number, keys: PublicKey[]) => (RitualRpcAccountInfo | null)[]) {}
  async getMultipleAccountsInfoAndContext(keys: PublicKey[], request: { minContextSlot?: number }): Promise<RitualRpcResponse> {
    this.callIndex += 1
    this.calls.push({ keys: keys.map(key), minContextSlot: request.minContextSlot })
    const value = this.script(this.callIndex, keys)
    expect(value).toHaveLength(keys.length)
    return { context: { slot: this.callIndex + 9 }, value }
  }
}

const configFor = (data = configBytes) => account(data)
const ritualFor = (data = ritualBytes) => account(data)
const eventFor = (index: number) => {
  const data = copy(eventBytes)
  data[eventIndexOffset] = index
  data.set(ritualBytes.slice(ritualScheduleOffset + index * 24, ritualScheduleOffset + index * 24 + 24), eventWindowOffset)
  data[eventMemberCountOffset] = ritualView.members.length
  data[eventStatusOffset] = 0 // Scheduled
  data.fill(0, eventStatusOffset + 1, eventStatusOffset + 4) // claimed/confirmed/questioned bitmaps
  data[138] = eventPda(ritualAddress, index, programId)[1]
  return account(data)
}

describe('Ritual bundle retries and immutable snapshots', () => {
  it.each([
    ['authority', (data: Uint8Array) => putKey(data, 9, PublicKey.unique())],
    ['allowed stake mint', (data: Uint8Array) => putKey(data, 41, PublicKey.unique())],
    ['fee recipient', (data: Uint8Array) => putKey(data, 73, PublicKey.unique())],
    ['fee basis points', (data: Uint8Array) => new DataView(data.buffer).setUint16(105, 251, true)],
    ['minimum fee', (data: Uint8Array) => putU64(data, 107, 2n)],
    ['maximum fee', (data: Uint8Array) => putU64(data, 115, 1000n)],
    ['maximum member stake', (data: Uint8Array) => putU64(data, 123, 2n)],
    ['paused', (data: Uint8Array) => { data[133] = 1 }],
    ['bump', (data: Uint8Array) => { data[134] ^= 1 }],
  ])('rejects locally valid ProtocolConfig %s drift as canonical', async (_name, mutate) => {
    const changed = copy(configBytes); mutate(changed)
    const changedRitual = copy(ritualBytes)
    if (_name === 'allowed stake mint') changedRitual.set(changed.slice(41, 73), 113)
    const transport = new ScriptedTransport((call, keys) => keys.map(current => current.equals(configAddress) ? configFor(call === 1 ? configBytes : changed) : current.equals(ritualAddress) ? ritualFor(call === 1 ? ritualBytes : changedRitual) : null))
    const reader = createRitualsRpcReader(transport, programId)
    await expect(reader.getRitualBundle(ritualAddress)).rejects.toMatchObject({ category: 'canonical', message: 'Ritual immutable fields changed across bundle read' })
  })

  it.each([
    ['member order', (data: Uint8Array) => {
      const first = data.slice(149, 181); data.copyWithin(149, 181, 213); data.set(first, 181)
    }],
    ['rule digest', (data: Uint8Array) => { data[81] ^= 1 }],
  ])('rejects decoder-valid Ritual %s drift before claims', async (_name, mutate) => {
    const changed = copy(ritualBytes); mutate(changed)
    const transport = new ScriptedTransport((call, keys) => keys.map(current => current.equals(configAddress) ? configFor() : current.equals(ritualAddress) ? ritualFor(call === 1 ? ritualBytes : changed) : null))
    const reader = createRitualsRpcReader(transport, programId)
    await expect(reader.getRitualBundle(ritualAddress)).rejects.toMatchObject({ category: 'canonical', message: 'Ritual immutable fields changed across bundle read' })
  })

  it('exhausts three advancement attempts with decoder-valid four-event snapshots', async () => {
    const snapshots = [0, 1, 2, 3].map((index) => {
      const data = fourEventActive(index)
      const decoded = decodeRitual(account(data), programId, configView.allowedStakeMint, ritualAddress)
      expect(decoded.schedule).toHaveLength(4)
      expect(decoded.currentEventIndex).toBe(index)
      expect(decoded.fundedStakeTotal).toBe(BigInt(4 - index) * 50n * 3n)
      return data
    })
    const requestedIndices = [0, 1, 2]
    const transport = new ScriptedTransport((call, keys) => keys.map(current => {
      if (current.equals(configAddress)) return configFor()
      if (current.equals(ritualAddress)) return ritualFor(snapshots[Math.min(call - 1, 3)])
      return null
    }))
    const reader = createRitualsRpcReader(transport, programId)

    await expect(reader.getRitualBundle(ritualAddress)).rejects.toMatchObject({
      category: 'unstable',
      message: 'Ritual event advanced while reading bundle',
    })
    expect(transport.calls).toHaveLength(4)
    expect(transport.calls.map(call => call.minContextSlot)).toEqual([undefined, 10, 11, 12])
    expect(transport.calls.slice(1).map(call => call.keys[2])).toEqual(requestedIndices.map(index => key(eventPda(ritualAddress, index, programId)[0])))
  })

  it('refetches the advanced event and derives null claims from refetched members', async () => {
    const [event0] = eventPda(ritualAddress, 0, programId)
    const [event1] = eventPda(ritualAddress, 1, programId)

    const transport = new ScriptedTransport((call, keys) => keys.map(current => {
      if (current.equals(configAddress)) return configFor()
      if (current.equals(ritualAddress)) return ritualFor(call >= 2 ? activeRitual(1, 300n) : activeRitual(0, 600n))
      if (call === 2) return null
      if (current.equals(event1)) return eventFor(1)
      if (current.equals(event0)) return null
      return null
    }))
    const reader = createRitualsRpcReader(transport, programId)
    const result = await reader.getRitualBundle(ritualAddress)
    expect(result.event?.account.eventIndex).toBe(1)
    expect(result.claims.map(claim => key(claim.address))).toEqual(ritualView.members.map(member => key(claimPda(event1, member, 0, programId)[0])))
    expect(result.slot).toBe(12)
    expect(transport.calls.map(call => call.minContextSlot)).toEqual([undefined, 10, 11])
    expect(transport.calls[0].keys).toEqual([key(configAddress), key(ritualAddress)])
    expect(transport.calls[1].keys.slice(0, 3)).toEqual([key(configAddress), key(ritualAddress), key(event0)])
    expect(transport.calls[2].keys.slice(0, 3)).toEqual([key(configAddress), key(ritualAddress), key(event1)])
  })

  it('rejects backward event-index movement before requesting the regressed event', async () => {
    const [event1] = eventPda(ritualAddress, 1, programId)

    const transport = new ScriptedTransport((call, keys) => keys.map(current => {
      if (current.equals(configAddress)) return configFor()
      if (current.equals(ritualAddress)) return ritualFor(call === 1 ? activeRitual(1, 300n) : activeRitual(0, 600n))
      if (current.equals(event1)) return null
      return null
    }))
    const reader = createRitualsRpcReader(transport, programId)

    await expect(reader.getRitualBundle(ritualAddress)).rejects.toMatchObject({ category: 'canonical', message: 'Ritual lifecycle regressed across bundle read' })
    expect(transport.calls).toHaveLength(2)
    expect(transport.calls[1].keys.slice(0, 3)).toEqual([key(configAddress), key(ritualAddress), key(event1)])
  })

  it('rejects a backward event after one advancement attempt', async () => {
    const transport = new ScriptedTransport((call, keys) => keys.map(current => {
      if (current.equals(configAddress)) return configFor()
      if (current.equals(ritualAddress)) return ritualFor(activeRitual(call % 2 === 0 ? 1 : 0, call % 2 === 0 ? 300n : 600n))
      return null
    }))
    const reader = createRitualsRpcReader(transport, programId)
    await expect(reader.getRitualBundle(ritualAddress)).rejects.toMatchObject({ category: 'canonical', message: 'Ritual lifecycle regressed across bundle read' })
    expect(transport.calls).toHaveLength(3)
    expect(transport.calls.map(call => call.minContextSlot)).toEqual([undefined, 10, 11])
  })
})
