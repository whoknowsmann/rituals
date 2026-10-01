export type SoloSuggestionLike = Readonly<{
  draft: Readonly<{
    title: string
    requirement: string
    eventCount: string | number
  }>
}>

/** A stable identity for a suggestion that survives card remounts. */
export function suggestionKey(suggestion: SoloSuggestionLike): string {
  return JSON.stringify([
    suggestion.draft.title,
    suggestion.draft.requirement,
    String(suggestion.draft.eventCount),
  ])
}

export function suggestionIsSelected(suggestion: SoloSuggestionLike, selectedKey: string | null): boolean {
  return selectedKey !== null && suggestionKey(suggestion) === selectedKey
}
