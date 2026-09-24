# Public-repo readiness audit (DRAFT)

**Scope:** Rituals repository at `d3bd3a8` on `overnight/submission-materials`.
This is a readiness report, not a request to change repository visibility. Do not
publish until the owner has reviewed the recommendations below.

## Executive result

- **History scanned:** all commits reachable from `git log --all` / `git rev-list --all`.
  The scan covered **195 commits**, including local/remote branches and archive tags.
- **Secret scanners:** `gitleaks` and `trufflehog` were not installed in the
  environment, so neither was run. The local scan used Git patch inspection and
  redacted regex checks.
- **High-confidence secret result:** no 64-number keypair JSON arrays, seed
  phrase/mnemonic content, known API-token formats, keyed RPC URLs, or committed
  `.env` files were found in added history lines. No current-tree keypair or
  keystore files are tracked.
- **Test command observed during this audit:** `npm test` did not run because the
  checkout has no installed `vitest` binary (`sh: 1: vitest: not found`). The
  documented checkpoint remains **1,906 JavaScript/TypeScript tests across 65
  files**, recorded in `docs/STATUS.md` on 2026-09-18 and re-measured by the parent
  agent on 2026-09-23 as 1,906/65 passing. This must be re-run from a dependency-
  complete checkout before the repository is presented as green.

## Secret and sensitive-data checks

The scan inspected additions from every reachable commit, not only the current
checkout. It checked for:

- 64-integer Solana keypair JSON arrays;
- seed phrases, mnemonics, recovery phrases, and private-key assignments;
- common provider/API token formats (`sk-`, GitHub tokens, Slack tokens, AWS
  access-key prefixes, Google API-key prefixes, and similar);
- `.env` filenames and secret-looking environment assignments;
- RPC URLs containing query-string keys or tokens;
- email-address and phone-number patterns as personal-information indicators.

### Findings

| Area | Result | Action |
|---|---|---|
| Solana private keys/keypair arrays | No high-confidence match | No history rewrite required for this category. Keep `.keys/`, deploy keypairs, keystores, and wallet material ignored. |
| Seed phrases/mnemonics | No high-confidence match | Continue the existing policy: never request, store, or transmit them. |
| API keys/tokens | No high-confidence match | Re-run a dedicated scanner after dependencies/build artifacts are excluded and before publication. |
| RPC credentials in URLs | No high-confidence match | Keep RPC endpoints keyless in source and provide credentials only through local tooling if ever needed. |
| `.env` content | No committed `.env` path found in the history filename scan | Preserve `.env.*` ignore rules and keep only a reviewed `.env.example`, if one is needed. |
| Personal information | Commit metadata includes a developer email (`el@…dev`); active/history docs use the first name “Jack” and local paths such as `~/projects/preflight` | Decide whether the author identity and personal/internal references are acceptable. Scrub active docs before publication; rewrite metadata only if the owner wants a history-cleanup project. |

The repository contains public devnet addresses, test mint addresses, and an
upgrade-authority address in documentation and source. These are identifiers,
not private keys; nevertheless, label the deployment as devnet-only and rotate or
retire any devnet authority that should no longer be used.

### Remediation recommendation

**No credential-driven history rewrite is indicated by this scan.** Do not rewrite
history merely because old commits exist. Before changing visibility, run an
independent scanner in a dependency-complete environment, inspect the scan output
for false negatives, and verify that no ignored local files are staged:

```bash
git status --short
git ls-files | grep -E '(^|/)(\.env|.*-keypair\.json|.*\.(jks|p12|p8|pem|key))$'
git log --all --full-history --name-only -- .env .env.* .keys deployment '*keypair.json'
```

If a real credential is found later, revoke/rotate it first, then use a separately
approved history-remediation procedure. Do not force-push or rewrite `main` as part
of this draft.

## Outsider-facing hygiene findings

### Active checkout

