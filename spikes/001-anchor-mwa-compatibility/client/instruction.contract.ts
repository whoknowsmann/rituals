import { Keypair, SystemProgram } from '@solana/web3.js';
import {
  PROGRAM_ID,
  SET_VALUE_DISCRIMINATOR,
  buildSetValueInstruction,
  encodeSetValue,
} from './instruction';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const authority = Keypair.generate().publicKey;
const state = Keypair.generate().publicKey;
const value = 0x0102_0304_0506_0708n;
const ix = buildSetValueInstruction({ state, authority }, value);

assert(ix.programId.equals(PROGRAM_ID), 'program id mismatch');
assert(ix.keys.length === 3, 'Anchor account list must contain three keys');
assert(ix.keys[0].pubkey.equals(state), 'state key order mismatch');
assert(ix.keys[0].isWritable && ix.keys[0].isSigner, 'state constraints mismatch');
assert(ix.keys[1].pubkey.equals(authority), 'authority key order mismatch');
assert(ix.keys[1].isWritable && ix.keys[1].isSigner, 'signer constraint mismatch');
assert(ix.keys[2].pubkey.equals(SystemProgram.programId), 'system program mismatch');
assert(!ix.keys[2].isWritable && !ix.keys[2].isSigner, 'system constraints mismatch');
assert(ix.data.length === 16, 'u64 instruction data length mismatch');
assert(ix.data.subarray(0, 8).equals(Buffer.from(SET_VALUE_DISCRIMINATOR)), 'discriminator mismatch');
assert(ix.data.readBigUInt64LE(8) === value, 'u64 encoding mismatch');

assert(Buffer.from(encodeSetValue(0xffff_ffff_ffff_ffffn)).readBigUInt64LE(8) === 0xffff_ffff_ffff_ffffn, 'max u64 encoding mismatch');

let rejected = false;
try {
  encodeSetValue(-1n);
} catch {
  rejected = true;
}
assert(rejected, 'negative u64 should be rejected');

rejected = false;
try {
  encodeSetValue(0x1_0000_0000_0000_0000n);
} catch {
  rejected = true;
}
assert(rejected, 'u64 overflow should be rejected');

console.log('client instruction test passed: keys, signer/writable flags, discriminator, and u64 data verified');
