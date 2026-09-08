import { analyze } from './analyze'
import { createReviewIdentity, type ReviewedTransactionIdentity } from './reviewIdentity'
import {
  decodeBase64Transaction,
  type DecodedTransaction,
} from '../solana/decodeTransaction'
import type { PreflightResult } from './types'

export interface TransactionInspection {
  readonly decoded: DecodedTransaction
  readonly identity: ReviewedTransactionIdentity
  readonly result: PreflightResult
}

export function inspectBase64Transaction(input: string): TransactionInspection {
  const decoded = decodeBase64Transaction(input)
  return {
    decoded,
    identity: createReviewIdentity(decoded.serializedBytes),
    result: analyze(decoded.evidence),
  }
}
