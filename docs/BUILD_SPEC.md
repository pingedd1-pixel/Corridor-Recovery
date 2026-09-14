# Corridor Recovery — build spec for Claude Code (v0.3, real stack)
Read this file fully before writing code. The prototype `corridor-recovery-desk-v02.html` is the functional reference: same engine, same documents, same rules. Rebuild it as a private multi-user web app.

## Non-negotiables
1. **The engine is the product.** `phase(entry)` logic exactly as in the prototype: IEEPA classification by Chapter 99 HTS (9903.01.xx refundable; 9903.80/81/85/78, 9903.88–91, 9903.94 excluded); liquidation date from ACE wins, else estimated = entry date + lag and the row is flagged `estimated`; Phase 1 if unliquidated or ≤ P1 days post-liquidation; Protest if ≤ PROT days; else Passed. Every rule is a row in a `rules` table with effective dates and a source — never a constant in code.
2. **Audit trail on every figure.** Every duty amount, phase, deadline and fee must be traceable to entry rows + rule versions. Store rule version id on each computed result.
3. **No client-facing figure while any of the client's IEEPA entries is `estimated`.** Enforce in the findings-sheet generator (hard block, not a warning).
4. **Documents on the Corridor template.** Findings sheet, cover note, bucket-B intro email, engagement letter, authorization — HTML → PDF, reference `CM-<TYPE>-<YYYY>-<NNN>`, "As of" date, footer line. Fonts: IBM Plex Sans.
5. **Roles.** PK (all), Desk (all except delete), Sales (clients/tasks, no entries detail), Partner broker (only their assigned clients' entries + filing status), Client (read own findings sheet + upload documents). Row-level security.
6. **Privacy.** Customs entry data is confidential: encrypted at rest, TLS, access logged, retention per engagement, no third-party analytics. BC PIPA applies.

## Stack
Postgres · Node (Fastify) or Python (FastAPI) · React + Tailwind (or keep the prototype's vanilla UI, it's fine) · Playwright worker · Anthropic API (claude-sonnet-4-6 default; escalate to Opus for bulletin parsing if confidence low) · Deployed privately (Fly.io / Render / a Hetzner box), daily encrypted backups.

## Data model
clients(id, company, bucket, contact, phone, email, broker_name, stage, us_sales_window, share_non_cusma, rate_paid, ach_status, engagement_signed_at, referred_by_client_id, notes)
entries(id, client_id, entry_no, entry_date, port, hts, entered_value, duty_rate, duty_amount, liquidation_date, liquidation_source[ace|estimated|broker], consignee_name, ior_name, status[not_filed|cape_filed|protest_filed|accepted|rejected|refunded], filed_via, claimed_amount, refunded_amount, refunded_at, raw_row jsonb)
rules(id, key, value, effective_from, effective_to, source, approved_by, created_at)
computed(entry_id, rule_version_id, ieepa_duty, phase, governing_deadline, days_remaining, is_estimated, computed_at)
tasks(id, client_id, entry_id null, key, owner_role, text, hot, generated_at, done_at, done_by) — regenerated from state on every change; done flags persist by key
documents(id, client_id, ref, type, html, pdf_url, created_by, created_at)
bulletins(id, source, published_at, url, raw_text, ai_summary jsonb, proposed_rule_changes jsonb, reviewed_by, decision)
prospects_b(id, source_client_id, consignee_name, entries_count, duty_on_source_goods, status, promoted_client_id)
users(id, name, role, email), audit_log(id, user_id, action, table, row_id, before jsonb, after jsonb, at)

## Ingestion
- CSV/XLSX upload with auto-mapping (aliases as in prototype), mapping saved per broker so the second report from the same broker needs no mapping.
- PDF broker statements: send pages to Claude with a strict JSON schema; require ≥0.9 self-reported confidence per row or route to human review queue.
- ACE reports (ES-001-style extracts) as CSV — same path.
- De-dupe on (client_id, entry_no).

## Rule feed worker (Playwright, daily 06:00 PT)
Sources: CBP CSMS (cbp.gov/trade/automated/cargo-systems-messaging-service), CBP CAPE page, Federal Register (tariff/CBP), CBSA Customs Notices, Canada Gazette Part II (remission orders), Dept of Finance news. For each new item: store raw, call Claude with the bulletin prompt from the prototype (JSON out), create a `bulletins` row. Nothing changes a rule automatically — PK approves in the UI; approval writes a new `rules` row with effective dates and triggers recompute + task regeneration + a "what changed for you" note per affected client.

## Task engine
Port `tasks()` from the prototype verbatim as the first ruleset, then add: engagement letter unsigned > 7 days; findings sheet sent > 10 days with no reply; CAPE filed > 45 days without acceptance; protest deadline < 14 days and not filed (hot, notifies PK by email/SMS); refund landed and no invoice.

## Bucket B
From entries, aggregate consignee names per source client; show duty carried on the source client's goods; one-click promote to client (bucket B, referred_by set); generate intro email under the source client's name; batch export of B prospects for the US partner broker.

## Reporting
Dashboard KPIs as in prototype + monthly client report (PDF): entries by phase, filings made, refunds received, fees invoiced, next deadlines. Fee ledger: expected vs invoiced vs paid, by partner broker share.

## Milestones
M1 (week 1): schema, auth/roles, CSV ingestion, engine, tasks, dashboard — parity with v0.2. M2 (week 2): documents → PDF, bucket B, audit log, backups. M3 (week 3–4): rule-feed worker with approval UI, PDF ingestion, notifications, client portal (read-only). Ship each milestone behind a private URL; PK reviews on the trial client's real data.
