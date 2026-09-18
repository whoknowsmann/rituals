/**
 * Read the live devnet ProtocolConfig through the real typed reader.
 *
 * This is the first end-to-end proof that the client's strict decoders work
 * against genuine on-chain data rather than fixtures. If the decoder and the
 * Rust serialization disagree at all, this fails loudly.
 */

import { Connection } from '@solana/web3.js'
import { RitualsRpcReader } from '../src/data/rituals/ritualsRpc'
import { protocolConfigPda } from '../src/data/rituals/pdas'
import {
  RITUALS_PROGRAM_ID,
  RITUALS_DEVNET_STAKE_MINT,
  RITUALS_DEVNET_FEE_RECIPIENT,
} from '../src/data/rituals/programIds'

const URL = 'https://api.devnet.solana.com'

async function main(): Promise<void> {
  const connection = new Connection(URL, 'confirmed')
  const reader = new RitualsRpcReader(
    {
      getMultipleAccountsInfoAndContext:
        connection.getMultipleAccountsInfoAndContext.bind(connection),
    } as never,
    RITUALS_PROGRAM_ID,
  )

  const [configPda] = protocolConfigPda(RITUALS_PROGRAM_ID)
  console.log('reading ProtocolConfig at', configPda.toBase58())

  const read = await reader.getProtocolConfig()
  const config = read.account

  console.log('\n--- decoded through the real typed reader ---')
  console.log('slot                :', read.slot)
  console.log('schemaVersion       :', config.schemaVersion)
  console.log('authority           :', config.authority.toBase58())
  console.log('allowedStakeMint    :', config.allowedStakeMint.toBase58())
  console.log('feeRecipient        :', config.feeRecipient.toBase58())
  console.log('feeBasisPoints      :', config.feeBasisPoints)
  console.log('minimumFee          :', config.minimumFee.toString())
  console.log('maximumFee          :', config.maximumFee.toString())
  console.log('maximumMemberStake  :', config.maximumMemberStake.toString())
  console.log('maxMembers          :', config.maxMembers)
  console.log('maxEvents           :', config.maxEvents)
  console.log('paused              :', config.paused)

  const checks: Array<[string, boolean]> = [
    ['stake mint matches the configured TEST mint', config.allowedStakeMint.equals(RITUALS_DEVNET_STAKE_MINT)],
    ['fee recipient matches the configured token account', config.feeRecipient.equals(RITUALS_DEVNET_FEE_RECIPIENT)],
    ['protocol is not paused', config.paused === false],
    ['member bounds are 2..6', config.maxMembers === 6],
    ['event bound is 16', config.maxEvents === 16],
  ]

  console.log('\n--- assertions ---')
  let failed = 0
  for (const [label, ok] of checks) {
    console.log(ok ? 'PASS' : 'FAIL', '-', label)
    if (!ok) failed += 1
  }
  if (failed > 0) throw new Error(`${failed} assertion(s) failed`)
  console.log('\nAll assertions passed: live chain state matches the client contract.')
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
