import React from 'react'
import { describe, expect, it, vi } from 'vitest'

// Use 0.16.1's actual JS converters/serializer, not invented React Native views.
// Only the public barrel (which loads the native module) is replaced.
vi.mock('react-native-android-widget', () => ({
  ...require('react-native-android-widget/lib/commonjs/widgets/FlexWidget'),
  ...require('react-native-android-widget/lib/commonjs/widgets/TextWidget'),
}))
import { RitualWidget, widgetDotMetrics, widgetDotStyle } from './RitualWidget'
import { widgetModelFromSnapshot, type WidgetModel } from './widgetModel'

type Tree = { type: string; props: Record<string, any>; children: Tree[] }
const { buildWidgetTree } = require('react-native-android-widget/lib/commonjs/api/build-widget-tree') as { buildWidgetTree: (element: React.JSX.Element) => Tree }
const model: WidgetModel = { title: 'Read a chapter with a deliberately long ritual name', stakeLabel: '5 TEST / WK', cells: ['done', 'missed', 'now', 'future'], countLine: '1 of 4 kept', pill: { text: 'Stamp this week', act: true }, tint: '#13917A' }
const flatten = (tree: Tree): Tree[] => [tree, ...tree.children.flatMap(flatten)]
const render = (value = model, width = 160) => buildWidgetTree(<RitualWidget model={value} width={width} />)

describe('Home tile widget native tree', () => {
  it('groups label/name at the top and dots/count/pill at the bottom; keeps OPEN_APP', () => {
    const tree = render()
    expect(tree.props).toMatchObject({ width: 'match_parent', height: 'match_parent', backgroundColor: '#13917A', padding: { top: 14, bottom: 14, left: 14, right: 14 } })
    expect(tree.children).toHaveLength(2)
    const [head, foot] = tree.children
    expect(head.props).toMatchObject({ height: 0, weight: 1 })
    expect(foot.props.weight).toBeUndefined()
    expect(flatten(head).filter((node) => node.type === 'TextWidget').map((node) => node.props.text)).toEqual([model.stakeLabel, model.title])
    expect(foot.children).toHaveLength(3)
    expect(foot.children[0].children).toHaveLength(4)
    expect(foot.children[1].props.text).toBe('1 of 4 kept')
    expect(foot.children[2].props).toMatchObject({ text: 'Stamp this week', backgroundColor: '#C8F560', color: '#223008', maxLines: 1, truncate: 'END' })
    expect(JSON.stringify(tree.props)).toContain('OPEN_APP')
  })
  it('uses Fraunces 900, Figtree 600/400, paper text, and two-line name truncation', () => {
    const text = flatten(render()).filter((node) => node.type === 'TextWidget')
    expect(text[0].props).toMatchObject({ fontFamily: 'Figtree_600SemiBold', fontWeight: '600', letterSpacing: 1, color: '#BFFFFDF8', maxLines: 1 })
    expect(text[1].props).toMatchObject({ fontFamily: 'Fraunces_900Black', fontWeight: '900', fontSize: 22, color: '#FFFDF8', maxLines: 2, truncate: 'END', textAlign: 'left' })
    expect(text[2].props.fontFamily).toBe('Figtree_400Regular')
    expect(text[3].props.fontFamily).toBe('Figtree_600SemiBold')
    expect(text.map((node) => node.props.text).join(' ')).not.toMatch(/verdict|Week \d of/)
  })
  it('keeps non-action status unchanged on translucent white, never receipt copy', () => {
    const tree = render({ ...model, pill: { text: 'Finished', act: false } })
    expect(tree.children[1].children[2].props).toMatchObject({ text: 'Finished', backgroundColor: '#33FFFFFF', color: '#FFFDF8' })
  })
  it('has no label, dots, or counts in the empty state, only name and Open Rituals', () => {
    const tree = render(widgetModelFromSnapshot(null, 0))
    expect(flatten(tree).filter((node) => node.type === 'TextWidget').map((node) => node.props.text)).toEqual(['Start a ritual?', 'Open Rituals'])
    expect(tree.children[1].children[0].props.backgroundColor).toBe('#C8F560')
  })
  it('distinguishes done/missed/closed/now/future without inventing outcomes', () => {
    expect(widgetDotStyle('done', 10)).toMatchObject({ backgroundColor: '#FFFDF8', borderColor: '#FFFDF8' })
    expect(widgetDotStyle('missed', 10)).toMatchObject({ backgroundColor: '#1D1A16' })
    expect(widgetDotStyle('closed', 10)).toEqual(widgetDotStyle('missed', 10))
    expect(widgetDotStyle('now', 10)).toMatchObject({ backgroundColor: '#00000000', borderWidth: 2, borderColor: '#FFFDF8' })
    expect(widgetDotStyle('future', 10)).toMatchObject({ backgroundColor: '#00000000', borderWidth: 1, borderColor: '#FFFDF859' })
  })
  it.each([110, 160, 180, 230])('fits all 1–16 dots in a single row at width %i', (width) => {
    for (let count = 1; count <= 16; count++) {
      const { size, gap } = widgetDotMetrics(width, count)
      expect(size * count + gap * (count - 1)).toBeLessThanOrEqual(width - 28 + 0.0001)
      expect(size).toBeGreaterThanOrEqual(2)
      for (const density of [1, 1.5, 2, 2.625, 2.75, 3, 3.5, 4]) {
        const pixels = Math.round(size * density) * count + Math.round(gap * density) * (count - 1)
        expect(pixels).toBeLessThanOrEqual(Math.round(width * density) - 2 * Math.round(14 * density))
      }
      const tree = render({ ...model, cells: Array(count).fill('future') }, width)
      expect(tree.children[1].children[0].children).toHaveLength(count)
    }
  })
  it('uses all parent height at 2x2 or 2x3, with only the top header weighted', () => {
    // Native measurement is device-only. The serialized constraints intentionally
    // have no fixed root height or middle-aligned content when a host stretches it.
    const tree = render()
    expect(tree.props.height).toBe('match_parent')
    expect(tree.children.map((child) => child.props.weight ?? 0)).toEqual([1, 0])
    expect(tree.children[0].children[1].children[0].props.height).toBe('match_parent')
  })
})
