// Schema + rules table: migrations apply on an embedded Postgres (PGlite); rules load as of a date;
// rule_versions are pinned; computed/tasks/audit tables accept the engine's outputs.
process.env.TZ = "America/Vancouver";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDb, migrate } from "../src/db/index.js";
import { loadRules } from "../src/db/rules.js";

let db;
before(async () => { db = await openDb({ memory: true }); await migrate(db); });
after(async () => { await db.close(); });

test("migrations apply once and are idempotent", async () => {
  assert.deepEqual(await migrate(db), []);
  const { rows } = await db.query("SELECT name FROM schema_migrations ORDER BY name");
  assert.deepEqual(rows.map(r => r.name), ["001_init.sql", "002_documents.sql", "003_rules_2026_09_14.sql", "004_document_terms.sql", "006_entry_flags.sql"]);
  const tables = (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1")).rows.map(r => r.table_name);
  for (const t of ["clients", "entries", "rules", "rule_versions", "computed", "tasks", "documents", "bulletins", "prospects_b", "users", "audit_log", "broker_mappings"]) assert.ok(tables.includes(t), t);
});

test("rules load as of a date with sources, and pin a rule_version", async () => {
  const { rules, ruleVersionId, detail } = await loadRules(db, "2026-09-13");
  assert.deepEqual(rules, { prot: 180, p1: 80, lag: 314, urg: 30, fee1: 0.10, fee2: 0.225, brok: 0.25, real: 0.8 });
  assert.equal(typeof ruleVersionId, "number");
  assert.ok(detail.every(d => d.source && d.source.length > 10));
  const again = await loadRules(db, "2026-09-13");
  assert.equal(again.ruleVersionId, ruleVersionId, "same rule set → same version");
  assert.equal(again.all.fee_protest.placeholder, true, "[22.5]% is a placeholder until counsel approves");
  assert.equal(again.all.fee_phase1.placeholder, false);
  assert.equal(again.all.broker_fee_share_pct.text, "[ ]"); assert.equal(again.all.authorization_validity_months.value, 12);
  assert.equal(again.texts.phase3_label, undefined, "text rules approved 2026-09-14 are not in force on 2026-09-13");
  const later = await loadRules(db, "2026-09-14");
  assert.notEqual(later.ruleVersionId, ruleVersionId, "the six approved rows change the rule version from 2026-09-14");
  assert.deepEqual(later.rules, rules, "numeric rule set unchanged");
  for (const k of ["form_4811_payee", "no_filing_until_complete", "phase1_exclusions", "phase2_reconciliation", "phase3_label", "step3_document"]) assert.ok(k in later.texts, k);
  assert.ok(later.texts.phase3_label.startsWith("Phase 3 — finally liquidated (contested on appeal)"));
  assert.ok(later.detail.find(d => d.key === "phase3_label").source.includes("GingerControl"));
  await assert.rejects(() => db.query("INSERT INTO rules(key, value, value_text, effective_from, source) VALUES ('x', 1, 'y', '2026-01-01', 's')"), /check|constraint/i);
});

test("a rule change with an effective date yields a new rule_version and leaves history intact", async () => {
  await db.query("UPDATE rules SET effective_to = $1 WHERE key='phase1_window_days' AND effective_to IS NULL", ["2026-12-01"]);
  await db.query("INSERT INTO rules(key, value, effective_from, source, approved_by) VALUES ('phase1_window_days', 90, '2026-12-01', 'test bulletin', 'test')");
  const before = await loadRules(db, "2026-11-30"); const after_ = await loadRules(db, "2026-12-01");
  assert.equal(before.rules.p1, 80); assert.equal(after_.rules.p1, 90);
  assert.notEqual(before.ruleVersionId, after_.ruleVersionId);
});

test("rules before an effective date are refused rather than silently defaulted", async () => {
  await assert.rejects(() => loadRules(db, "2000-01-01"), /rules incomplete/);
});

test("entries are unique per (client, entry_no); computed rows reference a rule_version", async () => {
  const c = (await db.query("INSERT INTO clients(company) VALUES ('T Ltd') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO entries(client_id, entry_no, hts, liquidation_source) VALUES ($1,'X-1','9903.01.10','estimated')", [c]);
  await assert.rejects(() => db.query("INSERT INTO entries(client_id, entry_no) VALUES ($1,'X-1')", [c]));
  const { ruleVersionId } = await loadRules(db, "2026-09-13");
  const e = (await db.query("SELECT id FROM entries WHERE entry_no='X-1'")).rows[0].id;
  await db.query("INSERT INTO computed(entry_id, rule_version_id, ieepa_duty, phase, is_estimated, classification) VALUES ($1,$2,0,'—',true,'ieepa')", [e, ruleVersionId]);
  await assert.rejects(() => db.query("INSERT INTO entries(client_id, entry_no, liquidation_source) VALUES ($1,'X-2','guess')", [c]), /check/i);
});
