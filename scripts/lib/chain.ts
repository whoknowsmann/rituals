import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { getAccount, createAccount, createMint, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from '@solana/web3.js'
import { decodeProtocolConfig, decodeSeason, type ProtocolConfigAccountView, type SeasonAccountView } from '../../src/data/rituals/accounts'
import { buildInitializeProtocolConfigInstruction } from '../../src/data/rituals/instructionsLifecycle'
import { protocolConfigPda, seasonPda } from '../../src/data/rituals/pdas'
import { RITUALS_PROGRAM_ID, RITUALS_DEVNET_FEE_RECIPIENT, RITUALS_DEVNET_STAKE_MINT } from '../../src/data/rituals/programIds'
import { RitualActionPreparer, type PreparedRitualAction, type RitualPreparationTransport } from '../../src/data/rituals/ritualPreparedAction'
import { RitualsRpcReader } from '../../src/data/rituals/ritualsRpc'
import { isDevnetUrl, isLocalUrl, printJsonSummary, sleep } from './cli'

export const LOCAL_FAST_CADENCE = Object.freeze({ periodSeconds: 30, claimWindowSeconds: 15, resolutionGraceSeconds: 10, accelerated: true, label: 'Local validator fast' })
export const ACTIVATION_FEE_FALLBACK = 500_000n
export const MAXIMUM_MEMBER_STAKE = 1_000_000_000_000n

export function hashBytes(value: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(value, 'utf8').digest())
}

export function hashHex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function readerFor(connection: Connection): RitualsRpcReader {
  return new RitualsRpcReader({ getMultipleAccountsInfoAndContext: connection.getMultipleAccountsInfoAndContext.bind(connection) }, RITUALS_PROGRAM_ID)
}

export function preparerFor(connection: Connection, url: string): RitualActionPreparer {
  if (!isLocalUrl(url)) return new RitualActionPreparer(connection as unknown as RitualPreparationTransport, RITUALS_PROGRAM_ID)
  // solana-test-validator 3.0 may return a null fee and an older context slot
  // for getFeeForMessage. The local fee is the fixed 5,000-lamport base fee;
  // keep the production preparer unchanged and adapt only this local harness.
  const localTransport: RitualPreparationTransport = {
    getLatestBlockhashAndContext: connection.getLatestBlockhashAndContext.bind(connection),
    getFeeForMessage: async (message, config) => {
      const response = await connection.getFeeForMessage(message, 'confirmed')
      return { context: { ...response.context, slot: Math.max(response.context.slot, config.minContextSlot) }, value: response.value ?? 5_000 }
    },
    getMinimumBalanceForRentExemption: connection.getMinimumBalanceForRentExemption.bind(connection),
  }
  return new RitualActionPreparer(localTransport, RITUALS_PROGRAM_ID)
}

export async function refuseMainnetFundedPayer(url: string, payer: Keypair): Promise<bigint> {
  if (!isDevnetUrl(url) || isLocalUrl(url)) return 0n
  const mainnet = new Connection('https://api.mainnet-beta.solana.com', 'confirmed')
  let lamports: number
  try { lamports = await mainnet.getBalance(payer.publicKey, 'confirmed') } catch { throw new Error('could not check payer mainnet balance; refusing to continue') }
  if (lamports > 0) throw new Error(`payer ${payer.publicKey.toBase58()} holds ${lamports} lamports on mainnet; refusing a devnet run`)
  return BigInt(lamports)
}

export async function ensureLocalLamports(connection: Connection, url: string, payer: Keypair, minimum = 5_000_000_000): Promise<void> {
  if (!isLocalUrl(url)) return
  const balance = await connection.getBalance(payer.publicKey, 'confirmed')
  if (balance >= minimum) return
  const signature = await connection.requestAirdrop(payer.publicKey, minimum - balance)
  const latest = await connection.getLatestBlockhash('confirmed')
  const confirmation = await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
  if (confirmation.value.err) throw new Error(`local airdrop failed: ${JSON.stringify(confirmation.value.err)}`)
}

export async function tokenAmount(connection: Connection, address: PublicKey, expectedMint?: PublicKey): Promise<bigint> {
  const account = await getAccount(connection, address, 'confirmed')
  if (expectedMint !== undefined && !account.mint.equals(expectedMint)) throw new Error(`${address.toBase58()} has the wrong mint`)
  return account.amount
}

export async function createTokenAccount(connection: Connection, payer: Keypair, mint: PublicKey, owner: PublicKey): Promise<{ address: PublicKey; accountKeypair: Keypair }> {
  const accountKeypair = Keypair.generate()
  const address = await createAccount(connection, payer, mint, owner, accountKeypair, undefined, TOKEN_PROGRAM_ID)
  return { address, accountKeypair }
}

