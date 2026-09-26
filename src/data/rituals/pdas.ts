import { Buffer } from 'buffer'
import { PublicKey } from '@solana/web3.js'
import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'

export const CURRENT_CLAIM_VERSION = 0 as const
const MAX_U64 = 0xffffffffffffffffn
const seed = (value: string): Buffer => Buffer.from(value, 'utf8')

function requireKey(value: PublicKey, name: string): Uint8Array {
  if (!(value instanceof PublicKey)) {
    throw new TypeError(`${name} must be a PublicKey`)
  }
  return value.toBytes()
}

function requireProgram(value: PublicKey): PublicKey {
  requireKey(value, 'programId')
  return value
}

function requireU64(value: bigint, name: string): Buffer {
  if (typeof value !== 'bigint' || value < 0n || value > MAX_U64) {
    throw new RangeError(`${name} must be a u64 bigint`)
  }
  const result = Buffer.alloc(8)
  result.writeBigUInt64LE(value)
  return result
}

function requireIndex(value: number, name: string): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 15) {
    throw new RangeError(`${name} must be an integer in 0..15`)
  }
  return Buffer.from([value])
}

export function protocolConfigPda(programId: PublicKey = LOCAL_PLACEHOLDER_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([seed('protocol-config')], requireProgram(programId))
}

export function ritualPda(creator: PublicKey, nonce: bigint, programId: PublicKey = LOCAL_PLACEHOLDER_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([seed('ritual'), requireKey(creator, 'creator'), requireU64(nonce, 'nonce')], requireProgram(programId))
}

export function stakeVaultPda(ritual: PublicKey, programId: PublicKey = LOCAL_PLACEHOLDER_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([seed('stake-vault'), requireKey(ritual, 'ritual')], requireProgram(programId))
}

export function feeVaultPda(ritual: PublicKey, programId: PublicKey = LOCAL_PLACEHOLDER_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([seed('fee-vault'), requireKey(ritual, 'ritual')], requireProgram(programId))
}

export function seasonPda(seasonId: Uint8Array, programId: PublicKey = LOCAL_PLACEHOLDER_PROGRAM_ID) {
  if (!(seasonId instanceof Uint8Array) || seasonId.length !== 32) throw new TypeError('seasonId must be 32 bytes')
  return PublicKey.findProgramAddressSync([seed('season'), seasonId], requireProgram(programId))
}

export function eventPda(ritual: PublicKey, eventIndex: number, programId: PublicKey = LOCAL_PLACEHOLDER_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([seed('event'), requireKey(ritual, 'ritual'), requireIndex(eventIndex, 'eventIndex')], requireProgram(programId))
}

export function claimPda(event: PublicKey, claimant: PublicKey, claimVersion: number, programId: PublicKey = LOCAL_PLACEHOLDER_PROGRAM_ID) {
  if (!Number.isInteger(claimVersion) || claimVersion !== CURRENT_CLAIM_VERSION) {
    throw new RangeError('claim version must be exactly 0')
  }
  return PublicKey.findProgramAddressSync([seed('claim'), requireKey(event, 'event'), requireKey(claimant, 'claimant'), Buffer.from([CURRENT_CLAIM_VERSION])], requireProgram(programId))
}
