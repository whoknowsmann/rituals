import { describe, expect, it, vi } from 'vitest'
import type { AccountInfo } from '@solana/web3.js'
import { readFileSync } from 'node:fs'
import { soloAccount, soloEvent, settledEvent, eventBytes, ejectProgramId, ejectRitualAddress, ejectKey } from '../../../data/rituals/ejectTestHelpers'
import type { RitualEventAccountView } from '../../../data/rituals/accounts'
import { readSoloWeekOutcomes, type SoloWeekOutcome } from './soloHistory'
import { tileMoneyLine } from './tileMoney'

const outcomes = (...values: SoloWeekOutcome[]) => new Map(values.map((value, index) => [index, value]))
const info = (event: RitualEventAccountView): AccountInfo<Buffer> => ({ owner: ejectProgramId, data: Buffer.from(eventBytes(event)), executable: false, lamports: 1, rentEpoch: 0 })

describe('Home money returned, not weekly allocation', () => {
  it('shows only the total while loading or when any closed result is missing', () => {
    const account = soloAccount({ currentEventIndex: 2 })
    expect(tileMoneyLine(account, undefined)).toBe('15 tSKR')
    expect(tileMoneyLine(account, outcomes('done'))).toBe('15 tSKR')
    expect(tileMoneyLine(account, new Map([[1, 'missed']]))).toBe('15 tSKR')
  })

  it('starts at zero and ignores the stamped but unsettled current week', async () => {
    const account = soloAccount()
    const getMany = vi.fn()
    const read = await readSoloWeekOutcomes(getMany, ejectProgramId, [{ address: ejectRitualAddress, account }])
    expect(getMany).not.toHaveBeenCalled()
    expect(tileMoneyLine(account, read.get(ejectRitualAddress.toBase58()))).toBe('0 of 15 tSKR back')
    expect(tileMoneyLine(account, outcomes('done'))).toBe('0 of 15 tSKR back')
  })

  it('counts settled kept and refunded skips, never misses or pending skips', () => {
    const account = soloAccount({ currentEventIndex: 2, skipDeclared: true, skipEventIndex: 2 })
    expect(tileMoneyLine(account, outcomes('done', 'missed'))).toBe('5 of 15 tSKR back')
    expect(tileMoneyLine(account, outcomes('done', 'skipped'))).toBe('10 of 15 tSKR back')
    expect(tileMoneyLine(soloAccount({ status: 'Completed', currentEventIndex: 3 }), outcomes('done', 'missed', 'skipped'))).toBe('10 of 15 tSKR back')
  })

  it('includes the eject refund and every kept/skipped week, excluding forfeits', () => {
    expect(tileMoneyLine(soloAccount({ status: 'Ended', currentEventIndex: 0 }), outcomes())).toBe('15 of 15 tSKR back')
    expect(tileMoneyLine(soloAccount({ status: 'Ended', currentEventIndex: 2 }), outcomes('missed', 'skipped'))).toBe('10 of 15 tSKR back')
    expect(tileMoneyLine(soloAccount({ status: 'Ended', currentEventIndex: 3 }), outcomes('done', 'skipped', 'missed'))).toBe('10 of 15 tSKR back')
    expect(tileMoneyLine(soloAccount({ status: 'Ended', currentEventIndex: 2 }), outcomes('done'))).toBe('15 tSKR')
  })

  it('uses formatAtomic amounts (2 decimals, trailing zeros dropped); never invents group returns', () => {
    const account = soloAccount({ perEventAllocation: 1_250_000n, currentEventIndex: 1 })
    expect(tileMoneyLine(account, outcomes('done'))).toBe('1.25 of 3.75 tSKR back')
    expect(tileMoneyLine({ ...account, kind: 'Group' }, outcomes('done'))).toBe('3.75 tSKR')
  })

  it('decodes actual settled bytes, including an eject receipt before resolution', async () => {
    const account = soloAccount({ status: 'Ended', currentEventIndex: 2, completedAt: 1110n })
    const getMany = vi.fn(async () => [info(settledEvent(0, 'missed', 1056n, 10_000_000n)), info(settledEvent(1, 'skipped', 1110n, 5_000_000n))])
    const read = await readSoloWeekOutcomes(getMany, ejectProgramId, [{ address: ejectRitualAddress, account }])
    expect(getMany).toHaveBeenCalledTimes(1)
    expect(read.get(ejectRitualAddress.toBase58())).toEqual(outcomes('missed', 'skipped'))
    expect(tileMoneyLine(account, read.get(ejectRitualAddress.toBase58()))).toBe('10 of 15 tSKR back')
  })

  it('leaves missing, unsettled, undecodable or mismatched receipts unknown', async () => {
    const account = soloAccount({ currentEventIndex: 1 })
    const kept = settledEvent(0, 'kept', 1056n, 10_000_000n)
    for (const raw of [null, info(soloEvent(0)), { ...info(kept), data: Buffer.alloc(0) }, info({ ...kept, ritual: ejectKey(47) }), info({ ...kept, eventPool: 1n, payoutTotal: 1n })]) {
      const read = await readSoloWeekOutcomes(async () => [raw], ejectProgramId, [{ address: ejectRitualAddress, account }])
      expect(tileMoneyLine(account, read.get(ejectRitualAddress.toBase58()))).toBe('15 tSKR')
    }
    await expect(readSoloWeekOutcomes(async () => { throw new Error('offline') }, ejectProgramId, [{ address: ejectRitualAddress, account }])).rejects.toThrow('offline')
  })

  it('uses the same money line for the tile and accessibility, drops the kept-count line, and clears old outcomes on reload', () => {
    const screen = readFileSync(`${__dirname}/../../../screens/RitualsHomeScreen.tsx`, 'utf8')
    expect(screen).toContain('const moneyLine = tileMoneyLine(account, outcomes)')
    expect(screen).toContain('${moneyLine}.`}')
    expect(screen).toContain('>{moneyLine}</Text>')
    expect(screen).toContain('summary={closingLine !== null}')
    expect(screen).toContain('setOutcomes(new Map())')
    expect(screen).not.toContain(' / wk')
    expect(screen).not.toContain(' a week.')
  })
})
