# Security and Limitations

## Honest status

The current source tree still runs the Preflight mobile UI. It now also contains implemented pure Rituals contracts plus a production Anchor ProtocolConfig initializer, classic SPL mint/account validation, exact HOST- and SPLIT-mode SPL member funding with bitmap/liability accounting, native ProgramTest tests, and an SBF build. Funding validates stored accounting before CPIs, enforces both stored and derived vault PDAs with mint/authority constraints, and commits state only after exact transfers; SPLIT distributes the locked fee by ordered member index. The fee escrow is not revenue until activation. Activation, cancellation, claims/approvals/settlement, and a real devnet/MWA flow remain unimplemented.

Rituals P0 is intentionally devnet and valueless-token only. Nothing in the target architecture is a claim that mainnet funds are presently safe.

## Security claim

The planned Rituals program is intended to verify wallets, signatures, immutable program state, escrow balances, thresholds, and deterministic settlement. The current implementation validates creation inputs, creates program-controlled vaults, and supports exact HOST and SPLIT funding; activation, cancellation, claims, approvals, and settlement are not implemented.

> A signature proves who attested, not that the underlying claim is true.

The private group is the social oracle. Rituals is not fraud-proof, Sybil-proof, collusion-proof, or a legal arbiter.

## Critical invariants for the target program

- Only active funded members can claim or attest.
- Claimant cannot approve their own claim.
- Duplicate approval cannot count twice.
- An approval cannot replay across ritual, event, claimant, or claim version.
- Member set, mint, stake, threshold, schedule, payout rule, and exact activation fee cannot change after activation.
- Active escrow is controlled by the program, not the host, backend, fee recipient, or admin.
- Settlement can move only the current event's allocations.
- Future-event allocations remain locked.
- Pending/questioned claims never silently become forfeitures.
- Event payouts conserve every token atomic unit.
- Atomic-unit remainder goes to confirmed members under deterministic member ordering.
- Rituals receives no forfeiture share.
- Activation fee is transferred/accounted separately from escrow.
- Repeated finalization fails.
- Account closure is allowed only after the expected zero/refundable balance state.

Until tests and independent review prove these invariants, the program is not ready for valuable assets.

## Compatibility evidence and limits

Compatibility evidence now includes the production ProtocolConfig initializer's native ProgramTest coverage, local SBF build, and generated IDL, in addition to the quarantined Anchor/MWA spike and existing Expo bundle. This is not evidence that the full Rituals program is validated: escrow, claims, approvals, settlement, real devnet deployment, and native MWA signing remain unvalidated.

Production mobile should use a thin typed `@solana/web3.js` client from a frozen IDL rather than importing `@coral-xyz/anchor`. Keep the spike's generated keypairs, build output, validator ledger, and client quarantined.

## Token-2022 boundary

The `anchor-spl/token_2022` feature is enabled in both workspace manifests solely for compilation/IDL generation: Anchor SPL `0.31.1`'s `idl_build.rs` unconditionally references its Token-2022 `token_interface` wrappers. Runtime imports remain classic `anchor_spl::token::{Mint, TokenAccount, Token}` and `create_ritual` requires the classic Tokenkeg program for `Program<Token>`. System-program-owned and Token-2022-owned mint/token accounts are rejected, and this implementation provides no Token-2022 runtime support.

## Trust boundaries

Treat as untrusted:

- invitation/deep-link metadata;
- ritual title and requirement text;
- RPC responses and endpoint configuration;
- program/IDL/mint metadata;
- stale cached account state;
- wallet labels;
- transaction signatures before confirmed readback;
- blockhash lifetime;
- token decimals/symbols/icons;
- URLs and explorer links;
- any future user evidence or AI text.

Onchain account ownership, program ID, cluster, mint, decimals, balances, and lifecycle must be validated rather than inferred from display metadata.

## Wallet and transaction safety

- Never request, read, transmit, or store seed phrases/private keys.
- Use MWA for ordinary user authorization and signing.
- Never use a valuable wallet in development or acceptance runs.
- Display exact token outflow, fee, cluster, mint, threshold effect, and expected account/network costs before signing.
- Prevent duplicate taps while an action is pending.
- Rebuild and redisplay if blockhash, instruction, accounts, or serialized bytes change.
- A returned signature is not proof of success; confirm and read the exact target state back.
- Reject wrong cluster, program ID, account owner, mint, schema version, and invite digest.

Preflight's exact reviewed-byte identity may be reused as an invisible safety layer. Do not reuse its product branding or imply arbitrary cross-app transaction interception.

## Escrow and authority limits

Target custody is program-controlled SPL escrow.

The protocol admin may configure future ritual caps/mints/fees and pause narrowly defined actions, but must not:

- withdraw active ritual escrow;
- approve or reject completion claims;
- change an activated ritual;
- pick payout recipients;
- collect event forfeitures;
- make normal settlement depend on an admin signature.

