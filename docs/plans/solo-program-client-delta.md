# Solo program client delta

Generated from `target/idl/rituals.json` after `anchor build`; compared with the
frozen client snapshot at `src/data/rituals/idl/rituals.json`. The frozen snapshot
is intentionally unchanged in this program-only branch.

## IDL additions

- `create_solo_ritual`
  - args: `nonce: u64`, `rule_digest: [u8; 32]`,
    `member_total_stake: u64`, `schedule: Vec<EventWindow>`,
    `witness: Option<Pubkey>`
  - accounts: the existing protocol/ritual/creator/mint/fee/vault/system/token
    accounts plus writable `forfeit_destination` (same mint as the stake mint).
- `declare_skip`
  - arg: `event_index: u8`
  - accounts: writable `ritual`, signer `member`.
- New enum type `RitualKind { Group, Solo }`.
- Existing enum `VoidReason` gains `DeclaredSkip` as its final variant.

## Existing account layout change

`Ritual` retains every existing field and appends the following fields immediately
before the existing final `bump` field:

```text
kind: RitualKind
witness: Option<Pubkey>
forfeit_destination: Pubkey
skip_declared: bool
skip_event_index: u8
```

The allocated/serialized account size changes from **909 to 977 bytes** (+68).
This is required to persist the locked solo mode, optional non-staking witness,
locked missed-stake destination, and one-shot skip state. `ProtocolConfig`,
`RitualEvent`, and `CompletionClaim` layouts are unchanged.

## Required TypeScript/client work before adopting the new IDL

1. Replace the frozen `Ritual` decoder/model with the new field order and decode
   `RitualKind`, `Option<Pubkey>`, destination, skip flag, and skip index.
2. Update the `VoidReason` decoder/union for the appended `DeclaredSkip` variant.
3. Add builders/codecs for `create_solo_ritual` and `declare_skip`, including the
   exact new discriminators and account metas from the generated IDL.
4. Update solo finalization account assembly: `finalize_event` still has no
   typed IDL argument for remaining accounts, but a solo call must append exactly
   one member destination followed by the locked `forfeit_destination` token
   account. Group finalization remains unchanged.
5. Update account-size/layout fixtures and add Rust↔TypeScript vectors for the
   new `Ritual` layout and both new instruction encodings.
6. Run `npx tsc --noEmit` and `npx vitest run` after the client changes. They were
   not run for this on-chain-only branch.
