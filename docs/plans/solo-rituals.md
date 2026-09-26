# Solo rituals — design proposal (2026-09-25)

Status: **approved for submission scope (2026-09-25)**. Jack chose: solo in submission; default missed-stake destination = cause/charity-style beneficiary; non-staking witness in v1; one declared skip per ritual; cohorts design-only/coming soon for submission. Supersedes the "P1, not P0" note in the Hub's `Product and MVP Scope.md`.

## 1. Why

A large share of users have no crew of 2–6 people who will all stake and
confirm. Today they cannot use Rituals at all: the program requires 2–6 funded
members (`lib.rs:70`). Solo has to be a first-class path, not a degraded group.

## 2. What solo breaks, precisely

Groups get two things for free from friends. Solo has neither:

1. **An oracle.** Friends confirm you showed up. Alone, you are the only witness.
2. **A place for missed stake to go.** Forfeits split among confirmed members.
   Alone, there is nobody. And the current settlement treats "nobody confirmed"
   as **void → full refund** (`derive_event_settlement_plan`, `lib.rs:961`),
   so a solo miss today would cost nothing. A commitment device with no cost is
   not one.

Rules that still hold (Hub, Product Framing): Rituals never receives missed
stake; nothing implies chance or profit from others failing; an unresolved
claim is never converted into a forfeit by default.

## 3. Proposed solo model

**One person, their own stake, a locked destination for misses, and a choice of
how honest to be with themselves.**

### Who confirms — three levels, chosen at create

| Level | How a check-in counts | Needs program change |
|---|---|---|
| **Just me** (honor) | You check in inside the window. Miss the window and that week's stake goes to your chosen destination. | Yes (1 member) |
| **One witness** | Someone you trust (partner, coach, sibling) approves. They **don't stake** and never receive money, so they have no reason to lie. | Yes (non-staking witness) |
| **Proof** (later) | The app gates "I showed up" on on-device evidence, e.g. Health Connect steps or a workout. Helps you stay honest; it's not an oracle. | No (client-side) |

"One witness" is the key unlock: most people don't have a crew, but almost
everyone has *one* person. It keeps Rituals' core idea (a human confirms)
without asking that person to put money in.

### Where missed stake goes — locked before funding

- **A cause you pick** (default). The StickK/Beeminder pattern and the cleanest
  story: "miss a run, $5 goes to the food bank." Devnet uses a clearly labelled
  demo beneficiary account; a real donation rail is a mainnet-gate item.
- **A person you pick** (e.g. "my sister gets it"). Simple and personal.
- Never Rituals. Never a stranger pool.

### Settlement for solo

| Outcome | Result |
|---|---|
| Checked in (and witness approved, if any) | Your stake for that week comes back |
| Didn't check in by the deadline | That week's stake goes to the destination |
| Checked in, witness never answered | Void → refund (no confiscation by an absent witness) |
| Witness questions it | Void → refund (P0; no dispute resolution) |

Optional, cheap, and backed by the streak research (freezes → ~4.5× longer
streaks, Trophy 2026): **one declared skip per ritual**, declared before the
window opens, refunds that week. Makes the product humane without making it
toothless.

## 4. App-wide rituals ("solo, not alone")

