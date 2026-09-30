# Public-repo readiness audit

Refreshed 2026-09-30. Replaces the 2026-09-23 audit, which predates the solo-first pivot and about 100 commits.

Scope: the tree at `docs/submission-solo` (based on `feat/solo-screens` @ 97e51b9), read with file search only. No shell, no git history access, no scanner run. This is a readiness report. It changes nothing and does not flip visibility.

## Result in brief

- No private key, seed phrase, API key or keyed RPC URL was found in the current tree.
- `.keys/` and keypair material are gitignored. Nothing under `.keys/` was opened.
- The tree still carries a lot a judge should not see first: "Preflight" naming in docs and scripts, local paths, the operator's personal device notes, group-first docs, an overnight agent report, abandoned sketches and spikes.
- Git history is NOT scanned. A scanner run is required before the flip (item 1 of the checklist).
- One code-level item must change: the wallet identity URI still points at the private repo.

## 1. Secrets and keys

Checked by reading `.gitignore` and by regex search over the tracked tree (excluding `package-lock.json` hashes).

| Check | Result |
|---|---|
| `.gitignore` covers `.keys/` (line 53), `.env` / `.env.*` with `!.env.example` (33-35), `*.key`, `*.pem`, `*.jks`, `*.p8`, `*.p12`, `*.apk`, `target/`, `test-ledger/`, `deploy/*-keypair.json`, `deployment/` with `!deployment/devnet.json` (49-50), `artifacts/` | Good. |
| 64-number keypair JSON arrays (regex for long integer arrays) | None. |
| Seed phrase / mnemonic content | None. Hits are policy text only: `README.md:114`, `docs/SECURITY.md:23`, `docs/submission/*` ("never enter a seed phrase"), and a comment about the CLI's buffer recovery phrase at `scripts/deploy-devnet.sh:38` and `docs/STATUS.md:202`. Fine. |
| API keys, tokens, `?api-key=`, Helius / QuickNode / Alchemy URLs | None in source. Every hit was a policy sentence. Note `docs/STATUS.md:515` says the phone demo wants a dedicated devnet RPC key. If Jack adds one, keep it out of git (env var or EAS secret). |
| Filenames of keypairs | The tree lists no keypair JSON files. Documents do reference them by path: `docs/STATUS.md:111,114,115,116` (`.keys/rituals-*.json`, `../preflight/.keys/rituals-devnet-deployer.json`), `scripts/write-program-buffer.ts:16`. Paths only, no contents. Scrub anyway (see section 2). |
| `Anchor.toml:9` and `spikes/001-anchor-mwa-compatibility/program/Anchor.toml:16` set `wallet = "~/.config/solana/id.json"` | This is the Anchor default and a hazard. `docs/STATUS.md:120` says that file is Jack's real mainnet wallet. No key is leaked, but any contributor running `anchor deploy` with this config would use whatever that path holds. Recommend changing to a dedicated path such as `.keys/rituals-devnet-deployer.json`, or removing the line. Needs Jack's OK because Anchor.toml is not a doc. |
| Base58-looking 43-44 char strings | About 70 in docs and 70 in code/tests/IDL, plus lockfile hashes. Sampled the hits in README, STATUS, the overnight report and fewer-signatures.md (not every file): program ID, ProtocolConfig, TEST mint, fee account, upgrade authority, devnet ritual addresses, devnet tx signatures, devnet demo cause and season. These are public identifiers, not secrets. See section 2 for the subset that maps to Jack's personal accounts. |

Verify on the machine that has git (not done here):

    git ls-files | grep -E '(^|/)(\.env|.*keypair.*\.json|\.keys/|.*\.(jks|p12|p8|pem|key))$'
    git status --short --ignored | grep -E 'keys|keypair'

Both should return nothing tracked.

## 2. Personal information

No emails or phone numbers were found in tracked files. No mainnet wallet address of Jack's appears; only the path `~/.config/solana/id.json` is named.

