/**
 * Paced, resumable writer for an existing upgradeable-loader buffer.
 *
 * Why: `solana program deploy` sends ~700 buffer writes in a burst. From this
 * machine the TPU path drops most of them ("Max retries exceeded"; 2026-09-27:
 * 3 × 33 min wrote ~7%), and the public devnet RPC answers the RPC-path burst
 * with 429s. This sends only chunks that differ from the target .so, a few per
 * second through the RPC, and re-reads the buffer each round until it matches
 * byte for byte. Writes are idempotent, so resending a chunk is harmless.
 *
 * It NEVER deploys or upgrades. Afterwards run scripts/deploy-devnet.sh with
 * DEPLOY_BUFFER=<same keypair> DEPLOY_USE_RPC=1; the CLI skips chunks that
 * already match, so only the extend/upgrade transactions remain.
 *
 *   npx tsx scripts/write-program-buffer.ts --url https://api.devnet.solana.com \
 *     --authority-keypair ../preflight/.keys/rituals-devnet-deployer.json \
 *     --buffer-keypair .keys/rituals-deploy-buffer.json \
 *     --program-so target/deploy/rituals.so
 */
import { readFileSync } from 'node:fs'
import { ComputeBudgetProgram, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import { connectionFor, option, parseCli, printJsonSummary, readKeypair, requiredOption } from './lib/cli'
import { refuseMainnetFundedPayer } from './lib/chain'

const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
const HEADER = 37 // UpgradeableLoaderState::Buffer = u32 tag + Option<Pubkey authority>
const CHUNK = 900 // keeps the signed transaction under 1,232 bytes with a priority-fee ix
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function writeInstruction(buffer: PublicKey, authority: PublicKey, offset: number, bytes: Uint8Array): TransactionInstruction {
  const data = Buffer.alloc(16 + bytes.length)
  data.writeUInt32LE(1, 0) // UpgradeableLoaderInstruction::Write
  data.writeUInt32LE(offset, 4)
  data.writeBigUInt64LE(BigInt(bytes.length), 8)
  Buffer.from(bytes).copy(data, 16)
  return new TransactionInstruction({
    programId: LOADER,
    keys: [
      { pubkey: buffer, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data,
  })
}

async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2))
  const { url, connection } = connectionFor(args)
  const host = new URL(url).hostname
  if (!/devnet|localhost|127\.0\.0\.1/i.test(host)) throw new Error(`refusing non-devnet/local url ${url}`)
  const authority = readKeypair(requiredOption(args, 'authority-keypair'))
  await refuseMainnetFundedPayer(url, authority)
  const buffer = readKeypair(requiredOption(args, 'buffer-keypair')).publicKey
  const so = readFileSync(requiredOption(args, 'program-so'))
  const perSecond = Number(option(args, 'per-second', '3'))
  const maxRounds = Number(option(args, 'rounds', '15'))
  const cuPrice = Number(option(args, 'cu-price', '10000'))
  if (!(perSecond > 0 && perSecond <= 10) || !(maxRounds > 0) || !(cuPrice >= 0)) throw new Error('invalid --per-second/--rounds/--cu-price')

  const readProgramBytes = async (): Promise<Buffer> => {
    const info = await connection.getAccountInfo(buffer, 'confirmed')
    if (info === null) throw new Error(`buffer ${buffer.toBase58()} does not exist; create it with a (failed) deploy or write-buffer first`)
    if (!info.owner.equals(LOADER)) throw new Error('buffer is not owned by the upgradeable loader')
    const data = Buffer.from(info.data)
    if (data.readUInt32LE(0) !== 1 || data[4] !== 1) throw new Error('account is not an authority-bearing loader buffer')
    if (!new PublicKey(data.subarray(5, HEADER)).equals(authority.publicKey)) throw new Error('buffer authority is not the supplied authority')
    if (data.length !== HEADER + so.length) throw new Error(`buffer holds ${data.length - HEADER} bytes; the .so is ${so.length}`)
    return data.subarray(HEADER)
  }

  const offsets: number[] = []
  for (let offset = 0; offset < so.length; offset += CHUNK) offsets.push(offset)
  let sent = 0

  for (let round = 1; round <= maxRounds; round += 1) {
    const current = await readProgramBytes()
    const pending = offsets.filter((offset) => !current.subarray(offset, offset + CHUNK).equals(so.subarray(offset, offset + CHUNK)))
    console.log(`round ${round}: ${offsets.length - pending.length}/${offsets.length} chunks match; ${pending.length} to write`)
    if (pending.length === 0) {
      printJsonSummary({ script: 'write-program-buffer', url, buffer, bytes: so.length, chunks: offsets.length, rounds: round, transactionsSent: sent, matchesProgram: true })
      return
    }
    let latest = await connection.getLatestBlockhash('confirmed')
    for (let index = 0; index < pending.length; index += 1) {
      if (index > 0 && index % 90 === 0) latest = await connection.getLatestBlockhash('confirmed')
      const offset = pending[index]
      const tx = new Transaction({ feePayer: authority.publicKey, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight })
      if (cuPrice > 0) tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }))
      tx.add(writeInstruction(buffer, authority.publicKey, offset, so.subarray(offset, offset + CHUNK)))
      tx.sign(authority)
      try {
        await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 })
        sent += 1
      } catch (error) {
        console.log(`  send failed at offset ${offset}: ${error instanceof Error ? error.message.slice(0, 120) : String(error)}; backing off`)
        await sleep(5_000)
      }
      await sleep(1_000 / perSecond)
    }
    await sleep(25_000) // let the round land before re-reading
  }
  const final = await readProgramBytes()
  throw new Error(`buffer still differs after ${maxRounds} rounds (${offsets.filter((o) => !final.subarray(o, o + CHUNK).equals(so.subarray(o, o + CHUNK))).length} chunks)`)
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
