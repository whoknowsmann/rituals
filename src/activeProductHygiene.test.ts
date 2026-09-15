import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const archivedName = 'pre' + 'flight'
const forbiddenImportNames = ['Pre' + 'flightScreen', 'domain/' + archivedName, 'components/' + archivedName]

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [path] : []
  })
}

describe('active Rituals product hygiene', () => {
  it('contains no archived product name or deleted imports in active source', () => {
    const files = ['App.tsx', ...sourceFiles('src')].filter((file) => !file.endsWith('activeProductHygiene.test.ts'))
    const violations = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      const lower = source.toLowerCase().replaceAll('skip' + archivedName, '')
      return lower.includes(archivedName) || forbiddenImportNames.some((name) => source.includes(name))
        ? [file]
        : []
    })

    expect(violations).toEqual([])
  })

  it('keeps the active route and wallet identity on Rituals devnet', () => {
    const route = readFileSync('src/navigators/AppNavigator.tsx', 'utf8')
    const auth = readFileSync('src/utils/useAuthorization.tsx', 'utf8')

    expect(route).toContain('RitualsHome')
    expect(auth).toContain('name: "Rituals"')
    expect(auth).toContain('const CLUSTER = "devnet"')
  })
})
