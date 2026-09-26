import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PublicKey } from '@solana/web3.js'
import { fundingPeople, ritualDetailModel } from './crewView'

const a = new PublicKey('Da59UWdaoBej5xdX9atiaZahMYLxJNsdXHVY6GMh8VmV')
const b = new PublicKey('98W4zJfQDk9F5qjtLTgWTYBRdETT3JgUqY7dBNT9WjLa')
const account = (over: Record<string, unknown> = {}) => ({ status: 'Funding', members: [a, b], fundedMembersBitmap: 0b01, fundedMemberCount: 1, ...over }) as never

describe('fundingPeople (B6: people, not addresses)', () => {
  it('names the viewer "You", others by roster position, and marks who is in', () => {
    const rows = fundingPeople(account(), b)
    expect(rows.map((r) => r.name)).toEqual(['Host', 'You'])
    expect(rows.map((r) => r.status)).toEqual(['In', 'Not in yet'])
    expect(rows[0].short).toBe('Da59U…h8VmV')
  })
  it('uses "You" for the host when the host is viewing', () => {
    expect(fundingPeople(account(), a).map((r) => r.name)).toEqual(['You', 'Friend 2'])
  })
  it('works with no wallet connected', () => {
    expect(fundingPeople(account(), null).map((r) => r.name)).toEqual(['Host', 'Friend 2'])
  })
})

describe('ritualDetailModel (B4: no claim affordance while funding)', () => {
  it('Funding: shows progress and whether I still need to put in, never a claim', () => {
    const m = ritualDetailModel(account(), b)
    expect(m.showClaim).toBe(false)
    expect(m.kicker).toBe('Waiting for your crew')
    expect(m.progress).toBe('1 of 2 in')
    expect(m.myStakeNeeded).toBe(true)
    expect(ritualDetailModel(account(), a).myStakeNeeded).toBe(false)
  })
  it('Active: claim is available; kicker says so', () => {
    const m = ritualDetailModel(account({ status: 'Active', fundedMembersBitmap: 0b11, fundedMemberCount: 2 }), a)
    expect(m.showClaim).toBe(true)
    expect(m.myStakeNeeded).toBe(false)
    expect(m.kicker).toBe('Under way')
  })
  it('Completed/Cancelled: no claim, no stake prompt', () => {
    for (const status of ['Completed', 'Cancelled']) {
      const m = ritualDetailModel(account({ status }), b)
      expect(m.showClaim).toBe(false)
      expect(m.myStakeNeeded).toBe(false)
    }
  })
})

// Import lines are excluded: module names like `authoritativeRituals` are not user-facing copy.
const screen = (f: string) => readFileSync(resolve(__dirname, '../../screens', f), 'utf8').split('\n').filter((line) => !line.startsWith('import ')).join('\n')
const PLUMBING = [/AUTHORITATIVE/i, /Authoritative readback/, /Read the current Ritual before every action/, /Member \{index \+ 1\}/, /VERIFIED AGAINST ON-CHAIN DIGEST/, /from devnet/]

describe('B4 detail screen', () => {
  const s = screen('RitualDetailScreen.tsx')
  it('gates the claim button on the model, and shows funding people', () => {
    expect(s).toContain('<PeopleList')
    expect(s).toContain('ritualDetailModel(')
    expect(s).toContain('model.showClaim &&')
    expect(s).toContain('fundingPeople(')
  })
  it('has no plumbing copy', () => { for (const p of PLUMBING) expect(s).not.toMatch(p) })
})

describe('B5 join screen', () => {
  const s = screen('JoinRitualScreen.tsx')
  it('keeps the invite field to one line so the buttons stay above the fold', () => {
    expect(s).not.toMatch(/<TextInput[^>]*\bmultiline\b/)
    expect(s).toContain('numberOfLines={1}')
  })
  it('has no plumbing copy', () => { for (const p of PLUMBING) expect(s).not.toMatch(p) })
})

describe('B6 fund/action screen', () => {
  const s = screen('RitualActionScreen.tsx')
  it('shows people tiles instead of member numbers and addresses', () => {
    expect(s).toContain('fundingPeople(')
    expect(s).toContain('<PeopleList')
  })
  it('has no plumbing copy', () => { for (const p of PLUMBING) expect(s).not.toMatch(p) })
})
