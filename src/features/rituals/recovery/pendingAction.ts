import AsyncStorage from '@react-native-async-storage/async-storage'
import { PublicKey } from '@solana/web3.js'
import { canonicalBase58Signature } from '../../../data/rituals/base58Signature'
import type { PreparedRitualAction } from '../../../data/rituals/ritualPreparedAction'

export const PENDING_ACTION_STORAGE_KEY = '@rituals/pending-actions/v1'
export const PENDING_ACTION_VERSION = 1 as const

export type PendingActionKind = PreparedRitualAction['kind']

export type PendingActionRecord = Readonly<{
  version: 1
  actionKind: PendingActionKind
  ritualAddress: string
  messageDigest: string
  transactionSignature?: string
  blockhash: string
  lastValidBlockHeight: number
  createdAt: number
}>

export type PendingActionSignatureStatus = Readonly<{
  slot: number | null
  err: unknown | null
  confirmationStatus: 'processed' | 'confirmed' | 'finalized' | null
}>

export type PendingActionReadback = Readonly<{
  slot: number
  /** The action-specific authoritative reader decides whether the action landed. */
  actionObserved: boolean
}>

export type PendingActionTransport = Readonly<{
  getSignatureStatus: (signature: string) => Promise<PendingActionSignatureStatus | null>
  getBlockHeight: () => Promise<number>
  readRitual: (address: PublicKey, record: PendingActionRecord) => Promise<PendingActionReadback>
}>

export type PendingActionResolution =
  | Readonly<{ status: 'confirmed'; record: PendingActionRecord; slot: number }>
  | Readonly<{ status: 'failed'; record: PendingActionRecord }>
  | Readonly<{ status: 'expired'; record: PendingActionRecord }>
  | Readonly<{ status: 'still-unknown'; record: PendingActionRecord }>

export type PendingActionStore = Readonly<{
  list: () => Promise<readonly PendingActionRecord[]>
  upsert: (record: PendingActionRecord) => Promise<void>
  remove: (record: PendingActionRecord) => Promise<void>
}>

const ACTION_KINDS: readonly PendingActionKind[] = ['create', 'fund', 'activate', 'cancel', 'close', 'initialize-event', 'claim', 'approve', 'question', 'finalize']
const DIGEST = /^[0-9a-f]{64}$/
const safeHeight = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const safeCreatedAt = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const canonicalPublicKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  try {
    const key = new PublicKey(value)
    return key.equals(PublicKey.default) || key.toBase58() !== value ? null : value
  } catch { return null }
}
const canonicalBlockhash = canonicalPublicKey

export function parsePendingAction(value: unknown): PendingActionRecord | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.version !== PENDING_ACTION_VERSION || typeof record.actionKind !== 'string' || !ACTION_KINDS.includes(record.actionKind as PendingActionKind)) return null
  if (canonicalPublicKey(record.ritualAddress) === null || typeof record.messageDigest !== 'string' || !DIGEST.test(record.messageDigest) || canonicalBlockhash(record.blockhash) === null || !safeHeight(record.lastValidBlockHeight) || !safeCreatedAt(record.createdAt)) return null
  let transactionSignature: string | undefined
  if (record.transactionSignature !== undefined) {
    try { transactionSignature = canonicalBase58Signature(record.transactionSignature) } catch { return null }
  }
  return Object.freeze({ version: 1, actionKind: record.actionKind as PendingActionKind, ritualAddress: record.ritualAddress as string, messageDigest: record.messageDigest, ...(transactionSignature === undefined ? {} : { transactionSignature }), blockhash: record.blockhash as string, lastValidBlockHeight: record.lastValidBlockHeight, createdAt: record.createdAt })
}

export function makePendingActionRecord(action: PreparedRitualAction, createdAt = Date.now()): PendingActionRecord {
  const parsed = parsePendingAction({ version: 1, actionKind: action.kind, ritualAddress: action.ritualAddress, messageDigest: action.messageDigest, blockhash: action.blockhash, lastValidBlockHeight: action.lastValidBlockHeight, createdAt })
  if (!parsed) throw new Error('prepared action cannot be persisted')
  return parsed
}

export function withPendingActionSignature(record: PendingActionRecord, signature: string): PendingActionRecord {
  const parsed = parsePendingAction({ ...record, transactionSignature: signature })
  if (!parsed) throw new Error('transaction signature cannot be persisted')
  return parsed
}

export async function resolvePendingAction(record: PendingActionRecord, transport: PendingActionTransport): Promise<PendingActionResolution> {
  let currentHeight: number | null = null
  try {
    const height = await transport.getBlockHeight()
    if (safeHeight(height)) currentHeight = height
  } catch { /* RPC outage leaves the action unknown. */ }

  if (record.transactionSignature !== undefined) {
    let status: PendingActionSignatureStatus | null = null
    try { status = await transport.getSignatureStatus(record.transactionSignature) } catch { /* retry on a later mount */ }
    if (status?.err !== null && status?.err !== undefined) return Object.freeze({ status: 'failed' as const, record })
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      try {
        const readback = await transport.readRitual(new PublicKey(record.ritualAddress), record)
        if (readback.actionObserved && safeHeight(readback.slot)) return Object.freeze({ status: 'confirmed' as const, record, slot: readback.slot })
      } catch { /* authoritative readback has not caught up yet */ }
    }
  }

  if (currentHeight !== null && currentHeight > record.lastValidBlockHeight) return Object.freeze({ status: 'expired' as const, record })
  return Object.freeze({ status: 'still-unknown' as const, record })
}

async function readRecords(): Promise<readonly PendingActionRecord[]> {
  let raw: string | null = null
  try { raw = await AsyncStorage.getItem(PENDING_ACTION_STORAGE_KEY) } catch { return Object.freeze([]) }
  if (raw === null) return Object.freeze([])
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return Object.freeze([])
    return Object.freeze(parsed.map(parsePendingAction).filter((record): record is PendingActionRecord => record !== null))
  } catch { return Object.freeze([]) }
}

async function writeRecords(records: readonly PendingActionRecord[]): Promise<void> {
  await AsyncStorage.setItem(PENDING_ACTION_STORAGE_KEY, JSON.stringify(records))
}

export const asyncStoragePendingActionStore: PendingActionStore = Object.freeze({
  list: readRecords,
  async upsert(record) {
    const next = (await readRecords()).filter((existing) => existing.messageDigest !== record.messageDigest)
    await writeRecords([...next, record])
  },
  async remove(record) {
    await writeRecords((await readRecords()).filter((existing) => existing.messageDigest !== record.messageDigest))
  },
})
