# Rituals privacy policy and dApp Store listing (DRAFT)

**Draft status:** prepare for owner/legal/publisher review before any public release.
This is product documentation, not legal advice. Replace the bracketed contact and
jurisdiction fields before publication.

- **App:** Rituals
- **Operator/contact:** `[owner or legal entity and privacy contact]`
- **Effective date:** `[date of public release]`
- **Scope:** the devnet hackathon prototype and any release that keeps the same P0
  data boundary

## Privacy policy draft

### 1. What Rituals does

Rituals is a mobile commitment device for private groups. Members choose a recurring
commitment, connect a wallet through Mobile Wallet Adapter, sign claims, and ask
friends to confirm those claims under a locked rule. The current P0 prototype uses
Solana devnet and valueless TEST assets.

### 2. Data we process

#### Public onchain data

When a user authorizes a transaction, the Solana network can publicly record the
wallet public key, ritual and event accounts, rule digest, member order, threshold,
amounts, activation-fee terms, claims, confirmations, signatures, settlement state,
and transaction metadata. Onchain data is replicated by the network and cannot be
removed by Rituals.

A wallet signature identifies the wallet that signed a transaction. It does not
prove that a user read, practiced, attended, or completed an activity in the
physical world.

#### Local device data

The P0 app may keep the minimum local state needed to render the experience, such
as a display title, human-readable requirement, bounded invitation metadata, an
optional completion note, local notification scheduling, and in-progress UI state.
Invitation metadata is treated as untrusted until its digest matches the onchain
rule. The app should not put private group discussion or sensitive evidence onchain.

#### Wallet and RPC interactions

The app sends public transaction/account requests to the selected Solana cluster
and asks the user’s wallet to authorize and sign. Rituals does not receive or store
seed phrases, private keys, wallet passwords, or keystores. The selected wallet and
RPC infrastructure may process the public transaction data required to answer the
request; consult those providers’ policies separately.

#### Data we do not request in P0

The current prototype does not require a Rituals account, email address, phone
number, contacts, precise location, camera, microphone, photos, video, voice notes,
chat, hosted evidence upload, or an always-on server account. There is no Rituals
backend custodying funds or maintaining a user profile.

Before publication, inspect the release build for analytics, crash reporting,
remote configuration, or other SDK collection. If any is added, this section must
be updated before store submission.

### 3. Why we use the data

- To display the commitment, terms, threshold, and event state locally.
- To construct and present the exact transaction a user chooses to sign.
- To read confirmed program state and show an authoritative receipt.
- To schedule local reminders if the user enables them.
- To validate that invitation metadata matches the locked rule digest.

Rituals does not use a signature as an automated truth verdict and does not sell
personal information.

### 4. Sharing and public visibility

Onchain ritual data is public because it is written to Solana. Wallets and RPC
providers receive the public keys, accounts, instructions, and transaction data
needed for authorization, submission, confirmation, and readback. The current P0
product has no Rituals-operated hosted database or advertising network.

A future version that adds notifications through a service, private evidence,
chat, analytics, or user accounts must identify those processors, limit retention,
provide deletion and reporting controls where applicable, and update this policy
before release.

### 5. Retention and deletion

Rituals cannot delete or correct data already committed to a public blockchain. A
user can remove local display state and notification data through the app’s local
controls or by clearing app data/uninstalling the app, subject to the wallet and
operating system’s behavior. Local invitation text and notes should not be uploaded
by the P0 app; if a later version stores them remotely, the policy must specify the
retention period and deletion process.

### 6. Security boundaries

Rituals uses Mobile Wallet Adapter for wallet authorization and signing. Users must
review the cluster, mint, stake, activation fee, recipients, and threshold in the
wallet/app flow before signing. Use fresh devnet accounts for the prototype. Never
enter a seed phrase or private key into Rituals.

Devnet TEST assets have no intended real-world value. Mainnet and valuable assets
remain gated on independent program review, legal and publisher-policy review,
privacy controls, dispute design, operational monitoring, and a wallet-signed
acceptance pass.

### 7. Children and sensitive use

The prototype is not designed for children and should not be used with valuable
funds or sensitive evidence. Stakes should remain modest and rules should be clear.
Do not use Rituals to expose health, location, attendance, employment, education, or
other sensitive information in a public ritual. Confirm the required age, financial,
contest, gambling, and publisher disclosures with counsel and the publisher before
mainnet or store release.

### 8. Changes and contact

We will update this policy when the data boundary changes and will update the
Effective date above. Privacy questions should go to `[privacy contact]`.

## dApp Store listing copy

### Suggested category

**Primary:** Productivity / Lifestyle, subject to the categories available in the
publisher portal. The listing should describe Rituals as a commitment device and
self-improvement tool, not as a betting market or a general-purpose financial app.
The legal/publisher classification remains a review item.

### Short description

**Commit to it together.**

The short description is intentionally within the dApp Store’s 30-character limit
for short descriptions.[2]

### Long description

**Show up, or pay up.** Rituals helps a private group make a recurring commitment
harder to skip.

Choose a ritual—read, study, practice, attend, call family, or create. Set the
schedule, equal event stake, and confirmation rule before anyone signs. Each member
funds through a Solana wallet. When you complete an event, sign your claim. A friend
confirms it under the group’s rule. The purpose-built program returns your event
allocation when the threshold is reached and produces a clear receipt.

