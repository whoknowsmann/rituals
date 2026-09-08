import { Buffer } from 'buffer'
import {
  PublicKey,
  SystemInstruction,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
  type MessageCompiledInstruction,
  type VersionedMessage,
} from '@solana/web3.js'
import {
  decodeApproveInstruction,
  decodeCloseAccountInstruction,
  decodeSetAuthorityInstruction,
  decodeTransferCheckedInstruction,
  decodeTransferInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TokenInstruction,
} from '@solana/spl-token'
import type {
  AssetMovement,
  AuthorityChange,
  PreflightEvidence,
  ProgramObservation,
} from '../preflight/types'

export const MAX_TRANSACTION_BYTES = 1232

export type DecodedInstructionStatus = 'DECODED' | 'UNSUPPORTED' | 'UNRESOLVED_ACCOUNTS'

export interface DecodedInstructionSummary {
  readonly index: number
  readonly programId: string | null
  readonly status: DecodedInstructionStatus
  readonly type: string | null
}

export interface DecodedTransaction {
  readonly messageVersion: 'legacy' | 0
  readonly serializedBytes: Uint8Array
  readonly feePayer: string
  readonly requiredSigners: readonly string[]
  readonly writableAccounts: readonly string[]
  readonly addressLookupTables: readonly string[]
  readonly instructions: readonly DecodedInstructionSummary[]
  readonly evidence: PreflightEvidence
}

export class TransactionDecodeError extends Error {
  readonly code: 'INVALID_BASE64' | 'INVALID_TRANSACTION' | 'TRANSACTION_TOO_LARGE'

  constructor(
    code: TransactionDecodeError['code'],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'TransactionDecodeError'
    this.code = code
  }
}

function decodeStrictBase64(input: string): Uint8Array {
  const normalized = input.trim()
  if (
    normalized.length === 0 ||
    normalized.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)
  ) {
    throw new TransactionDecodeError('INVALID_BASE64', 'Transaction must be canonical base64.')
  }

  const bytes = Buffer.from(normalized, 'base64')
  if (bytes.length === 0 || bytes.toString('base64') !== normalized) {
    throw new TransactionDecodeError('INVALID_BASE64', 'Transaction must be canonical base64.')
  }
  if (bytes.length > MAX_TRANSACTION_BYTES) {
    throw new TransactionDecodeError(
      'TRANSACTION_TOO_LARGE',
      `Transaction size exceeds ${MAX_TRANSACTION_BYTES} bytes.`,
    )
  }
  return new Uint8Array(bytes)
}

function formatAtomicAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) {
    return amount.toString()
  }
  const digits = amount.toString().padStart(decimals + 1, '0')
  const whole = digits.slice(0, -decimals)
  const fraction = digits.slice(-decimals).replace(/0+$/, '')
  return fraction.length === 0 ? whole : `${whole}.${fraction}`
}

function instructionFromStaticKeys(
  message: VersionedMessage,
  compiled: MessageCompiledInstruction,
): TransactionInstruction | null {
  const staticKeys = message.staticAccountKeys
  if (
    compiled.programIdIndex >= staticKeys.length ||
    compiled.accountKeyIndexes.some((index) => index >= staticKeys.length)
  ) {
    return null
  }

  return new TransactionInstruction({
    programId: staticKeys[compiled.programIdIndex],
    keys: compiled.accountKeyIndexes.map((index) => ({
      pubkey: staticKeys[index],
      isSigner: message.isAccountSigner(index),
      isWritable: message.isAccountWritable(index),
    })),
    data: Buffer.from(compiled.data),
  })
}

function decodeSystemInstruction(
  instruction: TransactionInstruction,
  assetMovements: AssetMovement[],
): string | null {
  let type: string
  try {
    type = SystemInstruction.decodeInstructionType(instruction)
  } catch {
    return null
  }
  if (type !== 'Transfer') {
    return null
  }

  const transfer = SystemInstruction.decodeTransfer(instruction)
  assetMovements.push({
    asset: 'SOL',
    amount: formatAtomicAmount(transfer.lamports, 9),
    from: transfer.fromPubkey.toBase58(),
    to: transfer.toPubkey.toBase58(),
  })
  return 'SYSTEM_TRANSFER'
}