Cohorts: everyone runs the **same template and schedule** (e.g. "Run 3× a week,
October"), each person solo with their own stake and destination. The social
layer is motivational only: see how many people in your cohort showed up today.

Critically, **forfeits do not go to the cohort**. Pooling strangers' losses is
betting-adjacent and gives attesters a reason to lie; it's exactly what the
product framing rules out. Cohort members never confirm each other.

Cohorts need a way to list participants (an onchain cohort account or an
indexer) plus moderation if any free text or photos appear. **Recommend P2**:
solo first, cohort as designed-and-teased, built after submission.

## 5. Build scope and cost

Program (we hold devnet upgrade authority, `ETQ9…hXbx`):

- allow `members.len() == 1` when `ritual_kind == Solo`;
- optional `witness: Option<Pubkey>` on the ritual; `approve_claim` accepts the
  witness for solo; the witness never appears in payouts;
- `forfeit_destination` token account, locked in the rule digest at create;
- solo settlement branch: unclaimed → destination; pending/questioned → void;
- (optional) `declare_skip` before `claim_opens`.

Tests: extend native program tests for each settlement row; client builders +
decoders; a devnet smoke for solo create → claim → witness approve → settle and
create → miss → settle-to-destination.

App (in the Crew design): "Just me / With one witness / With friends" as the
first choice in Create; destination picker; solo home card (same poster, one
member tile, witness chip).

Rough effort: program + tests + redeploy **1.5–2 days**, client + screens
**1–1.5 days**. The deadline is 2026-10-09 (14 days), so it fits, but it
competes with the redesign and the MWA gate.

## 6. Jack's decisions (2026-09-25)

1. **Solo at submission:** yes. It is now in hackathon scope.
2. **Default destination for misses:** cause/charity-style beneficiary.
3. **Witness in v1:** yes, as a non-staking witness option.
4. **Declared skip in v1:** yes, one per ritual.
5. **Cohorts:** design-only / "coming soon" for submission; build after.

## 6b. Jack's decisions (2026-09-26) — solo FIRST

Supersedes "solo in scope" with "solo is the product":

1. **Solo is the primary path.** Assume the user has no crew. Groups stay as a
   secondary create option ("With friends").
2. **Default check-in is honor** ("Just me"): hold → stamp. Optional
   accountability on any solo ritual: one non-staking witness, or photo/note
   proof.
3. **Miss destination:** offer both, **cause selected first**, person second.
4. **Seasons at submission: real.** A live counter ("N people ran today") and
   join-a-season, backed by real onchain state. Each participant is solo with
   their own stake and destination; forfeits never pooled; participants never
   confirm each other; no money leaderboards. Small honest numbers are fine.
5. **Visual direction:** Proof & people structure + Hand-made texture/stamps
   (handwriting only at commitment moments). Combined sketch:
   `sketches/ui-2026-09-26-solo/`.

Implication: Seasons need something onchain to count (a season id on the
ritual and/or a season account). Since the solo deploy already changes the
Ritual layout, add it in the **same** redeploy so we break devnet data once.

## 7. Sequencing proposal

1. MWA gate: one Create signed in Phantom (needs Jack, ~5 min).
2. Finish the Crew redesign scaffolding (theme, fonts, kit — mostly done).
3. Solo program change + tests + devnet redeploy.
4. Rebuild Create/Home/Check-in screens once, in the new design, covering solo
   and group together, instead of redesigning the old group screens first.

## 8. On-chain implementation status

The program slice is implemented on `feat/solo-program` without deployment.
`create_solo_ritual` creates one-member rituals with an optional witness and
locks a same-mint token-account beneficiary. `declare_skip` is creator-only,
valid only before the current claim window, and can succeed once per ritual.
Solo finalization refunds confirmed or unresolved claims and sends an entirely
unclaimed event allocation to the locked beneficiary; witnesses never fund or
receive settlement payouts. Group instructions and settlement remain on their
existing path.

The pre-Season `Ritual` account included `kind`, `witness`, `forfeit_destination`,
`skip_declared`, and `skip_event_index`, increasing its allocated size from 909
to 977 bytes. Phase B adds the optional `season` field, bringing the current
allocation to 1010 bytes; the checked-in IDL and client adapter are updated
accordingly.

### Season implementation (Phase B)

Seasons use the on-chain PDA `seeds = [b"season", season_id]`. `Season` stores the
protocol config, 32-byte season id and title digest, up to 16 template event
windows, inclusive start/end bounds, authority, a `u32 participant_count`, and
16 `u32 checked_in_count` slots plus its bump. The allocated account size is
610 bytes including the Anchor discriminator. Only the protocol-config
authority may initialize a season.

`Ritual.season` is an optional `Pubkey`; only `create_solo_ritual` accepts a
season account. Creation validates the complete schedule against the Season
template and increments `participant_count`. Group rituals cannot attach a
season in this phase. A season check-in counter increments in the same
instruction that makes a claim `Confirmed`: honor claims increment during
`claim_completion`, while witness claims increment only when `approve_claim`
reaches the required confirmation threshold. Replay claims fail before the
counter mutation, and season code never moves tokens.

Adding `Ritual.season` changes the Ritual allocation from 977 to 1010 bytes,
and invalidates old devnet Ritual layouts as accepted for the solo redeploy.
The Season TypeScript decoder, PDA helper, instruction encoder/builders, and
frozen IDL snapshot track this layout.
