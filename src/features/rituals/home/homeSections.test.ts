import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { soloAccount } from '../../../data/rituals/ejectTestHelpers'
import type { RitualAccountView } from '../../../data/rituals/accounts'
import type { RitualBundleRead } from '../../../data/rituals/ritualsRpc'
import { homeSections, homeTilePresentation } from './homeSections'

function ritual(id: string, overrides: Partial<RitualAccountView> = {}, stamped = false) {
  const account = soloAccount(overrides)
  // Only the fields this pure presentation mapper reads; no RPC or wallet.
  const bundle = { ritual: { account }, event: stamped ? { account: { status: 'Claiming', window: account.schedule[0] } } : null, claims: stamped ? [{ member: account.members[0], account: { status: 'Confirmed' } }] : [] } as unknown as RitualBundleRead
  return { id, bundle }
}

describe('Home active and Finished sections', () => {
  it('puts rituals needing a stamp first, retaining relative order and input identity', () => {
    const waiting = ritual('waiting', { schedule: [{ opens: 2000n, deadline: 2045n, resolution: 2055n }] })
    const open = ritual('open')
    const stamped = ritual('stamped', {}, true)
    const skipped = ritual('skipped', { skipDeclared: true, skipEventIndex: 0 })
    const another = ritual('another')
    const completed = ritual('completed', { status: 'Completed', currentEventIndex: 3 })
    const ended = ritual('ended', { status: 'Ended' })
    const input = [waiting, completed, stamped, open, skipped, ended, another]
    const sections = homeSections(input, 1010)
    expect(sections.active).toEqual([open, another, waiting, stamped, skipped])
    expect(sections.finished).toEqual([completed, ended])
    expect(input[0]).toBe(waiting)
    expect(homeTilePresentation(stamped.bundle, 1010).closingLine).toBe('Week closes in 46s')
  })

  it('prioritises an open later week even while the current week waits to settle', () => {
    const waiting = ritual('waiting', { schedule: [{ opens: 2000n, deadline: 2045n, resolution: 2055n }] })
    const needsLaterStamp = ritual('later')
    expect(homeSections([waiting, needsLaterStamp], 1070).active).toEqual([needsLaterStamp, waiting])
  })

  it('classifies Finished and Ended without a clock, and never promotes an ended ritual', () => {
    const ended = ritual('ended', { status: 'Ended' })
    const completed = ritual('completed', { status: 'Completed', currentEventIndex: 3 })
    const active = ritual('active')
    expect(homeSections([ended, active, completed], null)).toEqual({ active: [active], finished: [ended, completed] })
    expect(homeTilePresentation(ended.bundle, 1070).status).toEqual({ text: 'Ended', act: false })
    expect(homeTilePresentation(completed.bundle, null).status.text).toBe('Finished')
  })

  it('keeps nonterminal rituals visible and supports finished-only and empty homes', () => {
    const funding = ritual('funding', { status: 'Funding' })
    const cancelled = ritual('cancelled', { status: 'Cancelled' })
    const completed = ritual('completed', { status: 'Completed' })
    expect(homeSections([funding, cancelled], null).active).toEqual([funding, cancelled])
    expect(homeSections([completed], null)).toEqual({ active: [], finished: [completed] })
    expect(homeSections([], null)).toEqual({ active: [], finished: [] })
  })

  it('starts collapsed, toggles with an accessible chevron, keeps empty/create above Finished and mutes only finished tiles', () => {
    const screen = readFileSync(`${__dirname}/../../../screens/RitualsHomeScreen.tsx`, 'utf8')
    expect(screen).toContain('const [finishedExpanded, setFinishedExpanded] = useState(false)')
    expect(screen).toContain('setFinishedExpanded((expanded) => !expanded)')
    expect(screen).toContain('accessibilityState={{ expanded: finishedExpanded }}')
    expect(screen).toContain("finishedExpanded ? 'chevron-up' : 'chevron-down'")
    expect(screen).toContain('Finished · {finished.length}')
    expect(screen).toContain('active.length === 0')
    expect(screen).toContain('{finishedExpanded && <RitualGrid rituals={finished}')
    expect(screen).toContain('muted && styles.tileFinished')
    expect(screen).toContain('tileFinished: { opacity: 0.82 }')
    expect(screen.indexOf('<EmptySolo')).toBeLessThan(screen.indexOf('Finished · {finished.length}'))
    expect(screen.indexOf('rituals.map((ritual) => <RitualTile')).toBeLessThan(screen.indexOf('accessibilityLabel="Start another ritual"'))
  })
})
