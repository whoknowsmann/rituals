import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('.', import.meta.url).pathname);
const verifyDir = resolve(root, '.verify', 'identity');
const keypair = resolve(verifyDir, 'anchor_mwa_spike-keypair.json');
mkdirSync(verifyDir, { recursive: true });
try {
  unlinkSync(keypair);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

execFileSync('solana-keygen', [
  'new', '--no-bip39-passphrase', '--silent', '--outfile', keypair,
], { stdio: 'ignore' });
const programId = execFileSync('solana-keygen', ['pubkey', keypair], {
  encoding: 'utf8',
}).trim();

const files = [
  resolve(root, 'program', 'Anchor.toml'),
  resolve(root, 'program', 'programs', 'anchor-mwa-spike', 'src', 'lib.rs'),
  resolve(root, 'client', 'instruction.ts'),
];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const ids = source.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) ?? [];
  if (ids.length !== 1) throw new Error(`expected one program id in ${file}`);
  writeFileSync(file, source.replace(ids[0], programId));
}
writeFileSync(resolve(root, '.verify', 'program-id.txt'), `${programId}\n`);
console.log(programId);
