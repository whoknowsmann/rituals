# Security and Limitations

Measured 2026-10-11 against `feat/solo-screens`. Product facts and their evidence
are in `docs/submission/FACTS.md`; this page is the security view of the same
system.

## Honest status

- Devnet only. The stake token (tSKR) has no value. Nothing here claims that
  real funds would be safe; assets with value need independent program review,
  a threat-model review and legal review first.
- Proven on a Solana Seeker with Seed Vault Wallet through Mobile Wallet Adapter:
  one approval creates, funds and activates a ritual; one approval per stamp;
  the app's settle key closes finished weeks with no wallet prompt; End early
  returns everything not missed in one approval. The same code path runs on
  devnet by script (`scripts/smoke-app-solo.ts`). Signatures are listed in
  FACTS "Evidence".
- Nothing verifies that the user did the thing. Stamps are self-reported; the
  stake is the only check. A witness and friends who confirm each other are
  built, hidden, and not part of the submission.
- Nothing runs while the app is closed: no server, no background task. A missed
  week's money moves the next time the app is open.

## Trust boundaries

Treat RPC responses, cached account state, wallet labels, ritual text, token
metadata, URLs and any signature before confirmed readback as untrusted. The
client validates program ID, cluster, account owner, mint, decimals, balances and
lifecycle state from the accounts themselves (strict, fail-closed decoders),
never from display metadata. `assertSupportedRitualsProgram` refuses any cluster
other than devnet or any program other than the authorized deployment.

A wallet signature proves who stamped, not that the activity happened.

## Wallet and transaction safety

- The app never requests, reads, transmits or stores a seed phrase or private
  key. Wallet access is Mobile Wallet Adapter only; Connect offers Seed Vault
  Wallet, whose keys stay in the Seeker's secure element.
- Every transaction is prepared in full (compute-budget instructions included),
  shown with its exact effect, then signed by the wallet. The submitter binds the
  returned signature to the exact bytes reviewed. If the wallet rewrites the
  priority fee (Seed Vault Wallet does), the submitter verifies the landed
  transaction on chain instead of trusting the reply.
- Success is reported only from observed chain state: confirm, then read back
  the target accounts. Public-RPC read failures (429, lagging node) are retried
  with bounded backoff; submission is never retried blindly.
- A lost wallet reply, or a cancel after signing began, is treated as "possibly
  sent" and resolved from chain. A create keeps one nonce per screen so a retry
  cannot make a second ritual. In-flight actions are journaled and recovered
  after a restart.
- Duplicate actions are blocked while a write is pending. Wallet sessions are
  serialized.

## The settle key

A keypair generated on the phone and stored in app storage. It is funded by one
capped SystemProgram transfer inside the user's first approval (0.001 SOL plus
0.002 SOL per week, 0.033 SOL at most, shown before signing). It can sign only
the open-week and settle instructions, which the program lets anyone run, and
the program sends money only where the ritual already says: a kept week's share
to the member, a missed week's share to the destination locked at creation. It
cannot move the stake anywhere else. If it runs dry or fails three times, a
wallet button is the fallback. Uninstalling the app discards the key and any
SOL left in it.

## Program and money limits

- The stake sits in a token account whose authority is the ritual's program-
  derived address; only the program moves it. Settlement conserves the pool
  exactly and never pays the protocol. The configurable protocol fee is 0 / 0 / 0
  on devnet, asserted by `scripts/verify-devnet-config.ts`, and locked per ritual
  at creation.
- Every week's opening, deadline and resolution time is written on chain at
  create; the program checks stamps and settlements against the chain clock.
- Token math uses checked atomic-unit arithmetic (`bigint`), deterministic
  remainder handling (one total split evenly, rounded down per week) and
  conservation tests (native suite: 224 tests).
- Known limits: the Demo-speed clock never pauses; a wallet chosen as the
  destination must already hold a tSKR account; account rent stays with a
  finished ritual's accounts (End early closes the vaults and returns it).

## Privacy

No accounts, no analytics, no server of ours except the devnet faucet, which
receives only the wallet address. On chain: the ritual's schedule, stake,
destination, a SHA-256 digest of its name and description, stamps and
settlements, all public. On the phone: the ritual's name and description, stamp
notes, the settle key, reminder settings, the theme and the in-flight journal.
Reminders are scheduled locally. Uninstalling removes everything on the phone;
chain data stays.

## Device rule

The development Seeker is a personal device. Its personal wallets are off
limits: no authorization, balance reads or prompts that could reach them. Demo
accounts are fresh Seed Vault accounts chosen by the owner in the wallet's own
sheet, holding devnet assets only.

## Before any asset with value

Independent Solana program review, threat-model review, legal and publisher-
policy review, operational monitoring, and a clean secret scan. Never commit
credentials, wallet material, keystores, `.env` files or valuable assets.
