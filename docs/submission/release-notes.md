# Release v0.1.0-clockin: Rituals for CLOCK IN

Show up, or pay up. Put a stake on a weekly promise; stamp it to keep it; miss it and that week's stake goes where you chose. Rituals takes nothing.

Devnet only. tSKR tokens have no value.

## What's in this build
- Start a ritual in two steps with one wallet approval. Step 1: a name, and optionally what counts as showing up. Step 2: 1 to 16 weeks (2 is the default on Demo speed, 4 on Real weeks) and one total stake: type it, or tap 5, 10, 20 or 50. The app splits it evenly across the weeks at full token precision (20 over 6 weeks locks 19.999998); every amount on screen rounds to 2 decimals. The approval creates the ritual, locks every week's stake, activates it, and pre-pays the app's settle key.
- You choose where a missed week goes: Northside Food Bank, City Animal Shelter, Public Library Fund (all labelled demo; on devnet they pay into the test-token faucet), or a wallet you choose.
- After Lock it in, the app goes straight to the ritual screen, with countdowns: "Week 1 opens in 32s", then "32s left".
- HOLD TO STAMP: add an optional note that stays on the phone, hold for 1.4 seconds, approve once. Then confetti and YOU SHOWED UP!, with one of 20 lines; a ritual never repeats one.
- Weeks close with no wallet prompt, run by the app's settle key while Home or the ritual screen is open. Every closed week on the punch card opens its receipt: KEPT ("10 tSKR back to you", with your note) or MISSED ("10 tSKR went to City Animal Shelter (demo)."). A finished ritual shows one totals line, for example "10 of 20 tSKR back · 10 tSKR to City Animal Shelter (demo)".
- Home: one tile per ritual with a dot for each week and "X of Y tSKR back". Finished rituals sit under "Finished · N". Home shows only the connected wallet's rituals.
- End early (Settings → Your rituals): one approval returns everything you haven't missed ("Back to you"). A week that has just closed unstamped shows as "Missed week, sent" and goes to the destination in the same transaction.
- Demo speed (the default): 90-second weeks. Week 1 opens 60 seconds after Lock it in; 60 seconds to stamp, 10 seconds of grace, 20 seconds before the next week opens. Real weeks: 7-day weeks, stamp any day in the first 6.
- Reminders, scheduled on the phone with no server: Real weeks get three a week (opens, one day left, last hour), Demo speed one when each week opens. Settings has a Remind me switch; Android lists four notification channels (Week opens, One day left, Last hour, Demo weeks).
- Get test tokens in the app (Home, the create screen, Settings): the faucet sends 0.05 devnet SOL + 50 tSKR, nothing to sign.
- Seed Vault Wallet; night mode. Seed Vault Wallet shows the request as coming from Rituals at rituals.whoknowsman.com.
- 2,930 TypeScript tests and 224 native program tests.

## Install
1. Download `rituals-v0.1.0-clockin.apk` below and install it on a Solana Seeker.
2. In Seed Vault Wallet, go to Settings → Network → Devnet before you open Rituals.
3. Open Rituals, tap Connect, and on Home tap **Get test tokens** if your wallet is short. Then **Start one** and Lock it in. Seed Vault doesn't recognize the site yet, so tick "I trust this site" when you approve.

sha256: `6b898473b768be5473da6b09117b09332519f6c2b5c8287e124185295b9e14ad`
Built from commit `395dae2` (local build d45, 2026-10-11). Program `2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p` (devnet).

Known limits: devnet only; nothing runs while the app is closed, so a missed week's money moves the next time the app is opened; the clock never pauses on Demo speed, so weeks you are away for are missed; Seed Vault Wallet has to be set to Devnet; a wallet you choose as the destination must already hold a tSKR account; stamps are self-reported; stamp notes stay on the phone.
