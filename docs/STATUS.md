# Status

**Read this first at the start of a session.** It is the single source of truth
for where Rituals actually is. Everything here is measured, not inherited.

Last verified: **2026-09-25** (tsc clean, 1,960 tests / 72 files on
`design/crew` a046dd4; device + devnet checks below)
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

## RESUME HERE — handoff 2026-09-25 ("lets begin rituals")

### Branches

- `overnight/mobile-integration` — last stable app. HEAD f91054d (sketches) ←
  f213f9f (sketches) ← b0023fe (fee fix) ← fd13887 (docs). **The APK on the Seeker was built from
  b0023fe + the wallet-rejection fix (installed 2026-09-24 21:09).**
- `design/crew` (a046dd4, branched from the above, pushed) — Crew redesign
  scaffolding + solo proposal. tsc clean, 1,960 tests pass. **No APK built from it.**
- Nothing merged to main yet.

### Decisions Jack made this session

- **UI direction: C "Crew"** (light, social feed, friends as the interface),
  with B "Ring" saved as the alternative. Iterated sketches: `sketches/ui-2026-09/`
  (C2 = crew + hold-to-check-in; B2 = calmer ring with crew on the ring).
  Spec: `docs/DESIGN.md`. Research: `docs/plans/ui-direction-2026-09.md`.
  Jack is asking friends which they prefer.
- **Tagline is "Show up, or pay up."** — pinned by test; never replace it.
- **Solo rituals are now in submission scope.** Jack locked the 5 decisions (§6): solo in submission; default missed-stake destination = cause/charity-style beneficiary; non-staking witness in v1; one declared skip per ritual; cohorts design-only/coming soon for submission. Proposal updated: `docs/plans/solo-rituals.md` (Hub copy: `Solo Rituals Proposal.md`).

### Next steps, in order

1. **MWA gate (needs Jack at the phone, ~5 min):** open Rituals → Create →
   template → Add member wallets → Connect with Phantom (host `Da59…VmV`) →
   friend `DNZKvX…` or test wallet 2 → Create ritual onchain → **approve in
   Phantom**. Create now reaches Phantom's approval screen (verified); approval
   itself is unexercised. Then fund from test wallet 2, claim, confirm, settle.
   Live check 2026-09-25 ~20:30 CDT: Seeker `SM02G40619100656` connected and
   authorized over USB (debug mode); Phantom present on user 0.
2. Finish Crew scaffolding on `design/crew`: load fonts in `App.tsx`
   (`useFonts` with Fraunces_600SemiBold, Fraunces_900Black, Figtree_400Regular,
   Figtree_600SemiBold, Figtree_800ExtraBold; render nothing until loaded),
   StatusBar `dark`, navigator header → `color.bg`, `headerTitle: ''`
   (screens own their hero title), `contentStyle` `color.bg`.
3. Build approved solo program changes: 1 member when solo, optional non-staking
   witness, locked cause/charity-style forfeit destination, solo settlement
   branch, one optional `declare_skip` + native tests + devnet redeploy (we hold
   upgrade authority `ETQ9…hXbx`). Est. 1.5–2 days.
