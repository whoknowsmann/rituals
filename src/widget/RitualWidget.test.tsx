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
import { widgetModelFromSnapshot, type StampFace, type WidgetModel, type WidgetState } from './widgetModel'
import { stampFaceSvg } from './stampFace'
import { punchCardSvg } from './punchCard'

type Tree = { type: string; props: Record<string, any>; children: Tree[] }
const { buildWidgetTree } = require('react-native-android-widget/lib/commonjs/api/build-widget-tree') as { buildWidgetTree: (element: React.JSX.Element) => Tree }
const model: WidgetModel = { title: 'Read a chapter with a deliberately long ritual name', state: 'concerned', face: 'side-eye', streak: 1, dots: ['kept', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming'], line: 'Stamp week 2 · 1 day left\n5 tSKR on the line', tint: '#13917A', ink: '#1D1A16', seal: '#C8F560' }
const flatten = (tree: Tree): Tree[] => [tree, ...tree.children.flatMap(flatten)]
const render = (value = model, width = 160, height = 160) => buildWidgetTree(<RitualWidget model={value} width={width} height={height} />)
const textNodes = (tree: Tree) => flatten(tree).filter((node) => node.type === 'TextWidget')
const svgNodes = (tree: Tree) => flatten(tree).filter((node) => node.type === 'SvgWidget')

describe('clarity-first native widget tree', () => {
  it('puts brand and Fraunces ritual name above the stamp, action/stake and dots; keeps OPEN_APP', () => {
    const tree = render()
    expect(tree.props).toMatchObject({ width: 'match_parent', height: 'match_parent', orientation: 'VERTICAL', backgroundColor: '#13917A', padding: { top: 8, bottom: 8, left: 8, right: 8 } })
    expect(JSON.stringify(tree.props)).toContain('OPEN_APP')
    expect(tree.children.map((node) => node.type)).toEqual(['TextWidget', 'TextWidget', 'SvgWidget', 'TextWidget', 'SvgWidget'])
    expect(tree.children[2]).toMatchObject({ props: { width: widgetLayout(160, 160).faceSize, height: widgetLayout(160, 160).faceSize } })
    const texts = textNodes(tree)
    expect(texts.map((node) => node.props.text)).toEqual(['RITUALS', model.title, model.line])
    expect(texts[0].props).toMatchObject({ fontFamily: 'Figtree_600SemiBold', letterSpacing: 1.2 })
    expect(texts[1].props).toMatchObject({ fontFamily: 'Fraunces_900Black', fontWeight: '900', maxLines: 1, truncate: 'END' })
    expect(texts[1].props.adjustsFontSizeToFit).toBeUndefined() // long names truncate, never shrink away
    expect(texts[2].props).toMatchObject({ fontFamily: 'Figtree_600SemiBold', maxLines: 3, adjustsFontSizeToFit: true })
    expect(texts[2].props.truncate).toBeUndefined()
    for (const svg of svgNodes(tree)) {
      expect(svg.props.svgString).toContain('<svg')
      expect(svg.props.svgUrl).toBeUndefined()
    }
  })
  it('makes 4x2 a face-left, brand/name/action/dots-right composition', () => {
    const tree = render(model, 320, 160)
    expect(tree.props.orientation).toBe('HORIZONTAL')
    expect(tree.children[0].type).toBe('SvgWidget')
    expect(tree.children[1].props).toMatchObject({ width: 0, weight: 1 })
    expect(tree.children[1].children.map((node) => node.type)).toEqual(['TextWidget', 'TextWidget', 'TextWidget', 'SvgWidget'])
    expect(textNodes(tree).map((node) => node.props.text)).toEqual(['RITUALS', model.title, model.line])
    for (const text of textNodes(tree)) expect(text.props.textAlign).toBe('left')
  })
  it.each([[110, 110], [160, 160], [180, 180], [160, 240], [320, 160], [320, 110]])('budgets every child at %ix%i, including 16 weeks and empty', (width, height) => {
    for (const value of [model, { ...model, dots: Array(16).fill('kept') }, widgetModelFromSnapshot(null, 0)]) {
      const empty = value.state === 'empty'
      const layout = widgetLayout(width, height, empty, value.dots.length)
      const tree = render(value, width, height)
      expect(layout.faceSize).toBeGreaterThan(0)
      expect(layout.faceSize).toBeLessThanOrEqual(layout.innerWidth)
      expect(layout.textHeight + (layout.horizontal ? 0 : layout.faceSize)).toBeLessThanOrEqual(layout.innerHeight)
      expect(layout.textWidth).toBeGreaterThan(0)
      expect(textNodes(tree).length).toBeLessThanOrEqual(3)
      expect(flatten(tree).some((node) => node.props.height < 0 || node.props.width < 0)).toBe(false)
      if (!layout.horizontal) expect(tree.children.reduce((sum, node) => sum + node.props.height, 0)).toBeLessThanOrEqual(layout.innerHeight)
    }
  })
  it.each(['open', 'concerned', 'alarmed', 'stamped', 'missed', 'resting', 'finished', 'closing'] satisfies WidgetState[])('preserves the three-text-element budget in %s', (state) => {
    for (const width of [160, 320]) {
      const tree = render({ ...model, state }, width)
      expect(textNodes(tree).map((node) => node.props.text)).toEqual(['RITUALS', model.title, model.line])
      expect(textNodes(tree)[2].props.color).toBe(state === 'stamped' ? '#C8F560' : '#FFFDF8')
      expect(svgNodes(tree)).toHaveLength(2)
    }
  })
  it('brands the empty invitation and waving stamp without inventing a ritual or progress', () => {
    for (const width of [160, 320]) {
      const tree = render(widgetModelFromSnapshot(null, 0), width)
      expect(textNodes(tree).map((node) => node.props.text)).toEqual(['RITUALS', 'Start a ritual'])
      expect(svgNodes(tree)).toHaveLength(1)
      expect(svgNodes(tree)[0].props.svgString).toContain('M128 110l13-6')
    }
  })
  it('labels legacy blank titles without changing the snapshot', () => {
    expect(textNodes(render({ ...model, title: '' }))[1].props.text).toBe('Your ritual')
  })
  it.each([1, 4])('names the saved finished Read ritual with %i of 6 kept in both layouts', (kept) => {
    const value = widgetModelFromSnapshot({ rituals: [{ address: 'finished', title: 'Read', active: false, stakeLabel: '5 tSKR', causeLabel: 'Northside', tint: '#13917A', weeks: Array.from({ length: 6 }, (_, index) => ({ opens: index * 200, deadline: index * 200 + 100, outcome: index < kept ? 'kept' : 'missed' })) }] }, 1300)
    expect(value.streak).toBe(0)
    for (const width of [160, 320]) {
      const tree = render(value, width)
      expect(textNodes(tree).map((node) => node.props.text)).toEqual(['RITUALS', 'Read', `Done · ${kept} of 6 kept\n5 tSKR / week`])
      const [stamp, dots] = svgNodes(tree)
      expect(stamp.props.svgString).toContain(`stroke="${kept === 1 ? '#1D1A16' : '#2F6B2A'}"`)
      expect(stamp.props.svgString).toContain('fill="#FFFDF8"')
      expect(dots.props.svgString.match(/fill="#FFFDF8"/g)).toHaveLength(kept)
      expect(dots.props.svgString.match(/fill="#1D1A16"/g)).toHaveLength(6 - kept)
    }
  })
})

describe('shape-only ink stamp and punch card', () => {
  it('draws one uncluttered rightward glance with separated strokes at 90dp', () => {
    const svg = stampFaceSvg('side-eye', '#1D1A16', '#C8F560')
    expect(svg).toContain('<path d="M49 61h23 M68 76v8 M110 76v8 M70 104h22"/>')
    expect(68 - 59).toBe(110 - 101)
    expect((76 - 61 - 7) * 90 / 160).toBeGreaterThan(4)
    expect(svg.match(/<path /g)).toHaveLength(2)
  })
  it('draws raised inner brows and a shallow downturned mouth, not a flat smirk', () => {
    const svg = stampFaceSvg('sad', '#8C8377', '#EAE3D6')
    expect(svg).toContain('M48 61l22-10 M91 51l22 10')
    expect(svg).toContain('M66 107q14-13 28 0')
    expect(svg).not.toContain('M65 105h30')
  })
  it('preserves all nine faces, double ink rules and adds rim ticks without SVG fonts', () => {
    const faces: StampFace[] = ['calm', 'side-eye', 'alarmed', 'joyful', 'sad', 'resting', 'content', 'expectant', 'neutral']
    const svgs = faces.map((face) => stampFaceSvg(face, '#1D1A16', '#C8F560'))
    expect(new Set(svgs).size).toBe(faces.length)
    for (const svg of svgs) {
      expect(svg.match(/<circle /g)).toHaveLength(3)
      expect(svg).toContain('viewBox="0 0 160 160"')
      expect(svg).toContain('stroke-dasharray="2 6"')
      expect(svg).not.toMatch(/<text|<image|href=|url\(|font|script/)
      expect(svg).toContain('rotate(-7 80 80)')
    }
  })
  it('draws filled kept, dark missed, hollow upcoming and thick current rings', () => {
    const svg = punchCardSvg(['kept', 'missed', 'upcoming', 'current', 'skipped', 'unknown'])
    expect(svg).toContain('cx="6" cy="6" r="3" fill="#FFFDF8"')
    expect(svg).toContain('cx="18" cy="6" r="3" fill="#1D1A16"')
    expect(svg).toContain('cx="30" cy="6" r="3" fill="none"')
    expect(svg).toContain('cx="42" cy="6" r="4" fill="none" stroke="#FFFDF8" stroke-width="2"')
    expect(svg).toContain('M51 6h6')
    expect(svg).toContain('cx="66" cy="6" r="1"')
    expect(svg).not.toMatch(/<text|<image|href=|url\(/)
  })
  it.each([1, 6, 8, 9, 16])('never drops a week or overflows the viewBox at %i dots', (count) => {
    const svg = punchCardSvg(Array(count).fill('kept'))
    expect(svg.match(/<circle /g)).toHaveLength(count)
    const columns = Math.min(8, count)
    const rows = Math.ceil(count / 8)
    expect(svg).toContain(`viewBox="0 0 ${columns * 12} ${rows * 12}"`)
    for (const match of svg.matchAll(/cx="(\d+)" cy="(\d+)"/g)) {
      expect(Number(match[1]) + 4).toBeLessThan(columns * 12)
      expect(Number(match[2]) + 4).toBeLessThan(rows * 12)
    }
  })
})
