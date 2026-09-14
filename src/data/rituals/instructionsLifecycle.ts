import { Buffer } from 'buffer'
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import type { RitualAccountView } from './accounts'
import { feeVaultPda, protocolConfigPda, ritualPda, stakeVaultPda } from './pdas'
import {
  encodeActivateRitualData,
  encodeCancelUnactivatedData,
  encodeCreateRitualData,
  encodeFundMemberData,
  encodeInitializeProtocolConfigData,
  type CreateRitualInput,
  type InitializeProtocolConfigInput,
} from './instructionData'

export type RitualInstructionBuildErrorCategory = 'input' | 'canonical' | 'invariant' | 'authorization'

export class RitualInstructionBuildError extends Error {
  readonly category: RitualInstructionBuildErrorCategory
  constructor(category: RitualInstructionBuildErrorCategory, message: string) {
    super(`${category}: ${message}`)
    this.name = 'RitualInstructionBuildError'
    this.category = category
  }
}

export type RitualAccountContext = Readonly<{ address: PublicKey; account: RitualAccountView }>
export type BuildInitializeProtocolConfigArgs = Readonly<{ programId: PublicKey; authority: PublicKey; config: InitializeProtocolConfigInput }>
export type BuildCreateRitualArgs = Readonly<{ programId: PublicKey; creator: PublicKey; stakeMint: PublicKey; feeRecipientToken: PublicKey; ritual: CreateRitualInput }>
export type BuildFundMemberArgs = Readonly<{ programId: PublicKey; ritual: RitualAccountContext; member: PublicKey; memberSource: PublicKey }>
export type BuildActivateRitualArgs = Readonly<{ programId: PublicKey; ritual: RitualAccountContext }>
export type BuildCancelUnactivatedArgs = Readonly<{ programId: PublicKey; ritual: RitualAccountContext; caller: PublicKey; destinationTokenAccounts: readonly PublicKey[] }>

const zero = PublicKey.default
const fail = (category: RitualInstructionBuildErrorCategory, message: string): never => { throw new RitualInstructionBuildError(category, message) }
const read = (object: unknown, name: string): unknown => {
  try { return (object as Record<string, unknown>)[name] } catch { fail('input', `could not read ${name}`) }
}
function key(value: unknown, name: string, allowDefault = false): PublicKey {
  if (!(value instanceof PublicKey)) fail('input', `${name} must be a PublicKey`)
  const publicKey = value as PublicKey
  try {
    const bytes = Uint8Array.from(publicKey.toBytes())
    if (!allowDefault && bytes.every(byte => byte === 0)) fail('input', `${name} must not be default`)
    return new PublicKey(bytes)
  } catch (error) {
    if (error instanceof RitualInstructionBuildError) throw error
    fail('input', `${name} is unreadable`)
  }
  return fail('input', `${name} is unreadable`)
}
function program(value: unknown): PublicKey {
  const result = key(value, 'programId')
  if (result.equals(zero)) fail('input', 'programId must not be default')
  return result
}
function instruction(programId: PublicKey, keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[], data: Uint8Array): TransactionInstruction {
  return new TransactionInstruction({ programId: new PublicKey(programId.toBytes()), keys: keys.map(item => ({ pubkey: new PublicKey(item.pubkey.toBytes()), isSigner: item.isSigner, isWritable: item.isWritable })), data: Buffer.from(data) })
}
function canonicalContext(value: unknown, programId: PublicKey): { address: PublicKey; account: RitualAccountView; config: PublicKey; stakeMint: PublicKey; stakeVault: PublicKey; feeVault: PublicKey } {
  const context = value as Record<string, unknown>
  const address = key(read(context, 'address'), 'ritual.address')
  const account = read(context, 'account') as Record<string, unknown>
  if (account === null || typeof account !== 'object' || Array.isArray(account)) fail('input', 'ritual.account must be an object')
  const creator = key(read(account, 'creator'), 'ritual.creator')
  const nonce = read(account, 'nonce')
  if (typeof nonce !== 'bigint' || nonce < 0n || nonce > 0xffffffffffffffffn) fail('input', 'ritual.nonce must be a u64 bigint')
  const [canonical] = ritualPda(creator, nonce as bigint, programId)
  if (!address.equals(canonical)) fail('canonical', 'ritual address is not the canonical PDA')
  const protocolConfig = key(read(account, 'protocolConfig'), 'ritual.protocolConfig')
  const [canonicalConfig] = protocolConfigPda(programId)
  const stakeMint = key(read(account, 'stakeMint'), 'ritual.stakeMint')
  const stakeVault = key(read(account, 'stakeVault'), 'ritual.stakeVault')
  const feeVault = key(read(account, 'feeVault'), 'ritual.feeVault')
  const [canonicalStake] = stakeVaultPda(canonical, programId)
  const [canonicalFee] = feeVaultPda(canonical, programId)
  if (!protocolConfig.equals(canonicalConfig) || !stakeVault.equals(canonicalStake) || !feeVault.equals(canonicalFee)) fail('canonical', 'ritual account addresses are not canonical')
  const members = read(account, 'members')
  if (!Array.isArray(members) || members.length < 2 || members.length > 6) fail('invariant', 'ritual members are invalid')
  const normalizedMembers = (members as unknown[]).map((item, index) => key(item, `ritual.members[${index}]`))
  if (new Set(normalizedMembers.map(item => item.toBase58())).size !== normalizedMembers.length || !normalizedMembers.some(item => item.equals(creator))) fail('invariant', 'ritual members are invalid')
  return { address, account: { ...account as RitualAccountView, members: normalizedMembers }, config: canonicalConfig, stakeMint, stakeVault, feeVault }
}
function ritualKeys(programId: PublicKey, context: unknown): { context: { address: PublicKey; account: RitualAccountView }; config: PublicKey; stakeMint: PublicKey; stakeVault: PublicKey; feeVault: PublicKey } {
  const normalized = canonicalContext(context, programId)
  return { context: { address: normalized.address, account: normalized.account }, config: normalized.config, stakeMint: normalized.stakeMint, stakeVault: normalized.stakeVault, feeVault: normalized.feeVault }
}
function requireStatus(account: RitualAccountView, status: RitualAccountView['status']): void { if (account.status !== status) fail('invariant', `ritual must be ${status}`) }
function memberMask(account: RitualAccountView): number { return (1 << account.members.length) - 1 }

