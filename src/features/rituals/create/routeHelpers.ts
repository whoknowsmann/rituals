import type { RootStackParamList } from '../../../navigators/AppNavigator'
import { validateRitualDraft, type RitualDraft } from './draftForm'

export function reviewNavigationParams(draft: RitualDraft): RootStackParamList['ReviewRitual'] {
  const result = validateRitualDraft(draft)
  if (!result.ok) throw new RangeError(Object.values(result.errors).join(' '))
  return { ...draft }
}

export function homeCreateTarget(): { readonly name: 'TemplatePicker' } {
  return { name: 'TemplatePicker' }
}
