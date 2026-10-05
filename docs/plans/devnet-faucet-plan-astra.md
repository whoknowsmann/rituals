# Devnet faucet plan — October 5, 2026

## 1. Recommendation in five lines

Use Oracle Micro: one Node service, SQLite ledger, systemd, and Caddy HTTPS.
Give each address 50 TEST plus 0.05 devnet SOL per rolling 24 hours, without wallet approval.
Preload 3 SOL and 5,000 TEST; never deploy the mint authority.
Use a free DuckDNS hostname if available; retain manual email fulfillment as fallback.
Budget five hours plus a short owner session; ship before Wednesday October 7, 8 pm CDT.

## 2. Three designs compared

| Design | Advantages | Disadvantages | Estimated total |
|---|---|---|---|
| Oracle Node + Caddy | Existing VM; familiar `@solana/web3.js`; durable atomic ledger; simple operations | Hostname, TLS, patching; small VM vulnerable to traffic floods | 4–5 hours |
| Cloudflare Worker + secret | Managed HTTPS on workers.dev; no domain purchase; edge ingress | Signing/bundling compatibility work; needs Durable Object or transactional D1, not eventually consistent KV, for caps; provider quotas require verification | 5–7 hours |
| Email/DM + owner script | No public hot key; zero service build | Judge waits for owner; address-copy friction; must deliver SOL as well as TEST | Zero infrastructure; 15–30 minutes to document/test existing manual path |

GitHub Pages cannot sign or keep secrets. An on-chain faucet alone cannot serve a zero-SOL wallet: transactions still need a funded fee payer, and token-account creation needs rent. A sponsored transaction requires an off-chain signer/service anyway.

## 3. Recommended design

Proposal only. Follow the setup scripts’ explicit dedicated signer/devnet RPC pattern, without deploying their authority or rerunning initialization. FACTS.md supersedes DEVELOPMENT.md’s older product-state descriptions.

### API and transfers

Implement `services/devnet-faucet/` as an independent package: Node 22, `@solana/web3.js` 1.x, `@solana/spl-token` 0.4.x, `better-sqlite3`, native HTTP; pin tested versions in its lockfile.

- `POST /v1/claims`: JSON `{ "address": "<canonical wallet public key>" }`, maximum 512 bytes; no amount, mint, RPC, or transaction supplied by callers. Reject noncanonical/off-curve addresses and the faucet itself. No wallet signature required.
- `202`: `{ "status":"pending", "claimId":"<random capability>", "signature":"<signed transaction signature>" }`.
- `GET /v1/claims/<claimId>`: pending, confirmed, or failed; confirmed includes signature, `testAmount:"50"`, `solLamports:50000000`. Use unguessable 128-bit IDs; never put addresses in URLs.
- Errors: 400 `INVALID_ADDRESS`, 413 `BODY_TOO_LARGE`, 429 `ADDRESS_LIMIT`/`IP_LIMIT`/`GLOBAL_CAP` with `Retry-After`; 503 `EMPTY`/`DISABLED`/`RPC_UNAVAILABLE`/`BUSY`. JSON shape: `{ "error":"EMPTY", "retryAfterSeconds":300 }`.
- `GET /healthz`: cached `{ "status":"ok|empty|disabled|rpc_unavailable", "cluster":"devnet" }`; 200 only when usable, otherwise 503. No RPC call per health request.

One atomic transaction: `SystemProgram.transfer` of 50,000,000 lamports; `createAssociatedTokenAccountIdempotentInstruction`; `createTransferCheckedInstruction` of 50,000,000 token units, six decimals. Fixed classic SPL mint: `AaHgFh7ussUDor8QfaBCaRz2RHiPNCs7i2yuzdLbt9tc`. Faucet signs, pays fees and recipient ATA rent. Recipient signs nothing. Existing ATAs work unchanged.

