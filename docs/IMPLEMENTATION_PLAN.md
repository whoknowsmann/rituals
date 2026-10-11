# Implementation Plan Index

> **Historical (September 2026).** Kept for the record of how the program and client were built. It predates the solo product that shipped; for what Rituals is now read `docs/submission/FACTS.md`, and for the measured state `docs/STATUS.md`.

## Current execution source

The product is Rituals. Use:

- `docs/ROADMAP.md` — current completed and remaining repository work;
- `docs/plans/2026-09-17-hackathon-submission.md` — the active submission plan through the deadline;
- `docs/ARCHITECTURE.md` — observed active boundaries;
- `docs/SECURITY.md` — current limits and trust boundaries.

Historical decision records, kept for provenance only, are under `docs/plans/`:

- `2026-09-09-rituals-rebuild.md` — detailed rebuild execution record;
- `2026-09-15-ritual-client-progress-boundary.md` — completed split submission/confirmation milestone;
- `2026-09-15-ritual-create-authority-availability.md` — Create authority/availability read milestone.

Do not resume a historical plan from its first unchecked-looking line. Most early
branch, protocol, funding, activation, and mobile-replacement milestones are complete;
`docs/ROADMAP.md` is the authority on what remains.

## Execution posture

- Work on `main`; it is the current product branch.
- The Anchor program and the typed Solana client are FROZEN. Add tests there only
  to reproduce an observed defect on the visible path.
- Remaining effort goes to visible screens, devnet deployment, on-device
  verification, and submission materials.
- Use strict RED–GREEN–REFACTOR for new behavioral code on the visible path.
- P0 is devnet with valueless test assets only.
- Verify external state by reading exact accounts and balances after every
  state-changing transaction.
- Do not deploy, install global toolchains, or alter credentials without
  explicit authorization.
