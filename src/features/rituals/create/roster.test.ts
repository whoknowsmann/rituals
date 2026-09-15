import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { buildFundingLobbyModel, validateMemberRoster } from './roster'
import { DEFAULT_RITUAL_DRAFT } from './draftForm'
import { fundingLobbyNavigationParams, parseRitualFundingLobbyRoute, parseRitualRosterRoute, rosterNavigationParams } from './routeHelpers'

const host = PublicKey.unique().toBase58()
const friend1 = PublicKey.unique().toBase58()
const friend2 = PublicKey.unique().toBase58()
const friend3 = PublicKey.unique().toBase58()
const friend4 = PublicKey.unique().toBase58()
const friend5 = PublicKey.unique().toBase58()

describe('member roster contract', () => {
  it('preserves host-first order and freezes valid N2 and N6 rosters', () => {
    const two = validateMemberRoster({ hostAddress: host, memberCount: 2, friendAddresses: [friend1] })
    expect(two).toEqual({ ok: true, value: Object.freeze([host, friend1]) })
    expect(Object.isFrozen(two.ok ? two.value : null)).toBe(true)
    const six = validateMemberRoster({ hostAddress: host, memberCount: 6, friendAddresses: [friend1, friend2, friend3, friend4, friend5] })
    expect(six.ok && six.value).toEqual([host, friend1, friend2, friend3, friend4, friend5])
  })

  it('reports exact friend count errors', () => {
    expect(validateMemberRoster({ hostAddress: host, memberCount: 3, friendAddresses: [friend1] })).toEqual(expect.objectContaining({ ok: false, errors: expect.objectContaining({ roster: expect.stringContaining('2') }) }))
    expect(validateMemberRoster({ hostAddress: host, memberCount: 2, friendAddresses: [friend1, friend2] })).toEqual(expect.objectContaining({ ok: false, errors: expect.objectContaining({ roster: expect.stringContaining('1') }) }))
  })

  it('rejects malformed, default, duplicate, and host-duplicate rows', () => {
    const result = validateMemberRoster({ hostAddress: host, memberCount: 5, friendAddresses: ['bad', PublicKey.default.toBase58(), friend1, friend1] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors)).toEqual(expect.arrayContaining(['friend0', 'friend1', 'friend3']))
    expect(validateMemberRoster({ hostAddress: 'bad', memberCount: 2, friendAddresses: [friend1] }).ok).toBe(false)
    expect(validateMemberRoster({ hostAddress: host, memberCount: 2, friendAddresses: [host] }).ok).toBe(false)
  })

  it('trims surrounding whitespace before requiring canonical base58', () => {
    const result = validateMemberRoster({ hostAddress: ` ${host} `, memberCount: 2, friendAddresses: [` ${friend1} `] })
    expect(result).toEqual({ ok: true, value: Object.freeze([host, friend1]) })
  })

  it('round-trips serializable roster and funding routes, and rejects unsafe payloads', () => {
    const draft = { ...DEFAULT_RITUAL_DRAFT, memberCount: '2' }
    const rosterRoute = rosterNavigationParams(draft)
    expect(rosterRoute).toEqual(draft)
    expect(parseRitualRosterRoute(JSON.parse(JSON.stringify(rosterRoute))).ok).toBe(true)
    const fundingRoute = fundingLobbyNavigationParams(draft, [host, friend1])
    expect(parseRitualFundingLobbyRoute(JSON.parse(JSON.stringify(fundingRoute)))).toEqual({ ok: true, value: fundingRoute })
    for (const bad of [
      { ...fundingRoute, members: ['bad', friend1] },
      { ...fundingRoute, members: [host] },
      { ...fundingRoute, members: [host, friend1, friend2] },
      { ...fundingRoute, members: [host, friend1], extra: true },
      { ...fundingRoute, members: Object.assign([], { 1: friend1, length: 2 }) },
      { ...fundingRoute, members: [host, friend1, friend1] },
    ]) expect(parseRitualFundingLobbyRoute(bad).ok).toBe(false)
  })

  it('builds an unfunded HOST/SPLIT lobby with exact progress and locked activation copy', () => {
    const model = buildFundingLobbyModel({ members: [host, friend1], memberTotalStake: '20', activationFee: '0.8', feePayerMode: 'SPLIT' })
    expect(model.rows).toEqual([
      { index: 0, address: host, role: 'Host', funding: 'Not funded' },
      { index: 1, address: friend1, role: 'Member', funding: 'Not funded' },
    ])
    expect(model.progress).toBe('0 of 2 funded')
    expect(model.activation).toBe('Activation locked until all members are funded')
    expect(model.stake).toBe('20 TEST per member')
    expect(model.fee).toContain('Split')
    expect(model.fee).toContain('0.8 TEST')
    expect(buildFundingLobbyModel({ members: [host, friend1], memberTotalStake: '20', activationFee: '0.8', feePayerMode: 'HOST' }).fee).toContain('Host pays')
  })
})
