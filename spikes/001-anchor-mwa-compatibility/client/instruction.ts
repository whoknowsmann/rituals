import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey(
  '8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB',
);

// Anchor's first 8 bytes of sha256("global:set_value").
export const SET_VALUE_DISCRIMINATOR = Uint8Array.from([
  0xfd, 0xd6, 0x30, 0xc9, 0x64, 0xc9, 0xe3, 0xdb,
]);

export type SetValueAccounts = {
  state: PublicKey;
  authority: PublicKey;
};

export function encodeSetValue(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new RangeError('set_value must fit in an unsigned u64');
  }
  const data = new Uint8Array(16);
  data.set(SET_VALUE_DISCRIMINATOR);
  new DataView(data.buffer).setBigUint64(8, value, true);
  return data;
}

export function buildSetValueInstruction(
  accounts: SetValueAccounts,
  value: bigint,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: accounts.state, isSigner: false, isWritable: true },
      { pubkey: accounts.authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(encodeSetValue(value)),
  });
}
