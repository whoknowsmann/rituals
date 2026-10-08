# Release v0.1.0-clockin: Rituals for CLOCK IN

Show up, or pay up. Put a stake on a weekly promise; stamp it to keep it; miss it and that week's stake goes where you chose. Rituals takes nothing.

Devnet only. tSKR tokens have no value.

## What's in this build
- Start a ritual in two steps with one wallet approval. Pick 1 to 16 weeks (2 is the default on Demo speed, 4 on Real weeks) and one total stake: type it, or tap 5, 10, 20 or 50. The app splits it evenly across the weeks. The approval creates the ritual, locks every week's stake, activates it, and pre-pays the app's settle key.
- You choose where a missed week goes: Northside Food Bank, City Animal Shelter, Public Library Fund (all labelled demo), or a wallet you choose.
- After Lock it in, the app goes straight to the ritual screen, with countdowns: "Week 1 opens in 32s", then "32s left".
- HOLD TO STAMP: hold for 1.4 seconds, approve once, add an optional note that stays on the phone. Then confetti and YOU SHOWED UP!
- Weeks close by themselves on the ritual screen, with no wallet prompt. Every closed week on the punch card opens its receipt: KEPT ("10 tSKR back to you", with your note) or MISSED ("10 tSKR went to City Animal Shelter (demo).").
- Demo speed (the default): 1-minute weeks. Week 1 opens 60 seconds after Lock it in; 45 seconds to stamp, 10 seconds of grace. Real weeks: 7-day weeks, stamp any day in the first 6.
- Reminders on Real weeks: when a week opens, with one day left, and in the last hour. Scheduled on the phone, no server.
- Get test tokens in the app: the faucet sends 0.05 devnet SOL + 50 tSKR, nothing to sign.
- Seed Vault Wallet and Phantom; night mode. Seed Vault Wallet shows the request as coming from Rituals at rituals.whoknowsman.com.
- 2,420 TypeScript tests and 206 native program tests.

## Install
1. Download `rituals-v0.1.0-clockin.apk` below and install it on a Solana Seeker. Seed Vault Wallet and Phantom are both offered as wallets.
2. In Seed Vault Wallet, go to Settings → Network → Devnet before you open Rituals.
3. Open Rituals, connect, start a ritual, and tap **Get test tokens** on the create screen (or in Settings) if your wallet is short. Then Lock it in. Seed Vault doesn't recognize the site yet, so tick "I trust this site" when you approve.

sha256: `<sha256 of the APK>`
Built from commit `<sha>` on `main`. Program `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` (devnet).

Known limits: devnet only; the clock never pauses on Demo speed, so weeks you are away for are missed, and a missed demo week is only sent while that ritual's screen is open; a wallet you choose as the destination must already hold a tSKR account; stamps are self-reported; stamp notes stay on the phone.
