/** Create the demo cause token account and print its address as JSON. */
import { getAccount } from '@solana/spl-token'
import { Keypair, PublicKey } from '@solana/web3.js'
import { flag, connectionFor, option, parseCli, printJsonSummary, readKeypair, requiredOption } from './lib/cli'
import { createLocalMintAndProtocol, createTokenAccount, readProtocolConfig, refuseMainnetFundedPayer } from './lib/chain'
import { RITUALS_DEVNET_STAKE_MINT } from '../src/data/rituals/programIds'

async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2))
  const { url, connection } = connectionFor(args)
  const ownerPath = option(args, 'owner-keypair') ?? option(args, 'keypair') ?? requiredOption(args, 'owner-keypair')
  const owner = readKeypair(ownerPath)
  await refuseMainnetFundedPayer(url, owner)

  let mint: PublicKey
  let localMint = false
  let feeRecipient: PublicKey | undefined
  if (flag(args, 'create-local-mint')) {
    const local = await createLocalMintAndProtocol(connection, url, owner)
    mint = local.mint
    feeRecipient = local.feeRecipient
    localMint = true
  } else {
    const config = await readProtocolConfig(connection)
    mint = config.account.allowedStakeMint
    const requestedMint = option(args, 'mint')
    if (requestedMint !== undefined) {
      const supplied = new PublicKey(requestedMint)
      if (!supplied.equals(mint)) throw new Error(`--mint does not match ProtocolConfig.allowedStakeMint (${mint.toBase58()})`)
    }
    feeRecipient = config.account.feeRecipient
    if (!mint.equals(RITUALS_DEVNET_STAKE_MINT) && /devnet/i.test(new URL(url).hostname)) throw new Error('devnet ProtocolConfig does not use the TEST stake mint')
  }

  const created = await createTokenAccount(connection, owner, mint, owner.publicKey)
  const account = await getAccount(connection, created.address, 'confirmed')
  if (!account.mint.equals(mint) || !account.owner.equals(owner.publicKey) || account.amount !== 0n) throw new Error('cause token account readback mismatch')

  printJsonSummary({
    script: 'create-demo-cause',
    url,
    owner: owner.publicKey,
    stakeMint: mint,
    causeTokenAccount: created.address,
    label: 'Northside Food Bank (demo)',
    feeRecipient,
    localMint,
    note: 'Paste causeTokenAccount into demoConfig.ts as the demo beneficiary address.',
  })
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