function decodeTokenInstruction(
  instruction: TransactionInstruction,
  assetMovements: AssetMovement[],
  authorityChanges: AuthorityChange[],
): string | null {
  const tokenInstruction = instruction.data[0]

  try {
    switch (tokenInstruction) {
      case TokenInstruction.Transfer: {
        const transfer = decodeTransferInstruction(instruction)
        assetMovements.push({
          asset: 'SPL_TOKEN_UNITS',
          amount: transfer.data.amount.toString(),
          from: transfer.keys.source.pubkey.toBase58(),
          to: transfer.keys.destination.pubkey.toBase58(),
        })
        return 'SPL_TRANSFER'
      }
      case TokenInstruction.TransferChecked: {
        const transfer = decodeTransferCheckedInstruction(instruction)
        assetMovements.push({
          asset: transfer.keys.mint.pubkey.toBase58(),
          amount: formatAtomicAmount(transfer.data.amount, transfer.data.decimals),
          from: transfer.keys.source.pubkey.toBase58(),
          to: transfer.keys.destination.pubkey.toBase58(),
        })
        return 'SPL_TRANSFER_CHECKED'
      }
      case TokenInstruction.Approve: {
        const approve = decodeApproveInstruction(instruction)
        authorityChanges.push({
          account: approve.keys.account.pubkey.toBase58(),
          kind: 'DELEGATE_CHANGE',
          severity: 'NON_SEVERE',
          authority: approve.keys.delegate.pubkey.toBase58(),
        })
        return 'SPL_APPROVE'
      }
      case TokenInstruction.SetAuthority: {
        const change = decodeSetAuthorityInstruction(instruction)
        authorityChanges.push({
          account: change.keys.account.pubkey.toBase58(),
          kind: 'AUTHORITY_CHANGE',
          severity: 'NON_SEVERE',
          ...(change.data.newAuthority
            ? { authority: change.data.newAuthority.toBase58() }
            : {}),
        })
        return 'SPL_SET_AUTHORITY'
      }
      case TokenInstruction.CloseAccount:
        decodeCloseAccountInstruction(instruction)
        return 'SPL_CLOSE_ACCOUNT'
      default:
        return null
    }
  } catch {
    return null
  }
}

function programObservation(programId: PublicKey): ProgramObservation {
  if (programId.equals(SystemProgram.programId)) {
    return {
      programId: programId.toBase58(),
      support: 'SUPPORTED',
      name: 'System Program',
    }
  }
  if (programId.equals(TOKEN_PROGRAM_ID)) {
    return {
      programId: programId.toBase58(),
      support: 'SUPPORTED',
      name: 'SPL Token Program',
    }
  }
  if (programId.equals(TOKEN_2022_PROGRAM_ID)) {
    return {
      programId: programId.toBase58(),
      support: 'UNSUPPORTED',
      name: 'Token-2022 Program',
    }
  }
  return { programId: programId.toBase58(), support: 'UNKNOWN' }
}

export function decodeBase64Transaction(input: string): DecodedTransaction {
  const serializedBytes = decodeStrictBase64(input)
  let transaction: VersionedTransaction
  try {
    transaction = VersionedTransaction.deserialize(serializedBytes)
  } catch (error) {
    throw new TransactionDecodeError(
      'INVALID_TRANSACTION',
      'Base64 payload is not a valid Solana transaction.',
      { cause: error },
    )
  }

  const { message } = transaction
  const staticKeys = message.staticAccountKeys
  if (staticKeys.length === 0) {
    throw new TransactionDecodeError('INVALID_TRANSACTION', 'Transaction has no fee payer.')
  }

  const addressLookupTables = message.addressTableLookups.map((lookup) =>
    lookup.accountKey.toBase58(),
  )
  const unresolvedElements = addressLookupTables.map(
    (address) => `ADDRESS_LOOKUP_TABLE:${address}`,
  )
  const assetMovements: AssetMovement[] = []
  const authorityChanges: AuthorityChange[] = []
  const programs = new Map<string, ProgramObservation>()

  const instructions = message.compiledInstructions.map((compiled, index) => {
    const programKey = staticKeys[compiled.programIdIndex]
    if (!programKey) {
      unresolvedElements.push(`INSTRUCTION_${index}:PROGRAM_ADDRESS_LOOKUP_REQUIRED`)
      return {
        index,
        programId: null,
        status: 'UNRESOLVED_ACCOUNTS' as const,
        type: null,
      }
    }

    const observation = programObservation(programKey)
    programs.set(observation.programId, observation)
    const instruction = instructionFromStaticKeys(message, compiled)
    if (!instruction) {
      unresolvedElements.push(`INSTRUCTION_${index}:ACCOUNT_ADDRESS_LOOKUP_REQUIRED`)
      return {
        index,
        programId: observation.programId,
        status: 'UNRESOLVED_ACCOUNTS' as const,
        type: null,
      }
    }

    const type = programKey.equals(SystemProgram.programId)
      ? decodeSystemInstruction(instruction, assetMovements)
      : programKey.equals(TOKEN_PROGRAM_ID)
        ? decodeTokenInstruction(instruction, assetMovements, authorityChanges)
        : null

    if (type === null) {
      unresolvedElements.push(`INSTRUCTION_${index}:UNSUPPORTED:${observation.programId}`)
      return {
        index,
        programId: observation.programId,
        status: 'UNSUPPORTED' as const,
        type: null,
      }
    }

    return {
      index,
      programId: observation.programId,
      status: 'DECODED' as const,
      type,
    }
  })

  const evidenceComplete =
    unresolvedElements.length === 0 &&
    [...programs.values()].every((program) => program.support === 'SUPPORTED')

  return {
    messageVersion: message.version,
    serializedBytes: new Uint8Array(serializedBytes),
    feePayer: staticKeys[0].toBase58(),
    requiredSigners: staticKeys
      .slice(0, message.header.numRequiredSignatures)
      .map((key) => key.toBase58()),
    writableAccounts: staticKeys
      .filter((_, index) => message.isAccountWritable(index))
      .map((key) => key.toBase58()),
    addressLookupTables,
    instructions,
    evidence: {
      evidenceComplete,
      programs: [...programs.values()],
      assetMovements,
      authorityChanges,
      simulation: {
        status: 'NOT_RUN',
        reason: 'Transaction has been decoded but not simulated.',
      },
      unresolvedElements,
    },
  }
}
