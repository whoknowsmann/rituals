import { transact, type Web3MobileWallet } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { Account, useAuthorization } from "./useAuthorization";
import { PublicKey, Transaction, TransactionSignature, VersionedTransaction } from "@solana/web3.js";
import { useCallback, useMemo } from "react";
import { SignInPayload, SolanaMobileWalletAdapterProtocolErrorCode } from "@solana-mobile/mobile-wallet-adapter-protocol";

export type MobileWalletErrorCategory = "authorization" | "input" | "wallet";
export class MobileWalletError extends Error {
  readonly category: MobileWalletErrorCategory;
  readonly userRejected: boolean;
  constructor(category: MobileWalletErrorCategory, message: string, userRejected = false) {
    super(message); this.name = "MobileWalletError"; this.category = category; this.userRejected = userRejected;
  }
}
function isUserRejection(error: unknown): boolean {
  try {
    if (error && typeof error === "object") {
      const value = error as { name?: unknown; code?: unknown };
      return value.name === "UserRejectedRequestError" || value.code === 4001 || value.code === SolanaMobileWalletAdapterProtocolErrorCode.ERROR_AUTHORIZATION_FAILED || value.code === SolanaMobileWalletAdapterProtocolErrorCode.ERROR_NOT_SIGNED;
    }
  } catch { /* sanitize hostile errors */ }
  return false;
}
function inputFailure(message: string): never { throw new MobileWalletError("input", message); }
function feePayerOf(transaction: Transaction | VersionedTransaction): PublicKey | undefined {
  if (transaction instanceof Transaction) return transaction.feePayer ?? undefined;
  return transaction.message.staticAccountKeys[0];
}

/** Pure, native-free MWA operation used by the hook and deterministic tests. */
export async function authorizeAndSendTransaction(
  wallet: Pick<Web3MobileWallet, "signAndSendTransactions">,
  authorizeSession: (wallet: Web3MobileWallet) => Promise<Account>,
  transaction: Transaction | VersionedTransaction,
  minContextSlot: number,
): Promise<TransactionSignature> {
  if (!Number.isSafeInteger(minContextSlot) || minContextSlot < 0) inputFailure("invalid transaction context slot");
  let payer: PublicKey | undefined;
  try { payer = feePayerOf(transaction); if (!(payer instanceof PublicKey) || payer.equals(PublicKey.default)) inputFailure("transaction fee payer is missing"); }
  catch (error) { if (error instanceof MobileWalletError) throw error; inputFailure("transaction fee payer is missing"); }
  let authorized: Account;
  try { authorized = await authorizeSession(wallet as Web3MobileWallet); }
  catch (error) { const rejected = isUserRejection(error); throw new MobileWalletError("authorization", rejected ? "wallet authorization was rejected" : "wallet authorization failed", rejected); }
  let authorizedKey: PublicKey;
  try {
    const candidate = authorized?.publicKey;
    if (!(candidate instanceof PublicKey) || candidate.equals(PublicKey.default)) inputFailure("wallet authorization has no valid account");
    authorizedKey = new PublicKey(candidate.toBytes());
  } catch (error) { if (error instanceof MobileWalletError) throw error; return inputFailure("wallet authorization has no valid account"); }
  if (!payer.equals(authorizedKey)) inputFailure("transaction fee payer does not match the authorized account");
  let signatures: unknown;
  try {
    signatures = await wallet.signAndSendTransactions({ transactions: [transaction], minContextSlot, commitment: "confirmed", skipPreflight: false, maxRetries: 3, waitForCommitmentToSendNextTransaction: true });
  } catch (error) { const rejected = isUserRejection(error); throw new MobileWalletError("wallet", rejected ? "wallet request was rejected" : "wallet submission failed", rejected); }
  if (!Array.isArray(signatures) || typeof signatures[0] !== "string" || signatures[0].length === 0) throw new MobileWalletError("wallet", "wallet returned no transaction signature");
  return signatures[0] as TransactionSignature;
}

export function useMobileWallet() {
  const { authorizeSessionWithSignIn, authorizeSession, deauthorizeSession } = useAuthorization();
  const connect = useCallback(async (): Promise<Account> => transact(async (wallet) => authorizeSession(wallet)), [authorizeSession]);
  const signIn = useCallback(async (signInPayload: SignInPayload): Promise<Account> => transact(async (wallet) => authorizeSessionWithSignIn(wallet, signInPayload)), [authorizeSessionWithSignIn]);
  const disconnect = useCallback(async (): Promise<void> => { await transact(async (wallet) => { await deauthorizeSession(wallet); }); }, [deauthorizeSession]);
  const signAndSendTransaction = useCallback(async (transaction: Transaction | VersionedTransaction, minContextSlot: number): Promise<TransactionSignature> => await transact((wallet) => authorizeAndSendTransaction(wallet, authorizeSession, transaction, minContextSlot)), [authorizeSession]);
  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => transact(async (wallet) => { const authResult = await authorizeSession(wallet); const signedMessages = await wallet.signMessages({ addresses: [authResult.address], payloads: [message] }); return signedMessages[0]; }), [authorizeSession]);
  return useMemo(() => ({ connect, signIn, disconnect, signAndSendTransaction, signMessage }), [connect, signIn, disconnect, signAndSendTransaction, signMessage]);
}
