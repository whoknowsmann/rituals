import React from 'react'
import { describe, expect, it, vi } from 'vitest'

// Real 0.16.1 converters/serializer. SvgWidget requires RN only for numeric
// image assets; execute that unmodified converter with just this native seam stubbed.
vi.mock('react-native-android-widget', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs')
  const { createRequire } = require('node:module') as typeof import('node:module')
  const { runInNewContext } = require('node:vm') as typeof import('node:vm')
  const file = require.resolve('react-native-android-widget/lib/commonjs/widgets/SvgWidget')
  const localRequire = createRequire(file)
  const exports = {}
  runInNewContext(readFileSync(file, 'utf8'), { exports, require: (id: string) => id === 'react-native' ? { Image: { resolveAssetSource: () => { throw Error('No external assets') } } } : localRequire(id) })
  return {
    ...require('react-native-android-widget/lib/commonjs/widgets/FlexWidget'),
    ...require('react-native-android-widget/lib/commonjs/widgets/TextWidget'),
    ...exports,
  }
})
import { RitualWidget, widgetLayout } from './RitualWidget'
import { widgetModelFromSnapshot, type StampFace, type WidgetModel } from './widgetModel'
import { stampFaceSvg } from './stampFace'

type Tree = { type: string; props: Record<string, any>; children: Tree[] }
const { buildWidgetTree } = require('react-native-android-widget/lib/commonjs/api/build-widget-tree') as { buildWidgetTree: (element: React.JSX.Element) => Tree }
const model: WidgetModel = { title: 'Read a chapter with a deliberately long ritual name', state: 'concerned', face: 'side-eye', streak: 12, hero: { value: '12', label: 'week streak' }, line: 'Your 5 TEST has opinions.', tint: '#13917A', ink: '#1D1A16', seal: '#C8F560' }
const flatten = (tree: Tree): Tree[] => [tree, ...tree.children.flatMap(flatten)]
const render = (value = model, width = 160, height = 160) => buildWidgetTree(<RitualWidget model={value} width={width} height={height} />)

