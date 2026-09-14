-- Rule changes approved by PK 2026-09-14 (docs/BUILD_SPEC.md "Rule changes approved 2026-09-14").
-- Not every rule is a number: labels, routing rules and document requirements are text. `value` becomes nullable
-- and `value_text` is added; each row carries exactly one of the two. The engine's numeric rule set is unchanged.
-- Idempotent with migration 004 (documents branch), which adds the same column: whichever applies first wins.
ALTER TABLE rules ALTER COLUMN value DROP NOT NULL;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS value_text text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rules_value_one_of') THEN
    ALTER TABLE rules ADD CONSTRAINT rules_value_one_of CHECK ((value IS NULL) <> (value_text IS NULL));
  END IF;
END $$;

INSERT INTO rules (key, value_text, effective_from, source, approved_by) VALUES
  ('phase3_label',
   'Phase 3 — finally liquidated (contested on appeal). Entries past the 180-day protest window are Phase 3, not "litigation only". Filed via CAPE Phase 3; excluded from client-facing "recoverable now" totals until the appeal resolves.',
   '2026-09-14', 'GingerControl guide 2026-07-23; BDO FAQ 2026-08-11', 'PK 2026-09-14'),
  ('phase2_reconciliation',
   'Phase 2 (reconciliation-flagged entries) opened 2026-06-29: entries with a reconciliation flag route to Phase 2, not protest.',
   '2026-09-14', 'BDO', 'PK 2026-09-14'),
  ('step3_document',
   'Step 3 document: ACE ES-003 import history report (client''s own ACE) or broker entry report.',
   '2026-09-14', 'GingerControl', 'PK 2026-09-14'),
  ('no_filing_until_complete',
   'Accepted declarations cannot be amended → task rule "no filing until entry list complete".',
   '2026-09-14', 'Aprio 2026-05-06', 'PK 2026-09-14'),
  ('form_4811_payee',
   'Refund payee may be designated via CBP Form 4811.',
   '2026-09-14', 'Aprio', 'PK 2026-09-14'),
  ('phase1_exclusions',
   'Phase 1 excludes drawback/reconciliation-flagged and surety-paid entries → classification flags.',
   '2026-09-14', 'Aprio', 'PK 2026-09-14');
