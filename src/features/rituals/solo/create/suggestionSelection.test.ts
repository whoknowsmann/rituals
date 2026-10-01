import { describe, expect, it } from 'vitest'
import { suggestionKey, suggestionIsSelected } from './suggestionSelection'

const suggestion = (title: string, requirement: string, eventCount: string | number) => ({
  draft: { title, requirement, eventCount },
})

describe('solo suggestion selection', () => {
  it('uses title, requirement, and event count as a stable selection key', () => {
    const first = suggestion('Call Mom', 'Call every week.', '4')
    expect(suggestionKey(first)).toBe(suggestionKey(suggestion('Call Mom', 'Call every week.', 4)))
    expect(suggestionKey(first)).not.toBe(suggestionKey(suggestion('Call Mom', 'Call every week.', '6')))
    expect(suggestionKey(first)).not.toBe(suggestionKey(suggestion('Call Dad', 'Call every week.', '4')))
  })

  it('reports only the chosen suggestion as selected', () => {
    const first = suggestion('Call Mom', 'Call every week.', '4')
    const second = suggestion('Sunday dinner', 'Share a meal.', '4')
    const selected = suggestionKey(first)
    expect(suggestionIsSelected(first, selected)).toBe(true)
    expect(suggestionIsSelected(second, selected)).toBe(false)
    expect(suggestionIsSelected(first, null)).toBe(false)
  })
})