export async function createLocalMintAndProtocol(
  connection: Connection,
  url: string,
  authority: Keypair,
): Promise<{ mint: PublicKey; feeRecipient: PublicKey; mintAuthority: Keypair }> {
  if (!isLocalUrl(url)) throw new Error('--create-local-mint is allowed only with a localhost --url')
  await ensureLocalLamports(connection, url, authority)
  const mint = await createMint(connection, authority, authority.publicKey, null, 6)
  const fee = await createTokenAccount(connection, authority, mint, authority.publicKey)
  await initializeProtocolConfig(connection, authority, mint, fee.address)
  return { mint, feeRecipient: fee.address, mintAuthority: authority }
}

export async function initializeProtocolConfig(connection: Connection, authority: Keypair, mint: PublicKey, feeRecipient: PublicKey): Promise<{ address: PublicKey; created: boolean }> {
  const [address] = protocolConfigPda(RITUALS_PROGRAM_ID)
  const existing = await connection.getAccountInfo(address, 'confirmed')
  if (existing !== null) {
    const decoded = decodeProtocolConfig(existing, RITUALS_PROGRAM_ID)
    if (!decoded.allowedStakeMint.equals(mint) || !decoded.feeRecipient.equals(feeRecipient)) throw new Error('existing ProtocolConfig does not match the requested local mint/fee recipient')
    return { address, created: false }
  }
  const instruction = buildInitializeProtocolConfigInstruction({ programId: RITUALS_PROGRAM_ID, authority: authority.publicKey, config: { allowedStakeMint: mint, feeRecipient, feeBasisPoints: 200, minimumFee: ACTIVATION_FEE_FALLBACK, maximumFee: 5_000_000n, maximumMemberStake: MAXIMUM_MEMBER_STAKE } })
  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(instruction), [authority], { commitment: 'confirmed' })
  const created = await connection.getAccountInfo(address, 'confirmed')
  if (created === null || !created.owner.equals(RITUALS_PROGRAM_ID)) throw new Error(`ProtocolConfig missing after initialization (${signature})`)
  return { address, created: true }
}

export async function readProtocolConfig(connection: Connection): Promise<{ address: PublicKey; account: ProtocolConfigAccountView }> {
  const reader = readerFor(connection)
  return reader.getProtocolConfig()
}

export async function readSeason(connection: Connection, seasonAddress: PublicKey): Promise<SeasonAccountView> {
  const info = await connection.getAccountInfo(seasonAddress, 'confirmed')
  if (info === null) throw new Error(`Season not found: ${seasonAddress.toBase58()}`)
  return decodeSeason(info, RITUALS_PROGRAM_ID, seasonAddress)
}

export async function sendTransaction(connection: Connection, transaction: Transaction, signers: readonly Keypair[], label: string): Promise<string> {
  const signature = await connection.sendRawTransaction(transaction.serialize(), { preflightCommitment: 'confirmed', maxRetries: 3 })
  const confirmation = await connection.confirmTransaction(signature, 'confirmed')
  if (confirmation.value.err) throw new Error(`${label} failed on-chain: ${JSON.stringify(confirmation.value.err)}`)
  return signature
}

export async function sendPrepared(connection: Connection, preparer: RitualActionPreparer, prepared: PreparedRitualAction, signers: readonly Keypair[], label: string): Promise<string> {
  const wallet = preparer.getTransactionForWallet(prepared)
  wallet.transaction.partialSign(...signers)
  return sendTransaction(connection, wallet.transaction, signers, label)
}

export async function waitUntil(unixSeconds: bigint, label: string, minimumWaitMs = 0): Promise<void> {
  const target = Number(unixSeconds) * 1000
  if (!Number.isSafeInteger(target)) throw new Error(`${label} timestamp is outside the safe range`)
  const milliseconds = Math.max(minimumWaitMs, target - Date.now() + 5_000)
  if (milliseconds > 0) {
    console.log(`waiting ${Math.ceil(milliseconds / 1000)}s for ${label}`)
    await sleep(milliseconds)
  }
}

export function seasonAddressFromId(seasonId: Uint8Array): PublicKey {
  return seasonPda(seasonId, RITUALS_PROGRAM_ID)[0]
}

export function expectedActivationFee(config: ProtocolConfigAccountView, stake: bigint): bigint {
  const raw = (stake * BigInt(config.feeBasisPoints)) / 10_000n
  return raw < config.minimumFee ? config.minimumFee : raw > config.maximumFee ? config.maximumFee : raw
}

export async function mintLocal(connection: Connection, url: string, mintAuthority: Keypair, mint: PublicKey, destination: PublicKey, amount: bigint): Promise<void> {
  if (!isLocalUrl(url)) throw new Error('mintLocal is only allowed against localhost')
  await mintTo(connection, mintAuthority, mint, destination, mintAuthority, amount)
}

export function seasonSummary(address: PublicKey, account: SeasonAccountView): Record<string, unknown> {
  return { address, seasonId: Buffer.from(account.seasonId).toString('hex'), titleDigest: Buffer.from(account.titleDigest).toString('hex'), scheduleLength: account.schedule.length, startAt: account.startAt, endAt: account.endAt, authority: account.authority, participantCount: account.participantCount, checkedInCount: account.checkedInCount }
}

export function printAndReturn(summary: Record<string, unknown>): void {
  printJsonSummary(summary)
}
