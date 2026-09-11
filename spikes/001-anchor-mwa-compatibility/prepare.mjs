import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.env.SPIKE_PREPARE_ROOT ?? dirname(fileURLToPath(import.meta.url)));
const verifyRoot = resolve(root, '.verify');
const verifyDir = resolve(verifyRoot, 'identity');
const keypair = resolve(verifyDir, 'anchor_mwa_spike-keypair.json');
const programIdOutput = resolve(verifyRoot, 'program-id.txt');
const files = [
  resolve(root, 'program', 'Anchor.toml'),
  resolve(root, 'program', 'programs', 'anchor-mwa-spike', 'src', 'lib.rs'),
  resolve(root, 'client', 'instruction.ts'),
];
const idPattern = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

if (process.env.SPIKE_PREPARE_FAIL_AFTER_WRITES !== undefined &&
    process.env.SPIKE_PREPARE_TEST !== '1') {
  throw new Error('SPIKE_PREPARE_FAIL_AFTER_WRITES is test-only and requires SPIKE_PREPARE_TEST=1');
}

// Read and validate every tracked input before creating identity material.
const originals = files.map((file) => {
  const source = readFileSync(file, 'utf8');
  const ids = source.match(idPattern) ?? [];
  if (ids.length !== 1) throw new Error(`expected exactly one program id in ${file}`);
  return { file, source, id: ids[0] };
});
const originalIds = new Set(originals.map(({ id }) => id));
if (originalIds.size !== 1) throw new Error('tracked program IDs do not agree');

const tempFiles = [];
const written = [];
let generated = false;

function removeIfPresent(path) {
  try {
    unlinkSync(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function atomicWrite(path, contents) {
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  tempFiles.push(temp);
  writeFileSync(temp, contents, { encoding: 'utf8', mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, path);
  tempFiles.splice(tempFiles.indexOf(temp), 1);
}

function rollback() {
  for (const temp of tempFiles) rmSync(temp, { force: true });
  for (const { file, source } of originals) {
    if (written.includes(file)) {
      try {
        atomicWrite(file, source);
      } catch { /* preserve the original error; rollback is best effort */ }
    }
  }
  removeIfPresent(keypair);
  removeIfPresent(programIdOutput);
}

try {
  mkdirSync(verifyDir, { recursive: true, mode: 0o700 });
  chmodSync(verifyRoot, 0o700);
  chmodSync(verifyDir, 0o700);
  removeIfPresent(keypair);
  execFileSync('solana-keygen', [
    'new', '--no-bip39-passphrase', '--silent', '--outfile', keypair,
  ], { stdio: 'ignore' });
  generated = true;
  chmodSync(keypair, 0o600);
  const programId = execFileSync('solana-keygen', ['pubkey', keypair], {
    encoding: 'utf8',
  }).trim();
  if (!idPattern.test(programId) || programId.length < 32 || programId.length > 44) {
    throw new Error('solana-keygen returned an invalid program ID');
  }
  idPattern.lastIndex = 0;

  for (const { file, source, id } of originals) {
    atomicWrite(file, source.replace(id, programId));
    written.push(file);
    if (process.env.SPIKE_PREPARE_TEST === '1' &&
        process.env.SPIKE_PREPARE_FAIL_AFTER_WRITES === String(written.length)) {
      throw new Error(`test hook: injected failure after ${written.length} write(s)`);
    }
  }
  atomicWrite(programIdOutput, `${programId}\n`);
  console.log(programId);
} catch (error) {
  rollback();
  if (generated) removeIfPresent(keypair);
  throw error;
}
