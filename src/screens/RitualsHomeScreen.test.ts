import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, 'RitualsHomeScreen.tsx'), 'utf8')

describe('RitualsHomeScreen safety and accessibility structure', () => {
  it('reuses the faucet hook only in the empty state, with the same primary style and quiet result/fallback', () => {
    expect(source).toContain("import { useDevnetFaucet } from '../features/rituals/faucet/useDevnetFaucet'")
    expect(source).toMatch(/active.length === 0\s*\? <EmptySolo/)
    const empty = source.slice(source.indexOf('function EmptySolo('), source.indexOf('function RitualGrid('))
    expect(empty).toContain('useDevnetFaucet(wallet?.toBase58() ?? null, onFaucetSent)')
    expect(empty).toContain("homePrimaryAction({ connected: wallet !== null, hasActiveRituals: false, testBalance, faucetResult: faucet.result }) === 'faucet'")
    expect(empty).toContain('? <ActionButton label="Get test tokens" onPress={faucet.request} disabled={faucet.status === \'requesting\'} loading={faucet.status === \'requesting\'} />')
    expect(empty).toContain(': <ActionButton label="Start one" onPress={onPromise} />')
    expect(empty).toContain('<Text style={styles.muted} accessibilityLiveRegion="polite">{faucetLine(faucet.result)}</Text>')
    expect(empty).toContain('{faucetPrimary && faucet.status === \'done\' && <ActionButton tone="link" label="Start one" onPress={onPromise} />}')
    expect(empty).toContain('<Text style={styles.emptyTitle}>Start a ritual?</Text>')
  })

  it('shares the create balance reader, refreshes after sending, and discards stale wallet/focus reads', () => {
    const create = readFileSync(resolve(__dirname, 'solo/SoloCreateScreen.tsx'), 'utf8')
    expect(create).toContain('readTestTokenBalance(connection, config.account.allowedStakeMint, selectedAccount.publicKey)')
    expect(source).toContain('readTestTokenBalance(connection, config.account.allowedStakeMint, wallet)')
    expect(source).toContain("key={selectedAccount?.publicKey.toBase58() ?? 'disconnected'}")
    expect(source).toContain('const onFaucetSent = useCallback(() => setBalanceTick((value) => value + 1), [])')
    expect(source).toMatch(/useFocusEffect\(useCallback\(\(\) => \{\s*setTestBalance\(null\)/)
    expect(source).toContain("if (!wallet || client.status !== 'ready') return")
    expect(source).toContain('.then((balance) => { if (active) setTestBalance(balance) })')
    expect(source).toContain('.catch(() => { if (active) setTestBalance(null) })')
    expect(source).toContain('return () => { active = false }')
    expect(source).toContain('[client, connection, wallet, balanceTick]))')
  })

  it('drops coming soon and gives stamped tiles a closing-time summary', () => {
    expect(source).not.toContain('COMING_SOON_LINE')
    const presentation = readFileSync(resolve(__dirname, '../features/rituals/home/homeSections.ts'), 'utf8')
    expect(presentation).toContain('stampedWeekClosingLabel(model, now)')
    expect(source).toContain('homeTilePresentation(ritual.bundle, now)')
    expect(source).toContain('summaryLabel={closingLine ?? undefined}')
    expect(source).toContain('closingLine ?? weekSummary(cells)')
  })
  it('renders fixture disclosure while loading and after errors', () => {
    expect(source).toContain('view.disclosure')
    expect(source).toContain('accessibilityLiveRegion="polite"')
  })

  it('offers a retry action wired to the repository loader', () => {
    expect(source).toContain('const load = useCallback')
    expect(source).toContain('onPress={() => load()}')
    expect(source).toContain('Try again')
  })

  it('uses stable ritual ids and named design tokens, never raw hex', () => {
    expect(source).toContain('key={ritual.id}')
    expect(source).toContain('makeStyles(theme, colors)')
    // Colours must come from the shared palette so the theme stays the single
    // source of truth. Raw hex in a screen is how a design system rots.
    expect(source).toContain("from '../theme'")
    // Crew tokens (color.*) or legacy palette aliases — either way, named tokens.
    expect(source).toMatch(/\b(color|palette)\.[a-zA-Z]/)
    expect(source).not.toMatch(/color:\s*'#[0-9a-fA-F]{3,8}'/)
    expect(source).not.toMatch(/backgroundColor:\s*'#[0-9a-fA-F]{3,8}'/)
  })

  it('does not expose repository error text', () => {
    expect(source).toContain('safeErrorMessage(error)')
    expect(source).not.toContain('error instanceof Error ? error.message')
  })

  it('keeps the tagline and puts solo actions first on the empty home', () => {
    expect(source).toContain('Show up, or pay up.')
    expect(source).toContain("navigation.navigate('SoloCreate')")
    expect(source).toContain('homeCreateTarget().name')
    expect(source).toContain("navigation.navigate('JoinRitual', {})")
    expect(source).toContain('homeRitualTarget')
    expect(source).toContain('SeasonCard')
    expect(source).not.toContain('Recent')
  })

  it('reloads when the screen comes back into focus, so a promise made elsewhere shows up', () => {
    expect(source).toContain('useIsFocused')
    expect(source).toContain('if (focused) load()')
  })

  it('lets a user with rituals start another ritual', () => {
    expect(source).toContain('accessibilityLabel="Start another ritual"')
  })

  it('uses the shared Season count line (no "1 people in")', () => {
    expect(source).toContain('seasonParticipantLine(')
    expect(source).not.toContain('people in`')
  })
})

