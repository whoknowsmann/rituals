/** End-to-end solo Ritual proof. Use --url localhost for the complete local run. */
import { Keypair, PublicKey } from '@solana/web3.js'
import type { RuleDigest } from '../src/domain/rituals/types'
import { DEMO_CADENCE, generateRitualSchedule, type RitualCadence } from '../src/domain/rituals/schedule'
import { generateRitualNonce } from '../src/domain/rituals/nonce'
import { RITUALS_PROGRAM_ID } from '../src/data/rituals/programIds'
import { eventPda } from '../src/data/rituals/pdas'
import { flag, connectionFor, isLocalUrl, option, parseCli, printJsonSummary, publicKeyOption, readKeypair, requiredOption } from './lib/cli'
import { createLocalMintAndProtocol, createTokenAccount, ensureLocalLamports, expectedActivationFee, hashHex, mintLocal, preparerFor, readProtocolConfig, readSeason, readerFor, refuseMainnetFundedPayer, sendPrepared, tokenAmount, waitUntil, LOCAL_FAST_CADENCE } from './lib/chain'
import type { ProtocolConfigAccountView, RitualAccountView, SeasonAccountView } from '../src/data/rituals/accounts'
import type { RitualAccountContext } from '../src/data/rituals/instructionsLifecycle'
import type { RitualEventAccountContext } from '../src/data/rituals/instructionsEvents'

const MEMBER_STAKE = 2_000_000n

type Path = 'honor' | 'miss' | 'skip' | 'witness'
type Check = { label: string; ok: boolean }

function assertCheck(checks: Check[], label: string, ok: boolean): void {
  checks.push({ label, ok })
  console.log(ok ? '  PASS' : '  FAIL', '-', label)
  if (!ok) throw new Error(label)
}

function rawEventSettlement(data: Uint8Array): { status: 'Settled' | 'Voided'; voidReason: string; forfeitedTotal: bigint } {
  if (data.length !== 139) throw new Error(`unexpected RitualEvent size: ${data.length}`)
  const status = data[67]
  const voidReason = data[88]
  if (status !== 3 && status !== 4) throw new Error(`event is not terminal: ${status}`)
  return { status: status === 3 ? 'Settled' : 'Voided', voidReason: ['None', 'NoConfirmedMembers', 'UnresolvedClaims', 'DeclaredSkip'][voidReason] ?? `unknown(${voidReason})`, forfeitedTotal: new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(97, true) }
}

async function readRawEventSettlement(connection: import('@solana/web3.js').Connection, ritual: PublicKey, index: number) {
  const [address] = eventPda(ritual, index, RITUALS_PROGRAM_ID)
  const info = await connection.getAccountInfo(address, 'confirmed')
  if (info === null) throw new Error('event missing after finalize')
  return rawEventSettlement(info.data)
}

function context(read: { address: PublicKey; account: RitualAccountView }): RitualAccountContext {
  return { address: read.address, account: read.account }
}

function scheduleFor(now: number, fast: boolean) {
  const cadence: RitualCadence = fast ? LOCAL_FAST_CADENCE : DEMO_CADENCE
  const first = now + (fast ? 45 : 120)
  return generateRitualSchedule({ firstEventAt: first, eventCount: 1, cadence })
}

