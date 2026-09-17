import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const spike = fileURLToPath(new URL('.', import.meta.url));
const prepare = join(spike, 'prepare.mjs');
const tracked = [
  'program/Anchor.toml',
  'program/programs/anchor-mwa-spike/src/lib.rs',
  'client/instruction.ts',
];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'anchor-mwa-prepare-'));
  for (const relative of tracked) {
    const destination = join(root, relative);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(spike, relative), destination);
  }
  return root;
}

function run(root, extra = {}) {
  return execFileSync(process.execPath, [prepare], {
    cwd: root,
    env: { ...process.env, SPIKE_PREPARE_ROOT: root, ...extra },
    encoding: 'utf8',
  }).trim();
}

function snapshot(root) {
  return tracked.map((relative) => readFileSync(join(root, relative), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const successRoot = fixture();
try {
  const id = run(successRoot);
  const contents = snapshot(successRoot);
  assert(contents.every((source) => (source.match(new RegExp(id, 'g')) ?? []).length === 1), 'success did not synchronize IDs');
  const keypair = join(successRoot, '.verify/identity/anchor_mwa_spike-keypair.json');
  const programId = join(successRoot, '.verify/program-id.txt');
  assert(readFileSync(programId, 'utf8').trim() === id, 'program-id.txt mismatch');
  assert((statSync(keypair).mode & 0o777) === 0o600, 'keypair is not owner-only');
  assert((statSync(join(successRoot, '.verify/identity')).mode & 0o777) === 0o700, 'verify directory is not owner-only');
} finally {
  rmSync(successRoot, { recursive: true, force: true });
}

const malformedRoot = fixture();
try {
  const file = join(malformedRoot, 'client/instruction.ts');
  writeFileSync(file, readFileSync(file, 'utf8').replace(/8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB/g, '11111111111111111111111111111111 22222222222222222222222222222222'));
  const before = snapshot(malformedRoot);
  let failed = false;
  try { run(malformedRoot); } catch { failed = true; }
  assert(failed, 'malformed input unexpectedly succeeded');
  assert(JSON.stringify(snapshot(malformedRoot)) === JSON.stringify(before), 'malformed input mutated tracked files');
  assert(!existsSync(join(malformedRoot, '.verify')), 'malformed input generated identity material');
} finally {
  rmSync(malformedRoot, { recursive: true, force: true });
}

const rollbackRoot = fixture();
try {
  const before = snapshot(rollbackRoot);
  let failed = false;
  try {
    run(rollbackRoot, { SPIKE_PREPARE_TEST: '1', SPIKE_PREPARE_FAIL_AFTER_WRITES: '1' });
  } catch { failed = true; }
  assert(failed, 'injected write failure unexpectedly succeeded');
  assert(JSON.stringify(snapshot(rollbackRoot)) === JSON.stringify(before), 'rollback left mixed or changed IDs');
  assert(!existsSync(join(rollbackRoot, '.verify/identity/anchor_mwa_spike-keypair.json')), 'rollback left keypair');
  assert(!existsSync(join(rollbackRoot, '.verify/program-id.txt')), 'rollback left program ID output');
} finally {
  rmSync(rollbackRoot, { recursive: true, force: true });
}

console.log('prepare safety tests passed: success permissions, simulation validation, and atomic rollback verified');
