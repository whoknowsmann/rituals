import { describe, expect, it } from 'vitest'
import bs58 from 'bs58'
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'
import { landedMessageIsFeeOnlyChange } from './walletFeeChange'

const payer = Keypair.generate()
const program = new PublicKey(new Uint8Array(32).fill(7))
const ritual = Keypair.generate().publicKey
const blockhash = bs58.encode(new Uint8Array(32).fill(9))
const programIx = (data = [1, 2, 3]) => new TransactionInstruction({ programId: program, keys: [{ pubkey: ritual, isSigner: false, isWritable: true }, { pubkey: payer.publicKey, isSigner: true, isWritable: true }], data: Buffer.from(data) })
const ours = () => [ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 })]

function tx(instructions: TransactionInstruction[], hash = blockhash): Transaction {
  const t = new Transaction({ feePayer: payer.publicKey, blockhash: hash, lastValidBlockHeight: 100 })
  t.add(...instructions)
  return t
}
/** What the wallet broadcast: its own bytes and its signature over them. */
function walletSigned(instructions: TransactionInstruction[], hash = blockhash) {
  const t = tx(instructions, hash)
  t.sign(payer)
  return { bytes: Uint8Array.from(t.serializeMessage()), signature: bs58.encode(t.signature!) }
}
const reviewed = () => tx([programIx(), ...ours()])

describe('landedMessageIsFeeOnlyChange', () => {
  it('accepts a wallet that replaced our priority fee (Seed Vault Wallet, 2026-10-03)', () => {
    const landed = walletSigned([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }), ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }), programIx()])
    expect(landedMessageIsFeeOnlyChange(reviewed(), landed.bytes, landed.signature)).toBe(true)
  })

  it('rejects a changed program instruction, an extra instruction, or another blockhash', () => {
    const changed = walletSigned([programIx([9, 9, 9]), ...ours()])
    expect(landedMessageIsFeeOnlyChange(reviewed(), changed.bytes, changed.signature)).toBe(false)
    const extra = walletSigned([programIx(), SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: ritual, lamports: 1 }), ...ours()])
    expect(landedMessageIsFeeOnlyChange(reviewed(), extra.bytes, extra.signature)).toBe(false)
    const otherHash = walletSigned([programIx(), ...ours()], bs58.encode(new Uint8Array(32).fill(4)))
    expect(landedMessageIsFeeOnlyChange(reviewed(), otherHash.bytes, otherHash.signature)).toBe(false)
  })

  it('rejects a signature that does not cover the landed bytes', () => {
    const landed = walletSigned([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5 }), programIx()])
    const other = walletSigned([programIx(), ...ours()])
    expect(landedMessageIsFeeOnlyChange(reviewed(), landed.bytes, other.signature)).toBe(false)
  })
})