Before mainnet, emergency pause and user-safe escape/refund behavior need explicit design, adversarial tests, and independent review.

## Social-oracle limitations

Known limitations:

- friends can collude;
- members can rubber-stamp claims;
- one person may control multiple wallets;
- a compromised wallet can sign false attestations;
- unanimous/high thresholds can deadlock;
- members can grief by not responding or by questioning claims.

P0 mitigations:

- private groups;
- equal terms and low caps;
- one-friend default;
- any eligible member can confirm;
- named, explicit attestations;
- pending/questioned status is not failure;
- unresolved/no-confirmed events use a void/roll-forward path;
- host has no unilateral authority.

These reduce harm; they do not remove trust.

## Money and arithmetic

- Use integer token atomic units/checked arithmetic onchain.
- Mirror with `bigint` in TypeScript.
- Reject invisible stake division remainders.
- Test every 2–6-member attendance combination.
- Programmatically assert input/output conservation.
- Verify recipient token accounts and authorities.
- Never route rounding dust or forfeitures to the protocol.

The initial 2% / 0.50–5.00 activation fee is a product hypothesis. The exact fee is stored per ritual at activation so later configuration changes cannot alter an existing commitment.

## Devnet/mainnet boundary

P0 uses:

- Solana devnet;
- purpose-created valueless SPL test token or clearly documented equivalent;
- capped test amounts;
- visible **DEVNET — NO REAL VALUE** labels;
- throwaway test identities.

Mainnet requires, at minimum:

- applicable-law and Solana Mobile publisher-policy review;
- explicit financial/contest/gambling/money-transmission/tax conclusions for target jurisdictions;
- independent Solana program security review;
- completed threat model and incident response;
- stablecoin allowlist and decimals verification;
- mature unresolved/dispute/liveness behavior;
- production monitoring and upgrade/pause/escape design;
- privacy, UGC, reporting, blocking, retention, and deletion behavior;
- dependency remediation/classification.

Do not market devnet functionality as live USDC support.

## Privacy

P0 does not need:

- precise location;
- photos, clips, or voice recordings;
- contacts;
- in-app chat;
- public profiles/discovery;
- biometric/health data;
- hosted AI prompts.

Expected public onchain data includes wallet addresses, rule digest, minimum event/rule state, claim/attestation status, and money movement. The app must disclose that permanence.

Human-readable invite metadata is bounded, local/offchain, and untrusted until its canonical digest matches the onchain ritual. Do not place private evidence in the invite or chain.

If UGC/evidence is later hosted, add encryption, retention/deletion, consent, reporting, removal, and blocking before submission.

## Approved future boundaries

- Solo rituals are a P1 candidate, not P0. Self-attestation may return completed tranches, but missed tranches require a precommitted, non-platform, policy/custody-safe destination. Do not support valuable solo funds until custody, refunds, legal treatment, and publisher policy are resolved.
- Public/app-wide challenge templates are exploratory P2 only. Any future implementation needs separate reward-source, moderation/UGC, privacy, and Sybil-resistance controls. P0 has no public discovery, feeds, leaderboards, stranger betting, or sponsor pools.

## Credentials and build artifacts

Never commit:

- `.env` files;
- RPC/provider tokens;
- EAS/GitHub credentials;
- Android keystores;
- program deploy/update-authority keypairs;
- wallet keypairs or seed phrases;
- live malicious transactions;
- valuable token material.

Keep repository private. Scrub device logs and acceptance artifacts before committing.

## CI supply-chain boundary

CI action references and the Anchor source revision are immutable commit pins. The Solana CLI installer is downloaded over verified TLS and executed only after its exact SHA-256 matches the reviewed `v3.0.13` installer. The installer can still fetch versioned upstream binary artifacts, so residual upstream artifact trust remains; any mutation of the installer itself fails closed.

## Dependency risk

The inherited Expo 52 template previously reported 50 advisories after compatible fixes, including one critical transitive build-tooling finding and high-severity paths across Expo/Metro and SPL Token dependencies.

This does not prove remote exploitability in the shipped app, but it blocks a clean release-security claim. Do not use `npm audit fix --force`. Test upgrades in isolated worktrees and require tests, typecheck, Expo Doctor, Android export, signed APK, and MWA regression proof before merge.

## MWA identity

The current development identity still says Preflight and points to a private GitHub repository. The rebuild must migrate visible identity deliberately. Before distribution, use a stable public HTTPS application origin and consistent icon/metadata accepted by current MWA/dApp Store requirements.

## Review gates

Before claiming the Rituals MVP complete:

- program authorization and conservation tests pass;
- two-wallet devnet cycle is recorded with exact signatures/accounts/balances;
- pending/questioned no-confiscation path is exercised;
- standalone signed APK runs on Seeker without Metro;
- current docs match observed behavior;
- threat model is reviewed;
- no secrets exist in working tree or history introduced by the branch.

Before mainnet: independent review and applicable-law/publisher-policy clearance are mandatory.
