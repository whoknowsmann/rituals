import { PublicKey } from '@solana/web3.js'
import { LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'
const seed = (s: string) => Buffer.from(s)
function key(value: PublicKey, name: string): Uint8Array { if (!(value instanceof PublicKey)) throw new Error(`${name} must be a PublicKey`); return value.toBytes() }
function program(value = LOCAL_PLACEHOLDER_PROGRAM_ID): PublicKey { return key(value, 'programId') && value }
function nonceBytes(nonce: bigint): Uint8Array { if (typeof nonce !== 'bigint' || nonce < 0n || nonce > 0xffffffffffffffffn) throw new Error('nonce must be a u64 bigint'); const b=Buffer.alloc(8); b.writeBigUInt64LE(nonce); return b }
export const protocolConfigPda = (programId = LOCAL_PLACEHOLDER_PROGRAM_ID) => PublicKey.findProgramAddressSync([seed('protocol-config')], program(programId))
export const ritualPda = (creator: PublicKey, nonce: bigint, programId = LOCAL_PLACEHOLDER_PROGRAM_ID) => PublicKey.findProgramAddressSync([seed('ritual'), key(creator,'creator'), nonceBytes(nonce)], program(programId))
export const stakeVaultPda = (ritual: PublicKey, programId = LOCAL_PLACEHOLDER_PROGRAM_ID) => PublicKey.findProgramAddressSync([seed('stake-vault'), key(ritual,'ritual')], program(programId))
export const feeVaultPda = (ritual: PublicKey, programId = LOCAL_PLACEHOLDER_PROGRAM_ID) => PublicKey.findProgramAddressSync([seed('fee-vault'), key(ritual,'ritual')], program(programId))
export const eventPda = (ritual: PublicKey, eventIndex: number, programId = LOCAL_PLACEHOLDER_PROGRAM_ID) => { if (!Number.isInteger(eventIndex)||eventIndex<0||eventIndex>15) throw new Error('eventIndex must be 0..15'); return PublicKey.findProgramAddressSync([seed('event'),key(ritual,'ritual'),Buffer.from([eventIndex])],program(programId)) }
export const claimPda = (event: PublicKey, claimant: PublicKey, settlementVersion: number, programId = LOCAL_PLACEHOLDER_PROGRAM_ID) => { if (settlementVersion !== 1) throw new Error('settlement version must be exactly 1'); return PublicKey.findProgramAddressSync([seed('claim'),key(event,'event'),key(claimant,'claimant'),Buffer.from([settlementVersion])],program(programId)) }
