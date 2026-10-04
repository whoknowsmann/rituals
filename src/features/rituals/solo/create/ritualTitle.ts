/**
 * The ritual's name as the user would say it, cleaned of sentence lead-ins:
 * "to read" → "Read", "I'll call mom." → "Call mom". The name is shown on its
 * own (tile, ritual screen, quoted on the signed card), never slotted into a
 * sentence, so any input still reads right (2026-10-04: "I'll show up for to
 * read every week").
 */
const LEAD_INS = [
  /^i\s+am\s+going\s+to\s+/i,
  /^i['’]m\s+going\s+to\s+/i,
  /^i\s+want\s+to\s+/i,
  /^i\s+will\s+/i,
  /^i['’]ll\s+/i,
  /^going\s+to\s+/i,
  /^to\s+/i,
]

export function cleanRitualTitle(input: string): string {
  let text = input.replace(/\s+/g, ' ').trim()
  for (let pass = 0; pass < 2; pass += 1) {
    for (const lead of LEAD_INS) text = text.replace(lead, '')
  }
  text = text.replace(/[.!]+$/, '').trim()
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}
