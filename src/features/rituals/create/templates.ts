export const RITUAL_TEMPLATES = Object.freeze([
  Object.freeze({ category: 'reading', label: 'Read together', title: 'A reading ritual', requirement: 'Read a few pages and share what stood out.' }),
  Object.freeze({ category: 'study', label: 'Study session', title: 'A study ritual', requirement: 'Complete a focused study session and check in.' }),
  Object.freeze({ category: 'music', label: 'Make some music', title: 'A music ritual', requirement: 'Practice, listen, or make music together.' }),
  Object.freeze({ category: 'family', label: 'Family check-in', title: 'A family ritual', requirement: 'Make time for a meaningful family check-in.' }),
  Object.freeze({ category: 'cooking', label: 'Cook together', title: 'A cooking ritual', requirement: 'Prepare a meal and share the moment.' }),
  Object.freeze({ category: 'movement', label: 'Move together', title: 'A movement ritual', requirement: 'Take time to move and report back.' }),
] as const)

export type RitualTemplate = (typeof RITUAL_TEMPLATES)[number]
export type RitualTemplateCategory = RitualTemplate['category']
