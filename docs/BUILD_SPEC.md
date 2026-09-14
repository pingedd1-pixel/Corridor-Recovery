# Corridor Recovery — build spec for Claude Code (v0.4, real stack — rule changes and additions approved 2026-09-14)
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
entries(id, client_id, entry_no, entry_date, port, hts, hts_base, entered_value, duty_rate, duty_amount, liquidation_date, liquidation_source[ace|estimated|broker], consignee_name, ior_name, status[not_filed|cape_filed|protest_filed|accepted|rejected|refunded], filed_via, claimed_amount, refunded_amount, refunded_at, raw_row jsonb, reconciliation_flag, reconciliation_on_file, surety_paid, drawback_flag, adcvd_suspended — classification flags (PK 2026-09-14), routing per "Entry flags" below; prototype v0.2.2 + FOUNDER spec text pending)
rules(id, key, value, effective_from, effective_to, source, approved_by, created_at)
rule_versions(id, fingerprint, rule_ids int[], snapshot jsonb, created_at) — the immutable set of rule rows in force when a figure was computed; `computed.rule_version_id` and `documents.rule_version_id` point here
broker_mappings(id, broker_name, headers_fingerprint, mapping jsonb, created_at) — saved column mapping per broker (see Ingestion)
computed(entry_id, rule_version_id, ieepa_duty, phase, governing_deadline, days_remaining, is_estimated, classification, computed_at)
tasks(id, client_id, entry_id null, key, owner_role, text, hot, generated_at, done_at, done_by) — regenerated from state on every change; done flags persist by key
documents(id, client_id, ref, type, html, pdf_url, created_by, created_at)
bulletins(id, source, published_at, url, raw_text, ai_summary jsonb, proposed_rule_changes jsonb, reviewed_by, decision)
prospects_b(id, source_client_id, consignee_name, entries_count, duty_on_source_goods, status, promoted_client_id)
users(id, name, role, email), audit_log(id, user_id, action, table, row_id, before jsonb, after jsonb, at)

## Ingestion
- CSV/XLSX upload with auto-mapping (aliases as in prototype, with exact-match priority and a Chapter 99 column preferred over the base HTS column — `hts` is the Chapter 99 line the engine classifies on, `hts_base` the base tariff line), mapping saved per broker so the second report from the same broker needs no mapping.
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
M1 (week 1): schema, auth/roles, CSV ingestion, engine, tasks, dashboard — parity with v0.2.1. M2 (week 2): documents → PDF, **client submission + chain of custody**, bucket B, audit log, backups. M3 (week 3–4): rule-feed worker with approval UI, PDF ingestion, notifications, client portal (read-only), **rights ledger**, **Origin module**. Ship each milestone behind a private URL; PK reviews on the trial client's real data. The 2026-09-14 additions (below) do not start before M1 parity is green.
## Rule changes approved 2026-09-14 (PK) — seed these in the `rules` table
- phase label: entries past the 180-day protest window are "Phase 3 — finally liquidated (contested on appeal)", not "litigation only". Filed via CAPE Phase 3; excluded from client-facing "recoverable now" totals until the appeal resolves. Source: GingerControl guide 2026-07-23; BDO FAQ 2026-08-11.
- Phase 2 (reconciliation-flagged entries) opened 2026-06-29: entries with a reconciliation flag route to Phase 2, not protest. Source: BDO.
- Step 3 document: ACE ES-003 import history report (client's own ACE) or broker entry report. Source: GingerControl.
- Accepted declarations cannot be amended → task rule "no filing until entry list complete". Source: Aprio 2026-05-06.
- Refund payee may be designated via CBP Form 4811. Source: Aprio.
- Phase 1 excludes drawback/reconciliation-flagged and surety-paid entries → classification flags. Source: Aprio.
Calibration for timelines (public filings, Q2 2026): clean Phase 1 claims paid in ~3–4 months with ~3.4% interest (Arhaus, FIGS); mid-size claims lag (Bark); claims sold pre-filing at ~73¢ (Accuray).

## Additions approved 2026-09-14 — client submission, chain of custody, rights ledger
### Client submission (no login required)
- Per-client **magic upload link** (signed, expiring, revocable) sent from the engagement email. Drag-and-drop for duty statements, broker invoices, ES-003 exports, BOMs, supplier declarations. Optional client login later; the link is the default because it is the least human steps.
- On upload: SHA-256 hash, size, MIME, uploader (link id), timestamp (UTC), client IP, stored immutably (object storage with versioning; no delete, only supersede). Virus scan. Acknowledgement email with the hash.
- **Chain of custody view** per document: who uploaded, when, hash, every read/export by whom, every derived artifact (parsed rows, findings sheet) linked back to the source file id. Exportable as a PDF appendix for verifications and disputes.
- Nothing is ever "lost": every claim figure traces to a source file id + row id + rule version.
### Rights ledger (contingent receivables) — new module
- For every entry ingested, record the **tariff authority** per Chapter 99 line: IEEPA (9903.01), Section 122 (Proclamation 11012, 2026-02-24 → 07-24), Section 301 forced-labour (from 2026-07-24), Section 338 (from 2026-08-22), 232, 301 China, AD/CVD.
- Maintain per-authority **contingent status**: IEEPA = refundable (CAPE); 122 = struck down at CIT 2026-05-07, stayed on appeal, relief limited to plaintiffs; 301-FL = challenged (Burlap & Barrel v. Greer, filed 2026-07-24, class action); 338 = untested. Status comes from the rules table (rule feed proposes, PK approves).
- **Preservation clocks**: for each non-IEEPA contested authority, compute liquidation (ACE or estimated) + 180 days = protest deadline to preserve refund rights; generate tasks "preserve rights: protest entry X by date Y" when status = contested and deadline < 120 days. Batch protest packages for the partner broker.
- Client-facing: a "contingent receivables" section on the findings sheet — duties paid under contested authorities, what would need to be true for a refund, and what we are doing to preserve the right. Never counted as recoverable.
### Origin module (Corridor Origin)
- Product records: HS, BOM lines (input HS, origin, supplier, cost), rule of origin applied (tariff shift / RVC-TV / RVC-NC), computed result, determination document (signed by a named person), certification (9 data elements, blanket period), supplier-declaration tracker, 5-year record retention, annual re-cert task, "rules changed → re-run" trigger from the rule feed.

## Entry flags and routing (PK 2026-09-14; interim until prototype v0.2.2 and FOUNDER's spec text)
Precedence, top wins. Flags come from the broker / ACE report columns (aliases in `src/ingest/mapping.js`).
- `adcvd_suspended` → **"Manual processing (19 USC 1520)"** — no CAPE, no deadline clock; task for the broker.
- `reconciliation_on_file` → **"Future phase — reconciliation on file"** — tracked, no deadline.
- `reconciliation_flag` (and not on file) → **"Phase 2 — reconciliation-flagged"** — same 80-day post-liquidation window as Phase 1 (`phase1_window_days`); counted as filable, not as Phase 1.
- `surety_paid` or `drawback_flag` → **"Manual path — surety/drawback (confirm with broker)"** — excluded from Phase 1; the protest clock still runs (interpretation: rights are preserved by protest until the broker confirms the path); task "manual path — confirm with broker".
- Otherwise the v0.2.1 routing by liquidation date (Phase 1 / Protest / Phase 3).
Golden fixture: unchanged (the fixture CSV carries no flags). Flag behaviour is covered by synthetic-entry unit tests, not hand-written fixture rows; the golden is regenerated from v0.2.2 when FOUNDER ships it.
