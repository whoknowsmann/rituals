# Implementation Plan Index

## Current execution source

The approved product direction is Rituals.

Use:

- `docs/ROADMAP.md` for current completed and remaining repository work;
- `docs/plans/2026-09-15-ritual-create-authority-availability.md` for the active read-only Create authority/availability milestone;
- `docs/plans/2026-09-15-ritual-client-progress-boundary.md` as the completed split submission/confirmation client milestone and acceptance record;
- the Hub note `Rituals Roadmap.md` for the concise product-level view;
- `docs/plans/2026-09-09-rituals-rebuild.md` as the historical detailed execution record and acceptance reference.

Do not blindly resume the detailed plan from its first unchecked-looking instruction. Several early branch, pivot, protocol, funding, activation, and mobile-replacement milestones are already complete.

## Historical plan

This file previously contained the Preflight transaction-review vertical-slice plan. That plan was implemented and verified, then superseded by the Rituals pivot for the Clock In submission after the consumer-product course correction.

Its implementation was removed from active source after the independently green Rituals fixture-backed home. It survives only in Git history and legacy build linkage. Do not restore or maintain it as active hackathon source.

## Required execution posture

- Continue on the existing private `feat/rituals-rebuild` branch.
- Keep current progress in `docs/ROADMAP.md` and the Hub `Rituals Roadmap.md`.
- Use strict RED–GREEN–REFACTOR for behavioral code.
- Use the completed Anchor/MWA compatibility spike as the boundary for production dependencies: pin Rust-1.84-compatible transitive crates, keep mobile on a thin typed web3.js client from a frozen IDL, and separately validate native MWA signing.
- Preserve archived behavior through Git history and existing build linkage only; do not reintroduce it into active source.
- Keep P0 devnet and valueless-token only.
- Verify external state by reading exact accounts/balances after every state-changing transaction.
- Do not push, deploy, install global toolchains, or alter credentials without the appropriate authorization.
