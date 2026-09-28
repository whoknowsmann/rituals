// Print the deterministic Season PDA for a slug (read-only; no network).
import { createHash } from 'node:crypto'
import { seasonPda } from '../src/data/rituals/pdas'
import { RITUALS_PROGRAM_ID } from '../src/data/rituals/programIds'

for (const slug of process.argv.slice(2)) {
  const [address] = seasonPda(new Uint8Array(createHash('sha256').update(slug, 'utf8').digest()), RITUALS_PROGRAM_ID)
  console.log(slug, address.toBase58())
}
