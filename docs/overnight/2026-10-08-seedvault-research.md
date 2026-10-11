# Seed Vault: "I trust this site" and the Devnet popup (research, 2026-10-08, Hermes)

Research only; no app code edited. web_extract is down here (search-only backend): web sources are cited from search
excerpts of the named pages (15/15 searches; 1 failed, 2 empty). Device evidence = our Seeker uiautomator dumps + logcat.
"dump" = ~/.hermes/sessions/request_dump_20261002_101142_fd2a7e_20261004_143528_408970.json; "MWA src" = node_modules/@solana-mobile/mobile-wallet-adapter-protocol/src.

## Findings

Q1. What Seed Vault trusts (applies? · what we'd do · cost · by Mon Oct 12?)
1. It judges the DOMAIN. Sheet text (dump L6333, 2026-10-03 13:50, identity then github.com): "We don't recognize this
   domain and don't know if it's safe. Only sign transactions on sites you trust." github.com was "not recognized" too,
   so this reads as a list of known dApp sites, not web reputation (inference). Seed Vault is closed source (Flutter,
   skill android-device-and-eas-build.md L381); its help center reuses Solflare's text (wallet-help.solanamobile.com/en/
   articles/11727983) and has a separate "Scam Site Detected" block (/11728004). Nothing public says how a domain gets "recognized".
2. Digital Asset Links · spec yes, Seed Vault no. MWA 2.0 spec: the wallet "should check the Digital Asset Link for the
   identity element URI and ensure that the calling package is signed with a certificate listed in an android_app
   statement" (solana-mobile.github.io/mobile-wallet-adapter/spec/spec.html). We meet every precondition (identity
   https://rituals.whoknowsman.com, Google-verified assetlinks.json, wallet launched via startActivityForResult:
   MWA android/.../SolanaMobileWalletAdapterModule.kt L100), yet the box appears every approval (owner, 10-08). $0, no effect; keep it.
3. dApp Store listing · unproven. Only hint: Seed Vault "automatically handles authentication when you open dApps from
   the Solana dApp Store" (solanamobile.com/blog/seed-vault-wallet-solana-seekers-native-mobile-wallet). Cost: portal
   account + on-chain release (docs.solanamobile.com/dapp-store/submit-new-app; fee not found); review queue, inquire
   "if you haven't received a response after 5 business days" (/submit-an-update). Not by Monday (winners publish later, FACTS L203).
4. Scanners (Blowfish, Blockaid) · no source ties either to Seed Vault; a days-old subdomain is "unknown" to any feed. No.
5. Solana Mobile allowlist · none documented. Free: ask Discord #dev-answers, the documented route to staff
   (docs.solanamobile.com/dapp-store/support). Worth asking for later; nothing ships by Monday.
6. SIWS · proves the user's account to the dapp; result = address, signed_message, signature (MWA src/types.ts
   L187-192). Nothing links it to the warning, and it adds a sheet. No.
Verdict: nothing removes the checkbox before Mon Oct 12.

Q2. Any signal for Seed Vault's network
- get_capabilities: limits, transaction versions, features; no network (types.ts L102-119).
- authorize: accounts[].chains is optional (types.ts L5-11); Seed Vault sends null every time (logcat
  "mwa.authorize.chains: null": artifacts/logs/d34-run1-2026-10-08.log L1618, d26 L3502, d29 L3162).
- sign_in: no network in the result (types.ts L187-192); SIWS chainId is what the dapp sends.
- No MWA call reports or switches networks; protocol errors are -1..-5 and -100, none for network (errors.ts L53-61).
- Mismatch path: authorize succeeds, then the transaction sheet blocks: "Network mismatch / Your current network is set
  to mainnet, but this transaction is for devnet. Switch to the correct network before signing." [Close] (dump L6202).
  The app gets java.util.concurrent.CancellationException, same as a decline (d34 L1966); only timeouts differ
  (TimeoutException, L8602). Nothing is sent, so no preflight/simulation error exists either.
Verdict: no reliable signal.

## Recommendation 1: the checkbox. Explain it, don't fight it
No app change. Append to README "Try it" step 3 (L55, after "...at rituals.whoknowsman.com."), same in
submission-form.md and release-notes.md:  It doesn't recognize that site yet, so tick "I trust this site" when you approve.
The sheet records black (skill devnet-faucet-and-judge-access.md L122), so the video never shows it. After judging:
publish to the dApp Store and see if the box goes away; ask #dev-answers meanwhile.

## Recommendation 2: the Devnet popup. (c) Drop it
- (a) Yes/no at Connect: better spot than today's popup (that one sits between prepare and approval, so leaving to switch
  ages the prepared transaction, ~60 s window, FACTS L142), but it still stops users already on Devnet, [How?] needs a
  second alert, and the create/Settings choosers already say "Set your wallet to Devnet." (SoloCreateScreen.tsx L480,
  SettingsScreen.tsx L52).
- (b) After the first Seed Vault cancel: a mismatch IS a cancel to us, so it also fires after a plain decline or the
  reported cold-start wrong-network sheet (skill android-device-and-eas-build.md L212-214, unconfirmed); Jack already
  called a popup after a decline out of place (same file L200-202); and it repeats Seed Vault's own sheet.
- (c) Seed Vault's sheet is the popup Jack asked for: "show up only if there is a network mismatch … if they have to
  click out of a pop up they will absolutely know" (~/.hermes/pastes/paste_1_073955.txt). It shows only when wrong,
  names both networks, must be closed; our screen then says "Not sent · Nothing was sent. Try again." (createMachine.ts L256-261).
- (d) Dropped: show only to wallets with no devnet history (extra RPC, still a guess); make the chooser line an order.
Recommend (c). In-app copy: none. Trigger: Seed Vault's own sheet. It also makes README L54 ("nothing in the app warns
you") true again. Add the path there (from today's popup, devnetHintOnce.ts L19): "In Seed Vault Wallet, go to Settings →
Network → Devnet before you open Rituals." (rest of L54 unchanged; same in submission-form.md and release-notes.md step 2).
Code: src/utils/useMobileWallet.tsx `session` (L83-87) always returns `start()`, drop the import (L9); delete
src/utils/devnetHintOnce.ts + test; make useMobileWallet.devnetHint.test.ts pin "no Alert before a Seed Vault send",
keeping its explicit-chains case (L118-125); drop needsDevnetSwitchHint (walletChoice.ts L38-45) if unused. Explicit-chains
alert stays. ~30-45 min with tsc + vitest; low risk (one await removed before transact; session guard untouched).
Phone: one Seed Vault approval on Devnet, no popup; if time, one on Mainnet.
Fallback if Jack wants a nudge: (a) once, before connect when Seed Vault is chosen (WalletChoiceButtons `choose`,
TopBarWalletMenu `connectWith`): "Is Seed Vault on Devnet?" [How?] [Yes]; How? → "Settings → Network → Devnet." [OK]
