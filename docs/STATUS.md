# Status

**Read this first at the start of a session.** It is the single source of truth
for where Rituals actually is. Everything here is measured, not inherited.

Last verified: **2026-09-24** (devnet app-level lifecycle + full test run; branch
`overnight/mobile-integration`, not yet merged to main)
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

## Session 2026-09-24 evening (after WSL restart)

- Local builds work: `artifacts/rituals-local.apk` built from 4a6a2d9 in ~2.5 min
  (warm cache) and installed on the Seeker 20:32. **Requires JDK 17**: export
  `JAVA_HOME=~/.local/jdk/jdk-17.0.20.1+1` first — the system Java 21 is a
  JRE with no `javac` and Gradle rejects it. Expo's API returns intermittent
  503 "GraphQL request failed"; retry.
- Fixed on device (97752e8): every valid template reached Review as "This ritual
  link is invalid" — screens re-validated non-draft shapes. Roster and Lobby
  had the same defect. Regression test walks the real screen chain.
- Wallet choice (4a6a2d9): stock MWA's implicit intent always resolved to Seed
  Vault Wallet on the Seeker, so Phantom was unreachable. A postinstall patch
  adds `walletPackage` to the native session; every connect point now offers
  Seed Vault Wallet or Phantom, and later sessions return to the wallet that
  authorized. Verified: both buttons render on Roster/top bar, and the pinned
  intent resolves to `app.phantom/.MainActivity`. **Phantom authorization
  itself is not yet exercised** — that is the next phone step.
- Tagline restored to "Show up, or pay up." (pinned by test).
- EAS cloud build 27961a41 (48c4bfd) finished but predates the Review fix — do
  not use it.

## Resume here (handoff 2026-09-24, before WSL restart)

Session paused for `wsl --shutdown` to raise the WSL memory cap 8→12 GB. Pick up
in this order:

1. Verify the restart took: `free -g` shows ~12 GB total; `echo $ANDROID_HOME`
   is `~/Android/Sdk`.
2. First **local** build (replaces the slow EAS free queue):
   `cd ~/projects/preflight && npx eas-cli build --local --profile preview --platform android --output artifacts/rituals-local.apk`
   SDK (platform 35, build-tools 35.0.0, NDK 26.1.10909125, CMake 3.22.1) is
   installed; Gradle limits are in `~/.gradle/gradle.properties`. JDK 21 is
   present; if Gradle rejects it, install a JDK 17 under `~` (no sudo). If the
   build OOMs, raise `.wslconfig` to 14–16 GB (Jack runs the shutdown).
3. Also check EAS cloud build `27961a41-1e75-4242-b598-9210590363e3` (commit
   48c4bfd) — its background watcher died with the restart. Use whichever APK
   is ready first.
4. Install over USB with `./scripts/adb.sh install -r "$(wslpath -w <apk>)"` —
   always the Windows adb wrapper, never the SDK's Linux `adb` (they fight over
   USB).
5. **Phone session with Jack — the MWA gate.** Seeker is set up; Phantom is on
   devnet with public address `Da59UWdaoBej5xdX9atiaZahMYLxJNsdXHVY6GMh8VmV`
   funded with 0.1 SOL + 200 TEST. Flow: template → 2 members (Phantom host +
   CLI friend `DNZKvX…`) → Connect wallet on Roster (first approval is sticky;
   pick the right account) → Create → approve in Phantom → confirm in app. Then
   Fund from phone, fund friend from CLI, and continue claim → approve → settle.

Branch state: all work on `overnight/mobile-integration` (HEAD 48c4bfd, pushed,
**not merged to main**). Submission drafts on `overnight/submission-materials`.
Jack's standing direction: **build it, then make it perfect** — ship visible app
behavior, no new adversarial test matrices.

## The one-line state

The protocol, typed client, **and the app's own screen-level lifecycle code** are
proven on devnet with CLI keypairs: `scripts/smoke-app-lifecycle.ts` drives
create → fund ×2 → activate → initialize event → claim → friend approves →
finalize through the same orchestrators and state machines the screens use,
exit 0. The next gate is still **one Create signed through Mobile Wallet Adapter
from the phone** — the only unverified link in the chain.

