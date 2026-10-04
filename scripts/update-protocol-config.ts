/**
 * Change the Rituals ProtocolConfig fee settings on devnet (authority only).
 *
 * Uses the SAME typed instruction builder and account decoder the mobile
 * client uses, so what the app quotes cannot drift from the chain. Defaults to
 * a free protocol: 0 basis points, 0 minimum, 0 maximum.
 *
 *   npx tsx scripts/update-protocol-config.ts            # print current, then set 0 / 0 / 0
 *   npx tsx scripts/update-protocol-config.ts --dry-run  # print current only
 *   npx tsx scripts/update-protocol-config.ts --bps 200 --min 500000 --max 5000000
 *
 * Devnet only. Signer: the deployer / config authority (never the CLI default
 * wallet). Requires the upgraded program that has `update_protocol_config`.
 */

import { readFileSync } from 'node:fs'
import {
  Connection,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import { buildUpdateProtocolConfigInstruction } from '../src/data/rituals/instructionsLifecycle'
import { RitualsRpcReader } from '../src/data/rituals/ritualsRpc'
import { protocolConfigPda } from '../src/data/rituals/pdas'
import { RITUALS_PROGRAM_ID } from '../src/data/rituals/programIds'

const URL = 'https://api.devnet.solana.com'
const KEYPAIR_PATH = '../preflight/.keys/rituals-devnet-deployer.json'

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const feeBasisPoints = Number(option(args, 'bps') ?? '0')
  const minimumFee = BigInt(option(args, 'min') ?? '0')
  const maximumFee = BigInt(option(args, 'max') ?? '0')

  const connection = new Connection(URL, 'confirmed')
  const reader = new RitualsRpcReader(
    { getMultipleAccountsInfoAndContext: connection.getMultipleAccountsInfoAndContext.bind(connection) } as never,
    RITUALS_PROGRAM_ID,
  )
  const [configPda] = protocolConfigPda(RITUALS_PROGRAM_ID)

  const before = await reader.getProtocolConfig()
  console.log('program        :', RITUALS_PROGRAM_ID.toBase58())
  console.log('protocol config:', configPda.toBase58())
  console.log('authority      :', before.account.authority.toBase58())
  console.log('current fee    :', `${before.account.feeBasisPoints} bps, min ${before.account.minimumFee}, max ${before.account.maximumFee}`)
  console.log('requested fee  :', `${feeBasisPoints} bps, min ${minimumFee}, max ${maximumFee}`)
  if (dryRun) { console.log('\n--dry-run: nothing sent.'); return }

  const secret = Uint8Array.from(JSON.parse(readFileSync(KEYPAIR_PATH, 'utf8')) as number[])
  const authority = Keypair.fromSecretKey(secret)
  if (!authority.publicKey.equals(before.account.authority)) {
    throw new Error(`keypair ${authority.publicKey.toBase58()} is not the config authority`)
  }
  if (before.account.feeBasisPoints === feeBasisPoints && before.account.minimumFee === minimumFee && before.account.maximumFee === maximumFee) {
    console.log('\nAlready set; nothing to do.')
    return
  }

  const instruction = buildUpdateProtocolConfigInstruction({
    programId: RITUALS_PROGRAM_ID,
    authority: authority.publicKey,
    config: { feeBasisPoints, minimumFee, maximumFee },
  })
  console.log('\nsubmitting update_protocol_config...')
  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(instruction), [authority], { commitment: 'confirmed' })
  console.log('signature:', signature)

  // Authoritative readback through the client's own decoder.
  const after = await reader.getProtocolConfig()
  console.log('new fee        :', `${after.account.feeBasisPoints} bps, min ${after.account.minimumFee}, max ${after.account.maximumFee}`)
  const unchanged = after.account.authority.equals(before.account.authority)
    && after.account.allowedStakeMint.equals(before.account.allowedStakeMint)
    && after.account.feeRecipient.equals(before.account.feeRecipient)
    && after.account.maximumMemberStake === before.account.maximumMemberStake
    && after.account.paused === before.account.paused
  if (after.account.feeBasisPoints !== feeBasisPoints || after.account.minimumFee !== minimumFee || after.account.maximumFee !== maximumFee) {
    throw new Error('readback does not match the requested fee settings')
  }
  if (!unchanged) throw new Error('a non-fee field changed; inspect the account')
  console.log('verified: fee settings updated, every other field unchanged.')
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
