# Security and Limitations

## Security claim

Preflight is a safety aid, not a guarantee. The current implementation analyzes harmless normalized fixtures only. It does not yet decode, simulate, sign, or submit serialized Solana transactions.

## Trust boundaries

Treat as untrusted:

- serialized transactions
- expected-intent labels
- RPC/indexer responses
- program and domain metadata
- URLs
- community reports
- AI narration

Never convert successful parsing, known program identity, simulation success, or a community signature into a guarantee of safety.

## Verdict invariants

- Unsupported or incomplete required evidence cannot produce `CLEAR`.
- Unknown program identity alone does not prove maliciousness.
- Severe supported evidence may produce `ABORT`.
- AI must never override the deterministic verdict or facts.

## Transaction handling requirements

Before imported transaction support ships:

- Enforce input encoding and size limits.
- Deserialize without executing or signing.
- Resolve or explicitly report address lookup tables.
- Separate top-level instructions from simulation/history inner instructions.
- Report unsupported programs and Token-2022/extensions.
- Preserve network and simulation context.
- Never automatically forward input after parsing.

Before wallet handoff ships:

- Hash canonical reviewed bytes.
- Re-serialize immediately before handoff.
- Require exact byte/hash identity.
- Invalidate analysis after any blockhash, account, instruction, or byte change.
- Never mutate a reviewed transaction silently.

## Fixture policy

Fixtures must be harmless normalized evidence, devnet/test transactions, expired-blockhash payloads, or otherwise non-actionable data.

- Label fixtures explicitly.
- Never include a live malicious payload or valuable wallet.
- Never automatically forward an ABORT fixture.
- Keep synthetic narrative separate from decoded facts.

The current fixtures contain normalized evidence only and cannot execute.

## Wallet and credentials

- Never request or store seed phrases or private keys.
- Normal dApps reach Seed Vault Wallet through MWA.
- Keep provider keys server-side if hosted AI is added.
- Never commit `.env`, auth tokens, keystores, signing keys, or Expo credentials.
- The repository ignores `.env` and common signing-key formats.

## MWA identity limitation

The development identity currently points at the private GitHub repository URL. Replace it with a stable public HTTPS application origin and hosted identity icon/metadata before production distribution.

## Dependency risk

The official template baseline is old and currently reports 50 npm advisories after compatible fixes. One remains critical in transitive build tooling, with other high-severity findings across Expo/Metro and SPL Token dependency paths.

This does not automatically mean all advisories are remotely exploitable in the shipped app, but it blocks a clean release-security posture. Resolve through a tested framework migration, targeted overrides where compatible, or documented non-runtime exposure analysis before publication.

## Privacy

Current fixture analysis is local and contains no real wallet history. Before scan history or external services are added, document:

- exact fields retained
- local versus remote storage
- deletion behavior
- retention period
- RPC/provider disclosure
- whether generated text leaves the device

## Known product limitation

MWA does not let Preflight inspect another dApp’s wallet session. Preflight must receive or originate the transaction explicitly. Marketing language must not imply universal cross-app interception.