export function deriveCreateRitualAccounts(programIdInput: PublicKey, creatorInput: PublicKey, nonce: bigint) {
  const p = program(programIdInput); const creator = key(creatorInput, 'creator')
  const [ritual, ritualBump] = ritualPda(creator, nonce, p); const [stakeVault, stakeVaultBump] = stakeVaultPda(ritual, p); const [feeVault, feeVaultBump] = feeVaultPda(ritual, p)
  return Object.freeze({ protocolConfig: protocolConfigPda(p)[0], ritual, ritualBump, stakeVault, stakeVaultBump, feeVault, feeVaultBump })
}

export function buildInitializeProtocolConfigInstruction(args: BuildInitializeProtocolConfigArgs): TransactionInstruction {
  try {
    const p = program(read(args, 'programId')); const authority = key(read(args, 'authority'), 'authority'); const config = read(args, 'config')
    const allowedStakeMint = key(read(config, 'allowedStakeMint'), 'allowedStakeMint'); const feeRecipient = key(read(config, 'feeRecipient'), 'feeRecipient')
    return instruction(p, [{ pubkey: protocolConfigPda(p)[0], isWritable: true, isSigner: false }, { pubkey: authority, isWritable: true, isSigner: true }, { pubkey: SystemProgram.programId, isWritable: false, isSigner: false }], encodeInitializeProtocolConfigData({ ...config as InitializeProtocolConfigInput, allowedStakeMint, feeRecipient }))
  } catch (error) { if (error instanceof RitualInstructionBuildError) throw error; return fail('input', 'could not build initialize protocol config instruction') }
}