describe('stamp character native tree', () => {
  it('fills 2x2 with a hero SVG above a numeral and one message; keeps OPEN_APP', () => {
    const tree = render()
    expect(tree.props).toMatchObject({ width: 'match_parent', height: 'match_parent', orientation: 'VERTICAL', backgroundColor: '#13917A', padding: { top: 14, bottom: 14, left: 14, right: 14 } })
    expect(JSON.stringify(tree.props)).toContain('OPEN_APP')
    expect(tree.children[0]).toMatchObject({ type: 'SvgWidget', props: { width: widgetLayout(160, 160).faceSize, height: widgetLayout(160, 160).faceSize } })
    expect(tree.children[0].props.svgString).toContain('<svg')
    expect(tree.children[0].props.svgUrl).toBeUndefined()
    const texts = flatten(tree).filter((node) => node.type === 'TextWidget')
    expect(texts.map((node) => node.props.text)).toEqual(['12', 'week streak', model.line])
    expect(texts[0].props).toMatchObject({ fontFamily: 'Fraunces_900Black', fontWeight: '900', adjustsFontSizeToFit: true })
    expect(texts[2].props).toMatchObject({ fontFamily: 'Figtree_600SemiBold', maxLines: 2, adjustsFontSizeToFit: true })
  })
  it('makes 4x2 a face-left, streak/copy/name-right composition', () => {
    const tree = render(model, 320, 160)
    expect(tree.props.orientation).toBe('HORIZONTAL')
    expect(tree.children[1].props).toMatchObject({ width: 0, weight: 1 })
    const texts = flatten(tree.children[1]).filter((node) => node.type === 'TextWidget')
    expect(texts.map((node) => node.props.text)).toEqual(['12', 'week streak', model.line, model.title])
    expect(texts[3].props).toMatchObject({ maxLines: 1, truncate: 'END', fontFamily: 'Figtree_400Regular' })
  })
  it('has explicit vertical budgets at minimum, typical and taller launcher sizes', () => {
    for (const [width, height] of [[110, 110], [160, 160], [180, 180], [160, 240]]) {
      const layout = widgetLayout(width, height)
      expect(layout.horizontal).toBe(false)
      expect(layout.faceSize + layout.numberHeight + layout.lineHeight).toBeLessThanOrEqual(height - 28)
      expect(layout.faceSize).toBeLessThanOrEqual(width - 28)
      const tree = render(model, width, height)
      expect(flatten(tree).some((node) => node.props.height < 0)).toBe(false)
    }
    const square = widgetLayout(180, 180)
    expect(square.faceSize / square.innerHeight).toBeGreaterThan(0.54)
    expect(square.faceSize / square.innerHeight).toBeLessThanOrEqual(0.55)
  })
  it('does not manufacture a zero streak for empty; celebrates a stamp in lime', () => {
    expect(flatten(render(widgetModelFromSnapshot(null, 0))).filter((node) => node.type === 'TextWidget').map((node) => node.props.text)).toEqual(['Start a ritual?'])
    expect(flatten(render({ ...model, state: 'stamped' })).find((node) => node.props.text === '12')?.props.color).toBe('#C8F560')
  })
  it.each([[110, 110], [160, 160], [180, 180], [320, 160]])('centres a close stacked label at %ix%i, including the widest tally', (width, height) => {
    for (const value of [model, ...['0/6', '1/6', '4/6', '16/16'].map((tally): WidgetModel => ({ ...model, state: 'finished', streak: 0, hero: { value: tally, label: 'weeks kept' }, line: 'Ritual finished.' }))]) {
      const tree = render(value, width, height)
      const group = tree.children[1].children[0]
      const [hero, label] = group.children
      const layout = widgetLayout(width, height)
      expect(group.props).toMatchObject({ width: 'match_parent', height: layout.numberHeight, orientation: 'VERTICAL' })
      expect(group.props.separator).toBeUndefined()
      expect(hero.props).toMatchObject({ text: value.hero.value, width: 'match_parent', textAlign: 'center', fontFamily: 'Fraunces_900Black', maxLines: 1, adjustsFontSizeToFit: true })
      expect(label.props).toMatchObject({ text: value.hero.label, width: 'match_parent', textAlign: 'center', height: layout.labelHeight, maxLines: 1, adjustsFontSizeToFit: true })
      expect(hero.props.height + label.props.height).toBe(layout.numberHeight)
      expect(hero.props.height).toBeGreaterThan(label.props.height)
      if (value.state === 'finished') {
        const texts = flatten(tree).filter((node) => node.type === 'TextWidget').map((node) => node.props.text)
        expect(texts).not.toContain('week streak')
        expect(texts).not.toContain('0')
        expect(texts).toContain('Ritual finished.')
      }
    }
  })
  it.each([1, 4])('renders the saved finished ritual as %i/6 instead of its zero trailing streak', (kept) => {
    const value = widgetModelFromSnapshot({ rituals: [{ address: 'finished', title: 'Read', active: false, stakeLabel: '5 TEST', causeLabel: 'Northside', tint: '#13917A', weeks: Array.from({ length: 6 }, (_, index) => ({ opens: index * 200, deadline: index * 200 + 100, outcome: index < kept ? 'kept' : 'missed' })) }] }, 1300)
    expect(value.streak).toBe(0)
    for (const width of [160, 320]) {
      const tree = render(value, width, 160)
      const texts = flatten(tree).filter((node) => node.type === 'TextWidget').map((node) => node.props.text)
      expect(texts.slice(0, 3)).toEqual([`${kept}/6`, 'weeks kept', 'Ritual finished.'])
      expect(tree.children[0].props.svgString).toContain(`stroke="${kept === 1 ? '#1D1A16' : '#2F6B2A'}"`)
      expect(tree.children[0].props.svgString).toContain('fill="#FFFDF8"')
    }
  })
  it('draws one uncluttered rightward glance with separated strokes at 90dp', () => {
    const svg = stampFaceSvg('side-eye', '#1D1A16', '#C8F560')
    expect(svg).toContain('<path d="M49 61h23 M68 76v8 M110 76v8 M70 104h22"/>')
    // Pupils are equally offset from the calm eye centres; the round 7-unit
    // strokes leave >4dp of clear paper between the lowered brow and pupil.
    expect(68 - 59).toBe(110 - 101)
    expect((76 - 61 - 7) * 90 / 160).toBeGreaterThan(4)
    expect(svg.match(/<path /g)).toHaveLength(2) // ring texture + four facial strokes
  })
  it('draws raised inner brows and a shallow downturned mouth, not a flat smirk', () => {
    const svg = stampFaceSvg('sad', '#8C8377', '#EAE3D6')
    expect(svg).toContain('M48 61l22-10 M91 51l22 10')
    expect(svg).toContain('M66 107q14-13 28 0')
    expect(svg).not.toContain('M65 105h30')
  })
  it('has distinct shape-only faces, a double ink ring and no external assets/fonts', () => {
    const faces: StampFace[] = ['calm', 'side-eye', 'alarmed', 'joyful', 'sad', 'resting', 'content', 'expectant', 'neutral']
    const svgs = faces.map((face) => stampFaceSvg(face, '#1D1A16', '#C8F560'))
    expect(new Set(svgs).size).toBe(faces.length)
    for (const svg of svgs) {
      expect(svg.match(/<circle /g)).toHaveLength(2)
      expect(svg).toContain('viewBox="0 0 160 160"')
      expect(svg).not.toMatch(/<text|<image|href=|url\(|font|script/)
      expect(svg).toContain('rotate(-7 80 80)')
    }
  })
})
