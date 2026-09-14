-- Legal templates (corridor.zip, counsel drafts dated 2026-09-13): every bracketed value is a PLACEHOLDER rule row,
-- not a constant. approved_by starts with "placeholder" until counsel/PK approve; templates render such values in [brackets].
-- Text rules need rules.value_text (also added by 003 on the rules branch; both migrations are idempotent here).
ALTER TABLE rules ALTER COLUMN value DROP NOT NULL;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS value_text text;

INSERT INTO rules (key, value, value_text, effective_from, source, approved_by) VALUES
  -- engagement letter CM-EL-2026-TEMPLATE
  ('fee_canadian_recovery',          0.25, NULL, '2026-09-13', 'CM-EL-2026-TEMPLATE §2 "[25]% of the amount recovered" (Canadian remission/relief/drawback)', 'placeholder — pending counsel'),
  ('invoice_due_days',               15,   NULL, '2026-09-13', 'CM-EL-2026-TEMPLATE §2 "payment due within 15 days"', 'placeholder — pending counsel'),
  ('engagement_exclusivity_months',  12,   NULL, '2026-09-13', 'CM-EL-2026-TEMPLATE §4 "[12] months from signature"', 'placeholder — pending counsel'),
  ('termination_notice_days',        30,   NULL, '2026-09-13', 'CM-EL-2026-TEMPLATE §4 "30 days'' written notice"', 'placeholder — pending counsel'),
  ('dispute_resolution',             NULL, 'mediation, then arbitration in Vancouver', '2026-09-13', 'CM-EL-2026-TEMPLATE §7 "[mediation, then arbitration in Vancouver]"', 'placeholder — pending counsel'),
  -- authorization CM-AU-2026-TEMPLATE
  ('authorization_validity_months',  12,   NULL, '2026-09-13', 'CM-AU-2026-TEMPLATE "valid for [12] months"', 'placeholder — pending counsel'),
  -- mutual NDA CM-NDA-2026-TEMPLATE
  ('nda_term_years',                 3,    NULL, '2026-09-13', 'CM-NDA-2026-TEMPLATE "Term: 3 years from signature"', 'placeholder — pending counsel'),
  ('data_deletion_days',             30,   NULL, '2026-09-13', 'CM-NDA-2026-TEMPLATE "delete or return it within 30 days after the last matter closes"', 'placeholder — pending counsel'),
  -- broker services agreement CM-BSA-2026-TEMPLATE
  ('broker_flat_fee_per_client_usd',  NULL, '[ ]', '2026-09-13', 'CM-BSA-2026-TEMPLATE §2 "flat fee of US$[ ] per Corridor Client"', 'placeholder — pending counsel'),
  ('broker_entries_included',         NULL, '[ ]', '2026-09-13', 'CM-BSA-2026-TEMPLATE §2 "declarations covering up to [ ] entries"', 'placeholder — pending counsel'),
  ('broker_fee_additional_block_usd', NULL, '[ ]', '2026-09-13', 'CM-BSA-2026-TEMPLATE §2 "US$[ ] per additional [ ] entries"', 'placeholder — pending counsel'),
  ('broker_additional_block_entries', NULL, '[ ]', '2026-09-13', 'CM-BSA-2026-TEMPLATE §2 "per additional [ ] entries"', 'placeholder — pending counsel'),
  ('broker_fee_per_protest_usd',      NULL, '[ ]', '2026-09-13', 'CM-BSA-2026-TEMPLATE §2 "US$[ ] per protest"', 'placeholder — pending counsel'),
  ('broker_fee_share_pct',            NULL, '[ ]', '2026-09-13', 'CM-BSA-2026-TEMPLATE §2 "[ ]% of Corridor''s collected contingency fee"', 'placeholder — pending counsel'),
  ('broker_invoice_due_days',         30,   NULL, '2026-09-13', 'CM-BSA-2026-TEMPLATE §2 "payable in 30 days"', 'placeholder — pending counsel'),
  ('broker_share_due_days',           15,   NULL, '2026-09-13', 'CM-BSA-2026-TEMPLATE §2 "payable within 15 days of Corridor''s receipt"', 'placeholder — pending counsel'),
  ('broker_noncircumvention_months',  24,   NULL, '2026-09-13', 'CM-BSA-2026-TEMPLATE §3 "[24] months after"', 'placeholder — pending counsel'),
  ('broker_agreement_term_months',    12,   NULL, '2026-09-13', 'CM-BSA-2026-TEMPLATE §5 "[12] months, renewing annually"', 'placeholder — pending counsel'),
  ('broker_termination_notice_days',  60,   NULL, '2026-09-13', 'CM-BSA-2026-TEMPLATE §5 "terminated on 60 days'' notice"', 'placeholder — pending counsel'),
  ('broker_status_report_days',       2,    NULL, '2026-09-13', 'CM-BSA-2026-TEMPLATE §1 "report status within 2 business days"', 'placeholder — pending counsel'),
  ('bsa_governing_law',               NULL, 'British Columbia / the Broker''s state — counsel to advise', '2026-09-13', 'CM-BSA-2026-TEMPLATE §6', 'placeholder — pending counsel');

-- The existing protest fee (0.225, seeded from the prototype) is bracketed "[22.5]%" in the counsel draft: mark it a placeholder too.
UPDATE rules SET approved_by = 'placeholder — pending counsel (was: ' || approved_by || ')' WHERE key = 'fee_protest' AND approved_by NOT LIKE 'placeholder%';

-- Broker-facing documents have no client.
ALTER TABLE documents ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE documents ADD COLUMN counterparty text;
