import type { RootStackParamList } from '../../../navigators/AppNavigator'
import { validateRitualDraft, type RitualDraft } from './draftForm'
import { validateMemberRoster } from './roster'

export function reviewNavigationParams(draft: RitualDraft): RootStackParamList['ReviewRitual'] {
  const result = validateRitualDraft(draft)
  if (!result.ok) throw new RangeError(Object.values(result.errors).join(' '))
  return { ...draft }
}

export function homeCreateTarget(): { readonly name: 'TemplatePicker' } {
  return { name: 'TemplatePicker' }
}

export function reviewCompleteTarget(): { readonly name: 'RitualsHome' } {
  return { name: 'RitualsHome' }
}

export function rosterNavigationParams(draft: RitualDraft): RootStackParamList['RitualRoster'] {
  const result = validateRitualDraft(draft)
  if (!result.ok) throw new RangeError(Object.values(result.errors).join(' '))
  return { ...draft }
}

export function fundingLobbyNavigationParams(draft: RitualDraft, members: readonly string[]): RootStackParamList['RitualFundingLobby'] {
  const result = validateRitualDraft(draft)
  if (!result.ok) throw new RangeError(Object.values(result.errors).join(' '))
  const roster = validateMemberRoster({ hostAddress: members[0], memberCount: result.value.memberCount, friendAddresses: members.slice(1) })
  if (!roster.ok) throw new RangeError(Object.values(roster.errors).join(' '))
  return { ...draft, members: [...roster.value] }
}

export type SafeRouteResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: string }>

export function parseRitualRosterRoute(value: unknown): SafeRouteResult<RootStackParamList['RitualRoster']> {
  const result = validateRitualDraft(value)
  return result.ok ? { ok: true, value: { ...result.value, memberCount: String(result.value.memberCount), eventCount: String(result.value.eventCount), memberTotalStake: result.value.memberTotalStake } } : { ok: false, error: 'This ritual draft is invalid.' }
}

export function parseRitualFundingLobbyRoute(value: unknown): SafeRouteResult<RootStackParamList['RitualFundingLobby']> {
  try {
    if (value === null || typeof value !== 'object' || !Array.isArray((value as { members?: unknown }).members)) return { ok: false, error: 'This funding lobby link is invalid.' }
    const { members, ...draft } = value as { members: unknown; [key: string]: unknown }
    const parsed = validateRitualDraft(draft)
    if (!parsed.ok || !Array.isArray(members)) return { ok: false, error: 'This funding lobby link is invalid.' }
    const roster = validateMemberRoster({ hostAddress: members[0], memberCount: parsed.value.memberCount, friendAddresses: members.slice(1) })
    if (!roster.ok) return { ok: false, error: 'This funding lobby link is invalid.' }
    return {
      ok: true,
      value: {
        title: parsed.value.title,
        requirement: parsed.value.requirement,
        memberCount: String(parsed.value.memberCount),
        eventCount: String(parsed.value.eventCount),
        memberTotalStake: parsed.value.memberTotalStake,
        confirmationMode: parsed.value.confirmationMode,
        feePayerMode: parsed.value.feePayerMode,
        members: [...roster.value],
      },
    }
  } catch { return { ok: false, error: 'This funding lobby link is invalid.' } }
}
