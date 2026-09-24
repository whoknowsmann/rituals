import { describe, expect, it } from 'vitest'
import { Keypair } from '@solana/web3.js'
import { RITUAL_TEMPLATES, draftFromTemplate } from './templates'
import { validateRitualDraft } from './draftForm'
import { buildReviewViewModel } from './reviewViewModel'
import {
  draftFieldsOf,
  fundingLobbyNavigationParams,
  parseRitualFundingLobbyRoute,
  parseRitualRosterRoute,
  reviewNavigationParams,
  rosterNavigationParams,
} from './routeHelpers'

// Regression: on the Seeker every valid template reached Review as
// "This ritual link is invalid". Each screen re-validated the object the
// previous step produced, and those objects were not raw drafts (validated
// counts, a bigint stake, or an extra `members` key), so the strict parser
// failed closed. Unit tests fed hand-built drafts to each helper separately and
// never exercised the hand-offs. This walks the exact chain the screens run,
// through a JSON round trip, because react-navigation params must survive
// serialization.
const roundTrip = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe('Create → Review → Roster → Funding lobby param chain', () => {
  for (const template of RITUAL_TEMPLATES) {
    it(`carries the ${template.category} template through every screen`, () => {
      const draft = draftFromTemplate(template)

      // CreateRitualScreen
      const reviewParams = roundTrip(reviewNavigationParams(draft))

      // ReviewRitualScreen
      expect(buildReviewViewModel(reviewParams as unknown)).not.toBeNull()
      const rosterParams = roundTrip(rosterNavigationParams(reviewParams))

      // RitualRosterScreen
      const roster = parseRitualRosterRoute(rosterParams)
      expect(roster.ok).toBe(true)
      if (!roster.ok) return
      expect(() => JSON.stringify(roster.value)).not.toThrow()
      const members = Array.from({ length: Number(roster.value.memberCount) }, () => Keypair.generate().publicKey.toBase58())
      const lobbyParams = roundTrip(fundingLobbyNavigationParams(roster.value, members))

      // RitualFundingLobbyScreen
      const lobby = parseRitualFundingLobbyRoute(lobbyParams)
      expect(lobby.ok).toBe(true)
      if (!lobby.ok) return
      expect(validateRitualDraft(draftFieldsOf(lobby.value)).ok).toBe(true)
      const review = buildReviewViewModel(draftFieldsOf(lobby.value) as unknown)
      expect(review).not.toBeNull()
      expect(review?.title).toBe(draft.title)
      expect(lobby.value.members).toEqual(members)
    })
  }

  it('shows why projection is required: raw lobby params are not a draft', () => {
    const draft = draftFromTemplate(RITUAL_TEMPLATES[0])
    const members = [Keypair.generate(), Keypair.generate()].map((k) => k.publicKey.toBase58())
    const lobbyParams = fundingLobbyNavigationParams(draft, members)
    expect(validateRitualDraft(lobbyParams).ok).toBe(false)
    expect(validateRitualDraft(draftFieldsOf(lobbyParams)).ok).toBe(true)
  })
})