Rituals is a commitment device, not a chance-based game. Friends are witnesses, not
rivals: there is no random outcome, no counterparty, and no platform share of
stakes or forfeited allocations. The only protocol revenue is a separate, disclosed
activation fee: 2% of the committed pool, with a 0.50–5.00 USDC-equivalent
minimum/maximum configuration. SKR balance reads can unlock an activation-fee
discount.

This hackathon build runs on Solana devnet with valueless TEST assets. Wallet public
keys, ritual rules, claims, confirmations, and settlement state are public onchain.
The app does not request seed phrases, private keys, contacts, precise location,
camera, microphone, or private evidence in the P0 flow. A signature proves who
attested; it does not independently prove that the real-world activity occurred.

**Devnet only. Do not use valuable funds.** Mainnet support is not enabled and is
gated on legal, publisher-policy, privacy, and independent security review.

### Content and risk disclosures for the listing

Show these disclosures in the listing, first-run screen, and before wallet signing:

- **Network:** Solana devnet only.
- **Asset value:** TEST assets are valueless demonstration assets; no mainnet funds.
- **Wallet action:** users approve transactions in their selected wallet through MWA.
- **Public ledger:** wallet public keys, rules, claims, confirmations, amounts, and
  settlement state are public and durable onchain.
- **Commitment risk:** a future valuable deployment could return less than a member
  contributed for a missed event under the agreed rules; pending/questioned claims
  are not automatically treated as missed.
- **Human-attestation limit:** friends can collude, rubber-stamp, delay, or disagree;
  blockchain signatures do not prove the physical activity.
- **Fee disclosure:** activation fee is separate from stake and network fees; the
  protocol takes no percentage of forfeited allocations.
- **Classification:** Rituals is presented as a commitment device. Legal and
  publisher classification for valuable assets is not asserted by this prototype.
- **Privacy boundary:** no account, email, contact, precise-location, camera, or
  hosted evidence collection in P0; verify the shipped APK for any added SDKs.

## dApp Store publisher checklist

The following requirements were verified against the Solana Mobile documentation
pages linked in the Sources section.

### Account and submission setup

- [ ] Create the publisher account and complete the required publisher profile and
      KYC/KYB verification.[1]
- [ ] Connect a publisher wallet through a browser-extension wallet and retain
      access to it for future submissions.[1]
- [ ] Budget publisher-wallet SOL for transaction fees and storage uploads; the
      submission guide currently describes approximately 0.2 SOL for fees/uploads,
      subject to the portal’s live estimate.[1]
- [ ] Select and fund a storage provider; confirm whether ArDrive or an own-bucket
      S3 workflow is appropriate for the APK and listing assets.[1]
- [ ] Review the current Publisher Policy, Developer Agreement, and dApp Store
      terms before submitting.[1][5]
- [ ] Confirm that the listing privacy-policy URL is public, stable, and matches the
      shipped APK’s actual data behavior.[6]

### APK and signing

- [ ] Produce a release-ready **signed APK**; the dApp Store accepts APK files and
      the guide provides Expo/EAS APK configuration.[3]
- [ ] Keep the release keystore and passwords outside Git, with a tested backup.
      Losing the key prevents future updates.[3]
- [ ] If a Google Play build also exists, use a separate dApp Store signing key;
      the same key must not be reused across the two stores.[3][4]
- [ ] Verify the artifact with `apksigner verify --print-certs <apk>` before upload.[3]
- [ ] Confirm package name, version name, monotonically increasing version code,
      MWA identity, and public HTTPS origin.
- [ ] Install the exact APK on a physical Seeker and exercise the release build,
      not only an Expo/Metro export.

### Listing assets

- [ ] App icon is 512×512 pixels.[2]
- [ ] Short description is no more than 30 characters.[2]
- [ ] Long description explains the use case and the actual data/risk boundary.[2]
- [ ] Preview video is MP4 and at least 720×720; 1920×1080 is recommended.[2]
- [ ] Screenshots are at least 1080 pixels in width and height, use one consistent
      orientation, and share an equal aspect ratio.[2]
- [ ] Screenshots show the Seeker hero loop, exact fee/risk disclosure, and the
      devnet/no-real-value label; do not show fabricated metrics or fixture screens
      as settled transactions.
- [ ] Include the privacy policy, support contact, public source repository, demo
      video, and pitch deck links in the final submission package.

### Portal and review

- [ ] In the Publisher Portal, add a new dApp, save metadata, create a new version,
      upload the APK/assets, and approve the required wallet messages and
      transactions.[1]
- [ ] Preserve the publisher wallet and signing key used for the first submission.
      Future releases need the same signing key.[3]
- [ ] Keep a copy of the submitted metadata, APK hash, screenshots, and transaction
      signatures for release records.
- [ ] Allow review time: the submission guide says review results are sent to the
      developer email within 3–5 business days.[1]
- [ ] Do not submit until MWA phone signing, the visible two-wallet lifecycle, and
      all disclosures are verified. If the release still has fixture-backed screens,
      label the scope plainly.

## Sources

[1] https://docs.solanamobile.com/dapp-store/submit-new-app
[2] https://docs.solanamobile.com/dapp-store/listing-page-guidelines
[3] https://docs.solanamobile.com/dapp-store/build-and-sign-an-apk
[4] https://docs.solanamobile.com/dapp-store/publishing-from-google-play
[5] https://docs.solanamobile.com/dapp-store/publisher-policy
[6] https://docs.solanamobile.com/dapp-store/privacy-policy
