import { PublicKey } from '@solana/web3.js'

/**
 * Frozen cross-language vector identity.
 *
 * The golden instruction manifests and PDA vectors prove that this TypeScript
 * client and the Rust program encode identical instructions and derive identical
 * addresses. That equivalence holds for ANY fixed program id, so the vectors pin
 * their own constant rather than tracking the deployment identity.
 *
 * Keeping them decoupled means redeploying the program under a new address does
 * not invalidate hundreds of reviewed vectors. The Rust side pins the same value
 * as `VECTOR_PROGRAM_ID` in program-tests/tests/. Do NOT change this value.
 */
export const VECTOR_PROGRAM_ID_BASE58 = '8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB' as const
export const VECTOR_PROGRAM_ID = new PublicKey(VECTOR_PROGRAM_ID_BASE58)