At startup verify RPC genesis hash equals devnet `EtWTRABZaYq6iMfeYKouRu166VU2xqa1`; verify mint owner, decimals, source ATA ownership and balance. Recheck on RPC changes; refuse other clusters. Obtain actual rent and fee quotes; reject expenditure above 0.053 SOL per claim. Do not add priority fees initially.

### Durable limits and RPC behavior

SQLite WAL, one signer worker, `BEGIN IMMEDIATE` reservations: one claim/address/24h; five successful or pending claims/IP/24h; 10 requests/minute/IP; 60 requests/minute globally. Normalize IPv4 and aggregate IPv6 /64. Global UTC-day limit: 50 claims and 2.65 SOL including rent/fees and outstanding reservations. Keep 0.10 SOL untouched. Shared judge Wi-Fi can hit the IP cap: offer manual help, not an automatic bypass.

Persist reservations, signed bytes, signature and blockhash expiry before broadcasting. Duplicate address requests return the existing claim. After crashes reconcile pending signatures before accepting more work. Retry only identical signed bytes; never rebuild an uncertain transfer. Release reservations only after definitive failure/expiry reconciliation; unresolved cases stay held. Account for fees even on landed failures. This favors temporary unavailability over double payment.

Follow `resilientRead.ts` bounded backoff, adding jitter and honoring 429s; disable SDK automatic rate-limit retries. Allow one transfer and ten queued requests. Batch confirmation polls; verify successful transaction metadata and both transfers before reporting confirmed.

### Keys, deployment, HTTPS

Owner generates a fresh signer outside the repository, funds its ATA with 5,000 TEST, and checks no real funds were ever held. Deploy only this signer to `/etc/rituals-faucet/hot.json`, root-owned 0600. Always specify CLI signers explicitly.

Register an available free DuckDNS hostname pointing to the public IPv4; Caddy obtains TLS. Otherwise use an owned domain or manual fulfillment. Named Cloudflare Tunnels generally need a controlled domain; temporary URLs are unsuitable. Never fall back to HTTP.

After owner approval, inspect existing services/firewall first. Proposed commands on the micro (Node 22 must be installed/verified separately):

```sh
sudo apt-get update
sudo apt-get install -y caddy build-essential python3
sudo useradd --system --home /var/lib/rituals-faucet --shell /usr/sbin/nologin rituals-faucet
sudo install -d -m 700 /etc/rituals-faucet
sudo install -d /opt/rituals-faucet
# Copy reviewed service package and lockfile, not the entire repository.
cd /opt/rituals-faucet
npm ci --omit=dev
```

Create `/etc/systemd/system/rituals-faucet.service`:

```ini
[Unit]
After=network-online.target
Wants=network-online.target
[Service]
User=rituals-faucet
WorkingDirectory=/opt/rituals-faucet
ExecStart=/usr/bin/node --max-old-space-size=192 server.mjs
Environment=HOST=127.0.0.1 PORT=8787
EnvironmentFile=/etc/rituals-faucet/service.env
LoadCredential=hot.json:/etc/rituals-faucet/hot.json
StateDirectory=rituals-faucet
StateDirectoryMode=0700
Restart=on-failure
RestartSec=5
MemoryMax=320M
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
```

Read signer through `CREDENTIALS_DIRECTORY`; ledger lives in StateDirectory. Environment file specifies fixed devnet RPC and contact. Caddyfile, replacing HOSTNAME with the reserved hostname:

