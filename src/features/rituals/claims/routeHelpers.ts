import type { RootStackParamList } from '../../../navigators/AppNavigator'
import type { EventIndex, RitualId } from '../../../domain/rituals/types'

export type ClaimsRouteName = 'RitualDetail' | 'ClaimCompletion' | 'ConfirmationInbox' | 'SettlementReceipt'
export type ClaimsRouteParams = RootStackParamList[ClaimsRouteName]
export type RitualRoute = { readonly ritualId: RitualId }
export type EventRoute = { readonly ritualId: RitualId; readonly eventIndex: EventIndex }

const isRecord = (value: unknown): value is object => value !== null && typeof value === 'object'
function dataDescriptors(value: object, keys: readonly string[]): Record<string, PropertyDescriptor> | null {
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const ownKeys = Reflect.ownKeys(descriptors)
    if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))) return null
    if (keys.some((key) => !descriptors[key] || 'get' in descriptors[key] || 'set' in descriptors[key])) return null
    return descriptors
  } catch {
    return null
  }
}

export function parseRitualRouteParams(value: unknown): RitualRoute | null {
  if (!isRecord(value)) return null
  const descriptors = dataDescriptors(value, ['ritualId'])
  const id = descriptors?.ritualId?.value
  return typeof id === 'string' && id.length > 0 ? { ritualId: id as RitualId } : null
}

export function parseEventRouteParams(value: unknown): EventRoute | null {
  if (!isRecord(value)) return null
  const descriptors = dataDescriptors(value, ['ritualId', 'eventIndex'])
  const id = descriptors?.ritualId?.value
  const index = descriptors?.eventIndex?.value
  return typeof id === 'string' && id.length > 0 && typeof index === 'number' && Number.isSafeInteger(index) && index >= 0
    ? { ritualId: id as RitualId, eventIndex: index as EventIndex } : null
}

export const ritualDetailTarget = (ritualId: string): { readonly name: 'RitualDetail'; readonly params: { readonly ritualId: string } } => ({ name: 'RitualDetail', params: { ritualId } })
export const claimCompletionTarget = (ritualId: string, eventIndex: number): { readonly name: 'ClaimCompletion'; readonly params: { readonly ritualId: string; readonly eventIndex: number } } => ({ name: 'ClaimCompletion', params: { ritualId, eventIndex } })
export const confirmationInboxTarget = (ritualId: string, eventIndex: number): { readonly name: 'ConfirmationInbox'; readonly params: { readonly ritualId: string; readonly eventIndex: number } } => ({ name: 'ConfirmationInbox', params: { ritualId, eventIndex } })
export const settlementReceiptTarget = (ritualId: string, eventIndex: number): { readonly name: 'SettlementReceipt'; readonly params: { readonly ritualId: string; readonly eventIndex: number } } => ({ name: 'SettlementReceipt', params: { ritualId, eventIndex } })