| Path or reference | Why it may be confusing or non-product | Recommendation |
|---|---|---|
| `sketches/consumer-pivot/` | Contains concept comparisons and multiple abandoned names/variants, including screenshots and HTML sketches. | **Remove from the public release** or move to a clearly labelled design archive. Keep only if the submission explicitly wants to show iteration. |
| `spikes/001-anchor-mwa-compatibility/` and `spikes/002-client-progress-boundary/` | Feasibility spikes are useful engineering history but are not part of the judge-facing product. | **Remove or archive** before publication. Do not present spike code as supported app behavior. |
| `docs/IMPLEMENTATION_PLAN.md` and `docs/plans/*` | Internal execution plans contain schedule pressure, unresolved organizer questions, private workflow references, and implementation archaeology. | **Keep private or move to an internal archive.** Publish only a cleaned roadmap and the judge-facing drafts. |
| `docs/STATUS.md` | Accurate but includes internal filesystem paths, personal-device details, wallet setup notes, and operational blockers. | Keep a public status document only after removing internal paths, personal names, wallet provisioning details, and any instructions that could invite access to personal wallets. |
| `README.md` | Current README is technically useful but still mentions a private repository wallet URI and internal Hub documentation. | Replace its public-facing copy only after this draft is reviewed; do not overwrite it during this task. |
| `deployment/` ignore rule and local `.keys/` policy | Correct safety boundary, but public contributors need an explicit explanation of how to configure a fresh devnet deployment without copying private material. | Retain the ignore rules and add sanitized setup guidance to the final public README. |

### History and ref names

The Git graph retains retired product material and internal naming:

| Evidence | Finding | Recommendation |
|---|---|---|
| `b289c2565735` (`archive/main-preflight-bootstrap`) | Archive tag points to the early Preflight product. | Do not delete it casually; decide whether public history should retain a historical archive. If not, perform an owner-approved history cleanup before publication. |
| `6a537312d0e5` (`archive/preflight-vertical-slice`, also a feature branch tip) | History includes the former Preflight source and its tests. | Current tree is clean of those source paths, but public Git history will still reveal them. Label or remove through a deliberate history policy, not an ad hoc force-push. |
| `8a08fd934ebd` | Adds consumer-pivot sketches and the rebuild plan. | Remove/archive the files from the public tip; retain history only if the team is comfortable showing product exploration. |
| `ec9f20399542` and `bfc524a24108` | Add the MWA compatibility spike and its generated Rust workspace. | Remove/archive from the public tip; no secret finding was associated with these commits. |
| `d3bd3a8ae5f9` | Current status/docs still expose internal process references and personal-device context. | Scrub the public documentation in a separate reviewed cleanup commit. |

The branch and tag names themselves also expose internal history (`spike/*`,
`archive/*preflight*`, and feature branches). This is not a security finding,
but it is not polished public presentation.

## Recommended publication gate

Before making the repository public:

1. Create a clean public-facing documentation set from the drafts in
   `docs/submission/`; remove or archive sketches, spikes, and internal plans.
2. Scrub private repository URIs, local filesystem paths, personal names, wallet
   provisioning details, and internal organizer deliberations from active docs.
3. Confirm that the MWA identity URI points to a public HTTPS origin, not the
   private repository.
4. Run `npm ci` in a disposable checkout, then run `npm test`, `npm run typecheck`,
   `npm run doctor`, and the Android export/build checks. Record actual output.
5. Run an independently installed/approved secret scanner and this history scan
   again after the cleanup commit.
6. Verify that only devnet identifiers and valueless TEST assets appear in the
   public demo instructions; do not publish private wallet material or valuable
   signing credentials.
7. Have the owner explicitly choose between preserving historical product commits
   and an approved history rewrite. A rewrite is **optional for presentation**,
   not required by the findings in this audit.

## Audit limitations

The regex scan is a defense-in-depth check, not proof that a repository is safe.
It does not replace provider-specific detectors, manual review of binary assets,
or revocation of credentials that may have been exposed outside Git. The missing
`vitest` dependency also means this worktree did not independently reproduce the
historical test count.
