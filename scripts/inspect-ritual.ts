/**
 * Inspect a settled Ritual to confirm claim/confirmation state was recorded.
 *
 * Used to distinguish a genuine protocol defect from a bad assertion in the
 * lifecycle smoke test.
 */

import { Connection, PublicKey } from '@solana/web3.js'
import { RitualsRpcReader } from '../src/data/rituals/ritualsRpc'
import { RITUALS_PROGRAM_ID } from '../src/data/rituals/programIds'

async function main(): Promise<void> {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
  const reader = new RitualsRpcReader(
    { getMultipleAccountsInfoAndContext: connection.getMultipleAccountsInfoAndContext.bind(connection) } as never,
    RITUALS_PROGRAM_ID,
  )
  const ritualAddress = new PublicKey(process.argv[2])
  const bundle = await reader.getEventBundle(ritualAddress, 0)

  console.log('--- event ---')
  const event = bundle.event
  if (event === null) {
    console.log('event is null')
  } else {
    const a = event.account
    console.log('status                :', a.status)
    console.log('claimedMembersBitmap  :', a.claimedMembersBitmap, '(binary', a.claimedMembersBitmap.toString(2) + ')')
    console.log('confirmedMembersBitmap:', a.confirmedMembersBitmap, '(binary', a.confirmedMembersBitmap.toString(2) + ')')
    console.log('confirmedMemberCount  :', a.confirmedMemberCount)
    console.log('eventPool             :', a.eventPool.toString())
    console.log('payoutTotal           :', a.payoutTotal.toString())
    console.log('forfeitedTotal        :', a.forfeitedTotal.toString())
    console.log('refundedTotal         :', a.refundedTotal.toString())
    console.log('remainderUnits        :', a.remainderUnits.toString())
  }

  console.log('\n--- claims returned by the bundle ---')
  console.log('count:', bundle.claims.length)
  for (const claim of bundle.claims) {
    // account is nullable: the bundle reports a slot for every member, with a
    // null account where that member never claimed.
    const account = claim.account
    console.log(' ', claim.address.toBase58(),
      account === null ? '| (no claim account)' :
      `| status: ${account.status} | approvals: ${account.approvalCount}/${account.requiredAdditionalConfirmations}`)
  }
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
