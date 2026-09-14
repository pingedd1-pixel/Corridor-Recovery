# CLAUDE.md — Corridor Recovery (read fully before any change)

You are building the Corridor Recovery desk: software that finds, phases, and manages tariff-recovery claims for Canadian and US companies. Four parties work in this repo — PK (principal, decides), FOUNDER (the desk agent, owns product and docs), a second partner, and their agent — plus you, Claude Code. This file is the contract between all of us.

## Source of truth, in order
1. `docs/BUILD_SPEC.md` — what to build. If code and spec disagree, the spec wins; if the spec is wrong, change the spec in the same PR and say why.
2. `prototype/desk-v0.2.html` — the functional reference. The engine (`classify`, `phase`, `clientStats`, `tasks`, `findings`) must behave identically in the real app. Port it; don't reinterpret it.
3. `brand/brand-guide.html` — every screen and document follows it. IBM Plex Sans; ink/paper/aluminium/copper; status tags verified/rough/unverified; the two-rule mark.
4. `docs/BUSINESS_PLAN_v1.pdf`, `docs/SALES_PLAYBOOK.pdf` — why. Read once.

## Non-negotiables (product rules, not style)
- Rules live in the `rules` table with effective dates and sources. Never a magic number in code.
- Every computed figure stores the rule version it was computed with. Audit log on every write.
- Hard block, not a warning: no client-facing document generates while any of that client's IEEPA entries has `liquidation_source = estimated`.
- Non-IEEPA Chapter 99 lines (232/301/autos: 9903.80/81/85/78, 9903.88–91, 9903.94) are excluded from every refund total, always.
- Nothing changes a rule automatically. The rule-feed worker proposes; PK approves in the UI.
- Customs entry data is confidential: encrypted at rest, TLS, no third-party analytics, row-level security by role.
- No guarantees anywhere in UI copy or generated documents. Use "likely", "in the range of", "subject to what the entries show".

## Working agreement
- `main` is protected. Everything is a PR. One concern per PR. Small PRs over big ones.
- Branch names: `feat/<area>-<short>`, `fix/…`, `docs/…`. Areas: ingest, engine, tasks, docs-gen, bucketb, rules-feed, auth, ui, infra.
- Every PR: what changed, why (link to spec section), how it was verified (tests + a preview screenshot for UI), and any spec change.
- Agents (Claude Code, the partner's agent, FOUNDER) open PRs; humans merge. Agents never force-push, never edit `rules` seed data without a linked bulletin/source, never delete migrations.
- Tests: the engine has fixtures in `docs/fixtures-sim-broker-entry-report.csv`; expected phase/deadline outputs for that file are the acceptance test. Add fixtures for every bug.
- Secrets in env only. `.env.example` is committed; `.env` never is.

## Milestones
M1 (week 1): schema, auth/roles, CSV ingestion, engine parity with v0.2.1, tasks, dashboard.
M2 (week 2): documents → PDF on the template, client submission + chain of custody, bucket B, audit log, backups.
M3 (weeks 3–4): rule-feed worker + approval UI, PDF ingestion via Claude with confidence gate, notifications, read-only client view, rights ledger (contested tariff authorities), Origin module.
The additions approved 2026-09-14 (BUILD_SPEC "Additions approved 2026-09-14") do not start before M1 parity is green.
Ship each behind a private URL. PK reviews on the simulation fixture first, then the trial client's real data.

## How to talk to us
Lead with what you changed and what you need decided. If a spec item is ambiguous, propose the interpretation in the PR and proceed — don't block on questions you can answer with a sensible default. Flag anything that would touch the non-negotiables before doing it.