| Where | What | Recommendation |
|---|---|---|
| `docs/STATUS.md:117-118` | Addresses of Phantom Account 3 and Account 2 on Jack's personal Seeker, with balances | Scrub from any public doc. Devnet-only and "checked 0 mainnet", but they tie a real phone's wallet accounts to the project. Keep the internal STATUS private (see section 3). |
| `docs/STATUS.md:111,115,116`, `114` | Demo cause owner, smoke owner, smoke witness, deployer / upgrade authority addresses plus keypair file paths | Addresses: keep only the program ID, mint, cause and Season in public docs. Key file paths: scrub. |
| `README.md:37`, `docs/STATUS.md:114` | Upgrade authority `ETQ9cz...bXbx` | Keep, but label devnet-only. It is a public identifier. Consider rotating the authority after judging. |
| `docs/STATUS.md:120`, `docs/plans/2026-09-17-hackathon-submission.md:110` | Says `~/.config/solana/id.json` is the real mainnet wallet / CLI deploy key | Scrub. Announcing which file holds a real wallet invites targeting. |
| `docs/STATUS.md:386` | `/mnt/c/Users/hound/AppData/...` | Scrub. |
| `scripts/adb.sh:12` | Default `ADB=/mnt/c/Users/hound/AppData/Local/Android/Sdk/platform-tools/adb.exe` | Change default to `adb` on PATH, keep `ANDROID_ADB` override. |
| `docs/plans/solo-smoke.md:117-177` | About 20 lines with `/home/hound/.hermes/cache/scratch/...` and `/home/hound/projects/preflight-solo/...` | Move the file to `docs/archive/` or rewrite with `$TMPDIR`. |
| `docs/STATUS.md:17,28-29,51,53,85,87,381` | `~/projects/preflight-solo`, `~/projects/preflight`, private repo name | Covered by STATUS being archived or rewritten. |
| `README.md:79`, `app.json:32`, `docs/ROADMAP.md:107`, `docs/plans/2026-09-17-hackathon-submission.md:73` | EAS owner `argussmithson`, package `com.whoknowsmann.rituals` | Keep the package ID (changing it breaks the installed app and EAS linkage). The GitHub handle `whoknowsmann` already appears in `src/utils/useAuthorization.tsx:107`. Decide once whether these handles are acceptable as public identity. They are pseudonymous. |
| `README.md:117,119,136`, `docs/SECURITY.md:11`, `docs/STATUS.md` (many) | "Jack", "Jack's Seeker", "Jack's Hub vault" | Keep the first name in the submission (Jack is the named founder). Scrub references to the private vault and to personal-device rules from the public README. Product and team docs can say "the developer". |
| Commit metadata | All 301 commits: `El <el@argus.dev>` (checked 2026-09-30). | Pseudonymous; decide before the flip (see section 4). |

## 3. Stale product and confusing files

What a judge opening the repo would see, by group.