## Done and verified

- Anchor program deployed to devnet, slot 500137332
- ProtocolConfig initialized; live state asserted against the client contract
- Valueless SPL TEST mint (6 decimals), mint authority held locally
- Full hero flow as real transactions (raw builders): 17/17 assertions,
  settlement conservation exact, protocol takes nothing
- **2026-09-24: full hero flow through the app-level modules** (Ritual
  `DywcbrgStUoR3tY6mbtKRCGXy8EWGGenhcJRs8ep1VZm`, finalize
  `3NpnJJYX…8439e`): pool 2,000,000 / payout 2,000,000 / forfeited 1,000,000 /
  remaining stake 2,000,000
- **Reload recovery** for in-flight transactions: pending records journaled at
  wallet handoff; resolver classifies from chain after a restart. Proven on
  devnet by `scripts/smoke-reload-recovery.ts`
- Invite/join (digest-bound, only after confirmed Create; join validates against
  chain) — unit-tested only
- Home, detail, claim, confirmation inbox, receipt screens read authoritative
  chain state (known rituals persisted locally; fixtures are labeled demo-only)
- Fund, Activate, InitializeEvent, Claim, Approve, Question, Finalize wired
  through one generalized lifecycle machine with pending-action journaling
- Transient public-RPC read failures (429, min-context-slot) are retried with
  bounded backoff; submission is never retried
- SKR balance read + activation-fee discount branch
- Ritual suggestions in the template picker (deterministic, on-device)
- Dark + gold design system; commitment-device copy
- APK (first-pass build 9066ad0) built by EAS; earlier build installed on the
  Seeker and launched clean

Measured 2026-09-24: **1,942 JS/TS tests across 70 files**, `tsc --noEmit`
clean, **180 native program test functions** (not re-run this session).

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
(~1.5 SOL after 2026-09-24 smokes, holds TEST) and a devnet friend keypair
`DNZKvXpftZ4PmFAGmSEZJLH3zxURVoZgwJNmcEUYgYsA` (~0.3 SOL) that can act as member
2 from the CLI. Keys live in `.keys/` and are gitignored.

Note: **Create needs only one signer** (the host). A second wallet matters only
for Fund and Friend Confirm, and the CLI friend keypair can cover those until the
demo is filmed.

## After that gate, in order

1. Wallet-signed two-wallet lifecycle on the Seeker (invite → join → fund →
   activate → claim → approve → finalize) — screens are wired, device unproven
2. Merge `overnight/mobile-integration` to main after the phone run
3. Icon, splash, adaptive icon, accessibility, Seeker-size QA
4. Signed standalone APK verified on the Seeker
5. Demo video, pitch deck, screenshots, privacy copy (drafts on branch
   `overnight/submission-materials`)
6. Public-repo cleanup (audit on that branch: no secrets found in history;
   remove `sketches/`, `spikes/`, internal plans) then **make the repo public**
   and update the MWA wallet identity URI
7. Integrated adversarial pass, then ship

## Open risks

**Public devnet RPC is rate-limited.** Every smoke run sees 429s. Reads now
retry, but the phone demo should use a dedicated devnet RPC endpoint (needs Jack
to sign up for a free key). Filming against the public endpoint risks visible
stalls.

**Reload recovery — now implemented, device-unproven.** Proven on devnet by
script; the real MWA background/kill path on Android has not been exercised. Test
it on the Seeker before filming; if it misbehaves, the video must avoid it.

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
- Landed transactions were reported "sent but could not be confirmed" (seen on
  Approve and Activate). Cause: public devnet load-balances reads, so the
  post-confirmation readback hit a lagging node (-32016) or a 429 and the client
  treated one failed read as final. Fixed in 77348d2 with bounded read-only
  retry. Lesson: before assuming a protocol bug, check the transaction on-chain;
  here `solana confirm -v` showed `Status: Ok` while the app said failure.
- The app smoke's settlement assertion failed although settlement was exact:
  on devnet the host token account is also the fee recipient, so the activation
  fee skewed the baseline. Lesson: check for account aliasing before trusting a
  balance-delta assertion.
