import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
// @ts-expect-error Node runs this spike directly with --experimental-strip-types.
import { buildSetValueInstruction, PROGRAM_ID } from './instruction.ts';

async function main(): Promise<void> {
  const url = process.env.SPIKE_RPC_URL ?? 'http://127.0.0.1:8899';
  const connection = new Connection(url, 'confirmed');
  const authority = Keypair.generate();
  const state = Keypair.generate();
  const value = 42n;

  const airdrop = await connection.requestAirdrop(
    authority.publicKey,
    2 * LAMPORTS_PER_SOL,
  );
  await connection.confirmTransaction(airdrop, 'confirmed');
  const ix = buildSetValueInstruction(
    { state: state.publicKey, authority: authority.publicKey },
    value,
  );
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [authority, state], {
    commitment: 'confirmed',
  });
  const account = await connection.getAccountInfo(state.publicKey, 'confirmed');
  if (!account) throw new Error('state account was not created');
  if (!account.owner.equals(PROGRAM_ID)) throw new Error('state owner constraint failed');
  if (account.data.length < 48) throw new Error('state account data is too short');
  const storedAuthority = new PublicKey(account.data.subarray(8, 40));
  const storedValue = account.data.readBigUInt64LE(40);
  if (!storedAuthority.equals(authority.publicKey)) throw new Error('authority account value mismatch');
  if (storedValue !== value) throw new Error('program did not store u64 value');
  console.log(`program test passed: signer/init constraints and account readback verified (${signature})`);
}

void main();
