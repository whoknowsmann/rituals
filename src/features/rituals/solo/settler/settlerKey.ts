import AsyncStorage from '@react-native-async-storage/async-storage'
import { Keypair } from '@solana/web3.js'

/**
 * The app's own devnet settle key, one per install. It only ever pays fees and
 * rent for permissionless steps (open a missed week, settle a week); the
 * program sends stake only to the member or the locked destination, so this
 * key can never redirect money. Stored in AsyncStorage: a devnet stand-in for
 * the keeper a mainnet version would run.
 */
export const SETTLER_STORAGE_KEY = '@rituals/settler/v1'

type Storage = Readonly<{ getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }>

export function parseSettlerSecret(raw: string | null): Keypair | null {
  if (!raw) return null
  try {
    const bytes = JSON.parse(raw) as unknown
    if (!Array.isArray(bytes) || bytes.length !== 64 || !bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) return null
    return Keypair.fromSecretKey(Uint8Array.from(bytes as number[]))
  } catch {
    return null
  }
}

let pending: Promise<Keypair> | null = null

/** Loads the settle key, creating and saving one on first use. Concurrent callers share one key. */
export function loadOrCreateSettler(storage: Storage = AsyncStorage, generate: () => Keypair = Keypair.generate): Promise<Keypair> {
  if (pending) return pending
  pending = (async () => {
    const existing = parseSettlerSecret(await storage.getItem(SETTLER_STORAGE_KEY))
    if (existing) return existing
    const created = generate()
    await storage.setItem(SETTLER_STORAGE_KEY, JSON.stringify(Array.from(created.secretKey)))
    return created
  })().catch((error: unknown) => { pending = null; throw error })
  return pending
}

/** Test seam: forget the cached key. */
export function resetSettlerCacheForTests(): void { pending = null }