async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2))
  const { url, connection } = connectionFor(args)
  const creatorPath = option(args, 'keypair') ?? option(args, 'creator-keypair') ?? requiredOption(args, 'keypair')
  const creator = readKeypair(creatorPath)
  const witnessPath = option(args, 'witness-keypair')
  const witness = witnessPath === undefined ? null : readKeypair(witnessPath)
  await refuseMainnetFundedPayer(url, creator)
  if (witness !== null) await refuseMainnetFundedPayer(url, witness)
  await ensureLocalLamports(connection, url, creator)
  if (witness !== null) await ensureLocalLamports(connection, url, witness)

  let localMint = false
  if (flag(args, 'create-local-mint')) {
    const local = await createLocalMintAndProtocol(connection, url, creator)
    localMint = true
    console.log('local mint:', local.mint.toBase58())
  }
  const configRead = await readProtocolConfig(connection)
  const config = configRead.account
  const suppliedSeason = publicKeyOption(args, 'season')
  const seasonAccount: SeasonAccountView | null = suppliedSeason === undefined ? null : await readSeason(connection, suppliedSeason)
  if (seasonAccount !== null && !seasonAccount.protocolConfig.equals(configRead.address)) throw new Error('Season is bound to another ProtocolConfig')

  let sourceToken = publicKeyOption(args, 'creator-token-account')
  let causeToken = publicKeyOption(args, 'cause-token-account') ?? publicKeyOption(args, 'cause')
  if (sourceToken === undefined) {
    if (!localMint && !isLocalUrl(url)) throw new Error('provide --creator-token-account on devnet')
    const created = await createTokenAccount(connection, creator, config.allowedStakeMint, creator.publicKey)
    sourceToken = created.address
    await mintLocal(connection, url, creator, config.allowedStakeMint, sourceToken, MEMBER_STAKE * 20n)
  }
  if (causeToken === undefined) {
    if (!localMint && !isLocalUrl(url)) throw new Error('provide --cause-token-account on devnet')
    const causeOwner = Keypair.generate()
    causeToken = (await createTokenAccount(connection, creator, config.allowedStakeMint, causeOwner.publicKey)).address
  }
  await tokenAmount(connection, sourceToken, config.allowedStakeMint)
  await tokenAmount(connection, causeToken, config.allowedStakeMint)
  const reader = readerFor(connection)
  const preparer = preparerFor(connection, url)
  const selectedPath = option(args, 'path', 'all') as string
  const paths: readonly Path[] = selectedPath === 'all' ? ['honor', 'miss', 'skip', 'witness'] : [selectedPath as Path]
  for (const path of paths) if (!['honor', 'miss', 'skip', 'witness'].includes(path)) throw new Error(`unknown --path ${path}`)
  if (paths.includes('witness') && witness === null) throw new Error('witness path requires --witness-keypair')
  const fast = flag(args, 'fast')
  const checks: Check[] = []
  const pathSummaries: Record<string, unknown>[] = []
  let transactionCount = 0

  for (const path of paths) {
    console.log(`\n[${path}] create + fund + activate`)
    const linkedSeason = seasonAccount !== null && Number(seasonAccount.schedule[0]?.opens ?? 0n) > Math.floor(Date.now() / 1000) + 5
    const beforeSeason = linkedSeason ? await readSeason(connection, suppliedSeason as PublicKey) : null
    const feeBefore = await tokenAmount(connection, config.feeRecipient, config.allowedStakeMint)
    const ritualSchedule = linkedSeason
      ? seasonAccount!.schedule.map((window, eventIndex) => ({ eventIndex, claimOpensAt: Number(window.opens), claimDeadlineAt: Number(window.deadline), resolutionDeadlineAt: Number(window.resolution) }))
      : scheduleFor(Math.floor(Date.now() / 1000), fast)
    const fee = expectedActivationFee(config, MEMBER_STAKE)
    const nonce = generateRitualNonce()
    const prepared = await preparer.prepareCreateSoloFundAndActivate({
      programId: RITUALS_PROGRAM_ID,
      creator: creator.publicKey,
      stakeMint: config.allowedStakeMint,
      feeRecipientToken: config.feeRecipient,
      forfeitDestination: causeToken,
      season: linkedSeason ? suppliedSeason : null,
      memberSource: sourceToken,
      lockedActivationFee: fee,
      ritual: {
        nonce,
        ruleDigest: hashHex(`${path}:${nonce.toString()}`) as RuleDigest,
        memberTotalStake: MEMBER_STAKE,
        schedule: ritualSchedule.map((entry) => ({ opens: BigInt(entry.claimOpensAt), deadline: BigInt(entry.claimDeadlineAt), resolution: BigInt(entry.resolutionDeadlineAt) })),
        witness: path === 'witness' ? witness!.publicKey : null,
      },
    })
    const signature = await sendPrepared(connection, preparer, prepared, [creator], `${path} create/fund/activate`)
    transactionCount += 1
    const ritualAddress = new PublicKey(prepared.ritualAddress)
    let ritualRead = await reader.getRitual(ritualAddress)
    assertCheck(checks, `${path}: ritual is Active`, ritualRead.account.status === 'Active')
    assertCheck(checks, `${path}: ritual is Solo`, ritualRead.account.kind === 'Solo')
    assertCheck(checks, `${path}: season participant count increments exactly once`, !linkedSeason || (await readSeason(connection, suppliedSeason as PublicKey)).participantCount === (beforeSeason!.participantCount + 1))
    const feeAfter = await tokenAmount(connection, config.feeRecipient, config.allowedStakeMint)
    assertCheck(checks, `${path}: fee recipient received exactly activation fee`, feeAfter - feeBefore === fee)
    const eventIndex = 0
    const window = ritualRead.account.schedule[eventIndex]
    if (!window) throw new Error('current event window missing')

    if (path === 'skip') {
      const skip = await preparer.prepareDeclareSkip({ programId: RITUALS_PROGRAM_ID, ritual: context(ritualRead), member: creator.publicKey, eventIndex })
      await sendPrepared(connection, preparer, skip, [creator], 'skip declaration')
      transactionCount += 1
      ritualRead = await reader.getRitual(ritualAddress)
      assertCheck(checks, 'skip: declared before the window opened', ritualRead.account.skipDeclared && ritualRead.account.skipEventIndex === eventIndex)
    }

    await waitUntil(window.opens, `${path} week 1 open`)
    ritualRead = await reader.getRitual(ritualAddress)
    if (path === 'honor' || path === 'witness') {
      const claim = await preparer.prepareInitializeAndClaim({ programId: RITUALS_PROGRAM_ID, ritual: context(ritualRead), eventIndex, payer: creator.publicKey, claimant: creator.publicKey })
      await sendPrepared(connection, preparer, claim, [creator], `${path} initialize + claim`)
      transactionCount += 1
      let bundle = await reader.getEventBundle(ritualAddress, eventIndex)
      const claimAccount = bundle.claims[0]?.account
      if (claimAccount === null || claimAccount === undefined || bundle.event === null) throw new Error(`${path}: claim readback missing`)
      if (path === 'honor') {
        assertCheck(checks, 'honor: claim is Confirmed', claimAccount.status === 'Confirmed')
        assertCheck(checks, 'honor: season checked-in count increments exactly once', !linkedSeason || (await readSeason(connection, suppliedSeason as PublicKey)).checkedInCount[eventIndex] === beforeSeason!.checkedInCount[eventIndex] + 1)
      } else {
        assertCheck(checks, 'witness: claim is Pending before approval', claimAccount.status === 'Pending')
        const beforeApprovalSeason = linkedSeason ? await readSeason(connection, suppliedSeason as PublicKey) : null
        const approve = await preparer.prepareApprove({ programId: RITUALS_PROGRAM_ID, ritual: bundle.ritual, event: bundle.event, claim: { address: bundle.claims[0].address, account: claimAccount }, approver: witness!.publicKey })
        await sendPrepared(connection, preparer, approve, [witness!], 'witness approval')
        transactionCount += 1
        bundle = await reader.getEventBundle(ritualAddress, eventIndex)
        const approved = bundle.claims[0]?.account
        assertCheck(checks, 'witness: claim is Confirmed after approval', approved?.status === 'Confirmed')
        assertCheck(checks, 'witness: season counter increments only on approval', !linkedSeason || (await readSeason(connection, suppliedSeason as PublicKey)).checkedInCount[eventIndex] === beforeApprovalSeason!.checkedInCount[eventIndex] + 1)
      }
      await waitUntil(window.resolution, `${path} resolution window`)
      const beforeFinalizeCreator = await tokenAmount(connection, sourceToken, config.allowedStakeMint)
      const beforeFinalizeVault = await tokenAmount(connection, ritualRead.account.stakeVault, config.allowedStakeMint)
      const latestBundle = await reader.getEventBundle(ritualAddress, eventIndex)
      if (latestBundle.event === null) throw new Error(`${path}: event missing before finalize`)
      const finalize = await preparer.prepareFinalize({ programId: RITUALS_PROGRAM_ID, ritual: latestBundle.ritual, event: latestBundle.event, destinationTokenAccounts: [sourceToken], feePayer: creator.publicKey })
      await sendPrepared(connection, preparer, finalize, [creator], `${path} finalize`)
      transactionCount += 1
      const settled = await reader.getEventBundle(ritualAddress, eventIndex)
      if (settled.event === null) throw new Error(`${path}: event missing after finalize`)
      const afterFinalizeCreator = await tokenAmount(connection, sourceToken, config.allowedStakeMint)
      const afterFinalizeVault = await tokenAmount(connection, ritualRead.account.stakeVault, config.allowedStakeMint)
      assertCheck(checks, `${path}: event is Settled`, settled.event.account.status === 'Settled')
      assertCheck(checks, `${path}: creator/vault conservation`, afterFinalizeCreator - beforeFinalizeCreator === beforeFinalizeVault - afterFinalizeVault)
      pathSummaries.push({ path, ritual: ritualAddress, signature, eventStatus: settled.event.account.status, claimStatus: settled.claims[0]?.account?.status })
      continue
    }

    const initialize = await preparer.prepareInitializeEvent({ programId: RITUALS_PROGRAM_ID, ritual: context(ritualRead), eventIndex, payer: creator.publicKey })
    await sendPrepared(connection, preparer, initialize, [creator], `${path} initialize event`)
    transactionCount += 1
    await waitUntil(window.resolution, `${path} resolution window`)
    const beforeFinalizeCreator = await tokenAmount(connection, sourceToken, config.allowedStakeMint)
    const beforeFinalizeCause = await tokenAmount(connection, causeToken, config.allowedStakeMint)
    const beforeFinalizeVault = await tokenAmount(connection, ritualRead.account.stakeVault, config.allowedStakeMint)
    const eventBundle = await reader.getEventBundle(ritualAddress, eventIndex)
    if (eventBundle.event === null) throw new Error(`${path}: event missing before finalize`)
    const finalize = await preparer.prepareFinalize({ programId: RITUALS_PROGRAM_ID, ritual: eventBundle.ritual, event: eventBundle.event, destinationTokenAccounts: [sourceToken], feePayer: creator.publicKey })
    await sendPrepared(connection, preparer, finalize, [creator], `${path} finalize`)
    transactionCount += 1
    let terminal: { status: 'Settled' | 'Voided'; voidReason: string; forfeitedTotal: bigint }
    if (path === 'miss') {
      terminal = await readRawEventSettlement(connection, ritualAddress, eventIndex)
    } else {
      const settled = await reader.getEventBundle(ritualAddress, eventIndex)
      if (settled.event === null || !['Settled', 'Voided'].includes(settled.event.account.status)) throw new Error(`${path}: event missing or non-terminal after finalize`)
      terminal = { status: settled.event.account.status as 'Settled' | 'Voided', voidReason: settled.event.account.voidReason, forfeitedTotal: settled.event.account.forfeitedTotal }
    }
    const afterFinalizeCreator = await tokenAmount(connection, sourceToken, config.allowedStakeMint)
    const afterFinalizeCause = await tokenAmount(connection, causeToken, config.allowedStakeMint)
    const afterFinalizeVault = await tokenAmount(connection, ritualRead.account.stakeVault, config.allowedStakeMint)
    assertCheck(checks, `${path}: event is terminal`, path === 'skip' ? terminal.status === 'Voided' : terminal.status === 'Settled')
    if (path === 'miss') {
      assertCheck(checks, 'miss: allocation arrived at cause exactly', afterFinalizeCause - beforeFinalizeCause === ritualRead.account.perEventAllocation)
      assertCheck(checks, 'miss: creator got nothing for the missed week', afterFinalizeCreator - beforeFinalizeCreator === 0n)
      assertCheck(checks, 'miss: creator/vault/cause conservation', afterFinalizeVault + (afterFinalizeCause - beforeFinalizeCause) === beforeFinalizeVault)
      assertCheck(checks, 'miss: forfeiture receipt is allocation-sized', terminal.forfeitedTotal === ritualRead.account.perEventAllocation)
    } else {
      assertCheck(checks, 'skip: event is voided for declared skip', terminal.status === 'Voided' && terminal.voidReason === 'DeclaredSkip')
      assertCheck(checks, 'skip: stake was refunded to creator', afterFinalizeCreator - beforeFinalizeCreator === ritualRead.account.perEventAllocation)
      assertCheck(checks, 'skip: cause received nothing', afterFinalizeCause - beforeFinalizeCause === 0n)
    }
    pathSummaries.push({ path, ritual: ritualAddress, signature, eventStatus: terminal.status, voidReason: terminal.voidReason })
  }

  const failed = checks.filter((check) => !check.ok).length
  if (failed !== 0) throw new Error(`${failed} assertion(s) failed`)
  printJsonSummary({ script: 'smoke-solo', url, localMint, season: suppliedSeason, creator: creator.publicKey, witness: witness?.publicKey ?? null, sourceToken, causeToken, paths, transactions: transactionCount, assertions: checks.length, assertionFailures: failed, results: pathSummaries })
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
