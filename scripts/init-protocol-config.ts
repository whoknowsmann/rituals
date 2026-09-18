/**
 * Initialize the Rituals ProtocolConfig on devnet.
 *
 * Uses the SAME typed instruction builders the mobile client uses, so the
 * on-chain configuration cannot drift from what the app expects. Run once per
 * deployment; re-running fails because the PDA already exists.
 *
 * Devnet only. The stake mint is a valueless TEST token.
 */

import { readFileSync } from 'node:fs'
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import { buildInitializeProtocolConfigInstruction } from '../src/data/rituals/instructionsLifecycle'
import { protocolConfigPda } from '../src/data/rituals/pdas'
import {
  RITUALS_PROGRAM_ID,
  RITUALS_DEVNET_STAKE_MINT,
  RITUALS_DEVNET_FEE_RECIPIENT,
} from '../src/data/rituals/programIds'
import { RITUAL_FEE_CONFIG } from '../src/features/rituals/create/draftForm'

const URL = 'https://api.devnet.solana.com'
const KEYPAIR_PATH = '.keys/rituals-devnet-deployer.json'

// Mirrors RITUAL_FEE_CONFIG so review-screen fee quotes match the chain.
const MAXIMUM_MEMBER_STAKE = 1_000_000_000_000n // 1,000,000 TEST at 6 decimals

async function main(): Promise<void> {
  const secret = Uint8Array.from(JSON.parse(readFileSync(KEYPAIR_PATH, 'utf8')) as number[])
  const authority = Keypair.fromSecretKey(secret)
  const connection = new Connection(URL, 'confirmed')

  const [configPda] = protocolConfigPda(RITUALS_PROGRAM_ID)
  console.log('program        :', RITUALS_PROGRAM_ID.toBase58())
  console.log('authority      :', authority.publicKey.toBase58())
  console.log('protocol config:', configPda.toBase58())
  console.log('stake mint     :', RITUALS_DEVNET_STAKE_MINT.toBase58())
  console.log('fee recipient  :', RITUALS_DEVNET_FEE_RECIPIENT.toBase58())

  const existing = await connection.getAccountInfo(configPda)
  if (existing !== null) {
    console.log('\nProtocolConfig already exists; nothing to do.')
    console.log('owner:', existing.owner.toBase58(), '| bytes:', existing.data.length)
    return
  }

  const instruction = buildInitializeProtocolConfigInstruction({
    programId: RITUALS_PROGRAM_ID,
    authority: authority.publicKey,
    config: {
      allowedStakeMint: RITUALS_DEVNET_STAKE_MINT,
      feeRecipient: RITUALS_DEVNET_FEE_RECIPIENT,
      feeBasisPoints: RITUAL_FEE_CONFIG.basisPoints,
      minimumFee: RITUAL_FEE_CONFIG.minimumFee,
      maximumFee: RITUAL_FEE_CONFIG.maximumFee,
      maximumMemberStake: MAXIMUM_MEMBER_STAKE,
    },
  })

  console.log('\nsubmitting initialize_protocol_config...')
  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [authority],
    { commitment: 'confirmed' },
  )
  console.log('signature:', signature)

  // Authoritative readback: prove the account exists and is owned by the program.
  const created = await connection.getAccountInfo(configPda, 'confirmed')
  if (created === null) throw new Error('ProtocolConfig missing after confirmation')
  if (!created.owner.equals(RITUALS_PROGRAM_ID)) {
    throw new Error(`ProtocolConfig owned by ${created.owner.toBase58()}, expected the Rituals program`)
  }
  console.log('verified: owned by program, bytes =', created.data.length)
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