export function buildCreateRitualInstruction(args: BuildCreateRitualArgs): TransactionInstruction {
  try {
    const p = program(read(args, 'programId')); const creator = key(read(args, 'creator'), 'creator'); const stakeMint = key(read(args, 'stakeMint'), 'stakeMint'); const feeRecipientToken = key(read(args, 'feeRecipientToken'), 'feeRecipientToken'); const ritual = read(args, 'ritual') as CreateRitualInput
    const nonce = read(ritual, 'nonce'); if (typeof nonce !== 'bigint') fail('input', 'ritual.nonce must be a bigint')
    const accounts = deriveCreateRitualAccounts(p, creator, nonce as bigint)
    const members = read(ritual, 'members'); if (!Array.isArray(members) || !members.some((member: unknown) => member instanceof PublicKey && member.equals(creator))) fail('invariant', 'creator must be a ritual member')
    const data = encodeCreateRitualData({ ...ritual, nonce: nonce as bigint, members: Array.from(members as PublicKey[]) })
    return instruction(p, [
      { pubkey: accounts.protocolConfig, isWritable: false, isSigner: false }, { pubkey: accounts.ritual, isWritable: true, isSigner: false }, { pubkey: creator, isWritable: true, isSigner: true }, { pubkey: stakeMint, isWritable: false, isSigner: false }, { pubkey: feeRecipientToken, isWritable: false, isSigner: false }, { pubkey: accounts.stakeVault, isWritable: true, isSigner: false }, { pubkey: accounts.feeVault, isWritable: true, isSigner: false }, { pubkey: SystemProgram.programId, isWritable: false, isSigner: false }, { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
    ], data)
  } catch (error) { if (error instanceof RitualInstructionBuildError) throw error; return fail('input', 'could not build create ritual instruction') }
}

function buildFundMemberInstructionUnsafe(args: BuildFundMemberArgs): TransactionInstruction {
  const p = program(read(args, 'programId')); const parts = ritualKeys(p, read(args, 'ritual')); const member = key(read(args, 'member'), 'member'); const source = key(read(args, 'memberSource'), 'memberSource')
  const account = parts.context.account; const index = account.members.findIndex(item => item.equals(member)); if (index < 0) fail('invariant', 'member is not in ritual')
  requireStatus(account, 'Funding'); if ((account.fundedMembersBitmap & (1 << index)) !== 0) fail('invariant', 'member is already funded')
  if (account.fundedMemberCount !== popcount(account.fundedMembersBitmap) || (account.fundedMembersBitmap & ~memberMask(account)) !== 0) fail('invariant', 'funding bitmap is inconsistent')
  if (source.equals(parts.stakeVault) || source.equals(parts.feeVault)) fail('invariant', 'member source must not be a ritual vault')
  return instruction(p, [{ pubkey: parts.config, isWritable: false, isSigner: false }, { pubkey: parts.context.address, isWritable: true, isSigner: false }, { pubkey: member, isWritable: false, isSigner: true }, { pubkey: parts.stakeMint, isWritable: false, isSigner: false }, { pubkey: source, isWritable: true, isSigner: false }, { pubkey: parts.stakeVault, isWritable: true, isSigner: false }, { pubkey: parts.feeVault, isWritable: true, isSigner: false }, { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false }], encodeFundMemberData())
}
function popcount(value: number): number { let count = 0; for (let n = value; n; n &= n - 1) count += 1; return count }

function buildActivateRitualInstructionUnsafe(args: BuildActivateRitualArgs): TransactionInstruction {
  const p = program(read(args, 'programId')); const parts = ritualKeys(p, read(args, 'ritual')); const account = parts.context.account; requireStatus(account, 'Funding')
  if (account.fundedMembersBitmap !== memberMask(account) || account.fundedMemberCount !== account.members.length) fail('invariant', 'all members must be funded')
  const recipient = key(account.lockedFeeRecipient, 'ritual.lockedFeeRecipient')
  return instruction(p, [{ pubkey: parts.config, isWritable: false, isSigner: false }, { pubkey: parts.context.address, isWritable: true, isSigner: false }, { pubkey: parts.stakeMint, isWritable: false, isSigner: false }, { pubkey: parts.stakeVault, isWritable: true, isSigner: false }, { pubkey: parts.feeVault, isWritable: true, isSigner: false }, { pubkey: recipient, isWritable: true, isSigner: false }, { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false }], encodeActivateRitualData())
}

function buildCancelUnactivatedInstructionUnsafe(args: BuildCancelUnactivatedArgs): TransactionInstruction {
  const p = program(read(args, 'programId')); const parts = ritualKeys(p, read(args, 'ritual')); const account = parts.context.account; requireStatus(account, 'Funding'); // The chain clock authorizes cancellation: before the first window only the creator
 // is accepted onchain; after it opens any signer is accepted. This clockless builder
 // therefore validates only that caller is a real signer and never accepts local `now`.
 const caller = key(read(args, 'caller'), 'caller'); const destinations = read(args, 'destinationTokenAccounts')

  if (!Array.isArray(destinations) || destinations.length !== account.members.length) fail('invariant', 'destination count must equal member count')
  const normalized = (destinations as unknown[]).map((item: unknown, index: number) => key(item, `destinationTokenAccounts[${index}]`))
  if (new Set(normalized.map(item => item.toBase58())).size !== normalized.length) fail('invariant', 'destinations must be unique')
  if (normalized.some(item => item.equals(parts.stakeVault) || item.equals(parts.feeVault))) fail('invariant', 'destinations must not be ritual vaults')
  const base: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] = [{ pubkey: parts.context.address, isWritable: true, isSigner: false }, { pubkey: caller, isWritable: false, isSigner: true }, { pubkey: parts.stakeMint, isWritable: false, isSigner: false }, { pubkey: parts.stakeVault, isWritable: true, isSigner: false }, { pubkey: parts.feeVault, isWritable: true, isSigner: false }, { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false }]
  return instruction(p, [...base, ...normalized.map(pubkey => ({ pubkey, isWritable: true, isSigner: false }))], encodeCancelUnactivatedData())
}

function normalizeBuildFailure(error: unknown): never {
  if (error instanceof RitualInstructionBuildError) throw error
  return fail('input', 'could not build Ritual instruction')
}
export function buildFundMemberInstruction(args: BuildFundMemberArgs): TransactionInstruction { try { return buildFundMemberInstructionUnsafe(args) } catch (error) { return normalizeBuildFailure(error) } }
export function buildActivateRitualInstruction(args: BuildActivateRitualArgs): TransactionInstruction { try { return buildActivateRitualInstructionUnsafe(args) } catch (error) { return normalizeBuildFailure(error) } }
export function buildCancelUnactivatedInstruction(args: BuildCancelUnactivatedArgs): TransactionInstruction { try { return buildCancelUnactivatedInstructionUnsafe(args) } catch (error) { return normalizeBuildFailure(error) } }
