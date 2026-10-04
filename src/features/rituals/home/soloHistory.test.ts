import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { closedWeekCount, readSoloHistory } from './soloHistory'

const address = new PublicKey(new Uint8Array(32).fill(5)).toBase58()

describe('Home solo history (missed weeks used to show as ticks)', () => {
  it('reads every closed week of a solo ritual, none of a group ritual', () => {
    expect(closedWeekCount({ kind: 'Solo', status: 'Active', currentEventIndex: 2, schedule: [1, 2, 3, 4] })).toBe(2)
    expect(closedWeekCount({ kind: 'Solo', status: 'Completed', currentEventIndex: 3, schedule: [1, 2, 3, 4] })).toBe(4)
    expect(closedWeekCount({ kind: 'Group', status: 'Active', currentEventIndex: 2, schedule: [1, 2, 3, 4] })).toBe(0)
  })

  it('leaves out a week that fails to read instead of guessing', async () => {
    const client = { getEventBundle: async (_key: PublicKey, index: number) => { if (index === 1) throw new Error('rpc'); return { index } as never } }
    const history = await readSoloHistory(client, address, { kind: 'Solo', status: 'Completed', currentEventIndex: 3, schedule: [1, 2, 3] })
    expect(history).toEqual([{ index: 0 }, { index: 2 }])
  })
})
