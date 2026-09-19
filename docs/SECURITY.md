# Security and Limitations

## Honest status

Rituals ships fixture-backed home, claim/confirmation, and receipt previews with explicit devnet and no-real-value labeling, plus a live create/review → roster → funding-lobby path that submits a **real** Create transaction. The program is deployed to devnet and approved through terminal zero-balance vault closure. The typed client implements preparation, MWA submission, confirmation, and authoritative action readback.

Deployment configuration is `deployed`; `assertSupportedRitualsProgram` still fails closed on any cluster other than devnet or any program other than the authorized deployment.

Proven on devnet with CLI keypairs: the complete lifecycle including conservation-safe settlement. **Not yet proven: native Mobile Wallet Adapter signing from a device**, a wallet-signed two-wallet lifecycle, and standalone release APK acceptance. Devnet with valueless TEST assets is not a claim that mainnet funds would be safe.

Device rule: Jack's Seeker is a personal device. Its Seed Vault and existing personal wallets are off-limits — no authorization, no balance reads, no prompts that could reach them. Wallet accounts are chosen by Jack in the wallet's own prompt, never preselected by tooling, and demo wallets must be fresh accounts. Phantom storage is app-private and unreadable by adb on an unrooted user build; that is expected and must not be worked around.

Nothing here claims that mainnet funds or stablecoins are safe. P0 is devnet with valueless test assets.

## Trust boundaries

Treat invitation metadata, ritual text, RPC responses, program/IDL/mint metadata, cached account state, wallet labels, signatures before confirmed readback, token metadata, URLs, and future user content as untrusted. Validate account ownership, program ID, cluster, mint, decimals, balances, lifecycle, and canonical invite digest rather than inferring them from display metadata.

A wallet signature proves who attested, not that the underlying real-world activity occurred. Private groups are a social oracle and can collude, deadlock, grief, or use multiple wallets.

## Wallet and transaction safety

- Never request, read, transmit, or store seed phrases or private keys.
- Use Mobile Wallet Adapter for ordinary wallet authorization and signing.
- Use throwaway devnet identities and valueless assets only during development.
- Display exact outflow, fee, cluster, mint, and threshold effect before signing.
- Prevent duplicate actions while a write is pending.
- Confirm transactions and read back exact target state before reporting success.
- Reject wrong cluster, program ID, account owner, mint, schema, or invite digest.
- Rebuild and redisplay any action if its blockhash, instruction, accounts, or bytes change.
- Treat submitted-action handles as process-local capabilities: accept them only in the issuing client, share duplicate confirmation work, and never restore confirmation authority by deserializing a handle after reload.

## Program and money limits

The program boundary is separate from this fixture UI. Approved native coverage includes protocol initialization, creation, funding, activation, cancellation, event/claim PDAs, attestations, questioning, settlement, and terminal cleanup. Pending/questioned or zero-confirmed events refund the whole current event pool; terminal confirmed/unclaimed events redistribute only unclaimed allocations to confirmed members. Destination accounts are immutable-member ordered, CPIs are atomic, future principal remains tracked, dust is excluded, and the protocol receives no forfeiture share.

`funded_fee_total` records how much activation fee was historically funded and paid. It intentionally remains equal to the locked activation fee after successful activation so later state validation can detect corruption; it is not a claim on remaining vault tokens. Live fee custody is the actual fee-vault balance.

Terminal closure never sweeps or burns token dust. It requires coherent Completed or Cancelled state and exact zero balances in both canonical classic-SPL vaults, closes both atomically under the Ritual PDA, and returns token-account rent only to the immutable creator. Ritual and event receipt accounts are preserved for readback.

All future escrow and settlement logic must use checked token atomic-unit arithmetic, deterministic remainder handling, conservation tests, program-controlled authority, and read-after-write verification. The app must not claim that real value is protected until those paths are independently exercised.

## Privacy

The current slice does not need contacts, precise location, photos, clips, voice, chat, hosted prompts, or private evidence. A future onchain flow will expose wallet addresses, rule digests, event status, and money movement permanently. Bounded human-readable invite metadata must remain local/offchain and untrusted until its digest matches onchain state.

## Build and identity boundary

Visible app and wallet identity are Rituals. The existing Expo slug, Android package, iOS bundle identifier, and EAS project ID remain legacy build identifiers solely to preserve current linkage. The wallet URI remains a private repository URL until a public HTTPS origin exists. Metro export is only a JavaScript bundle check; Expo Go is not native MWA proof.

## Release gates

Before valuable assets or mainnet: complete claim/confirmation/settlement behavior, real two-wallet devnet proof, standalone Seeker APK proof, independent Solana program review, threat-model review, legal and publisher-policy review, privacy/UGC controls, operational monitoring, and a clean secret scan. Never commit credentials, wallet material, keystores, `.env` files, or valuable test assets.