| Group | Problem | Recommendation |
|---|---|---|
| "Preflight" naming | Only in docs and comments. App strings and code are clean (hits in `src/` and `scripts/` are the Solana `preflightCommitment` / `skipPreflight` flags and a `deploy-devnet.sh:24` echo, all legitimate). Doc hits: `docs/STATUS.md`, `docs/plans/solo-first-2026-09-26.md:47,84`, `docs/plans/solo-smoke.md:126`, `docs/plans/2026-09-09-rituals-rebuild.md` (4), `scripts/write-program-buffer.ts:16` (path `../preflight/.keys/...`). | Plans: move to `docs/archive/`. `write-program-buffer.ts:16`: fix the example path. Do not rename the legit RPC flags. |
| `README.md` | Top of file still describes the group-first build: "the event pool equals both member allocations, payout plus refund plus remainder equals the pool" (lines 23-24), a group-era address table (lines 33-38, including a "First verified Ritual"), private-repo wallet URI (line 79), Hub references (136-138). | Replace with `docs/submission/README.public-draft.md` once it is solo-first. Another writer owns that file. |
| `docs/STATUS.md` (572 lines) | Internal working log: phone account addresses, key paths, correction log, operator instructions. Accurate, but it is a diary. | Move to `docs/archive/` (or keep on a private branch) and publish a short public status instead. |
| `docs/PRODUCT.md` | Still group-first: "Friends are witnesses", "Forfeited allocations redistribute to confirmed members", revenue section about a 2% pooled-group activation fee. The solo pivot makes the main path a stake routed to a cause or a person, never to confirmed members. | Keep, but rewrite for solo-first before the flip. It is the copy-rules source, so it must not contradict the submission. Not edited here. |
| `docs/IMPLEMENTATION_PLAN.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/DESIGN.md`, `docs/SECURITY.md` | Reference docs of uneven age. ROADMAP and IMPLEMENTATION_PLAN carry schedule pressure and the "Seeker of Jack" phrasing. | Keep ARCHITECTURE, SECURITY, DESIGN, DEVELOPMENT after a path and name scrub. Archive IMPLEMENTATION_PLAN. Rewrite ROADMAP public-safe. |
| `docs/plans/` (15 files) | Dated internal plans, including three group-era ones (`2026-09-09-rituals-rebuild.md`, `2026-09-15-*`, `fewer-signatures.md`, `crew-home-implementation-2026-09.md`) and `2026-09-17-hackathon-submission.md` (superseded by `solo-first-2026-09-26.md`). | Move all to `docs/archive/plans/`. Keep `solo-first-2026-09-26.md` and `hackathon-winners-2026-09-26.md` only if Jack wants to show reasoning. The latter names competitors and strategy, so archive it. |
| `docs/overnight/2026-09-24-mobile-integration-report.md` | Agent-written overnight report with about 8 full devnet signatures and a "PARTIAL" table. Confusing and dated (says group flow). | Delete from the public tree, or move to `docs/archive/`. |
| `docs/submission/` | Older drafts listed in the task: `demo-video-script.md`, `pitch-deck-outline.md`, `README.public-draft.md`, `privacy-and-store-listing.md`. `docs/submission/public-repo-audit.md` itself. | Being rewritten by others. The audit and the organizer email are internal; move both out of the public tree at the flip (or keep under `docs/archive/`). |
| `sketches/` (`consumer-pivot/`, `ui-2026-09/`, `ui-2026-09-26/`, `ui-2026-09-26-solo/`) | About 50 HTML and PNG files of abandoned UI directions. `sketches/ui-2026-09-26-solo/shots/` are mockups, not device screenshots, and could be mistaken for the real app. Notes use invented names (Sam, Maya, Dad). | Move all to `docs/archive/sketches/`, or delete. If screenshots are wanted in the README, use real device captures only. |
| `spikes/001-*`, `spikes/002-*` | Feasibility spikes with their own Anchor workspace and a Cargo.lock. | Move to `docs/archive/spikes/`. Their README records a wrong program ID `5b8xpiXk...` and `8v1Go43...`; harmless but confusing. |
| `scripts/overnight-deploy.sh` | Unattended overnight deploy script. Line 59 says "NEXT (needs Jack)". | Delete or archive. Not part of a public build story. |
| `scripts/ui.py`, `scripts/capture.sh`, `scripts/check-device.sh`, `scripts/await-devnet-sol.sh` | Agent and device-driving helpers. | Keep `check-device.sh` and `capture.sh` if adb default is fixed. Archive `ui.py` unless documented. |
| `src/` group-era identifiers | `deriveGroupPool`, `groupPool`, `event_pool` in `src/domain/rituals/money.ts`, `src/features/rituals/create/*`, IDL. | Keep. Code is truth, and the group path still ships. Do not rename. |
| Copy-rule check in app strings | Grep over non-test `src/` for win / pot / jackpot / bet found only identifiers above and `settlement.ts:82` comments. No UI string hits. | Fine. |

## 4. Git history

History becomes public when visibility flips. Everything deleted from the tip stays in it: the Preflight-era source, sketches, spikes, plans, phone-account addresses and the overnight report.

