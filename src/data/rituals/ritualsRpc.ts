import { PublicKey } from '@solana/web3.js'
import { decodeCompletionClaim, decodeProtocolConfig, decodeRitual, decodeRitualEvent, type CompletionClaimAccountView, type ProtocolConfigAccountView, type RitualAccountView, type RitualEventAccountView } from './accounts'
import { claimPda, eventPda, protocolConfigPda } from './pdas'
import { RITUALS_CURRENT_CONFIG } from './programIds'

/** Stable failure classes for the read-only Rituals RPC boundary. */
export type RitualRpcErrorCategory = 'deployment' | 'input' | 'rpc' | 'not-found' | 'stale' | 'decode' | 'canonical'

export class RitualRpcError extends Error {
  readonly category: RitualRpcErrorCategory
  readonly cause?: unknown
  constructor(category: RitualRpcErrorCategory, message: string, cause?: unknown) {
    super(message)
    this.name = 'RitualRpcError'
    this.category = category
    this.cause = cause
  }
}

export type ReadOptions = Readonly<{ minContextSlot?: number }>
export type RitualRpcCommitment = 'confirmed'
export type RitualRpcAccountInfo = Readonly<{ owner: PublicKey; data: Uint8Array; executable: boolean }>
export type RitualRpcResponse = Readonly<{ context: Readonly<{ slot: number }>; value: readonly (RitualRpcAccountInfo | null)[] }>
export type RitualRpcTransport = {
  getMultipleAccountsInfoAndContext: (publicKeys: PublicKey[], config: Readonly<{ commitment: 'confirmed'; minContextSlot?: number }>) => Promise<RitualRpcResponse>
}

export type RitualRead = Readonly<{
  slot: number
  address: PublicKey
  protocolConfigAddress: PublicKey
  protocolConfig: ProtocolConfigAccountView
  account: RitualAccountView
}>
export type EventRead = Readonly<{
  slot: number
  address: PublicKey
  ritualAddress: PublicKey
  protocolConfigAddress: PublicKey
  protocolConfig: ProtocolConfigAccountView
  ritual: RitualRead
  account: RitualEventAccountView
}>
export type ClaimRead = Readonly<{
  slot: number
  address: PublicKey
  ritualAddress: PublicKey
  eventAddress: PublicKey
  claimant: PublicKey
  protocolConfigAddress: PublicKey
  protocolConfig: ProtocolConfigAccountView
  ritual: RitualRead
  event: EventRead
  account: CompletionClaimAccountView
}>

const isSafeSlot = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
function maxMin(...values: number[]): number {
  if (values.length === 0 || values.some((value) => !isSafeSlot(value))) throw failure('input', 'minimum context slots must be safe nonnegative integers')
  return Math.max(...values)
}
const key = (value: unknown, name: string): PublicKey => {
  if (!(value instanceof PublicKey) || value.equals(PublicKey.default)) throw new RitualRpcError('input', `${name} must be a non-default PublicKey`)
  return new PublicKey(value.toBytes())
}
const options = (value?: ReadOptions): ReadOptions => {
  if (value === undefined) return Object.freeze({})
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new RitualRpcError('input', 'read options must be an object')
  let min: unknown
  try { min = (value as { minContextSlot?: unknown }).minContextSlot } catch (error) { throw failure('input', 'read options could not be read', error) }
  if (min !== undefined && (!isSafeSlot(min))) throw new RitualRpcError('input', 'minContextSlot must be a safe nonnegative integer')
  return Object.freeze(min === undefined ? {} : { minContextSlot: min })
}

function failure(category: RitualRpcErrorCategory, message: string, cause?: unknown): RitualRpcError {
  return new RitualRpcError(category, message, cause)
}
function wrapRpc(error: unknown): RitualRpcError {
  return error instanceof RitualRpcError ? error : failure('rpc', 'Rituals RPC request failed', error)
}
function decodeFailure(error: unknown): RitualRpcError {
  return error instanceof RitualRpcError ? error : failure('decode', 'Ritual account decoding failed', error)
}

/**
 * Read-only/local/test Rituals RPC reader. It has no signing or write capability.
 * Explicit program IDs are intentionally accepted only for deterministic local/fake transports;
 * the current-production factory below rejects the not-deployed configuration before any RPC call.
 */
export class RitualsRpcReader {
  readonly #transport: RitualRpcTransport
  readonly #programId: PublicKey
  readonly #protocolConfigAddress: PublicKey

  constructor(transport: RitualRpcTransport, programId: PublicKey) {
    if (transport === null || typeof transport !== 'object' || typeof transport.getMultipleAccountsInfoAndContext !== 'function') throw failure('input', 'read-only RPC transport is invalid')
    this.#transport = transport
    this.#programId = key(programId, 'programId')
    this.#protocolConfigAddress = protocolConfigPda(this.#programId)[0]
  }

