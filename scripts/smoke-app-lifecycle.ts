/**
 * App-level devnet proof for the complete Rituals journey.
 *
 * This deliberately uses the same facade/dependency builders/orchestrators as
 * the mobile screens. The only substituted boundary is the wallet transport:
 * local CLI keypairs sign the exact prepared transaction and send it to devnet.
 *
 * Usage:
 *   npx tsx scripts/smoke-app-lifecycle.ts HOST_TOKEN_ACCOUNT FRIEND_TOKEN_ACCOUNT
 *
 * Devnet only. Never uses the Solana CLI default wallet.
 */
import { readFileSync } from 'node:fs'
import { feeForMessageAtSlot, withReadRetry } from '../src/features/rituals/client/resilientRead'
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { getAccount } from '@solana/spl-token'
import { createCurrentRitualClient, type RitualClientTransport } from '../src/data/rituals/ritualClient'
import type { RitualWalletSubmissionTransport } from '../src/data/rituals/ritualSubmission'
import { buildCreateRitualDeps } from '../src/features/rituals/create/buildCreateDeps'
import { runCreateRitual } from '../src/features/rituals/create/runCreateRitual'
import { validateRitualDraft, type ValidatedRitualDraft } from '../src/features/rituals/create/draftForm'
import { buildRitualActionDeps } from '../src/features/rituals/buildRitualActionDeps'
import { runLifecycleAction } from '../src/features/rituals/runLifecycleAction'
import { lifecycleInitialState, lifecycleReducer, type LifecycleEvent, type LifecycleState } from '../src/features/rituals/lifecycleMachine'
import { DEMO_CADENCE } from '../src/domain/rituals/schedule'
import { RITUALS_DEVNET_STAKE_MINT } from '../src/data/rituals/programIds'

const URL = 'https://api.devnet.solana.com'
const HOST_KEYPAIR = '.keys/rituals-devnet-deployer.json'
const FRIEND_KEYPAIR = '.keys/rituals-devnet-friend.json'
const MEMBER_STAKE = 2_000_000n

function keypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8')) as number[]))
}

function requirePublicKey(value: string | undefined, label: string): PublicKey {
  if (!value) throw new Error(`usage: provide ${label} token account`)
  const result = new PublicKey(value)
  if (result.equals(PublicKey.default) || result.toBase58() !== value) throw new Error(`${label} token account is not canonical`)
  return result
}

function draft(): ValidatedRitualDraft {
  const result = validateRitualDraft({
    title: 'App lifecycle proof',
    requirement: 'Show up and complete the check-in.',
    memberCount: '2',
    eventCount: '2',
    memberTotalStake: '2',
    confirmationMode: 'ONE_FRIEND',
    feePayerMode: 'HOST',
  })
  if (!result.ok) throw new Error('smoke draft is invalid')
  return result.value
}

function stateRunner() {
  let state: LifecycleState = lifecycleInitialState()
  const dispatch = (event: LifecycleEvent) => { state = lifecycleReducer(state, event) }
  return { dispatch, get state() { return state } }
}

async function tokenAmount(connection: Connection, address: PublicKey): Promise<bigint> {
  const account = await getAccount(connection, address, 'confirmed')
  if (!account.mint.equals(RITUALS_DEVNET_STAKE_MINT)) throw new Error(`token account ${address.toBase58()} has the wrong mint`)
  return account.amount
}

async function runAction(
  label: string,
  deps: ReturnType<typeof buildRitualActionDeps>,
  assertState: (state: LifecycleState) => void,
): Promise<string> {
  console.log(`\n[${label}]`)
  const runner = stateRunner()
  const result = await runLifecycleAction(deps, runner.dispatch)
  if (!result.ok) throw new Error(`${label} failed in ${result.category}`)
  assertState(runner.state)
  return result.result.signature
}

