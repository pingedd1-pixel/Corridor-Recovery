-- PK 2026-09-14 (pending prototype v0.2.2 + FOUNDER spec text): entry-level classification flags.
-- Routing (src/engine/phase.js): reconciliation_flag && !reconciliation_on_file → Phase 2 (same 80-day window as Phase 1);
-- reconciliation_on_file → future phase, no deadline; surety_paid || drawback_flag → excluded from Phase 1, manual path;
-- adcvd_suspended → manual processing (19 USC 1520), no CAPE.
ALTER TABLE entries ADD COLUMN reconciliation_flag boolean NOT NULL DEFAULT false;
ALTER TABLE entries ADD COLUMN reconciliation_on_file boolean NOT NULL DEFAULT false;
ALTER TABLE entries ADD COLUMN surety_paid boolean NOT NULL DEFAULT false;
ALTER TABLE entries ADD COLUMN drawback_flag boolean NOT NULL DEFAULT false;
ALTER TABLE entries ADD COLUMN adcvd_suspended boolean NOT NULL DEFAULT false;
