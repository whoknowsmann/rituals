# Implementation Plan Index

## Active plan

The approved product direction is Rituals.

Execute:

- `docs/plans/2026-09-09-rituals-rebuild.md`

That plan defines exact phases, files, TDD cycles, program invariants, MWA integration, two-wallet devnet acceptance, standalone Seeker verification, documentation, and submission work.

## Historical plan

This file previously contained the Preflight transaction-review vertical-slice plan. That plan was implemented and verified, then superseded by the Rituals pivot for the Clock In submission after the consumer-product course correction.

Its implementation remains in the current source tree and Git history until the Rituals rebuild reaches an independently green fixture-backed vertical slice. Do not continue the old Preflight roadmap for the hackathon.

## Required execution posture

- Create `feat/rituals-rebuild` before production changes.
- Commit the active plan before product code.
- Use strict RED–GREEN–REFACTOR for behavioral code.
- Use the completed Anchor/MWA compatibility spike as the boundary for production dependencies: pin Rust-1.84-compatible transitive crates, keep mobile on a thin typed web3.js client from a frozen IDL, and separately validate native MWA signing.
- Preserve the known-good Preflight/EAS/Seeker path until Rituals is verified.
- Keep P0 devnet and valueless-token only.
- Verify external state by reading exact accounts/balances after every state-changing transaction.
- Do not push, deploy, install global toolchains, or alter credentials without the appropriate authorization.