async function main(): Promise<void> {
  const host = keypair(HOST_KEYPAIR)
  const friend = keypair(FRIEND_KEYPAIR)
  const hostToken = requirePublicKey(process.argv[2], 'host')
  const friendToken = requirePublicKey(process.argv[3], 'friend')
  const connection = new Connection(URL, 'confirmed')
  const signers = new Map([[host.publicKey.toBase58(), host], [friend.publicKey.toBase58(), friend]])
  const transport: RitualClientTransport & RitualWalletSubmissionTransport = {
    // Same read-retry wrapper the app transport uses (useRitualClient).
    getMultipleAccountsInfoAndContext: withReadRetry(connection.getMultipleAccountsInfoAndContext.bind(connection)),
    getLatestBlockhashAndContext: withReadRetry(connection.getLatestBlockhashAndContext.bind(connection)),
    getFeeForMessage: feeForMessageAtSlot(connection.getFeeForMessage.bind(connection) as never) as never,
    getMinimumBalanceForRentExemption: connection.getMinimumBalanceForRentExemption.bind(connection),
    confirmTransaction: async (strategy, commitment) => {
      let lastError: unknown
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try { return await connection.confirmTransaction(strategy, commitment) }
        catch (error) {
          lastError = error
          // Public devnet occasionally rate-limits confirmTransaction. A sent
          // signature can still be confirmed through the status endpoint.
          try {
            const status = (await connection.getSignatureStatuses([strategy.signature], { searchTransactionHistory: true })).value[0]
            if (status?.err !== null && status?.err !== undefined) return { context: { slot: await connection.getSlot('confirmed') }, value: { err: status.err } }
            if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return { context: { slot: await connection.getSlot('confirmed') }, value: { err: null } }
          } catch { /* retry the authoritative confirmation path */ }
          await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
        }
      }
      throw lastError
    },
    signAndSendTransaction: async (transaction: Transaction, minContextSlot: number) => {
      const payer = transaction.feePayer
      if (!payer) throw new Error('prepared transaction has no fee payer')
      const signer = signers.get(payer.toBase58())
      if (!signer) throw new Error('no local signer for prepared fee payer')
      transaction.partialSign(signer)
      return connection.sendRawTransaction(transaction.serialize(), { preflightCommitment: 'confirmed', minContextSlot })
    },
  }
  const client = createCurrentRitualClient(transport, transport)
  const now = () => Date.now()
  const members = [host.publicKey, friend.publicKey]
  const ritualDraft = draft()
  const hostBefore = await tokenAmount(connection, hostToken)
  const friendBefore = await tokenAmount(connection, friendToken)
  const feeRecipientBefore = await tokenAmount(connection, (await client.getProtocolConfig()).account.feeRecipient)
  console.log('host  :', host.publicKey.toBase58())
  console.log('friend:', friend.publicKey.toBase58())

  const createEvents: unknown[] = []
  const createDeps = buildCreateRitualDeps({
    client,
    creator: host.publicKey,
    members,
    draft: ritualDraft,
    cadence: DEMO_CADENCE,
    firstEventAt: Math.floor(Date.now() / 1000) + 15,
  })
  let createdRitualText: string | null = null
  const createResult = await runCreateRitual(createDeps, (event) => {
    createEvents.push(event)
    if (event.type === 'PREPARED') createdRitualText = event.prepared.ritualAddress
  })
  if (!createResult.ok || !createdRitualText) throw new Error('Create did not reach confirmed state')
  const ritualAddress = new PublicKey(createdRitualText)
  const created = await client.getRitualBundle(ritualAddress)
  if (created.ritual.account.status !== 'Funding') throw new Error('Create readback was not Funding')
  console.log('[create] confirmed:', createResult.result.signature)
  console.log('ritual:', ritualAddress.toBase58())

  const runFund = async (actor: Keypair, source: PublicKey) => runAction(
    `fund ${actor.publicKey.equals(host.publicKey) ? 'host' : 'friend'}`,
    buildRitualActionDeps({
      client,
      ritualAddress,
      actor: actor.publicKey,
      kind: 'fund',
      memberSource: source,
      getUnixTimestamp: async () => {
        const slot = await connection.getSlot('confirmed')
        const timestamp = await connection.getBlockTime(slot)
        if (timestamp === null) throw new Error('chain clock is unavailable')
        return timestamp
      },
      getTokenAccountAmount: (address) => tokenAmount(connection, address),
    }),
    (state) => { if (state.status !== 'confirmed') throw new Error('fund did not reach confirmed state') },
  )
  const fundHostSignature = await runFund(host, hostToken)
  let read = await client.readRitual(ritualAddress)
  if (read.account.fundedMembersBitmap !== 1 || read.account.fundedMemberCount !== 1 || read.account.fundedStakeTotal !== MEMBER_STAKE) throw new Error('host fund authoritative readback mismatch')
  const hostAfterFund = await tokenAmount(connection, hostToken)
  if (hostBefore - hostAfterFund !== MEMBER_STAKE + read.account.lockedActivationFee) throw new Error('host token balance delta mismatch')
  console.log('fund host:', fundHostSignature)

  const fundFriendSignature = await runFund(friend, friendToken)
  read = await client.readRitual(ritualAddress)
  if (read.account.status !== 'Active' || read.account.fundedMembersBitmap !== 3 || read.account.fundedMemberCount !== 2 || read.account.fundedStakeTotal !== MEMBER_STAKE * 2n || read.account.fundedFeeTotal !== read.account.lockedActivationFee) throw new Error('friend fund+activate authoritative readback mismatch')
  const friendAfterFund = await tokenAmount(connection, friendToken)
  if (friendBefore - friendAfterFund !== MEMBER_STAKE) throw new Error('friend token balance delta mismatch')
  const feeRecipientAfter = await tokenAmount(connection, read.protocolConfig.feeRecipient)
  if (feeRecipientAfter - hostAfterFund !== read.account.lockedActivationFee) throw new Error('activation fee recipient balance mismatch')
  console.log('fund friend + activate:', fundFriendSignature)
  console.log('APP FUND+ACTIVATE VERIFIED ON DEVNET')

  const eventIndex = 0
  const eventReady = async () => {
    const current = await client.readRitual(ritualAddress)
    const wait = Number(current.account.schedule[eventIndex].opens) * 1000 - Date.now()
    if (wait > 0) { console.log(`waiting ${Math.ceil(wait / 1000)}s for event window`); await new Promise((resolve) => setTimeout(resolve, wait + 1500)) }
  }
  await eventReady()

  const initializeSignature = await runAction(
    'initialize event',
    buildRitualActionDeps({ client, ritualAddress, actor: host.publicKey, kind: 'initialize-event', eventIndex }),
    (state) => { if (state.status !== 'confirmed') throw new Error('initialize did not reach confirmed state') },
  )
  let bundle = await client.getEventBundle(ritualAddress, eventIndex)
  if (!bundle.event || bundle.event.account.status !== 'Claiming') throw new Error('initialize event readback mismatch')
  console.log('initialize:', initializeSignature)

  const claimSignature = await runAction(
    'claim host',
    buildRitualActionDeps({ client, ritualAddress, actor: host.publicKey, kind: 'claim', eventIndex, claimant: host.publicKey }),
    (state) => { if (state.status !== 'confirmed') throw new Error('claim did not reach confirmed state') },
  )
  bundle = await client.getEventBundle(ritualAddress, eventIndex)
  const claim = bundle.claims.find((entry) => entry.member.equals(host.publicKey))?.account
  if (!claim || claim.status !== 'Pending') throw new Error('claim readback mismatch')
  console.log('claim:', claimSignature)

  const approveSignature = await runAction(
    'approve friend',
    buildRitualActionDeps({ client, ritualAddress, actor: friend.publicKey, kind: 'approve', eventIndex, claimant: host.publicKey }),
    (state) => { if (state.status !== 'confirmed') throw new Error('approve did not reach confirmed state') },
  )
  bundle = await client.getEventBundle(ritualAddress, eventIndex)
  const confirmedClaim = bundle.claims.find((entry) => entry.member.equals(host.publicKey))?.account
  if (!confirmedClaim || confirmedClaim.status !== 'Confirmed' || confirmedClaim.approvalCount !== 1) throw new Error('approve readback mismatch')
  console.log('approve:', approveSignature)

  const waitResolve = Number(bundle.event?.account.window.resolution ?? 0n) * 1000 - Date.now()
  if (waitResolve > 0) { console.log(`waiting ${Math.ceil(waitResolve / 1000)}s for resolution`); await new Promise((resolve) => setTimeout(resolve, waitResolve + 1500)) }
  const finalizeSignature = await runAction(
    'finalize event',
    buildRitualActionDeps({ client, ritualAddress, actor: host.publicKey, kind: 'finalize', eventIndex, destinationTokenAccounts: [hostToken, friendToken] }),
    (state) => { if (state.status !== 'confirmed') throw new Error('finalize did not reach confirmed state') },
  )
  bundle = await client.getEventBundle(ritualAddress, eventIndex)
  const event = bundle.event
  if (!event || event.account.status !== 'Settled') throw new Error('finalize readback was not Settled')
  const settled = event.account
  if (settled.payoutTotal + settled.refundedTotal + settled.remainderUnits !== settled.eventPool) throw new Error('settlement conservation mismatch')
  if (settled.forfeitedTotal !== MEMBER_STAKE / 2n || settled.refundedTotal !== 0n || settled.remainderUnits !== 0n || settled.payoutTotal !== settled.eventPool) throw new Error('settlement did not pay confirmed allocation and forfeiture exactly')
  if (settled.remainingStakeTotalAfter !== MEMBER_STAKE) throw new Error('remaining future-event stake mismatch')
  const completed = await client.readRitual(ritualAddress)
  if (completed.account.status !== 'Active' || completed.account.currentEventIndex !== 1) throw new Error('accelerated first-event ritual readback mismatch')
  const hostAfterSettle = await tokenAmount(connection, hostToken)
  const friendAfterSettle = await tokenAmount(connection, friendToken)
  const feeRecipientAddress = completed.protocolConfig.feeRecipient
  // On devnet the deployer is both the host member and the protocol fee
  // recipient, so the two token accounts may be the SAME account. The
  // activation fee landed in it after hostAfterFund was read, so the
  // settlement baseline must be the post-activation balance. With aliasing,
  // "combined delta == on-chain payoutTotal" proves the claimant received the
  // exact payout and the protocol received nothing extra.
  const feeRecipientAliasesHost = feeRecipientAddress.equals(hostToken)
  const hostSettleBaseline = feeRecipientAliasesHost ? feeRecipientAfter : hostAfterFund
  if (hostAfterSettle - hostSettleBaseline !== settled.payoutTotal) throw new Error('settlement payout did not reach confirmed claimant exactly')
  if (friendAfterSettle !== friendAfterFund) throw new Error('unclaimed friend balance changed unexpectedly during settlement')
  if (!feeRecipientAliasesHost) {
    const feeRecipientFinal = await tokenAmount(connection, feeRecipientAddress)
    if (feeRecipientFinal !== feeRecipientAfter) throw new Error('protocol took something during settlement')
  }
  console.log('finalize:', finalizeSignature)
  console.log('settlement:', JSON.stringify({ pool: settled.eventPool.toString(), payout: settled.payoutTotal.toString(), forfeited: settled.forfeitedTotal.toString(), remainingStake: settled.remainingStakeTotalAfter.toString() }))
  console.log('APP FULL LIFECYCLE VERIFIED ON DEVNET')
  if (createEvents.length < 5) throw new Error('Create did not pass through the app state machine')
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
