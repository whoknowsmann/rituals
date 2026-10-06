import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(__dirname, '../..')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

/** Follow runtime local imports, ignoring erased type imports (no native evaluation). */
function runtimeGraph(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen
  seen.add(entry)
  const text = readFileSync(entry, 'utf8')
  const ast = ts.createSourceFile(entry, text, ts.ScriptTarget.Latest, true)
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue
    if (node.importClause?.isTypeOnly) continue
    const bindings = node.importClause?.namedBindings
    if (!node.importClause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.every((item) => item.isTypeOnly)) continue
    const specifier = node.moduleSpecifier.text
    expect(specifier).not.toMatch(/solana|web3|Rpc|Connection|authoritativeRituals|widgetBundle|refreshWidget/)
    if (specifier.startsWith('.')) {
      const base = resolve(dirname(entry), specifier)
      const file = [base + '.ts', base + '.tsx', base + '/index.ts'].find(existsSync)
      expect(file, specifier).toBeDefined()
      runtimeGraph(file!, seen)
    } else expect(['react', 'react-native', 'react-native-android-widget', '@react-native-async-storage/async-storage']).toContain(specifier)
  }
  expect(text).not.toMatch(/\b(fetch|XMLHttpRequest|require)\s*\(/)
  return seen
}

describe('widget integration source pins', () => {
  it('keeps the complete headless import graph free of RPC/web3 and foreground reads', () => {
    const graph = runtimeGraph(resolve(__dirname, 'widgetTaskHandler.ts'))
    expect([...graph].some((path) => path.endsWith('widgetSnapshot.ts'))).toBe(true)
    expect(source('src/widget/widgetTaskHandler.ts')).toContain('readWidgetSnapshot(AsyncStorage)')
    expect(source('src/widget/widgetTaskHandler.ts')).toContain("widgetAction === 'WIDGET_DELETED'")
  })
  it('registers on entry, outside React lifecycle; native imports stay out of pure modules', () => {
    expect(source('App.tsx')).toContain('import "./src/widget/registerWidget"')
    expect(source('src/widget/registerWidget.ts')).toContain('registerWidgetTaskHandler(widgetTaskHandler)')
    for (const file of ['widgetModel.ts', 'widgetSnapshot.ts', 'widgetBundle.ts']) {
      expect(source(`src/widget/${file}`)).not.toMatch(/from ['"](?:react-native|react-native-android-widget|@react-native-async-storage)/)
    }
  })
  it('publishes Home outcomes and ritual reads, with confirmation refreshes for create/stamp/both settles', () => {
    expect(source('src/screens/RitualsHomeScreen.tsx')).toContain('refreshWidget(rituals, known, read, true)')
    expect(source('src/widget/refreshWidget.ts')).toContain('outcomes?.get(entry.address) ?? (replaceAll ? new Map() : undefined)')
    expect(source('src/screens/solo/SoloCreateScreen.tsx')).toMatch(/rememberRitual\([^\n]+\.then\(\(\) => refreshWidget/)
    const screen = source('src/screens/solo/SoloRitualScreen.tsx')
    expect(screen).toContain('useWidgetSnapshot(route.params.ritualId, read)')
    expect(screen).toMatch(/handled.current.claim = claim.state.result.messageDigest\s+void refreshWidget\(\)/)
    expect(screen).toMatch(/handled.current.settle = settle.state.result.messageDigest\s+void refreshWidget\(\)/)
    expect(screen).toContain('if (ok) void refreshWidget()')
  })
  it('has one resizable 2x2 widget, bundled custom fonts, and an app-only tap target', () => {
    const config = JSON.parse(source('app.json')).expo
    const plugin = config.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === 'react-native-android-widget')
    expect(plugin[1].widgets).toHaveLength(1)
    expect(plugin[1].widgets[0]).toMatchObject({ name: 'RitualWidget', minWidth: '110dp', minHeight: '110dp', targetCellWidth: 2, targetCellHeight: 2, resizeMode: 'horizontal|vertical', updatePeriodMillis: 1800000 })
    for (const font of plugin[1].fonts) expect(existsSync(resolve(root, font))).toBe(true)
    expect(source('src/widget/RitualWidget.tsx')).toContain('clickAction="OPEN_APP"')
    expect(source('src/widget/RitualWidget.tsx')).toContain('fontFamily: fonts.display')
    expect(source('src/widget/widgetTaskHandler.ts')).toContain('width: widgetInfo.width')
    expect(source('src/widget/refreshWidget.ts')).toContain('renderWidget: ({ width })')
  })
})
