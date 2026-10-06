import { describe, expect, it, vi } from 'vitest'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Keypair, PublicKey, type Connection } from '@solana/web3.js'
import { resolveSoloDestinationOwner } from './destinationOwner'
import { labelSoloDestination } from './soloRitualModel'
import { shortRosterAddress } from '../../create/roster'

const owner = Keypair.fromSeed(new Uint8Array(32).fill(21)).publicKey
const other = Keypair.fromSeed(new Uint8Array(32).fill(22)).publicKey
const mint = new PublicKey(new Uint8Array(32).fill(23))
const destination = getAssociatedTokenAddressSync(mint, owner)
const parsed = (info: unknown = { mint: mint.toBase58(), owner: owner.toBase58() }, program = TOKEN_PROGRAM_ID) => ({
  owner: program, data: { program: 'spl-token', parsed: { type: 'account', info } },
})
const reader = (value: unknown) => ({ getParsedAccountInfo: vi.fn(async () => ({ value })) }) as unknown as Pick<Connection, 'getParsedAccountInfo'>

describe('solo destination wallet owner (not token account)', () => {
  it('uses the persisted typed owner only when its ATA matches the locked destination', async () => {
    const connection = reader(null)
    expect(await resolveSoloDestinationOwner(connection, destination, mint, owner.toBase58())).toEqual(owner)
    expect(connection.getParsedAccountInfo).not.toHaveBeenCalled()
    expect(await resolveSoloDestinationOwner(connection, destination, mint, other.toBase58())).toBeNull()
    expect(connection.getParsedAccountInfo).toHaveBeenCalledWith(destination, 'confirmed')
  })
  it('reads the token owner for rituals created before owner persistence', async () => {
    const resolved = await resolveSoloDestinationOwner(reader(parsed()), destination, mint)
    expect(resolved).toEqual(owner)
    expect(labelSoloDestination(destination, null, resolved)).toBe(`the wallet you chose · ${shortRosterAddress(owner.toBase58())}`)
    expect(labelSoloDestination(destination, null, resolved)).not.toContain(shortRosterAddress(destination.toBase58()))
  })
  it.each([
    null, { owner: TOKEN_PROGRAM_ID, data: Buffer.alloc(0) },
    parsed({}, TOKEN_PROGRAM_ID), parsed({ mint: other.toBase58(), owner: owner.toBase58() }),
    parsed({ mint: mint.toBase58(), owner: 'not an address' }), parsed(undefined, other),
    parsed({ mint: mint.toBase58(), owner: ` ${owner.toBase58()} ` }),
  ])('omits an unknown or invalid owner instead of displaying the token account (%#)', async (value) => {
    expect(await resolveSoloDestinationOwner(reader(value), destination, mint)).toBeNull()
    expect(labelSoloDestination(destination, null)).toBe('the wallet you chose')
  })
  it('fails quietly offline', async () => {
    const connection = reader(null)
    vi.mocked(connection.getParsedAccountInfo).mockRejectedValue(new Error('offline'))
    expect(await resolveSoloDestinationOwner(connection, destination, mint)).toBeNull()
  })
})