4. Rebuild screens **once** in Crew, covering solo + group together: merge
   Create/Review/Roster into one flow ("Just me / With one witness / With
   friends" first), home as poster + feed, check-in via HoldButton, fix Suggest
   (results render below the fold — scroll to them; generate from the user's
   words; tap again for new ideas), cut all developer/explainer copy.
5. Friends' share page: one self-contained HTML of all sketches at
   `sketches/ui-2026-09/rituals-design-options.html` (+ a copy on Jack's Windows
   Desktop). Was blocked awaiting approval; not built.

### Device / chain facts (verified 2026-09-25)

- Seeker `SM02G40619100656` on USB, dev mode; always drive it via
  `./scripts/adb.sh` (Windows adb.exe), never Linux `adb`.
- Wallets (devnet; all hold 0 mainnet value):
  - Phantom host `Da59UWdaoBej5xdX9atiaZahMYLxJNsdXHVY6GMh8VmV` — 0.1 SOL, 200 TEST
  - **Phantom test wallet 2** `98W4zJfQDk9F5qjtLTgWTYBRdETT3JgUqY7dBNT9WjLa` —
    funded 2026-09-25: 0.1 SOL, 200 TEST (from the Hub Roadmap note)
  - CLI friend `DNZKvXpftZ4PmFAGmSEZJLH3zxURVoZgwJNmcEUYgYsA` (`.keys/`)
  - Deployer `ETQ9czekQJSebxkWn986Hao15FfEbe1345cZZDrHhXbx` (~1.34 SOL, TEST
    mint authority, program upgrade authority)
- A host cannot also be a member: each member must be a distinct wallet
  (that's why Jack needed wallet 2).
- Tooling for UI checks: `~/.hermes/cache/scratch/ui.py` (dump / tapt "label" /
  type / swipe / shot); screenshots are now read with vision (Qwen removed from
  Hermes aux config 2026-09-25).

### Local builds

```bash
cd ~/projects/preflight
export JAVA_HOME=$HOME/.local/jdk/jdk-17.0.20.1+1 PATH=$HOME/.local/jdk/jdk-17.0.20.1+1/bin:$PATH
EAS_LOCAL_BUILD_WORKINGDIR=$HOME/.cache/eas-local-build \
  npx eas-cli build --local --profile preview --platform android --non-interactive \
  --output artifacts/rituals-local.apk      # ~2.5 min warm; retry on "GraphQL request failed"
cp artifacts/rituals-local.apk /mnt/c/Users/hound/AppData/Local/Temp/rituals/
./scripts/adb.sh install -r 'C:\Users\hound\AppData\Local\Temp\rituals\rituals-local.apk'
```

JDK 17 is required (system Java 21 has no javac). Install from a Windows path
(a `\\wsl$` path hangs adb). Stop Gradle with `./gradlew --stop` in the build
dir, never `pkill -f GradleDaemon` (it kills the agent's own shell).

### Fixed this session (all on device)

- 97752e8 — every template showed "This ritual link is invalid" (screens
  re-validated non-draft shapes); regression test walks the real screen chain.
- 4a6a2d9 — wallet choice: stock MWA always opened Seed Vault Wallet; a
  postinstall patch (`scripts/patch-mwa-wallet-package.mjs`) pins the intent to
  the chosen wallet. Seed Vault + Phantom offered at every connect point.
- 7fb437e — tagline restored; stale "fixture mode" copy removed.
- b0023fe — **Create failed before Phantom opened ("fee context is stale")**:
  web3.js 1.x drops `minContextSlot` on getFeeForMessage; fixed with
  `feeForMessageAtSlot`. Added `[rituals]` failure logging
  (`adb logcat | grep '\[rituals\]'`). Wallet back-out now reads as "declined".

### Known UX debt (Jack's feedback)

"Clunky, a lot going on, very AI coded." Title shown twice per screen, narration
under everything, red for normal states, developer strings (DEMO MODE,
Deployment ready), addresses instead of people, four screens to create one
ritual, Suggest looks broken (results below the fold, canned). All addressed by
the Crew rebuild in step 5.

## History

### Session 2026-09-24 evening (after WSL restart)

- First local builds; JDK 17 requirement discovered. Review-invalid bug fixed.
  Wallet choice added. Tagline restored. EAS cloud build 27961a41 (48c4bfd)
  predates the Review fix — do not use it.

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
- Create failed on every phone attempt with "Could not create the ritual.
  Nothing was sent." The UI hid the cause by design, so it looked like a wallet
  problem. Real cause (found only after adding `[rituals]` logging): web3.js 1.x
  silently drops `minContextSlot` on `getFeeForMessage`, a lagging devnet node
  answered, and the preparer correctly rejected the stale fee. The CLI smoke
  never exercised that path. Lesson: log the real error name at every failure
  point; a smoke that bypasses the app's transport proves nothing about it.
- Unit tests per route helper all passed while the real Create → Review →
  Roster → Lobby chain failed on device. Lesson: test the hand-offs between
  screens, through a JSON round trip, not each helper alone.
