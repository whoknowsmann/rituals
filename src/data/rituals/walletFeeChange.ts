import { Buffer } from 'buffer'
import { ComputeBudgetProgram, Message, Transaction, TransactionInstruction } from '@solana/web3.js'

/**
 * Wallets may rewrite the priority-fee (ComputeBudget) instructions before
 * signing: Phantom inserts its own, Seed Vault Wallet replaced ours with a
 * higher price on 2026-10-03. The signature then no longer covers the bytes
 * the user reviewed, although the transaction is otherwise the same.
 *
 * This accepts the landed message only if:
 *  - the wallet's signature verifies over exactly those landed bytes,
 *  - it has one signer, the same fee payer and the same blockhash,
 *  - every non-ComputeBudget instruction is identical and in the same order
 *    (program, accounts with signer/writable flags, data).
 * Any other change (an extra instruction, a different account) is rejected.
 */
export function landedMessageIsFeeOnlyChange(reviewed: Transaction, landedMessageBytes: Uint8Array, signature: string): boolean {
  let landed: Transaction
  try {
    const message = Message.from(Buffer.from(landedMessageBytes))
    if (message.header.numRequiredSignatures !== 1) return false
    landed = Transaction.populate(message, [signature])
    if (landed.verifySignatures(true) !== true) return false
  } catch {
    return false
  }
  let expected: Transaction
  try { expected = Transaction.populate(reviewed.compileMessage()) } catch { return false }
  if (!landed.feePayer || !expected.feePayer || !landed.feePayer.equals(expected.feePayer)) return false
  if (landed.recentBlockhash !== expected.recentBlockhash) return false
  const program = (tx: Transaction) => tx.instructions.filter((ix) => !ix.programId.equals(ComputeBudgetProgram.programId))
  const a = program(expected)
  const b = program(landed)
  return a.length === b.length && a.every((ix, index) => sameInstruction(ix, b[index]))
}

function sameInstruction(a: TransactionInstruction, b: TransactionInstruction): boolean {
  return a.programId.equals(b.programId)
    && a.keys.length === b.keys.length
    && a.keys.every((key, index) => key.pubkey.equals(b.keys[index].pubkey) && key.isSigner === b.keys[index].isSigner && key.isWritable === b.keys[index].isWritable)
    && Buffer.from(a.data).equals(Buffer.from(b.data))
}
