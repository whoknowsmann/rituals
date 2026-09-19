# Status

**Read this first at the start of a session.** It is the single source of truth
for where Rituals actually is. Everything here is measured, not inherited.

Last verified: **2026-09-18** (devnet + physical Seeker + full test run)
Deadline: **2026-10-09 06:59 UTC** (01:59 CDT) · internal ship target **2026-10-08**

## How to re-verify in one minute

Do this instead of trusting any prose, including this file:

```bash
cd ~/projects/preflight
git log --oneline -8                       # what actually landed
npm test                                   # real test count
npx tsx scripts/verify-devnet-config.ts    # live chain matches the client
./scripts/check-device.sh                  # Seeker, profiles, wallets
```

If a document disagrees with those four commands, the document is wrong. Fix it.

## The one-line state

The protocol, the typed client, and the full hero flow are **done and proven on
devnet with CLI keypairs**. The app installs and runs on the Seeker. The next
gate is **one Create signed through Mobile Wallet Adapter from the phone** — the
only unverified link in the chain.

## Done and verified

- Anchor program deployed to devnet, slot 500137332
- ProtocolConfig initialized; live state asserted against the client contract
- Valueless SPL TEST mint (6 decimals), supply 200, mint authority held locally
- Full hero flow as real transactions on a live validator: create → fund ×2 →
  activate → initialize event → claim → friend approves → finalize/settle.
  17/17 assertions, settlement conservation exact, protocol takes nothing
- Deployment config flipped to `deployed`; client facade opens
- Funding lobby submits a real Create transaction
- SKR balance read + activation-fee discount branch
- Ritual suggestions in the template picker (deterministic, on-device)
- Dark + gold design system and token layer
- Product reframed as a commitment device (see `docs/PRODUCT.md`)
- APK installed on a physical Seeker, launches clean, no crashes

Measured: **1,906 JS/TS tests across 65 files**, **180 native program test
functions**, `tsc --noEmit` clean.

## The next gate

**One real Create signed via MWA from the Seeker.**

Blocked on: a funded devnet wallet account on the phone that is not one of
Jack's personal wallets.

State of that setup:

- Phantom is installed on the personal profile (user 0) and has 3 accounts.
  Account 1 is Jack's personal (low value); accounts 2 and 3 are fresh and
  intended for this.
- A work profile exists (user 10) but has **neither Phantom nor Rituals**
  installed. MWA cannot cross the profile boundary, so if demo wallets live in
  the work profile, Rituals must be installed there too — and adb cannot install
  into or enumerate user 10, so that is a phone-side task.
- Current plan: use a fresh account in the personal-profile Phantom, with Jack
  selecting the account in Phantom's own prompt.

What tooling cannot see: Phantom's storage is app-private
(`/data/data/app.phantom` permission denied, not debuggable, device unrooted,
build type `user`). Wallet accounts and addresses must be supplied by Jack. Only
public addresses — never seed phrases or private keys.

Costs measured on devnet, so nobody over-farms faucets:

| Item | Cost |
|---|---|
| Token account rent | 0.001488 SOL |
| Ritual account rent | ~0.0027–0.0067 SOL |
| Create all-in (ritual + 2 vaults + fees) | ~0.01 SOL |
| Recommended wallet balance | 0.1 SOL |

The stake asset is the TEST mint, not SOL. Mint authority is local, so TEST can
be issued on demand — no faucet needed for stake.

Local funding sources: deployer `ETQ9czekQJSebxkWn986Hao15FfEbe1345cZZDrHhXbx`
(~1.65 SOL, 100 TEST) and a devnet friend keypair
`DNZKvXpftZ4PmFAGmSEZJLH3zxURVoZgwJNmcEUYgYsA` (~0.3 SOL) that can act as member
2 from the CLI. Keys live in `.keys/` and are gitignored.

Note: **Create needs only one signer** (the host). A second wallet matters only
for Fund and Friend Confirm, and the CLI friend keypair can cover those until the
demo is filmed.

## After that gate, in order

1. Digest-bound invite generated only after confirmed Create readback
2. Invite/join flow and member-funding/activation progress
3. Replace fixture dashboard/detail/claim/receipt reads with authoritative RPC
4. Stale / rejected / expired / offline / duplicate-tap / reconnect handling
5. Reload recovery for in-flight transactions (see risk below)
6. Icon, splash, adaptive icon, accessibility, Seeker-size QA
7. Signed standalone APK verified on the Seeker
8. Demo video, pitch deck, screenshots, privacy copy
9. **Make the repo public** and update the MWA wallet identity URI
10. Integrated adversarial pass, then ship

## Open risks

**Reload recovery — highest technical risk.** Submitted-action handles are
process-local by design and cannot be restored after a reload. MWA leaves the app
to reach the wallet, so backgrounding mid-transaction is ordinary on Android. A
user who takes a call while funding must not land in an unrecoverable state. If
this slips, the demo video must avoid the path that triggers it — and that should
be known before filming, not during.

**Organizer questions still unsent.** Two remain, both eligibility rather than
scoring: is devnet with valueless tokens acceptable as "meaningful interaction
with the Solana network," and what disclosure does dApp Store review expect for a
commitment device. Drafts are ready in the Hub (`Clock In Organizer Questions`).
Being wrong on either is disqualification or a dead 30-day publication clock, not
a lost point.

**Rubric disagreement.** The live Align API lists AI 20 / SKR 20 / UX 15 / UI 15 /
Innovation 15 / Ecosystem Impact 15. Terms §8.1 lists four equal 25% criteria with
no AI or SKR, and the terms say they prevail. SKR is genuinely implemented. The
"AI" surface is the deterministic on-device suggestions picker — that was a
deliberate choice so nothing can fail mid-demo, but **do not describe it as AI in
the submission**; a judge who finds decorative AI scores it worse than none.

**Repo is private.** A public source repository is a submission requirement.

## Correction log

Mistakes worth not repeating.

- `scripts/check-device.sh` reported Rituals as "not installed" while it was
  installed and running. Cause: piping adb into `grep -q` made grep exit on first
  match, adb died with SIGPIPE (141), and `pipefail` turned a successful match
  into a failure. Fixed in ca9937c. Lesson: capture adb output to a variable
  before matching, and distrust a clean-looking negative from a `pipefail` script.
- Status docs claimed `not-deployed` for a full day after devnet deployment,
  which caused a later session to brief Jack from stale prose. Lesson: when a
  gate flips, update `docs/STATUS.md` in the same commit.
- Test counts drifted (docs said 1,758/56; actual 1,906/65). Lesson: measure, or
  omit the number.
