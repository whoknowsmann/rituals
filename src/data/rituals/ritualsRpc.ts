import { PublicKey, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { classicTokenBalance, ejectAmounts, type EjectQuote } from './ejectQuote'
import { decodeCompletionClaim, decodeProtocolConfig, decodeRitual, decodeRitualEvent, type CompletionClaimAccountView, type ProtocolConfigAccountView, type RitualAccountView, type RitualEventAccountView, claimShapeMatchesRitual } from './accounts'
import { claimPda, eventPda, protocolConfigPda, ritualPda, CURRENT_CLAIM_VERSION } from './pdas'

/** Stable failure classes for the read-only Rituals RPC boundary. */
export type RitualRpcErrorCategory = 'deployment' | 'input' | 'rpc' | 'not-found' | 'stale' | 'decode' | 'canonical' | 'unstable'

export class RitualRpcError extends Error {
  readonly category: RitualRpcErrorCategory
  constructor(category: RitualRpcErrorCategory, message: string) {
    super(message)
    this.name = 'RitualRpcError'
    this.category = category
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

export type BundleClaimRead = Readonly<{
  memberIndex: number
  member: PublicKey
  address: PublicKey
  account: CompletionClaimAccountView | null
}>

export type RitualBundleRead = Readonly<{
  slot: number
  ritual: RitualRead
  event: EventRead | null
  claims: readonly BundleClaimRead[]
}>

const isSafeSlot = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
function maxMin(...values: number[]): number {
  if (values.length === 0 || values.some((value) => !isSafeSlot(value))) throw failure('input', 'minimum context slots must be safe nonnegative integers')
  return Math.max(...values)
}
const key = (value: unknown, name: string): PublicKey => {
  try {
    if (!(value instanceof PublicKey) || value.equals(PublicKey.default)) throw new RitualRpcError('input', `${name} must be a non-default PublicKey`)
    return new PublicKey(value.toBytes())
  } catch (error) {
    if (error instanceof RitualRpcError) throw error
    throw failure('input', `${name} must be a readable non-default PublicKey`)
  }
}
const options = (value?: ReadOptions): ReadOptions => {
  if (value === undefined) return Object.freeze({})
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new RitualRpcError('input', 'read options must be an object')
  let min: unknown
  try { min = (value as { minContextSlot?: unknown }).minContextSlot } catch { throw failure('input', 'read options could not be read') }
  if (min !== undefined && (!isSafeSlot(min))) throw new RitualRpcError('input', 'minContextSlot must be a safe nonnegative integer')
  return Object.freeze(min === undefined ? {} : { minContextSlot: min })
}

function failure(category: RitualRpcErrorCategory, message: string): RitualRpcError {
  return new RitualRpcError(category, message)
}
function wrapRpc(error: unknown): RitualRpcError {
  return error instanceof RitualRpcError ? error : failure('rpc', 'Rituals RPC request failed')
}
function decodeFailure(error: unknown): RitualRpcError {
  return error instanceof RitualRpcError ? error : failure('decode', 'Ritual account decoding failed')
}

const immutableRitualEqual = (left: RitualAccountView, right: RitualAccountView): boolean => {
  const sameKey = (a: PublicKey, b: PublicKey): boolean => a.equals(b)
  const sameWindows = left.schedule.length === right.schedule.length && left.schedule.every((window, index) => {
    const other = right.schedule[index]
    return window.opens === other.opens && window.deadline === other.deadline && window.resolution === other.resolution
  })
  return left.schemaVersion === right.schemaVersion && sameKey(left.protocolConfig, right.protocolConfig) && sameKey(left.creator, right.creator) && left.nonce === right.nonce && left.ruleDigest === right.ruleDigest && sameKey(left.stakeMint, right.stakeMint) && left.members.length === right.members.length && left.members.every((member, index) => sameKey(member, right.members[index])) && left.memberTotalStake === right.memberTotalStake && left.perEventAllocation === right.perEventAllocation && sameWindows && left.additionalConfirmationThreshold === right.additionalConfirmationThreshold && left.feePayerMode === right.feePayerMode && left.lockedActivationFee === right.lockedActivationFee && left.stakeDecimals === right.stakeDecimals && sameKey(left.lockedFeeRecipient, right.lockedFeeRecipient) && sameKey(left.stakeVault, right.stakeVault) && sameKey(left.feeVault, right.feeVault) && left.stakeVaultBump === right.stakeVaultBump && left.feeVaultBump === right.feeVaultBump && left.createdAt === right.createdAt && left.bump === right.bump
}

const sameProtocolConfigIdentity = (left: ProtocolConfigAccountView, right: ProtocolConfigAccountView): boolean => left.schemaVersion === right.schemaVersion && left.authority.equals(right.authority) && left.allowedStakeMint.equals(right.allowedStakeMint) && left.feeRecipient.equals(right.feeRecipient) && left.feeBasisPoints === right.feeBasisPoints && left.minimumFee === right.minimumFee && left.maximumFee === right.maximumFee && left.maximumMemberStake === right.maximumMemberStake && left.maxMembers === right.maxMembers && left.maxEvents === right.maxEvents && left.paused === right.paused && left.bump === right.bump

const bundleMismatch = (): never => { throw failure('canonical', 'Ritual immutable fields changed across bundle read') }

/**
 * Read-only/local/test Rituals RPC reader. It has no signing or write capability.
 * Explicit program IDs are intentionally accepted only for deterministic local/fake transports;
 * the current-production factory below rejects the not-deployed configuration before any RPC call.
 */
export class RitualsRpcReader {
  readonly #transport: RitualRpcTransport
  readonly #programId: PublicKey
  readonly #protocolConfigAddress: PublicKey
  readonly #ritualReads = new WeakSet<object>()
  readonly #eventReads = new WeakSet<object>()

  constructor(transport: RitualRpcTransport, programId: PublicKey) {
    let method: unknown
    try {
      if (transport === null || typeof transport !== 'object' || Array.isArray(transport)) throw failure('input', 'read-only RPC transport is invalid')
      method = (transport as { getMultipleAccountsInfoAndContext?: unknown }).getMultipleAccountsInfoAndContext
    } catch (error) {
      throw error instanceof RitualRpcError ? error : failure('input', 'read-only RPC transport is invalid')
    }
    if (typeof method !== 'function') throw failure('input', 'read-only RPC transport is invalid')
    this.#transport = Object.freeze({ getMultipleAccountsInfoAndContext: method.bind(transport) })
    this.#programId = key(programId, 'programId')
    try { this.#protocolConfigAddress = protocolConfigPda(this.#programId)[0] } catch { throw failure('input', 'programId cannot derive the protocol config address') }
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
      if (response === null || typeof response !== 'object' || Array.isArray(response)) throw failure('rpc', 'Rituals RPC response is malformed')
      const context = (response as { context?: unknown }).context
      const values = (response as { value?: unknown }).value
      const slot = context !== null && typeof context === 'object' ? (context as { slot?: unknown }).slot : undefined
      if (context === null || typeof context !== 'object' || Array.isArray(context) || !isSafeSlot(slot)) throw failure('rpc', 'Rituals RPC context is malformed')
      if (!Array.isArray(values) || values.length !== requestKeys.length) throw failure('rpc', 'Rituals RPC returned an unexpected account count')
      if (readOptions.minContextSlot !== undefined && slot < readOptions.minContextSlot) throw failure('stale', 'Rituals RPC context is older than requested')
      for (let index = 0; index < values.length; index += 1) if (!Object.hasOwn(values, index)) throw failure('rpc', 'Rituals RPC account value is missing')
      const accounts = values.map((raw): RitualRpcAccountInfo | null => {
        if (raw === null) return null
        if (typeof raw !== 'object' || Array.isArray(raw)) throw failure('rpc', 'Rituals RPC account is malformed')
        let owner: unknown; let data: unknown; let executable: unknown
        try { owner = (raw as { owner: unknown }).owner; data = (raw as { data: unknown }).data; executable = (raw as { executable: unknown }).executable } catch { throw failure('rpc', 'Rituals RPC account could not be read') }
        if (!(owner instanceof PublicKey) || !(data instanceof Uint8Array) || typeof executable !== 'boolean' || executable) throw failure('rpc', 'Rituals RPC account snapshot is invalid')
        return Object.freeze({ owner: new PublicKey(owner.toBytes()), data: new Uint8Array(data), executable: false })
      })
      return { slot, accounts }
    } catch (error) { throw error instanceof RitualRpcError ? error : failure('rpc', 'Rituals RPC response is malformed') }
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
    const result = Object.freeze({ slot: fetched.slot, address: target, protocolConfigAddress: this.protocolConfigAddress, protocolConfig, account })
    this.#ritualReads.add(result)
    return result
  }

  #checkRitual(value: RitualRead): void {
    try {
      if (value === null || typeof value !== 'object' || Array.isArray(value) || !isSafeSlot(value.slot) || !(value.address instanceof PublicKey) || !(value.protocolConfigAddress instanceof PublicKey) || !(value.protocolConfig && Object.isFrozen(value.protocolConfig)) || !(value.account && Object.isFrozen(value.account))) throw failure('input', 'ritual read context is invalid')
      if (!this.#ritualReads.has(value)) throw failure('input', 'ritual read context is not produced by this reader')
      if (!value.protocolConfigAddress.equals(this.#protocolConfigAddress) || !value.account.protocolConfig.equals(this.#protocolConfigAddress)) throw failure('canonical', 'ritual read is bound to another protocol config')
      const [canonicalAddress] = ritualPda(value.account.creator, value.account.nonce, this.#programId)
      if (!value.address.equals(canonicalAddress)) throw failure('canonical', 'ritual read address is not canonical')
    } catch (error) { throw error instanceof RitualRpcError ? error : failure('input', 'ritual read context is invalid') }
  }
  #checkEvent(value: EventRead, ritual: RitualRead, indexedEventIndex?: number): void {
    this.#checkRitual(ritual)
    try {
      if (value === null || typeof value !== 'object' || Array.isArray(value) || !isSafeSlot(value.slot) || !(value.address instanceof PublicKey) || !(value.ritualAddress instanceof PublicKey) || !(value.protocolConfigAddress instanceof PublicKey) || !(value.account && Object.isFrozen(value.account)) || value.ritual !== ritual || value.protocolConfig !== ritual.protocolConfig) throw failure('input', 'event read context is invalid')
      if (!this.#eventReads.has(value)) throw failure('input', 'event read context is not produced by this reader')
      if (value.slot < ritual.slot) throw failure('stale', 'event read context is older than ritual read')
      if (!value.ritualAddress.equals(ritual.address) || !value.protocolConfigAddress.equals(ritual.protocolConfigAddress)) throw failure('canonical', 'event read is bound to another ritual or protocol config')

      const account = value.account
      if (!Number.isSafeInteger(account.eventIndex) || account.eventIndex < 0 || account.eventIndex > 15) throw failure('input', 'event read context is invalid')
      const expectedEventIndex = indexedEventIndex ?? (ritual.account.status === 'Completed' ? ritual.account.schedule.length - 1 : ritual.account.currentEventIndex)
      if (!account.ritual.equals(ritual.address) || account.eventIndex !== expectedEventIndex || account.eventIndex >= ritual.account.schedule.length || account.memberCount !== ritual.account.members.length) throw failure('canonical', 'Ritual event is not bound to its ritual')
      const expected = ritual.account.schedule[account.eventIndex]
      const [canonicalAddress, canonicalBump] = eventPda(ritual.address, account.eventIndex, this.#programId)
      if (account.window.opens !== expected.opens || account.window.deadline !== expected.deadline || account.window.resolution !== expected.resolution || account.bump !== canonicalBump || !value.address.equals(canonicalAddress)) throw failure('canonical', 'Ritual event does not match canonical schedule or PDA')
    } catch (error) { throw error instanceof RitualRpcError ? error : failure('input', 'event read context is invalid') }
  }

  async getEvent(ritual: RitualRead, eventIndex: number, readOptions?: ReadOptions): Promise<EventRead> {
    this.#checkRitual(ritual)
    if (!Number.isSafeInteger(eventIndex) || eventIndex < 0 || eventIndex > 15) throw failure('input', 'eventIndex must be a safe integer in 0..15')
    const opts = options(readOptions); const effectiveOpts = Object.freeze({ minContextSlot: maxMin(opts.minContextSlot ?? 0, ritual.slot) }); const address = eventPda(ritual.address, eventIndex, this.#programId)[0]
    const fetched = await this.#fetch([address], effectiveOpts)
    const account = this.#decode(fetched.accounts[0], () => decodeRitualEvent(fetched.accounts[0], this.#programId, ritual.account.status === 'Ended' ? ritual.account.completedAt : undefined)) as RitualEventAccountView
    const candidate = Object.freeze({ slot: fetched.slot, address, ritualAddress: ritual.address, protocolConfigAddress: ritual.protocolConfigAddress, protocolConfig: ritual.protocolConfig, ritual, account })
    this.#eventReads.add(candidate)
    this.#checkEvent(candidate, ritual)
    return candidate
  }

  async getRitualBundle(address: PublicKey, readOptions?: ReadOptions): Promise<RitualBundleRead> {
    const target = key(address, 'ritual address')
    const opts = options(readOptions)
    let discovery = await this.getRitual(target, opts)
    if (discovery.account.status === 'Funding' || discovery.account.status === 'Cancelled' || discovery.account.status === 'Ended') {
      return Object.freeze({ slot: discovery.slot, ritual: discovery, event: null, claims: Object.freeze([]) })
    }

    let requestedIndex = discovery.account.status === 'Completed'
      ? discovery.account.schedule.length - 1
      : discovery.account.currentEventIndex
    let minContextSlot = maxMin(opts.minContextSlot ?? 0, discovery.slot)
    const discoveryAccount = discovery.account
    const discoveryProtocolConfig = discovery.protocolConfig

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const eventAddress = eventPda(target, requestedIndex, this.#programId)[0]
      const claimAddresses = discovery.account.members.map(member => claimPda(eventAddress, member, CURRENT_CLAIM_VERSION, this.#programId)[0])
      const fetched = await this.#fetch([this.#protocolConfigAddress, target, eventAddress, ...claimAddresses], Object.freeze({ minContextSlot }))
      const protocolConfig = this.#decode(fetched.accounts[0], () => decodeProtocolConfig(fetched.accounts[0], this.#programId)) as ProtocolConfigAccountView
      const account = this.#decode(fetched.accounts[1], () => decodeRitual(fetched.accounts[1], this.#programId, protocolConfig.allowedStakeMint, target)) as RitualAccountView
      const ritual = Object.freeze({ slot: fetched.slot, address: target, protocolConfigAddress: this.protocolConfigAddress, protocolConfig, account })
      this.#ritualReads.add(ritual)

      const nextIndex = account.status === 'Completed' ? account.schedule.length - 1 : account.currentEventIndex
      if (discovery.account.status === 'Active' && nextIndex < discovery.account.currentEventIndex) throw failure('canonical', 'Ritual lifecycle regressed across bundle read')
      if (!sameProtocolConfigIdentity(discoveryProtocolConfig, protocolConfig) || !immutableRitualEqual(discoveryAccount, account)) bundleMismatch()
      if (account.status === 'Ended') return Object.freeze({ slot: fetched.slot, ritual, event: null, claims: Object.freeze([]) })
      if (account.status === 'Funding' || account.status === 'Cancelled') throw failure('canonical', 'Ritual lifecycle changed across bundle read')
      if (discovery.account.status === 'Completed' && account.status !== 'Completed') throw failure('canonical', 'Ritual lifecycle regressed across bundle read')
      if (discovery.account.status === 'Active' && account.status !== 'Active' && account.status !== 'Completed') throw failure('canonical', 'Ritual lifecycle changed across bundle read')
      if (nextIndex !== requestedIndex) {
        discovery = ritual
        requestedIndex = nextIndex
        minContextSlot = fetched.slot
        continue
      }
      const expectedEventAddress = eventPda(target, nextIndex, this.#programId)[0]
      const expectedClaimAddresses = account.members.map(member => claimPda(expectedEventAddress, member, CURRENT_CLAIM_VERSION, this.#programId)[0])
      if (!eventAddress.equals(expectedEventAddress) || claimAddresses.length !== expectedClaimAddresses.length || claimAddresses.some((address, index) => !address.equals(expectedClaimAddresses[index]))) bundleMismatch()

      const rawEvent = fetched.accounts[2]
      if (rawEvent === null) {
        if (account.status === 'Completed') throw failure('not-found', 'Ritual final event was not found')
        if (fetched.accounts.slice(3).some(value => value !== null)) throw failure('canonical', 'Ritual claims exist without an event')
        return Object.freeze({ slot: fetched.slot, ritual, event: null, claims: Object.freeze([]) })
      }
      const eventAccount = this.#decode(rawEvent, () => decodeRitualEvent(rawEvent, this.#programId)) as RitualEventAccountView
      const event = Object.freeze({ slot: fetched.slot, address: eventAddress, ritualAddress: target, protocolConfigAddress: ritual.protocolConfigAddress, protocolConfig: ritual.protocolConfig, ritual, account: eventAccount })
      this.#eventReads.add(event)
      this.#checkEvent(event, ritual)
      if (account.status === 'Active' && !['Scheduled', 'Claiming', 'Resolving'].includes(eventAccount.status)) throw failure('canonical', 'Active Ritual event is not unresolved')
      if (account.status === 'Completed' && !['Settled', 'Voided'].includes(eventAccount.status)) throw failure('canonical', 'Completed Ritual event is not terminal')

      const claims: BundleClaimRead[] = []
      let claimed = 0; let confirmed = 0; let questioned = 0
      for (let index = 0; index < account.members.length; index += 1) {
        const member = new PublicKey(account.members[index].toBytes())
        const claimAddress = claimAddresses[index]
        const rawClaim = fetched.accounts[index + 3]
        let claimAccount: CompletionClaimAccountView | null = null
        if (rawClaim !== null) {
          claimAccount = this.#decode(rawClaim, () => decodeCompletionClaim(rawClaim, this.#programId)) as CompletionClaimAccountView
          if (!claimShapeMatchesRitual(claimAccount, account)) throw failure('canonical', 'CompletionClaim approval shape does not match the Ritual kind')
          const expectedBump = claimPda(eventAddress, member, CURRENT_CLAIM_VERSION, this.#programId)[1]
          if (!claimAccount.ritual.equals(target) || !claimAccount.event.equals(eventAddress) || claimAccount.eventIndex !== requestedIndex || !claimAccount.claimant.equals(member) || claimAccount.memberIndex !== index || claimAccount.claimVersion !== CURRENT_CLAIM_VERSION || claimAccount.requiredAdditionalConfirmations !== account.additionalConfirmationThreshold || claimAccount.bump !== expectedBump || claimAccount.claimedAt < eventAccount.window.opens || claimAccount.claimedAt > eventAccount.window.deadline || (claimAccount.approvalsBitmap & ~account.fundedMembersBitmap) !== 0 || !claimAddress.equals(claimPda(eventAddress, member, CURRENT_CLAIM_VERSION, this.#programId)[0])) throw failure('canonical', 'Completion claim does not match canonical Ritual, event, member, or window')
          claimed |= 1 << index
          if (claimAccount.status === 'Confirmed') {
            confirmed |= 1 << index
            if ((eventAccount.confirmedMembersBitmap & (1 << index)) === 0) throw failure('canonical', 'Ritual event and claims bitmaps do not correlate')
          }
          if (claimAccount.status === 'Questioned') {
            questioned |= 1 << index
            if ((eventAccount.questionedMembersBitmap & (1 << index)) === 0) throw failure('canonical', 'Ritual event and claims bitmaps do not correlate')
          }
          if (claimAccount.status === 'Pending' && ((eventAccount.confirmedMembersBitmap | eventAccount.questionedMembersBitmap) & (1 << index)) !== 0) throw failure('canonical', 'Ritual event and claims bitmaps do not correlate')
        }
        claims.push(Object.freeze({ memberIndex: index, member, address: new PublicKey(claimAddress.toBytes()), account: claimAccount }))
      }
      if (eventAccount.claimedMembersBitmap !== claimed || eventAccount.confirmedMembersBitmap !== confirmed || eventAccount.questionedMembersBitmap !== questioned) throw failure('canonical', 'Ritual event and claims bitmaps do not correlate')
      return Object.freeze({ slot: fetched.slot, ritual, event, claims: Object.freeze(claims) })
    }
    throw failure('unstable', 'Ritual event advanced while reading bundle')
  }

  /** Read one explicit historical/current event without retrying to a moving current index. */
  async getEventBundle(address: PublicKey, eventIndex: number, readOptions?: ReadOptions): Promise<RitualBundleRead> {
    const target = key(address, 'ritual address')
    if (!Number.isSafeInteger(eventIndex) || eventIndex < 0 || eventIndex > 15) throw failure('input', 'eventIndex must be a safe integer in 0..15')
    const opts = options(readOptions)
    const discovery = await this.getRitual(target, opts)
    const ritualAccount = discovery.account
    if (ritualAccount.status === 'Funding' || ritualAccount.status === 'Cancelled') throw failure('canonical', 'Ritual event bundle is unavailable in this lifecycle state')
    if (eventIndex >= ritualAccount.schedule.length) throw failure('input', 'eventIndex is outside the Ritual schedule')
    const current = ritualAccount.status === 'Completed' ? ritualAccount.schedule.length : ritualAccount.currentEventIndex
    if (ritualAccount.status === 'Active' && eventIndex > current) throw failure('canonical', 'Ritual event is in the future')
    const eventAddress = eventPda(target, eventIndex, this.#programId)[0]
    const claimAddresses = ritualAccount.members.map(member => claimPda(eventAddress, member, CURRENT_CLAIM_VERSION, this.#programId)[0])
    const fetched = await this.#fetch([this.#protocolConfigAddress, target, eventAddress, ...claimAddresses], Object.freeze({ minContextSlot: maxMin(opts.minContextSlot ?? 0, discovery.slot) }))
    const protocolConfig = this.#decode(fetched.accounts[0], () => decodeProtocolConfig(fetched.accounts[0], this.#programId)) as ProtocolConfigAccountView
    const account = this.#decode(fetched.accounts[1], () => decodeRitual(fetched.accounts[1], this.#programId, protocolConfig.allowedStakeMint, target)) as RitualAccountView
    if (!sameProtocolConfigIdentity(discovery.protocolConfig, protocolConfig) || !immutableRitualEqual(discovery.account, account)) bundleMismatch()
    if (discovery.account.status === 'Active' && account.status === 'Active' && account.currentEventIndex < discovery.account.currentEventIndex) throw failure('canonical', 'Ritual lifecycle regressed across bundle read')
    if (discovery.account.status === 'Completed' && account.status !== 'Completed') throw failure('canonical', 'Ritual lifecycle regressed across bundle read')
    if (account.status === 'Funding' || account.status === 'Cancelled') throw failure('canonical', 'Ritual lifecycle changed across bundle read')
    if (account.status === 'Active' && eventIndex > account.currentEventIndex) throw failure('canonical', 'Ritual event is in the future')
    if (account.status === 'Completed' && eventIndex >= account.schedule.length) throw failure('canonical', 'Completed Ritual event index is invalid')
    const ritual = Object.freeze({ slot: fetched.slot, address: target, protocolConfigAddress: this.protocolConfigAddress, protocolConfig, account })
    this.#ritualReads.add(ritual)
    const rawEvent = fetched.accounts[2]
    if (rawEvent === null) throw failure('not-found', 'Ritual event was not found')
    const eventAccount = this.#decode(rawEvent, () => decodeRitualEvent(rawEvent, this.#programId, account.status === 'Ended' ? account.completedAt : undefined)) as RitualEventAccountView
    const event = Object.freeze({ slot: fetched.slot, address: eventAddress, ritualAddress: target, protocolConfigAddress: ritual.protocolConfigAddress, protocolConfig: ritual.protocolConfig, ritual, account: eventAccount })
    this.#eventReads.add(event)
    this.#checkEvent(event, ritual, eventIndex)
    const historical = eventIndex < account.currentEventIndex || account.status === 'Completed'
    if (historical && !['Settled', 'Voided'].includes(eventAccount.status)) throw failure('canonical', 'Historical Ritual event is not terminal')
    if (account.status === 'Active' && eventIndex === account.currentEventIndex && !['Scheduled', 'Claiming', 'Resolving'].includes(eventAccount.status)) throw failure('canonical', 'Active Ritual event is not unresolved')
    const claims: BundleClaimRead[] = []; let claimed = 0; let confirmed = 0; let questioned = 0
    for (let index = 0; index < account.members.length; index += 1) {
      const member = new PublicKey(account.members[index].toBytes()); const claimAddress = claimAddresses[index]; const rawClaim = fetched.accounts[index + 3]
      let claimAccount: CompletionClaimAccountView | null = null
      if (rawClaim !== null) {
        claimAccount = this.#decode(rawClaim, () => decodeCompletionClaim(rawClaim, this.#programId)) as CompletionClaimAccountView
        if (!claimShapeMatchesRitual(claimAccount, account)) throw failure('canonical', 'CompletionClaim approval shape does not match the Ritual kind')
        const expectedBump = claimPda(eventAddress, member, CURRENT_CLAIM_VERSION, this.#programId)[1]
        if (!claimAccount.ritual.equals(target) || !claimAccount.event.equals(eventAddress) || claimAccount.eventIndex !== eventIndex || !claimAccount.claimant.equals(member) || claimAccount.memberIndex !== index || claimAccount.claimVersion !== CURRENT_CLAIM_VERSION || claimAccount.requiredAdditionalConfirmations !== account.additionalConfirmationThreshold || claimAccount.bump !== expectedBump || claimAccount.claimedAt < eventAccount.window.opens || claimAccount.claimedAt > eventAccount.window.deadline || (claimAccount.approvalsBitmap & ~account.fundedMembersBitmap) !== 0 || !claimAddress.equals(claimPda(eventAddress, member, CURRENT_CLAIM_VERSION, this.#programId)[0])) throw failure('canonical', 'Completion claim does not match canonical Ritual, event, member, or window')
        claimed |= 1 << index
        if (claimAccount.status === 'Confirmed') { confirmed |= 1 << index; if ((eventAccount.confirmedMembersBitmap & (1 << index)) === 0) throw failure('canonical', 'Ritual event and claims bitmaps do not correlate') }
        if (claimAccount.status === 'Questioned') { questioned |= 1 << index; if ((eventAccount.questionedMembersBitmap & (1 << index)) === 0) throw failure('canonical', 'Ritual event and claims bitmaps do not correlate') }
        if (claimAccount.status === 'Pending' && ((eventAccount.confirmedMembersBitmap | eventAccount.questionedMembersBitmap) & (1 << index)) !== 0) throw failure('canonical', 'Ritual event and claims bitmaps do not correlate')
      }
      claims.push(Object.freeze({ memberIndex: index, member, address: new PublicKey(claimAddress.toBytes()), account: claimAccount }))
    }
    if (eventAccount.claimedMembersBitmap !== claimed || eventAccount.confirmedMembersBitmap !== confirmed || eventAccount.questionedMembersBitmap !== questioned) throw failure('canonical', 'Ritual event and claims bitmaps do not correlate')
    return Object.freeze({ slot: fetched.slot, ritual, event, claims: Object.freeze(claims) })
  }

  async getCurrentRitualBundle(address: PublicKey, readOptions?: ReadOptions): Promise<RitualBundleRead> {
    return this.getRitualBundle(address, readOptions)
  }

  /** One snapshot for the end-early receipt: the ritual, the chain clock, both vaults, the creator's and the destination's token accounts, and every week's event. */
  async getEjectQuote(address: PublicKey, creatorDestination?: PublicKey): Promise<EjectQuote> {
    const target = key(address, 'ritual address')
    const discovered = await this.getRitual(target)
    const a = discovered.account
    if (a.kind !== 'Solo' || a.status !== 'Active') throw failure('canonical', 'Only an active solo ritual can be ended early')
    const destination = creatorDestination === undefined ? getAssociatedTokenAddressSync(a.stakeMint, a.creator) : key(creatorDestination, 'creator destination')
    const eventAddresses = a.schedule.map((_, index) => eventPda(target, index, this.#programId))
    const fetched = await this.#fetch([target, SYSVAR_CLOCK_PUBKEY, a.stakeVault, a.feeVault, destination, a.forfeitDestination, ...eventAddresses.map(([event]) => event)], Object.freeze({ minContextSlot: discovered.slot }))
    const account = this.#decode(fetched.accounts[0], () => decodeRitual(fetched.accounts[0], this.#programId, discovered.protocolConfig.allowedStakeMint, target)) as RitualAccountView
    if (!immutableRitualEqual(a, account)) bundleMismatch()
    const ritual = Object.freeze({ slot: fetched.slot, address: target, protocolConfigAddress: this.protocolConfigAddress, protocolConfig: discovered.protocolConfig, account })
    this.#ritualReads.add(ritual)
    const clock = fetched.accounts[1]
    if (!clock || clock.data.length !== 40) throw failure('decode', 'Chain clock is unavailable')
    let now = 0n
    for (let index = 7; index >= 0; index -= 1) now = (now << 8n) | BigInt(clock.data[32 + index])
    if (now > 0x7fffffffffffffffn) now -= 0x10000000000000000n
    const events = eventAddresses.map(([, bump], index) => {
      const raw = fetched.accounts[6 + index]
      // A week nobody opened has no account (a lamport-only address is still absent).
      if (raw === null || (raw.owner.equals(PublicKey.default) && raw.data.length === 0)) return null
      const event = this.#decode(raw, () => decodeRitualEvent(raw, this.#programId)) as RitualEventAccountView
      const window = account.schedule[index]
      if (!event.ritual.equals(target) || event.eventIndex !== index || event.memberCount !== 1 || event.bump !== bump || event.window.opens !== window.opens || event.window.deadline !== window.deadline || event.window.resolution !== window.resolution) throw failure('canonical', 'Ritual event does not match its week')
      return event
    })
    try {
      const stake = classicTokenBalance(fetched.accounts[2], a.stakeMint, target)
      const fee = classicTokenBalance(fetched.accounts[3], a.stakeMint, target)
      const creatorBalance = classicTokenBalance(fetched.accounts[4], a.stakeMint, a.creator)
      classicTokenBalance(fetched.accounts[5], a.stakeMint)
      return Object.freeze({ ritual, creatorDestination: new PublicKey(destination.toBytes()), creatorBalance, now, ...ejectAmounts(account, events, now, stake, fee) })
    } catch (error) { throw error instanceof RitualRpcError ? error : failure('canonical', 'Ritual money accounts do not match') }
  }

  /** After an eject: both vaults are gone and the creator's balance went up by what came back. */
  async verifyEjectBalances(ritual: RitualRead, destination: PublicKey, minimumBalance: bigint, minContextSlot: number): Promise<void> {
    this.#checkRitual(ritual)
    const a = ritual.account
    const fetched = await this.#fetch([a.stakeVault, a.feeVault, key(destination, 'creator destination')], Object.freeze({ minContextSlot: maxMin(ritual.slot, minContextSlot) }))
    let balance = -1n
    try { balance = classicTokenBalance(fetched.accounts[2], a.stakeMint, a.creator) } catch { /* reported below */ }
    if (fetched.accounts[0] !== null || fetched.accounts[1] !== null || balance < minimumBalance) throw failure('canonical', 'Ritual eject balances do not match')
  }

  async getClaim(ritual: RitualRead, event: EventRead, claimant: PublicKey, readOptions?: ReadOptions): Promise<ClaimRead> {
    this.#checkEvent(event, ritual); const target = key(claimant, 'claimant'); const opts = options(readOptions); const effectiveOpts = Object.freeze({ minContextSlot: maxMin(opts.minContextSlot ?? 0, ritual.slot, event.slot) })
    const memberIndex = ritual.account.members.findIndex((member) => member.equals(target))
    if (memberIndex < 0) throw failure('input', 'claimant is not a Ritual member')
    if (event.account.eventIndex >= ritual.account.schedule.length || !event.account.ritual.equals(ritual.address)) throw failure('canonical', 'event is not bound to ritual')
    const address = claimPda(event.address, target, CURRENT_CLAIM_VERSION, this.#programId)[0]; const fetched = await this.#fetch([address], effectiveOpts)
    const account = this.#decode(fetched.accounts[0], () => decodeCompletionClaim(fetched.accounts[0], this.#programId)) as CompletionClaimAccountView
    if (!claimShapeMatchesRitual(account, ritual.account)) throw failure('canonical', 'CompletionClaim approval shape does not match the Ritual kind')
    const expectedBump = claimPda(event.address, target, CURRENT_CLAIM_VERSION, this.#programId)[1]
    if (!account.ritual.equals(ritual.address) || !account.event.equals(event.address) || account.eventIndex !== event.account.eventIndex || !account.claimant.equals(target) || account.memberIndex !== memberIndex || account.claimVersion !== CURRENT_CLAIM_VERSION || account.requiredAdditionalConfirmations !== ritual.account.additionalConfirmationThreshold || account.bump !== expectedBump || !address.equals(claimPda(event.address, target, CURRENT_CLAIM_VERSION, this.#programId)[0]) || account.claimedAt < event.account.window.opens || account.claimedAt > event.account.window.deadline) throw failure('canonical', 'Completion claim does not match canonical Ritual, event, member, or window')
    return Object.freeze({ slot: fetched.slot, address, ritualAddress: ritual.address, eventAddress: event.address, claimant: target, protocolConfigAddress: ritual.protocolConfigAddress, protocolConfig: ritual.protocolConfig, ritual, event, account })
  }
}

/** Create the explicit-program local/test reader; never an authorization or deployment factory. */
export const createRitualsRpcReader = (transport: RitualRpcTransport, programId: PublicKey): RitualsRpcReader => new RitualsRpcReader(transport, programId)
export { RitualsRpcReader as ReadOnlyRitualsRpcReader }

/** Current deployment is deliberately unavailable; this fails before touching the transport. */
export function createCurrentRitualsRpcReader(_transport: RitualRpcTransport): never {
  void _transport
  throw failure('deployment', 'No authorized Rituals deployment is configured')
}
