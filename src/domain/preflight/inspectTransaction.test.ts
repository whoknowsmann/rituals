import { Buffer } from 'buffer'
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'
import { TransactionDecodeError } from '../solana/decodeTransaction'
import { inspectBase64Transaction } from './inspectTransaction'

const payer = new PublicKey(new Uint8Array(32).fill(11))
const recipient = new PublicKey(new Uint8Array(32).fill(12))
const blockhash = new PublicKey(new Uint8Array(32).fill(13)).toBase58()

function transferBase64(): string {
  const transaction = new Transaction({ feePayer: payer, recentBlockhash: blockhash }).add(
    SystemProgram.transfer({ fromPubkey: payer, toPubkey: recipient, lamports: 1000n }),
  )
  return Buffer.from(
    transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString('base64')
}

describe('inspectBase64Transaction', () => {
  it('decodes, identifies, and conservatively holds an unsimulated transaction', () => {
    const inspection = inspectBase64Transaction(transferBase64())

    expect(inspection.decoded.evidence.assetMovements).toEqual([
      {
        asset: 'SOL',
        amount: '0.000001',
        from: payer.toBase58(),
        to: recipient.toBase58(),
      },
    ])
    expect(inspection.identity.byteLength).toBeGreaterThan(0)
    expect(inspection.identity.displayId).toMatch(/^[A-F0-9]{12}$/)
    expect(inspection.result).toMatchObject({
      verdict: 'HOLD',
      analysisComplete: false,
      simulation: {
        status: 'NOT_RUN',
        reason: 'Transaction has been decoded but not simulated.',
      },
      recommendedAction: 'VERIFY_INDEPENDENTLY',
    })
  })

  it('preserves typed decode errors for safe UI handling', () => {
    expect(() => inspectBase64Transaction('not base64')).toThrow(TransactionDecodeError)
  })
})
