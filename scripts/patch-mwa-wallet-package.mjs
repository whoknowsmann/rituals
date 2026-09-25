#!/usr/bin/env node
// Let the app choose WHICH wallet answers a Mobile Wallet Adapter session.
//
// MWA 2.2.2's native startSession() fires an implicit `solana-wallet:` intent,
// so Android picks the wallet. On a Seeker that is always the built-in Seed
// Vault Wallet; Phantom (which also handles the scheme) is unreachable. This
// adds one optional config key, `walletPackage`, and pins the association
// intent to that package with Intent.setPackage. Omitting the key keeps stock
// behaviour exactly.
//
// Runs on postinstall so every install (including EAS local/cloud builds, which
// run `npm ci`) gets it. Idempotent. Fails loudly if upstream source moved, so
// a dependency bump cannot silently drop wallet choice.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(
  root,
  'node_modules/@solana-mobile/mobile-wallet-adapter-protocol/android/src/main/java/com/solanamobile/mobilewalletadapter/reactnative/SolanaMobileWalletAdapterModule.kt',
)
const MARKER = '// rituals-patch: walletPackage'

if (!existsSync(file)) {
  console.error(`[patch-mwa] missing ${file}`)
  process.exit(1)
}
let source = readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch-mwa] already applied')
  process.exit(0)
}

const anchor = `                                localAssociation.session
                        )
`
const addition = `                ${MARKER}
                val walletPackage =
                        if (config?.hasKey("walletPackage") == true) config.getString("walletPackage") else null
                if (!walletPackage.isNullOrEmpty()) intent.setPackage(walletPackage)
`
const occurrences = source.split(anchor).length - 1
if (occurrences !== 1) {
  console.error(`[patch-mwa] expected 1 anchor in SolanaMobileWalletAdapterModule.kt, found ${occurrences}; upstream changed — re-derive the patch`)
  process.exit(1)
}
source = source.replace(anchor, anchor + addition)
writeFileSync(file, source)
console.log('[patch-mwa] applied walletPackage support')
