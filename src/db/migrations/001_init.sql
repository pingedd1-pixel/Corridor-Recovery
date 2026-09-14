-- Corridor Recovery — M1 schema (BUILD_SPEC "Data model"). Postgres; also runs on PGlite for dev/tests.
-- Deviations from the spec text, each explained in the M1 PR:
--   entries.hts_base      — broker reports carry a base tariff line and a Chapter 99 line; the engine classifies on
--                           the Chapter 99 line (entries.hts). The base line is kept for the audit trail.
--   rule_versions         — a computed figure depends on several rule rows at once; a rule_version is the immutable
--                           set of rule row ids in force when the figure was computed (computed.rule_version_id).
--   broker_mappings       — BUILD_SPEC "Ingestion": mapping saved per broker.
--   tasks.key             — the prototype's stable task id ("<company>|<key>"); done flags persist on it.

CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE users (
  id serial PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('pk','desk','sales','partner_broker','client')),
  email text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id serial PRIMARY KEY,
  company text NOT NULL UNIQUE,
  bucket text NOT NULL DEFAULT 'A — exporter as IOR',
  contact text, phone text, email text,
  broker_name text,
  stage text NOT NULL DEFAULT 'Lead' CHECK (stage IN ('Lead','Qualified','Engaged','Data in','Findings sent','Filed','Refunded','Closed')),
  us_sales_window numeric,
  share_non_cusma numeric,
  rate_paid numeric,
  ach_status text NOT NULL DEFAULT 'Unknown' CHECK (ach_status IN ('Yes','No','Unknown')),
  engagement_signed_at date,
  referred_by_client_id integer REFERENCES clients(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE entries (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  entry_no text NOT NULL,
  entry_date date,
  port text,
  hts text,                       -- Chapter 99 line the engine classifies on (9903.xx.xx)
  hts_base text,                  -- base tariff line as reported by the broker
  entered_value numeric,
  duty_rate numeric,
  duty_amount numeric,
  liquidation_date date,
  liquidation_source text NOT NULL DEFAULT 'estimated' CHECK (liquidation_source IN ('ace','estimated','broker')),
  consignee_name text,
  ior_name text,
  status text NOT NULL DEFAULT 'not_filed' CHECK (status IN ('not_filed','cape_filed','protest_filed','accepted','rejected','refunded')),
  filed_via text,
  claimed_amount numeric,
  refunded_amount numeric,
  refunded_at date,
  raw_row jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, entry_no)
);
CREATE INDEX entries_client_idx ON entries(client_id);

CREATE TABLE rules (
  id serial PRIMARY KEY,
  key text NOT NULL,
  value numeric NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  source text NOT NULL,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rules_key_idx ON rules(key, effective_from);

CREATE TABLE rule_versions (
  id serial PRIMARY KEY,
  fingerprint text NOT NULL UNIQUE,   -- sorted rule ids, e.g. "1,2,3,4,5,6,7,8"
  rule_ids integer[] NOT NULL,
  snapshot jsonb NOT NULL,            -- {prot,p1,lag,urg,fee1,fee2,brok,real} as the engine saw them
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE computed (
  entry_id integer PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
  rule_version_id integer NOT NULL REFERENCES rule_versions(id),
  ieepa_duty numeric NOT NULL,
  phase text NOT NULL,
  governing_deadline date,
  days_remaining integer,
  is_estimated boolean NOT NULL,
  classification text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id serial PRIMARY KEY,
  client_id integer REFERENCES clients(id) ON DELETE CASCADE,
  entry_id integer REFERENCES entries(id) ON DELETE SET NULL,
  key text NOT NULL UNIQUE,
  owner_role text NOT NULL,
  text text NOT NULL,
  hot boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  done_by integer REFERENCES users(id)
);

CREATE TABLE documents (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ref text NOT NULL UNIQUE,           -- CM-<TYPE>-<YYYY>-<NNN>
  type text NOT NULL,
  html text NOT NULL,
  pdf_url text,
  rule_version_id integer REFERENCES rule_versions(id),
  created_by integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bulletins (
  id serial PRIMARY KEY,
  source text NOT NULL,
  published_at date,
  url text,
  raw_text text,
  ai_summary jsonb,
  proposed_rule_changes jsonb,
  reviewed_by integer REFERENCES users(id),
  decision text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prospects_b (
  id serial PRIMARY KEY,
  source_client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  consignee_name text NOT NULL,
  entries_count integer NOT NULL DEFAULT 0,
  duty_on_source_goods numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'prospect',
  promoted_client_id integer REFERENCES clients(id),
  UNIQUE (source_client_id, consignee_name)
);

CREATE TABLE broker_mappings (
  id serial PRIMARY KEY,
  broker_name text NOT NULL,
  headers_fingerprint text NOT NULL,
  mapping jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broker_name, headers_fingerprint)
);

CREATE TABLE audit_log (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id),
  action text NOT NULL,
  "table" text NOT NULL,
  row_id text,
  before jsonb,
  after jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_table_row_idx ON audit_log("table", row_id);

-- Seed rules: the v0.2 prototype's rule panel, each with its published source (CLAUDE.md: never a magic number in code).
INSERT INTO rules (key, value, effective_from, source, approved_by) VALUES
  ('protest_window_days',   180,   '2004-12-18', '19 CFR 174.12(e) — 180-day protest window',                                            'seed: prototype v0.2'),
  ('phase1_window_days',    80,    '2026-04-20', 'CBP CAPE guidance, April 2026 — Phase 1 = unliquidated or ≤80 days post-liquidation',  'seed: prototype v0.2'),
  ('liquidation_lag_days',  314,   '2025-02-04', 'CBP default liquidation ≈314 days after entry (used only when no ACE date; row flagged estimated)', 'seed: prototype v0.2'),
  ('urgent_threshold_days', 30,    '2026-04-20', 'Desk operating policy v0.2 — entries with <30 days to deadline are urgent',            'seed: prototype v0.2'),
  ('fee_phase1',            0.10,  '2026-04-20', 'CM-PB-2026-002 §6 — 10% of Phase 1 refunds',                                          'seed: prototype v0.2'),
  ('fee_protest',           0.225, '2026-04-20', 'CM-PB-2026-002 §6 — 22.5% of protest/complex recoveries',                             'seed: prototype v0.2'),
  ('broker_share',          0.25,  '2026-04-20', 'Business plan v1 — partner broker share of fee',                                       'seed: prototype v0.2'),
  ('realization_haircut',   0.8,   '2026-04-20', 'Business plan v1 — realization haircut on expected fees',                              'seed: prototype v0.2');
