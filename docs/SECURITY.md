# Security and Limitations

Last reconciled with docs/STATUS.md: 2026-09-30.

## Honest status

Rituals home, detail, claim/confirmation, and receipt screens read authoritative chain state (known rituals are persisted locally; any fixtures are labeled demo-only), with explicit devnet and no-real-value labeling. Create, Fund, Activate, Claim, Approve, Question, Finalize, and DeclareSkip are wired to real transactions; the solo path bundles create + fund + activate into one wallet approval. The program is deployed to devnet (`2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p`, solo + Seasons build, slot 504946601) and approved through terminal zero-balance vault closure. The typed client implements preparation, MWA submission, confirmation, and authoritative action readback.

Deployment configuration is `deployed`; `assertSupportedRitualsProgram` still fails closed on any cluster other than devnet or any program other than the authorized deployment.

Proven on devnet with CLI keypairs: the complete lifecycle including conservation-safe settlement, and a solo smoke (2026-09-28) in which a kept week returned the stake exactly and a missed week sent exactly one week's allocation to the demo cause, with nothing to the creator.

Proven on a physical Solana Seeker through Mobile Wallet Adapter (2026-09-25/26): the group-flow Create + stake approval and the last member's Fund + activate approval. **Not yet proven: the solo flow with wallet signatures** (join a Season, hold to stamp, settle, receipt). That is the pending phone test. [PENDING PHONE TEST: solo signatures / screenshots] Also not yet proven: a full two-wallet group lifecycle and release APK acceptance. Devnet with valueless TEST assets is not a claim that mainnet funds would be safe.

Device rule: the maintainer's Seeker is a personal device. Its Seed Vault and existing personal wallets are off-limits — no authorization, no balance reads, no prompts that could reach them. Wallet accounts are chosen by the device owner in the wallet's own prompt, never preselected by tooling, and demo wallets must be fresh accounts. Phantom storage is app-private and unreadable by adb on an unrooted user build; that is expected and must not be worked around.

Nothing here claims that mainnet funds or stablecoins are safe. P0 is devnet with valueless test assets.

## Known limits

- **Upgradeable devnet program.** The devnet program is upgradeable and its upgrade authority is a single deploy key. Whoever holds that key can replace the program. Mainnet requires freezing the program (removing upgrade authority) or moving it behind a multisig with a timelock.
- **Voided-week display bug.** A week voided without a verdict (the witness questioned it, or never answered) renders wrongly in the app: the receipt can show KEPT, the ritual screen can offer Settle on an already-voided event, and a declared skip can show as a check in the week strip. The bug is display-only; on-chain settlement voids and refunds the week. The witness also has no "I didn't see it" action in the UI yet. See "Known gaps" in `docs/STATUS.md`.
- **Honor is honor.** The default "Just me" check-in is self-attested. The program records the claim; it cannot know whether the activity happened. Note proof is client-side only.
- **Season counters on devnet.** `participant_count` and `checked_in_count` are proven on a local test validator only. Their first devnet proof is part of the phone test. [PENDING PHONE TEST]
- **Demo cause.** "Northside Food Bank (demo)" is a devnet token account standing in for a cause. It is not a real charity and no real value moves.

## Trust boundaries

Treat invitation metadata, ritual text, RPC responses, program/IDL/mint metadata, cached account state, wallet labels, signatures before confirmed readback, token metadata, URLs, and future user content as untrusted. Validate account ownership, program ID, cluster, mint, decimals, balances, lifecycle, and canonical invite digest rather than inferring them from display metadata.

A wallet signature proves who attested, not that the underlying real-world activity occurred. A solo ritual with no witness is self-attested, and a single witness can collude with the creator. A Season's live count reflects confirmed check-ins by wallets, not distinct people, since wallets are free to create. Private groups are a social oracle and can collude, deadlock, grief, or use multiple wallets.

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

The program boundary is separate from the mobile UI. Approved native coverage (197 native program tests per `docs/STATUS.md`) includes protocol initialization, creation, funding, activation, cancellation, event/claim PDAs, attestations, questioning, settlement, terminal cleanup, solo creation, declared skips, and Season counters. Pending/questioned or zero-confirmed events refund the whole current event pool; terminal confirmed/unclaimed events redistribute only unclaimed allocations to confirmed members. Destination accounts are immutable-member ordered, CPIs are atomic, future principal remains tracked, dust is excluded, and the protocol receives no forfeiture share.

Solo rules enforced by the program: `create_solo_ritual` locks a `forfeit_destination` token account at creation. It must be in the stake mint and its owner may not be the creator or the optional witness, so neither can route a missed week back to themselves. A missed solo week sends exactly one week's allocation to that destination; a kept week returns it to the creator; the protocol receives nothing. The witness cannot be the creator. `declare_skip` is creator-only, once per ritual, for the current week, and only before that week opens; the week is voided and refunded. Season counters use checked addition. `checked_in_count` increases only in the instruction that makes a claim Confirmed, and `participant_count` only at activation, so the public count cannot rise without an on-chain confirmation.

`funded_fee_total` records how much activation fee was historically funded and paid. It intentionally remains equal to the locked activation fee after successful activation so later state validation can detect corruption; it is not a claim on remaining vault tokens. Live fee custody is the actual fee-vault balance.

Terminal closure never sweeps or burns token dust. It requires coherent Completed or Cancelled state and exact zero balances in both canonical classic-SPL vaults, closes both atomically under the Ritual PDA, and returns token-account rent only to the immutable creator. Ritual and event receipt accounts are preserved for readback.

All future escrow and settlement logic must use checked token atomic-unit arithmetic, deterministic remainder handling, conservation tests, program-controlled authority, and read-after-write verification. The app must not claim that real value is protected until those paths are independently exercised.

## Privacy

The current slice does not need contacts, precise location, photos, clips, voice, chat, hosted prompts, or private evidence. A future onchain flow will expose wallet addresses, rule digests, event status, and money movement permanently. Bounded human-readable invite metadata must remain local/offchain and untrusted until its digest matches onchain state.

## Build and identity boundary

Visible app and wallet identity are Rituals. The existing Expo slug, Android package, iOS bundle identifier, and EAS project ID remain legacy build identifiers solely to preserve current linkage. The wallet URI remains a private repository URL until a public HTTPS origin exists. Metro export is only a JavaScript bundle check; Expo Go is not native MWA proof.

## Release gates

Before valuable assets or mainnet: freeze the program or move upgrade authority behind a multisig with a timelock, complete the solo phone test, a real two-wallet group devnet proof, release APK proof on a Seeker, independent Solana program review, threat-model review, legal and publisher-policy review, privacy/UGC controls, operational monitoring, and a clean secret scan. Never commit credentials, wallet material, keystores, `.env` files, or valuable test assets.
