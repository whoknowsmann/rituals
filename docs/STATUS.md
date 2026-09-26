# Status

**Read this first at the start of a session.** It is the single source of truth
for where Rituals actually is. Everything here is measured, not inherited.

Last verified: **2026-09-25 ~21:30 CDT** (tsc clean, 1,971 tests / 73 files on
`design/crew` f04acf8; device + devnet checks below)
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

## RESUME HERE — handoff 2026-09-25 late ("lets begin rituals")

### Branches

- `design/crew` — **the working branch.** Crew scaffolding + solo proposal +
  all MWA fixes below (merged from `fix/mwa-diagnostics`). tsc clean,
  1,971 tests / 73 files. Pushed.
- `fix/mwa-diagnostics` — `overnight/mobile-integration` + only the MWA fixes
  (ab774fd diag, 2a4ec29 compute budget/classification/stale auth, ab55204
  retry state). The APK on the Seeker (installed 21:06) is 2a4ec29, i.e. it
  does **not** yet have ab55204.
- `overnight/mobile-integration` — previous stable app (f91054d).
- Nothing merged to main yet.

### Decisions Jack made

- **UI direction: C "Crew"** (light, social feed, friends as the interface),
  B "Ring" saved as the alternative. Sketches `sketches/ui-2026-09/`, spec
  `docs/DESIGN.md`, research `docs/plans/ui-direction-2026-09.md`.
- **Tagline is "Show up, or pay up."** — pinned by test; never replace it.
- **Solo rituals in submission scope** (§6 of `docs/plans/solo-rituals.md`):
  cause/charity-style default destination; non-staking witness; one declared
  skip per ritual; cohorts design-only / coming soon.
- Jack's feedback 2026-09-25: **3–4 approval taps per signature is annoying.**

### MWA gate — 2026-09-25 evening: MWA signing PROVEN on the Seeker

| Time | Result | Cause |
|---|---|---|
| 20:33 | nothing sent | Phantom's notification-permission dialog cancelled its biometric unlock; Rituals swiped away killed the MWA session |
| 20:44 | nothing sent | cached auth token for `Da59…` while Phantom's active account was `2Xrz…m7Xa` → `auth_token not valid for signing` |
| 20:48 | **landed** (`4RbVZJqL…`, Ritual `2KmtR3…vQ3g`) but app said "Nothing was sent" | Phantom inserted its own ComputeBudget limit+price (it does so whenever a tx has none), signed *its* message; our exact-bytes check rejected it |
| 21:09 | nothing sent | MWA `Timed out waiting for response` (~2 min). Log shows ~70 s from first biometric to the approve screen, then Seed Vault. Assumed: slow approval exceeded the wallet timeout (not proven) |
| 21:13 | **landed** (`3PkBnAG7…`, Ritual `7vcEUApV…`), **our** budget ixs, fee 0.0000052 SOL, but screen still showed the old error | retry from a retryable error was ignored by the state machine (fixed ab55204) |

Fixes (all tested; RED shown on old code before GREEN):
- 2a4ec29 — prepared txs carry `SetComputeUnitLimit(200k)` +
  `SetComputeUnitPrice(1000 µlamports)`; any failure after the wallet returns a
  signature is marked `submitted` (+signature journaled for recovery) so the UI
  says "may have gone through"; `auth_token not valid` clears the cached
  authorization. Devnet: `smoke-app-lifecycle.ts` exit 0 with the budget ixs.
- ab55204 — Create and lifecycle machines accept PREPARE from a retryable
  error (the button was enabled but did nothing visible).

Where the 3–4 taps come from (logcat, one signature): Phantom biometric unlock →
Phantom approve → **Seed Vault** sign screen + biometric (Phantom on Seeker signs
via Seed Vault) → Phantom biometric again. Rituals itself requests one
authorize (reused token) + one signAndSend. Levers we control: fewer signatures
per journey (e.g. Create + host Fund in one tx), and testing Seed Vault Wallet
directly as the demo wallet.

Leftover devnet rituals (unfunded, not saved on the phone, harmless):
`2KmtR3Mf9C4xfPQqud88aBFrTY3PaN3XDBBX6VgwvQ3g`, `7vcEUApV7mMDHuZV688zBWxiUMBcdmtS3yTVLyGHqu1k`.

### Next steps, in order

1. **Phone (needs Jack):** install a build containing ab55204, Create once →
   expect "Ritual created" + invite. Then Fund from test wallet 2, claim,
   approve, settle. Approve promptly (<~45 s) and stay in Phantom until it
   returns.
2. Cut signatures per journey (Create + host Fund combined; evaluate Seed Vault
   Wallet directly).
3. Solo program changes (1 member when solo, non-staking witness, locked
   destination, solo settlement, `declare_skip`) + native tests + devnet
   redeploy (upgrade authority `ETQ9…hXbx`). See overnight notes below.
4. Finish Crew scaffolding (fonts in `App.tsx`: Fraunces_600SemiBold,
   Fraunces_900Black, Figtree_400Regular/600SemiBold/800ExtraBold; StatusBar
   dark; header `color.bg`, `headerTitle: ''`).
5. Rebuild screens once in Crew covering solo + group (merged Create flow,
   "Just me / With one witness / With friends" first; fix Suggest; cut
   developer copy).
6. Friends' share page of the sketches (not built).

### Solo program changes — `feat/solo-program`

- Implemented additive solo instructions: `create_solo_ritual` and
  `declare_skip`.
- Solo rituals persist one host member, an optional non-staking witness, a
  locked token-account destination for missed stake, and one declared skip.
  Solo settlement refunds confirmed check-ins, refunds unresolved/questioned
  claims, and routes an unclaimed event allocation to the locked destination.
- Group lifecycle paths remain covered by the existing native suite.
- Measured native result: `cd program-tests && cargo test --locked` — **181
  passed, 0 failed** across 15 test binaries; focused `solo_ritual` — **5
  passed, 0 failed**. The pre-change baseline was **176 passed, 0 failed**.
- `anchor build` passed and emitted `target/deploy/rituals.so` (675,592 bytes).
  No deploy, upgrade, or cluster transaction was run.
- The generated IDL adds two instructions and `RitualKind`, and extends
  `Ritual` from 909 to 977 bytes. The frozen TypeScript IDL was not overwritten;
  the exact client work is recorded in
  `docs/plans/solo-program-client-delta.md`.

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
- Tooling for UI checks: `scripts/ui.py` (dump / tapt "label" / type / swipe /
  back / shot → `artifacts/shots/`). Wrap calls in `timeout 30`: a Play Protect
  dialog on install can block uiautomator. Answer it "Don't send".

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
exit 0. **2026-09-25: Create signed through MWA from the Seeker landed twice on
devnet** (see RESUME HERE). The remaining unproven link is the full two-wallet
lifecycle signed on the phone.

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

**Full two-wallet lifecycle signed via MWA on the Seeker** (Create is proven —
see RESUME HERE). Host `Da59…VmV` and member test wallet 2 `98W4…WjLa` are both
Phantom accounts on the personal profile (user 0); Jack switches the active
account in Phantom between host and member steps, then reconnects in Rituals.
The app now clears a stale auth token automatically when Phantom rejects it.

What tooling cannot see: Phantom's storage is app-private (not debuggable,
device unrooted). Wallet addresses come from Jack — public addresses only,
never seed phrases or private keys.

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