```caddyfile
HOSTNAME {
    reverse_proxy 127.0.0.1:8787
}
```

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now rituals-faucet
sudo systemctl reload caddy
curl --fail https://HOSTNAME/healthz
```

Allow TCP 80/443 in Oracle ingress and existing host firewall; keep 8787 private and SSH Tailscale-only. Preserve established Tailscale rules; do not blindly reset/enable UFW. Trust forwarded IP only from loopback Caddy, with Caddy replacing untrusted incoming forwarding headers.

### App and README

Modify `src/screens/solo/SoloCreateScreen.tsx`; add `src/features/rituals/faucet/useDevnetFaucet.ts` and tests. Beside lines 387–388 show “Get test tokens”, including unknown balances. Use selectedAccount, existing devnet guard, and a public HTTPS URL.

States: idle; requesting (disabled button, bounded polling); sent (confirmed signature and devnet Explorer link); empty (“The faucet is empty — email <owner>”); unreachable (“Faucet unavailable. Retry or email <owner>”). Timeout: “Still checking”, with signature. Show limit retry times; discard stale wallet responses; refresh TEST/SOL after confirmation. Faucet state never gates creation; retain existing balance safeguards.

Replace README step 3 with:

> Connect your wallet, open New ritual, and tap Get test tokens beside your balance. Receive 50 valueless TEST and 0.05 devnet SOL without an approval. Try four weeks at 5 TEST each. Limited to once per address per 24 hours, subject to shared-network and daily caps. If empty or unavailable, email <owner> with your public Devnet address; never send a seed phrase. Manual replies may not be immediate.

### Budget, operations, kill switch

At indicative ATA rent 0.00203928 SOL and fee 0.000005 SOL, 50 fresh judges cost 2.602214 SOL and 2,500 TEST. Verify rent/fees live; load 3 SOL, leaving approximately 0.398 SOL. Start rationed airdrops Monday: 1–5 SOL/day is not guaranteed. At 1/day, three days just covers funding; otherwise use an existing dedicated devnet reserve or announce reduced availability, never promise automatic replenishment.

Top up: `solana airdrop 1 FAUCET_ADDRESS --url https://api.devnet.solana.com`; verify receipt/balance. If refused, use the public faucet manually, without quota evasion. Check health and ledger over Tailscale twice daily and before submission. Low-water thresholds: 0.65 SOL/500 TEST. Manually refill; maximum float 3 SOL.

Journald: request ID, outcome, latency, aggregates only; no personal data or access logs. Ledger: HMAC address/IP identifiers, purge 48 hours after resolution. Protected signed transactions contain public addresses: state is pseudonymous, not anonymous. Kill switch: `sudo systemctl stop rituals-faucet`; no public administration. Broadcast transactions may still land.

## 4. Security review

Rotating addresses/IPs can drain allocations: caps are not personhood. CORS/APK secrets are not authentication. Abuse ceiling: 2.65 devnet SOL/day; stolen key: entire 3 SOL float and TEST. Prohibit automatic refills. Bound bodies, timeouts, queues, memory and logs. Volumetric attacks can overwhelm the VM: stop and fulfill manually. Never hold real SOL or mint authority.

## 5. Test plan

Locally against devnet: fresh zero-balance recipient, absent/existing ATA, exact amounts, failed atomic transaction, depleted inventories, wrong genesis/mint, simultaneous duplicates, forged forwarding headers, restart-before/after-broadcast, UTC rollover, rolling limits, RPC 429/timeout and ambiguous confirmation. Assert durable caps and no duplicate sends. Run `npm test`, `npm run typecheck`, `npm run doctor` and Android export smoke from DEVELOPMENT.md.

On Seeker over cellular: fresh Devnet wallet claims without approval, signature verifies, balance refreshes, four-week Demo ritual creates. Repeat over Wi-Fi; test offline, empty, capped and killed service with an already funded wallet still able to create. Verify HTTPS externally before embedding its URL.

## 6. Time and cut line

Service/ledger/tests: 110 minutes; owner keys/funding: 25; deployment/TLS: 40; app/README: 40; phone/failure checks: 60; buffer: 25. Total: five hours. If durable reconciliation or HTTPS is not proven by hour three, cut to documented manual fulfillment. Cut Settings, dashboards and CAPTCHA first, never caps, key isolation or zero-SOL testing.

## 7. Owner questions

1. Which email may appear publicly?
2. Approve DuckDNS registration, or provide an owned domain?
3. Is 3 devnet SOL available today from a dedicated reserve?
4. Approve package installation and tightly scoped 80/443 ingress?
5. Through which judging date will you monitor and manually fulfill requests?
