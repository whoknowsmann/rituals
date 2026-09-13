# Security and Limitations

## Honest status

Rituals currently ships approved fixture-backed home and create/review slices with explicit devnet, preview-only, and no-real-value labeling. The program is approved through activation, cancellation, signed completion claims, exact friend thresholds, and safe questioning. Fixture actions do not submit real transactions. Complete settlement, real devnet deployment, and native MWA signing are not release-proven.

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

## Program and money limits

The program boundary is separate from this fixture UI. Approved native coverage includes protocol initialization, ritual creation, exact HOST/SPLIT funding, activation, pre-activation cancellation, event/claim PDAs, threshold approvals, and questioning. Attestations are signer-derived, event/version bound, replay resistant, and have no token accounts; a questioned claim routes the event toward the future safe-void path. Full settlement, deployment, and independent review remain gates. Local program IDs, generated artifacts, and fixtures are not production identities.

All future escrow and settlement logic must use checked token atomic-unit arithmetic, deterministic remainder handling, conservation tests, program-controlled authority, and read-after-write verification. The app must not claim that real value is protected until those paths are independently exercised.

## Privacy

The current slice does not need contacts, precise location, photos, clips, voice, chat, hosted prompts, or private evidence. A future onchain flow will expose wallet addresses, rule digests, event status, and money movement permanently. Bounded human-readable invite metadata must remain local/offchain and untrusted until its digest matches onchain state.

## Build and identity boundary

Visible app and wallet identity are Rituals. The existing Expo slug, Android package, iOS bundle identifier, and EAS project ID remain legacy build identifiers solely to preserve current linkage. The wallet URI remains a private repository URL until a public HTTPS origin exists. Metro export is only a JavaScript bundle check; Expo Go is not native MWA proof.

## Release gates

Before valuable assets or mainnet: complete claim/confirmation/settlement behavior, real two-wallet devnet proof, standalone Seeker APK proof, independent Solana program review, threat-model review, legal and publisher-policy review, privacy/UGC controls, operational monitoring, and a clean secret scan. Never commit credentials, wallet material, keystores, `.env` files, or valuable test assets.
