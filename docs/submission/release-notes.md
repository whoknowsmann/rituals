# Release v0.1.0-clockin — Rituals for CLOCK IN

Show up, or pay up. Put a stake on a weekly promise; stamp it to keep it; miss
it and that week's stake goes to a cause you chose. Rituals takes nothing.

Devnet only. TEST tokens have no value.

## What's in this build
- Start a ritual in two steps with one wallet approval (creates, stakes every
  week, activates, pre-pays the app's settle key).
- Hold to stamp a week; one approval per week; optional note kept on the phone.
- Weeks close by themselves (settle key); KEPT and MISSED receipts.
- Demo speed (2-minute weeks, default) or Real weeks (7 days, stamp any day
  in the first 6).
- Get test tokens in the app: the faucet sends 0.05 devnet SOL + 50 TEST, no
  signing.
- Seed Vault Wallet and Phantom; night mode.

## Install
1. Download `rituals-v0.1.0-clockin.apk` below and install it on a Solana
   Seeker (or any Android phone with Seed Vault Wallet or Phantom).
2. In Seed Vault Wallet, switch the network to Devnet.
3. Open Rituals, connect, tap **Get test tokens** on the create screen (or in
   Settings), then Lock it in.

sha256: `<sha256 of the APK>`
Built from commit `<sha>` on `main`. Program `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` (devnet).

Known limits: devnet only; the wallet shows the requester as "github.com"
until the app identity moves to its own origin; stamp notes stay on the phone.
