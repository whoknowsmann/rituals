import type { StampFace } from './widgetModel'

/** Original rubber-stamp character. Shapes only: Android never needs an SVG font. */
export function stampFaceSvg(face: StampFace, ink: string, paper: string): string {
  const eyes = '<path d="M59 67v9 M101 67v9"/>'
  const expressions: Record<StampFace, string> = {
    calm: `${eyes}<path d="M63 97q17 13 34 0"/>`,
    'side-eye': '<path d="M48 59l24 5 M91 57l22-5 M52 76h19 M93 76h19 M69 103l24-5"/><path d="M66 74v8 M108 74v8"/>',
    alarmed: '<path d="M49 48l20-8 M94 40l20 8"/><ellipse cx="59" cy="70" rx="6" ry="11"/><ellipse cx="101" cy="70" rx="6" ry="11"/><ellipse cx="80" cy="104" rx="12" ry="15"/>',
    joyful: '<path d="M48 72q11-19 22 0 M91 72q11-19 22 0"/><path d="M53 91q27 43 54 0Z"/><path d="M63 100h34" stroke-width="4"/>',
    sad: '<path d="M48 64l22-8 M91 56l22 8 M59 74v5 M101 74v5 M65 105h30"/>',
    resting: '<path d="M49 71q10 9 20 0 M91 71q10 9 20 0 M70 100q10 6 20 0"/>',
    content: '<path d="M49 71q10-10 20 0 M91 71q10-10 20 0 M66 96q14 13 28 0"/>',
    expectant: `${eyes}<path d="M47 52l21-6 M93 46l20 6 M67 99q13 11 26 0"/><path d="M128 110l13-6 M139 104l4-13 M141 104l12-3"/>`,
    neutral: `${eyes}<path d="M68 100h24"/>`,
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
<g transform="rotate(-7 80 80)" stroke="${ink}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none">
<circle cx="80" cy="80" r="69" fill="${paper}"/>
<circle cx="80" cy="80" r="59" stroke-width="2.5"/>
<path d="M76 20h8 M76 140h8 M20 77v6 M140 77v6" stroke-width="3"/>
${expressions[face]}
</g></svg>`
}
