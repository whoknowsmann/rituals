export const CONFIRMATION_MODES = ['HONOR', 'ONE_FRIEND', 'MAJORITY', 'UNANIMOUS'] as const
export type ConfirmationMode = (typeof CONFIRMATION_MODES)[number]

export const RITUAL_STATUSES = ['DRAFT', 'FUNDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const
export type RitualStatus = (typeof RITUAL_STATUSES)[number]

export const CLAIM_STATUSES = ['UNCLAIMED', 'PENDING', 'CONFIRMED', 'QUESTIONED'] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

export const EVENT_STATUSES = ['SCHEDULED', 'CLAIMING', 'RESOLVING', 'SETTLED', 'VOIDED'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export const DEVNET_CLUSTER = 'devnet' as const
export const SUPPORTED_CLUSTERS = [DEVNET_CLUSTER] as const
export type DevnetCluster = typeof DEVNET_CLUSTER
export type Cluster = (typeof SUPPORTED_CLUSTERS)[number]

declare const publicKeyTextBrand: unique symbol
declare const ritualIdBrand: unique symbol
declare const tokenAtomicUnitsBrand: unique symbol
declare const eventIndexBrand: unique symbol
declare const unixTimestampSecondsBrand: unique symbol
declare const ruleDigestBrand: unique symbol
declare const memberIndexBrand: unique symbol

export type PublicKeyText = string & { readonly [publicKeyTextBrand]: 'PublicKeyText' }
export type RitualId = string & { readonly [ritualIdBrand]: 'RitualId' }
export type TokenAtomicUnits = bigint & { readonly [tokenAtomicUnitsBrand]: 'TokenAtomicUnits' }
export type EventIndex = number & { readonly [eventIndexBrand]: 'EventIndex' }
export type UnixTimestampSeconds = number & {
  readonly [unixTimestampSecondsBrand]: 'UnixTimestampSeconds'
}
export type RuleDigest = string & { readonly [ruleDigestBrand]: 'RuleDigest' }
export type MemberIndex = number & { readonly [memberIndexBrand]: 'MemberIndex' }
