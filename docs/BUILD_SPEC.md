# Corridor Recovery — build spec for Claude Code (v0.4, real stack — rule changes and additions approved 2026-09-14)
Read this file fully before writing code. The prototype `corridor-recovery-desk-v02.html` is the functional reference: same engine, same documents, same rules. Rebuild it as a private multi-user web app.

## Non-negotiables
1. **The engine is the product.** `phase(entry)` logic exactly as in the prototype: IEEPA classification by Chapter 99 HTS (9903.01.xx refundable; 9903.80/81/85/78, 9903.88–91, 9903.94 excluded); liquidation date from ACE wins, else estimated = entry date + lag and the row is flagged `estimated`; Phase 1 if unliquidated or ≤ P1 days post-liquidation; Protest if ≤ PROT days; else Passed. Every rule is a row in a `rules` table with effective dates and a source — never a constant in code.
2. **Audit trail on every figure.** Every duty amount, phase, deadline and fee must be traceable to entry rows + rule versions. Store rule version id on each computed result.
3. **No client-facing figure while any of the client's IEEPA entries is `estimated`.** Enforce in the findings-sheet generator (hard block, not a warning).
4. **Documents on the Corridor template.** Findings sheet, cover note, bucket-B intro email, engagement letter, authorization, mutual NDA, filing-broker services agreement — HTML → PDF, reference `CM-<TYPE>-<YYYY>-<NNN>`, "As of" date, footer line. Fonts: IBM Plex Sans. **The counsel-draft templates (CM-EL/AU/NDA/BSA-2026-TEMPLATE, 2026-09-13) are the source of truth for legal wording** (PK 2026-09-14); the playbook follows them, not the other way round. Every bracketed term in a template is a `rules` row (see "Legal terms"), never a constant.
5. **Roles.** PK (all), Desk (all except delete), Sales (clients/tasks, no entries detail), Partner broker (only their assigned clients' entries + filing status), Client (read own findings sheet + upload documents). Row-level security.
6. **Privacy.** Customs entry data is confidential: encrypted at rest, TLS, access logged, retention per engagement, no third-party analytics. BC PIPA applies.

## Stack
Postgres · Node (Fastify) or Python (FastAPI) · React + Tailwind (or keep the prototype's vanilla UI, it's fine) · Playwright worker · Anthropic API (claude-sonnet-4-6 default; escalate to Opus for bulletin parsing if confidence low) · Deployed privately (Fly.io / Render / a Hetzner box), daily encrypted backups.

## Data model
clients(id, company, bucket, contact, phone, email, broker_name, stage, us_sales_window, share_non_cusma, rate_paid, ach_status, engagement_signed_at, referred_by_client_id, notes)
entries(id, client_id, entry_no, entry_date, port, hts, hts_base, entered_value, duty_rate, duty_amount, liquidation_date, liquidation_source[ace|estimated|broker], consignee_name, ior_name, status[not_filed|cape_filed|protest_filed|accepted|rejected|refunded], filed_via, claimed_amount, refunded_amount, refunded_at, raw_row jsonb)
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
Sources: CBP CSMS (cbp.gov/trade/automated/cargo-systems-messaging-service), CBP CAPE page, Federal Register (tariff/CBP), CBSA Customs Notices, Canada Gazette Part II (remission orders), Dept of Finance news. For each new item: store raw, call Claude with the bulletin prompt from the prototype (JSON out), create a `bulletins` row. Nothing changes a rule automatically — PK approves in the UI; approval writes a new `rules` row with effective dates and triggers recompute + task regeneration + a "what changed for you" note per affected client. **Counsel loop (PK 2026-09-14):** answers from the lawyer on the four templates come back to FOUNDER as rule-change proposals in the vault; PK approves; Claude Code seeds the rows. Nothing from counsel goes straight into the repo.

## Task engine
Port `tasks()` from the prototype verbatim as the first ruleset, then add: engagement letter unsigned > 7 days; findings sheet sent > 10 days with no reply; CAPE filed > 45 days without acceptance; protest deadline < 14 days and not filed (hot, notifies PK by email/SMS); refund landed and no invoice.

## Bucket B
From entries, aggregate consignee names per source client; show duty carried on the source client's goods; one-click promote to client (bucket B, referred_by set); generate intro email under the source client's name; batch export of B prospects for the US partner broker.

## Reporting
Dashboard KPIs as in prototype + monthly client report (PDF): entries by phase, filings made, refunds received, fees invoiced, next deadlines. Fee ledger: expected vs invoiced vs paid, per client and per filing broker — models the broker's **flat per-client filing fees** (declaration blocks, per-protest) **plus** the broker's share of Corridor's collected fee, as in CM-BSA-2026-TEMPLATE §2 (PK 2026-09-14).

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

## Legal terms approved 2026-09-14 (PK) — rule rows, defaults, bands
Adopted from the counsel drafts; where the playbook or this spec said otherwise, this list wins and the playbook is updated to match (see `docs/PLAYBOOK_CHANGES_2026-09-14.md`).
- `fee_protest` — protest / complex US refund fee. Default **22.5%**; allowed band **20–25%** (`fee_protest_min`, `fee_protest_max`). Never below 20%; below that, walk away (playbook §6 stands).
- `fee_canadian_recovery` — Canadian surtax remission / relief / drawback. Default **25%**.
- `engagement_exclusivity_months` — **12** months from signature, then until matters opened in the term close.
- `invoice_due_days` — **15** days from Corridor's invoice on receipt of funds. No retainer; no fee unless funds arrive.
- `data_deletion_days` — NDA: delete or return customs data **30** days after the last matter closes, except as retained by law. Chain-of-custody storage (M2) uses this rule.
- Authorization: the **broader** CM-AU scope is adopted — Corridor may obtain records from brokers, forwarders and the client's systems, engage and instruct Filing Brokers, and communicate with CBP/CBSA through them; the client signs any broker POA. Validity is a rule row (`authorization_validity_months`, still a placeholder pending counsel).
- Still placeholders pending counsel: broker flat fees and share (CM-BSA §2), non-circumvention months, BSA term, dispute clause, BSA governing law, authorization validity.

## M4 — not scheduled (parked 2026-09-14)
- **Multi-broker routing with batch packaging.** Route each client's filings to a partner broker by jurisdiction, port and capacity; package declarations and protests per broker in batches with a manifest; track acceptance per batch.
- **Automated entry pulls via partner-broker ACE access.** With the client's authorization, the broker's ACE account pulls ES-003 / entry summaries on a schedule; ingestion path identical to CSV; liquidation source `ace`.
- **Multi-seller pipelines with ownership.** Each prospect and client has an owner (PK, Sales, Partner 2); tasks and the fee ledger split by owner; Bucket B introductions credited to the source client's owner.
- **"ACH-stuck refunds" workflow.** Accepted-but-unpaid CAPE refunds (the #1 reason approved refunds don't get paid): detect accepted > N days with no payment → ACE/ACH enrolment walk-through with the client → tracked to payment. Flat fee, not contingent; a rule row.
