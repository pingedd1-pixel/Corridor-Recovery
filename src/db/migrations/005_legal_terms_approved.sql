-- PK 2026-09-14: adopt the counsel-draft templates as source of truth; approve these terms with defaults.
-- Approval = close the placeholder row and insert an approved row effective 2026-09-14 (never edit a row in place).
UPDATE rules SET effective_to = '2026-09-14'
  WHERE key IN ('fee_protest','fee_canadian_recovery','engagement_exclusivity_months','invoice_due_days','data_deletion_days')
    AND effective_to IS NULL;
INSERT INTO rules (key, value, effective_from, source, approved_by) VALUES
  ('fee_protest',                   0.225, '2026-09-14', 'CM-EL-2026-TEMPLATE §2; playbook §6 band 20–25%; PK decision 2026-09-14', 'PK 2026-09-14'),
  ('fee_protest_min',               0.20,  '2026-09-14', 'Playbook §6 "never negotiate below 10%… 20–25% for complex"; PK decision 2026-09-14 (allowed band)', 'PK 2026-09-14'),
  ('fee_protest_max',               0.25,  '2026-09-14', 'Playbook §6; PK decision 2026-09-14 (allowed band)', 'PK 2026-09-14'),
  ('fee_canadian_recovery',         0.25,  '2026-09-14', 'CM-EL-2026-TEMPLATE §2 "[25]% of the amount recovered"; PK decision 2026-09-14', 'PK 2026-09-14'),
  ('engagement_exclusivity_months', 12,    '2026-09-14', 'CM-EL-2026-TEMPLATE §4 "[12] months from signature"; PK decision 2026-09-14', 'PK 2026-09-14'),
  ('invoice_due_days',              15,    '2026-09-14', 'CM-EL-2026-TEMPLATE §2 "payment due within 15 days"; PK decision 2026-09-14', 'PK 2026-09-14'),
  ('data_deletion_days',            30,    '2026-09-14', 'CM-NDA-2026-TEMPLATE "delete or return within 30 days after the last matter closes"; PK decision 2026-09-14', 'PK 2026-09-14');