  get programId(): PublicKey { return new PublicKey(this.#programId.toBytes()) }
  get protocolConfigAddress(): PublicKey { return new PublicKey(this.#protocolConfigAddress.toBytes()) }

  async #fetch(addresses: readonly PublicKey[], readOptions: ReadOptions): Promise<{ slot: number; accounts: readonly (RitualRpcAccountInfo | null)[] }> {
    const requestKeys = addresses.map((address) => key(address, 'account address'))
    let response: unknown
    try {
      response = await this.#transport.getMultipleAccountsInfoAndContext(requestKeys, { commitment: 'confirmed', ...(readOptions.minContextSlot === undefined ? {} : { minContextSlot: readOptions.minContextSlot }) })
    } catch (error) { throw wrapRpc(error) }
    try {
      if (response === null || typeof response !== 'object') throw failure('rpc', 'Rituals RPC response is malformed')
      const context = (response as { context?: unknown }).context
      const values = (response as { value?: unknown }).value
      const slot = context !== null && typeof context === 'object' ? (context as { slot?: unknown }).slot : undefined
      if (context === null || typeof context !== 'object' || !isSafeSlot(slot)) throw failure('rpc', 'Rituals RPC context is malformed')
      if (!Array.isArray(values) || values.length !== requestKeys.length) throw failure('rpc', 'Rituals RPC returned an unexpected account count')
      if (readOptions.minContextSlot !== undefined && slot < readOptions.minContextSlot) throw failure('stale', 'Rituals RPC context is older than requested')
      for (let index = 0; index < values.length; index += 1) if (!Object.hasOwn(values, index)) throw failure('rpc', 'Rituals RPC account value is missing')
      const accounts = values.map((raw): RitualRpcAccountInfo | null => {
        if (raw === null) return null
        if (typeof raw !== 'object') throw failure('rpc', 'Rituals RPC account is malformed')
        let owner: unknown; let data: unknown; let executable: unknown
        try { owner = (raw as { owner: unknown }).owner; data = (raw as { data: unknown }).data; executable = (raw as { executable: unknown }).executable } catch (error) { throw failure('rpc', 'Rituals RPC account could not be read', error) }
        if (!(owner instanceof PublicKey) || !(data instanceof Uint8Array) || typeof executable !== 'boolean' || executable) throw failure('rpc', 'Rituals RPC account snapshot is invalid')
        return Object.freeze({ owner: new PublicKey(owner.toBytes()), data: new Uint8Array(data), executable: false })
      })
      return { slot, accounts }
    } catch (error) { throw error instanceof RitualRpcError ? error : failure('rpc', 'Rituals RPC response is malformed', error) }
  }

  #decode(account: RitualRpcAccountInfo | null, decoder: () => unknown): unknown {
    if (account === null) throw failure('not-found', 'Ritual account was not found')
    try { return decoder() } catch (error) { throw decodeFailure(error) }
  }

  async getProtocolConfig(readOptions?: ReadOptions): Promise<Readonly<{ slot: number; address: PublicKey; account: ProtocolConfigAccountView }>> {
    const opts = options(readOptions)
    const fetched = await this.#fetch([this.#protocolConfigAddress], opts)
    const account = this.#decode(fetched.accounts[0], () => decodeProtocolConfig(fetched.accounts[0], this.#programId)) as ProtocolConfigAccountView
    return Object.freeze({ slot: fetched.slot, address: new PublicKey(this.#protocolConfigAddress.toBytes()), account })
  }

  async getRitual(address: PublicKey, readOptions?: ReadOptions): Promise<RitualRead> {
    const target = key(address, 'ritual address'); const opts = options(readOptions)
    const fetched = await this.#fetch([this.#protocolConfigAddress, target], opts)
    const protocolConfig = this.#decode(fetched.accounts[0], () => decodeProtocolConfig(fetched.accounts[0], this.#programId)) as ProtocolConfigAccountView
    const account = this.#decode(fetched.accounts[1], () => decodeRitual(fetched.accounts[1], this.#programId, protocolConfig.allowedStakeMint, target)) as RitualAccountView
    return Object.freeze({ slot: fetched.slot, address: target, protocolConfigAddress: this.protocolConfigAddress, protocolConfig, account })
  }

  #checkRitual(value: RitualRead): void {
    try {
      if (value === null || typeof value !== 'object' || !isSafeSlot(value.slot) || !(value.address instanceof PublicKey) || !(value.protocolConfigAddress instanceof PublicKey) || !(value.protocolConfig && Object.isFrozen(value.protocolConfig)) || !(value.account && Object.isFrozen(value.account))) throw failure('input', 'ritual read context is invalid')
      if (!value.protocolConfigAddress.equals(this.#protocolConfigAddress) || !value.account.protocolConfig.equals(this.#protocolConfigAddress)) throw failure('canonical', 'ritual read is bound to another protocol config')
    } catch (error) { throw error instanceof RitualRpcError ? error : failure('input', 'ritual read context is invalid', error) }
  }
  #checkEvent(value: EventRead, ritual: RitualRead): void {
    this.#checkRitual(ritual)
    try {
      if (value === null || typeof value !== 'object' || !isSafeSlot(value.slot) || !(value.address instanceof PublicKey) || !(value.ritualAddress instanceof PublicKey) || !value.ritualAddress.equals(ritual.address) || !(value.protocolConfigAddress instanceof PublicKey) || !value.protocolConfigAddress.equals(ritual.protocolConfigAddress) || value.protocolConfig !== ritual.protocolConfig || !(value.account && Object.isFrozen(value.account)) || value.ritual !== ritual || !value.account.ritual.equals(ritual.address)) throw failure('input', 'event read context is invalid')
      if (value.slot < ritual.slot) throw failure('stale', 'event read context is older than ritual read')
    } catch (error) { throw error instanceof RitualRpcError ? error : failure('input', 'event read context is invalid', error) }
  }

  async getEvent(ritual: RitualRead, eventIndex: number, readOptions?: ReadOptions): Promise<EventRead> {
    this.#checkRitual(ritual)
    if (!Number.isSafeInteger(eventIndex) || eventIndex < 0 || eventIndex > 15) throw failure('input', 'eventIndex must be a safe integer in 0..15')
    const opts = options(readOptions); const effectiveOpts = Object.freeze({ minContextSlot: maxMin(opts.minContextSlot ?? 0, ritual.slot) }); const address = eventPda(ritual.address, eventIndex, this.#programId)[0]
    const fetched = await this.#fetch([address], effectiveOpts)
    const account = this.#decode(fetched.accounts[0], () => decodeRitualEvent(fetched.accounts[0], this.#programId)) as RitualEventAccountView
    if (!account.ritual.equals(ritual.address) || account.eventIndex !== eventIndex || account.memberCount !== ritual.account.members.length) throw failure('canonical', 'Ritual event is not bound to its ritual')
    const expected = ritual.account.schedule[eventIndex]
    if (!expected || account.window.opens !== expected.opens || account.window.deadline !== expected.deadline || account.window.resolution !== expected.resolution || account.bump !== eventPda(ritual.address, eventIndex, this.#programId)[1] || !address.equals(eventPda(ritual.address, eventIndex, this.#programId)[0])) throw failure('canonical', 'Ritual event does not match canonical schedule or PDA')
    return Object.freeze({ slot: fetched.slot, address, ritualAddress: ritual.address, protocolConfigAddress: ritual.protocolConfigAddress, protocolConfig: ritual.protocolConfig, ritual, account })
  }

  async getClaim(ritual: RitualRead, event: EventRead, claimant: PublicKey, readOptions?: ReadOptions): Promise<ClaimRead> {
    this.#checkEvent(event, ritual); const target = key(claimant, 'claimant'); const opts = options(readOptions); const effectiveOpts = Object.freeze({ minContextSlot: maxMin(opts.minContextSlot ?? 0, ritual.slot, event.slot) })
    const memberIndex = ritual.account.members.findIndex((member) => member.equals(target))
    if (memberIndex < 0) throw failure('input', 'claimant is not a Ritual member')
    if (event.account.eventIndex >= ritual.account.schedule.length || !event.account.ritual.equals(ritual.address)) throw failure('canonical', 'event is not bound to ritual')
    const address = claimPda(event.address, target, 0, this.#programId)[0]; const fetched = await this.#fetch([address], effectiveOpts)
    const account = this.#decode(fetched.accounts[0], () => decodeCompletionClaim(fetched.accounts[0], this.#programId)) as CompletionClaimAccountView
    const expectedBump = claimPda(event.address, target, 0, this.#programId)[1]
    if (!account.ritual.equals(ritual.address) || !account.event.equals(event.address) || account.eventIndex !== event.account.eventIndex || !account.claimant.equals(target) || account.memberIndex !== memberIndex || account.claimVersion !== 0 || account.requiredAdditionalConfirmations !== ritual.account.additionalConfirmationThreshold || account.bump !== expectedBump || !address.equals(claimPda(event.address, target, 0, this.#programId)[0]) || account.claimedAt < event.account.window.opens || account.claimedAt > event.account.window.deadline) throw failure('canonical', 'Completion claim does not match canonical Ritual, event, member, or window')
    return Object.freeze({ slot: fetched.slot, address, ritualAddress: ritual.address, eventAddress: event.address, claimant: target, protocolConfigAddress: ritual.protocolConfigAddress, protocolConfig: ritual.protocolConfig, ritual, event, account })
  }
}

/** Create the explicit-program local/test reader; never an authorization or deployment factory. */
export const createRitualsRpcReader = (transport: RitualRpcTransport, programId: PublicKey): RitualsRpcReader => new RitualsRpcReader(transport, programId)
export { RitualsRpcReader as ReadOnlyRitualsRpcReader }

/** Current deployment is deliberately unavailable; this fails before touching the transport. */
export function createCurrentRitualsRpcReader(_transport: RitualRpcTransport): never {
  void _transport
  if (RITUALS_CURRENT_CONFIG.programId === null) throw failure('deployment', 'No authorized Rituals deployment is configured')
  throw failure('deployment', 'No authorized Rituals deployment is configured')
}