- Scanned 2026-09-30 by Hermes (regex, not gitleaks/trufflehog): 301 commits across all refs. Every added line in `git log --all -p` was checked for PEM private keys, 64-number keypair arrays, `api-key=` URLs, Helius keyed URLs, `sk-`/`ghp_`/`AKIA` tokens. **No hits.** `git log --all --name-only` shows no `.keys/`, keypair, `id.json`, `.env` or `.pem` file was ever committed. A dedicated scanner (gitleaks) is still worth one run before the flip, since regex scans miss formats they don't name.
- Author and committer identity is the same on all 301 commits: `El <el@argus.dev>`. Pseudonymous. Decide whether that is the identity you want public; changing it means rewriting history.
- Decision for Jack: flip this repo as is (history visible, candid, includes the pivot) or publish a fresh squashed repo with no history. A squashed repo is the cleanest way to avoid accidental leaks. It loses commit history as evidence of work during the hackathon window, which the terms may ask for (project start date, code authorship verification). Keeping history is the safer choice for eligibility unless the scan finds something.
- Branch and tag names (`archive/*preflight*`, `spike/*`, feature branches) are visible. Prune or accept.
- If the scan finds a real secret: revoke and rotate first, then rewrite history. Never force-push `main` without explicit approval.

## 5. Other items that affect a public flip

- `src/utils/useAuthorization.tsx:104-107`: `APP_IDENTITY.uri` is `https://github.com/whoknowsmann/rituals` with the comment "Keep the private source-of-truth repository". Wallets show the URI during approval; Phantom labels the app "github.com" (known Phase E issue). After the flip the URL will resolve. Decide whether to keep it or move to a real domain. Also update `docs/SECURITY.md:49` and `README.md:79`.
- `.github/workflows/ci.yml`: not read in this pass. [TODO: check it for secrets, self-hosted runner settings and anything that would run on forked PRs.]
- `deployment/devnet.json` is explicitly un-ignored (`.gitignore:50`) but is not in the tree. [TODO: confirm whether the app reads it; if so, check it holds public addresses only.]
- No LICENSE file was found in the tree. [TODO: choose a license; the public-draft README already lists this as open.]
- `package-lock.json` has about 96 long base58 matches. These are integrity hashes, not secrets.
- Test counts in this repo's docs: STATUS.md says 2,146 tests across 99 files. This audit did not run them (no installs or builds allowed).

## 6. Ordered pre-flip checklist (approve line by line)

1. Run gitleaks and trufflehog over all refs. Record output in this file. Stop if anything real is found; rotate first.
2. Check `git ls-files` for key-like or `.env` paths (commands in section 1). Expect nothing.
3. Decide history policy: keep, or squash to a new repo. Decide author-email handling.
4. Change `Anchor.toml:9` (and the spike copy if the spike stays) so the default wallet is not `~/.config/solana/id.json`.
5. Fix `scripts/adb.sh:12` default and `scripts/write-program-buffer.ts:16` example path.
6. Create `docs/archive/` and move: `sketches/`, `spikes/`, `docs/plans/*` (except what Jack keeps), `docs/overnight/`, `docs/IMPLEMENTATION_PLAN.md`, `docs/STATUS.md`, `scripts/overnight-deploy.sh`. Or delete instead of archive.
7. Rewrite `docs/PRODUCT.md` for solo-first and remove the pooled-group revenue framing from the lead.
8. Replace `README.md` with the solo-first public README (from `docs/submission/README.public-draft.md`). Include the honest edges: devnet, valueless TEST token, demo cause, no mainnet, no dApp Store listing yet.
9. Scrub remaining local paths, personal-device addresses, key file paths and Hub references from every file that stays public (grep `/home/`, `/mnt/c/`, `.keys`, `Phantom Account`, `Hub`).
10. Decide what to do with the wallet identity URI (`useAuthorization.tsx:107`). If changed, rebuild the APK and re-test approval on the Seeker.
11. Choose and add a LICENSE.
12. Review `.github/workflows/ci.yml` for secrets and fork-PR behavior.
13. From a clean clone: `npm ci`, `npm test`, `npm run typecheck`. Record real counts. Update any test count quoted in docs.
14. Rotate or retire the devnet upgrade authority and demo authority keys after judging, and note that in the README.
15. Have Jack approve the final file list and flip visibility himself.

## Limits

This pass was static reading and regex search. It is not proof of safety. Binary assets (PNGs, the IDL JSON beyond address counts) were not inspected by eye. Nothing outside the two owned files was changed.
