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
  actor?: string
  eventIndex?: number
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

// Must list every PreparedRitualAction kind: makePendingActionRecord throws for a
// missing kind, which aborts the action before the wallet opens.
const ACTION_KINDS: readonly PendingActionKind[] = ['create', 'create-solo', 'fund', 'fund-and-activate', 'activate', 'cancel', 'close', 'initialize-event', 'claim', 'approve', 'question', 'declare-skip', 'finalize', 'create-and-fund', 'create-solo-fund-and-activate', 'initialize-event-and-claim', 'eject']
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
  const hasTarget = record.actor !== undefined || record.eventIndex !== undefined
  if (hasTarget && (canonicalPublicKey(record.actor) === null || !Number.isInteger(record.eventIndex) || (record.eventIndex as number) < 0 || (record.eventIndex as number) > 15)) return null
  return Object.freeze({ version: 1, actionKind: record.actionKind as PendingActionKind, ritualAddress: record.ritualAddress as string, messageDigest: record.messageDigest, ...(transactionSignature === undefined ? {} : { transactionSignature }), ...(hasTarget ? { actor: record.actor as string, eventIndex: record.eventIndex as number } : {}), blockhash: record.blockhash as string, lastValidBlockHeight: record.lastValidBlockHeight, createdAt: record.createdAt })
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

/** Blocks past lastValidBlockHeight before a missing status counts as never landed. */
export const EXPIRY_MARGIN_BLOCKS = 150

export async function resolvePendingAction(record: PendingActionRecord, transport: PendingActionTransport): Promise<PendingActionResolution> {
  let currentHeight: number | null = null
  try {
    const height = await transport.getBlockHeight()
    if (safeHeight(height)) currentHeight = height
  } catch { /* RPC outage leaves the action unknown. */ }

  if (record.transactionSignature !== undefined) {
    let status: PendingActionSignatureStatus | null = null
    let statusRead = false
    try { status = await transport.getSignatureStatus(record.transactionSignature); statusRead = true } catch { /* retry on a later mount */ }
    if (status?.err !== null && status?.err !== undefined) return Object.freeze({ status: 'failed' as const, record })
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      try {
        const readback = await transport.readRitual(new PublicKey(record.ritualAddress), record)
        if (readback.actionObserved && safeHeight(readback.slot) && (status.slot === null || readback.slot >= status.slot)) return Object.freeze({ status: 'confirmed' as const, record, slot: readback.slot })
      } catch { /* authoritative readback has not caught up yet */ }
    }
    // Expiry alone is not proof of failure while a node may lag. But once the
    // chain is well past the transaction's last valid block height, it can no
    // longer land; if history has no status for it and the action is absent
    // on chain, it never happened (found on the phone 2026-10-06: a stale
    // record kept Home saying "still checking" forever).
    if (statusRead && status === null && currentHeight !== null && currentHeight > record.lastValidBlockHeight + EXPIRY_MARGIN_BLOCKS) {
      try {
        const readback = await transport.readRitual(new PublicKey(record.ritualAddress), record)
        if (readback.actionObserved === false) return Object.freeze({ status: 'expired' as const, record })
      } catch { /* outage is not evidence of expiry */ }
    }
    return Object.freeze({ status: 'still-unknown' as const, record })
  }

  // A killed wallet handoff may never return a signature. Creation has a unique
  // address, so its account is evidence; existence alone cannot prove a stamp.
  const hasReadback = ['create', 'create-solo', 'create-and-fund', 'create-solo-fund-and-activate'].includes(record.actionKind) || (record.actor !== undefined && record.eventIndex !== undefined)
  if (hasReadback) {
    try {
      const readback = await transport.readRitual(new PublicKey(record.ritualAddress), record)
      if (readback.actionObserved && safeHeight(readback.slot)) return Object.freeze({ status: 'confirmed' as const, record, slot: readback.slot })
      if (readback.actionObserved === false && currentHeight !== null && currentHeight > record.lastValidBlockHeight) return Object.freeze({ status: 'expired' as const, record })
    } catch { /* outage is not evidence of expiry */ }
  }
  // An unsigned journal for an action we cannot read back (legacy stamp
  // records with no actor/week) never resolves on its own. Once its blockhash
  // is long dead, stop nagging: the ritual screen shows the chain's truth, and
  // the program rejects a duplicate stamp anyway.
  if (!hasReadback && currentHeight !== null && currentHeight > record.lastValidBlockHeight + EXPIRY_MARGIN_BLOCKS) {
    return Object.freeze({ status: 'expired' as const, record })
  }
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

let journalWrites: Promise<void> = Promise.resolve()
function updateRecords(change: (records: readonly PendingActionRecord[]) => readonly PendingActionRecord[]): Promise<void> {
  const write = journalWrites.then(async () => writeRecords(change(await readRecords())))
  journalWrites = write.catch(() => undefined)
  return write
}

export const asyncStoragePendingActionStore: PendingActionStore = Object.freeze({
  list: readRecords,
  async upsert(record) {
    await updateRecords((records) => [...records.filter((existing) => existing.messageDigest !== record.messageDigest), record])
  },
  async remove(record) {
    await updateRecords((records) => records.filter((existing) => existing.messageDigest !== record.messageDigest))
  },
})
