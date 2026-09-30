# Development

Last reconciled with docs/STATUS.md: 2026-09-30.

## Current state

Rituals is the active product, solo first (one promise, weekly stake slices, a locked destination for a missed week, optional witness, one declared skip), with group mode ("With friends") as the secondary path and app-wide Seasons. Home, detail, claim, confirmation, and receipt screens read authoritative chain state. The solo create journey bundles create + fund + activate into one wallet approval; the group create/review → roster → funding-lobby journey submits a **real** Create transaction against the devnet deployment. Current state and the next gate are in `docs/STATUS.md`.

The Anchor program is **deployed to devnet** (`2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p`, solo + Seasons build at slot 504946601) and approved through terminal vault closure. The typed mobile client implements RPC reads, all-action preparation (including `create_solo_ritual` and `declare_skip`), exact message/signature binding, an opaque split submission/confirmation boundary, MWA submission, confirmation, and authoritative readback. The deployment configuration is `deployed`. Cancel and Close are proven on devnet by script but have no screen wiring. Submitted-action handles are process-local capabilities; never persist or reconstruct them as authority after reload.

MWA signing was proven on a physical Seeker for the group flow (2026-09-25/26). The solo flow with wallet signatures has not been run on a device yet. [PENDING PHONE TEST: solo signature / screenshot]

The JavaScript/TypeScript source contains only active Rituals app code plus generic shell, cluster, and wallet plumbing. The retired product is preserved only by Git history.

## Setup

```bash
npm ci
```

Do not run `npm audit fix --force`; Expo, React Native, navigation, Solana, and native modules are version-coupled.

## JavaScript quality gates

```bash
npm test
npm run typecheck
npm run doctor
```

The hygiene test scans active `App.tsx` and `src` for the archived product name and deleted imports. Keep it green when adding screens or routes. The exact test total is measured from the current checkout; do not copy historical totals into status claims.

## Android bundle smoke test

```bash
rm -rf .verify/expo-export
npx expo export --platform android --output-dir .verify/expo-export
rm -rf .verify/expo-export
```

This proves Metro can emit an Android JavaScript bundle. It is not an APK, native-module test, wallet test, or standalone release proof. Expo Go cannot load native Mobile Wallet Adapter.

## Wallet and build identity

MWA authorization uses Rituals on Solana devnet. The wallet URI is still the private repository URI until a public HTTPS origin exists. The Expo slug, Android package, iOS bundle identifier, and EAS project ID remain unchanged legacy build identifiers; do not change them as part of this product migration without a separate build-linkage decision.

Use a custom development or standalone Android build for native MWA checks. Every future state-changing action must show its exact effect, request MWA authorization, wait for confirmation, read back the target state, and mark success only from observed state.

## Native boundary

Rust, program tests, Cargo, and Anchor files are maintained independently from this JavaScript/docs migration. Run their pinned commands only when working on that boundary. Existing local/native artifacts and placeholder IDs are not deployment credentials or production proof.

## Troubleshooting

### WSL: Node scripts fail against devnet, but curl and the solana CLI work

Symptom: a Node script that talks to devnet (for example `scripts/*.ts` run with `npx tsx`) fails with `RPC request failed` or `UND_ERR_CONNECT_TIMEOUT`, while `curl` and the `solana` CLI reach the same RPC URL without trouble.

Cause: the WSL DNS proxy hangs on IPv6 (AAAA) lookups. Node's resolver waits on them and the connection times out. `curl` and the Solana CLI fall back to IPv4 quickly.

Fix: force IPv4 lookups in Node with a small preload. Save this as `ipv4-first.cjs` (anywhere outside the repo is fine):

```js
const dns = require('node:dns');
const lookup = dns.lookup;
dns.lookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    return lookup(hostname, { family: 4 }, options);
  }
  const opts = typeof options === 'number' ? { family: options } : { ...options };
  return lookup(hostname, { ...opts, family: 4 }, callback);
};
```

Then run scripts with it preloaded:

```bash
NODE_OPTIONS="--require ./ipv4-first.cjs" npx tsx scripts/verify-devnet-config.ts
```

`--dns-result-order=ipv4first` does not fix this: Node still sends the AAAA query and waits for it. Verified 2026-09-30 on WSL: without the preload `scripts/verify-devnet-config.ts` failed on every attempt; with it, the script passed in about 4 seconds.

## TDD and hygiene

For new behavior: write a focused failing test, run it, implement the minimum, run the focused test, run the relevant suite, then refactor while green. Never add secrets, wallet material, keystores, tokens, or unsanitized device logs.

## Git workflow

Keep the repository private, make coherent commits, do not push without authorization, and use Git history as the rollback boundary for archived product work. Stage only the paths owned by the current change.
